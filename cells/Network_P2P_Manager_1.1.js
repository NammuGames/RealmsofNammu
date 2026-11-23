/**
 * @fileoverview cells/Network_P2P_Manager_1.1.js - Lobby Lifecycle, Seat Roster & Pass Host (Part 2/3)
 * @description Attaches Host/Join/Leave room lifecycle, multi-seat roster management, and
 * 2-step Pass Host handoff onto NetworkP2PManagerClass.prototype.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const Cls = global.NetworkP2PManagerClass;
  const proto = Cls?.prototype;
  if (!proto || !Cls._helpers) {
    console.error('[Network_P2P_Manager_1.1] Load Network_P2P_Manager_1.0.js first.');
    return;
  }

  const { makeRoomCode, makePeerId } = Cls._helpers;

  // ── HOST / JOIN / LEAVE LIFECYCLE ─────────────────────────────────────────
  proto.stopSearch = function() {
    this._joinSeq++;
    if (this._searchRetryTimer) { clearTimeout(this._searchRetryTimer); this._searchRetryTimer = null; }
    this._pendingJoinResolve = null;
    this.searchingCode = '';
    this.searchStatus = '';
  };

  proto.hostRoom = async function(customCode = null, opts = {}) {
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
      this.hostOnline = true;
      this.roomLocked = !!opts.roomLocked;
      this.matchStarted = !!opts.matchStarted;
      this.joinRejectedReason = '';
      this.searchStatus = '';
      this.matchName = opts.matchName !== undefined ? (opts.matchName || '') : (this.matchName || '');
      const prof = global.MemoryCardManager?.getProfile?.() || { name: 'Host' };
      this.onlinePeerIds = new Set([this.myPeerId]);
      if (Array.isArray(opts.seatOwners) && opts.seatOwners.length > 0) {
        this.hydrateSavedRoster?.({
          hostPeerId: this.myPeerId,
          seatOwners: opts.seatOwners,
          roomSeats: opts.roomSeats,
          peers: opts.peers,
          matchStarted: this.matchStarted
        });
      } else {
        this.peerMeta.clear();
        this.peerMeta.set(this.myPeerId, { name: prof.name || 'Host', seatIndex: 0, localPlayerCount: localCount });
        this._rebuildSeatRoster();
      }
      this._startHeartbeat();
      this._broadcastRoster();
      this._updateDrawerUI?.();
      this._notifyLobbyUpdate();
      global.GameState?.showToast?.(`🌐 Hosting Room: ${code}`);
      return { ok: true, roomCode: code, peerId: this.myPeerId };
    } catch (err) {
      this.role = 'offline';
      this.searchStatus = `Host Error: ${err?.message || 'Relay Unavailable'}`;
      this._notifyLobbyUpdate();
      global.GameState?.showToast?.(`⚠️ Relay Host Error: ${err?.message || 'Unavailable'}`);
      this._updateDrawerUI?.();
      throw err;
    }
  };

  proto.hostSavedMatch = async function(saveId = null) {
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
    const roster = target.rosterMeta || {};
    await this.hostRoom(target.roomCode || null, {
      matchName: target.matchName || target.name || '',
      matchStarted: true,
      roomLocked: true,
      seatOwners: roster.seatOwners || target.seatOwners,
      roomSeats: roster.roomSeats || target.roomSeats,
      peers: roster.peers || target.peers
    });
    mc.restorePuzzleState(target);
    if (!Array.isArray(this.seatOwners) || this.seatOwners.length === 0) {
      this._assignDefaultSeats(target.playerCount || global.GameState?.playerCount || 1);
      this._syncLockedRoomSeats?.();
    }
    this._broadcastRoster();
    global.GameState?.showToast?.(`🌐 Hosting "${target.matchName || target.name || this.roomCode}" (Code ${this.roomCode})`);
    return true;
  };

  proto._onGuestConnectedToHost = function(hostPeerId) {
    if (this.role !== 'guest' || !hostPeerId) return;
    const firstJoin = !this.hostOnline || !this.connections.has(hostPeerId);
    this.hostPeerId = hostPeerId;
    this.hostOnline = true;
    this.connections.set(hostPeerId, { peer: hostPeerId, open: true, lastSeen: Date.now() });
    this.onlinePeerIds.add(hostPeerId);
    this.onlinePeerIds.add(this.myPeerId);
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
  };

  proto.joinRoom = async function(roomCode, opts = {}) {
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
    this._notifyLobbyUpdate();

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
          this._notifyLobbyUpdate();
          helloTries = 0;
          this._sendHello();
          scheduleProbe();
        } catch (err) {
          if (isStale()) return;
          if (keepSearching) {
            this.searchStatus = 'Relay Busy — Retrying...';
            this._notifyLobbyUpdate();
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
            this._notifyLobbyUpdate();
            reject(new Error('timeout'));
            return;
          }
          if (keepSearching && helloTries >= 4 && !this.transport?.customRelayUrl) {
            brokerIdx = (brokerIdx + 1) % (this.transport?.brokers?.length || 2);
            this.searchStatus = 'Checking Backup Relay...';
            this._notifyLobbyUpdate();
            await this._cleanupTransportOnly();
            connectAndProbe();
            return;
          }
          this.searchStatus = 'Waiting for Host...';
          this._notifyLobbyUpdate();
          this._sendHello();
          scheduleProbe();
        }, 2500);
      };

      connectAndProbe();
    });
  };

  proto.leaveRoom = async function() {
    this.stopSearch();
    if (this.transport?.connected && this.role !== 'offline') {
      await this._publishRoom({ type: 'GOODBYE' });
    }
    await this._cleanupTransportOnly();
    this.role = 'offline';
    this.roomCode = '';
    this.hostPeerId = null;
    this.hostOnline = false;
    this.roomLocked = false;
    this.matchStarted = false;
    this.joinRejectedReason = '';
    this.pendingMatchStartSnap = null;
    this._awaitingEnterMatch = false;
    this.seatOwners = [];
    this.roomSeats = [];
    this.peerMeta.clear();
    this.onlinePeerIds.clear();
    this.pendingHostOfferToPeerId = null;
    this.pendingHostOfferForMe = false;
    this._updateDrawerUI?.();
    this._notifyLobbyUpdate();
    global.GameState?.showToast?.('🔌 Disconnected from Online Room');
  };

  proto.closeRoomAndSave = async function() {
    if (global.GameState?.matchStarted) {
      global.MemoryCardManager?.saveActivePuzzleMatch?.();
    }
    if (this.role === 'host' && this.transport?.connected) {
      await this._publishRoom({ type: 'ROOM_CLOSING' });
    }
    await this.leaveRoom();
  };

  // ── SEAT ROSTER & PASS HOST ───────────────────────────────────────────────
  proto._assignDefaultSeats = function(playerCount = 6) {
    const ids = [this.myPeerId, ...Array.from(this.connections.keys())].filter(Boolean);
    for (let i = 0; i < Math.max(playerCount, ids.length); i++) {
      if (!this.seatOwners[i] && ids[i]) {
        this.seatOwners[i] = ids[i];
        const meta = this.peerMeta.get(ids[i]);
        if (meta) meta.seatIndex = i;
      }
    }
  };

  proto._notifyLobbyUpdate = function() {
    global.RoomStatCanvas?.refreshIfOpen?.();
    global.StatCanvas?.refreshIfOpen?.();
    const gsc = global.GameSettingsCanvas;
    if (gsc?.active) gsc.rebuildTopFrame?.();
  };

  proto._rebuildSeatRoster = function() {
    if (this.role !== 'host') return this.getRoomSeats();
    if (this._isMatchActive() && Array.isArray(this.seatOwners) && this.seatOwners.length > 0) {
      return this._syncLockedRoomSeats?.() || this.roomSeats;
    }
    const seats = [];
    const owners = [];
    const hostCount = Math.max(1, Math.min(6, this.hostLocalPlayerCount || this.localPlayerCount || 1));
    const hostMeta = this.peerMeta.get(this.myPeerId) || { name: 'Host' };

    for (let i = 0; i < hostCount; i++) {
      const idx = seats.length;
      owners.push(this.myPeerId);
      seats.push({ seatIndex: idx, playerNum: idx + 1, name: `Player ${idx + 1}`, deviceName: hostMeta.name || 'Host', ownerPeerId: this.myPeerId, isHost: true });
    }

    this.connections.forEach((_, pid) => {
      if (pid === this.myPeerId) return;
      const meta = this.peerMeta.get(pid) || {};
      const cnt = Math.max(1, Math.min(6, meta.localPlayerCount || 1));
      meta.seatIndex = seats.length;
      this.peerMeta.set(pid, meta);
      for (let k = 0; k < cnt; k++) {
        const idx = seats.length;
        owners.push(pid);
        seats.push({ seatIndex: idx, playerNum: idx + 1, name: `Player ${idx + 1}`, deviceName: meta.name || 'Guest', ownerPeerId: pid, isHost: false });
      }
    });

    this.seatOwners = owners;
    this.roomSeats = seats;
    return seats;
  };

  proto.getRoomSeats = function() {
    if (this.role === 'host') return this._rebuildSeatRoster();
    if (this.role === 'guest' && Array.isArray(this.roomSeats) && this.roomSeats.length > 0) {
      if (this.isConnected() || this._isMatchActive()) return this.roomSeats;
    }
    const cnt = Math.max(1, Math.min(6, this.localPlayerCount || global.GameSettingsCanvas?.config?.playerCount || 1));
    const out = [];
    for (let i = 0; i < cnt; i++) {
      out.push({ seatIndex: i, playerNum: i + 1, name: `Player ${i + 1}`, deviceName: 'You (Local)', ownerPeerId: this.myPeerId || 'local', isHost: false });
    }
    return out;
  };

  proto.setLocalPlayerCount = function(count) {
    const clean = Math.max(1, Math.min(6, Number(count) || 1));
    this.localPlayerCount = clean;
    if (this.role === 'host') {
      this.hostLocalPlayerCount = clean;
      this._rebuildSeatRoster();
      this._broadcastRoster();
      this._notifyLobbyUpdate();
    } else if (this.role === 'guest' && this.isConnected()) {
      this._sendHello();
      this._notifyLobbyUpdate();
    }
  };

  proto._buildRosterPayload = function() {
    const gsc = global.GameSettingsCanvas;
    const wp = gsc?.getActiveWorkingPreset?.();
    const seats = this.getRoomSeats() || [];
    const matchActive = this._isMatchActive();
    const playerCount = matchActive ? (global.GameState?.playerCount || Math.max(1, seats.length)) : Math.max(1, seats.length);
    return {
      type: 'ROOM_ROSTER',
      roomCode: this.roomCode,
      matchName: this.matchName || global.GameState?.matchName || '',
      presetName: wp?.name || global.GameState?.matchConfig?.presetName || 'Meditate',
      playerCount,
      matchConfig: wp?.match
        ? { ...wp.match, presetName: wp.name, luckPreset: wp.luck || null, blightPreset: wp.blight || null }
        : (global.GameState?.matchConfig || null),
      hostPeerId: this.hostPeerId,
      roomLocked: !!this.roomLocked,
      matchStarted: matchActive,
      onlinePeerIds: this.getOnlinePeerIds?.() || [this.myPeerId],
      seatOwners: this.seatOwners,
      seats,
      peers: Array.from(this.peerMeta.entries())
    };
  };

  proto._sendRosterTo = function(targetPeerId) {
    this._publishRoom(this._buildRosterPayload(), targetPeerId || '*');
  };

  proto._broadcastRoster = function() {
    this._publishRoom(this._buildRosterPayload(), '*');
  };

  proto.offerHostToPlayer = function(playerId) {
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
  };

  proto.acceptHostOffer = function() {
    if (this.role !== 'guest' || !this.pendingHostOfferForMe) return false;
    this.pendingHostOfferForMe = false;
    this._publishRoom({ type: 'HOST_ACCEPT', peerId: this.myPeerId }, this.hostPeerId || '*');
    global.GameState?.showToast?.('🔄 Accepting Host role...');
    this._updateDrawerUI?.();
    return true;
  };

  proto.passHost = function(targetPeerId = null) {
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
      onlinePeerIds: this.getOnlinePeerIds?.() || [],
      peers: Array.from(this.peerMeta.entries()),
      snap
    };
    this._broadcast(payload);
    this._acceptHostHandoff(payload);
    return true;
  };

  proto._acceptHostHandoff = function(msg) {
    const nextHost = msg.newHostPeerId;
    this.hostPeerId = nextHost;
    this.hostOnline = true;
    this.pendingHostOfferToPeerId = null;
    this.pendingHostOfferForMe = false;
    if (Array.isArray(msg.seatOwners)) this.seatOwners = msg.seatOwners.slice();
    if (Array.isArray(msg.peers)) this.peerMeta = new Map(msg.peers);
    if (Array.isArray(msg.onlinePeerIds)) this.onlinePeerIds = new Set(msg.onlinePeerIds);

    if (this.myPeerId === nextHost) {
      this.role = 'host';
      if (global.GameState) global.GameState.roleBadge = 'Host';
      const onlineSet = Array.isArray(msg.onlinePeerIds) ? new Set(msg.onlinePeerIds) : null;
      this.peerMeta.forEach((_, pid) => {
        if (pid !== this.myPeerId && !this.connections.has(pid) && (!onlineSet || onlineSet.has(pid))) {
          this.connections.set(pid, { peer: pid, open: true, lastSeen: Date.now() });
        }
      });
      this.onlinePeerIds.add(this.myPeerId);
      this._rebuildSeatRoster();
      this._broadcastRoster();
      if (msg.snap && global.MemoryCardManager) global.MemoryCardManager.saveActivePuzzleMatch();
      global.GameState?.showToast?.('👑 You are now the Match Host!');
    } else {
      this.role = 'guest';
      if (global.GameState) global.GameState.roleBadge = 'Player';
      if (nextHost) {
        this.connections.set(nextHost, { peer: nextHost, open: true, lastSeen: Date.now() });
        this.onlinePeerIds.add(nextHost);
      }
      this._syncLockedRoomSeats?.();
      global.GameState?.showToast?.('🔄 Host transferred smoothly');
    }
    this._updateDrawerUI?.();
    this._notifyLobbyUpdate();
  };
})(typeof window !== 'undefined' ? window : this);
