/**
 * @fileoverview cells/hex_ui/Room_Stat_Canvas.js - Multiplayer Room Roster & Searching Stat Canvas
 * @description Pre-match interactive Stat Canvas displaying Host Room Code / Guest "Searching...",
 * live player device pods across Pass-and-Play + Online guests, >6 player red overflow lock,
 * and coordinated Left/Right sidebar controls (Return, Leave, Confirm / Ghosted Waiting).
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

    open(options = {}) {
      if (this.active || this.isAnimating() || !this.containerNode) return;
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
          global.GameSettingsCanvas.openSetupMenu('btn-nav-undo', { silent: true });
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
      if (net?.getRoomSeats) return net.getRoomSeats();
      const cnt = global.GameSettingsCanvas?.config?.playerCount || 1;
      return Array.from({ length: cnt }, (_, i) => ({
        seatIndex: i, playerNum: i + 1, name: `Player ${i + 1}`, deviceName: 'Local', isHost: true
      }));
    }

    syncSidebars(deck) {
      if (!deck) return;
      const net = global.NetworkP2PManager;
      const isHost = net?.role === 'host';
      const seats = this.getSeatList();
      const isOverLimit = seats.length > 6;

      // Left Sidebar: 0=Return (Stay Connected), 1-4=Ghosted, 5=Leave Room (Disconnect)
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

      // Right Sidebar: 0-4=Ghosted, 5=Confirm (Host) / Ghosted Confirm (>6) / Ghosted Waiting (Guest)
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
        const canConfirm = isHost && seats.length >= 1 && !isOverLimit;
        if (t) {
          t.isSidebarButton = true; t.isRightSidebar = true; t.subtitle = ''; t.badge = '';
          if (isHost) {
            t.title = 'Confirm';
            t.hotkey = canConfirm ? 'ENT' : '';
            t.titleColor = canConfirm ? '#4ade80' : '#ff3333';
          } else {
            t.title = 'Waiting';
            t.hotkey = '';
            t.titleColor = '#64748b';
          }
        }
        btnConfirm.setGhost(!canConfirm);
        btnConfirm.setHighlight(canConfirm);
      }
    }

    onReturnPressed() {
      const net = global.NetworkP2PManager;
      if (net && net.role !== 'host' && !net.isConnected() && net.searchingCode) {
        net.leaveRoom();
      }
      this.close({ returnToMenu: true });
    }

    onLeavePressed() {
      const net = global.NetworkP2PManager;
      if (net) {
        if (net.role === 'host') net.closeRoomAndSave();
        else net.leaveRoom();
      }
      if (global.GameSettingsCanvas) {
        global.GameSettingsCanvas.config.lobbyMode = 'Local';
      }
      this.close({ returnToMenu: true });
    }

    onConfirmPressed() {
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
      global.GameState?.showToast?.(`✦ Confirmed Room ${net.roomCode} (${seats.length} Player${seats.length > 1 ? 's' : ''})`);
      this.close({ returnToMenu: true });
    }

    buildScene() {
      if (!this.containerNode) return;
      this.containerNode.children = [];

      const HexNode = global.HexNode, traits = global.HexTraits;
      if (!HexNode || !traits) return;

      const self = this;
      const net = global.NetworkP2PManager;
      const seats = this.getSeatList();
      const isHost = net?.role === 'host';
      const isSearching = !isHost && !(net?.isConnected?.());
      const isOverLimit = seats.length > 6;

      this.containerNode.style.innerHighlight.color = isOverLimit ? '#ff3333' : '#10f000';
      this.containerNode.style.innerHighlight.sharpEdgeColor = isOverLimit ? '#ff3333' : '#10f000';

      const prevScroll = (this._prevScroll !== undefined) ? this._prevScroll : (this.listTrait?.scrollOffset || 0);
      const prevTarget = (this._prevTarget !== undefined) ? this._prevTarget : (this.listTrait?.targetScrollOffset || 0);
      this._prevScroll = undefined; this._prevTarget = undefined;

      const listContainer = new HexNode({
        id: 'room-stat-list-container', position: { x: 0, y: 0 },
        wBase: 960, hBase: 800, apex: 220, orientation: 'flat', clipContent: false,
        style: { bgOpacity: 0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
      });

      this.listTrait = new traits.ListTrait({ slotHeight: 124, spacing: 14, capacity: 4, allowManualScroll: true });
      this.listTrait.scrollOffset = Math.min(0, prevScroll);
      this.listTrait.targetScrollOffset = Math.min(0, prevTarget);
      this.listTrait.layoutChildren = function() {
        if (!this.node || !this.node.children.length) return;
        const items = this.node.children;
        const canvasH = self.containerNode?.dimensions?.hBase || 800;
        let curY = -canvasH * 0.5 + 40 + this.scrollOffset;
        for (let i = 0; i < items.length; i++) {
          const item = items[i], h = item.dimensions?.hBase || 124;
          item.position.x = 0; item.position.y = curY + h * 0.5;
          curY += h + ((i === 0) ? 20 : 14);
        }
        this.node._dirtyGeometry = true;
      };
      this.listTrait.getMaxScroll = function() {
        if (!this.node) return 0;
        const items = this.node.children;
        let totalH = 0;
        for (let i = 0; i < items.length; i++) {
          totalH += (items[i].dimensions?.hBase || 124) + ((i === 0) ? 20 : 14);
        }
        totalH -= 14;
        const canvasH = self.containerNode?.dimensions?.hBase || 800;
        return Math.max(0, totalH - canvasH + 80);
      };
      this.listTrait.handleWheel = function(deltaY) { this.scrollBy(-deltaY * 0.6, false); };

      listContainer.addTrait(this.listTrait);
      listContainer.addTrait({
        name: 'room-scroll-anim',
        render: () => {
          if (self.listTrait) {
            const before = self.listTrait.scrollOffset;
            self.listTrait.update();
            if (Math.abs(self.listTrait.scrollOffset - before) > 0.01) global.BoardRenderer?.render?.();
          }
        }
      });

      // 1. Header Pod (Room Code or Searching...)
      const hdrColor = isOverLimit ? '#ff3333' : (isSearching ? '#3d6eff' : '#10f000');
      const headerPod = new HexNode({
        id: 'room-stat-header-pod', wBase: 640, hBase: 76, apex: 24, orientation: 'flat',
        style: {
          bgColor: 'rgba(7, 12, 24, 0.94)', bgOpacity: 1.0,
          innerHighlight: { enabled: true, color: hdrColor, sharpEdgeColor: hdrColor, spread: 8, intensity: 0.85, steps: 3 }
        }
      });
      if (!isSearching && net?.roomCode) {
        headerPod.addTrait(new traits.ButtonTrait({
          hoverGlowColor: '#10f000',
          onClick: () => {
            if (global.navigator?.clipboard?.writeText) {
              global.navigator.clipboard.writeText(net.roomCode);
              global.GameState?.showToast?.(`📋 Copied Room Code: ${net.roomCode}`);
            }
          }
        }));
      }
      headerPod.addTrait({
        name: 'room-header-render',
        render(ctx) {
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const mainTxt = isSearching
            ? `Searching${net?.searchingCode ? ' (' + net.searchingCode + ')' : '...'}`
            : `Room Code: ${net?.roomCode || '----'}   •   ${seats.length}/6`;
          ctx.font = `400 34px ${fontSciFae}`;
          ctx.fillStyle = isOverLimit ? '#ff6b6b' : '#ffffff';
          ctx.fillText(mainTxt, 0, isSearching && net?.searchStatus ? -11 : 1);
          if (isSearching && net?.searchStatus) {
            ctx.font = '600 13px "Orbitron", "Inter", sans-serif';
            ctx.fillStyle = '#38bdf8';
            ctx.fillText(net.searchStatus, 0, 18);
          }
          ctx.restore();
        }
      });
      listContainer.addChild(headerPod);

      // 2. Player Pods (Borders turn RED if > 6 players)
      seats.forEach((seat, idx) => {
        const podColor = isOverLimit ? '#ff3333' : (seat.isHost ? '#10f000' : '#3d6eff');
        const pod = new HexNode({
          id: `room-stat-player-${idx}`, wBase: 870, hBase: 124, apex: 36, orientation: 'flat',
          style: {
            bgColor: isOverLimit ? 'rgba(35, 10, 14, 0.94)' : 'rgba(7, 12, 24, 0.93)', bgOpacity: 1.0,
            innerHighlight: { enabled: true, color: podColor, sharpEdgeColor: podColor, spread: 8, intensity: 0.85, steps: 3 },
            outerHighlight: { enabled: isOverLimit, color: '#ff3333', sharpEdgeColor: '#ff3333', blur: 10, intensity: 0.70, steps: 3 }
          }
        });
        pod.inert = true;

        const makeTagPod = (id, x, w, col, txt) => {
          const sub = new HexNode({
            id, position: { x, y: 0 }, wBase: w, hBase: 62, apex: 18, orientation: 'flat', inert: true,
            style: {
              bgColor: 'rgba(15, 23, 42, 1.0)', bgOpacity: 1.0,
              innerHighlight: { enabled: true, color: isOverLimit ? '#ff3333' : col, sharpEdgeColor: isOverLimit ? '#ff3333' : col, spread: 6, intensity: 0.75, steps: 3 }
            }
          });
          sub.addTrait({
            name: `${id}-txt`,
            render(ctx) {
              ctx.save();
              ctx.font = `400 32px ${fontSciFae}`;
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillStyle = '#ffffff';
              ctx.fillText(txt, 0, 2);
              ctx.restore();
            }
          });
          return sub;
        };

        const roleTag = seat.isHost ? 'Host' : (seat.ownerPeerId === (net?.myPeerId || 'local') ? 'Local' : (seat.deviceName || 'Player'));
        pod.addChild(makeTagPod(`room-p-num-${idx}`, -155, 420, '#953ffd', `Player ${seat.playerNum}`));
        pod.addChild(makeTagPod(`room-p-role-${idx}`, +220, 290, '#3d6eff', roleTag));
        listContainer.addChild(pod);
      });

      this.listTrait.layoutChildren();
      this.containerNode.addChild(listContainer);
    }
  }

  const instance = new RoomStatCanvasClass();
  global.RoomStatCanvasClass = RoomStatCanvasClass;
  global.RoomStatCanvas = instance;
  global.ROLL_CALL?.set?.('Room_Stat_Canvas', instance);
})(typeof window !== 'undefined' ? window : this);
