/**
 * @fileoverview cells/hex_ui/Room_Stat_Canvas_1.1.js - Multiplayer Room Stat Canvas (Scene Builder)
 * @description Renders the RoomStatCanvas header (including Locked & Host Offline states),
 * green-local / blue-remote player roster pods with offline ghosting, and the bottom
 * "Enter Match" button (active when Host online, ghosted when Host offline).
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const Cls = global.RoomStatCanvasClass;
  const proto = Cls?.prototype;
  if (!proto || !Cls._gfx) {
    console.error('[Room_Stat_Canvas_1.1] Load Room_Stat_Canvas_1.0.js first.');
    return;
  }

  const { fontSciFae } = Cls._gfx;

  proto.buildScene = function() {
    if (!this.containerNode) return;
    this.containerNode.children = [];

    const HexNode = global.HexNode, traits = global.HexTraits;
    if (!HexNode || !traits) return;

    const self = this;
    const net = global.NetworkP2PManager;
    const seats = this.getSeatList();
    const isHost = net?.role === 'host';
    const isReentry = this.isSavedReentryMode();
    const isHostOnline = net ? net.isHostOnline() : true;
    const isRoomLocked = !isReentry && !!net?.roomLocked;
    const isSearching = !isHost && !isReentry && !(net?.isConnected?.());
    const isOverLimit = !isReentry && seats.length > 6;

    const frameCol = isOverLimit ? '#ff3333' : (isRoomLocked ? '#ff9214' : '#10f000');
    this.containerNode.style.innerHighlight.color = frameCol;
    this.containerNode.style.innerHighlight.sharpEdgeColor = frameCol;

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

    // 1. Header Pod (Room Code, Locked state, Host Offline, or Searching...)
    const hdrColor = isOverLimit ? '#ff3333' : (isRoomLocked ? '#ff9214' : ((isSearching || (isReentry && !isHostOnline)) ? '#3d6eff' : '#10f000'));
    const headerPod = new HexNode({
      id: 'room-stat-header-pod', wBase: 640, hBase: 76, apex: 24, orientation: 'flat',
      style: {
        bgColor: 'rgba(7, 12, 24, 0.94)', bgOpacity: 1.0,
        innerHighlight: { enabled: true, color: hdrColor, sharpEdgeColor: hdrColor, spread: 8, intensity: 0.85, steps: 3 }
      }
    });
    const codeText = net?.roomCode || this.savedMatch?.roomCode || '----';
    if (!isSearching && codeText && codeText !== '----') {
      headerPod.addTrait(new traits.ButtonTrait({
        hoverGlowColor: hdrColor,
        onClick: () => {
          if (global.navigator?.clipboard?.writeText) {
            global.navigator.clipboard.writeText(codeText);
            global.GameState?.showToast?.(`📋 Copied Room Code: ${codeText}`);
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
        let mainTxt = `Room Code: ${codeText}   •   ${seats.length}/6`;
        let subTxt = net?.searchStatus || '';
        let subCol = '#38bdf8';

        if (isSearching) {
          mainTxt = `Searching${net?.searchingCode ? ' (' + net.searchingCode + ')' : '...'}`;
        } else if (isRoomLocked) {
          mainTxt = `Room ${codeText}   •   LOCKED`;
          subTxt = 'Host is finalizing match settings';
          subCol = '#ff9214';
        } else if (isReentry && !isHostOnline) {
          mainTxt = `Room ${codeText}   •   Host Offline`;
          subTxt = 'Waiting for Host to open room...';
          subCol = '#fbbf24';
        } else if (isReentry && isHostOnline) {
          const title = net?.matchName || self.savedMatch?.matchName || `Room ${codeText}`;
          mainTxt = `${title}   •   ${codeText}`;
          subTxt = 'Host Online — Press Confirm';
          subCol = '#4ade80';
        }

        if (subTxt && (subTxt.includes('Dropped') || subTxt.includes('Error') || subTxt.includes('Offline'))) {
          subCol = '#fbbf24';
        }
        ctx.font = `400 34px ${fontSciFae}`;
        ctx.fillStyle = isOverLimit ? '#ff6b6b' : (isRoomLocked ? '#ffcf87' : '#ffffff');
        ctx.fillText(mainTxt, 0, subTxt ? -11 : 1);
        if (subTxt) {
          ctx.font = '600 13px "Orbitron", "Inter", sans-serif';
          ctx.fillStyle = subCol;
          ctx.fillText(subTxt, 0, 18);
        }
        ctx.restore();
      }
    });
    listContainer.addChild(headerPod);

    // 2. Player Pods (Green #10f000 = Local device, Blue #3d6eff = Remote device, Ghosted = Offline)
    const spCfg = global.GameSettingsCanvas?.subPodConfig || {};
    const subY = spCfg.presetRowY ?? 0;
    const subH = spCfg.presetHeight ?? 62;
    const subApex = spCfg.presetApex ?? 18;
    const leftW = spCfg.presetNameW ?? 530;
    const rightW = spCfg.presetTagW ?? 230;
    const subGap = spCfg.presetSpacing ?? 48;
    const totalSpan = leftW + subGap + rightW;
    const leftX = -totalSpan * 0.5 + leftW * 0.5;
    const rightX = totalSpan * 0.5 - rightW * 0.5;
    const leftSize = spCfg.presetNameTextSize ?? 32;
    const leftTextY = spCfg.presetNameTextY ?? 2;
    const rightSize = spCfg.presetTagTextSize ?? 32;
    const rightTextY = spCfg.presetTagTextY ?? 2;

    seats.forEach((seat, idx) => {
      const seatIdx = (seat.seatIndex !== undefined) ? seat.seatIndex : idx;
      const isLocalSeat = !net || net.role === 'offline' || net.isSeatLocal(seatIdx);
      const isSeatOnline = !net || net.role === 'offline' || net.isSeatOnline(seatIdx);
      const podColor = isOverLimit ? '#ff3333' : (isLocalSeat ? '#10f000' : '#3d6eff');

      const pod = new HexNode({
        id: `room-stat-player-${idx}`, wBase: 870, hBase: 124, apex: 36, orientation: 'flat',
        style: {
          bgColor: isOverLimit ? 'rgba(35, 10, 14, 0.94)' : 'rgba(7, 12, 24, 0.93)', bgOpacity: 1.0,
          innerHighlight: { enabled: true, color: podColor, sharpEdgeColor: podColor, spread: 8, intensity: 0.85, steps: 3 },
          outerHighlight: { enabled: isOverLimit, color: '#ff3333', sharpEdgeColor: '#ff3333', blur: 10, intensity: 0.70, steps: 3 }
        }
      });
      pod.inert = true;

      const makeTagPod = (id, x, w, col, txt, fSize, tY) => {
        const sub = new HexNode({
          id, position: { x, y: subY }, wBase: w, hBase: subH, apex: subApex, orientation: 'flat', inert: true,
          style: {
            bgColor: 'rgba(15, 23, 42, 1.0)', bgOpacity: 1.0,
            innerHighlight: { enabled: true, color: isOverLimit ? '#ff3333' : col, sharpEdgeColor: isOverLimit ? '#ff3333' : col, spread: 6, intensity: 0.75, steps: 3 }
          }
        });
        sub.addTrait({
          name: `${id}-txt`,
          render(ctx) {
            ctx.save();
            ctx.font = `400 ${fSize}px ${fontSciFae}`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
            ctx.fillText(txt, 0.5, tY + 0.5);
            ctx.fillStyle = isSeatOnline ? '#ffffff' : '#94a3b8';
            ctx.fillText(txt, 0, tY);
            ctx.restore();
          }
        });
        return sub;
      };

      const roleTag = seat.isHost ? 'Host' : 'Guest';
      pod.addChild(makeTagPod(`room-p-num-${idx}`, leftX, leftW, '#953ffd', `Player ${seat.playerNum || (idx + 1)}`, leftSize, leftTextY));
      pod.addChild(makeTagPod(`room-p-role-${idx}`, rightX, rightW, '#3d6eff', roleTag, rightSize, rightTextY));
      if (!isSeatOnline) pod.setGhost(true);
      listContainer.addChild(pod);
    });

    this.listTrait.layoutChildren();
    this.containerNode.addChild(listContainer);
  };

  global.ROLL_CALL?.set?.('Room_Stat_Canvas_1.1', global.RoomStatCanvas);
})(typeof window !== 'undefined' ? window : this);
