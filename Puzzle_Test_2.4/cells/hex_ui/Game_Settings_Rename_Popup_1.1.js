/**
 * @fileoverview cells/hex_ui/Game_Settings_Rename_Popup_1.1.js - Rename Pop-Up Confirmation, Input & Scene
 * @description Implements cascade confirmation, keyboard binding, and HexNode modal scene construction
 * on GameSettingsRenamePopupClass.prototype.
 */

(function(global) {
  'use strict';

  const GameSettingsRenamePopupClass = global.GameSettingsRenamePopupClass;
  if (!GameSettingsRenamePopupClass) return;

  const { WIDE_CHARS, getWeightedLength, DEFAULT_POPUP_CONFIG } = GameSettingsRenamePopupClass._text;
  const proto = GameSettingsRenamePopupClass.prototype;

  proto.applyCascadeAndConfirm = function(targetNum) {
    const list = this.presetList || global.GameSettingsCanvas?.getCurrentDraft?.()?.list || null;
    const draft = global.GameSettingsCanvas?.getCurrentDraft?.();
    let shiftCount = 0;
    if (list && Array.isArray(list)) {
      let curr = targetNum;
      const shiftChain = [];
      while (true) {
        const occupied = list.find(p => {
          if (!p || p === this.targetItem) return false;
          if (draft?.draftItem === this.targetItem && (p === draft.targetItem || p === draft.targetPreset)) return false;
          if (p.id && this.targetItem?.id && p.id === this.targetItem.id) return false;
          const pNum = parseInt(p.tagNumber != null ? p.tagNumber : '', 10);
          return !isNaN(pNum) && pNum === curr;
        });
        if (!occupied) break;
        shiftChain.push(occupied);
        curr++;
      }
      shiftCount = shiftChain.length;
      for (let i = shiftChain.length - 1; i >= 0; i--) {
        const item = shiftChain[i];
        const oldNum = parseInt(item.tagNumber, 10) || 0;
        item.tagNumber = String(oldNum + 1).padStart(3, '0').slice(-3);
      }
      if (global.GameSettingsCanvas?.sortPresetList) global.GameSettingsCanvas.sortPresetList(list);
    }
    if (this.targetItem) this.targetItem.tagNumber = String(targetNum).padStart(3, '0').slice(-3);
    this.rawTagBuffer = null;
    this.close(true);
    if (shiftCount > 0) {
      global.GameState?.showToast?.(`✦ Slot #${String(targetNum).padStart(3, '0')} assigned (pushed ${shiftCount} down)`);
    }
  };

  proto.confirm = function() {
    if (!this.active) return;
    if (this.mode === 'roomCode') {
      const code = String(this.targetItem?.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      if (code.length < 4) {
        if (global.AudioSynth?.playDetonateChime) global.AudioSynth.playDetonateChime(1);
        global.GameState?.showToast?.('⚠️ Enter a 4-character Room Code!');
        this._focusMobileInput?.();
        return;
      }
      this.targetItem.name = code;
      this.close(true);
      return;
    }
    this.finalizeNameInput();
    this.finalizeTagInput();
    const candTag = this.getCurrentCandidateTag();
    if (!candTag || parseInt(candTag, 10) === 0) {
      global.GameState?.showToast?.('⚠️ Please enter a valid preset number (1-999)!');
      return;
    }
    const candNum = parseInt(candTag, 10);
    if (this.isDefaultSlot(candNum)) {
      if (global.AudioSynth?.playDetonateChime) global.AudioSynth.playDetonateChime(1);
      global.GameState?.showToast?.('⚠️ Slots 001, 002, and 003 are reserved for default presets!');
      return;
    }
    if (this.isTagDuplicate()) {
      if (global.TurnConfirmPopup?.open) {
        global.TurnConfirmPopup.open(() => this.applyCascadeAndConfirm(candNum), {
          title: 'Replace Slot', topText: 'Number Slot Is Taken', bottomText: 'Replace?', bottomW: 260, frameColor: '#ff3333'
        });
      } else {
        this.applyCascadeAndConfirm(candNum);
      }
      return;
    }
    this.close();
  };

  proto.triggerRender = function() {
    if (global.GameSettingsCanvas?.buildScene) {
      global.GameSettingsCanvas.buildScene();
    } else if (global.BoardRenderer?.render) {
      global.BoardRenderer.render();
    }
  };

  proto.bindKeyboard = function() {
    this.unbindKeyboard();
    this.keyHandler = (e) => {
      if (!this.active || !this.targetItem) return;
      if (this._mobileInput && e.target === this._mobileInput) return;
      e.stopPropagation();

      if (e.key === 'Escape') {
        e.preventDefault();
        this.cancel();
        return;
      }

      if (this.mode === 'roomCode') {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.confirm();
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          this.targetItem.name = (this.targetItem.name || '').slice(0, -1);
          if (this._mobileInput) this._mobileInput.value = this.targetItem.name;
          if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
          this.triggerRender();
        } else if (/^[a-zA-Z0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          const cur = (this.targetItem.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (cur.length < 4) {
            this.targetItem.name = cur + e.key.toUpperCase();
            if (this._mobileInput) this._mobileInput.value = this.targetItem.name;
            if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
            this.triggerRender();
          }
        }
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        if (this.activeField === 'tag') this.finalizeTagInput();
        this.activeField = (this.activeField === 'name') ? 'tag' : 'name';
        if (this.activeField === 'tag' && this.rawTagBuffer === null) {
          this.rawTagBuffer = String(parseInt(this.targetItem.tagNumber || this.defaultNum, 10) || '');
        }
        if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
        this.triggerRender();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirm();
        return;
      }

      if (this.activeField === 'name') {
        if (e.key === 'Backspace') {
          e.preventDefault();
          this.targetItem.name = (this.targetItem.name || '').slice(0, -1);
          if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
          this.triggerRender();
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          const addW = WIDE_CHARS.has(e.key) ? 1.6 : 1;
          if (getWeightedLength(this.targetItem.name) + addW <= 30.001) {
            this.targetItem.name = (this.targetItem.name || '') + e.key;
            if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
            this.triggerRender();
          }
        }
      } else if (this.activeField === 'tag') {
        if (e.key === 'Backspace') {
          e.preventDefault();
          if (this.rawTagBuffer === null) {
            this.rawTagBuffer = String(parseInt(this.targetItem.tagNumber || this.defaultNum, 10) || '');
          }
          this.rawTagBuffer = this.rawTagBuffer.slice(0, -1);
          if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
          this.triggerRender();
        } else if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          if (this.rawTagBuffer === null) {
            this.rawTagBuffer = e.key;
          } else if (this.rawTagBuffer.length < 3) {
            this.rawTagBuffer += e.key;
          }
          if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
          this.triggerRender();
        }
      }
    };
    window.addEventListener('keydown', this.keyHandler, true);
  };

  proto.unbindKeyboard = function() {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler, true);
      this.keyHandler = null;
    }
  };

  proto.buildNode = function() {
    if (this.frameNode && this.frameNode.animating) return this.frameNode;
    if (!this.active || !this.targetItem) return null;
    const self = this;
    const HexNode = global.HexNode, traits = global.HexTraits;
    if (!HexNode || !traits) return null;

    const isRoomMode = (this.mode === 'roomCode');
    const handleRoomTap = () => {
      const code = String(self.targetItem?.name || '').replace(/[^A-Za-z0-9]/g, '');
      if (code.length >= 4) {
        self.confirm();
      } else {
        self._focusMobileInput?.();
      }
    };

    // Pop-Up Frame: Exact Sigil Instructions text frame dimensions (733x380, apex 116)
    const frame = new HexNode({
      id: 'rename-popup-frame', position: { x: 0, y: 0 },
      wBase: 733, hBase: 380, apex: 116, orientation: 'flat',
      style: {
        bgColor: 'rgba(5, 10, 20, 0.96)', bgOpacity: 0.96,
        innerHighlight: { enabled: true, color: '#10f000', sharpEdgeColor: '#10f000', spread: 8, intensity: 0.80, steps: 3 },
        outerHighlight: { enabled: false }
      }
    });
    frame.isCustomSized = true;
    frame.addTrait(new traits.ButtonTrait({
      hoverOutline: false, soundClick: false,
      onClick: () => {
        if (isRoomMode) { handleRoomTap(); return; }
        self.finalizeTagInput();
        self.activeField = null;
        self.triggerRender();
      }
    }));

    const cfg = this.config || DEFAULT_POPUP_CONFIG;
    const pH = cfg.height ?? 83, pApex = cfg.apex ?? 24, rowY = cfg.rowY ?? 0;
    const ySpacing = cfg.ySpacing ?? 60, topW = cfg.topW ?? 338, bottomW = cfg.bottomW ?? 338;
    const textSize = cfg.textSize ?? 34, textY = cfg.textY ?? 2;

    // Helper for Sigil Instructions title bar dimensions
    const makeSubPod = (id, y, w, baseCol, activeCol, fieldKey, getTxt) => {
      const isFoc = (self.activeField === fieldKey);
      const isDup = (fieldKey === 'tag' && self.isTagDuplicate());
      let col = isFoc ? activeCol : baseCol;
      if (isDup) col = '#ff3333';
      const pod = new HexNode({
        id, position: { x: 0, y }, wBase: w, hBase: pH, apex: pApex, orientation: 'flat',
        style: {
          bgColor: isDup ? 'rgba(35, 12, 16, 1.0)' : (isFoc ? 'rgba(20, 30, 55, 1.0)' : 'rgba(15, 23, 42, 1.0)'),
          bgOpacity: 1.0,
          innerHighlight: { enabled: true, color: col, sharpEdgeColor: col, spread: isFoc ? 8 : 6, intensity: isFoc ? 0.95 : 0.75, steps: 3 }
        }
      });
      pod.isSidebarButton = true;
      pod.addTrait(new traits.ButtonTrait({
        onClick: () => {
          if (isRoomMode) { handleRoomTap(); return; }
          if (self.activeField === 'tag' && fieldKey !== 'tag') {
            self.finalizeTagInput();
          }
          self.activeField = fieldKey;
          if (fieldKey === 'tag' && self.rawTagBuffer === null) {
            self.rawTagBuffer = String(parseInt(self.targetItem.tagNumber || self.defaultNum, 10) || '');
          }
          if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
          self.triggerRender();
        }
      }));
      pod.addTrait({
        name: `${id}-render`,
        render(ctx) {
          ctx.save();
          ctx.font = `400 ${textSize}px "Sci-Fae", "SciFaePseudoScript10", sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const rawTxt = getTxt() != null ? String(getTxt()) : '';
          const isPlaceholder = (isRoomMode && fieldKey === 'code' && rawTxt.length === 0);
          const displayTxt = isPlaceholder ? 'xxxx' : rawTxt;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; ctx.fillText(displayTxt, 0.5, textY + 0.5);
          ctx.fillStyle = isPlaceholder ? 'rgba(148, 163, 184, 0.55)' : (isDup ? '#ff3333' : (isFoc ? '#ffffff' : '#e2e8f0'));
          ctx.fillText(displayTxt, 0, textY);
          if (isFoc && self.cursorVisible) {
            const curX = isPlaceholder ? (ctx.measureText('xxxx').width * 0.5 + 4) : (ctx.measureText(rawTxt).width * 0.5 + 4);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; ctx.fillText('|', curX + 0.5, textY + 0.5);
            ctx.fillStyle = isDup ? '#ff3333' : '#ffffff'; ctx.fillText('|', curX, textY);
          }
          ctx.restore();
        }
      });
      return pod;
    };

    if (isRoomMode) {
      const curLen = String(this.targetItem?.name || '').length;
      const readyCol = curLen >= 4 ? '#10f000' : '#3d6eff';
      const readyAct = curLen >= 4 ? '#4ade80' : '#38bdf8';
      frame.addChild(makeSubPod('rename-sub-top', rowY - ySpacing, topW, '#953ffd', '#953ffd', null, () => 'Enter Room Code'));
      frame.addChild(makeSubPod('rename-sub-btm', rowY + ySpacing, Math.max(bottomW, 240), readyCol, readyAct, 'code', () => this.targetItem.name || ''));
    } else {
      // Top Row Sub-Pod: Preset Name (Left sub-pod of Preset Name Button, Purple #953ffd)
      frame.addChild(makeSubPod(
        'rename-sub-top', rowY - ySpacing, topW, '#953ffd', '#c084fc', 'name',
        () => (self.targetItem.name != null ? self.targetItem.name : '')
      ));

      // Bottom Row Sub-Pod: "###" Index Tag (Right sub-pod of Preset Name Button, Blue #3d6eff)
      // Displays raw input while typing (e.g. "56"), and finalized 3-digit format when blurred
      frame.addChild(makeSubPod(
        'rename-sub-btm', rowY + ySpacing, bottomW, '#3d6eff', '#38bdf8', 'tag',
        () => {
          if (self.activeField === 'tag' && self.rawTagBuffer !== null) {
            return self.rawTagBuffer;
          }
          return self.targetItem.tagNumber || '';
        }
      ));
    }

    this.frameNode = frame;
    frame.visible = true;
    return frame;
  };

  if (global.ROLL_CALL) global.ROLL_CALL.set('Game_Settings_Rename_Popup_1.1', global.GameSettingsRenamePopup);
})(window);
