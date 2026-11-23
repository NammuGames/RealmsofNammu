/**
 * @fileoverview cells/Network_P2P_Manager_1.0.js - Core State, Seat Queries & Transport Bridge (Part 1/5)
 * @description Defines NetworkP2PManagerClass core state, persistent device peerId, strict
 * local/remote seat ownership & presence helpers, WSS transport binding, and heartbeat/pruning.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const DEVICE_PEER_KEY = 'nammu_p2p_v1_device_peer_id';

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

  function loadOrCreatePeerId() {
    try {
      const saved = global.localStorage?.getItem(DEVICE_PEER_KEY);
      if (saved && /^p_[a-z0-9]{6,20}$/.test(saved)) return saved;
      const fresh = makePeerId();
      global.localStorage?.setItem(DEVICE_PEER_KEY, fresh);
      return fresh;
    } catch {
      return makePeerId();
    }
  }

  function saveDevicePeerId(peerId) {
    if (!peerId || typeof peerId !== 'string') return false;
    try {
      global.localStorage?.setItem(DEVICE_PEER_KEY, peerId);
      return true;
    } catch {
      return false;
    }
  }

  class NetworkP2PManagerClass {
    constructor() {
      this.transport = null;
      this.myPeerId = loadOrCreatePeerId();
      this.role = 'offline'; // 'offline' | 'host' | 'guest'
      this.roomCode = '';
      this.hostPeerId = null;
      this.connections = new Map(); // peerId -> { peer, open: true, lastSeen }
      this.onlinePeerIds = new Set(); // live peerIds currently online in room
      this.peerMeta = new Map();    // peerId -> { name, seatIndex, localPlayerCount }
      this.seatOwners = [];         // seatIndex -> peerId | null (locked once matchStarted)
      this.roomSeats = [];          // [{ seatIndex, playerNum, name, ownerPeerId, isHost }]
      this.localPlayerCount = 1;
      this.hostLocalPlayerCount = 1;
      this.searchingCode = '';
      this.searchStatus = '';
      this.roomLocked = false;
      this.matchStarted = false;
      this.hostOnline = false;
      this.joinRejectedReason = '';
      this.pendingMatchStartSnap = null;
      this._awaitingEnterMatch = false;
      this.turnOnlySync = true;     // Turn-only state sync for public WSS relay reliability
      this.dom = {};

      this.lastLocalActivePlayerIndex = 0;
      this.pendingHostOfferToPeerId = null;
      this.pendingHostOfferForMe = false;

      this._searchRetryTimer = null;
      this._heartbeatTimer = null;
      this._joinSeq = 0;
      this._pendingJoinResolve = null;
      this._syncSeq = 0;
      this._pendingSync = null;
      this._lastRemoteSyncKey = '';
      this._puzzleHooked = false;
      this._applyingRemote = false;
      this._lastCursorEmitMs = 0;
      this._unloadBound = false;
    }

    getDevicePeerId() {
      if (!this.myPeerId) this.myPeerId = loadOrCreatePeerId();
      return this.myPeerId;
    }

    setDevicePeerId(peerId) {
      if (!peerId || typeof peerId !== 'string') return false;
      this.myPeerId = peerId;
      return saveDevicePeerId(peerId);
    }

    _isMatchActive() {
      return !!(this.matchStarted || global.GameState?.matchStarted);
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
      return this.role === 'host' || (this.role === 'guest' && this.hostOnline && this.connections.size > 0);
    }

    isHost() {
      return this.role === 'host';
    }

    isSeatLocal(seatIndex) {
      if (this.role === 'offline') return true;
      const owner = this.seatOwners[seatIndex];
      if (this._isMatchActive()) {
        return !!(owner && owner === this.myPeerId);
      }
      if (!owner) return this.role === 'host';
      return owner === this.myPeerId;
    }

    isSeatRemote(seatIndex) {
      if (this.role === 'offline') return false;
      return !this.isSeatLocal(seatIndex);
    }

    isSeatOnline(seatIndex) {
      if (this.role === 'offline') return true;
      const owner = this.seatOwners[seatIndex];
      if (!owner) return false;
      if (owner === this.myPeerId) return this.role !== 'offline';
      if (this.role === 'host') return this.connections.has(owner);
      return !!(this.hostOnline && (owner === this.hostPeerId || this.onlinePeerIds.has(owner)));
    }

    isHostOnline() {
      if (this.role === 'offline') return true;
      if (this.role === 'host') return !!this.transport?.connected;
      return !!(this.hostOnline && this.hostPeerId && this.connections.has(this.hostPeerId));
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

    /** Returns true when offline OR when the active Puzzle turn strictly belongs to this peer. */
    isLocalPlayersTurn() {
      if (this.role === 'offline') return true;
      const g = global.GameState;
      if (!g || !g.matchStarted) return this.role === 'host';
      return this.isSeatLocal(g.activePlayerIndex || 0);
    }

    // ── TRANSPORT PUBLISH & INCOMING DISPATCH ───────────────────────────────
    _publishRoom(msg, targetPeerId = '*') {
      if (!this.transport) return false;
      return this.transport.publish({ ...msg, from: this.myPeerId, to: targetPeerId || '*' });
    }

    _createTransport() {
      const TransportCtor = global.NetworkMQTTTransportClass;
      if (!TransportCtor) throw new Error('Network_MQTT_Transport_1.1.js not loaded.');
      return new TransportCtor({
        onMessage: (msg) => this._onTransportMessage(msg),
        onStatus: (statusText) => {
          if (this.role === 'offline') return;
          this.searchStatus = statusText || '';
          this._notifyLobbyUpdate?.();
        },
        onReconnect: () => {
          if (this.role === 'host') this._broadcastRoster?.();
          else if (this.role === 'guest') {
            this._sendHello();
            if (global.GameState?.matchStarted) this.requestLogCatchUp?.();
          }
          if (this._pendingSync?.msg) this._publishRoom(this._pendingSync.msg, '*');
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
        if (this.role === 'host' && !existing && (this.peerMeta.has(msg.from) || this.seatOwners.includes(msg.from))) {
          this.connections.set(msg.from, { peer: msg.from, open: true, lastSeen: Date.now() });
          this.onlinePeerIds.add(msg.from);
          this._broadcastRoster?.();
          this._notifyLobbyUpdate?.();
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
      this.onlinePeerIds.delete(peerId);
      const matchActive = this._isMatchActive();
      if (!matchActive) this.peerMeta.delete(peerId);
      if (!had && !(this.role === 'guest' && peerId === this.hostPeerId)) return;
      if (this.role === 'host') {
        if (!matchActive) this._rebuildSeatRoster?.();
        this._broadcastRoster?.();
      } else if (peerId === this.hostPeerId) {
        this.hostOnline = false;
        if (matchActive) {
          this._handleHostDroppedInMatch?.();
        } else {
          global.GameState?.showToast?.('🔌 Host disconnected from room');
        }
      }
      this._updateDrawerUI?.();
      this._notifyLobbyUpdate?.();
    }

    _startHeartbeat() {
      this._stopHeartbeat();
      this._heartbeatTimer = setInterval(() => {
        if (!this.transport?.connected || this.role === 'offline') return;
        this._publishRoom({ type: 'HEARTBEAT' });
        const now = Date.now();
        if (this.role === 'host') {
          const matchActive = this._isMatchActive();
          let pruned = false;
          this.connections.forEach((conn, pid) => {
            if (now - (conn.lastSeen || 0) > 45000) {
              this.connections.delete(pid);
              this.onlinePeerIds.delete(pid);
              if (!matchActive) this.peerMeta.delete(pid);
              pruned = true;
            }
          });
          if (pruned) {
            if (!matchActive) this._rebuildSeatRoster?.();
            this._broadcastRoster?.();
            this._updateDrawerUI?.();
            this._notifyLobbyUpdate?.();
          }
        } else if (this.role === 'guest' && this.hostOnline && this.hostPeerId) {
          const hostConn = this.connections.get(this.hostPeerId);
          if (hostConn && now - (hostConn.lastSeen || 0) > 45000) {
            this._handlePeerRemoved(this.hostPeerId);
          }
        }
      }, 15000);
    }

    _stopHeartbeat() {
      if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null; }
    }

    async _cleanupTransportOnly() {
      this._stopHeartbeat();
      if (this._pendingSync) { clearInterval(this._pendingSync.timer); this._pendingSync = null; }
      if (this._logCatchUpTimer) { clearTimeout(this._logCatchUpTimer); this._logCatchUpTimer = null; }
      this._lastRemoteSyncKey = '';
      this.connections.clear();
      this.onlinePeerIds.clear();
      this.hostOnline = false;
      if (this.transport) {
        try { this.transport.disconnect(); } catch {}
        this.transport = null;
      }
    }
  }

  NetworkP2PManagerClass._helpers = { makeRoomCode, makePeerId, loadOrCreatePeerId, saveDevicePeerId };
  global.NetworkP2PManagerClass = NetworkP2PManagerClass;
})(typeof window !== 'undefined' ? window : this);
