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

  proto._broadcast = function(msg) {
    this._publishRoom?.(msg, '*');
  };

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
    const gsc = global.GameSettingsCanvas;
    if (gsc?.active) gsc.rebuildTopFrame?.();
  };

  proto._rebuildSeatRoster = function() {
    if (this.role !== 'host') return this.getRoomSeats();
    const seats = [];
    const owners = [];
    const hostCount = Math.max(1, Math.min(6, this.hostLocalPlayerCount || this.localPlayerCount || 1));
    const hostMeta = this.peerMeta.get(this.myPeerId) || { name: 'Host' };

    for (let i = 0; i < hostCount; i++) {
      const idx = seats.length;
      owners.push(this.myPeerId);
      seats.push({
        seatIndex: idx,
        playerNum: idx + 1,
        name: `Player ${idx + 1}`,
        deviceName: hostMeta.name || 'Host',
        ownerPeerId: this.myPeerId,
        isHost: true
      });
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
        seats.push({
          seatIndex: idx,
          playerNum: idx + 1,
          name: `Player ${idx + 1}`,
          deviceName: meta.name || `Guest`,
          ownerPeerId: pid,
          isHost: false
        });
      }
    });

    this.seatOwners = owners;
    this.roomSeats = seats;
    return seats;
  };

  proto.getRoomSeats = function() {
    if (this.role === 'host') return this._rebuildSeatRoster();
    if (this.role === 'guest' && this.isConnected() && Array.isArray(this.roomSeats) && this.roomSeats.length > 0) {
      return this.roomSeats;
    }
    const cnt = Math.max(1, Math.min(6, this.localPlayerCount || global.GameSettingsCanvas?.config?.playerCount || 1));
    const out = [];
    for (let i = 0; i < cnt; i++) {
      out.push({
        seatIndex: i,
        playerNum: i + 1,
        name: `Player ${i + 1}`,
        deviceName: 'You (Local)',
        ownerPeerId: this.myPeerId || 'local',
        isHost: false
      });
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
      this._sendHello?.();
      this._notifyLobbyUpdate();
    }
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
        if (snap) this._publishRoom?.({ type: 'STATE_SYNC', reason: 'JOIN', snap }, fromPeerId);
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

    if (msg.type === 'STATE_SYNC' && msg.snap) {
      this._applyRemoteStateSync(msg.snap);
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
      if (global.RoomStatCanvas?.isOpen?.()) {
        global.RoomStatCanvas.close({ returnToMenu: false, immediate: true, silent: true });
      }
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
        if (!self._applyingRemote && self.isConnected() && res !== false) {
          if (!self.turnOnlySync) self._emit('ACTION', { op: 'END_TURN' });
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

  /** Transfers live Host authority to another connected peer seamlessly. */
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
    this.pendingHostOfferToPeerId = null;
    this.pendingHostOfferForMe = false;
    if (Array.isArray(msg.seatOwners)) this.seatOwners = msg.seatOwners.slice();
    if (Array.isArray(msg.peers)) this.peerMeta = new Map(msg.peers);

    if (this.myPeerId === nextHost) {
      this.role = 'host';
      if (global.GameState) global.GameState.roleBadge = 'Host';
      this.peerMeta.forEach((_, pid) => {
        if (pid !== this.myPeerId && !this.connections.has(pid)) {
          this.connections.set(pid, { peer: pid, open: true, lastSeen: Date.now() });
        }
      });
      this._rebuildSeatRoster();
      this._broadcastRoster();
      if (msg.snap && global.MemoryCardManager) global.MemoryCardManager.saveActivePuzzleMatch();
      global.GameState?.showToast?.('👑 You are now the Match Host!');
    } else {
      this.role = 'guest';
      if (global.GameState) global.GameState.roleBadge = 'Player';
      if (nextHost) this.connections.set(nextHost, { peer: nextHost, open: true, lastSeen: Date.now() });
      global.GameState?.showToast?.('🔄 Host transferred smoothly');
    }
    this._updateDrawerUI?.();
    this._notifyLobbyUpdate?.();
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
