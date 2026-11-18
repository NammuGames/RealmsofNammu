/**
 * @fileoverview cells/hex_ui/Hex_UI_Engine_1.0.js - Multi-Part Cell: Part 1.0 of Hex_UI_Engine
 * @description Coordinates responsive screen anchoring for pointy-top sidebars (scroll-drums)
 * and interlocking flat-top board frame, Z-layer sorting, and master scene graph lifecycle.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  class HexUIEngineClass {
    constructor() {
      this.canvas = null;
      this.ctx = null;
      this.root = null;

      // Primary Macro Frames
      this.leftSidebar = null;
      this.rightSidebar = null;
      this.boardFrame = null;

      // Interaction State
      this.hoveredNode = null;
      this.pressedNode = null;
      this.lastClickedNode = null;
      this.viewWidth = 0;
      this.viewHeight = 0;
      this.initialized = false;
      this._eventsBound = false;

      // Board Render Delegate (Called inside BoardFrame clipping aperture)
      this.boardRenderDelegate = null;

      // Studio Overlay Layer (Layer 0.5 - Between Board and Sidebars)
      this.studioOverlay = null;

      // Stat Pod Layers (Layer 1.2 - Symmetrical Top & Bottom HUD)
      this.topPod = null;
      this.bottomPod = null;
      this._podFadeAlpha = 1.0;
      this._podsTargetHidden = false;

      // Custom Playfield Frame Width Override (null = auto unrolling span)
      this.customBoardWidth = null;
      this.isPortrait = false;
      this.hudScale = 1.0;
    }

    /**
     * Initializes the Hex UI Engine onto a target canvas.
     */
    init(canvas) {
      if (!canvas) return false;
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');

      const HexNode = global.HexNode;
      if (!HexNode) {
        console.error('HexUIEngine: HexNode class not loaded.');
        return false;
      }

      // 1. Root Scene Node (Viewport bounds)
      this.root = new HexNode({ id: 'ui-root', clipContent: false });

      // 2. Main Board Frame (Layer 0 - Underneath sidebars, Flat-Top Prismatic Hex)
      this.boardFrame = new HexNode({
        id: 'board-frame',
        orientation: 'flat',
        style: {
          bgColor: '#000000',
          bgOpacity: 0.12,
          innerHighlight: {
            enabled: true,
            color: '#10f000',
            sharpEdgeColor: '#10f000',
            spread: 8,
            intensity: 0.80,
            steps: 3
          },
          outerHighlight: {
            enabled: false,
            color: '#a855f7',
            sharpEdgeColor: '#a855f7',
            blur: 16,
            intensity: 0.50,
            steps: 3
          }
        }
      });
      this.boardFrame.cacheBezel = true;
      this.root.addChild(this.boardFrame);

      // 3. Left Sidebar / Scroll-Drum (Layer 1 - On Top, Pointy-Top Prismatic Hex)
      this.leftSidebar = new HexNode({
        id: 'sidebar-left',
        orientation: 'pointy',
        style: {
          bgColor: '#000000',
          bgOpacity: 0.12,
          innerHighlight: {
            enabled: true,
            color: '#10f000',
            sharpEdgeColor: '#10f000',
            spread: 8,
            intensity: 0.80,
            steps: 3
          },
          outerHighlight: {
            enabled: false,
            color: '#a855f7',
            sharpEdgeColor: '#a855f7',
            blur: 16,
            intensity: 0.50,
            steps: 3
          }
        }
      });
      this.leftSidebar.cacheBezel = true;
      this.root.addChild(this.leftSidebar);

      // 4. Right Sidebar / Scroll-Drum (Layer 1 - On Top, Symmetrical)
      this.rightSidebar = new HexNode({
        id: 'sidebar-right',
        orientation: 'pointy',
        clipContent: true,
        style: {
          bgColor: '#000000',
          bgOpacity: 0.12,
          innerHighlight: {
            enabled: true,
            color: '#10f000',
            sharpEdgeColor: '#10f000',
            spread: 8,
            intensity: 0.80,
            steps: 3
          },
          outerHighlight: {
            enabled: false,
            color: '#a855f7',
            sharpEdgeColor: '#a855f7',
            blur: 16,
            intensity: 0.50,
            steps: 3
          }
        }
      });
      this.rightSidebar.cacheBezel = true;
      this.root.addChild(this.rightSidebar);

      if (typeof this.bindEvents === 'function') {
        this.bindEvents();
        this._eventsBound = true;
      }
      this.initialized = true;
      return true;
    }

    /**
     * Resizes frames dynamically to fit screen dimensions.
     * Locked scale base is IDENTICAL to Test 2.2 calibrated geometry (1920x1080 baseline):
     * Sidebars: 240px, Gaps: 5px, Board Min Width: 1430px, Scroll Gap: 32px, Apex: 32px.
     * Center board widens like an unrolling scroll on wider screens.
     * Uniformly scales down on square/narrow screens maintaining exact proportions.
     */
    resize(width, height) {
      this.viewWidth = width;
      this.viewHeight = height;

      if (!this.initialized) return;

      const BASE_W = 1920, BASE_H = 750;
      const BASE_SIDEBAR_W = 240, BASE_GAP = 5, BASE_MIN_BOARD_W = 1430;
      const BASE_APEX_H = 32, BASE_SCROLL_GAP_Y = 32;

      // When screen is wider than 1920 and normal desktop height (>=750px), scale is locked at 1.0
      // Sidebars stay at 240px with 5px gaps, and board unrolls wider on wider screens.
      // Scaling down only occurs if screen width < 1920 or height is constrained (< 750px).
      const hudScale = Math.min(1.0, width / BASE_W, height / BASE_H);
      this.hudScale = hudScale;

      const sidebarW = Math.round(BASE_SIDEBAR_W * hudScale);
      const gapX = Math.round(BASE_GAP * hudScale);
      const apexH = Math.round(BASE_APEX_H * hudScale);
      const scrollGapY = Math.round(BASE_SCROLL_GAP_Y * hudScale);
      const sidebarH = height - 2 * apexH;
      const boardHBase = Math.max(100, height - 2 * scrollGapY);

      // Fixed sidebars locked to edges; board expands across remaining width between 5px gaps
      const minBoardW = Math.round(BASE_MIN_BOARD_W * hudScale);
      const autoBoardW = Math.max(minBoardW, width - 2 * (sidebarW + gapX));
      const boardWBase = (this.customBoardWidth !== null && this.customBoardWidth !== undefined) ? this.customBoardWidth : autoBoardW;

      // 1. Position Left Sidebar (Anchored Left Edge, Points touch Top & Bottom)
      this.leftSidebar.position.x = sidebarW * 0.5;
      this.leftSidebar.position.y = height * 0.5;
      this.leftSidebar.setDimensions(sidebarW, sidebarH, apexH, 'pointy');

      // 2. Position Right Sidebar (Anchored Right Edge, Points touch Top & Bottom)
      this.rightSidebar.position.x = width - sidebarW * 0.5;
      this.rightSidebar.position.y = height * 0.5;
      this.rightSidebar.setDimensions(sidebarW, sidebarH, apexH, 'pointy');

      // 3. Position Main Board Frame (Centered between sidebars, Flat-Top)
      this.boardFrame.position.x = width * 0.5;
      this.boardFrame.position.y = height * 0.5;
      this.boardFrame.setDimensions(boardWBase, boardHBase, 0, 'flat');

      // 4. Position Studio Overlay (Matches standardized canvas dimensions: 960x800 + 220)
      if (this.studioOverlay) {
        if (!this.studioOverlay.animating) {
          const offX = this.studioOverlay.offsetX || 0;
          const offY = this.studioOverlay.offsetY || 0;
          this.studioOverlay.position.x = width * 0.5 + offX;
          this.studioOverlay.position.y = height * 0.5 + offY;
        }
        if (!this.studioOverlay.isCustomSized) {
          this.studioOverlay.setDimensions(Math.min(960 * hudScale, boardWBase), Math.min(800 * hudScale, boardHBase), 220 * hudScale, 'flat');
        }
        if (typeof this.studioOverlay.onResize === 'function') {
          this.studioOverlay.onResize(this.studioOverlay.dimensions.wBase, this.studioOverlay.dimensions.hBase);
        }
      }

      // 5. Position Bottom Stat Pod (Anchored Bottom Center)
      if (global.NativeStatPod && typeof global.NativeStatPod.resize === 'function') {
        global.NativeStatPod.resize(width, height);
      }

      // Refresh transforms throughout the tree
      this.root.updateTransforms();
    }

    setStudioOverlay(node) {
      if (this.studioOverlay && this.studioOverlay.parent === this.root) {
        this.root.removeChild(this.studioOverlay);
      }
      this.studioOverlay = node;
      if (node && this.root) {
        if (this.viewWidth && this.viewHeight) {
          const offX = node.offsetX || 0;
          const offY = node.offsetY || 0;
          node.position.x = this.viewWidth * 0.5 + offX;
          node.position.y = this.viewHeight * 0.5 + offY;
        }
        const leftIdx = this.root.children.indexOf(this.leftSidebar);
        if (leftIdx !== -1) {
          this.root.children.splice(leftIdx, 0, node);
        } else {
          this.root.addChild(node);
        }
        node.parent = this.root;
      }
    }

    /**
     * Master Render Pass with explicit Z-Layering:
     * Layer 0: Board Frame (Underneath)
     * Layer 1: Left & Right Sidebars (On Top, concealing board apex points)
     */
    render(ctx) {
      if (!this.initialized || !this.root) return;

      this.root.updateTransforms();

      // --- LAYER 0: Render Board Frame (Underneath) ---
      if (this.boardFrame && this.boardFrame.visible) {
        this.boardFrame.render(ctx);

        // Render game board content inside board frame clipping aperture
        if (typeof this.boardRenderDelegate === 'function') {
          ctx.save();
          const w = this.boardFrame.worldMatrix;
          ctx.setTransform(w[0], w[1], w[2], w[3], w[4], w[5]);

          // Clip to board frame polygon
          const geom = global.HexFrameGeometry;
          if (geom) {
            geom.buildPath(ctx, this.boardFrame.getVertices());
            ctx.clip();
          }

          this.boardRenderDelegate(ctx, 0, 0, this.boardFrame);
          ctx.restore();
        }
      }

      // --- LAYER 0.5: Render Studio Overlay Frame (Between Board & Sidebars) ---
      const hasOverlay = !!(this.studioOverlay && this.studioOverlay.visible);
      if (hasOverlay) {
        this.studioOverlay.render(ctx);
      }

      // --- LAYER 1: Render Sidebars (On Top — covers horizontal apex points) ---
      if (this.leftSidebar && this.leftSidebar.visible) {
        this.leftSidebar.render(ctx);
      }
      if (this.rightSidebar && this.rightSidebar.visible) {
        this.rightSidebar.render(ctx);
      }

      // --- LAYER 1.2: Render Top & Bottom Stat Pods (Fade in/out with overlay transitions) ---
      this._syncPodFade();
      const showPods = this._podFadeAlpha > 0.001;
      if (this.topPod) {
        this.topPod.visible = showPods;
        this.topPod.alpha = this._podFadeAlpha;
      }
      if (this.bottomPod) {
        this.bottomPod.visible = showPods;
        this.bottomPod.alpha = this._podFadeAlpha;
      }

      if (showPods) {
        if (this.topPod && this.topPod.visible) {
          this.topPod.render(ctx);
        }
        if (this.bottomPod && this.bottomPod.visible) {
          this.bottomPod.render(ctx);
        }
      }
    }

    _shouldHideStatPods() {
      if (!this.studioOverlay || !this.studioOverlay.visible) return false;
      const isPopupOnly = this.studioOverlay.id === 'turn-confirm-scrim' || this.studioOverlay.id === 'turn-confirm-frame';
      if (isPopupOnly) return false;
      if (this.studioOverlay === global.GameSettingsCanvas?.containerNode) return !!global.GameSettingsCanvas.active;
      if (this.studioOverlay === global.SigilNookCanvas?.containerNode) return global.SigilNookCanvas.stage !== 'closed';
      if (this.studioOverlay === global.StatCanvas?.containerNode) return !!global.StatCanvas.active;
      return true;
    }

    _syncPodFade() {
      const shouldHide = this._shouldHideStatPods();
      if (shouldHide === this._podsTargetHidden) return;
      this._podsTargetHidden = shouldHide;
      const targetAlpha = shouldHide ? 0.0 : 1.0;
      const tweens = global.TweenOrchestrator;
      if (!tweens?.add) {
        this._podFadeAlpha = targetAlpha;
        return;
      }
      const tuning = global.AnimationTuningLab?.config || {};
      const duration = tuning.menuDuration ?? 360;
      const steps = (tuning.menuSteps > 0) ? tuning.menuSteps : tweens.defaultSteps;
      const decelPower = (tuning.shrinkDecel !== undefined && tuning.shrinkDecel > 0) ? tuning.shrinkDecel : 2;
      const easing = (tuning.menuEasing && tuning.menuEasing !== 'easeOutCubic' && tuning.menuEasing !== 'easeInQuad')
        ? tweens.getEasing(tuning.menuEasing)
        : (t) => 1 - Math.pow(1 - t, decelPower);
      tweens.add({
        id: 'stat_pods_fade',
        from: this._podFadeAlpha,
        to: targetAlpha,
        duration,
        easing,
        steps,
        onUpdate: (val) => { this._podFadeAlpha = val; },
        onComplete: () => { this._podFadeAlpha = targetAlpha; }
      });
    }

    setTopPod(node) {
      if (this.topPod && this.topPod.parent === this.root) {
        this.root.removeChild(this.topPod);
      }
      this.topPod = node;
      if (node && this.root) {
        this.root.addChild(node);
        node.parent = this.root;
      }
    }

    setBottomPod(node) {
      if (this.bottomPod && this.bottomPod.parent === this.root) {
        this.root.removeChild(this.bottomPod);
      }
      this.bottomPod = node;
      if (node && this.root) {
        this.root.addChild(node);
        node.parent = this.root;
      }
    }

    setBoardWidth(w) {
      this.customBoardWidth = (w !== undefined && w !== null && w > 0) ? Math.round(w) : null;
      if (this.viewWidth && this.viewHeight) {
        this.resize(this.viewWidth, this.viewHeight);
      } else if (this.boardFrame) {
        const boardWBase = this.customBoardWidth || 1430;
        this.boardFrame.setDimensions(boardWBase, this.boardFrame.dimensions.hBase, 0, 'flat');
        if (typeof this.boardFrame.invalidateCache === 'function') {
          this.boardFrame.invalidateCache();
        }
      }
    }

    getBoardWidth() {
      return this.customBoardWidth || (this.boardFrame ? this.boardFrame.dimensions.wBase : 1430);
    }

    findNodeById(id, start = this.root) {
      if (!start) return null;
      if (start.id === id) return start;
      const list = (start.children || []).concat(start.tetheredChildren || []);
      for (let i = 0; i < list.length; i++) {
        const found = this.findNodeById(id, list[i]);
        if (found) return found;
      }
      return null;
    }
  }

  const instance = new HexUIEngineClass();
  global.HexUIEngineClass = HexUIEngineClass;
  global.HexUIEngine = instance;
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Hex_UI_Engine', instance);
  }
})(typeof window !== 'undefined' ? window : this);

