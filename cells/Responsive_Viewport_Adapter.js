/**
 * @fileoverview cells/Responsive_Viewport_Adapter.js - Landscape Lock & Phone-Landscape Layout Adapter (Group E)
 * @description Enforces a landscape-only display (showing a Rotate-to-Landscape prompt in portrait
 * instead of 90deg CSS rotation) and proportionally scales Hex_UI_Engine sidebars, stat pods,
 * overlay frames, and HTML drawers for compact phone-landscape screens while leaving desktop intact.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const OVERLAY_ID = 'rotate-landscape-overlay';
  const STYLE_ID = 'responsive-viewport-adapter-css';
  // Single Source of Truth for calibrated UI geometry (1920x945 desktop baseline)
  const UI_BASELINE = Object.freeze({
    width: 1920,
    height: 945,
    sidebarWidth: 240,
    gapX: 5,
    minBoardWidth: 1430,
    apexHeight: 32,
    scrollGapY: 32
  });
  global.NAMMU_UI_BASELINE = UI_BASELINE;
  const VIRTUAL_BASE_W = UI_BASELINE.width;
  const VIRTUAL_BASE_H = UI_BASELINE.height;
  const MAX_DPR = 2;

  class ResponsiveViewportAdapterClass {
    constructor() {
      this.ctx = null;
      this.engine = null;
      this.dom = null;
      this.state = null;
      this.overlayEl = null;
      this.isPortrait = false;
      this.viewportClass = 'desktop'; // 'desktop' | 'compact-landscape' | 'portrait-locked'
      this.dpr = 1.0;
      this.stageScale = 1.0;
      this.cssWidth = VIRTUAL_BASE_W;
      this.cssHeight = VIRTUAL_BASE_H;
      this.virtualWidth = VIRTUAL_BASE_W;
      this.virtualHeight = VIRTUAL_BASE_H;
      this.sidebarScale = 1.0;
      this.podScale = 1.0;
      this.overlayScale = 1.0;
      this._initialized = false;
      this._wrappedEngine = false;
      this._wantsLandscapeFullscreen = false;
      this._lastIsPortrait = undefined;
    }

    init(ctx = {}) {
      this.ctx = ctx;
      this.engine = ctx.engine || global.HexUIEngine;
      this.dom = ctx.dom || {};
      this.state = ctx.state || global.COSMOS_STATE;

      if (!this._initialized) {
        this._injectStyles();
        this._createRotateOverlay();
        this._bindEvents();
        this._initialized = true;
      }

      this._hookEngineResize();
      this.syncViewport();
      return true;
    }

    _injectStyles() {
      if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        html, body {
          position: fixed !important; inset: 0 !important;
          width: 100% !important; height: 100% !important;
          overflow: hidden !important; overscroll-behavior: none !important;
          touch-action: none !important; margin: 0 !important; padding: 0 !important;
        }
        #viewport-container, #canvas-domain-warp, #canvas-board-overlay {
          position: fixed !important; inset: 0 !important;
          width: 100% !important; height: 100% !important;
          transform: none !important; max-width: none !important; max-height: none !important;
        }
        .hud-drawer { position: fixed !important; }
        .hud-drawer.dock-left.collapsed, #metrics-drawer:not(.dock-right).collapsed, #tuning-drawer.dock-left.collapsed {
          transform: translateX(-120%) !important;
        }
        .hud-drawer.dock-right.collapsed, #tuning-drawer:not(.dock-left).collapsed, #metrics-drawer.dock-right.collapsed {
          transform: translateX(120%) !important;
        }
        #${OVERLAY_ID} {
          position: fixed; inset: 0; z-index: 9999; display: none;
          align-items: center; justify-content: center; flex-direction: column; gap: 14px;
          background: radial-gradient(circle at center, rgba(6, 20, 18, 0.96) 0%, #000000 80%);
          color: #f8fafc; text-align: center; padding: 24px; pointer-events: auto;
        }
        #${OVERLAY_ID}.visible { display: flex; }
        #${OVERLAY_ID} .rlo-hex {
          width: 78px; height: 90px; display: flex; align-items: center; justify-content: center;
          border: 2px solid #10f000; border-radius: 14px; font-size: 32px; color: #10f000;
          box-shadow: 0 0 22px rgba(16, 240, 0, 0.32), inset 0 0 12px rgba(16, 240, 0, 0.22);
          animation: rloSpin 2.4s ease-in-out infinite;
        }
        #${OVERLAY_ID} .rlo-title {
          font-family: 'Orbitron', sans-serif; font-size: 18px; font-weight: 700;
          letter-spacing: 1px; color: #f8fafc;
        }
        #${OVERLAY_ID} .rlo-sub {
          font-size: 13px; color: #94a3b8; max-width: 280px; line-height: 1.5;
        }
        @keyframes rloSpin {
          0%, 20% { transform: rotate(0deg); }
          55%, 75% { transform: rotate(-90deg); }
          100% { transform: rotate(0deg); }
        }
        @media (max-height: 540px), (max-width: 960px) {
          .drawer-launcher { top: 8px; padding: 5px 10px; font-size: 11px; }
          .hud-drawer {
            width: min(290px, 76vw) !important;
            max-height: calc(100dvh - 48px) !important;
            top: 40px !important;
            padding: 10px !important;
          }
          #metrics-drawer.dock-left, #btn-toggle-metrics.dock-left { left: 8px; }
          #tuning-drawer.dock-right, #btn-toggle-tuning.dock-right { right: 8px; }
        }
      `;
      document.head.appendChild(style);
    }

    _createRotateOverlay() {
      if (typeof document === 'undefined') return;
      let el = document.getElementById(OVERLAY_ID);
      if (!el) {
        el = document.createElement('div');
        el.id = OVERLAY_ID;
        el.innerHTML = `
          <div class="rlo-hex">📱</div>
          <div class="rlo-title">NAMMU GAMES</div>
          <div class="rlo-sub">Rotate your device to <strong>Landscape</strong> mode to play.</div>
        `;
        document.body.appendChild(el);
      }
      this.overlayEl = el;
    }

    _isFullscreenActive() {
      if (typeof document === 'undefined') return false;
      return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }

    _requestMobileFullscreen() {
      if (typeof document === 'undefined' || this._isFullscreenActive()) {
        this._wantsLandscapeFullscreen = false;
        return;
      }
      const root = document.documentElement;
      const req = root?.requestFullscreen || root?.webkitRequestFullscreen;
      if (typeof req !== 'function') return;
      try {
        const res = req.call(root, { navigationUI: 'hide' });
        if (res && typeof res.then === 'function') {
          res.then(() => { this._wantsLandscapeFullscreen = false; }).catch(() => {});
        }
      } catch (_) {}
    }

    _exitMobileFullscreen() {
      if (typeof document === 'undefined' || !this._isFullscreenActive()) return;
      const exitFn = document.exitFullscreen || document.webkitExitFullscreen;
      if (typeof exitFn !== 'function') return;
      try {
        const res = exitFn.call(document);
        if (res && typeof res.catch === 'function') res.catch(() => {});
      } catch (_) {}
    }

    _bindEvents() {
      if (typeof window === 'undefined') return;
      const scheduleSync = () => {
        queueMicrotask(() => this.syncViewport());
        setTimeout(() => this.syncViewport(), 90);
        setTimeout(() => this.syncViewport(), 280);
      };
      window.addEventListener('resize', scheduleSync);
      window.addEventListener('orientationchange', scheduleSync);
      document.addEventListener('fullscreenchange', () => {
        if (this._isFullscreenActive()) this._wantsLandscapeFullscreen = false;
        scheduleSync();
      });
      document.addEventListener('webkitfullscreenchange', () => {
        if (this._isFullscreenActive()) this._wantsLandscapeFullscreen = false;
        scheduleSync();
      });
      global.visualViewport?.addEventListener('resize', scheduleSync);
      global.visualViewport?.addEventListener('scroll', scheduleSync);

      // Mobile browsers require a user gesture to enter fullscreen if orientationchange was blocked
      const onMobileGesture = () => {
        if (this._wantsLandscapeFullscreen && !this.isPortrait && !this._isFullscreenActive()) {
          this._requestMobileFullscreen();
        }
      };
      window.addEventListener('pointerdown', onMobileGesture, { passive: true });
      window.addEventListener('touchend', onMobileGesture, { passive: true });
    }

    _hookEngineResize() {
      const engine = this.engine;
      if (!engine || this._wrappedEngine) return;
      const origResize = engine.resize.bind(engine);
      engine.resize = (w, h) => {
        const vw = this._syncing ? w : (this.virtualWidth || w);
        const vh = this._syncing ? h : (this.virtualHeight || h);
        origResize(vw, vh);
        this.applyLayoutToEngine(vw, vh);
      };
      if (typeof engine.setStudioOverlay === 'function') {
        const origSetOverlay = engine.setStudioOverlay.bind(engine);
        engine.setStudioOverlay = (node) => {
          origSetOverlay(node);
          if (node) {
            this.applyLayoutToEngine(this.virtualWidth || engine.viewWidth, this.virtualHeight || engine.viewHeight);
          }
        };
      }
      this._wrappedEngine = true;
    }

    /** Computes desktop vs virtual-anchored scale and keeps backing canvas Retina-crisp. */
    syncViewport() {
      const canvasWarp = this.dom?.canvasWarp || document.getElementById('canvas-domain-warp');
      const canvasBoard = this.dom?.canvasBoard || document.getElementById('canvas-board-overlay');
      const container = this.dom?.viewport || document.getElementById('viewport-container');
      const rect = (canvasBoard || container)?.getBoundingClientRect?.();
      const cssW = Math.max(240, Math.round((rect && rect.width > 0 ? rect.width : 0) || global.visualViewport?.width || global.innerWidth || 1280));
      const cssH = Math.max(180, Math.round((rect && rect.height > 0 ? rect.height : 0) || global.visualViewport?.height || global.innerHeight || 720));
      this.isPortrait = cssH > cssW;

      const isCoarseMobile = global.matchMedia?.('(pointer: coarse)')?.matches || Math.min(cssW, cssH) <= 560;
      const dprCap = isCoarseMobile ? 1 : MAX_DPR;
      const dpr = Math.min(dprCap, Math.max(1, global.devicePixelRatio || 1));
      const stageScale = Math.min(1.0, cssW / VIRTUAL_BASE_W, cssH / VIRTUAL_BASE_H);
      const virtualW = cssW / stageScale;
      const virtualH = cssH / stageScale;

      this.dpr = dpr;
      this.stageScale = stageScale;
      this.cssWidth = cssW;
      this.cssHeight = cssH;
      this.virtualWidth = virtualW;
      this.virtualHeight = virtualH;

      const backW = Math.max(1, Math.round(cssW * dpr));
      const backH = Math.max(1, Math.round(cssH * dpr));
      const prevPortrait = this._lastIsPortrait;
      this._lastIsPortrait = this.isPortrait;
      if (isCoarseMobile) {
        if (this.isPortrait) {
          this._wantsLandscapeFullscreen = false;
          this._exitMobileFullscreen();
        } else if (prevPortrait === true || prevPortrait === undefined) {
          this._wantsLandscapeFullscreen = true;
          this._requestMobileFullscreen();
        }
      }
      const baseWarpScale = this.state?.warpRenderScale || 0.75;
      const warpScale = (isCoarseMobile && baseWarpScale >= 0.7) ? 0.25 : baseWarpScale;

      // Enforce Landscape-Only: never CSS-rotate #canvas-board-overlay sideways
      if (canvasBoard) {
        canvasBoard.classList.remove('portrait-mode');
        if (canvasBoard.width !== backW) canvasBoard.width = backW;
        if (canvasBoard.height !== backH) canvasBoard.height = backH;
      }
      if (canvasWarp) {
        const ww = Math.round(cssW * warpScale);
        const wh = Math.round(cssH * warpScale);
        if (canvasWarp.width !== ww) canvasWarp.width = ww;
        if (canvasWarp.height !== wh) canvasWarp.height = wh;
      }
      if (this.overlayEl) {
        this.overlayEl.classList.toggle('visible', this.isPortrait);
      }

      if (this.engine) {
        this.engine.isPortrait = false;
        this.engine.dpr = dpr;
        this.engine.stageScale = stageScale;
        this._syncing = true;
        try {
          this.engine.resize(virtualW, virtualH);
        } finally {
          this._syncing = false;
        }
      }
    }

    applyLayoutToEngine(w, h) {
      const engine = this.engine;
      if (!engine || !engine.initialized) return;

      const vw = Math.max(VIRTUAL_BASE_W, w || this.virtualWidth || VIRTUAL_BASE_W);
      const vh = Math.max(VIRTUAL_BASE_H, h || this.virtualHeight || VIRTUAL_BASE_H);
      const isDesktop = (this.cssWidth >= VIRTUAL_BASE_W && this.cssHeight >= VIRTUAL_BASE_H);
      this.viewportClass = this.isPortrait ? 'portrait-locked' : (isDesktop ? 'desktop' : 'compact-landscape');

      // Single Universal Virtual Anchor: every HUD child lives at 1.0 scale in (virtualW x virtualH)
      const rootScale = (this.dpr || 1.0) * (this.stageScale || 1.0);
      this.sidebarScale = 1.0;
      this.podScale = 1.0;
      this.overlayScale = 1.0;

      if (engine.root) {
        engine.root.position.x = 0;
        engine.root.position.y = 0;
        engine.root.scale = rootScale;
      }
      if (engine.leftSidebar) engine.leftSidebar.scale = 1.0;
      if (engine.rightSidebar) engine.rightSidebar.scale = 1.0;
      if (engine.boardFrame) engine.boardFrame.scale = 1.0;
      if (engine.topPod) engine.topPod.scale = 1.0;
      if (engine.bottomPod) engine.bottomPod.scale = 1.0;

      const overlay = engine.studioOverlay;
      if (overlay && overlay.id !== 'hub-core-stage' && overlay.id !== 'turn-confirm-scrim') {
        if (!overlay.isCustomSized) {
          overlay.setDimensions(960, 800, 220, 'flat');
        }
        if (!overlay.animating) {
          overlay.scale = 1.0;
          overlay.position.x = vw * 0.5 + (overlay.offsetX || 0);
          overlay.position.y = vh * 0.5 + (overlay.offsetY || 0);
          if (typeof overlay.onResize === 'function') {
            overlay.onResize(overlay.dimensions.wBase, overlay.dimensions.hBase);
          }
        }
      }

      engine.root?.updateTransforms();
    }
  }

  const instance = new ResponsiveViewportAdapterClass();
  global.ResponsiveViewportAdapter = instance;
  global.ROLL_CALL = global.ROLL_CALL || new Map();
  global.ROLL_CALL.set('Responsive_Viewport_Adapter', instance);
})(typeof window !== 'undefined' ? window : this);
