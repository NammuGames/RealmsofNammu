/**
 * @fileoverview cells/Hub_Launch_Staging.js - Hub Preview Canvas & 4-Step Launch Choreography
 * @description Coordinates the Hub -> Puzzle launch experience inside the isolated Hub Macro-Layer:
 * 1. Opens a full Nook-architecture green hex canvas (Instructions Frame + linked Upper/Lower Title Bars)
 *    with zero upfront loading so browsing/backing out stays at locked 60fps.
 * 2. Step 0: Clicking "Enter" (or pressing Enter) runs time-sliced script load + invisible Base Macro-Layer
 *    mount tracking real-time 0% -> 100% progress.
 * 3. Steps 1 & 2 (3-HB each): Fake-shell sidebar extend + Hub fade-out, then sidebar drift + board widen.
 * 4. Steps 3a & 3b (3-HB each): Description contents fade out and Root Game Menu fades in inside the same
 *    960x800 frame while Base Macro-Layer outer frames & ghosted sidebar buttons fade in over 6-HB, then
 *    activates Return & Confirm (+1-HB).
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const FONT_SCI_FAE = '"Sci-Fae", "SciFaePseudoScript10", sans-serif';
  const NOOK_DETAIL = {
    canvasW: 960, canvasH: 800, canvasApex: 220,
    titleH: 83, titleApex: 24, titleTextSize: 54, titleTextY: 3,
    instructW: 733, instructH: 380, instructApex: 116,
    instructTextSize: 45, instructLineHeight: 60, instructTextWidth: 800, instructTextY: -2
  };
  const DEFAULT_PREVIEW_CONFIG = {
    titleW: 960, titleOffsetY: 270, upperTitle: 'Puzzle Beta',
    instructText: 'Arrange Magic Components to create Elemental Spells, and hold back the spreading Blight across solo or online arenas.'
  };

  function wrapCanvasText(ctx, text, x, yOffset, maxWidth, lineHeight) {
    if (!text) return;
    const lines = [];
    for (const para of String(text).split('\n')) {
      let cur = '';
      for (const word of para.split(' ').filter(Boolean)) {
        const test = cur ? `${cur} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = word; }
        else cur = test;
      }
      if (cur) lines.push(cur);
    }
    const startY = yOffset - ((lines.length - 1) * lineHeight * 0.5);
    lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineHeight));
  }

  class HubLaunchStagingClass {
    constructor() {
      this.isRunning = false; this.enterQueued = false;
      this.preloadState = 'idle'; this.preloadPct = 0;
      this.scrimNode = null; this.popupNode = null; this.upperTitleNode = null; this.instructNode = null; this.enterBtn = null;
      this.shellsNode = null;
      this._preparePromise = null; this._hubCore = null; this._originNode = null; this._keyHandler = null;
      this.previewConfig = Object.assign({}, DEFAULT_PREVIEW_CONFIG);
    }

    getPreviewConfig() { return Object.assign({}, this.previewConfig); }

    setPreviewConfig(updates = {}) {
      if (!updates || typeof updates !== 'object') return;
      if (updates.titleW !== undefined) this.previewConfig.titleW = Math.max(180, Math.min(1160, Number(updates.titleW) || DEFAULT_PREVIEW_CONFIG.titleW));
      if (updates.titleOffsetY !== undefined) this.previewConfig.titleOffsetY = Math.max(180, Math.min(355, Number(updates.titleOffsetY) || DEFAULT_PREVIEW_CONFIG.titleOffsetY));
      if (updates.upperTitle !== undefined) this.previewConfig.upperTitle = String(updates.upperTitle);
      if (updates.instructText !== undefined) this.previewConfig.instructText = String(updates.instructText);
      this._syncPreviewLayout();
    }

    _syncPreviewLayout() {
      const cfg = this.previewConfig;
      if (this.upperTitleNode) { this.upperTitleNode.setDimensions(cfg.titleW, NOOK_DETAIL.titleH, NOOK_DETAIL.titleApex, 'flat'); this.upperTitleNode.position.y = -cfg.titleOffsetY; }
      if (this.enterBtn) { this.enterBtn.setDimensions(cfg.titleW, NOOK_DETAIL.titleH, NOOK_DETAIL.titleApex, 'flat'); this.enterBtn.position.y = cfg.titleOffsetY; }
      this._hubCore?.stageNode?.updateTransforms?.();
    }

    startPuzzleSequence(hubCore, originNode) {
      if (this.isRunning || (this.popupNode && this.popupNode.parent)) return;
      const engine = hubCore?.ctx?.engine || global.HexUIEngine;
      const loader = hubCore?.ctx?.loader || global.HubGameLoader;
      if (!engine || !loader || !global.HexNode || !global.HexTraits) return;
      this._hubCore = hubCore;
      this._originNode = originNode || hubCore.branchNodes?.[1];
      this.enterQueued = false;
      this.preloadState = loader.preparedGames?.has('puzzle') ? 'ready' : 'idle';
      this.preloadPct = this.preloadState === 'ready' ? 100 : 0;
      this._lockHubButtons(hubCore, true);
      this._openDescriptionPopup(hubCore, engine);
      this._bindPreviewKeys();
    }

    async _runStep0Prepare(loader) {
      if (!loader) return false;
      if (loader.preparedGames?.has('puzzle')) {
        this.preloadState = 'ready';
        this.preloadPct = 100;
        return true;
      }
      if (this._preparePromise) return this._preparePromise;

      this.preloadState = 'loading';
      this.preloadPct = 0;

      const p = (async () => {
        const ok = await loader.prepareGame('puzzle', {
          timeSliced: true,
          onPercent: (pct) => { this.preloadPct = pct; }
        });
        if (!ok) throw new Error('Puzzle prepare returned false.');
        this.preloadPct = 100;
        this.preloadState = 'ready';
        if (typeof requestAnimationFrame === 'function') {
          await new Promise((r) => requestAnimationFrame(r));
        }
        return true;
      })().catch((err) => {
        console.error('[Hub_Launch_Staging] Step 0 load/mount failed:', err);
        this.preloadState = 'error';
        this.enterQueued = false;
        if (this.popupNode?.parent) this._bindPreviewKeys();
        return false;
      }).finally(() => {
        this._preparePromise = null;
      });

      this._preparePromise = p;
      return p;
    }

    _lockHubButtons(hubCore, locked) {
      const setLocked = (n) => { const b = n?.getTrait?.('button'); if (b) b.disabled = locked; };
      setLocked(hubCore?.rootNode);
      hubCore?.branchNodes?.forEach(setLocked);
    }

    _bindPreviewKeys() {
      this._unbindPreviewKeys();
      this._keyHandler = (e) => {
        if (!this.popupNode?.parent) return;
        const tag = e.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
        if (e.key === 'Enter') { e.preventDefault(); this._onEnterClicked(); }
        else if (e.key === 'Escape') { e.preventDefault(); if (!this.isRunning && !this.enterQueued) this._closePreviewPopup(); }
      };
      window.addEventListener('keydown', this._keyHandler, true);
    }

    _unbindPreviewKeys() {
      if (this._keyHandler) { window.removeEventListener('keydown', this._keyHandler, true); this._keyHandler = null; }
    }

    _makeGreenFrameStyle(bgColor = '#000000', bgOpacity = 0.90) {
      return {
        bgColor, bgOpacity,
        innerHighlight: { enabled: true, color: '#10f000', sharpEdgeColor: '#10f000', spread: 8, intensity: 0.80, steps: 3 },
        outerHighlight: { enabled: false }
      };
    }

    _openDescriptionPopup(hubCore, engine) {
      const HexNode = global.HexNode, { ButtonTrait } = global.HexTraits, stageNode = hubCore.stageNode;
      if (!stageNode) return;
      const self = this, cfg = this.previewConfig;

      const scrim = new HexNode({
        id: 'hub-preview-scrim', position: { x: 0, y: 0 }, wBase: 3200, hBase: 2000, apex: 0, orientation: 'flat',
        style: { bgColor: '#000000', bgOpacity: 0.52, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
      });
      scrim.addTrait(new ButtonTrait({ hoverOutline: false, soundClick: false, onClick: () => { if (!self.isRunning && !self.enterQueued) self._closePreviewPopup(); } }));

      const popup = new HexNode({
        id: 'hub-preview-popup', position: { x: 0, y: 0 },
        wBase: NOOK_DETAIL.canvasW, hBase: NOOK_DETAIL.canvasH, apex: NOOK_DETAIL.canvasApex,
        orientation: 'flat', clipContent: true, style: this._makeGreenFrameStyle('rgba(5, 10, 20, 1.0)', 1.0)
      });
      popup.isCustomSized = true;
      popup.addTrait(new ButtonTrait({ hoverOutline: false, soundClick: false }));

      const instructNode = new HexNode({
        id: 'hub-preview-instruct', position: { x: 0, y: 0 },
        wBase: NOOK_DETAIL.instructW, hBase: NOOK_DETAIL.instructH, apex: NOOK_DETAIL.instructApex,
        orientation: 'flat', inert: true, style: this._makeGreenFrameStyle('#000000', 0.90)
      });
      instructNode.addTrait({
        name: 'hub-instruct-text',
        render(ctx) {
          ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.font = `400 ${NOOK_DETAIL.instructTextSize}px ${FONT_SCI_FAE}`; ctx.fillStyle = '#ffffff';
          wrapCanvasText(ctx, self.previewConfig.instructText, 0, NOOK_DETAIL.instructTextY, NOOK_DETAIL.instructTextWidth, NOOK_DETAIL.instructLineHeight);
          ctx.restore();
        }
      });

      const makeTitleBar = (id, y, inert, getLabel, getColor) => {
        const bar = new HexNode({
          id, position: { x: 0, y }, wBase: cfg.titleW, hBase: NOOK_DETAIL.titleH, apex: NOOK_DETAIL.titleApex,
          orientation: 'flat', inert, style: this._makeGreenFrameStyle('#000000', 0.90)
        });
        bar.addTrait({
          name: `${id}-text`,
          render(ctx) {
            ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = `400 ${NOOK_DETAIL.titleTextSize}px ${FONT_SCI_FAE}`; ctx.fillStyle = getColor();
            ctx.fillText(getLabel(), 0, NOOK_DETAIL.titleTextY);
            ctx.restore();
          }
        });
        return bar;
      };

      const upperTitleNode = makeTitleBar('hub-preview-upper-title', -cfg.titleOffsetY, true, () => self.previewConfig.upperTitle || '', () => '#ffffff');
      const enterBtn = makeTitleBar(
        'hub-preview-enter-btn', cfg.titleOffsetY, false,
        () => (self.preloadState === 'error' ? 'Retry' : (self.enterQueued ? `${self.preloadPct}%` : 'Enter')),
        () => (self.preloadState === 'error' ? '#f87171' : '#ffffff')
      );
      enterBtn.isSidebarButton = true;
      enterBtn.addTrait(new ButtonTrait({ hoverGlowColor: '#ff9214', onClick: () => self._onEnterClicked() }));

      popup.addChild(instructNode); popup.addChild(upperTitleNode); popup.addChild(enterBtn);
      stageNode.addChild(scrim); stageNode.addChild(popup);
      stageNode.updateTransforms();

      this.scrimNode = scrim; this.popupNode = popup; this.instructNode = instructNode; this.upperTitleNode = upperTitleNode; this.enterBtn = enterBtn;
      if (global.TweenOrchestrator?.expandFrame) global.TweenOrchestrator.expandFrame(popup, this._originNode || 'hub-branch-puzzle');
      else popup.visible = true;
      engine.foregroundRoot?.updateTransforms();
    }

    _closePreviewPopup() {
      const hubCore = this._hubCore, stageNode = hubCore?.stageNode, popup = this.popupNode, scrim = this.scrimNode;
      if (!popup || popup.animating) return;
      this._unbindPreviewKeys();
      const finishClose = () => {
        if (scrim?.parent === stageNode) stageNode.removeChild(scrim);
        if (popup?.parent === stageNode) stageNode.removeChild(popup);
        this.scrimNode = this.popupNode = this.instructNode = this.upperTitleNode = this.enterBtn = null;
        if (hubCore) { hubCore.stage = 'idle_crown'; this._lockHubButtons(hubCore, false); }
      };
      if (global.TweenOrchestrator?.collapseFrame && popup.visible) global.TweenOrchestrator.collapseFrame(popup, this._originNode || 'hub-branch-puzzle', { onComplete: finishClose });
      else finishClose();
    }

    async _onEnterClicked() {
      if (this.isRunning || this.enterQueued) return;
      const loader = this._hubCore?.ctx?.loader || global.HubGameLoader;
      if (!loader) return;
      this.enterQueued = true;
      this._unbindPreviewKeys();

      // Step 0: Run time-sliced Puzzle script load + invisible Base Macro-Layer mount (0% -> 100%)
      const ready = await this._runStep0Prepare(loader);
      if (!ready || !this.popupNode?.parent) return;
      this._executeStagedSequence();
    }

    _tween(id, durationMs, easing, onUpdate) {
      const tweens = global.TweenOrchestrator;
      if (!tweens?.add || durationMs <= 0) { onUpdate?.(1.0); return Promise.resolve(); }
      return new Promise((resolve) => {
        tweens.add({
          id, from: 0.0, to: 1.0, duration: Math.round(durationMs), easing: easing || 'easeInOutQuad',
          onUpdate: (val) => onUpdate?.(val),
          onComplete: () => { onUpdate?.(1.0); resolve(); }
        });
      });
    }

    _makeFakeShell(id, wBase, hBase, apex, orientation) {
      const node = new global.HexNode({
        id, position: { x: 0, y: 0 }, wBase, hBase, apex, orientation, inert: true, clipContent: false,
        style: this._makeGreenFrameStyle('#000000', 0.12)
      });
      node.setDimensions(wBase, hBase, apex, orientation);
      node.isCustomSized = true;
      node.cacheBezel = false;
      return node;
    }

    _getShellMetrics(engine) {
      const base = global.NAMMU_UI_BASELINE || {};
      const vw = engine?.viewWidth || base.width || 1920;
      const vh = engine?.viewHeight || base.height || 960;
      const s = engine?.hudScale || Math.min(1.0, vw / (base.width ?? 1920), vh / (base.height ?? 960));
      const sidebarW = Math.round((base.sidebarWidth ?? 240) * s);
      const gapX = Math.round((base.gapX ?? 5) * s);
      const apexH = Math.round((base.apexHeight ?? 32) * s);
      const scrollGapY = Math.round((base.scrollGapY ?? 32) * s);
      const sidebarH = vh - 2 * apexH;
      const boardH = Math.max(100, vh - 2 * scrollGapY);
      return {
        vw, vh, sidebarW, gapX, apexH, sidebarH, boardH,
        startLeftX: -(sidebarW + gapX) * 0.5,
        startRightX: (sidebarW + gapX) * 0.5,
        targetLeftX: -(vw * 0.5) + sidebarW * 0.5,
        targetRightX: (vw * 0.5) - sidebarW * 0.5
      };
    }

    async _executeStagedSequence() {
      if (this.isRunning) return;
      this.isRunning = true;
      const hubCore = this._hubCore;
      const ctx = hubCore?.ctx || {};
      const engine = ctx.engine || global.HexUIEngine;
      const beatMs = (global.H_TIMING?.BEAT_SEC || 0.302718) * 1000;

      try {
        if (!engine) { this._recoverToHub(hubCore); return; }
        await this._runFakeShellSteps(hubCore, engine, beatMs);
        await this._runMenuAndButtonHandoff(hubCore, engine, beatMs);
        this.isRunning = false;
        this.enterQueued = false;
      } catch (err) {
        console.error('[Hub_Launch_Staging] Staged launch failed:', err);
        if (engine) {
          engine.forceGhostSidebars = false;
          engine.baseLayerVisible = false;
          engine.baseLayerInteractive = false;
          engine.hudFrameAlpha = 1.0;
        }
        this._clearFakeShells();
        this._recoverToHub(hubCore);
      }
    }

    async _runFakeShellSteps(hubCore, engine, beatMs) {
      const stage = hubCore?.stageNode;
      if (!stage || !global.HexNode) return;
      const m = this._getShellMetrics(engine);

      const shellsNode = new global.HexNode({
        id: 'hub-launch-shells', position: { x: 0, y: 0 }, wBase: m.vw, hBase: m.vh, apex: 0, orientation: 'flat',
        clipContent: false, inert: true,
        style: { bgColor: '#000000', bgOpacity: 0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
      });
      shellsNode.pointerEvents = 'none';
      shellsNode.isCustomSized = true;

      const left = this._makeFakeShell('hub-shell-left', m.sidebarW, 4, 8, 'pointy');
      const right = this._makeFakeShell('hub-shell-right', m.sidebarW, 4, 8, 'pointy');
      left.position.x = m.startLeftX; right.position.x = m.startRightX;
      shellsNode.addChild(left);
      shellsNode.addChild(right);

      // Insert fake shells directly behind the Description Canvas inside the Hub Macro-Layer
      const popupIdx = this.popupNode ? stage.children.indexOf(this.popupNode) : -1;
      if (popupIdx !== -1) {
        stage.children.splice(popupIdx, 0, shellsNode);
        shellsNode.parent = stage;
      } else {
        stage.addChild(shellsNode);
      }
      this.shellsNode = shellsNode;
      stage.updateTransforms();

      // Step 1 (3-HB): Squished center sidebars extend to true height while Hub buttons & scrim fade out
      await this._tween('hub_shell_step1_extend', beatMs * 3, 'easeOutCubic', (t) => {
        const curH = 4 + (m.sidebarH - 4) * t;
        const curApex = 8 + (m.apexH - 8) * t;
        left.setDimensions(m.sidebarW, curH, curApex, 'pointy');
        right.setDimensions(m.sidebarW, curH, curApex, 'pointy');
        const fade = 1.0 - t;
        hubCore.uiAlpha = fade;
        if (hubCore.rootNode) hubCore.rootNode.alpha = fade;
        hubCore.branchNodes?.forEach((b) => { b.alpha = fade; });
        if (this.scrimNode) this.scrimNode.alpha = fade;
        stage.updateTransforms();
      });

      if (hubCore.rootNode) hubCore.rootNode.visible = false;
      hubCore.branchNodes?.forEach((b) => { b.visible = false; });
      if (this.scrimNode?.parent === stage) stage.removeChild(this.scrimNode);
      this.scrimNode = null;

      // Step 2 (3-HB): Sidebars drift to outer edges; center board widens from vertical line locked to gap
      const board = this._makeFakeShell('hub-shell-board', 0, m.boardH, 0, 'flat');
      shellsNode.children.unshift(board);
      board.parent = shellsNode;
      await this._tween('hub_shell_step2_drift', beatMs * 3, 'easeOutCubic', (t) => {
        const lx = m.startLeftX + (m.targetLeftX - m.startLeftX) * t;
        const rx = m.startRightX + (m.targetRightX - m.startRightX) * t;
        left.position.x = lx;
        right.position.x = rx;
        const bw = Math.max(0, (rx - lx) - m.sidebarW - m.gapX * (1 + t));
        board.setDimensions(bw, m.boardH, 0, 'flat');
        stage.updateTransforms();
      });
    }

    async _runMenuAndButtonHandoff(hubCore, engine, beatMs) {
      const loader = hubCore?.ctx?.loader || global.HubGameLoader;
      loader?.activatePreparedGame?.('puzzle');

      engine.forceGhostSidebars = true;
      const gsc = global.GameSettingsCanvas;
      if (gsc && !gsc.isOpen?.()) {
        gsc.openSetupMenu?.('btn-nav-menu', { silent: true, skipAnimation: true, initialContentAlpha: 0 });
      }
      const rootFrame = gsc?.getActiveFrame?.();
      if (rootFrame) {
        rootFrame.alpha = 0.0;
        rootFrame.contentAlpha = 0.0;
      }
      global.UIDeckSync?.syncMaterialsTrayWithGameState?.();

      if (engine.boardFrame) { engine.boardFrame.visible = true; engine.boardFrame.alpha = 1.0; }
      if (engine.leftSidebar) { engine.leftSidebar.visible = true; engine.leftSidebar.alpha = 1.0; engine.leftSidebar.contentAlpha = 1.0; }
      if (engine.rightSidebar) { engine.rightSidebar.visible = true; engine.rightSidebar.alpha = 1.0; engine.rightSidebar.contentAlpha = 1.0; }
      engine.boardContentAlpha = 1.0;
      engine.baseLayerAlpha = 1.0;
      engine.hudFrameAlpha = 0.0;
      engine.baseLayerInteractive = false;
      engine.baseLayerVisible = true;

      // Step 3a (3-HB): Description contents fade out (first half of 6-HB Base HUD fade-in / shell fade-out)
      await this._tween('hub_shell_step3a_desc_out', beatMs * 3, 'easeInOutQuad', (t) => {
        if (this.popupNode) this.popupNode.contentAlpha = 1.0 - t;
        engine.hudFrameAlpha = t * 0.5;
        if (this.shellsNode) this.shellsNode.alpha = 1.0 - t * 0.5;
      });

      // Exact Midpoint: Swap empty 960x800 Hub frame for identical empty 960x800 Root Game Menu frame
      if (this.popupNode) this.popupNode.visible = false;
      if (rootFrame) {
        rootFrame.alpha = 1.0;
        rootFrame.contentAlpha = 0.0;
      }

      // Step 3b (3-HB): Root Game Menu contents fade in (second half of 6-HB Base HUD fade-in / shell fade-out)
      await this._tween('hub_shell_step3b_menu_in', beatMs * 3, 'easeInOutQuad', (t) => {
        if (rootFrame) rootFrame.contentAlpha = t;
        engine.hudFrameAlpha = 0.5 + t * 0.5;
        if (this.shellsNode) this.shellsNode.alpha = 0.5 - t * 0.5;
      });

      const stage = hubCore?.stageNode;
      if (this.popupNode?.parent === stage) stage.removeChild(this.popupNode);
      this.popupNode = this.instructNode = this.upperTitleNode = this.enterBtn = null;
      this._clearFakeShells();
      hubCore?.unmount?.();

      engine.hudFrameAlpha = 1.0;
      engine.baseLayerAlpha = 1.0;
      if (rootFrame) {
        rootFrame.alpha = 1.0;
        rootFrame.contentAlpha = 1.0;
      }

      // Finalize (+1-HB): Hold 1-HB then unlock input & activate Return & Confirm buttons
      await new Promise((r) => setTimeout(r, Math.round(beatMs)));
      engine.forceGhostSidebars = false;
      engine.baseLayerInteractive = true;
      global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
      global.BoardRenderer?.render?.();
    }

    _clearFakeShells() {
      if (this.shellsNode?.parent) this.shellsNode.parent.removeChild(this.shellsNode);
      this.shellsNode = null;
    }

    _recoverToHub(hubCore) {
      this.isRunning = false;
      this.enterQueued = false;
      this._unbindPreviewKeys();
      this._clearFakeShells();
      if (!hubCore) return;
      hubCore.mount(hubCore.ctx, { skipIntro: true });
      const txt = hubCore.branchNodes?.[1]?.getTrait?.('text');
      if (txt) txt.subtitle = 'Tap To Retry';
      this._lockHubButtons(hubCore, false);
    }
  }

  const instance = new HubLaunchStagingClass();
  global.HubLaunchStaging = instance;
  global.ROLL_CALL = global.ROLL_CALL || new Map();
  global.ROLL_CALL.set('Hub_Launch_Staging', instance);
})(typeof window !== 'undefined' ? window : this);
