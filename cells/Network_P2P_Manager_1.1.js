/**
 * @fileoverview cells/Network_P2P_Manager_1.1.js - Live Sync Protocol, Spectator Locks & Drawer UI (Part 2/2)
 * @description Attaches message routing, live cursor/action replay, private-spectator board
 * locks, authoritative state sync hooks, and Tuning Drawer P2P UI onto NetworkP2PManagerClass.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const proto = global.NetworkP2PManagerClass?.prototype;
  if (!proto) {
    console.error('[Network_P2P_Manager_1.1] Load Network_P2P_Manager_1.0.js first.');
    return;
  }

  // ── MESSAGE DISPATCH & REMOTE REPLAY ──────────────────────────────────────
  proto._handleMessage = function(fromPeerId, msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'HELLO' && this.role === 'host') {
      const seatIdx = this.seatOwners.findIndex(id => !id);
      const assigned = seatIdx !== -1 ? seatIdx : this.seatOwners.length;
      this.seatOwners[assigned] = fromPeerId;
      this.peerMeta.set(fromPeerId, { name: msg.name || `Player ${assigned + 1}`, seatIndex: assigned });
      this._broadcastRoster();
      this._updateDrawerUI();
      return;
    }

    if (msg.type === 'ROOM_ROSTER') {
      this.roomCode = msg.roomCode || this.roomCode;
      if (msg.matchName) this.matchName = msg.matchName;
      this.hostPeerId = msg.hostPeerId || this.hostPeerId;
      this.seatOwners = msg.seatOwners || [];
      if (Array.isArray(msg.peers)) this.peerMeta = new Map(msg.peers);
      this._updateDrawerUI();
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
      if (this.role === 'host') this._broadcast(msg, fromPeerId);
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
      if (this.role === 'host') this._broadcast(msg, fromPeerId);
      this._applyCursorState(msg);
      return;
    }

    if (msg.type === 'ACTION') {
      if (this.role === 'host') this._broadcast(msg, fromPeerId);
      this._applyRemoteAction(msg);
      return;
    }

    if (msg.type === 'STATE_SYNC' && msg.snap) {
      if (this.role === 'host') this._broadcast(msg, fromPeerId);
      this._applyRemoteStateSync(msg.snap);
    }
  };

  proto._emit = function(type, payload = {}) {
    if (!this.isConnected() || this._applyingRemote) return;
    const msg = { type, sender: this.myPeerId, ...payload };
    if (this.role === 'host') {
      this._broadcast(msg);
    } else {
      const hostConn = this.connections.get(this.hostPeerId) || Array.from(this.connections.values())[0];
      if (hostConn?.open) hostConn.send(msg);
    }
  };

  proto.broadcastCursorThrottled = function() {
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

  proto.syncFullState = function(reason = 'TURN') {
    if (!this.isConnected() || this._applyingRemote) return;
    const snap = global.MemoryCardManager?.saveActivePuzzleMatch?.();
    if (snap) this._emit('STATE_SYNC', { reason, snap });
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

  proto._applyRemoteStateSync = async function(snap) {
    if (global.HubGameLoader?.activeGameId !== 'puzzle') {
      await global.HubGameLoader?.launchGame?.('puzzle');
    }
    this._applyingRemote = true;
    try {
      global.MemoryCardManager?.restorePuzzleState?.(snap);
      global.MemoryCardManager?.saveActivePuzzleMatch?.(snap.id);
      this._updateDrawerUI();
    } finally { this._applyingRemote = false; }
  };

  // ── PUZZLE BOARD LOCK & LIVE STREAM HOOKS ─────────────────────────────────
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
          if (!self._applyingRemote && self.isConnected()) {
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
        if (!self._applyingRemote && self.isConnected()) {
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
        if (!self._applyingRemote && self.isConnected() && res !== false) {
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
        if (!self._applyingRemote && self.isConnected() && res !== false) {
          self._emit('ACTION', { op: 'END_TURN' });
          setTimeout(() => { self.syncFullState('TURN_END'); self._updateDrawerUI(); }, 350);
        }
        return res;
      });
    }

    if (global.TurnManager?.completeRoundAdvancement) {
      const origComplete = global.TurnManager.completeRoundAdvancement;
      global.TurnManager.completeRoundAdvancement = function(...args) {
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
