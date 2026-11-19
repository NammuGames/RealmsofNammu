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
      this.dom = {};

      this.lastLocalActivePlayerIndex = 0;
      this.pendingHostOfferToPeerId = null;
      this.pendingHostOfferForMe = false;

      this._peerScriptPromise = null;
      this._puzzleHooked = false;
      this._applyingRemote = false;
      this._lastCursorEmitMs = 0;
    }

    init(dom = {}) {
      this.dom = dom;
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
    async hostRoom(customCode = null, opts = {}) {
      await this._cleanupPeerOnly();
      const PeerCtor = await this._ensurePeerJS();
      const code = (customCode || makeRoomCode(4)).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const requestedId = `${PREFIX}${code}`;

      return new Promise((resolve, reject) => {
        const peer = new PeerCtor(requestedId);
        this.peer = peer;
        this.role = 'host';
        this.roomCode = code;
        this.matchName = opts.matchName || this.matchName || `Match ${code}`;

        peer.on('open', (id) => {
          this.myPeerId = id;
          this.hostPeerId = id;
          const prof = global.MemoryCardManager?.getProfile?.() || { name: 'Host' };
          this.peerMeta.set(id, { name: prof.name || 'Host', seatIndex: 0 });
          this.seatOwners = [id];
          this._bindHostIncoming(peer);
          this._updateDrawerUI?.();
          global.GameState?.showToast?.(`🌐 Hosting Room: ${code}`);
          resolve({ ok: true, roomCode: code, peerId: id });
        });

        peer.on('error', (err) => {
          global.GameState?.showToast?.(`⚠️ P2P Host Error: ${err.type || err.message}`);
          this._updateDrawerUI?.();
          reject(err);
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

    async joinRoom(roomCode) {
      const code = (roomCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!code) {
        global.GameState?.showToast?.('⚠️ Enter a valid Room Code.');
        return false;
      }
      await this._cleanupPeerOnly();
      const PeerCtor = await this._ensurePeerJS();
      const targetHostId = `${PREFIX}${code}`;

      return new Promise((resolve, reject) => {
        let settled = false;
        const finishErr = (err, toastMsg = null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          const msg = toastMsg || `⚠️ P2P Join Error: ${err?.type || err?.message || 'Unavailable'}`;
          if (err && typeof err === 'object') err._toasted = true;
          global.GameState?.showToast?.(msg);
          this._cleanupPeerOnly();
          this.role = 'offline';
          this._updateDrawerUI?.();
          reject(err || new Error('Join failed'));
        };
        const timeoutId = setTimeout(() => {
          finishErr(new Error('timeout'), `⚠️ Could not reach Room ${code} (timed out).`);
        }, 10000);

        const peer = new PeerCtor();
        this.peer = peer;
        this.role = 'guest';
        this.roomCode = code;
        this.hostPeerId = targetHostId;

        peer.on('open', (id) => {
          this.myPeerId = id;
          this._bindGuestIncoming(peer);
          const conn = peer.connect(targetHostId, { reliable: true });
          this._wireConnection(conn, () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutId);
            const prof = global.MemoryCardManager?.getProfile?.() || { name: 'Guest' };
            conn.send({ type: 'HELLO', peerId: id, name: prof.name || 'Guest' });
            this._updateDrawerUI?.();
            global.GameState?.showToast?.(`🌐 Joined Room: ${code}`);
            resolve({ ok: true, roomCode: code, peerId: id });
          }, (err) => finishErr(err));
        });

        peer.on('error', (err) => finishErr(err));
      });
    }

    async leaveRoom() {
      await this._cleanupPeerOnly();
      this.role = 'offline';
      this.roomCode = '';
      this.hostPeerId = null;
      this.seatOwners = [];
      this.peerMeta.clear();
      this.pendingHostOfferToPeerId = null;
      this.pendingHostOfferForMe = false;
      this._updateDrawerUI?.();
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
        this.seatOwners = this.seatOwners.map(id => (id === conn.peer ? null : id));
        if (this.role === 'host') this._broadcastRoster();
        this._updateDrawerUI?.();
      });
    }

    _assignDefaultSeats(playerCount = 6) {
      const ids = [this.myPeerId, ...Array.from(this.connections.keys())].filter(Boolean);
      for (let i = 0; i < Math.max(playerCount, ids.length); i++) {
        if (!this.seatOwners[i] && ids[i]) {
          this.seatOwners[i] = ids[i];
          const meta = this.peerMeta.get(ids[i]);
          if (meta) meta.seatIndex = i;
        }
      }
    }

    _broadcast(msg, excludePeerId = null) {
      this.connections.forEach((conn, pid) => {
        if (pid !== excludePeerId && conn.open) conn.send(msg);
      });
    }

    _buildRosterPayload() {
      const gsc = global.GameSettingsCanvas;
      const wp = gsc?.getActiveWorkingPreset?.();
      const playerCount = global.GameState?.matchStarted
        ? (global.GameState.playerCount || 1)
        : (gsc?.config?.playerCount || 2);
      return {
        type: 'ROOM_ROSTER',
        roomCode: this.roomCode,
        matchName: this.matchName || global.GameState?.matchName || '',
        presetName: wp?.name || global.GameState?.matchConfig?.presetName || 'Meditate',
        playerCount,
        matchConfig: wp?.match ? { ...wp.match, presetName: wp.name } : null,
        hostPeerId: this.hostPeerId,
        seatOwners: this.seatOwners,
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

    /** Transfers live Host authority to another connected peer seamlessly. */
    passHost(targetPeerId = null) {
      if (this.role !== 'host') return false;
      const candidates = Array.from(this.connections.keys());
      const nextHostId = targetPeerId || candidates[0];
      if (!nextHostId || !this.connections.has(nextHostId)) {
        global.GameState?.showToast?.('⚠️ No connected guest available for Pass Host.');
        return false;
      }
      this.pendingHostOfferToPeerId = null;

      const snap = global.MemoryCardManager?.saveActivePuzzleMatch?.() || null;
      const payload = {
        type: 'HOST_HANDOFF',
        newHostPeerId: nextHostId,
        seatOwners: this.seatOwners,
        peers: Array.from(this.peerMeta.entries()),
        snap
      };
      this._broadcast(payload);
      this._acceptHostHandoff(payload);
      return true;
    }

    _acceptHostHandoff(msg) {
      const nextHost = msg.newHostPeerId;
      this.hostPeerId = nextHost;
      this.pendingHostOfferToPeerId = null;
      this.pendingHostOfferForMe = false;
      if (Array.isArray(msg.seatOwners)) this.seatOwners = msg.seatOwners.slice();
      if (Array.isArray(msg.peers)) this.peerMeta = new Map(msg.peers);

      if (this.myPeerId === nextHost) {
        this.role = 'host';
        if (global.GameState) global.GameState.roleBadge = 'Host';
        if (msg.snap && global.MemoryCardManager) global.MemoryCardManager.saveActivePuzzleMatch();
        global.GameState?.showToast?.('👑 You are now the Match Host!');
      } else {
        this.role = 'guest';
        if (global.GameState) global.GameState.roleBadge = 'Player';
        if (!this.connections.has(nextHost) && this.peer) {
          const conn = this.peer.connect(nextHost, { reliable: true });
          this._wireConnection(conn, () => {
            const prof = global.MemoryCardManager?.getProfile?.() || { name: 'Player' };
            conn.send({ type: 'HELLO', peerId: this.myPeerId, name: prof.name || 'Player' });
            this._updateDrawerUI?.();
          });
        }
        global.GameState?.showToast?.('🔄 Host transferred smoothly');
      }
      this._updateDrawerUI?.();
    }
  }

  global.NetworkP2PManagerClass = NetworkP2PManagerClass;
})(typeof window !== 'undefined' ? window : this);
