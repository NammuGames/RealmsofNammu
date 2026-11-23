/**
 * @fileoverview cells/Network_P2P_Manager_1.4.js - Room Lock, Seat Reclaim & Host-Drop Protocol (Part 5/5)
 * @description Attaches pre-match room locking, locked-roster HELLO validation & persistent seat
 * reclaim, saved-roster hydration, Host-drop kick-to-RoomStatCanvas, and deferred Enter Match sync
 * onto NetworkP2PManagerClass.prototype.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const proto = global.NetworkP2PManagerClass?.prototype;
  if (!proto) {
    console.error('[Network_P2P_Manager_1.4] Load Network_P2P_Manager_1.0.js first.');
    return;
  }

  // ── ONLINE PRESENCE & SAVED ROSTER METADATA ───────────────────────────────
  proto.getOnlinePeerIds = function() {
    if (this.role === 'host') {
      const ids = new Set([this.myPeerId]);
      this.connections.forEach((_, pid) => ids.add(pid));
      return Array.from(ids);
    }
    return Array.from(this.onlinePeerIds);
  };

  proto.getRosterMetadata = function() {
    const seats = this.getRoomSeats?.() || [];
    return {
      hostPeerId: this.hostPeerId || (this.role === 'host' ? this.myPeerId : null),
      seatOwners: Array.isArray(this.seatOwners) ? this.seatOwners.slice() : [],
      roomSeats: seats.map(s => ({ ...s })),
      peers: Array.from(this.peerMeta.entries())
    };
  };

  proto._syncLockedRoomSeats = function() {
    const owners = Array.isArray(this.seatOwners) ? this.seatOwners : [];
    const existing = Array.isArray(this.roomSeats) ? this.roomSeats : [];
    const out = [];
    for (let i = 0; i < owners.length; i++) {
      const ownerId = owners[i];
      const prev = existing[i] || {};
      const meta = ownerId ? this.peerMeta.get(ownerId) : null;
      const isHostSeat = !!(ownerId && ownerId === this.hostPeerId);
      out.push({
        seatIndex: i,
        playerNum: i + 1,
        name: prev.name || `Player ${i + 1}`,
        deviceName: meta?.name || prev.deviceName || (isHostSeat ? 'Host' : 'Guest'),
        ownerPeerId: ownerId || null,
        isHost: isHostSeat
      });
    }
    this.roomSeats = out;
    return out;
  };

  proto.hydrateSavedRoster = function(meta = {}) {
    if (meta.hostPeerId) this.hostPeerId = meta.hostPeerId;
    if (Array.isArray(meta.peers)) this.peerMeta = new Map(meta.peers);
    if (Array.isArray(meta.seatOwners)) this.seatOwners = meta.seatOwners.slice();
    if (Array.isArray(meta.roomSeats) && meta.roomSeats.length > 0) {
      this.roomSeats = meta.roomSeats.map((s, idx) => ({
        seatIndex: s.seatIndex ?? idx,
        playerNum: s.playerNum ?? (idx + 1),
        name: s.name || `Player ${idx + 1}`,
        deviceName: s.deviceName || (s.isHost ? 'Host' : 'Guest'),
        ownerPeerId: s.ownerPeerId ?? this.seatOwners[idx] ?? null,
        isHost: !!(s.isHost || (s.ownerPeerId && s.ownerPeerId === this.hostPeerId))
      }));
      if (this.seatOwners.length === 0) {
        this.seatOwners = this.roomSeats.map(s => s.ownerPeerId || null);
      }
    } else if (this.seatOwners.length > 0) {
      this._syncLockedRoomSeats();
    }
    if (typeof meta.matchStarted === 'boolean') this.matchStarted = meta.matchStarted;
    return this.roomSeats;
  };

  // ── PRE-MATCH ROOM LOCK PROTOCOL ──────────────────────────────────────────
  proto.setRoomLocked = function(locked) {
    if (this.role !== 'host') return false;
    this.roomLocked = !!locked;
    this._publishRoom?.({ type: 'ROOM_LOCK_STATE', roomLocked: this.roomLocked }, '*');
    this._broadcastRoster?.();
    this._notifyLobbyUpdate?.();
    return true;
  };

  proto._handleJoinRejected = async function(msg = {}) {
    const reason = msg.reason || 'Room is locked';
    this.joinRejectedReason = reason;
    const done = this._pendingJoinResolve;
    this._pendingJoinResolve = null;
    this.stopSearch();
    await this._cleanupTransportOnly();
    this.role = 'offline';
    this.roomLocked = false;
    global.GameState?.showToast?.(`🔒 ${reason}`);
    if (typeof done === 'function') done({ ok: false, rejected: true, reason });
    this._updateDrawerUI?.();
    this._notifyLobbyUpdate?.();
  };

  // ── HOST HELLO VALIDATION (LOCKED ROOM & PERSISTENT SEAT RECLAIM) ─────────
  proto._handleHostHello = function(fromPeerId, msg = {}) {
    if (this.role !== 'host' || !fromPeerId) return;
    const matchActive = this._isMatchActive();
    const ownsSeat = Array.isArray(this.seatOwners) && this.seatOwners.includes(fromPeerId);

    if (matchActive) {
      if (!ownsSeat) {
        this._publishRoom?.({ type: 'JOIN_REJECTED', reason: 'Match already in progress' }, fromPeerId);
        return;
      }
      const wasConnected = this.connections.has(fromPeerId);
      this.connections.set(fromPeerId, { peer: fromPeerId, open: true, lastSeen: Date.now() });
      this.onlinePeerIds.add(fromPeerId);
      const existing = this.peerMeta.get(fromPeerId) || {};
      const seatIdx = this.seatOwners.indexOf(fromPeerId);
      this.peerMeta.set(fromPeerId, {
        name: msg.name || existing.name || `Player ${seatIdx + 1}`,
        seatIndex: seatIdx,
        localPlayerCount: existing.localPlayerCount || this.seatOwners.filter(id => id === fromPeerId).length || 1
      });
      this._syncLockedRoomSeats();
      this._broadcastRoster?.();
      if (!wasConnected) {
        const snap = global.MemoryCardManager?.capturePuzzleState?.();
        const lm = global.TurnLogManager;
        const hostMaxSeq = lm?.hostLog?.length ? lm.hostLog[lm.hostLog.length - 1].seq : 0;
        if (snap) {
          const netSnap = snap.turnLog ? { ...snap, turnLog: undefined } : snap;
          this._publishRoom?.({
            type: 'STATE_SYNC', reason: 'JOIN', hostMaxSeq,
            seatOwners: this.seatOwners?.length ? this.seatOwners.slice() : undefined,
            snap: netSnap
          }, fromPeerId);
        }
      }
      this._updateDrawerUI?.();
      this._notifyLobbyUpdate?.();
      return;
    }

    if (this.roomLocked && !this.connections.has(fromPeerId) && !ownsSeat) {
      this._publishRoom?.({ type: 'JOIN_REJECTED', reason: 'Room is locked' }, fromPeerId);
      return;
    }

    const seatCount = Math.max(1, Math.min(6, msg.localPlayerCount || 1));
    this.connections.set(fromPeerId, { peer: fromPeerId, open: true, lastSeen: Date.now() });
    this.onlinePeerIds.add(fromPeerId);
    const existing = this.peerMeta.get(fromPeerId);
    const seatIdx = existing?.seatIndex ?? this.seatOwners.length;
    this.peerMeta.set(fromPeerId, {
      name: msg.name || `Player ${seatIdx + 1}`,
      seatIndex: seatIdx,
      localPlayerCount: seatCount
    });
    if (!this.roomLocked) this._rebuildSeatRoster?.();
    this._broadcastRoster?.();
    this._updateDrawerUI?.();
    this._notifyLobbyUpdate?.();
  };

  // ── HOST-DROP RECOVERY & DEFERRED ENTER MATCH ─────────────────────────────
  proto._handleHostDroppedInMatch = function(toastMsg = '🔌 Host went offline — waiting in Room') {
    if (this.role !== 'guest') return;
    this.hostOnline = false;
    this._awaitingEnterMatch = true;
    if (this.hostPeerId) {
      this.connections.delete(this.hostPeerId);
      this.onlinePeerIds.delete(this.hostPeerId);
    }
    this.searchStatus = 'Host Offline — Waiting...';
    global.GameState?.showToast?.(toastMsg);

    // Close StatCanvas or Pause Menu if open, then kick Guest back to RoomStatCanvas
    if (global.StatCanvas?.isOpen?.()) {
      global.StatCanvas.close?.({ immediate: true, silent: true });
    }
    if (global.RoomStatCanvas) {
      if (!global.RoomStatCanvas.isOpen?.()) {
        global.RoomStatCanvas.open?.({ origin: 'btn-nav-menu', mode: 'saved_reentry', silent: true });
      } else {
        global.RoomStatCanvas.refreshIfOpen?.();
      }
    }

    // Begin gentle HELLO probe loop so Guest auto-reconnects when Host reopens their Host save
    if (this.roomCode && !this._searchRetryTimer) {
      this._startHostReturnProbe();
    }
    this._notifyLobbyUpdate?.();
  };

  proto._startHostReturnProbe = function() {
    if (this._searchRetryTimer) clearTimeout(this._searchRetryTimer);
    this._searchRetryTimer = setTimeout(() => {
      this._searchRetryTimer = null;
      if (this.role !== 'guest' || !this.roomCode || this.hostOnline) return;
      if (this.transport?.connected) {
        this._sendHello?.();
      }
      this._startHostReturnProbe();
    }, 3000);
  };

  /** Called by RoomStatCanvas when clicking active "Enter Match" on a saved Host/Guest resume. */
  proto.enterLoadedMatch = async function() {
    this._awaitingEnterMatch = false;
    if (this.role === 'guest' && this.pendingMatchStartSnap) {
      const pending = this.pendingMatchStartSnap;
      this.pendingMatchStartSnap = null;
      await this._applyRemoteStateSync(
        pending.snap,
        pending.logEntry || null,
        pending.reason || 'JOIN',
        pending.hostMaxSeq || 0,
        pending.seatOwners || null
      );
      return true;
    }
    if (global.RoomStatCanvas?.isOpen?.()) {
      global.RoomStatCanvas.close({ returnToMenu: false, immediate: false, silent: false });
    }
    if (this.role === 'guest' && this.isConnected()) {
      this.requestLogCatchUp?.();
    }
    return true;
  };
})(typeof window !== 'undefined' ? window : this);
