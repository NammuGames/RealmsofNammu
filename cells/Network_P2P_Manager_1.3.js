/**
 * @fileoverview cells/Network_P2P_Manager_1.3.js - Puzzle Turn Locks, Synced Start & Drawer UI (Part 4/4)
 * @description Attaches puzzle board turn-lock hooks, synchronized online Match-Start init
 * broadcast/replay, Phase E turn-end sync trigger, Tuning Drawer P2P controls, and singleton export.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const proto = global.NetworkP2PManagerClass?.prototype;
  if (!proto) {
    console.error('[Network_P2P_Manager_1.3] Load Network_P2P_Manager_1.0.js first.');
    return;
  }

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
      global.MatchOrchestrator.initMatch = function(state, config, options = {}) {
        if (self.role === 'host' && !options?.fromRemote) {
          self._assignDefaultSeats(config?.playerCount || 1);
        }
        return origInit.call(this, state, config, options);
      };
    }
  };

  /** Broadcasts pre-determined Turn 0/1 match setup so all peers animate menu shrink + spawns together. */
  proto.broadcastMatchStartInit = function(initData = {}) {
    if (this.role !== 'host' || this._applyingRemote || !this.isConnected()) return;
    const mc = global.MemoryCardManager;
    const matchId = mc?.activeMatchId || `match_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    if (mc) mc.activeMatchId = matchId;
    const syncId = `${this.myPeerId}:${++this._syncSeq}`;
    const payload = {
      type: 'MATCH_START_INIT', sender: this.myPeerId, syncId, matchId, roomCode: this.roomCode,
      seatOwners: this.seatOwners?.length ? this.seatOwners : undefined, ...initData
    };
    this._publishRoom?.(payload, '*');
  };

  proto._applyRemoteMatchStartInit = async function(msg) {
    if (Array.isArray(msg.seatOwners) && msg.seatOwners.length > 0) this.seatOwners = msg.seatOwners.slice();
    if (global.HubGameLoader?.activeGameId !== 'puzzle') await global.HubGameLoader?.launchGame?.('puzzle');
    if (global.MemoryCardManager && msg.matchId) global.MemoryCardManager.activeMatchId = msg.matchId;
    this._applyingRemote = true;
    try {
      const startAnimated = () => {
        global.MatchOrchestrator?.initMatch?.(global.GameState, msg.config, { preRolled: msg, fromRemote: true });
        this._updateDrawerUI();
      };
      if (global.RoomStatCanvas?.isOpen?.()) {
        global.RoomStatCanvas.close({ returnToMenu: false, immediate: false, silent: true, onDone: startAnimated });
      } else if (global.GameSettingsCanvas?.isOpen?.()) {
        global.GameSettingsCanvas.close(startAnimated);
      } else {
        startAnimated();
      }
    } finally { this._applyingRemote = false; }
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
