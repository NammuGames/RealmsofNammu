/**
 * @fileoverview cells/hex_ui/Menu_Tuning_Lab.js - Real-Time Menu Canvas Sub-Pod Tuning Controller
 * @description Provides grouped real-time sliders for all Menu Canvas sub-pods:
 * Row Y positions, X spacing/offsets, frame width/height/apex, and text sizes / Y offsets.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const CONTROLS = [
    // ── Header & Base Column Buttons ──────────────────────────────────────
    { id: 'slider-menu-header-text-size', valId: 'val-menu-header-text-size', key: 'headerTextSize', unit: 'px', def: 42 },
    { id: 'slider-menu-header-text-y', valId: 'val-menu-header-text-y', key: 'headerTextY', unit: 'px', def: 2 },
    { id: 'slider-menu-base-btn-text-size', valId: 'val-menu-base-btn-text-size', key: 'baseBtnTextSize', unit: 'px', def: 44 },
    { id: 'slider-menu-base-btn-text-y', valId: 'val-menu-base-btn-text-y', key: 'baseBtnTextY', unit: 'px', def: 3 },

    // ── Group 1: Preview Pod (Row 1: Title Sub-Pod) ──────────────────────
    { id: 'slider-menu-prev-row1-y', valId: 'val-menu-prev-row1-y', key: 'prevRow1Y', unit: 'px', def: -24 },
    { id: 'slider-menu-prev-title-w', valId: 'val-menu-prev-title-w', key: 'prevTitleW', unit: 'px', def: 720 },
    { id: 'slider-menu-prev-title-h', valId: 'val-menu-prev-title-h', key: 'prevTitleH', unit: 'px', def: 60 },
    { id: 'slider-menu-prev-title-apex', valId: 'val-menu-prev-title-apex', key: 'prevTitleApex', unit: 'px', def: 18 },
    { id: 'slider-menu-prev-title-text-size', valId: 'val-menu-prev-title-text-size', key: 'prevTitleTextSize', unit: 'px', def: 32 },
    { id: 'slider-menu-prev-title-text-y', valId: 'val-menu-prev-title-text-y', key: 'prevTitleTextY', unit: 'px', def: 2 },

    // ── Group 1: Preview Pod (Row 2: Badges - Linked) ────────────────────
    { id: 'slider-menu-prev-row2-y', valId: 'val-menu-prev-row2-y', key: 'prevRow2Y', unit: 'px', def: 39 },
    { id: 'slider-menu-prev-badge-w', valId: 'val-menu-prev-badge-w', key: 'prevBadgeW', unit: 'px', def: 148 },
    { id: 'slider-menu-prev-badge-h', valId: 'val-menu-prev-badge-h', key: 'prevBadgeH', unit: 'px', def: 42 },
    { id: 'slider-menu-prev-badge-apex', valId: 'val-menu-prev-badge-apex', key: 'prevBadgeApex', unit: 'px', def: 12 },
    { id: 'slider-menu-prev-badge-spacing', valId: 'val-menu-prev-badge-spacing', key: 'prevBadgeSpacing', unit: 'px', def: 54 },
    { id: 'slider-menu-prev-badge-text-size', valId: 'val-menu-prev-badge-text-size', key: 'prevBadgeTextSize', unit: 'px', def: 24 },
    { id: 'slider-menu-prev-badge-text-y', valId: 'val-menu-prev-badge-text-y', key: 'prevBadgeTextY', unit: 'px', def: 2 },

    // ── Group 2: Preset Name Pod (1 Row) ──────────────────────────────────
    { id: 'slider-menu-preset-row-y', valId: 'val-menu-preset-row-y', key: 'presetRowY', unit: 'px', def: 0 },
    { id: 'slider-menu-preset-height', valId: 'val-menu-preset-height', key: 'presetHeight', unit: 'px', def: 72 },
    { id: 'slider-menu-preset-apex', valId: 'val-menu-preset-apex', key: 'presetApex', unit: 'px', def: 20 },
    { id: 'slider-menu-preset-name-w', valId: 'val-menu-preset-name-w', key: 'presetNameW', unit: 'px', def: 530 },
    { id: 'slider-menu-preset-tag-w', valId: 'val-menu-preset-tag-w', key: 'presetTagW', unit: 'px', def: 230 },
    { id: 'slider-menu-preset-spacing', valId: 'val-menu-preset-spacing', key: 'presetSpacing', unit: 'px', def: 54 },
    { id: 'slider-menu-preset-name-text-size', valId: 'val-menu-preset-name-text-size', key: 'presetNameTextSize', unit: 'px', def: 32 },
    { id: 'slider-menu-preset-name-text-y', valId: 'val-menu-preset-name-text-y', key: 'presetNameTextY', unit: 'px', def: 2 },
    { id: 'slider-menu-preset-tag-text-size', valId: 'val-menu-preset-tag-text-size', key: 'presetTagTextSize', unit: 'px', def: 32 },
    { id: 'slider-menu-preset-tag-text-y', valId: 'val-menu-preset-tag-text-y', key: 'presetTagTextY', unit: 'px', def: 2 },

    // ── Group 3: Stepper Pods (Increment Buttons - Linked) ────────────────
    { id: 'slider-menu-step-btn-row-y', valId: 'val-menu-step-btn-row-y', key: 'stepBtnRowY', unit: 'px', def: 0 },
    { id: 'slider-menu-step-btn-w', valId: 'val-menu-step-btn-w', key: 'stepBtnW', unit: 'px', def: 72 },
    { id: 'slider-menu-step-btn-h', valId: 'val-menu-step-btn-h', key: 'stepBtnH', unit: 'px', def: 72 },
    { id: 'slider-menu-step-btn-apex', valId: 'val-menu-step-btn-apex', key: 'stepBtnApex', unit: 'px', def: 21 },
    { id: 'slider-menu-step-inner-x', valId: 'val-menu-step-inner-x', key: 'stepInnerX', unit: 'px', def: 250 },
    { id: 'slider-menu-step-outer-x', valId: 'val-menu-step-outer-x', key: 'stepOuterX', unit: 'px', def: 380 },
    { id: 'slider-menu-step-btn-text-size', valId: 'val-menu-step-btn-text-size', key: 'stepBtnTextSize', unit: 'px', def: 32 },
    { id: 'slider-menu-step-btn-text-y', valId: 'val-menu-step-btn-text-y', key: 'stepBtnTextY', unit: 'px', def: 2 },

    // ── Group 3: Stepper Pods (Center Readout - Linked Base) ──────────────
    { id: 'slider-menu-step-center-row-y', valId: 'val-menu-step-center-row-y', key: 'stepCenterRowY', unit: 'px', def: 0 },
    { id: 'slider-menu-step-center-w', valId: 'val-menu-step-center-w', key: 'stepCenterW', unit: 'px', def: 300 },
    { id: 'slider-menu-step-center-apex', valId: 'val-menu-step-center-apex', key: 'stepCenterApex', unit: 'px', def: 21 },
    { id: 'slider-menu-step-center-h', valId: 'val-menu-step-center-h', key: 'stepCenterH', unit: 'px', def: 72 },
    { id: 'slider-menu-step-center-text-size', valId: 'val-menu-step-center-text-size', key: 'stepCenterTextSize', unit: 'px', def: 32 },
    { id: 'slider-menu-step-center-text-y', valId: 'val-menu-step-center-text-y', key: 'stepCenterTextY', unit: 'px', def: 2 },

    // ── Group 3: Stepper Pods (Double-Line Center Overrides) ───────────────
    { id: 'slider-menu-step-double-h', valId: 'val-menu-step-double-h', key: 'stepDoubleH', unit: 'px', def: 90 },
    { id: 'slider-menu-step-double-title-text-size', valId: 'val-menu-step-double-title-text-size', key: 'stepDoubleTitleTextSize', unit: 'px', def: 32 },
    { id: 'slider-menu-step-double-val-text-size', valId: 'val-menu-step-double-val-text-size', key: 'stepDoubleValTextSize', unit: 'px', def: 32 },
    { id: 'slider-menu-step-double-line-spacing', valId: 'val-menu-step-double-line-spacing', key: 'stepDoubleLineSpacing', unit: 'px', def: 32 }
  ];

  const POPUP_CONTROLS = [
    { id: 'slider-popup-height', valId: 'val-popup-height', key: 'height', unit: 'px', def: 100 },
    { id: 'slider-popup-apex', valId: 'val-popup-apex', key: 'apex', unit: 'px', def: 32 },
    { id: 'slider-popup-row-y', valId: 'val-popup-row-y', key: 'rowY', unit: 'px', def: 13 },
    { id: 'slider-popup-y-spacing', valId: 'val-popup-y-spacing', key: 'ySpacing', unit: 'px', def: 64 },
    { id: 'slider-popup-text-size', valId: 'val-popup-text-size', key: 'textSize', unit: 'px', def: 44 },
    { id: 'slider-popup-text-y', valId: 'val-popup-text-y', key: 'textY', unit: 'px', def: 3 },
    { id: 'slider-popup-top-w', valId: 'val-popup-top-w', key: 'topW', unit: 'px', def: 740 },
    { id: 'slider-popup-bottom-w', valId: 'val-popup-bottom-w', key: 'bottomW', unit: 'px', def: 180 }
  ];

  class MenuTuningLabClass {
    constructor() {
      this.dom = null;
      this.audio = null;
      this.initialized = false;
    }

    init(dom, audio) {
      this.dom = dom;
      this.audio = audio || global.AudioSynth;
      this.bindControls();
      this.syncUI();
      this.initialized = true;
    }

    getCanvas() {
      return global.GameSettingsCanvas || (global.ROLL_CALL && global.ROLL_CALL.get('Game_Settings_Canvas'));
    }

    getPopup() {
      return global.GameSettingsRenamePopup || (global.ROLL_CALL && global.ROLL_CALL.get('Game_Settings_Rename_Popup'));
    }

    bindControls() {
      const self = this;
      CONTROLS.forEach(c => {
        const slider = document.getElementById(c.id);
        const valEl = document.getElementById(c.valId);
        if (slider && valEl) {
          slider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            valEl.textContent = `${val}${c.unit}`;
            const canvas = self.getCanvas();
            if (canvas && typeof canvas.setSubPodConfig === 'function') {
              canvas.setSubPodConfig({ [c.key]: val });
            }
            global.BoardRenderer?.render?.();
          });
        }
      });

      POPUP_CONTROLS.forEach(c => {
        const slider = document.getElementById(c.id);
        const valEl = document.getElementById(c.valId);
        if (slider && valEl) {
          slider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            valEl.textContent = `${val}${c.unit}`;
            const popup = self.getPopup();
            if (popup && typeof popup.setConfig === 'function') {
              popup.setConfig({ [c.key]: val });
            }
            global.BoardRenderer?.render?.();
          });
        }
      });

      // Action: Copy Menu Pods Config to Clipboard
      const btnCopy = document.getElementById('btn-copy-menu-canvas-config');
      if (btnCopy) {
        btnCopy.addEventListener('click', () => {
          const canvas = self.getCanvas();
          const config = Object.assign({}, canvas?.subPodConfig || {});
          const snippet = JSON.stringify(config, null, 2);
          navigator.clipboard.writeText(snippet).then(() => {
            const orig = btnCopy.textContent;
            btnCopy.textContent = '✓ Config Copied!';
            setTimeout(() => { btnCopy.textContent = orig; }, 1800);
          }).catch(() => {
            console.log('Menu Canvas Sub-Pods Config:', snippet);
          });
          if (self.audio?.playFortify) self.audio.playFortify();
        });
      }

      // Action: Reset Menu Pods to Defaults
      const btnReset = document.getElementById('btn-reset-menu-canvas-config');
      if (btnReset) {
        btnReset.addEventListener('click', () => {
          const defaults = {};
          CONTROLS.forEach(c => {
            defaults[c.key] = c.def;
            const slider = document.getElementById(c.id);
            const valEl = document.getElementById(c.valId);
            if (slider) slider.value = c.def;
            if (valEl) valEl.textContent = `${c.def}${c.unit}`;
          });
          const canvas = self.getCanvas();
          if (canvas && typeof canvas.setSubPodConfig === 'function') {
            canvas.setSubPodConfig(defaults);
          }
          global.BoardRenderer?.render?.();
          if (self.audio?.playWeave) self.audio.playWeave();
        });
      }

      // Action: Copy Pop-Up Config to Clipboard
      const btnCopyPopup = document.getElementById('btn-copy-popup-config');
      if (btnCopyPopup) {
        btnCopyPopup.addEventListener('click', () => {
          const popup = self.getPopup();
          const config = Object.assign({}, popup?.config || {});
          const snippet = JSON.stringify(config, null, 2);
          navigator.clipboard.writeText(snippet).then(() => {
            const orig = btnCopyPopup.textContent;
            btnCopyPopup.textContent = '✓ Config Copied!';
            setTimeout(() => { btnCopyPopup.textContent = orig; }, 1800);
          }).catch(() => {
            console.log('Pop-Up Pods Config:', snippet);
          });
          if (self.audio?.playFortify) self.audio.playFortify();
        });
      }

      // Action: Reset Pop-Up to Defaults
      const btnResetPopup = document.getElementById('btn-reset-popup-config');
      if (btnResetPopup) {
        btnResetPopup.addEventListener('click', () => {
          const defaults = {};
          POPUP_CONTROLS.forEach(c => {
            defaults[c.key] = c.def;
            const slider = document.getElementById(c.id);
            const valEl = document.getElementById(c.valId);
            if (slider) slider.value = c.def;
            if (valEl) valEl.textContent = `${c.def}${c.unit}`;
          });
          const popup = self.getPopup();
          if (popup && typeof popup.setConfig === 'function') {
            popup.setConfig(defaults);
          }
          global.BoardRenderer?.render?.();
          if (self.audio?.playWeave) self.audio.playWeave();
        });
      }
    }

    syncUI() {
      const canvas = this.getCanvas();
      const current = canvas?.subPodConfig || {};
      CONTROLS.forEach(c => {
        const slider = document.getElementById(c.id);
        const valEl = document.getElementById(c.valId);
        const val = current[c.key] !== undefined ? current[c.key] : c.def;
        if (slider) slider.value = val;
        if (valEl) valEl.textContent = `${val}${c.unit}`;
      });

      const popup = this.getPopup();
      const popupCurrent = popup?.config || {};
      POPUP_CONTROLS.forEach(c => {
        const slider = document.getElementById(c.id);
        const valEl = document.getElementById(c.valId);
        const val = popupCurrent[c.key] !== undefined ? popupCurrent[c.key] : c.def;
        if (slider) slider.value = val;
        if (valEl) valEl.textContent = `${val}${c.unit}`;
      });
    }
  }

  const instance = new MenuTuningLabClass();
  global.MenuTuningLab = instance;
  if (global.ROLL_CALL) global.ROLL_CALL.set('Menu_Tuning_Lab', instance);

})(typeof window !== 'undefined' ? window : this);
