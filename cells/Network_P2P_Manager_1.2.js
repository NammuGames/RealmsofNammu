/**
 * @fileoverview cells/Network_P2P_Manager_1.2.js - Wire Sync Protocol & Remote Replay (Part 3/4)
 * @description Attaches message routing, reliable STATE_SYNC/STATE_ACK retry delivery, and remote
 * cursor/action/state replay onto NetworkP2PManagerClass. (Puzzle hooks & Drawer UI live in Part 1.3).
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const proto = global.NetworkP2PManagerClass?.prototype;
  if (!proto) {
    console.error('[Network_P2P_Manager_1.2] Load Network_P2P_Manager_1.0.js first.');
    return;
  }

  proto._broadcast = function(msg) {
    this._publishRoom?.(msg, '*');
  };

  // ── MESSAGE DISPATCH & REMOTE REPLAY ──────────────────────────────────────
  proto._handleMessage = function(fromPeerId, msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'HELLO' && this.role === 'host') {
      this._handleHostHello?.(fromPeerId, msg);
      return;
    }

    if (msg.type === 'ROOM_LOCK_STATE' && this.role === 'guest') {
      this.roomLocked = !!msg.roomLocked;
      this._notifyLobbyUpdate?.();
      return;
    }

    if (msg.type === 'JOIN_REJECTED' && this.role === 'guest') {
      this._handleJoinRejected?.(msg);
      return;
    }

    if (msg.type === 'ROOM_ROSTER') {
      if (this.role === 'guest') {
        this._onGuestConnectedToHost?.(msg.hostPeerId || fromPeerId);
        const listed = Array.isArray(msg.seatOwners) && msg.seatOwners.includes(this.myPeerId);
        if (!listed && !msg.roomLocked && !msg.matchStarted) this._sendHello?.();
      }
      this.roomCode = msg.roomCode || this.roomCode;
      if (typeof msg.matchName === 'string') this.matchName = msg.matchName;
      if (msg.presetName) this.hostPresetName = msg.presetName;
      if (typeof msg.playerCount === 'number') this.hostPlayerCount = msg.playerCount;
      if (msg.matchConfig) this.hostMatchConfig = msg.matchConfig;
      if (typeof msg.roomLocked === 'boolean') this.roomLocked = msg.roomLocked;
      if (typeof msg.matchStarted === 'boolean') this.matchStarted = msg.matchStarted;
      this.hostPeerId = msg.hostPeerId || this.hostPeerId;
      if (Array.isArray(msg.seatOwners)) this.seatOwners = msg.seatOwners.slice();
      if (Array.isArray(msg.seats)) this.roomSeats = msg.seats;
      if (Array.isArray(msg.peers)) this.peerMeta = new Map(msg.peers);
      if (Array.isArray(msg.onlinePeerIds)) {
        this.onlinePeerIds = new Set(msg.onlinePeerIds);
        if (this.role === 'guest') {
          this.onlinePeerIds.add(this.myPeerId);
          if (this.hostPeerId && this.hostOnline) this.onlinePeerIds.add(this.hostPeerId);
        }
      }
      if (this.role === 'guest' && msg.matchStarted && msg.roomCode) {
        const gsc = global.GameSettingsCanvas;
        if (gsc && !gsc.selectedSavedMatchId) {
          const matchingSave = global.MemoryCardManager?.findSaveByRoomCode?.(msg.roomCode);
          if (matchingSave && !matchingSave.isDraft) {
            gsc.clearArmedDraft?.();
            gsc.selectedSavedMatchId = matchingSave.id;
          }
        }
      }
      this._updateDrawerUI();
      this._notifyLobbyUpdate();
      return;
    }

    if (msg.type === 'HOST_OFFER') {
      this.pendingHostOfferForMe = (msg.targetPeerId === this.myPeerId);
      if (this.pendingHostOfferForMe) {
        global.GameState?.showToast?.('👑 Host offered to you! Open Pause → Receive Host.');
      }
      this._updateDrawerUI();
      return;
    }

    if (msg.type === 'HOST_ACCEPT' && this.role === 'host') {
      if (!this.pendingHostOfferToPeerId || this.pendingHostOfferToPeerId === fromPeerId) {
        this.passHost(fromPeerId);
      }
      return;
    }

    if (msg.type === 'ROOM_CLOSING') {
      if (this.role === 'guest' && this._isMatchActive()) {
        this.hostOnline = false;
        if (this.hostPeerId) {
          this.connections.delete(this.hostPeerId);
          this.onlinePeerIds.delete(this.hostPeerId);
        }
        this._handleHostDroppedInMatch?.('💾 Host saved and went offline.');
      } else {
        global.GameState?.showToast?.('💾 Host saved and closed the room.');
        this.leaveRoom();
      }
      return;
    }

    if (msg.type === 'PLAYER_FORFEIT' && typeof msg.seatIndex === 'number') {
      this._applyingRemote = true;
      try { global.GameSettingsCanvas?.forfeitPlayerByIndex?.(msg.seatIndex, { fromRemote: true }); }
      finally { this._applyingRemote = false; }
      return;
    }

    if (msg.type === 'HOST_HANDOFF') {
      this._acceptHostHandoff(msg);
      return;
    }

    if (msg.type === 'CURSOR_STATE') {
      if (!this.turnOnlySync) this._applyCursorState(msg);
      return;
    }

    if (msg.type === 'ACTION') {
      if (!this.turnOnlySync) this._applyRemoteAction(msg);
      return;
    }

    if (msg.type === 'LOG_SYNC_REQ' && this.role === 'host') {
      const entries = global.TurnLogManager?.getEntriesAfter?.(msg.afterSeq || 0) || [];
      const targetSnap = global.MemoryCardManager?.capturePuzzleState?.();
      if (targetSnap && targetSnap.turnLog) targetSnap.turnLog = undefined;
      this._publishRoom?.({
        type: 'LOG_SYNC_BATCH', entries, targetSnap,
        seatOwners: this.seatOwners?.length ? this.seatOwners : undefined
      }, fromPeerId);
      return;
    }

    if (msg.type === 'LOG_SYNC_BATCH' && this.role === 'guest') {
      if (this._logCatchUpTimer) { clearTimeout(this._logCatchUpTimer); this._logCatchUpTimer = null; }
      if (Array.isArray(msg.seatOwners) && msg.seatOwners.length > 0) {
        this.seatOwners = msg.seatOwners.slice();
      }
      const lm = global.TurnLogManager;
      const lp = global.TurnLogPlayer;
      const added = lm?.enqueueIncomingEntries?.(msg.entries || []) || 0;
      if (added > 0) {
        if (msg.targetSnap && lp) lp.deferredTurnSnap = msg.targetSnap;
        if (global.GameState) {
          global.GameState.placedThisTurn = true;
          global.GameState.isMaterialSelected = false;
        }
        global.GameState?.syncUI?.();
        global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
        global.BoardRenderer?.render?.();
      } else if (msg.targetSnap && !lm?.hasPendingEntries?.() && !lp?.active) {
        this._applyRemoteStateSync(msg.targetSnap, null, 'TURN', 0, msg.seatOwners || null);
      }
      return;
    }

    if (msg.type === 'STATE_ACK') {
      if (this._pendingSync && msg.syncId === this._pendingSync.syncId) {
        clearInterval(this._pendingSync.timer);
        this._pendingSync = null;
      }
      return;
    }

    if (msg.type === 'MATCH_START_INIT' && this.role === 'guest' && msg.config) {
      if (msg.syncId) this._publishRoom?.({ type: 'STATE_ACK', syncId: msg.syncId }, fromPeerId);
      if (msg.syncId && msg.syncId === this._lastRemoteSyncKey) return;
      this._lastRemoteSyncKey = msg.syncId || '';
      this._applyRemoteMatchStartInit(msg);
      return;
    }

    if (msg.type === 'STATE_SYNC' && msg.snap) {
      if (msg.syncId) this._publishRoom?.({ type: 'STATE_ACK', syncId: msg.syncId }, fromPeerId);
      if (msg.syncId && msg.syncId === this._lastRemoteSyncKey) return;
      this._lastRemoteSyncKey = msg.syncId || '';
      if (this._pendingSync) { clearInterval(this._pendingSync.timer); this._pendingSync = null; }
      this._applyRemoteStateSync(msg.snap, msg.logEntry || null, msg.reason || 'TURN', msg.hostMaxSeq || 0, msg.seatOwners || null);
    }
  };

  proto._emit = function(type, payload = {}) {
    if (!this.isConnected() || this._applyingRemote) return;
    this._publishRoom?.({ type, sender: this.myPeerId, ...payload }, '*');
  };

  proto.broadcastCursorThrottled = function() {
    if (this.turnOnlySync) return;
    const now = performance.now();
    if (now - this._lastCursorEmitMs < 65) return;
    this._lastCursorEmitMs = now;
    const g = global.GameState;
    if (!g || !g.matchStarted) return;
    this._emit('CURSOR_STATE', {
      cursor: g.placementCursor, rot: g.selectedRotation,
      idx: g.selectedTrayIndex, sel: g.isMaterialSelected, mod: g.activeMaterialMod
    });
  };

  proto.requestLogCatchUp = function(retriesLeft = 3) {
    if (this.role !== 'guest' || !this.isConnected()) return false;
    if (this._logCatchUpTimer) { clearTimeout(this._logCatchUpTimer); this._logCatchUpTimer = null; }
    const afterSeq = global.TurnLogManager?.lastViewedSeq || 0;
    const sent = this._publishRoom?.({ type: 'LOG_SYNC_REQ', afterSeq }, this.hostPeerId || '*');
    if (retriesLeft > 0) {
      this._logCatchUpTimer = setTimeout(() => {
        this._logCatchUpTimer = null;
        if (this.role === 'guest' && this.isConnected() && global.TurnLogPlayer?.deferredTurnSnap && !global.TurnLogManager?.hasPendingEntries?.()) {
          this.requestLogCatchUp(retriesLeft - 1);
        }
      }, 1800);
    }
    return sent;
  };

  proto.syncFullState = function(reason = 'TURN') {
    if (!this.isConnected() || this._applyingRemote) return;
    const snap = global.MemoryCardManager?.saveActivePuzzleMatch?.();
    if (!snap) return;
    const lm = global.TurnLogManager;
    const latestEntry = (reason === 'TURN_END' && lm?.hostLog?.length) ? lm.hostLog[lm.hostLog.length - 1] : null;
    const hostMaxSeq = lm?.hostLog?.length ? lm.hostLog[lm.hostLog.length - 1].seq : 0;
    const netSnap = snap.turnLog ? { ...snap, turnLog: undefined } : snap;
    const syncId = `${this.myPeerId}:${++this._syncSeq}`;
    const payload = {
      type: 'STATE_SYNC', sender: this.myPeerId, reason, hostMaxSeq, syncId,
      seatOwners: this.seatOwners?.length ? this.seatOwners : undefined,
      snap: netSnap, logEntry: latestEntry
    };
    if (this._pendingSync) { clearInterval(this._pendingSync.timer); this._pendingSync = null; }
    this._publishRoom?.(payload, '*');
    if (this.connections.size > 0) {
      let retries = 0;
      const timer = setInterval(() => {
        if (!this._pendingSync || this._pendingSync.syncId !== syncId || !this.isConnected() || ++retries > 5) {
          clearInterval(timer);
          if (this._pendingSync?.syncId === syncId) this._pendingSync = null;
          return;
        }
        this._publishRoom?.(payload, '*');
      }, 2400);
      this._pendingSync = { syncId, msg: payload, timer };
    }
  };

  proto._applyCursorState = function(msg) {
    const g = global.GameState;
    if (!g || !g.matchStarted) return;
    this._applyingRemote = true;
    try {
      if (msg.cursor) g.placementCursor = { q: msg.cursor.q, r: msg.cursor.r };
      if (typeof msg.rot === 'number') g.selectedRotation = msg.rot;
      if (typeof msg.idx === 'number') g.selectedTrayIndex = msg.idx;
      if (typeof msg.sel === 'boolean') g.isMaterialSelected = msg.sel;
      if (msg.mod !== undefined) g.activeMaterialMod = msg.mod;
      g.syncUI?.();
      global.BoardRenderer?.render?.();
    } finally { this._applyingRemote = false; }
  };

  proto._applyRemoteAction = function(msg) {
    const g = global.GameState;
    if (!g) return;
    this._applyingRemote = true;
    try {
      if (msg.op === 'MOVE' && msg.dir) g.moveDirection?.(msg.dir);
      else if (msg.op === 'ROTATE' && msg.dir) g.rotatePiece?.(msg.dir);
      else if (msg.op === 'CLICK' && typeof msg.sx === 'number') global.InputController?.handleBoardClick?.(msg.sx, msg.sy);
      else if (msg.op === 'PLACE') g.placeActiveMaterial?.();
      else if (msg.op === 'CONFIRM') g.confirmPlacementAndExit?.();
      else if (msg.op === 'UNDO') global.UndoManager?.undoLastAction?.();
      else if (msg.op === 'END_TURN') global.TurnManager?.endTurn?.();
      global.BoardRenderer?.render?.();
    } finally { this._applyingRemote = false; }
  };

  proto._applyRemoteStateSync = async function(snap, logEntry = null, reason = 'TURN', hostMaxSeq = 0, seatOwners = null) {
    this.matchStarted = true;
    this.roomLocked = true;
    if (this.role === 'guest' && Array.isArray(seatOwners) && seatOwners.length > 0) {
      this.seatOwners = seatOwners.slice();
    }
    if (this.role === 'guest' && this._awaitingEnterMatch && (reason === 'JOIN' || reason === 'MATCH_RESUME')) {
      this.pendingMatchStartSnap = { snap, logEntry, reason, hostMaxSeq, seatOwners };
      this._notifyLobbyUpdate?.();
      return;
    }
    if (global.HubGameLoader?.activeGameId !== 'puzzle') {
      await global.HubGameLoader?.launchGame?.('puzzle');
    }
    const lm = global.TurnLogManager;
    const lp = global.TurnLogPlayer;
    if (logEntry) {
      if (this.role === 'host') lm?.appendHostEntry?.(logEntry);
      if (global.GameState?.matchStarted && reason === 'TURN_END') {
        const added = lm?.enqueueIncomingEntries?.([logEntry]) || 0;
        if (added > 0 || lp?.active || lm?.hasPendingEntries?.()) {
          if (lp) lp.deferredTurnSnap = snap;
          global.GameState?.syncUI?.();
          global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
          global.BoardRenderer?.render?.();
          this._updateDrawerUI();
          return;
        }
      }
    }

    // Returning/joining player behind on Host's log catches up via Log-Show before starting turn
    const savedLocal = snap?.roomCode ? global.MemoryCardManager?.findSaveByRoomCode?.(snap.roomCode) : null;
    if (savedLocal?.turnLog && lm && !lm.lastViewedSeq) {
      lm.importState(savedLocal.turnLog);
    }
    if (this.role === 'guest' && (reason === 'JOIN' || reason === 'MATCH_RESUME') && hostMaxSeq > (lm?.lastViewedSeq || 0)) {
      if (global.RoomStatCanvas?.isOpen?.()) {
        global.RoomStatCanvas.close({ returnToMenu: false, immediate: true, silent: true });
      }
      if (!global.GameState?.matchStarted) {
        const preLogBase = (savedLocal && !savedLocal.isLobbyPlaceholder)
          ? { ...savedLocal, turnPhase: 'MID_TURN', placedThisTurn: true, isMaterialSelected: false }
          : { ...snap, boardTiles: [], activeDamageTiles: [], disease: null, turnPhase: 'MID_TURN', placedThisTurn: true, isMaterialSelected: false };
        global.MemoryCardManager?.restorePuzzleState?.(preLogBase);
      } else if (global.GameState) {
        global.GameState.placedThisTurn = true;
        global.GameState.isMaterialSelected = false;
      }
      if (lp) lp.deferredTurnSnap = snap;
      this.requestLogCatchUp();
      this._updateDrawerUI();
      return;
    }

    this._applyingRemote = true;
    try {
      if (global.RoomStatCanvas?.isOpen?.()) {
        global.RoomStatCanvas.close({ returnToMenu: false, immediate: true, silent: true });
      }
      global.MemoryCardManager?.restorePuzzleState?.(snap);
      global.MemoryCardManager?.saveActivePuzzleMatch?.(snap.id);
      if (this.role === 'guest' && (reason === 'JOIN' || reason === 'MATCH_RESUME')) {
        this.requestLogCatchUp();
      }
      this._updateDrawerUI();
    } finally { this._applyingRemote = false; }
  };
})(typeof window !== 'undefined' ? window : this);
