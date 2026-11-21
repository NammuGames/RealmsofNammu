/**
 * @fileoverview cells/Network_P2P_Manager_1.2.js - Sync Protocol, Puzzle Hooks & Drawer UI (Part 3/3)
 * @description Attaches message routing, reliable STATE_SYNC/STATE_ACK retry delivery, spectator
 * turn locks, Phase E turn-end sync hook, Tuning Drawer UI, and global singleton registration.
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
      const seatCount = Math.max(1, Math.min(6, msg.localPlayerCount || 1));
      const wasConnected = this.connections.has(fromPeerId);
      this.connections.set(fromPeerId, { peer: fromPeerId, open: true, lastSeen: Date.now() });
      const existing = this.peerMeta.get(fromPeerId);
      const seatIdx = existing?.seatIndex ?? this.seatOwners.length;
      this.peerMeta.set(fromPeerId, { name: msg.name || `Player ${seatIdx + 1}`, seatIndex: seatIdx, localPlayerCount: seatCount });
      this._rebuildSeatRoster();
      this._broadcastRoster();
      if (!wasConnected && global.GameState?.matchStarted) {
        const snap = global.MemoryCardManager?.capturePuzzleState?.();
        const lm = global.TurnLogManager;
        const hostMaxSeq = lm?.hostLog?.length ? lm.hostLog[lm.hostLog.length - 1].seq : 0;
        if (snap) {
          const netSnap = snap.turnLog ? { ...snap, turnLog: undefined } : snap;
          this._publishRoom?.({
            type: 'STATE_SYNC', reason: 'JOIN', hostMaxSeq,
            seatOwners: this.seatOwners?.length ? this.seatOwners : undefined,
            snap: netSnap
          }, fromPeerId);
        }
      }
      this._updateDrawerUI();
      this._notifyLobbyUpdate();
      return;
    }

    if (msg.type === 'ROOM_ROSTER') {
      if (this.role === 'guest') {
        this._onGuestConnectedToHost?.(msg.hostPeerId || fromPeerId);
        const listed = Array.isArray(msg.seatOwners) && msg.seatOwners.includes(this.myPeerId);
        if (!listed) this._sendHello?.();
      }
      this.roomCode = msg.roomCode || this.roomCode;
      if (msg.matchName) this.matchName = msg.matchName;
      if (msg.presetName) this.hostPresetName = msg.presetName;
      if (typeof msg.playerCount === 'number') this.hostPlayerCount = msg.playerCount;
      if (msg.matchConfig) this.hostMatchConfig = msg.matchConfig;
      this.hostPeerId = msg.hostPeerId || this.hostPeerId;
      this.seatOwners = msg.seatOwners || [];
      if (Array.isArray(msg.seats)) this.roomSeats = msg.seats;
      if (Array.isArray(msg.peers)) this.peerMeta = new Map(msg.peers);
      if (this.role === 'guest' && this.roomCode) {
        global.MemoryCardManager?.saveJoinedLobbyMatch?.({
          roomCode: this.roomCode,
          matchName: this.matchName,
          presetName: this.hostPresetName,
          playerCount: this.hostPlayerCount,
          matchConfig: this.hostMatchConfig
        });
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
      global.GameState?.showToast?.('💾 Host saved and closed the room.');
      this.leaveRoom();
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
      if (Array.isArray(msg.seatOwners) && msg.seatOwners.length > 0) {
        this.seatOwners = msg.seatOwners.slice();
      }
      const lm = global.TurnLogManager;
      const lp = global.TurnLogPlayer;
      const added = lm?.enqueueIncomingEntries?.(msg.entries || []) || 0;
      if (added > 0) {
        if (msg.targetSnap && lp) lp.deferredTurnSnap = msg.targetSnap;
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

  proto.requestLogCatchUp = function() {
    if (this.role !== 'guest' || !this.isConnected()) return false;
    const afterSeq = global.TurnLogManager?.lastViewedSeq || 0;
    return this._publishRoom?.({ type: 'LOG_SYNC_REQ', afterSeq }, this.hostPeerId || '*');
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
    if (this.role === 'guest' && Array.isArray(seatOwners) && seatOwners.length > 0) {
      this.seatOwners = seatOwners.slice();
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
      if (!global.GameState?.matchStarted && savedLocal && !savedLocal.isLobbyPlaceholder) {
        global.MemoryCardManager?.restorePuzzleState?.({ ...savedLocal, turnPhase: 'MID_TURN' });
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

  // ── PUZZLE BOARD LOCK & TURN-END SYNC HOOKS ───────────────────────────────
  proto.hookPuzzleNetwork = function() {
    if (this._puzzleHooked) return;
    this._puzzleHooked = true;
    const self = this;

    const guardTurn = (fn) => function(...args) {
      if (!self._applyingRemote && self.isConnected() && !self.isLocalPlayersTurn()) {
        global.AudioSynth?.playCancel?.();
        global.GameState?.showToast?.('👀 Spectating — board locked until your turn');
        return false;
      }
      return fn.apply(this, args);
    };

    const g = global.GameState;
    if (g) {
      ['moveDirection', 'rotatePiece', 'placeActiveMaterial', 'confirmPlacementAndExit'].forEach((m) => {
        if (typeof g[m] !== 'function') return;
        const orig = g[m];
        g[m] = guardTurn(function(...args) {
          const res = orig.apply(this, args);
          if (!self._applyingRemote && self.isConnected() && !self.turnOnlySync) {
            if (m === 'moveDirection') self._emit('ACTION', { op: 'MOVE', dir: args[0] });
            else if (m === 'rotatePiece') self._emit('ACTION', { op: 'ROTATE', dir: args[0] });
            else if (m === 'placeActiveMaterial') { self._emit('ACTION', { op: 'PLACE' }); self.syncFullState('PLACE'); }
            else if (m === 'confirmPlacementAndExit') { self._emit('ACTION', { op: 'CONFIRM' }); self.syncFullState('CONFIRM'); }
            self.broadcastCursorThrottled();
          }
          return res;
        });
      });
    }

    if (global.InputController?.handleBoardClick) {
      const origClick = global.InputController.handleBoardClick;
      global.InputController.handleBoardClick = guardTurn(function(sx, sy) {
        const res = origClick.call(this, sx, sy);
        if (!self._applyingRemote && self.isConnected() && !self.turnOnlySync) {
          self._emit('ACTION', { op: 'CLICK', sx, sy });
          self.broadcastCursorThrottled();
        }
        return res;
      });
    }

    if (global.SpellManager?.castSpell) {
      global.SpellManager.castSpell = guardTurn(global.SpellManager.castSpell);
    }

    if (global.UndoManager?.undoLastAction) {
      const origUndo = global.UndoManager.undoLastAction;
      global.UndoManager.undoLastAction = guardTurn(function(...args) {
        const res = origUndo.apply(this, args);
        if (!self._applyingRemote && self.isConnected() && res !== false && !self.turnOnlySync) {
          self._emit('ACTION', { op: 'UNDO' });
          self.syncFullState('UNDO');
        }
        return res;
      });
    }

    if (global.TurnManager?.endTurn) {
      const origEnd = global.TurnManager.endTurn;
      global.TurnManager.endTurn = guardTurn(function(...args) {
        const res = origEnd.apply(this, args);
        if (!self._applyingRemote && self.isConnected() && res !== false && !self.turnOnlySync) {
          self._emit('ACTION', { op: 'END_TURN' });
        }
        return res;
      });
    }

    if (global.TurnManager?.completeRoundAdvancement) {
      const origComplete = global.TurnManager.completeRoundAdvancement;
      global.TurnManager.completeRoundAdvancement = function(...args) {
        const prevIdx = global.GameState?.activePlayerIndex || 0;
        if (self.isSeatLocal(prevIdx)) self.lastLocalActivePlayerIndex = prevIdx;
        const res = origComplete.apply(this, args);
        const curIdx = global.GameState?.activePlayerIndex || 0;
        if (self.isSeatLocal(curIdx)) self.lastLocalActivePlayerIndex = curIdx;
        self._updateDrawerUI();
        return res;
      };
    }

    if (global.MatchOrchestrator?.initMatch) {
      const origInit = global.MatchOrchestrator.initMatch;
      global.MatchOrchestrator.initMatch = function(state, config) {
        const res = origInit.call(this, state, config);
        if (self.role === 'host') {
          self._assignDefaultSeats(config?.playerCount || 1);
          setTimeout(() => self.syncFullState('MATCH_START'), 1600);
        }
        return res;
      };
    }
  };

  /** Invoked at the end of TurnManager Phase E (after tray refill & piece spawn state are finalized). */
  proto.onTurnAdvancementComplete = function() {
    const curIdx = global.GameState?.activePlayerIndex || 0;
    if (this.isSeatLocal(curIdx)) this.lastLocalActivePlayerIndex = curIdx;
    if (!this._applyingRemote && this.isConnected()) {
      this.syncFullState('TURN_END');
    }
    this._updateDrawerUI();
  };

  // ── TUNING DRAWER P2P CONTROLS ────────────────────────────────────────────
  proto._wireDrawerUI = function() {
    const d = document;
    d.getElementById('btn-p2p-host')?.addEventListener('click', () => this.hostRoom());
    d.getElementById('btn-p2p-host-saved')?.addEventListener('click', () => this.hostSavedMatch());
    d.getElementById('btn-p2p-join')?.addEventListener('click', () => {
      const val = d.getElementById('input-p2p-room-code')?.value || '';
      this.joinRoom(val);
    });
    d.getElementById('btn-p2p-pass-host')?.addEventListener('click', () => this.passHost());
    d.getElementById('btn-p2p-leave')?.addEventListener('click', () => this.leaveRoom());
  };

  proto._updateDrawerUI = function() {
    const statusEl = document.getElementById('p2p-status-box');
    if (statusEl) {
      if (this.role === 'offline') {
        statusEl.textContent = 'Status: Offline (Local Mode)';
      } else {
        const turnState = this.isLocalPlayersTurn() ? 'YOUR TURN' : 'SPECTATING (Locked)';
        statusEl.textContent = `Role: ${this.role.toUpperCase()} | Room: ${this.roomCode}\nPeers: ${this.connections.size} | ${turnState}`;
      }
    }
    const gsc = global.GameSettingsCanvas;
    const topTitle = gsc?.history?.length ? gsc.history[gsc.history.length - 1]?.title : '';
    if (gsc?.active && (gsc.mode === 'pause' || !topTitle || topTitle === 'Root' || topTitle === 'Lobby' || topTitle === 'Host' || topTitle === 'Join')) {
      gsc.rebuildTopFrame?.();
    }
  };

  const instance = new global.NetworkP2PManagerClass();
  global.NetworkP2PManager = instance;
  global.ROLL_CALL = global.ROLL_CALL || new Map();
  global.ROLL_CALL.set('Network_P2P_Manager', instance);
})(typeof window !== 'undefined' ? window : this);
