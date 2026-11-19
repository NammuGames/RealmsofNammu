/**
 * @fileoverview cells/hex_ui/Emblem_Tuner_HUD.js - Floating Real-time Seek & Shift Emblem Tuner HUD
 * Draggable, glassmorphism live slider controls (Total Size & Y-Offset) for dialing in emblems at 60 FPS.
 */

(function(global) {
  'use strict';

  class EmblemTunerHUDClass {
    constructor() {
      this.container = null;
      this.visible = false;
      this.activeElement = 'cyber'; // Default to Seek

      // Seek (Cyber) Defaults - Tuned #4 Winner proportions locked, size & yOffset live
      this.cyberDefaults = {
        scale: 0.98,
        yOffset: 0.04
      };
      this.cyberValues = Object.assign({}, this.cyberDefaults);

      // Shift (Wood) Defaults - Tuned Winner proportions locked, size & yOffset live
      this.woodDefaults = {
        scale: 1.08,
        yOffset: -0.01
      };
      this.woodValues = Object.assign({}, this.woodDefaults);
    }

    init() {
      if (typeof document === 'undefined') return;
      this.buildDOM();
      this.bindEvents();
    }

    buildDOM() {
      if (document.getElementById('emblem-tuner-hud')) return;

      const panel = document.createElement('div');
      panel.id = 'emblem-tuner-hud';
      panel.style.cssText = `
        position: fixed;
        top: 60px;
        right: 20px;
        width: 310px;
        background: rgba(15, 23, 42, 0.94);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(56, 189, 248, 0.55);
        border-radius: 12px;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.75), 0 0 20px rgba(56, 189, 248, 0.25);
        z-index: 10001;
        color: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Orbitron", sans-serif;
        font-size: 11px;
        padding: 14px 16px;
        user-select: none;
        display: none;
        transition: opacity 0.18s ease;
      `;

      panel.innerHTML = `
        <!-- HEADER (DRAGGABLE) -->
        <div id="emblem-tuner-header" style="display:flex; justify-content:space-between; align-items:center; cursor:move; border-bottom:1px solid rgba(56,189,248,0.25); padding-bottom:8px; margin-bottom:10px;">
          <div style="font-weight:700; font-size:12px; color:#38bdf8; display:flex; align-items:center; gap:6px; letter-spacing:0.5px;">
            <span>🔮</span> Emblem Aesthetics Tuner
          </div>
          <button id="btn-tuner-close" style="background:none; border:none; color:#94a3b8; font-size:14px; cursor:pointer; line-height:1; padding:2px 4px;">✕</button>
        </div>

        <!-- ELEMENT TABS (SEEK vs SHIFT) -->
        <div style="display:flex; gap:6px; margin-bottom:12px; background:rgba(30,41,59,0.7); padding:3px; border-radius:6px; border:1px solid rgba(56,189,248,0.25);">
          <button id="btn-tab-cyber" style="flex:1; background:rgba(56,189,248,0.2); border:1px solid #38bdf8; color:#38bdf8; border-radius:4px; font-size:10px; font-weight:700; padding:5px 0; cursor:pointer; transition:all 0.15s ease;">
            🔮 Seek (Cyber)
          </button>
          <button id="btn-tab-wood" style="flex:1; background:transparent; border:1px solid transparent; color:#94a3b8; border-radius:4px; font-size:10px; font-weight:600; padding:5px 0; cursor:pointer; transition:all 0.15s ease;">
            🌿 Shift (Wood)
          </button>
        </div>

        <!-- PANE: SEEK / CYBER -->
        <div id="pane-cyber" style="display:flex; flex-direction:column; gap:10px;">
          <div style="font-size:10px; color:#94a3b8; background:rgba(30,41,59,0.5); padding:6px 8px; border-radius:4px; border-left:2px solid #38bdf8;">
            Tuning: <strong style="color:#f8fafc;">Seek (Cyber)</strong> • Variant #4 (Tuned Seeker Default)
          </div>

          <!-- 1. Seek Total Size (Scale) -->
          <div>
            <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
              <span style="color:#cbd5e1;">Total Size (Scale)</span>
              <span id="lbl-cyber-scale" style="color:#38bdf8; font-family:monospace; font-weight:700;">0.98x</span>
            </div>
            <input type="range" id="slider-cyber-scale" min="0.50" max="1.80" step="0.01" value="0.98" style="width:100%; accent-color:#38bdf8; cursor:pointer;">
          </div>

          <!-- 2. Seek Vertical Y-Offset -->
          <div>
            <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
              <span style="color:#cbd5e1;">Vertical Y-Offset</span>
              <span id="lbl-cyber-yOffset" style="color:#38bdf8; font-family:monospace; font-weight:700;">0.04</span>
            </div>
            <input type="range" id="slider-cyber-yOffset" min="-0.30" max="0.30" step="0.01" value="0.04" style="width:100%; accent-color:#38bdf8; cursor:pointer;">
          </div>

          <!-- Actions -->
          <div style="display:flex; gap:8px; margin-top:6px;">
            <button id="btn-cyber-copy" style="flex:1.4; background:rgba(56,189,248,0.18); border:1px solid #38bdf8; color:#38bdf8; border-radius:6px; font-weight:700; font-size:11px; padding:6px 10px; cursor:pointer;" title="Copy configuration to clipboard">
              📋 Copy Seek Config
            </button>
            <button id="btn-cyber-reset" style="flex:0.9; background:rgba(148,163,184,0.12); border:1px solid rgba(148,163,184,0.4); color:#94a3b8; border-radius:6px; font-weight:600; font-size:11px; padding:6px 8px; cursor:pointer;" title="Reset to defaults">
              ↺ Reset
            </button>
          </div>
        </div>

        <!-- PANE: SHIFT / WOOD -->
        <div id="pane-wood" style="display:none; flex-direction:column; gap:10px;">
          <div style="font-size:10px; color:#94a3b8; background:rgba(30,41,59,0.5); padding:6px 8px; border-radius:4px; border-left:2px solid #22c55e;">
            Tuning: <strong style="color:#f8fafc;">Shift (Wood)</strong> • Variant #3 (Deep Bodhi Trunk)
          </div>

          <!-- 1. Wood Total Size (Scale) -->
          <div>
            <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
              <span style="color:#cbd5e1;">Total Size (Scale)</span>
              <span id="lbl-wood-scale" style="color:#4ade80; font-family:monospace; font-weight:700;">1.08x</span>
            </div>
            <input type="range" id="slider-wood-scale" min="0.50" max="1.80" step="0.01" value="1.08" style="width:100%; accent-color:#22c55e; cursor:pointer;">
          </div>

          <!-- 2. Wood Vertical Y-Offset -->
          <div>
            <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
              <span style="color:#cbd5e1;">Vertical Y-Offset</span>
              <span id="lbl-wood-yOffset" style="color:#4ade80; font-family:monospace; font-weight:700;">-0.01</span>
            </div>
            <input type="range" id="slider-wood-yOffset" min="-0.40" max="0.40" step="0.01" value="-0.01" style="width:100%; accent-color:#22c55e; cursor:pointer;">
          </div>

          <!-- Actions -->
          <div style="display:flex; gap:8px; margin-top:6px;">
            <button id="btn-wood-copy" style="flex:1.4; background:rgba(34,197,94,0.18); border:1px solid #22c55e; color:#4ade80; border-radius:6px; font-weight:700; font-size:11px; padding:6px 10px; cursor:pointer;" title="Copy configuration to clipboard">
              📋 Copy Shift Config
            </button>
            <button id="btn-wood-reset" style="flex:0.9; background:rgba(148,163,184,0.12); border:1px solid rgba(148,163,184,0.4); color:#94a3b8; border-radius:6px; font-weight:600; font-size:11px; padding:6px 8px; cursor:pointer;" title="Reset to defaults">
              ↺ Reset
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(panel);
      this.container = panel;
    }

    bindEvents() {
      const panel = this.container;
      if (!panel) return;

      const header = document.getElementById('emblem-tuner-header');
      const btnClose = document.getElementById('btn-tuner-close');
      const btnTabCyber = document.getElementById('btn-tab-cyber');
      const btnTabWood = document.getElementById('btn-tab-wood');

      if (btnClose) btnClose.addEventListener('click', () => this.close());

      if (btnTabCyber) btnTabCyber.addEventListener('click', () => this.switchTab('cyber'));
      if (btnTabWood) btnTabWood.addEventListener('click', () => this.switchTab('wood'));

      // --- CYBER (SEEK) EVENT LISTENERS ---
      const sliderCyberScale = document.getElementById('slider-cyber-scale');
      const lblCyberScale = document.getElementById('lbl-cyber-scale');
      if (sliderCyberScale && lblCyberScale) {
        sliderCyberScale.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          this.cyberValues.scale = val;
          lblCyberScale.textContent = val.toFixed(2) + 'x';
          this.applyLiveCyber();
        });
      }

      const sliderCyberYOffset = document.getElementById('slider-cyber-yOffset');
      const lblCyberYOffset = document.getElementById('lbl-cyber-yOffset');
      if (sliderCyberYOffset && lblCyberYOffset) {
        sliderCyberYOffset.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          this.cyberValues.yOffset = val;
          lblCyberYOffset.textContent = val.toFixed(2);
          this.applyLiveCyber();
        });
      }

      const btnCyberCopy = document.getElementById('btn-cyber-copy');
      if (btnCyberCopy) btnCyberCopy.addEventListener('click', () => this.copyCyberConfig());

      const btnCyberReset = document.getElementById('btn-cyber-reset');
      if (btnCyberReset) btnCyberReset.addEventListener('click', () => this.resetCyber());

      // --- WOOD (SHIFT) EVENT LISTENERS ---
      const sliderWoodScale = document.getElementById('slider-wood-scale');
      const lblWoodScale = document.getElementById('lbl-wood-scale');
      if (sliderWoodScale && lblWoodScale) {
        sliderWoodScale.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          this.woodValues.scale = val;
          lblWoodScale.textContent = val.toFixed(2) + 'x';
          this.applyLiveWood();
        });
      }

      const sliderWoodYOffset = document.getElementById('slider-wood-yOffset');
      const lblWoodYOffset = document.getElementById('lbl-wood-yOffset');
      if (sliderWoodYOffset && lblWoodYOffset) {
        sliderWoodYOffset.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          this.woodValues.yOffset = val;
          lblWoodYOffset.textContent = val.toFixed(2);
          this.applyLiveWood();
        });
      }

      const btnWoodCopy = document.getElementById('btn-wood-copy');
      if (btnWoodCopy) btnWoodCopy.addEventListener('click', () => this.copyWoodConfig());

      const btnWoodReset = document.getElementById('btn-wood-reset');
      if (btnWoodReset) btnWoodReset.addEventListener('click', () => this.resetWood());

      // Draggable Header
      if (header) {
        let isDragging = false, startX = 0, startY = 0, initLeft = 0, initTop = 0;
        header.addEventListener('mousedown', (e) => {
          if (e.target.tagName === 'BUTTON') return;
          isDragging = true;
          startX = e.clientX;
          startY = e.clientY;
          const rect = panel.getBoundingClientRect();
          initLeft = rect.left;
          initTop = rect.top;
          panel.style.right = 'auto';
          panel.style.left = `${initLeft}px`;
          panel.style.top = `${initTop}px`;
        });
        window.addEventListener('mousemove', (e) => {
          if (!isDragging) return;
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          panel.style.left = `${Math.max(10, Math.min(window.innerWidth - 320, initLeft + dx))}px`;
          panel.style.top = `${Math.max(10, Math.min(window.innerHeight - 80, initTop + dy))}px`;
        });
        window.addEventListener('mouseup', () => { isDragging = false; });
      }

      // Hotkey 'T' (when not in text input)
      window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          this.toggle();
        }
      });
    }

    switchTab(elemKey) {
      this.activeElement = elemKey;
      const paneCyber = document.getElementById('pane-cyber');
      const paneWood = document.getElementById('pane-wood');
      const btnTabCyber = document.getElementById('btn-tab-cyber');
      const btnTabWood = document.getElementById('btn-tab-wood');

      if (elemKey === 'wood') {
        if (paneWood) paneWood.style.display = 'flex';
        if (paneCyber) paneCyber.style.display = 'none';
        if (btnTabWood) {
          btnTabWood.style.background = 'rgba(34,197,94,0.2)';
          btnTabWood.style.borderColor = '#22c55e';
          btnTabWood.style.color = '#4ade80';
        }
        if (btnTabCyber) {
          btnTabCyber.style.background = 'transparent';
          btnTabCyber.style.borderColor = 'transparent';
          btnTabCyber.style.color = '#94a3b8';
        }
        this.applyLiveWood();
      } else {
        if (paneWood) paneWood.style.display = 'none';
        if (paneCyber) paneCyber.style.display = 'flex';
        if (btnTabCyber) {
          btnTabCyber.style.background = 'rgba(56,189,248,0.2)';
          btnTabCyber.style.borderColor = '#38bdf8';
          btnTabCyber.style.color = '#38bdf8';
        }
        if (btnTabWood) {
          btnTabWood.style.background = 'transparent';
          btnTabWood.style.borderColor = 'transparent';
          btnTabWood.style.color = '#94a3b8';
        }
        this.applyLiveCyber();
      }
    }

    applyLiveCyber() {
      const renderer = global.SigilEmblemRenderer;
      if (!renderer) return;
      if (!renderer.liveTuning) renderer.liveTuning = {};
      renderer.liveTuning.cyber = Object.assign({}, this.cyberValues);
      renderer.clearCache();

      if (global.SigilEmblemStudio?.isOpen?.()) {
        global.SigilEmblemStudio.buildVariantsStage();
      }
      if (global.BoardRenderer?.render) {
        global.BoardRenderer.render();
      }
    }

    applyLiveWood() {
      const renderer = global.SigilEmblemRenderer;
      if (!renderer) return;
      if (!renderer.liveTuning) renderer.liveTuning = {};
      renderer.liveTuning.wood = Object.assign({}, this.woodValues);
      renderer.clearCache();

      if (global.SigilEmblemStudio?.isOpen?.()) {
        global.SigilEmblemStudio.buildVariantsStage();
      }
      if (global.BoardRenderer?.render) {
        global.BoardRenderer.render();
      }
    }

    toggle() {
      this.visible ? this.close() : this.open();
    }

    open() {
      if (!this.container) this.init();
      if (!this.container) return;

      const curElem = global.SigilEmblemStudio?.selectedElement?.key;
      if (curElem === 'wood' || curElem === 'cyber') {
        this.switchTab(curElem);
      } else {
        this.switchTab(this.activeElement);
      }

      this.container.style.display = 'block';
      this.visible = true;
      const launcher = document.getElementById('btn-toggle-emblem-tuner');
      if (launcher) launcher.classList.add('active');
    }

    close() {
      if (!this.container) return;
      this.container.style.display = 'none';
      this.visible = false;
      const launcher = document.getElementById('btn-toggle-emblem-tuner');
      if (launcher) launcher.classList.remove('active');
    }

    resetCyber() {
      this.cyberValues = Object.assign({}, this.cyberDefaults);
      const elScale = document.getElementById('slider-cyber-scale');
      const lblScale = document.getElementById('lbl-cyber-scale');
      if (elScale) elScale.value = this.cyberValues.scale;
      if (lblScale) lblScale.textContent = this.cyberValues.scale.toFixed(2) + 'x';

      const elY = document.getElementById('slider-cyber-yOffset');
      const lblY = document.getElementById('lbl-cyber-yOffset');
      if (elY) elY.value = this.cyberValues.yOffset;
      if (lblY) lblY.textContent = this.cyberValues.yOffset.toFixed(2);

      this.applyLiveCyber();
      this.showToast('↺ Reset Seek Sliders to Default');
    }

    copyCyberConfig() {
      const v = this.cyberValues;
      const jsonStr = JSON.stringify(v, null, 2);
      const text = `// Seek Emblem Tuned Config:\n${jsonStr}`;

      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => this.showToast('✔ Copied Seek Config to Clipboard!'));
      } else {
        console.log(text);
        this.showToast('✔ Logged Seek Config to Console');
      }
    }

    resetWood() {
      this.woodValues = Object.assign({}, this.woodDefaults);
      const elScale = document.getElementById('slider-wood-scale');
      const lblScale = document.getElementById('lbl-wood-scale');
      if (elScale) elScale.value = this.woodValues.scale;
      if (lblScale) lblScale.textContent = this.woodValues.scale.toFixed(2) + 'x';

      const elY = document.getElementById('slider-wood-yOffset');
      const lblY = document.getElementById('lbl-wood-yOffset');
      if (elY) elY.value = this.woodValues.yOffset;
      if (lblY) lblY.textContent = this.woodValues.yOffset.toFixed(2);

      this.applyLiveWood();
      this.showToast('↺ Reset Shift Sliders to Default');
    }

    copyWoodConfig() {
      const v = this.woodValues;
      const jsonStr = JSON.stringify(v, null, 2);
      const text = `// Shift Emblem Tuned Config:\n${jsonStr}`;

      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => this.showToast('✔ Copied Shift Config to Clipboard!'));
      } else {
        console.log(text);
        this.showToast('✔ Logged Shift Config to Console');
      }
    }

    showToast(msg) {
      if (global.SigilEmblemStudio?.showToast) {
        global.SigilEmblemStudio.showToast(msg);
      } else if (global.GameState?.showToast) {
        global.GameState.showToast(msg);
      }
    }
  }

  const instance = new EmblemTunerHUDClass();
  global.EmblemTunerHUD = instance;
  if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', () => instance.init());
    } else {
      instance.init();
    }
  }
})(typeof window !== 'undefined' ? window : this);
