/**
 * @fileoverview cells/hex_ui/Tuning_Drawer_Lab.js - Dual Diagnostics & Aesthetics Drawer Controller
 * @description Coordinates the dual collapsible drawers: Metrics Drawer (Silicon Telemetry)
 * and Tuning Drawer, including independent open/closed toggle states, launcher sync,
 * synchronized side swapping (Left/Right), and live End-Turn Pop-Up tuning controls.
 * Strictly adheres to the 500-line hard cap and modular architecture.
 */

(function(global) {
  'use strict';

  class TuningDrawerLabClass {
    constructor() {
      this.state = null;
      this.dom = null;
      this.audio = null;
      this.metricsOnLeft = true;
    }

    init(state, dom, audio) {
      this.state = state;
      this.dom = dom;
      this.audio = audio || global.AudioSynth;

      this.initMetricsLauncher();
      this.initTuningLauncher();
      this.initSideSwapButtons();
      this.initTabs();
      this.initGameMenuTab();
      this.initUIFramesTab();
      this.initBordersTab();
      if (global.WarpHaloTuningLab) global.WarpHaloTuningLab.init(this.dom, this.audio);
      if (global.AudioTuningLab) global.AudioTuningLab.init(this.dom, this.audio);
      this.initKeyboardShortcuts();
    }

    initMetricsLauncher() {
      const btn = this.dom?.btnToggleMetrics || document.getElementById('btn-toggle-metrics');
      const drawer = this.dom?.metricsDrawer || document.getElementById('metrics-drawer');
      if (btn && drawer) {
        btn.addEventListener('click', () => {
          const isCollapsed = drawer.classList.toggle('collapsed');
          btn.classList.toggle('active', !isCollapsed);
          if (this.audio?.playClick) this.audio.playClick();
        });
      }
    }

    initTuningLauncher() {
      const btn = this.dom?.btnToggleTuning || document.getElementById('btn-toggle-tuning');
      const drawer = this.dom?.tuningDrawer || this.dom?.drawer || document.getElementById('tuning-drawer');
      if (btn && drawer) {
        btn.addEventListener('click', () => {
          const isCollapsed = drawer.classList.toggle('collapsed');
          btn.classList.toggle('active', !isCollapsed);
          if (this.audio?.playClick) this.audio.playClick();
        });
      }
    }

    initSideSwapButtons() {
      const swapButtons = document.querySelectorAll('.btn-swap-drawers, #btn-dock-drawer');
      swapButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          this.swapSides();
          if (this.audio?.playClick) this.audio.playClick();
        });
      });
    }

    swapSides() {
      this.metricsOnLeft = !this.metricsOnLeft;

      const metricsDrawer = this.dom?.metricsDrawer || document.getElementById('metrics-drawer');
      const tuningDrawer = this.dom?.tuningDrawer || this.dom?.drawer || document.getElementById('tuning-drawer');
      const btnMetrics = this.dom?.btnToggleMetrics || document.getElementById('btn-toggle-metrics');
      const btnTuning = this.dom?.btnToggleTuning || document.getElementById('btn-toggle-tuning');

      if (this.metricsOnLeft) {
        // Metrics on LEFT, Tuning on RIGHT (Default initial state)
        if (metricsDrawer) {
          metricsDrawer.classList.remove('dock-right');
          metricsDrawer.classList.add('dock-left');
        }
        if (btnMetrics) {
          btnMetrics.classList.remove('dock-right');
          btnMetrics.classList.add('dock-left');
        }

        if (tuningDrawer) {
          tuningDrawer.classList.remove('dock-left');
          tuningDrawer.classList.add('dock-right');
        }
        if (btnTuning) {
          btnTuning.classList.remove('dock-left');
          btnTuning.classList.add('dock-right');
        }
      } else {
        // Metrics on RIGHT, Tuning on LEFT (Swapped state)
        if (metricsDrawer) {
          metricsDrawer.classList.remove('dock-left');
          metricsDrawer.classList.add('dock-right');
        }
        if (btnMetrics) {
          btnMetrics.classList.remove('dock-left');
          btnMetrics.classList.add('dock-right');
        }

        if (tuningDrawer) {
          tuningDrawer.classList.remove('dock-right');
          tuningDrawer.classList.add('dock-left');
        }
        if (btnTuning) {
          btnTuning.classList.remove('dock-right');
          btnTuning.classList.add('dock-left');
        }
      }
    }



    initBordersTab() {
      if (global.BorderTuningLab) {
        global.BorderTuningLab.init(this.dom, this.audio);
      }
    }

    initKeyboardShortcuts() {}

    // Tab Switching & Game Menu Defaults Export
    initTabs() {
      const drawer = this.dom?.tuningDrawer || this.dom?.drawer || document.getElementById('tuning-drawer');
      if (!drawer) return;
      const tabBtns = drawer.querySelectorAll('.drawer-tabs .drawer-tab-btn');
      const tabPanes = drawer.querySelectorAll('.drawer-tab-pane');

      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const targetId = btn.getAttribute('data-tab');
          tabBtns.forEach(b => b.classList.toggle('active', b === btn));
          tabPanes.forEach(pane => pane.classList.toggle('active', pane.id === targetId));
          if (this.audio?.playClick) this.audio.playClick();
        });
      });
    }



    _copyTextWithFeedback(text, btn, toastMsg) {
      const markCopied = () => {
        if (btn) {
          const orig = btn.dataset.origLabel || btn.textContent;
          btn.dataset.origLabel = orig;
          btn.textContent = '✓ Copied!';
          setTimeout(() => { btn.textContent = orig; }, 1500);
        }
        if (toastMsg && global.GameState?.showToast) global.GameState.showToast(toastMsg);
      };
      const fallbackCopy = () => {
        let copied = false;
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
          document.body.appendChild(ta);
          ta.select();
          copied = !!document.execCommand?.('copy');
          ta.remove();
        } catch (_) {}
        console.log('[TuningDrawerLab Export]\n' + text);
        if (copied) markCopied();
        else if (global.GameState?.showToast) global.GameState.showToast('⚠️ Clipboard blocked — JSON logged to DevTools console.');
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(markCopied).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
    }

    _buildExportMenuConfig() {
      const gsc = global.GameSettingsCanvas;
      const cfg = gsc?.config || {};
      const clone = (o) => JSON.parse(JSON.stringify(o));

      const rawPresets = Array.isArray(cfg.presets) ? cfg.presets.map(p => clone(p)) : [];
      const draft = gsc?.activePresetDraft;
      let targetPresetRef = null;
      if (draft?.draftItem) {
        const dIdx = (cfg.presets || []).indexOf(draft.targetPreset);
        if (dIdx >= 0) {
          rawPresets[dIdx] = clone(draft.draftItem);
          targetPresetRef = rawPresets[dIdx];
        } else {
          rawPresets.push(clone(draft.draftItem));
          targetPresetRef = rawPresets[rawPresets.length - 1];
        }
      }

      // Overlay any open sub-column String/Strain draft edits onto the cloned presets snapshot
      const hist = Array.isArray(gsc?.history) ? gsc.history : [];
      for (const h of hist) {
        const sd = h?.presetDraft;
        if (!sd?.draftItem || !sd?.list) continue;
        const activeTarget = targetPresetRef || rawPresets[Math.max(0, Number(cfg.activePresetIndex || 0))];
        if (!activeTarget) continue;
        for (const grpKey of ['luck', 'blight']) {
          for (const vecKey of ['playfieldItems', 'materialItems']) {
            const origList = (draft?.draftItem || cfg.presets?.[cfg.activePresetIndex || 0])?.[grpKey]?.[vecKey];
            if (sd.list === origList && Array.isArray(activeTarget[grpKey]?.[vecKey])) {
              const iIdx = origList.indexOf(sd.targetItem);
              if (iIdx >= 0) activeTarget[grpKey][vecKey][iIdx] = clone(sd.draftItem);
            }
          }
        }
      }

      const normVec = (it, maxSpawn) => ({
        id: it.id,
        name: it.name || 'Vector',
        turnStart: Math.max(0, Math.min(432, Number(it.turnStart ?? 1))),
        turnInterval: Math.max(1, Math.min(144, Number(it.turnInterval ?? 1))),
        turnEnd: Math.max(1, Math.min(432, Number(it.turnEnd ?? 24))),
        spawnCount: Math.max(1, Math.min(maxSpawn, Number(it.spawnCount ?? 1))),
        chance: Math.max(0, Math.min(100, Number(it.chance ?? 0))),
        dupInterval: Math.max(0, Math.min(144, Number(it.dupInterval ?? 0))),
        tagNumber: String(it.tagNumber || '001').padStart(3, '0'),
        isEndOfMatch: !!it.isEndOfMatch
      });
      const normGroup = (g = {}) => ({
        activePlayfieldIndex: Math.max(0, Number(g.activePlayfieldIndex || 0)),
        activeMaterialIndex: Math.max(0, Number(g.activeMaterialIndex || 0)),
        playfieldItems: (Array.isArray(g.playfieldItems) ? g.playfieldItems : []).map(it => normVec(it, 24)),
        materialItems: (Array.isArray(g.materialItems) ? g.materialItems : []).map(it => normVec(it, 4))
      });

      const presets = rawPresets.map((p, idx) => {
        const m = p.match || {};
        return {
          id: p.id || `preset_${idx + 1}`,
          name: p.name || `Preset ${idx + 1}`,
          tagNumber: String(p.tagNumber || (idx + 1)).padStart(3, '0'),
          isDefault: !!p.isDefault,
          match: {
            materialComposition: m.materialComposition === 'Random' ? 'Random' : 'Even',
            luckComposition: m.luckComposition === 'Random' ? 'Random' : 'Ether',
            startingSpells: Math.max(0, Math.min(3, Number(m.startingSpells ?? 0))),
            rounds: Math.max(12, Math.min(432, Number(m.rounds ?? 144))),
            boardRadius: Math.max(3, Math.min(12, Number(m.boardRadius ?? 6))),
            isEndless: !!m.isEndless
          },
          luck: normGroup(p.luck),
          blight: normGroup(p.blight)
        };
      });

      return {
        playerCount: Math.max(1, Math.min(6, Number(cfg.playerCount || 1))),
        activePresetIndex: Math.max(0, Math.min(Math.max(0, presets.length - 1), Number(cfg.activePresetIndex || 0))),
        presets
      };
    }

    initGameMenuTab() {
      const btnCopy = document.getElementById('btn-copy-game-menu-config');
      if (btnCopy) {
        btnCopy.addEventListener('click', () => {
          const text = JSON.stringify(this._buildExportMenuConfig(), null, 2);
          this._copyTextWithFeedback(text, btnCopy, '📋 Game Menu presets copied as JSON!');
          if (this.audio?.playClick) this.audio.playClick();
        });
      }
      this.initHubPreviewControls();
      this.initHubRootControls();
    }

    initHubRootControls() {
      const slY = document.getElementById('slider-hub-root-text-y');
      const valY = document.getElementById('val-hub-root-text-y');
      if (!slY) return;
      const curY = global.HubCore?.getRootTextOffsetY?.() ?? 3;
      slY.value = curY;
      if (valY) valY.textContent = `${curY} px`;
      slY.addEventListener('input', () => {
        const v = parseInt(slY.value, 10) || 0;
        if (valY) valY.textContent = `${v} px`;
        global.HubCore?.setRootTextOffsetY?.(v);
      });
    }

    initHubPreviewControls() {
      const slW = document.getElementById('slider-hub-title-w');
      const valW = document.getElementById('val-hub-title-w');
      const slY = document.getElementById('slider-hub-title-y');
      const valY = document.getElementById('val-hub-title-y');
      const inpTitle = document.getElementById('input-hub-upper-title');
      const inpInst = document.getElementById('input-hub-instruct-text');
      const btnCopy = document.getElementById('btn-copy-hub-preview-config');
      if (!slW && !slY && !inpTitle && !inpInst && !btnCopy) return;

      const staging = () => global.HubLaunchStaging;
      const cur = staging()?.getPreviewConfig?.() || { titleW: 960, titleOffsetY: 270, upperTitle: 'Puzzle Beta', instructText: '' };
      if (slW) { slW.value = cur.titleW; if (valW) valW.textContent = `${cur.titleW} px`; }
      if (slY) { slY.value = cur.titleOffsetY; if (valY) valY.textContent = `${cur.titleOffsetY} px`; }
      if (inpTitle) inpTitle.value = cur.upperTitle || '';
      if (inpInst) inpInst.value = cur.instructText || '';

      if (slW) slW.addEventListener('input', () => {
        const v = parseInt(slW.value, 10) || 960;
        if (valW) valW.textContent = `${v} px`;
        staging()?.setPreviewConfig?.({ titleW: v });
      });
      if (slY) slY.addEventListener('input', () => {
        const v = parseInt(slY.value, 10) || 270;
        if (valY) valY.textContent = `${v} px`;
        staging()?.setPreviewConfig?.({ titleOffsetY: v });
      });
      if (inpTitle) inpTitle.addEventListener('input', () => {
        staging()?.setPreviewConfig?.({ upperTitle: inpTitle.value });
      });
      if (inpInst) inpInst.addEventListener('input', () => {
        staging()?.setPreviewConfig?.({ instructText: inpInst.value });
      });
      if (btnCopy) btnCopy.addEventListener('click', () => {
        const cfg = Object.assign(
          { rootTextOffsetY: global.HubCore?.getRootTextOffsetY?.() ?? 3 },
          staging()?.getPreviewConfig?.() || {}
        );
        this._copyTextWithFeedback(JSON.stringify(cfg, null, 2), btnCopy, '📋 Hub Preview config copied as JSON!');
        if (this.audio?.playClick) this.audio.playClick();
      });
    }

    initUIFramesTab() {
      const box = document.getElementById('ui-frames-inspector-box');
      const btnCopy = document.getElementById('btn-copy-ui-frames-config');
      if (!box) return;

      const getFramesData = () => {
        const engine = global.HexUIEngine;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const dpr = window.devicePixelRatio || 1;

        const left = engine?.leftSidebar?.dimensions;
        const board = engine?.boardFrame?.dimensions;
        const right = engine?.rightSidebar?.dimensions;
        const leftPos = engine?.leftSidebar?.position;
        const boardPos = engine?.boardFrame?.position;
        const rightPos = engine?.rightSidebar?.position;
        const scale = engine?.hudScale ?? (engine?.root?.scale?.x ?? 1.0);

        const leftW = left ? Math.round(left.wBase) : 0;
        const leftHBody = left ? Math.round(left.hBase) : 0;
        const leftApex = left ? Math.round(left.apex) : 0;
        const leftTotalH = leftHBody + 2 * leftApex;

        const boardW = board ? Math.round(board.wBase) : 0;
        const boardH = board ? Math.round(board.hBase) : 0;

        const rightW = right ? Math.round(right.wBase) : 0;
        const rightHBody = right ? Math.round(right.hBase) : 0;
        const rightApex = right ? Math.round(right.apex) : 0;
        const rightTotalH = rightHBody + 2 * rightApex;

        let leftGap = 0;
        let rightGap = 0;
        if (leftPos && boardPos && left && board) {
          leftGap = Math.round((boardPos.x - board.wBase * 0.5) - (leftPos.x + left.wBase * 0.5));
        }
        if (boardPos && rightPos && board && right) {
          rightGap = Math.round((rightPos.x - right.wBase * 0.5) - (boardPos.x + board.wBase * 0.5));
        }
        const viewH = engine?.viewHeight || h;
        const topScrollGap = board ? Math.round((viewH - board.hBase) * 0.5) : 32;
        const stageScale = global.ResponsiveViewportAdapter?.stageScale ?? 1.0;

        return {
          viewport: { width: w, height: h, dpr, orientation: engine?.isPortrait ? 'portrait (virtual landscape)' : 'landscape' },
          stageScale: Number(stageScale.toFixed(3)),
          hudScale: Number(scale.toFixed(3)),
          leftSidebar: { width: leftW, bodyHeight: leftHBody, apexHeight: leftApex, totalHeight: leftTotalH },
          boardFrame: { width: boardW, height: boardH, topScrollGap },
          rightSidebar: { width: rightW, bodyHeight: rightHBody, apexHeight: rightApex, totalHeight: rightTotalH },
          gaps: { leftGap, rightGap }
        };
      };

      const renderData = () => {
        const d = getFramesData();
        box.textContent =
`[VIEWPORT]
  Browser Area : ${d.viewport.width} × ${d.viewport.height} px (DPR: ${d.viewport.dpr})
  Orientation  : ${d.viewport.orientation}
  HUD Scale    : ${d.hudScale}x

[LEFT SIDEBAR]
  Width        : ${d.leftSidebar.width} px
  Body Height  : ${d.leftSidebar.bodyHeight} px
  Apex Points  : +${d.leftSidebar.apexHeight} px top / +${d.leftSidebar.apexHeight} px btm
  Total Height : ${d.leftSidebar.totalHeight} px

[CENTER BOARD FRAME]
  Width        : ${d.boardFrame.width} px
  Height       : ${d.boardFrame.height} px
  Top/Btm Gap  : ${d.boardFrame.topScrollGap} px

[RIGHT SIDEBAR]
  Width        : ${d.rightSidebar.width} px
  Body Height  : ${d.rightSidebar.bodyHeight} px
  Apex Points  : +${d.rightSidebar.apexHeight} px top / +${d.rightSidebar.apexHeight} px btm
  Total Height : ${d.rightSidebar.totalHeight} px

[GAPS & SPACING]
  Left Gap     : ${d.gaps.leftGap} px
  Right Gap    : ${d.gaps.rightGap} px
  Total Width  : ${d.leftSidebar.width + d.gaps.leftGap + d.boardFrame.width + d.gaps.rightGap + d.rightSidebar.width} px`;
      };

      renderData();
      window.addEventListener('resize', renderData);
      const tabBtn = document.querySelector('[data-tab="tab-ui-frames"]');
      if (tabBtn) tabBtn.addEventListener('click', renderData);
      const drawerBtn = this.dom?.btnToggleTuning || document.getElementById('btn-toggle-tuning');
      if (drawerBtn) drawerBtn.addEventListener('click', () => setTimeout(renderData, 50));

      if (btnCopy) {
        btnCopy.addEventListener('click', () => {
          const text = JSON.stringify(getFramesData(), null, 2);
          this._copyTextWithFeedback(text, btnCopy, '📋 UI Frame config copied as JSON!');
          if (this.audio?.playClick) this.audio.playClick();
        });
      }
    }

    // Safe backwards-compatible stubs for external callers if any
    syncDetailSpell() {}
    initTabDisplay() {}
    initStatPodsTab() {}
    initStatCanvasTab() {}
    initMenuCanvasTab() {}
    initInstructionsTab() {}
  }

  const instance = new TuningDrawerLabClass();
  global.TuningDrawerLab = instance;
  if (global.ROLL_CALL) global.ROLL_CALL.set('Tuning_Drawer_Lab', instance);

})(typeof window !== 'undefined' ? window : this);
