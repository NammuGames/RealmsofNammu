/**
 * @fileoverview cells/hex_ui/Audio_Tuning_Lab.js - Relative Sound-Set Volume Mix Lab
 * @description Coordinates real-time relative mix sliders (0.00x - 2.00x) for all
 * 9 AudioSynth sound sets in the Tuning Drawer, plus JSON config clipboard export.
 * Strictly adheres to the 500-line hard cap and modular architecture.
 */

(function(global) {
  'use strict';

  const SOUND_SET_IDS = ['CFL', 'XDM', 'MVB', 'SPK', 'PWM', 'DGS', 'DGD', 'GSF', 'GDA', 'BGM'];

  class AudioTuningLabClass {
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

    _formatMult(v) {
      const n = Number(v);
      return `${n.toFixed(2)}x (${Math.round(n * 100)}%)`;
    }

    initControls() {
      const setVols = this.audio?.setVolumes || {};
      SOUND_SET_IDS.forEach(id => {
        const key = id.toLowerCase();
        const slider = document.getElementById(`slider-audio-vol-${key}`);
        const valEl = document.getElementById(`val-audio-vol-${key}`);
        if (!slider || !valEl) return;

        if (typeof setVols[id] === 'number') {
          slider.value = setVols[id];
        }
        valEl.textContent = this._formatMult(slider.value);

        slider.addEventListener('input', () => {
          const num = parseFloat(slider.value);
          valEl.textContent = this._formatMult(num);
          if (this.audio?.setSetVolume) {
            this.audio.setSetVolume(id, num);
          }
        });
      });
    }

    _buildMixConfig() {
      const baseVols = this.audio?.getSetBaseVolumes ? this.audio.getSetBaseVolumes() : {};
      const setVols = this.audio?.setVolumes || {};
      const relativeMultipliers = {};
      const effectiveVoiceVols = {};

      SOUND_SET_IDS.forEach(id => {
        const slider = document.getElementById(`slider-audio-vol-${id.toLowerCase()}`);
        const raw = typeof setVols[id] === 'number'
          ? setVols[id]
          : (slider ? parseFloat(slider.value) : 1.0);
        const mult = Number((Number.isFinite(raw) ? raw : 1.0).toFixed(2));
        relativeMultipliers[id] = mult;
        if (typeof baseVols[id] === 'number') {
          effectiveVoiceVols[id] = Number((baseVols[id] * mult).toFixed(4));
        }
      });

      return { relativeMultipliers, effectiveVoiceVols };
    }

    _copyText(text, onDone) {
      const fallback = () => {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          if (onDone) onDone();
        } catch (e) {}
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          if (onDone) onDone();
        }).catch(fallback);
      } else {
        fallback();
      }
    }

    initCopyButton() {
      const btnCopy = document.getElementById('btn-copy-audio-mix-config');
      if (!btnCopy) return;

      btnCopy.addEventListener('click', () => {
        const text = JSON.stringify(this._buildMixConfig(), null, 2);
        this._copyText(text, () => {
          const orig = btnCopy.textContent;
          btnCopy.textContent = '✓ Copied!';
          setTimeout(() => { btnCopy.textContent = orig; }, 1500);
          if (global.GameState?.showToast) {
            global.GameState.showToast('📋 Audio Mix config copied as JSON!');
          }
        });
        if (this.audio?.playClick) this.audio.playClick();
      });
    }
  }

  const audioTuningLabInstance = new AudioTuningLabClass();
  global.AudioTuningLab = audioTuningLabInstance;

  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Audio_Tuning_Lab', audioTuningLabInstance);
  }
})(typeof window !== 'undefined' ? window : this);
