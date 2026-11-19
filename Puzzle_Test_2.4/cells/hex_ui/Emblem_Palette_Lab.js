/**
 * @fileoverview cells/hex_ui/Emblem_Palette_Lab.js - 12-Color Emblem Palette Orchestration Lab
 * @description Manages Tab 3 of the Tuning Drawer: real-time palette card generation,
 * two-way hex/color-picker synchronization, JSON clipboard export, reset defaults,
 * and 3D pyramid emblem vibrancy live tuning.
 */

(function(global) {
  'use strict';

  const COSMOS_12_COLORS = [
    { key: 'red',     name: 'Red',     defaultHex: '#ff3333', prim: 'Fire',  sec: 'Heat' },
    { key: 'blue',    name: 'Blue',    defaultHex: '#3d6eff', prim: 'Water', sec: 'Ice' },
    { key: 'yellow',  name: 'Yellow',  defaultHex: '#fff700', prim: 'Air',   sec: 'Storm' },
    { key: 'purple',  name: 'Purple',  defaultHex: '#953ffd', prim: 'Stone', sec: 'Wood' },
    { key: 'orange',  name: 'Orange',  defaultHex: '#ff9214', prim: 'Storm', sec: 'Cyber' },
    { key: 'green',   name: 'Green',   defaultHex: '#0abd0d', prim: 'Wood',  sec: 'Feral' },
    { key: 'black',   name: 'Black',   defaultHex: '#000000', prim: 'Dark',  sec: 'Water' },
    { key: 'white',   name: 'White',   defaultHex: '#ffffff', prim: 'Light', sec: 'Fire' },
    { key: 'grey',    name: 'Grey',    defaultHex: '#b8d1f4', prim: 'Cyber', sec: 'Air' },
    { key: 'brown',   name: 'Brown',   defaultHex: '#a66a26', prim: 'Feral', sec: 'Stone' },
    { key: 'magenta', name: 'Magenta', defaultHex: '#eb66ff', prim: 'Heat',  sec: 'Light' },
    { key: 'cyan',    name: 'Cyan',    defaultHex: '#06b6d4', prim: 'Ice',   sec: 'Dark' }
  ];

  class EmblemPaletteLabClass {
    constructor() {
      this.state = null;
      this.dom = null;
      this.audio = null;
    }

    init(state, dom, audio) {
      this.state = state;
      this.dom = dom;
      this.audio = audio || global.AudioSynth;
      this.initCards();
      this.initEvents();
    }

    applyColorChange(key, newHex, sourceInput) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(newHex)) return;
      newHex = newHex.toLowerCase();

      if (global.COSMOS_PALETTE) global.COSMOS_PALETTE[key] = newHex;
      if (global.SigilEmblemStudio?.refreshColors) global.SigilEmblemStudio.refreshColors();

      const picker = document.getElementById(`picker-${key}`);
      const hexInput = document.getElementById(`hex-${key}`);
      if (picker && sourceInput !== 'picker') picker.value = newHex;
      if (hexInput && sourceInput !== 'text') hexInput.value = newHex.toUpperCase();
    }

    initCards() {
      const container = document.getElementById('color-palette-cards');
      if (!container) return;
      container.innerHTML = '';

      COSMOS_12_COLORS.forEach(item => {
        const currentHex = (global.COSMOS_PALETTE && global.COSMOS_PALETTE[item.key]) || item.defaultHex;
        const card = document.createElement('div');
        card.className = 'color-card';
        card.id = `color-card-${item.key}`;
        card.innerHTML = `
          <div class="color-card-top">
            <div class="color-card-identity">
              <input type="color" class="color-picker-swatch" id="picker-${item.key}" data-key="${item.key}" value="${currentHex}">
              <span class="color-name-label">${item.name}</span>
            </div>
            <input type="text" class="color-hex-input" id="hex-${item.key}" data-key="${item.key}" value="${currentHex.toUpperCase()}" maxlength="7" spellcheck="false">
          </div>
          <div class="color-entity-tags">
            <span class="entity-tag tag-prim" title="Elemental Primary (Facets, Silhouette, Corner Beads)">Prim: ${item.prim}</span>
            <span class="entity-tag tag-sec" title="Elemental Secondary (Ridge Struts, Basin BG)">Sec: ${item.sec}</span>
          </div>
        `;
        container.appendChild(card);
      });
    }

    initEvents() {
      const container = document.getElementById('color-palette-cards');
      if (container) {
        container.addEventListener('input', (e) => {
          const target = e.target;
          if (target.classList.contains('color-picker-swatch')) {
            this.applyColorChange(target.dataset.key, target.value, 'picker');
          } else if (target.classList.contains('color-hex-input')) {
            let val = target.value.trim();
            if (!val.startsWith('#')) val = '#' + val;
            if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
              this.applyColorChange(target.dataset.key, val, 'text');
            }
          }
        });

        container.addEventListener('change', (e) => {
          const target = e.target;
          if (target.classList.contains('color-hex-input')) {
            let val = target.value.trim();
            if (!val.startsWith('#')) val = '#' + val;
            const key = target.dataset.key;
            if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
              this.applyColorChange(key, val, 'text');
            } else {
              const cur = (global.COSMOS_PALETTE && global.COSMOS_PALETTE[key]) || '#ffffff';
              target.value = cur.toUpperCase();
            }
          }
        });
      }

      const btnCopy = document.getElementById('btn-copy-palette');
      if (btnCopy) {
        btnCopy.addEventListener('click', () => {
          const lines = ['=== 12-COLOR EMBLEM PALETTE ==='];
          const currentPalette = {};
          COSMOS_12_COLORS.forEach(item => {
            const hex = (global.COSMOS_PALETTE && global.COSMOS_PALETTE[item.key]) || item.defaultHex;
            currentPalette[item.key] = hex;
            lines.push(`• ${item.name.padEnd(8, ' ')}: ${hex.toUpperCase()} (Prim: ${item.prim}, Sec: ${item.sec})`);
          });
          lines.push(`• Pyramid Vibrancy: ${this.state.pyramidVibrancy.toFixed(2)}x`);
          lines.push('\nJSON Configuration:\n' + JSON.stringify(currentPalette, null, 2));
          const fullText = lines.join('\n');

          const studio = global.SigilEmblemStudio;
          if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(fullText).then(() => {
              if (studio) studio.showToast('✔ Copied 12-Color Emblem Palette to Clipboard!');
            }).catch(() => { if (studio) studio.fallbackCopy(fullText); });
          } else {
            if (studio) studio.fallbackCopy(fullText);
          }
          if (this.audio) this.audio.playFortify();
        });
      }

      const btnReset = document.getElementById('btn-reset-palette');
      if (btnReset) {
        btnReset.addEventListener('click', () => {
          COSMOS_12_COLORS.forEach(item => this.applyColorChange(item.key, item.defaultHex));
          this.state.pyramidVibrancy = 1.75;
          if (this.dom.sliderPyramidVibrancy) this.dom.sliderPyramidVibrancy.value = '1.75';
          if (this.dom.valPyramidVibrancy) this.dom.valPyramidVibrancy.textContent = '1.75x';
          if (global.SigilEmblemRenderer) global.SigilEmblemRenderer.vibrancy = 1.75;
          this.initCards();
          if (global.SigilEmblemStudio?.refreshColors) global.SigilEmblemStudio.refreshColors();
          if (global.SigilEmblemStudio) global.SigilEmblemStudio.showToast('✔ Reset Emblem Colors & Vibrancy to Base Defaults');
          if (this.audio) this.audio.playClick();
        });
      }

      if (this.dom.sliderPyramidVibrancy) {
        this.dom.sliderPyramidVibrancy.addEventListener('input', (e) => {
          this.state.pyramidVibrancy = parseFloat(e.target.value);
          if (global.SigilEmblemRenderer) global.SigilEmblemRenderer.vibrancy = this.state.pyramidVibrancy;
          if (this.dom.valPyramidVibrancy) this.dom.valPyramidVibrancy.textContent = this.state.pyramidVibrancy.toFixed(2) + 'x';
          if (global.SigilEmblemStudio?.refreshColors) global.SigilEmblemStudio.refreshColors();
        });
      }
    }
  }

  const instance = new EmblemPaletteLabClass();
  global.EmblemPaletteLab = instance;
  if (global.ROLL_CALL) global.ROLL_CALL.set('Emblem_Palette_Lab', instance);

})(typeof window !== 'undefined' ? window : this);
