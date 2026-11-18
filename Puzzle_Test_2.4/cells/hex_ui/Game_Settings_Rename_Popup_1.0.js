/**
 * @fileoverview cells/hex_ui/Game_Settings_Rename_Popup_1.0.js - Rename Pop-Up Core & Lifecycle
 * @description Character width weighting, popup defaults, duplicate/reserved tag checks, and
 * open/cancel/close modal lifecycle with holographic expand/collapse transitions.
 */

(function(global) {
  'use strict';

  // Wide-width character definitions for Sci-Fae Pseudo Script 1.0 (weighted as 1.6 units)
  const WIDE_CHARS = new Set(['M', 'W', 'X', 'Y', 'Z', 'm', 'w', '#']);

  function getWeightedLength(str) {
    let len = 0;
    for (const ch of (str || '')) len += WIDE_CHARS.has(ch) ? 1.6 : 1;
    return len;
  }

  const DEFAULT_POPUP_CONFIG = {
    height: 100, apex: 32, rowY: 13, ySpacing: 64, topW: 740, bottomW: 180, textSize: 44, textY: 3
  };

  class GameSettingsRenamePopupClass {
    constructor() {
      this.active = false; this.targetItem = null; this.categoryLabel = 'Preset'; this.defaultNum = 1;
      this.activeField = null; this.rawTagBuffer = null; this.cursorVisible = true; this.cursorInterval = null;
      this.keyHandler = null; this.onDoneCallback = null; this.presetList = null;
      this.config = Object.assign({}, DEFAULT_POPUP_CONFIG);
    }

    setConfig(updates) {
      if (!this.config) this.config = Object.assign({}, DEFAULT_POPUP_CONFIG);
      Object.assign(this.config, updates);
      if (this.active) this.triggerRender();
    }

    isOpen() {
      return this.active || !!(this.frameNode && this.frameNode.animating);
    }

    getNameButtonOrigin() {
      const engine = global.HexUIEngine;
      const activeFrame = global.GameSettingsCanvas?.getActiveFrame?.();
      const ids = [
        'pod-base-fused-preset-name-btn',
        'pod-base-luck-playfield-name',
        'pod-base-luck-material-name',
        'pod-base-blight-playfield-name',
        'pod-base-blight-material-name',
        'pod-base-save-rename'
      ];
      for (const id of ids) {
        const node = activeFrame ? engine?.findNodeById?.(id, activeFrame) : engine?.findNodeById?.(id);
        if (node) return node;
      }
      if (activeFrame?.id === 'settings-frame-Presets') {
        const activeIdx = global.GameSettingsCanvas?.config?.activePresetIndex ?? 0;
        const cardNode = engine?.findNodeById?.(`pod-preset-fused-preset-opt-${activeIdx}`, activeFrame);
        if (cardNode) return cardNode;
      }
      return null;
    }

    getCurrentCandidateTag() {
      let raw = null;
      if (this.rawTagBuffer !== null) {
        raw = this.rawTagBuffer;
      } else if (this.targetItem?.tagNumber != null) {
        raw = String(this.targetItem.tagNumber);
      }
      if (raw === null || raw === undefined) return '';
      const digits = String(raw).replace(/\D/g, '');
      if (!digits) return '';
      const num = parseInt(digits, 10);
      if (isNaN(num)) return '';
      return String(num).padStart(3, '0').slice(-3);
    }

    isTagDuplicate() {
      const list = this.presetList || global.GameSettingsCanvas?.getCurrentDraft?.()?.list || null;
      if (!list || !Array.isArray(list)) return false;
      const candTag = this.getCurrentCandidateTag();
      if (!candTag) return false;
      const candNum = parseInt(candTag, 10);
      const draft = global.GameSettingsCanvas?.getCurrentDraft?.();
      return list.some(p => {
        if (!p || p === this.targetItem) return false;
        if (draft?.draftItem === this.targetItem && (p === draft.targetItem || p === draft.targetPreset)) return false;
        if (p.id && this.targetItem?.id && p.id === this.targetItem.id) return false;
        const pNum = parseInt(p.tagNumber != null ? p.tagNumber : '', 10);
        return !isNaN(pNum) && pNum === candNum;
      });
    }

    isDefaultSlot(num) {
      if (isNaN(num)) return false;
      if (this.categoryLabel === 'Preset' && num >= 1 && num <= 3) return true;
      return !!this.presetList?.some(p => p.isDefault && parseInt(p.tagNumber, 10) === num);
    }

    finalizeNameInput() {
      if (this.targetItem) {
        const trimmed = (this.targetItem.name || '').trim();
        if (!trimmed) {
          this.targetItem.name = 'Preset';
        }
      }
    }

    finalizeTagInput() {
      if (this.isTagDuplicate()) {
        return;
      }
      if (this.rawTagBuffer !== null && this.targetItem) {
        const digits = this.rawTagBuffer.replace(/\D/g, '');
        const num = parseInt(digits, 10);
        const val = isNaN(num) ? (this.defaultNum || 1) : num;
        this.targetItem.tagNumber = String(val).padStart(3, '0').slice(-3);
        this.rawTagBuffer = null;
      } else if (this.targetItem && (!this.targetItem.tagNumber || !this.targetItem.tagNumber.trim())) {
        this.targetItem.tagNumber = String(this.defaultNum || 1).padStart(3, '0');
      }
    }

    open(targetItem, categoryLabel = 'Preset', defaultNum = 1, onDone = null, presetList = null, options = {}) {
      if (this.isOpen()) return;
      this.active = true;
      this.targetItem = (typeof targetItem === 'object' && targetItem) ? targetItem : { name: String(targetItem || 'Preset') };
      this.initialName = this.targetItem.name;
      this.initialTagNumber = this.targetItem.tagNumber;
      this.categoryLabel = categoryLabel;
      this.defaultNum = defaultNum;
      this.onDoneCallback = onDone;
      this.presetList = presetList || global.GameSettingsCanvas?.getCurrentDraft?.()?.list || null;
      this.activeField = 'name'; // Focus Preset Name pod immediately on open
      this.rawTagBuffer = null;
      this.isAddNew = !!(options && (options.isAddNew || options.isNew));
      this.originNode = options?.originNode || options?.originNodeOrId || global.HexUIEngine?.lastClickedNode;

      if (!this.targetItem.tagNumber) {
        this.targetItem.tagNumber = String(defaultNum).padStart(3, '0');
      }

      this.cursorVisible = true;
      if (this.cursorInterval) clearInterval(this.cursorInterval);
      this.cursorInterval = setInterval(() => {
        this.cursorVisible = !this.cursorVisible;
        if (global.BoardRenderer?.render) global.BoardRenderer.render();
      }, 450);

      this.bindKeyboard();
      if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
      global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
      this.triggerRender();

      if (global.TweenOrchestrator?.expandFrame && this.frameNode) {
        const pf = global.GameSettingsCanvas?.getActiveFrame?.();
        global.TweenOrchestrator.expandFrame(this.frameNode, this.originNode, {
          parentFrame: pf,
          concurrentFade: true
        });
      }
    }

    _cleanupFrame() {
      if (this.frameNode) {
        this.frameNode.visible = false;
        this.frameNode.animating = false;
        if (this.frameNode.parent) this.frameNode.parent.removeChild(this.frameNode);
      }
      const pf = global.GameSettingsCanvas?.getActiveFrame?.();
      if (pf) pf.contentAlpha = 1.0;
      this.triggerRender();
    }

    cancel() {
      if (!this.active || this.frameNode?.animating) return;
      if (this.targetItem) {
        if (this.initialName !== undefined) this.targetItem.name = this.initialName;
        if (this.initialTagNumber !== undefined) this.targetItem.tagNumber = this.initialTagNumber;
      }
      this.rawTagBuffer = null;
      this.active = false;
      this.activeField = null;
      if (this.cursorInterval) { clearInterval(this.cursorInterval); this.cursorInterval = null; }
      this.unbindKeyboard();
      if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
      global.UIDeckSync?.syncMaterialsTrayWithGameState?.();

      if (global.TweenOrchestrator?.collapseFrame && this.frameNode && this.frameNode.visible) {
        this.frameNode.animating = true;
        const shrinkTarget = this.isAddNew ? this.originNode : (this.getNameButtonOrigin() || this.originNode);
        global.TweenOrchestrator.collapseFrame(this.frameNode, shrinkTarget, {
          concurrentFade: true,
          getParentFrame: () => global.GameSettingsCanvas?.getActiveFrame?.(),
          onComplete: () => this._cleanupFrame()
        });
      } else {
        this._cleanupFrame();
      }
    }

    close(force = false) {
      if (!this.active || (!force && this.frameNode?.animating)) return;
      if (!force) {
        const candNum = parseInt(this.getCurrentCandidateTag(), 10);
        if (this.isDefaultSlot(candNum)) {
          if (global.AudioSynth?.playDetonateChime) global.AudioSynth.playDetonateChime(1);
          global.GameState?.showToast?.('⚠️ Slots 001, 002, and 003 are reserved for default presets!');
          return;
        }
        if (this.isTagDuplicate()) {
          if (global.AudioSynth?.playDetonateChime) global.AudioSynth.playDetonateChime(1);
          else if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
          global.GameState?.showToast?.(`⚠️ #${this.getCurrentCandidateTag()} is already taken in this list!`);
          return;
        }
      }
      this.finalizeNameInput();
      this.finalizeTagInput();
      this.active = false;
      this.activeField = null;
      if (this.cursorInterval) { clearInterval(this.cursorInterval); this.cursorInterval = null; }
      this.unbindKeyboard();
      if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
      global.UIDeckSync?.syncMaterialsTrayWithGameState?.();

      if (this.frameNode) this.frameNode.animating = true;
      if (this.isAddNew && global.GameSettingsCanvas) {
        global.GameSettingsCanvas._skipColumnAnimation = true;
      }
      if (typeof this.onDoneCallback === 'function') this.onDoneCallback();

      const onDone = () => this._cleanupFrame();

      if (global.TweenOrchestrator?.collapseFrame && this.frameNode && this.frameNode.visible) {
        const shrinkTarget = this.getNameButtonOrigin() || this.originNode;
        global.TweenOrchestrator.collapseFrame(this.frameNode, shrinkTarget, {
          concurrentFade: true,
          getOrigin: () => this.getNameButtonOrigin() || this.originNode,
          getParentFrame: () => global.GameSettingsCanvas?.getActiveFrame?.(),
          onComplete: onDone
        });
      } else {
        onDone();
      }
    }
  }

  GameSettingsRenamePopupClass._text = { WIDE_CHARS, getWeightedLength, DEFAULT_POPUP_CONFIG };

  const instance = new GameSettingsRenamePopupClass();
  global.GameSettingsRenamePopupClass = GameSettingsRenamePopupClass;
  global.GameSettingsRenamePopup = instance;
  instance.DEFAULT_CONFIG = DEFAULT_POPUP_CONFIG;
  if (global.ROLL_CALL) global.ROLL_CALL.set('Game_Settings_Rename_Popup_1.0', instance);
})(window);
