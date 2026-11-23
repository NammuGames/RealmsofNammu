/**
 * @fileoverview cells/hex_ui/Room_Stat_Canvas_1.0.js - Multiplayer Room Stat Canvas (Lifecycle & Actions)
 * @description Core class, open/close lifecycle, pre-match lobby vs saved-match re-entry modes,
 * room lock on Host Confirm, Enter Match action, and coordinated Left/Right sidebar sync.
 * (Scene builder lives in Room_Stat_Canvas_1.1.js).
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const fontSciFae = '"Sci-Fae", "SciFaePseudoScript10", sans-serif';

  class RoomStatCanvasClass {
    constructor() {
      this.engine = null;
      this.containerNode = null;
      this.listTrait = null;
      this.active = false;
      this.mode = 'lobby'; // 'lobby' | 'saved_reentry'
      this.savedMatch = null;
      this._originId = 'btn-nav-menu';
      this._prevScroll = 0;
      this._prevTarget = 0;
    }

    init(engine) {
      this.engine = engine;
      const HexNode = global.HexNode;
      if (!HexNode) return false;

      this.containerNode = new HexNode({
        id: 'room-stat-canvas-frame',
        wBase: 960, hBase: 800, apex: 220, orientation: 'flat', clipContent: true,
        style: {
          bgColor: 'rgba(5, 10, 20, 0.96)', bgOpacity: 0.96,
          innerHighlight: { enabled: true, color: '#10f000', sharpEdgeColor: '#10f000', spread: 8, intensity: 0.80, steps: 3 },
          outerHighlight: { enabled: false, color: '#0284c7', blur: 24, intensity: 0.50 }
        }
      });
      this.containerNode.visible = false;
      this.containerNode.onResize = () => { if (this.active) this.buildScene(); };
      return true;
    }

    isAnimating() { return !!this.containerNode?.animating; }
    isOpen() { return this.active || this.isAnimating(); }

    isSavedReentryMode() {
      const net = global.NetworkP2PManager;
      return this.mode === 'saved_reentry' || !!net?._isMatchActive?.();
    }

    canEnterMatch() {
      if (!this.isSavedReentryMode()) return false;
      const net = global.NetworkP2PManager;
      if (!net || net.role === 'offline') return true;
      if (net.role === 'host') return true;
      return !!net.isHostOnline?.();
    }

    open(options = {}) {
      if (!this.containerNode) return;
      const net = global.NetworkP2PManager;
      const nextMode = options.mode || (net?._isMatchActive?.() ? 'saved_reentry' : 'lobby');
      if (options.savedMatch !== undefined) this.savedMatch = options.savedMatch;

      if (this.active) {
        this.mode = nextMode;
        this.refreshIfOpen();
        return;
      }
      if (this.isAnimating()) return;

      const gsc = global.GameSettingsCanvas;
      if (gsc?.isOpen?.()) {
        gsc.active = false;
        gsc._joiningRoom = false;
        if (gsc.containerNode) gsc.containerNode.visible = false;
        if (Array.isArray(gsc.history) && gsc.history.length > 1) {
          for (let i = 1; i < gsc.history.length; i++) {
            const f = gsc.history[i]?.frame;
            if (f && f.parent === gsc.containerNode) gsc.containerNode.removeChild(f);
          }
          gsc.history = [gsc.history[0]];
        }
      }

      this.mode = nextMode;
      // Re-opening RoomStatCanvas as Host pre-launch unlocks the room so new guests can join
      if (this.mode === 'lobby' && net?.role === 'host' && net.roomLocked && !net._isMatchActive?.()) {
        net.setRoomLocked?.(false);
      }

      this.active = true;
      this._originId = options.origin || 'btn-nav-menu';
      this._prevScroll = 0;
      this._prevTarget = 0;
      if (this.engine?.setStudioOverlay) this.engine.setStudioOverlay(this.containerNode);
      this.containerNode.visible = true;
      this.buildScene();

      if (!options.skipAnim && global.TweenOrchestrator?.expandFrame) {
        global.TweenOrchestrator.expandFrame(this.containerNode, this._originId);
      } else {
        this.containerNode.scale = 1.0;
        this.containerNode.alpha = 1.0;
        this.containerNode.contentAlpha = 1.0;
      }
      if (!options.silent) global.AudioSynth?.playClick?.();
      global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
      global.BoardRenderer?.render?.();
    }

    close(options = {}) {
      if ((!this.active && !this.containerNode?.visible) || this.isAnimating()) return;
      const returnToMenu = options.returnToMenu !== false;
      this.active = false;
      this._prevScroll = 0;
      this._prevTarget = 0;

      const finish = () => {
        if (this.containerNode) {
          this.containerNode.visible = false;
          this.containerNode.children = [];
          this.containerNode.invalidateCache?.();
        }
        if (this.engine?.studioOverlay === this.containerNode) {
          this.engine.setStudioOverlay(null);
        }
        if (returnToMenu && global.GameSettingsCanvas) {
          const openOpts = { silent: true };
          if (options.returnToPage) openOpts.initialColumn = options.returnToPage;
          global.GameSettingsCanvas.openSetupMenu('btn-nav-undo', openOpts);
        }
        global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
        global.BoardRenderer?.render?.();
        if (typeof options.onDone === 'function') options.onDone();
      };

      if (!options.silent) global.AudioSynth?.playClick?.();
      if (!options.immediate && global.TweenOrchestrator?.collapseFrame && this.containerNode?.visible) {
        global.TweenOrchestrator.collapseFrame(this.containerNode, this._originId || 'btn-nav-undo', { onComplete: finish });
      } else {
        finish();
      }
    }

    refreshIfOpen() {
      if (!this.active) return;
      if (this.listTrait) {
        this._prevScroll = this.listTrait.scrollOffset || 0;
        this._prevTarget = this.listTrait.targetScrollOffset || 0;
      }
      this.buildScene();
      global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
      global.BoardRenderer?.render?.();
    }

    getSeatList() {
      const net = global.NetworkP2PManager;
      const live = net?.getRoomSeats?.();
      if (Array.isArray(live) && live.length > 0) return live;
      const savedSeats = this.savedMatch?.rosterMeta?.roomSeats;
      if (Array.isArray(savedSeats) && savedSeats.length > 0) return savedSeats;
      const cnt = this.savedMatch?.playerCount || global.GameSettingsCanvas?.config?.playerCount || 1;
      return Array.from({ length: cnt }, (_, i) => ({
        seatIndex: i, playerNum: i + 1, name: `Player ${i + 1}`, deviceName: 'Local', ownerPeerId: net?.myPeerId || 'local', isHost: i === 0
      }));
    }

    syncSidebars(deck) {
      if (!deck) return;
      const net = global.NetworkP2PManager;
      const isHost = net?.role === 'host';
      const isReentry = this.isSavedReentryMode();
      const seats = this.getSeatList();
      const isOverLimit = !isReentry && seats.length > 6;

      // Left Sidebar: 0=Return, 1-4=Ghosted, 5=Leave (never deletes saved match cards)
      const btnRet = deck.leftButtonNodes?.[0];
      if (btnRet) {
        const t = btnRet.getTrait('text');
        if (t) { t.title = 'Return'; t.hotkey = 'ESC'; t.subtitle = ''; t.badge = ''; t.isSidebarButton = true; t.isRightSidebar = false; t.titleColor = '#38bdf8'; }
        btnRet.setGhost(false);
        btnRet.setHighlight(false);
      }
      for (let i = 1; i <= 4; i++) {
        const b = deck.leftButtonNodes?.[i];
        if (b) { b.setGhost(true); b.setHighlight(false); const t = b.getTrait('text'); if (t) t.titleColor = '#64748b'; }
      }
      const btnLeave = deck.leftButtonNodes?.[5];
      if (btnLeave) {
        const t = btnLeave.getTrait('text');
        if (t) { t.title = 'Leave'; t.hotkey = ''; t.subtitle = ''; t.badge = ''; t.isSidebarButton = true; t.isRightSidebar = false; t.titleColor = '#ff3333'; }
        btnLeave.setGhost(false);
        btnLeave.setHighlight(false);
      }

      // Right Sidebar: 0-4=Ghosted, 5=Confirm / Enter / Waiting / Locked
      for (let i = 0; i <= 4; i++) {
        const b = deck.rightButtonNodes?.[i];
        if (b) {
          b.setGhost(true); b.setHighlight(false);
          const t = b.getTrait('text');
          if (t) t.titleColor = '#64748b';
        }
      }
      const btnConfirm = deck.rightButtonNodes?.[5];
      if (btnConfirm) {
        const t = btnConfirm.getTrait('text');
        let canAction = false;
        if (t) {
          t.isSidebarButton = true; t.isRightSidebar = true; t.subtitle = ''; t.badge = '';
          if (isReentry) {
            canAction = this.canEnterMatch();
            t.title = 'Confirm';
            t.hotkey = canAction ? 'ENT' : '';
            t.titleColor = canAction ? '#4ade80' : '#64748b';
          } else if (isHost) {
            canAction = seats.length >= 1 && !isOverLimit;
            t.title = 'Confirm';
            t.hotkey = canAction ? 'ENT' : '';
            t.titleColor = canAction ? '#4ade80' : '#ff3333';
          } else {
            t.title = net?.roomLocked ? 'Locked' : 'Waiting';
            t.hotkey = '';
            t.titleColor = net?.roomLocked ? '#ff9214' : '#64748b';
          }
        }
        btnConfirm.setGhost(!canAction);
        btnConfirm.setHighlight(canAction);
      }
    }

    onReturnPressed() {
      const wasReentry = this.isSavedReentryMode();
      const net = global.NetworkP2PManager;
      if (net) {
        if (net.role === 'host') net.closeRoomAndSave?.();
        else if (wasReentry || net.role === 'guest' || net.searchingCode) net.leaveRoom?.();
      }
      if (global.GameSettingsCanvas) {
        global.GameSettingsCanvas.config.lobbyMode = 'Local';
        if (wasReentry) global.GameSettingsCanvas.selectedSavedMatchId = null;
      }
      this.savedMatch = null;
      this.mode = 'lobby';
      this.close({ returnToMenu: true, returnToPage: 'Lobby' });
    }

    onLeavePressed() {
      const wasReentry = this.isSavedReentryMode();
      const net = global.NetworkP2PManager;
      if (net) {
        if (net.role === 'host') net.closeRoomAndSave?.();
        else net.leaveRoom?.();
      }
      if (global.GameSettingsCanvas) {
        global.GameSettingsCanvas.config.lobbyMode = 'Local';
        if (wasReentry) global.GameSettingsCanvas.selectedSavedMatchId = null;
      }
      this.savedMatch = null;
      this.mode = 'lobby';
      this.close({ returnToMenu: true, returnToPage: 'Lobby' });
    }

    onConfirmPressed() {
      if (this.isSavedReentryMode()) {
        if (!this.canEnterMatch()) {
          global.AudioSynth?.playCancel?.();
          global.GameState?.showToast?.('⏳ Waiting for Host to come online...');
          return;
        }
        this.close({ returnToMenu: true, returnToPage: 'Lobby' });
        return;
      }
      const net = global.NetworkP2PManager;
      if (net?.role !== 'host') return;
      const seats = this.getSeatList();
      if (seats.length > 6) {
        global.AudioSynth?.playCancel?.();
        global.GameState?.showToast?.('⚠️ Max 6 players! Reduce local player count to confirm.');
        return;
      }
      if (global.GameSettingsCanvas) {
        global.GameSettingsCanvas.config.lobbyMode = 'Online';
      }
      net.setRoomLocked?.(true);
      global.GameState?.showToast?.(`🔒 Locked Room ${net.roomCode} (${seats.length} Player${seats.length > 1 ? 's' : ''})`);
      this.close({ returnToMenu: true, returnToPage: 'Lobby' });
    }
  }

  RoomStatCanvasClass._gfx = { fontSciFae };

  const instance = new RoomStatCanvasClass();
  global.RoomStatCanvasClass = RoomStatCanvasClass;
  global.RoomStatCanvas = instance;
  global.ROLL_CALL?.set?.('Room_Stat_Canvas_1.0', instance);
})(typeof window !== 'undefined' ? window : this);
