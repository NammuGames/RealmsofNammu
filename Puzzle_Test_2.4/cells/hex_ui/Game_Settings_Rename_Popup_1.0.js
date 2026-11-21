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
      this.active = false; this.mode = 'rename'; this.targetItem = null; this.categoryLabel = 'Preset'; this.defaultNum = 1;
      this.activeField = null; this.rawTagBuffer = null; this.cursorVisible = true; this.cursorInterval = null;
      this.keyHandler = null; this.onDoneCallback = null; this.presetList = null; this._mobileInput = null;
      this.config = Object.assign({}, DEFAULT_POPUP_CONFIG);
    }

    _isMobileInputDevice() {
      return typeof window !== 'undefined' && (
        window.matchMedia?.('(pointer: coarse)')?.matches ||
        Math.min(window.innerWidth || 999, window.innerHeight || 999) <= 560
      );
    }

    _ensureMobileBar() {
      if (typeof document === 'undefined') return null;
      let bar = document.getElementById('nammu-mobile-input-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'nammu-mobile-input-bar';
        Object.assign(bar.style, {
          position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)',
          zIndex: '10000', display: 'none', alignItems: 'center', gap: '8px',
          padding: '6px 10px', borderRadius: '10px', maxWidth: 'calc(100vw - 24px)',
          background: 'rgba(5, 12, 24, 0.94)', border: '1.5px solid #10f000',
          boxShadow: '0 4px 18px rgba(0, 0, 0, 0.75), 0 0 12px rgba(16, 240, 0, 0.25)',
          fontFamily: "'Orbitron', 'Inter', sans-serif"
        });
        const lbl = document.createElement('span');
        lbl.className = 'nmib-label';
        Object.assign(lbl.style, { fontSize: '11px', fontWeight: '700', color: '#38bdf8', whiteSpace: 'nowrap', letterSpacing: '0.5px' });

        const inp = document.createElement('input');
        inp.id = 'nammu-room-code-input';
        inp.type = 'text';
        inp.autocomplete = 'off';
        inp.spellcheck = false;
        inp.setAttribute('enterkeyhint', 'done');
        Object.assign(inp.style, {
          width: '180px', maxWidth: '48vw', height: '32px', padding: '0 10px',
          borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.65)',
          background: '#091526', color: '#f8fafc', fontSize: '16px', fontWeight: '600',
          outline: 'none', fontFamily: "'Inter', sans-serif"
        });

        const btnDone = document.createElement('button');
        btnDone.type = 'button';
        btnDone.textContent = 'Done';
        Object.assign(btnDone.style, {
          height: '32px', padding: '0 12px', borderRadius: '6px', border: '1px solid #10f000',
          background: 'rgba(16, 240, 0, 0.18)', color: '#4ade80', fontSize: '12px',
          fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap'
        });
        btnDone.addEventListener('pointerdown', (e) => { e.preventDefault(); });
        btnDone.addEventListener('click', () => this.confirm());

        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.textContent = '✕';
        Object.assign(btnCancel.style, {
          height: '32px', width: '32px', borderRadius: '6px', border: '1px solid rgba(248, 113, 113, 0.6)',
          background: 'rgba(248, 113, 113, 0.14)', color: '#f87171', fontSize: '13px',
          fontWeight: '700', cursor: 'pointer', flexShrink: '0'
        });
        btnCancel.addEventListener('pointerdown', (e) => { e.preventDefault(); });
        btnCancel.addEventListener('click', () => this.cancel());

        bar.append(lbl, inp, btnDone, btnCancel);
        document.body.appendChild(bar);
        this._mobileBar = bar;
        this._mobileLabel = lbl;
        this._mobileInput = inp;
      }
      return bar;
    }

    _focusMobileInput() {
      const isMobile = this._isMobileInputDevice();
      const supportsMode = (this.mode === 'roomCode' || this.mode === 'singleText' || (isMobile && this.mode === 'rename'));
      if (typeof document === 'undefined' || !supportsMode) return;
      const bar = this._ensureMobileBar();
      const inp = this._mobileInput || document.getElementById('nammu-room-code-input');
      if (!inp || !bar) return;

      const isRoom = (this.mode === 'roomCode');
      const maxLen = isRoom ? 4 : (this._singleMaxLen || 18);
      inp.maxLength = maxLen;
      inp.autocapitalize = isRoom ? 'characters' : 'words';
      inp.placeholder = isRoom ? 'CODE' : (this._singlePlaceholder || this.categoryLabel || 'Name');
      if (this._mobileLabel) {
        this._mobileLabel.textContent = isRoom ? 'ROOM' : (this._singleTitle || this.categoryLabel || 'NAME');
      }

      if (isMobile) {
        bar.style.display = 'flex';
      } else {
        bar.style.display = 'block';
        Object.assign(bar.style, {
          left: '-9999px', top: '0', width: '2px', height: '2px', opacity: '0.001',
          padding: '0', border: 'none', background: 'transparent', boxShadow: 'none', pointerEvents: 'none'
        });
      }

      const cleanVal = (v) => isRoom ? v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) : v.slice(0, maxLen);
      inp.value = cleanVal(this.targetItem?.name || '');
      inp.oninput = () => {
        if (!this.active || !this.targetItem) return;
        const clean = cleanVal(inp.value);
        inp.value = clean;
        if (this.targetItem.name !== clean) {
          this.targetItem.name = clean;
          if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
          this.triggerRender();
        }
      };
      inp.onkeydown = (e) => {
        if (!this.active) return;
        if (e.key === 'Enter') { e.preventDefault(); this.confirm(); }
        else if (e.key === 'Escape') { e.preventDefault(); this.cancel(); }
      };
      try { inp.focus({ preventScroll: true }); } catch { inp.focus(); }
    }

    _blurMobileInput() {
      if (this._mobileInput) {
        try { this._mobileInput.blur(); } catch {}
      }
      if (this._mobileBar) {
        this._mobileBar.style.display = 'none';
      }
      if (typeof window !== 'undefined' && global.ResponsiveViewportAdapter?.syncViewport) {
        setTimeout(() => global.ResponsiveViewportAdapter.syncViewport(), 120);
        setTimeout(() => global.ResponsiveViewportAdapter.syncViewport(), 420);
      }
    }

    openRoomCode(initialCode = '', onConfirm = null, options = {}) {
      const cleaned = String(initialCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      return this.open({ name: cleaned, tagNumber: '' }, 'Room Code', 1, onConfirm, null, { ...options, mode: 'roomCode' });
    }

    openSingleText(opts = {}) {
      this._singleTitle = opts.title || 'Enter Name';
      this._singlePlaceholder = opts.placeholder || 'Name';
      this._singleMaxLen = opts.maxLength || 18;
      const init = String(opts.initialValue || '').slice(0, this._singleMaxLen);
      return this.open({ name: init, tagNumber: '' }, this._singleTitle, 1, opts.onConfirm, null, { ...opts, mode: 'singleText' });
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
      this.mode = (options?.mode === 'roomCode' || options?.mode === 'singleText') ? options.mode : 'rename';
      this.targetItem = (typeof targetItem === 'object' && targetItem) ? targetItem : { name: String(targetItem || 'Preset') };
      this.initialName = this.targetItem.name;
      this.initialTagNumber = this.targetItem.tagNumber;
      this.categoryLabel = categoryLabel;
      this.defaultNum = defaultNum;
      this.onDoneCallback = onDone;
      this.presetList = presetList || global.GameSettingsCanvas?.getCurrentDraft?.()?.list || null;
      this.activeField = (this.mode === 'roomCode') ? 'code' : 'name'; // Focus active pod immediately on open
      this.rawTagBuffer = null;
      this.isAddNew = !!(options && (options.isAddNew || options.isNew));
      this.originNode = options?.originNode || options?.originNodeOrId || global.HexUIEngine?.lastClickedNode;

      if (this.mode === 'rename' && !this.targetItem.tagNumber) {
        this.targetItem.tagNumber = String(defaultNum).padStart(3, '0');
      }

      this.cursorVisible = true;
      if (this.cursorInterval) clearInterval(this.cursorInterval);
      this.cursorInterval = setInterval(() => {
        this.cursorVisible = !this.cursorVisible;
        if (global.BoardRenderer?.render) global.BoardRenderer.render();
      }, 450);

      this.bindKeyboard();
      this._focusMobileInput();
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
      this._blurMobileInput();
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
      const isRoomMode = (this.mode === 'roomCode');
      const isSingleText = (this.mode === 'singleText');
      if (!force && !isRoomMode && !isSingleText) {
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
      if (isRoomMode) {
        this.targetItem.name = String(this.targetItem?.name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      } else if (isSingleText) {
        this.targetItem.name = (this.targetItem?.name || '').trim() || this._singlePlaceholder || 'Match 001';
      } else {
        this.finalizeNameInput();
        this.finalizeTagInput();
      }
      this.active = false;
      this.activeField = null;
      this._blurMobileInput();
      if (this.cursorInterval) { clearInterval(this.cursorInterval); this.cursorInterval = null; }
      this.unbindKeyboard();
      if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
      global.UIDeckSync?.syncMaterialsTrayWithGameState?.();

      if (this.frameNode) this.frameNode.animating = true;
      if (this.isAddNew && global.GameSettingsCanvas) {
        global.GameSettingsCanvas._skipColumnAnimation = true;
      }
      if (typeof this.onDoneCallback === 'function') this.onDoneCallback((isRoomMode || isSingleText) ? this.targetItem?.name : undefined);

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
