/**
 * @fileoverview cells/hex_ui/Warp_Halo_Tuning_Lab.js - Live Warp Halo Aesthetics Tuning Lab
 * @description Coordinates real-time controls for the active Warp Halo animation:
 * - Particle head size, tail length, tail width, and tail angle
 * - Under-layer (+delta) dimensions for Store/Ritual-Cyan glow
 * - CW/CCW band counts, inner radii, and band spacing
 * - Standard JSON config export to clipboard with UI toast confirmation
 * Strictly adheres to the 500-line hard cap and modular architecture.
 */

(function(global) {
  'use strict';

  class WarpHaloTuningLabClass {
    constructor() {
      this.dom = null;
      this.audio = null;
    }

    init(dom, audio) {
      this.dom = dom;
      this.audio = audio || global.AudioSynth;
      this.initControls();
      this.initCopyButton();
    }

    _bindSlider(sliderId, valId, prop, formatFn) {
      const slider = document.getElementById(sliderId);
      const val = document.getElementById(valId);
      if (!slider || !val) return;
      const cfg = global.WarpHaloRenderer?.config;
      if (cfg && cfg[prop] !== undefined) slider.value = cfg[prop];
      val.textContent = formatFn ? formatFn(slider.value) : slider.value;
      slider.addEventListener('input', () => {
        const num = parseFloat(slider.value);
        if (cfg) cfg[prop] = num;
        val.textContent = formatFn ? formatFn(num) : num;
        if (global.BoardRenderer?.render) global.BoardRenderer.render();
      });
    }

    initControls() {
      // 1. Particle Dimensions
      this._bindSlider('slider-warp-ball-radius', 'val-warp-ball-radius', 'ballRadius', v => `${Number(v).toFixed(1)} px`);
      this._bindSlider('slider-warp-tail-len', 'val-warp-tail-len', 'tailLength', v => `${Number(v).toFixed(1)} px`);
      this._bindSlider('slider-warp-tail-wid', 'val-warp-tail-wid', 'tailWidth', v => `${Number(v).toFixed(1)} px`);
      this._bindSlider('slider-warp-tail-ang', 'val-warp-tail-ang', 'tailAngle', v => `${Number(v).toFixed(0)}°`);
      this._bindSlider('slider-warp-front-tail-ang', 'val-warp-front-tail-ang', 'frontTailAngle', v => `${Number(v).toFixed(0)}°`);

      // 2. Under-Layer (+Delta) Dimensions
      this._bindSlider('slider-warp-under-r-delta', 'val-warp-under-r-delta', 'underRadiusDelta', v => `+${Number(v).toFixed(1)} px`);
      this._bindSlider('slider-warp-under-len-delta', 'val-warp-under-len-delta', 'underLengthDelta', v => `+${Number(v).toFixed(1)} px`);
      this._bindSlider('slider-warp-under-wid-delta', 'val-warp-under-wid-delta', 'underWidthDelta', v => `+${Number(v).toFixed(1)} px`);

      // 3. Clockwise (CW) Concentric Bands
      this._bindSlider('slider-warp-bands-cw', 'val-warp-bands-cw', 'bandsCW', v => `${Math.round(v)}`);
      this._bindSlider('slider-warp-rad-cw', 'val-warp-rad-cw', 'radiusInnerCW', v => `${Number(v).toFixed(1)} px`);
      this._bindSlider('slider-warp-sp-cw', 'val-warp-sp-cw', 'spacingCW', v => `${Number(v).toFixed(1)} px`);

      // 4. Counter-Clockwise (CCW) Concentric Bands
      this._bindSlider('slider-warp-bands-ccw', 'val-warp-bands-ccw', 'bandsCCW', v => `${Math.round(v)}`);
      this._bindSlider('slider-warp-rad-ccw', 'val-warp-rad-ccw', 'radiusInnerCCW', v => `${Number(v).toFixed(1)} px`);
      this._bindSlider('slider-warp-sp-ccw', 'val-warp-sp-ccw', 'spacingCCW', v => `${Number(v).toFixed(1)} px`);

      // 5. Global Orbital Base Speed
      this._bindSlider('slider-warp-base-speed', 'val-warp-base-speed', 'baseSpeed', v => `${Number(v).toFixed(2)}x`);
    }

    initCopyButton() {
      const btnCopy = document.getElementById('btn-copy-warp-halo-config');
      if (!btnCopy) return;

      btnCopy.addEventListener('click', () => {
        const cfg = global.WarpHaloRenderer?.config || {};
        const text = JSON.stringify(cfg, null, 2);
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text);
        }
        const orig = btnCopy.textContent;
        btnCopy.textContent = '✓ Copied!';
        setTimeout(() => { btnCopy.textContent = orig; }, 1500);

        if (global.GameState?.showToast) {
          global.GameState.showToast('📋 Warp Halo config copied as JSON!');
        }
        if (this.audio?.playClick) this.audio.playClick();
      });
    }
  }

  const warpHaloTuningLabInstance = new WarpHaloTuningLabClass();
  global.WarpHaloTuningLab = warpHaloTuningLabInstance;

  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Warp_Halo_Tuning_Lab', warpHaloTuningLabInstance);
  }

})(typeof window !== 'undefined' ? window : this);

