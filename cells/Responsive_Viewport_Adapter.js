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

  class ResponsiveViewportAdapterClass {
    constructor() {
      this.ctx = null;
      this.engine = null;
      this.dom = null;
      this.state = null;
      this.overlayEl = null;
      this.isPortrait = false;
      this.viewportClass = 'desktop'; // 'desktop' | 'compact-landscape' | 'portrait-locked'
      this.sidebarScale = 1.0;
      this.podScale = 1.0;
      this.overlayScale = 1.0;
      this._initialized = false;
      this._wrappedEngine = false;
      this._wrappedTween = false;
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
      this._hookTweenOrchestrator();
      this.syncViewport();
      return true;
    }

    _injectStyles() {
      if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
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

    _bindEvents() {
      if (typeof window === 'undefined') return;
      const onChange = () => {
        // Defer one microtask so BoardCameraController finishes first before we enforce landscape
        queueMicrotask(() => this.syncViewport());
      };
      window.addEventListener('resize', onChange);
      window.addEventListener('orientationchange', onChange);

      // Best-effort native orientation lock when interacting on supported mobile browsers
      const tryLockLandscape = () => {
        if (global.matchMedia?.('(pointer: coarse)')?.matches && global.screen?.orientation?.lock) {
          global.screen.orientation.lock('landscape').catch(() => {});
        }
      };
      window.addEventListener('pointerdown', tryLockLandscape, { passive: true, once: true });
    }

    _hookEngineResize() {
      const engine = this.engine;
      if (!engine || this._wrappedEngine) return;
      const origResize = engine.resize.bind(engine);
      engine.resize = (w, h) => {
        origResize(w, h);
        this.applyLayoutToEngine(w, h);
      };
      this._wrappedEngine = true;
    }

    _hookTweenOrchestrator() {
      const tweens = global.TweenOrchestrator;
      if (!tweens || this._wrappedTween || typeof tweens.expandFrame !== 'function') return;
      const origExpand = tweens.expandFrame.bind(tweens);
      const self = this;
      tweens.expandFrame = function(containerNode, origin, options = {}) {
        const isRootChild = !containerNode?.parent || containerNode.parent === global.HexUIEngine?.root;
        const isHub = containerNode?.id === 'hub-core-stage';
        if (isRootChild && !isHub && options.targetScale === undefined) {
          options = { ...options, targetScale: self.getOverlayTargetScale(containerNode) };
        }
        return origExpand(containerNode, origin, options);
      };
      this._wrappedTween = true;
    }

    /** Computes desktop vs compact-landscape target scale for centered Puzzle overlays. */
    getOverlayTargetScale(node) {
      const vw = this.engine?.viewWidth || global.innerWidth || 1920;
      const vh = this.engine?.viewHeight || global.innerHeight || 1080;
      if (vw >= 1200 && vh >= 720) return 1.0;

      const baseW = node?.dimensions ? (node.dimensions.wBase + 2 * node.dimensions.apex) : 1400;
      const baseH = node?.dimensions ? node.dimensions.hBase : 800;
      const sidebarScreenW = Math.round(240 * this.sidebarScale);
      const availW = Math.max(220, vw - 2 * (sidebarScreenW + 10));
      const availH = Math.max(180, vh - 24);
      return Math.max(0.24, Math.min(1.0, availW / baseW, availH / baseH));
    }

    syncViewport() {
      const vw = global.innerWidth || 1280;
      const vh = global.innerHeight || 720;
      this.isPortrait = vh > vw;

      const canvasWarp = this.dom?.canvasWarp || document.getElementById('canvas-domain-warp');
      const canvasBoard = this.dom?.canvasBoard || document.getElementById('canvas-board-overlay');
      const warpScale = this.state?.warpRenderScale || 0.75;

      // Enforce Landscape-Only: never CSS-rotate #canvas-board-overlay sideways
      if (canvasBoard) {
        canvasBoard.classList.remove('portrait-mode');
        canvasBoard.width = vw;
        canvasBoard.height = vh;
      }
      if (canvasWarp) {
        canvasWarp.width = Math.round(vw * warpScale);
        canvasWarp.height = Math.round(vh * warpScale);
      }
      if (this.overlayEl) {
        this.overlayEl.classList.toggle('visible', this.isPortrait);
      }

      if (this.engine) {
        this.engine.isPortrait = false;
        this.engine.resize(vw, vh);
      }
    }

    applyLayoutToEngine(w, h) {
      const engine = this.engine;
      if (!engine || !engine.initialized) return;

      const vw = Math.max(240, w || global.innerWidth || 1280);
      const vh = Math.max(180, h || global.innerHeight || 720);
      const isDesktop = vw >= 1200 && vh >= 720;
      this.viewportClass = (vh > vw) ? 'portrait-locked' : (isDesktop ? 'desktop' : 'compact-landscape');

      if (isDesktop) {
        this.sidebarScale = 1.0;
        this.podScale = 1.0;
        this.overlayScale = 1.0;
        if (engine.leftSidebar) engine.leftSidebar.scale = 1.0;
        if (engine.rightSidebar) engine.rightSidebar.scale = 1.0;
        if (engine.topPod) engine.topPod.scale = 1.0;
        if (engine.bottomPod) engine.bottomPod.scale = 1.0;
        if (engine.studioOverlay && !engine.studioOverlay.animating && engine.studioOverlay.id !== 'hub-core-stage') {
          engine.studioOverlay.scale = 1.0;
        }
        engine.root?.updateTransforms();
        return;
      }

      // Compact / Phone Landscape: keep 6-button sidebar lists (~804px local height) fitting cleanly
      const s = Math.max(0.28, Math.min(1.0, vw / 1400, vh / 860));
      this.sidebarScale = s;

      const localSidebarW = 240;
      const localApexH = 32;
      const localSidebarH = Math.max(120, Math.round(vh / s) - 2 * localApexH);
      const sidebarScreenW = Math.round(localSidebarW * s);
      const gapX = Math.max(2, Math.round(5 * s));
      const scrollGapY = Math.max(8, Math.round(28 * s));

      if (engine.leftSidebar) {
        engine.leftSidebar.scale = s;
        engine.leftSidebar.position.x = sidebarScreenW * 0.5;
        engine.leftSidebar.position.y = vh * 0.5;
        engine.leftSidebar.setDimensions(localSidebarW, localSidebarH, localApexH, 'pointy');
      }
      if (engine.rightSidebar) {
        engine.rightSidebar.scale = s;
        engine.rightSidebar.position.x = vw - sidebarScreenW * 0.5;
        engine.rightSidebar.position.y = vh * 0.5;
        engine.rightSidebar.setDimensions(localSidebarW, localSidebarH, localApexH, 'pointy');
      }

      const boardApertureW = Math.max(180, vw - 2 * (sidebarScreenW + gapX));
      const boardApertureH = Math.max(120, vh - 2 * scrollGapY);
      if (engine.boardFrame) {
        engine.boardFrame.position.x = vw * 0.5;
        engine.boardFrame.position.y = vh * 0.5;
        engine.boardFrame.setDimensions(boardApertureW, boardApertureH, 0, 'flat');
      }

      // Scale Top & Bottom HUD Stat Pods to fit cleanly inside boardApertureW without touching sidebars
      const topCfg = global.NativeStatPod?.config || {};
      const topFullW = (topCfg.topPodWidth || 1354) + 2 * (topCfg.podApex || 22);
      const botFullW = (topCfg.botPodWidth || 872) + 2 * (topCfg.podApex || 22);
      const topScale = Math.max(0.28, Math.min(1.0, s * 1.12, (boardApertureW - 12) / topFullW));
      const botScale = Math.max(0.28, Math.min(1.0, s * 1.12, (boardApertureW - 12) / botFullW));
      this.podScale = Math.min(topScale, botScale);

      if (engine.topPod) {
        engine.topPod.scale = topScale;
        engine.topPod.position.x = vw * 0.5;
        engine.topPod.position.y = Math.max(18, Math.round((topCfg.podEdgeY || 42) * topScale));
      }
      if (engine.bottomPod) {
        engine.bottomPod.scale = botScale;
        engine.bottomPod.position.x = vw * 0.5;
        engine.bottomPod.position.y = vh - Math.max(18, Math.round((topCfg.podEdgeY || 42) * botScale));
      }

      // Scale non-Hub overlays cleanly inside the compact landscape viewport
      const overlay = engine.studioOverlay;
      if (overlay && overlay.id !== 'hub-core-stage' && overlay.id !== 'turn-confirm-scrim' && overlay.id !== 'turn-confirm-frame') {
        if (!overlay.isCustomSized) {
          overlay.setDimensions(960, 800, 220, 'flat');
        }
        const ovScale = this.getOverlayTargetScale(overlay);
        this.overlayScale = ovScale;
        if (!overlay.animating) {
          overlay.scale = ovScale;
          overlay.position.x = vw * 0.5 + (overlay.offsetX || 0) * ovScale;
          overlay.position.y = vh * 0.5 + (overlay.offsetY || 0) * ovScale;
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
