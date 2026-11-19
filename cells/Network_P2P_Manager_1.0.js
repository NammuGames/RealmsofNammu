/**
 * @fileoverview cells/Network_P2P_Manager_1.0.js - Encrypted WSS Room Relay, Room Codes & Lobby Lifecycle (Part 1/2)
 * @description Implements $0 serverless encrypted MQTT-over-WSS room transport (via NetworkMQTTTransportClass),
 * 4-char Room Codes, Host/Guest seat tracking, saved multi-day host resume, and live HOST_HANDOFF.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function makeRoomCode(len = 4) {
    let out = '';
    for (let i = 0; i < len; i++) {
      out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return out;
  }

  function makePeerId() {
    return `p_${makeRoomCode(10).toLowerCase()}`;
  }

  class NetworkP2PManagerClass {
    constructor() {
      this.transport = null;
      this.myPeerId = makePeerId();
      this.role = 'offline'; // 'offline' | 'host' | 'guest'
      this.roomCode = '';
      this.hostPeerId = null;
      this.connections = new Map(); // peerId -> { peer, open: true, lastSeen }
      this.peerMeta = new Map();    // peerId -> { name, seatIndex, localPlayerCount }
      this.seatOwners = [];         // seatIndex -> peerId | null
      this.roomSeats = [];          // [{ seatIndex, playerNum, name, ownerPeerId, isHost }]
      this.localPlayerCount = 1;
      this.hostLocalPlayerCount = 1;
      this.searchingCode = '';
      this.searchStatus = '';
      this.turnOnlySync = true;     // Turn-only state sync for public WSS relay reliability
      this.dom = {};

      this.lastLocalActivePlayerIndex = 0;
      this.pendingHostOfferToPeerId = null;
      this.pendingHostOfferForMe = false;

      this._searchRetryTimer = null;
      this._heartbeatTimer = null;
      this._joinSeq = 0;
      this._pendingJoinResolve = null;
      this._puzzleHooked = false;
      this._applyingRemote = false;
      this._lastCursorEmitMs = 0;
      this._unloadBound = false;
    }

    init(dom = {}) {
      this.dom = dom;
      if (!this._unloadBound && typeof window !== 'undefined') {
        this._unloadBound = true;
        const cleanup = () => {
          try {
            if (this.transport?.connected && this.role !== 'offline') {
              this.transport.publish({ type: 'GOODBYE', from: this.myPeerId, to: '*' });
            }
            this.transport?.disconnect?.();
          } catch {}
        };
        window.addEventListener('pagehide', cleanup);
        window.addEventListener('beforeunload', cleanup);
      }
      this._wireDrawerUI?.();
      this._updateDrawerUI?.();
      return true;
    }

    isConnected() {
      return this.role === 'host' || (this.role === 'guest' && this.connections.size > 0);
    }

    isHost() {
      return this.role === 'host';
    }

    isSeatLocal(seatIndex) {
      if (this.role === 'offline') return true;
      const owner = this.seatOwners[seatIndex];
      if (!owner) return this.role === 'host';
      return owner === this.myPeerId;
    }

    isSeatOnlineRemote(seatIndex) {
      if (this.role !== 'host') return false;
      const owner = this.seatOwners[seatIndex];
      return !!(owner && owner !== this.myPeerId && this.connections.has(owner));
    }

    getDefaultPausedPlayerIndex() {
      const g = global.GameState;
      const cur = g?.activePlayerIndex || 0;
      if (this.isSeatLocal(cur)) return cur;
      if (this.isSeatLocal(this.lastLocalActivePlayerIndex)) return this.lastLocalActivePlayerIndex;
      const count = g?.playerCount || g?.players?.length || 1;
      for (let i = 0; i < count; i++) {
        if (this.isSeatLocal(i)) return i;
      }
      return cur;
    }

    /** Returns true when offline OR when the active Puzzle turn belongs to this peer. */
    isLocalPlayersTurn() {
      if (this.role === 'offline') return true;
      const g = global.GameState;
      if (!g || !g.matchStarted) return this.role === 'host';
      return this.isSeatLocal(g.activePlayerIndex || 0);
    }

    // ── TRANSPORT PUBLISH & INCOMING DISPATCH ───────────────────────────────
    _publishRoom(msg, targetPeerId = '*') {
      if (!this.transport?.connected) return false;
      return this.transport.publish({ ...msg, from: this.myPeerId, to: targetPeerId || '*' });
    }

    _createTransport() {
      const TransportCtor = global.NetworkMQTTTransportClass;
      if (!TransportCtor) throw new Error('Network_MQTT_Transport.js not loaded.');
      return new TransportCtor({
        onMessage: (msg) => this._onTransportMessage(msg),
        onStatus: (statusText) => {
          if (this.role === 'offline') return;
          this.searchStatus = statusText || '';
          this._notifyLobbyUpdate?.();
        },
        onReconnect: () => {
          if (this.role === 'host') {
            this._broadcastRoster();
          } else if (this.role === 'guest') {
            this._sendHello();
          }
          this._notifyLobbyUpdate?.();
        }
      });
    }

    _sendHello() {
      const prof = global.MemoryCardManager?.getProfile?.() || { name: 'Guest' };
      this._publishRoom({
        type: 'HELLO',
        peerId: this.myPeerId,
        name: prof.name || 'Guest',
        localPlayerCount: this.localPlayerCount
      });
    }

    _onTransportMessage(msg) {
      if (!msg || !msg.type || !msg.from) return;
      if (msg.from === this.myPeerId) return;
      if (msg.to && msg.to !== '*' && msg.to !== this.myPeerId) return;

      const existing = this.connections.get(msg.from);
      if (existing) existing.lastSeen = Date.now();

      if (msg.type === 'HEARTBEAT') {
        if (this.role === 'host' && !existing && this.peerMeta.has(msg.from)) {
          this.connections.set(msg.from, { peer: msg.from, open: true, lastSeen: Date.now() });
        }
        return;
      }

      if (msg.type === 'GOODBYE') {
        this._handlePeerRemoved(msg.from);
        return;
      }

      this._handleMessage?.(msg.from, msg);
    }

    _handlePeerRemoved(peerId) {
      const had = this.connections.delete(peerId);
      this.peerMeta.delete(peerId);
      if (!had) return;
      if (this.role === 'host') {
        this._rebuildSeatRoster?.();
        this._broadcastRoster();
      } else if (peerId === this.hostPeerId) {
        this.seatOwners = this.seatOwners.map(id => (id === peerId ? null : id));
        global.GameState?.showToast?.('🔌 Host disconnected from room');
      }
      this._updateDrawerUI?.();
      this._notifyLobbyUpdate?.();
    }

    _startHeartbeat() {
      this._stopHeartbeat();
      this._heartbeatTimer = setInterval(() => {
        if (!this.transport?.connected || this.role === 'offline') return;
        this._publishRoom({ type: 'HEARTBEAT' });
        if (this.role === 'host') {
          const now = Date.now();
          let pruned = false;
          this.connections.forEach((conn, pid) => {
            if (now - (conn.lastSeen || 0) > 45000) {
              this.connections.delete(pid);
              this.peerMeta.delete(pid);
              pruned = true;
            }
          });
          if (pruned) {
            this._rebuildSeatRoster?.();
            this._broadcastRoster();
            this._updateDrawerUI?.();
            this._notifyLobbyUpdate?.();
          }
        }
      }, 15000);
    }

    _stopHeartbeat() {
      if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null; }
    }

    // ── HOST / JOIN / LEAVE LIFECYCLE ───────────────────────────────────────
    stopSearch() {
      this._joinSeq++;
      if (this._searchRetryTimer) { clearTimeout(this._searchRetryTimer); this._searchRetryTimer = null; }
      this._pendingJoinResolve = null;
      this.searchingCode = '';
      this.searchStatus = '';
    }

    async hostRoom(customCode = null, opts = {}) {
      this.stopSearch();
      await this._cleanupTransportOnly();
      const code = (customCode || makeRoomCode(4)).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const localCount = Math.max(1, Math.min(6, opts.localPlayerCount || global.GameSettingsCanvas?.config?.playerCount || this.localPlayerCount || 1));
      this.localPlayerCount = localCount;
      this.hostLocalPlayerCount = localCount;
      this.myPeerId = this.myPeerId || makePeerId();
      this.searchStatus = 'Opening Room...';
      this._notifyLobbyUpdate?.();

      try {
        this.transport = this._createTransport();
        await this.transport.connect(code, { brokerIndex: 0, allowFailover: true });
        this.role = 'host';
        this.roomCode = code;
        this.hostPeerId = this.myPeerId;
        this.searchStatus = '';
        this.matchName = opts.matchName || this.matchName || `Match ${code}`;
        const prof = global.MemoryCardManager?.getProfile?.() || { name: 'Host' };
        this.peerMeta.clear();
        this.peerMeta.set(this.myPeerId, { name: prof.name || 'Host', seatIndex: 0, localPlayerCount: localCount });
        this._rebuildSeatRoster?.();
        this._startHeartbeat();
        this._broadcastRoster();
        this._updateDrawerUI?.();
        this._notifyLobbyUpdate?.();
        global.GameState?.showToast?.(`🌐 Hosting Room: ${code}`);
        return { ok: true, roomCode: code, peerId: this.myPeerId };
      } catch (err) {
        this.role = 'offline';
        this.searchStatus = `Host Error: ${err?.message || 'Relay Unavailable'}`;
        this._notifyLobbyUpdate?.();
        global.GameState?.showToast?.(`⚠️ Relay Host Error: ${err?.message || 'Unavailable'}`);
        this._updateDrawerUI?.();
        throw err;
      }
    }

    async hostSavedMatch(saveId = null) {
      const mc = global.MemoryCardManager;
      const saves = mc?.listSaves?.() || [];
      const target = saveId ? saves.find(s => s.id === saveId) : saves[0];
      if (!target) {
        global.GameState?.showToast?.('⚠️ No saved match in localStorage to resume.');
        return false;
      }
      if (global.HubGameLoader?.activeGameId !== 'puzzle') {
        await global.HubGameLoader?.launchGame?.('puzzle');
      }
      await this.hostRoom(target.roomCode || null, { matchName: target.matchName });
      mc.restorePuzzleState(target);
      this._assignDefaultSeats(target.playerCount || global.GameState?.playerCount || 1);
      global.GameState?.showToast?.(`🌐 Hosting "${target.matchName || this.roomCode}" (Code ${this.roomCode})`);
      return true;
    }

    _onGuestConnectedToHost(hostPeerId) {
      if (this.role !== 'guest' || !hostPeerId) return;
      const firstJoin = !this.connections.has(hostPeerId);
      this.hostPeerId = hostPeerId;
      this.connections.set(hostPeerId, { peer: hostPeerId, open: true, lastSeen: Date.now() });
      if (firstJoin) {
        if (this._searchRetryTimer) { clearTimeout(this._searchRetryTimer); this._searchRetryTimer = null; }
        this.searchingCode = '';
        this.searchStatus = '';
        this._startHeartbeat();
        global.GameState?.showToast?.(`🌐 Joined Room: ${this.roomCode}`);
        const done = this._pendingJoinResolve;
        this._pendingJoinResolve = null;
        if (typeof done === 'function') done({ ok: true, roomCode: this.roomCode, peerId: this.myPeerId });
      }
    }

    async joinRoom(roomCode, opts = {}) {
      const code = (roomCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      if (code.length < 4) {
        global.GameState?.showToast?.('⚠️ Enter a valid 4-character Room Code.');
        return false;
      }
      this.stopSearch();
      const seq = this._joinSeq;
      const keepSearching = !!opts.keepSearching;
      const isStale = () => this._joinSeq !== seq || (keepSearching && this.searchingCode !== code);
      this.localPlayerCount = Math.max(1, Math.min(6, opts.localPlayerCount || global.GameSettingsCanvas?.config?.playerCount || this.localPlayerCount || 1));
      this.myPeerId = this.myPeerId || makePeerId();
      this.searchingCode = code;
      this.searchStatus = 'Connecting to Relay...';
      this._notifyLobbyUpdate?.();

      await this._cleanupTransportOnly();
      if (isStale()) return false;

      return new Promise(async (resolve, reject) => {
        this._pendingJoinResolve = resolve;
        let brokerIdx = 0;
        let helloTries = 0;

        const connectAndProbe = async () => {
          if (isStale() || this.isConnected()) return;
          try {
            this.transport = this._createTransport();
            const info = await this.transport.connect(code, { brokerIndex: brokerIdx, allowFailover: true });
            if (isStale()) { this._cleanupTransportOnly(); return; }
            brokerIdx = info?.brokerIndex ?? brokerIdx;
            this.role = 'guest';
            this.roomCode = code;
            this.searchStatus = 'Waiting for Host...';
            this._notifyLobbyUpdate?.();
            helloTries = 0;
            this._sendHello();
            scheduleProbe();
          } catch (err) {
            if (isStale()) return;
            if (keepSearching) {
              this.searchStatus = 'Relay Busy — Retrying...';
              this._notifyLobbyUpdate?.();
              this._searchRetryTimer = setTimeout(() => { brokerIdx = (brokerIdx + 1) % 2; connectAndProbe(); }, 2800);
            } else {
              this.stopSearch();
              this.role = 'offline';
              global.GameState?.showToast?.(`⚠️ Could not reach Relay (${err?.message || 'Error'})`);
              this._updateDrawerUI?.();
              reject(err);
            }
          }
        };

        const scheduleProbe = () => {
          if (this._searchRetryTimer) clearTimeout(this._searchRetryTimer);
          this._searchRetryTimer = setTimeout(async () => {
            if (isStale() || this.isConnected()) return;
            helloTries++;
            if (!keepSearching && helloTries >= 5) {
              this.stopSearch();
              await this._cleanupTransportOnly();
              this.role = 'offline';
              global.GameState?.showToast?.(`⚠️ Could not find Room ${code} (timed out).`);
              this._updateDrawerUI?.();
              this._notifyLobbyUpdate?.();
              reject(new Error('timeout'));
              return;
            }
            // Rotate backup broker if Host opened on alternate public broker
            if (keepSearching && helloTries >= 4 && !this.transport?.customRelayUrl) {
              brokerIdx = (brokerIdx + 1) % (this.transport?.brokers?.length || 2);
              this.searchStatus = 'Checking Backup Relay...';
              this._notifyLobbyUpdate?.();
              await this._cleanupTransportOnly();
              connectAndProbe();
              return;
            }
            this.searchStatus = 'Waiting for Host...';
            this._notifyLobbyUpdate?.();
            this._sendHello();
            scheduleProbe();
          }, 2500);
        };

        connectAndProbe();
      });
    }

    async leaveRoom() {
      this.stopSearch();
      if (this.transport?.connected && this.role !== 'offline') {
        await this._publishRoom({ type: 'GOODBYE' });
      }
      await this._cleanupTransportOnly();
      this.role = 'offline';
      this.roomCode = '';
      this.hostPeerId = null;
      this.seatOwners = [];
      this.roomSeats = [];
      this.peerMeta.clear();
      this.pendingHostOfferToPeerId = null;
      this.pendingHostOfferForMe = false;
      this._updateDrawerUI?.();
      this._notifyLobbyUpdate?.();
      global.GameState?.showToast?.('🔌 Disconnected from Online Room');
    }

    async closeRoomAndSave() {
      if (global.GameState?.matchStarted) {
        global.MemoryCardManager?.saveActivePuzzleMatch?.();
      }
      if (this.role === 'host' && this.transport?.connected) {
        await this._publishRoom({ type: 'ROOM_CLOSING' });
      }
      await this.leaveRoom();
    }

    async _cleanupTransportOnly() {
      this._stopHeartbeat();
      this.connections.clear();
      if (this.transport) {
        try { this.transport.disconnect(); } catch {}
        this.transport = null;
      }
    }

    _buildRosterPayload() {
      const gsc = global.GameSettingsCanvas;
      const wp = gsc?.getActiveWorkingPreset?.();
      const seats = this.getRoomSeats?.() || [];
      const playerCount = global.GameState?.matchStarted
        ? (global.GameState.playerCount || 1)
        : Math.max(1, seats.length);
      return {
        type: 'ROOM_ROSTER',
        roomCode: this.roomCode,
        matchName: this.matchName || global.GameState?.matchName || '',
        presetName: wp?.name || global.GameState?.matchConfig?.presetName || 'Meditate',
        playerCount,
        matchConfig: wp?.match ? { ...wp.match, presetName: wp.name } : null,
        hostPeerId: this.hostPeerId,
        seatOwners: this.seatOwners,
        seats,
        peers: Array.from(this.peerMeta.entries())
      };
    }

    _sendRosterTo(targetPeerId) {
      this._publishRoom(this._buildRosterPayload(), targetPeerId || '*');
    }

    _broadcastRoster() {
      this._publishRoom(this._buildRosterPayload(), '*');
    }

    /** Step 1 of Pass Host: Sends HOST_OFFER to un-ghost Receive Host on target Guest. */
    offerHostToPlayer(playerId) {
      if (this.role !== 'host') return false;
      const targetPeerId = this.seatOwners[(playerId || 1) - 1];
      if (!targetPeerId || targetPeerId === this.myPeerId || !this.connections.has(targetPeerId)) {
        global.GameState?.showToast?.('⚠️ That player is not currently connected online.');
        return false;
      }
      this.pendingHostOfferToPeerId = targetPeerId;
      this._publishRoom({ type: 'HOST_OFFER', targetPeerId, targetPlayerId: playerId, fromHostPeerId: this.myPeerId }, targetPeerId);
      global.GameState?.showToast?.(`👑 Offered Host to Player ${playerId}`);
      this._updateDrawerUI?.();
      return true;
    }

    /** Step 2 of Pass Host: Guest clicks Receive Host to accept and trigger handoff. */
    acceptHostOffer() {
      if (this.role !== 'guest' || !this.pendingHostOfferForMe) return false;
      this.pendingHostOfferForMe = false;
      this._publishRoom({ type: 'HOST_ACCEPT', peerId: this.myPeerId }, this.hostPeerId || '*');
      global.GameState?.showToast?.('🔄 Accepting Host role...');
      this._updateDrawerUI?.();
      return true;
    }
  }

  global.NetworkP2PManagerClass = NetworkP2PManagerClass;
})(typeof window !== 'undefined' ? window : this);
