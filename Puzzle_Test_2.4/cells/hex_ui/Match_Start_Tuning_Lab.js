/**
 * @fileoverview cells/hex_ui/Match_Start_Tuning_Lab.js - Match Start Spawn Animation Tuning Lab
 * @description Coordinates real-time controllers (in increments of 1/12 H-Beat) for the
 * Match Start ring-by-ring tile spawn duration, inter-ring stagger spacing, and JSON export.
 * Strictly adheres to the 500-line hard cap and modular architecture.
 */

(function(global) {
  'use strict';

  class MatchStartTuningLabClass {
    constructor() {
      this.dom = null;
      this.audio = null;
      this.config = {
        tileSpawnTwelfths: 36,   // 36/12 = 3.00 H-Beats per tile spawn (~908ms)
        ringSpacingTwelfths: 6,  // 6/12  = 0.50 H-Beat spacing between rings (~151ms)
        boundaryFadeTwelfths: 12 // 12/12 = 1.00 H-Beat boundary fade-in (~303ms)
      };
    }

    init(dom, audio) {
      this.dom = dom;
      this.audio = audio || global.AudioSynth;
      this.initControls();
      this.initCopyButton();
    }

    getBeatSec() {
      return global.H_TIMING?.BEAT_SEC ?? (Math.pow(12, 8) / 1420405751.768);
    }

    getTileSpawnSec() {
      return (Math.max(1, Number(this.config.tileSpawnTwelfths) || 36) / 12) * this.getBeatSec();
    }

    getRingSpacingSec() {
      return (Math.max(0, Number(this.config.ringSpacingTwelfths) || 0) / 12) * this.getBeatSec();
    }

    getBoundaryFadeSec() {
      return (Math.max(1, Number(this.config.boundaryFadeTwelfths) || 12) / 12) * this.getBeatSec();
    }

    _formatTwelfths(twelfths) {
      const n = Math.round(Number(twelfths) || 0);
      const beats = n / 12;
      const ms = Math.round(beats * this.getBeatSec() * 1000);
      return `${n}/12 HB (${beats.toFixed(2)} • ${ms} ms)`;
    }

    initControls() {
      const bind = (sliderId, valId, prop) => {
        const slider = document.getElementById(sliderId);
        const valEl = document.getElementById(valId);
        if (!slider || !valEl) return;
        if (this.config[prop] !== undefined) slider.value = this.config[prop];
        valEl.textContent = this._formatTwelfths(slider.value);
        slider.addEventListener('input', () => {
          const n = Math.round(parseFloat(slider.value) || 0);
          this.config[prop] = n;
          valEl.textContent = this._formatTwelfths(n);
        });
      };

      bind('slider-match-tile-twelfths', 'val-match-tile-twelfths', 'tileSpawnTwelfths');
      bind('slider-match-ring-twelfths', 'val-match-ring-twelfths', 'ringSpacingTwelfths');
    }

    initCopyButton() {
      const btnCopy = document.getElementById('btn-copy-match-start-config');
      if (!btnCopy) return;
      btnCopy.addEventListener('click', () => {
        const text = JSON.stringify({
          ...this.config,
          tileSpawnSec: Number(this.getTileSpawnSec().toFixed(4)),
          ringSpacingSec: Number(this.getRingSpacingSec().toFixed(4)),
          boundaryFadeSec: Number(this.getBoundaryFadeSec().toFixed(4))
        }, null, 2);
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text);
        }
        const orig = btnCopy.textContent;
        btnCopy.textContent = '✓ Copied!';
        setTimeout(() => { btnCopy.textContent = orig; }, 1500);
        global.GameState?.showToast?.('📋 Match Start config copied as JSON!');
        this.audio?.playClick?.();
      });
    }
  }

  const instance = new MatchStartTuningLabClass();
  global.MatchStartTuningLabClass = MatchStartTuningLabClass;
  global.MatchStartTuningLab = instance;
  global.ROLL_CALL?.set?.('Match_Start_Tuning_Lab', instance);
})(typeof window !== 'undefined' ? window : this);
