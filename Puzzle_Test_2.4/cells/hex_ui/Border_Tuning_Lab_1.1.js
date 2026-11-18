/**
 * @fileoverview cells/hex_ui/Border_Tuning_Lab_1.1.js - Border & Bezel UI Sync & Bindings
 * @description Implements DOM slider/color synchronization, live config updates, copy-to-clipboard,
 * and reset actions on BorderTuningLabClass.prototype.
 */

(function(global) {
  'use strict';

  const BorderTuningLabClass = global.BorderTuningLabClass;
  if (!BorderTuningLabClass) return;

  const { toHexColor, deepClone } = BorderTuningLabClass._util;
  const proto = BorderTuningLabClass.prototype;

  proto.syncUIFromTarget = function(key) {
    this.currentTarget = key;
    const nodes = this.getTargetNodes(key);
    if (nodes && nodes.length > 0) {
      this.snapshotOriginalStyle(key, nodes);
    }

    const cfg = this.getGroupConfig(key);
    const spread = cfg.spread;
    const innerIntensity = cfg.innerIntensity;
    const innerSteps = cfg.innerSteps;
    const innerColor = cfg.innerColor || '#38bdf8';

    const outerEnabled = cfg.outerEnabled;
    const blur = cfg.blur;
    const outerIntensity = cfg.outerIntensity;
    const outerSteps = cfg.outerSteps;
    const outerColor = cfg.outerColor || '#0284c7';

    const bgOpacity = cfg.bgOpacity;
    const bgColor = cfg.bgColor || '#0f172a';

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

    setVal('slider-border-inner-spread', spread);
    setText('val-border-inner-spread', `${spread}px`);

    setVal('slider-border-inner-intensity', innerIntensity);
    setText('val-border-inner-intensity', Number(innerIntensity).toFixed(2));

    setVal('slider-border-inner-steps', innerSteps);
    setText('val-border-inner-steps', innerSteps);

    const chkOuter = document.getElementById('chk-border-outer-enabled');
    if (chkOuter) chkOuter.checked = outerEnabled;

    setVal('slider-border-outer-blur', blur);
    setText('val-border-outer-blur', `${blur}px`);

    setVal('slider-border-outer-intensity', outerIntensity);
    setText('val-border-outer-intensity', Number(outerIntensity).toFixed(2));

    setVal('slider-border-outer-steps', outerSteps);
    setText('val-border-outer-steps', outerSteps);

    setVal('slider-border-bg-opacity', bgOpacity);
    setText('val-border-bg-opacity', Number(bgOpacity).toFixed(2));

    // Color Handling: check if this group preserves distinct frame colors
    const preserved = this.isColorPreserved(key);
    const updateColorUI = (pickerId, txtId, labelId, colorVal, defaultHex) => {
      const picker = document.getElementById(pickerId);
      const txt = document.getElementById(txtId);
      const label = document.getElementById(labelId);
      if (picker && txt) {
        picker.disabled = preserved;
        txt.disabled = preserved;
        picker.style.opacity = preserved ? '0.35' : '1.0';
        txt.style.opacity = preserved ? '0.35' : '1.0';
        const hex = toHexColor(colorVal, defaultHex);
        picker.value = hex;
        txt.value = preserved ? '(Preserved)' : colorVal;
        if (label) label.textContent = preserved ? '(Preserved)' : hex;
      }
    };

    updateColorUI('picker-border-inner-color', 'txt-border-inner-color', 'val-border-inner-color', innerColor, '#38bdf8');
    updateColorUI('picker-border-outer-color', 'txt-border-outer-color', 'val-border-outer-color', outerColor, '#0284c7');
    updateColorUI('picker-border-bg-color', 'txt-border-bg-color', 'val-border-bg-color', bgColor, '#0f172a');
  };

  proto.applyChanges = function() {
    const getNum = (id) => parseFloat(document.getElementById(id)?.value || 0);
    const getStr = (id) => (document.getElementById(id)?.value || '').trim();
    const getBool = (id) => !!document.getElementById(id)?.checked;

    const spread = Math.round(getNum('slider-border-inner-spread'));
    const innerIntensity = getNum('slider-border-inner-intensity');
    const innerSteps = Math.round(getNum('slider-border-inner-steps'));

    const outerEnabled = getBool('chk-border-outer-enabled');
    const blur = Math.round(getNum('slider-border-outer-blur'));
    const outerIntensity = getNum('slider-border-outer-intensity');
    const outerSteps = Math.round(getNum('slider-border-outer-steps') || 3);

    const bgOpacity = getNum('slider-border-bg-opacity');

    const preserved = this.isColorPreserved(this.currentTarget);
    const innerColor = preserved ? null : (getStr('txt-border-inner-color') || getStr('picker-border-inner-color') || '#38bdf8');
    const outerColor = preserved ? null : (getStr('txt-border-outer-color') || getStr('picker-border-outer-color') || '#0284c7');
    const bgColor = preserved ? null : (getStr('txt-border-bg-color') || getStr('picker-border-bg-color') || '#0f172a');

    const cfg = {
      spread, innerIntensity, innerSteps, innerColor,
      outerEnabled, blur, outerIntensity, outerSteps, outerColor,
      bgOpacity, bgColor
    };
    this.groupConfigs[this.currentTarget] = cfg;

    const nodes = this.getTargetNodes(this.currentTarget);
    if (nodes && nodes.length > 0) {
      nodes.forEach(node => {
        this.applyConfigToNode(node, cfg, this.currentTarget);
      });
    }
  };

  proto.bindControls = function() {
    const selTarget = document.getElementById('select-border-frame-target');
    if (selTarget) {
      selTarget.addEventListener('change', (e) => {
        this.syncUIFromTarget(e.target.value);
        if (this.audio) this.audio.playClick();
      });
    }

    const wireSlider = (sliderId, labelId, suffix = '', isFloat = false) => {
      const slider = document.getElementById(sliderId);
      const label = document.getElementById(labelId);
      if (slider && label) {
        slider.addEventListener('input', () => {
          const val = isFloat ? Number(slider.value).toFixed(2) : slider.value;
          label.textContent = `${val}${suffix}`;
          this.applyChanges();
        });
      }
    };

    wireSlider('slider-border-inner-spread', 'val-border-inner-spread', 'px');
    wireSlider('slider-border-inner-intensity', 'val-border-inner-intensity', '', true);
    wireSlider('slider-border-inner-steps', 'val-border-inner-steps');
    wireSlider('slider-border-outer-blur', 'val-border-outer-blur', 'px');
    wireSlider('slider-border-outer-intensity', 'val-border-outer-intensity', '', true);
    wireSlider('slider-border-outer-steps', 'val-border-outer-steps');
    wireSlider('slider-border-bg-opacity', 'val-border-bg-opacity', '', true);

    const chkOuter = document.getElementById('chk-border-outer-enabled');
    if (chkOuter) {
      chkOuter.addEventListener('change', () => {
        this.applyChanges();
        if (this.audio) this.audio.playClick();
      });
    }

    const wireColor = (pickerId, txtId, labelId) => {
      const picker = document.getElementById(pickerId);
      const txt = document.getElementById(txtId);
      const label = document.getElementById(labelId);
      if (picker && txt) {
        picker.addEventListener('input', () => {
          if (this.isColorPreserved(this.currentTarget)) return;
          txt.value = picker.value;
          if (label) label.textContent = picker.value;
          this.applyChanges();
        });
        txt.addEventListener('change', () => {
          if (this.isColorPreserved(this.currentTarget)) return;
          const hex = toHexColor(txt.value, picker.value);
          picker.value = hex;
          if (label) label.textContent = hex;
          this.applyChanges();
        });
      }
    };

    wireColor('picker-border-inner-color', 'txt-border-inner-color', 'val-border-inner-color');
    wireColor('picker-border-outer-color', 'txt-border-outer-color', 'val-border-outer-color');
    wireColor('picker-border-bg-color', 'txt-border-bg-color', 'val-border-bg-color');

    // Copy Button
    const btnCopy = document.getElementById('btn-copy-border-config');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const nodes = this.getTargetNodes(this.currentTarget);
        let style = (nodes && nodes[0]) ? deepClone(nodes[0].style) : null;
        if (!style || Object.keys(style).length === 0) {
          const cfg = this.getGroupConfig(this.currentTarget);
          style = {
            bgColor: cfg.bgColor || '#000000',
            bgOpacity: cfg.bgOpacity,
            innerHighlight: {
              enabled: true,
              color: cfg.innerColor || '#38bdf8',
              sharpEdgeColor: cfg.innerColor || '#38bdf8',
              spread: cfg.spread,
              intensity: cfg.innerIntensity,
              steps: cfg.innerSteps
            },
            outerHighlight: {
              enabled: cfg.outerEnabled,
              color: cfg.outerColor || '#c084fc',
              sharpEdgeColor: cfg.outerColor || '#c084fc',
              blur: cfg.blur,
              intensity: cfg.outerIntensity,
              steps: cfg.outerSteps
            }
          };
        }
        const json = JSON.stringify(style, null, 2);
        navigator.clipboard?.writeText(json).then(() => {
          const prev = btnCopy.textContent;
          btnCopy.textContent = '✅ Copied!';
          setTimeout(() => { btnCopy.textContent = prev; }, 1500);
          if (this.audio) this.audio.playClick();
        }).catch(err => {
          console.warn('Copy error:', err);
        });
      });
    }

    // Reset Button
    const btnReset = document.getElementById('btn-reset-border-config');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        const origList = this.originalStyles[this.currentTarget];
        delete this.groupConfigs[this.currentTarget];
        if (origList && Array.isArray(origList)) {
          origList.forEach(item => {
            if (item.node && item.style) {
              item.node.style = deepClone(item.style);
              item.node.atlasKey = item.atlasKey !== undefined ? item.atlasKey : null;
              if (typeof item.node.invalidateCache === 'function') {
                item.node.invalidateCache();
              }
            }
          });
        }
        this.syncUIFromTarget(this.currentTarget);
        if (this.audio) this.audio.playClick();
      });
    }
  };

  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Border_Tuning_Lab_1.1', global.BorderTuningLab);
  }
})(typeof window !== 'undefined' ? window : this);
