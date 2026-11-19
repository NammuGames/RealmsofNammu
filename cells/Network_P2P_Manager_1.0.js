/**
 * @fileoverview cells/Network_P2P_Manager_1.0.js - PeerJS WebRTC Transport, Room Codes & Pass Host (Part 1/2)
 * @description Implements $0 serverless PeerJS connection lifecycle, lazy CDN loading, 4-char
 * Room Codes, Guest/Host seat tracking, saved multi-day host resume, and live HOST_HANDOFF.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const PEERJS_CDN = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const PREFIX = 'nammu-';
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:openrelay.metered.ca:80' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ];
  const PEER_OPTS = { debug: 1, pingInterval: 5000, config: { iceServers: ICE_SERVERS, iceCandidatePoolSize: 6 } };

  function makeRoomCode(len = 4) {
    let out = '';
    for (let i = 0; i < len; i++) {
      out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return out;
  }

  class NetworkP2PManagerClass {
    constructor() {
      this.peer = null;
      this.myPeerId = null;
      this.role = 'offline'; // 'offline' | 'host' | 'guest'
      this.roomCode = '';
      this.hostPeerId = null;
      this.connections = new Map(); // peerId -> DataConnection
      this.peerMeta = new Map();    // peerId -> { name, seatIndex }
      this.seatOwners = [];         // seatIndex -> peerId | null
      this.roomSeats = [];          // [{ seatIndex, playerNum, name, ownerPeerId, isHost }]
      this.localPlayerCount = 1;
      this.hostLocalPlayerCount = 1;
      this.searchingCode = '';
      this.searchStatus = '';
      this.dom = {};

      this.lastLocalActivePlayerIndex = 0;
      this.pendingHostOfferToPeerId = null;
      this.pendingHostOfferForMe = false;

      this._peerScriptPromise = null;
      this._searchRetryTimer = null;
      this._hostWatchdog = null;
      this._joinSeq = 0;
      this._puzzleHooked = false;
      this._applyingRemote = false;
      this._lastCursorEmitMs = 0;
      this._unloadBound = false;
    }

    init(dom = {}) {
      this.dom = dom;
      if (!this._unloadBound && typeof window !== 'undefined') {
        this._unloadBound = true;
        const cleanup = () => { try { this.peer?.destroy?.(); } catch {} };
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

    // ── LAZY PEERJS SCRIPT LOADER ───────────────────────────────────────────
    _ensurePeerJS() {
      if (typeof global.Peer === 'function') return Promise.resolve(global.Peer);
      if (this._peerScriptPromise) return this._peerScriptPromise;
      this._peerScriptPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = PEERJS_CDN;
        s.async = false;
        s.onload = () => (typeof global.Peer === 'function' ? resolve(global.Peer) : reject(new Error('PeerJS failed to initialize')));
        s.onerror = () => {
          this._peerScriptPromise = null;
          const err = new Error('Could not load PeerJS library from CDN.');
          err._toasted = true;
          global.GameState?.showToast?.('⚠️ P2P library unavailable (check internet/ad-blocker).');
          reject(err);
        };
        document.body.appendChild(s);
      });
      return this._peerScriptPromise;
    }

    // ── HOST / JOIN / LEAVE LIFECYCLE ───────────────────────────────────────
    stopSearch() {
      this._joinSeq++;
      if (this._searchRetryTimer) { clearTimeout(this._searchRetryTimer); this._searchRetryTimer = null; }
      this.searchingCode = '';
      this.searchStatus = '';
    }

    _startHostWatchdog(peer) {
      if (this._hostWatchdog) { clearInterval(this._hostWatchdog); this._hostWatchdog = null; }
      this._hostWatchdog = setInterval(() => {
        if (this.peer !== peer || this.role !== 'host' || !peer || peer.destroyed) {
          clearInterval(this._hostWatchdog);
          this._hostWatchdog = null;
          return;
        }
        if (peer.disconnected) {
          this.searchStatus = 'Signaling Dropped — Reconnecting...';
          this._notifyLobbyUpdate?.();
          try { peer.reconnect(); } catch {}
        }
      }, 3500);
    }

    async hostRoom(customCode = null, opts = {}) {
      this.stopSearch();
      await this._cleanupPeerOnly();
      const PeerCtor = await this._ensurePeerJS();
      const code = (customCode || makeRoomCode(4)).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const requestedId = `${PREFIX}${code}`;
      const localCount = Math.max(1, Math.min(6, opts.localPlayerCount || global.GameSettingsCanvas?.config?.playerCount || this.localPlayerCount || 1));
      this.localPlayerCount = localCount;
      this.hostLocalPlayerCount = localCount;
      this.searchStatus = 'Opening Room...';
      this._notifyLobbyUpdate?.();

      return new Promise((resolve, reject) => {
        let settled = false;
        const peer = new PeerCtor(requestedId, PEER_OPTS);
        this.peer = peer;

        peer.on('open', (id) => {
          if (this.peer !== peer) return;
          this.role = 'host';
          this.roomCode = code;
          this.hostPeerId = id;
          this.myPeerId = id;
          this.searchStatus = '';
          this.matchName = opts.matchName || this.matchName || `Match ${code}`;
          if (!settled) {
            settled = true;
            const prof = global.MemoryCardManager?.getProfile?.() || { name: 'Host' };
            this.peerMeta.set(id, { name: prof.name || 'Host', seatIndex: 0, localPlayerCount: localCount });
            this._rebuildSeatRoster?.();
            this._bindHostIncoming(peer);
            this._startHostWatchdog(peer);
            global.GameState?.showToast?.(`🌐 Hosting Room: ${code}`);
            resolve({ ok: true, roomCode: code, peerId: id });
          }
          this._updateDrawerUI?.();
          this._notifyLobbyUpdate?.();
        });

        peer.on('disconnected', () => {
          if (this.peer !== peer || this.role !== 'host' || peer.destroyed) return;
          this.searchStatus = 'Signaling Dropped — Reconnecting...';
          this._notifyLobbyUpdate?.();
          setTimeout(() => {
            if (this.peer === peer && peer.disconnected && !peer.destroyed) {
              try { peer.reconnect(); } catch {}
            }
          }, 900);
        });

        peer.on('error', (err) => {
          if (!settled && err?.type === 'unavailable-id' && !opts._regenerated && !customCode) {
            settled = true;
            this.hostRoom(makeRoomCode(4), { ...opts, _regenerated: true }).then(resolve, reject);
            return;
          }
          if (!settled) {
            settled = true;
            this.role = 'offline';
            this.searchStatus = `Host Error: ${err?.type || err?.message || 'Failed'}`;
            this._notifyLobbyUpdate?.();
            global.GameState?.showToast?.(`⚠️ P2P Host Error: ${err?.type || err?.message}`);
            this._updateDrawerUI?.();
            reject(err);
            return;
          }
          if (this.peer === peer && this.role === 'host' && !peer.destroyed) {
            this.searchStatus = `Signaling Error (${err?.type || 'Retry'}) — Reconnecting...`;
            this._notifyLobbyUpdate?.();
            if (peer.disconnected) { try { peer.reconnect(); } catch {} }
          }
        });
      });
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

    async joinRoom(roomCode, opts = {}) {
      const code = (roomCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      if (code.length < 4) {
        global.GameState?.showToast?.('⚠️ Enter a valid 4-character Room Code.');
        return false;
      }
      this.stopSearch();
      const seq = this._joinSeq;
      const isStale = () => this._joinSeq !== seq || (keepSearching && this.searchingCode !== code);
      const keepSearching = !!opts.keepSearching;
      this.localPlayerCount = Math.max(1, Math.min(6, opts.localPlayerCount || global.GameSettingsCanvas?.config?.playerCount || this.localPlayerCount || 1));
      this.searchingCode = code;
      this.searchStatus = 'Connecting to Signaling...';
      this._notifyLobbyUpdate?.();

      await this._cleanupPeerOnly();
      const PeerCtor = await this._ensurePeerJS();
      if (isStale()) return false;
      const targetHostId = `${PREFIX}${code}`;

      return new Promise((resolve, reject) => {
        let settled = false;
        let attemptSeq = 0;
        let activeConn = null;
        let activeTimer = null;
        const fatalTypes = new Set(['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible', 'ssl-unavailable']);

        const failAttempt = (aId, err, toastMsg = null) => {
          if (settled || aId !== attemptSeq) return;
          clearTimeout(activeTimer);
          try { activeConn?.close?.(); } catch {}
          activeConn = null;
          if (isStale()) { settled = true; return; }

          const needNewPeer = fatalTypes.has(err?.type) || !this.peer || this.peer.destroyed;
          if (needNewPeer) { this._cleanupPeerOnly(); this.role = 'offline'; }

          if (keepSearching && this.searchingCode === code) {
            this.searchStatus = err?.type === 'peer-unavailable' ? 'Room Not Open Yet — Retrying...'
              : (err?.message === 'ice-failed' ? 'NAT Blocked Direct P2P — Retrying...' : 'Retrying Connection...');
            this._updateDrawerUI?.();
            this._notifyLobbyUpdate?.();
            this._searchRetryTimer = setTimeout(() => {
              if (isStale() || settled || this.isConnected()) return;
              if (this.peer && !this.peer.destroyed && this.role === 'guest') {
                if (this.peer.disconnected) {
                  this.searchStatus = 'Reconnecting Signaling...';
                  this._notifyLobbyUpdate?.();
                  try { this.peer.reconnect(); } catch { openPeer(); }
                } else {
                  tryConnect();
                }
              } else {
                openPeer();
              }
            }, 2500);
            return;
          }

          settled = true;
          this._cleanupPeerOnly();
          this.role = 'offline';
          this.searchingCode = '';
          this.searchStatus = '';
          const msg = toastMsg || `⚠️ P2P Join Error: ${err?.type || err?.message || 'Unavailable'}`;
          if (err && typeof err === 'object') err._toasted = true;
          global.GameState?.showToast?.(msg);
          this._updateDrawerUI?.();
          this._notifyLobbyUpdate?.();
          reject(err || new Error('Join failed'));
        };

        const tryConnect = () => {
          if (settled || isStale() || !this.peer || this.peer.destroyed) return;
          if (this._searchRetryTimer) { clearTimeout(this._searchRetryTimer); this._searchRetryTimer = null; }
          const aId = ++attemptSeq;
          this.role = 'guest';
          this.roomCode = code;
          this.hostPeerId = targetHostId;
          this.searchStatus = 'Handshaking (NAT)...';
          this._notifyLobbyUpdate?.();

          activeTimer = setTimeout(() => {
            failAttempt(aId, new Error('timeout'), `⚠️ Could not reach Room ${code} (timed out).`);
          }, keepSearching ? 18000 : 16000);

          const conn = this.peer.connect(targetHostId, { reliable: true });
          activeConn = conn;
          const onIce = (st) => {
            if (settled || aId !== attemptSeq || isStale()) return;
            if (st === 'checking') { this.searchStatus = 'Checking NAT / Firewall...'; this._notifyLobbyUpdate?.(); }
            else if (st === 'connected' || st === 'completed') { this.searchStatus = 'Opening Data Channel...'; this._notifyLobbyUpdate?.(); }
            else if (st === 'failed') { failAttempt(aId, new Error('ice-failed'), '⚠️ ICE Failed — firewall/NAT blocked direct P2P.'); }
          };
          conn.on?.('iceStateChanged', onIce);
          const bindPc = () => {
            const pc = conn?.peerConnection;
            if (pc && !pc._nammuBound) {
              pc._nammuBound = true;
              pc.addEventListener('iceconnectionstatechange', () => onIce(pc.iceConnectionState));
            }
          };
          bindPc();
          setTimeout(bindPc, 60);

          this._wireConnection(conn, () => {
            if (settled || aId !== attemptSeq || isStale()) return;
            settled = true;
            clearTimeout(activeTimer);
            this.searchingCode = '';
            this.searchStatus = '';
            const prof = global.MemoryCardManager?.getProfile?.() || { name: 'Guest' };
            conn.send({ type: 'HELLO', peerId: this.myPeerId, name: prof.name || 'Guest', localPlayerCount: this.localPlayerCount });
            this._updateDrawerUI?.();
            this._notifyLobbyUpdate?.();
            global.GameState?.showToast?.(`🌐 Joined Room: ${code}`);
            resolve({ ok: true, roomCode: code, peerId: this.myPeerId });
          }, (err) => failAttempt(aId, err));
        };

        const openPeer = () => {
          if (settled || isStale()) return;
          this.searchStatus = 'Connecting to Signaling...';
          this._notifyLobbyUpdate?.();
          const peer = new PeerCtor(PEER_OPTS);
          this.peer = peer;
          this.role = 'guest';
          this.roomCode = code;
          this.hostPeerId = targetHostId;

          peer.on('open', (id) => {
            if (this.peer !== peer || settled || isStale()) return;
            this.myPeerId = id;
            this._bindGuestIncoming(peer);
            if (!activeConn) tryConnect();
          });
          peer.on('disconnected', () => {
            if (this.peer !== peer || settled || isStale() || peer.destroyed) return;
            this.searchStatus = 'Signaling Dropped — Reconnecting...';
            this._notifyLobbyUpdate?.();
            setTimeout(() => { if (this.peer === peer && peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch {} } }, 900);
          });
          peer.on('error', (err) => {
            if (this.peer !== peer) return;
            const curAttempt = attemptSeq || (++attemptSeq);
            failAttempt(curAttempt, err);
          });
        };

        openPeer();
      });
    }

    async leaveRoom() {
      this.stopSearch();
      await this._cleanupPeerOnly();
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
      global.GameState?.showToast?.('🔌 Disconnected from P2P Room');
    }

    async closeRoomAndSave() {
      if (global.GameState?.matchStarted) {
        global.MemoryCardManager?.saveActivePuzzleMatch?.();
      }
      if (this.role === 'host' && this.connections.size > 0) {
        this._broadcast({ type: 'ROOM_CLOSING' });
      }
      await this.leaveRoom();
    }

    async _cleanupPeerOnly() {
      if (this._hostWatchdog) { clearInterval(this._hostWatchdog); this._hostWatchdog = null; }
      this.connections.forEach((c) => { try { c.close(); } catch {} });
      this.connections.clear();
      if (this.peer) {
        try { this.peer.destroy(); } catch {}
        this.peer = null;
      }
    }

    // ── CONNECTION MANAGEMENT & LIVE PASS HOST ──────────────────────────────
    _bindHostIncoming(peer) {
      peer.on('connection', (conn) => this._wireConnection(conn));
    }

    _bindGuestIncoming(peer) {
      // Allows any Guest to accept direct reconnections immediately if elected via Pass Host
      peer.on('connection', (conn) => this._wireConnection(conn));
    }

    _wireConnection(conn, onOpenCb = null, onErrCb = null) {
      conn.on('open', () => {
        this.connections.set(conn.peer, conn);
        if (this.role === 'host') {
          this._sendRosterTo(conn);
          if (global.GameState?.matchStarted) {
            const snap = global.MemoryCardManager?.capturePuzzleState?.();
            if (snap) conn.send({ type: 'STATE_SYNC', reason: 'JOIN', snap });
          }
        }
        if (typeof onOpenCb === 'function') onOpenCb(conn);
        this._updateDrawerUI?.();
      });

      conn.on('data', (msg) => this._handleMessage?.(conn.peer, msg));
      if (typeof onErrCb === 'function') conn.on('error', (err) => onErrCb(err));

      conn.on('close', () => {
        this.connections.delete(conn.peer);
        this.peerMeta.delete(conn.peer);
        if (this.role === 'host') {
          this._rebuildSeatRoster?.();
          this._broadcastRoster();
        } else {
          this.seatOwners = this.seatOwners.map(id => (id === conn.peer ? null : id));
        }
        this._updateDrawerUI?.();
        this._notifyLobbyUpdate?.();
      });
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

    _sendRosterTo(conn) {
      conn.send(this._buildRosterPayload());
    }

    _broadcastRoster() {
      this._broadcast(this._buildRosterPayload());
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
      this._broadcast({ type: 'HOST_OFFER', targetPeerId, targetPlayerId: playerId, fromHostPeerId: this.myPeerId });
      global.GameState?.showToast?.(`👑 Offered Host to Player ${playerId}`);
      this._updateDrawerUI?.();
      return true;
    }

    /** Step 2 of Pass Host: Guest clicks Receive Host to accept and trigger handoff. */
    acceptHostOffer() {
      if (this.role !== 'guest' || !this.pendingHostOfferForMe) return false;
      this.pendingHostOfferForMe = false;
      this._emit?.('HOST_ACCEPT', { peerId: this.myPeerId });
      global.GameState?.showToast?.('🔄 Accepting Host role...');
      this._updateDrawerUI?.();
      return true;
    }
  }

  global.NetworkP2PManagerClass = NetworkP2PManagerClass;
})(typeof window !== 'undefined' ? window : this);
