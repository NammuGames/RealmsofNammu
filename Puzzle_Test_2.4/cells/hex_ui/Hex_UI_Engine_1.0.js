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

      // Macro-Layer Controls (Base Game Layer vs. Independent Foreground Layer)
      this.baseLayerVisible = true;
      this.baseLayerAlpha = 1.0;
      this.hudFrameAlpha = 1.0;
      this.baseLayerInteractive = true;
      this.forceGhostSidebars = false;
      this.foregroundRoot = null;
      this.foregroundOverlay = null;

      // Stat Pod Layers (Layer 1.2 - Symmetrical Top & Bottom HUD)
      this.topPod = null;
      this.bottomPod = null;
      this._podFadeAlpha = 1.0;
      this._podsTargetHidden = false;

      // Custom Playfield Frame Width Override (null = auto unrolling span)
      this.customBoardWidth = null;
      this.isPortrait = false;
      this.hudScale = 1.0;
      this.stageScale = 1.0;
      this.dpr = 1.0;
      this.boardContentAlpha = 1.0;
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

      // 1. Root Scene Nodes (Macro-Layer 1: Game Base, Macro-Layer 2: Independent Foreground)
      this.root = new HexNode({ id: 'ui-root', clipContent: false });
      this.foregroundRoot = new HexNode({ id: 'ui-foreground-root', clipContent: false });

      const makeFrameStyle = () => ({
        bgColor: '#000000', bgOpacity: 0.12,
        innerHighlight: { enabled: true, color: '#10f000', sharpEdgeColor: '#10f000', spread: 8, intensity: 0.80, steps: 3 },
        outerHighlight: { enabled: false, color: '#a855f7', sharpEdgeColor: '#a855f7', blur: 16, intensity: 0.50, steps: 3 }
      });

      // 2. Main Board Frame (Layer 0 - Underneath sidebars, Flat-Top Prismatic Hex)
      this.boardFrame = new HexNode({ id: 'board-frame', orientation: 'flat', style: makeFrameStyle() });
      this.boardFrame.cacheBezel = true;
      this.root.addChild(this.boardFrame);

      // 3. Left Sidebar / Scroll-Drum (Layer 1 - On Top, Pointy-Top Prismatic Hex)
      this.leftSidebar = new HexNode({ id: 'sidebar-left', orientation: 'pointy', style: makeFrameStyle() });
      this.leftSidebar.cacheBezel = true;
      this.root.addChild(this.leftSidebar);

      // 4. Right Sidebar / Scroll-Drum (Layer 1 - On Top, Symmetrical)
      this.rightSidebar = new HexNode({ id: 'sidebar-right', orientation: 'pointy', clipContent: true, style: makeFrameStyle() });
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
     * Consumes the Single Source of Truth baseline (window.NAMMU_UI_BASELINE: 1920x960):
     * Sidebars: 240px, Gaps: 5px, Board Min Width: 1430px, Scroll Gap: 32px, Apex: 32px.
     * Uniformly scales on screens maintaining exact locked proportions.
     */
    resize(width, height) {
      this.viewWidth = width;
      this.viewHeight = height;

      if (!this.initialized) return;

      const base = global.NAMMU_UI_BASELINE || {};
      const BASE_W = base.width ?? 1920;
      const BASE_H = base.height ?? 960;
      const BASE_SIDEBAR_W = base.sidebarWidth ?? 240;
      const BASE_GAP = base.gapX ?? 5;
      const BASE_MIN_BOARD_W = base.minBoardWidth ?? 1430;
      const BASE_APEX_H = base.apexHeight ?? 32;
      const BASE_SCROLL_GAP_Y = base.scrollGapY ?? 32;

      // Locked at 1.0 whenever viewport meets or exceeds the calibrated 1920x960 baseline.
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

      // 6. Position Independent Foreground Macro-Layer (if mounted)
      if (this.foregroundOverlay) {
        if (!this.foregroundOverlay.animating) {
          this.foregroundOverlay.position.x = width * 0.5 + (this.foregroundOverlay.offsetX || 0);
          this.foregroundOverlay.position.y = height * 0.5 + (this.foregroundOverlay.offsetY || 0);
        }
        if (typeof this.foregroundOverlay.onResize === 'function') {
          this.foregroundOverlay.onResize(width, height);
        }
      }

      // Refresh transforms throughout both macro-layer trees
      this.root.updateTransforms();
      this._syncForegroundRootTransform();
      this.foregroundRoot?.updateTransforms();
    }

    _syncForegroundRootTransform() {
      if (!this.foregroundRoot || !this.root) return;
      this.foregroundRoot.position.x = this.root.position.x;
      this.foregroundRoot.position.y = this.root.position.y;
      this.foregroundRoot.scale = this.root.scale;
      this.foregroundRoot.rotation = this.root.rotation;
    }

    setForegroundOverlay(node) {
      if (this.foregroundOverlay && this.foregroundOverlay.parent === this.foregroundRoot) {
        this.foregroundRoot.removeChild(this.foregroundOverlay);
      }
      this.foregroundOverlay = node || null;
      if (node && this.foregroundRoot) {
        if (this.viewWidth && this.viewHeight) {
          node.position.x = this.viewWidth * 0.5 + (node.offsetX || 0);
          node.position.y = this.viewHeight * 0.5 + (node.offsetY || 0);
        }
        this.foregroundRoot.addChild(node);
        this._syncForegroundRootTransform();
        this.foregroundRoot.updateTransforms();
      }
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

      // --- MACRO-LAYER 1: Base Game Layer (Board, Studio Overlays, Sidebars, Stat Pods) ---
      const baseAlpha = Math.max(0, Math.min(1, this.baseLayerAlpha ?? 1.0));
      if (this.baseLayerVisible && baseAlpha > 0.001) {
        this.root.updateTransforms();
        const hudAlpha = Math.max(0, Math.min(1, this.hudFrameAlpha ?? 1.0));
        ctx.save();
        if (baseAlpha < 0.999) ctx.globalAlpha *= baseAlpha;

        // --- LAYER 0: Render Board Frame (Underneath) ---
        if (this.boardFrame && this.boardFrame.visible && hudAlpha > 0.001) {
          ctx.save();
          if (hudAlpha < 0.999) ctx.globalAlpha *= hudAlpha;
          this.boardFrame.render(ctx);

          // Render game board content inside board frame clipping aperture
          if (typeof this.boardRenderDelegate === 'function' && (this.boardContentAlpha ?? 1.0) > 0.001) {
            ctx.save();
            if ((this.boardContentAlpha ?? 1.0) < 0.999) {
              ctx.globalAlpha *= Math.max(0, this.boardContentAlpha);
            }
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
          ctx.restore();
        }

        // --- LAYER 0.5: Render Studio Overlay Frame (Between Board & Sidebars) ---
        if (this.studioOverlay && this.studioOverlay.visible) {
          this.studioOverlay.render(ctx);
        }

        // --- LAYER 1: Render Sidebars (On Top — covers horizontal apex points) ---
        if (hudAlpha > 0.001) {
          ctx.save();
          if (hudAlpha < 0.999) ctx.globalAlpha *= hudAlpha;
          if (this.leftSidebar && this.leftSidebar.visible) {
            this.leftSidebar.render(ctx);
          }
          if (this.rightSidebar && this.rightSidebar.visible) {
            this.rightSidebar.render(ctx);
          }
          ctx.restore();
        }

        // --- LAYER 1.2: Render Top & Bottom Stat Pods (Fade in/out with overlay transitions) ---
        this._syncPodFade();
        const showPods = this._podFadeAlpha > 0.001 && hudAlpha > 0.001;
        if (this.topPod) {
          this.topPod.visible = showPods;
          this.topPod.alpha = this._podFadeAlpha * hudAlpha;
        }
        if (this.bottomPod) {
          this.bottomPod.visible = showPods;
          this.bottomPod.alpha = this._podFadeAlpha * hudAlpha;
        }

        if (showPods) {
          if (this.topPod && this.topPod.visible) {
            this.topPod.render(ctx);
          }
          if (this.bottomPod && this.bottomPod.visible) {
            this.bottomPod.render(ctx);
          }
        }
        ctx.restore();
      } else {
        this._podFadeAlpha = 0;
        this._podsTargetHidden = true;
      }

      // --- MACRO-LAYER 2: Independent Foreground Overlay (e.g. Hub Shell) ---
      if (this.foregroundRoot && this.foregroundOverlay && this.foregroundOverlay.visible) {
        this._syncForegroundRootTransform();
        this.foregroundRoot.updateTransforms();
        this.foregroundOverlay.render(ctx);
      }
    }

    _shouldHideStatPods() {
      if (!this.baseLayerVisible) return true;
      if (global.GameState?.isMatchEnding) return true;
      if (!this.studioOverlay || !this.studioOverlay.visible) return false;
      const isPopupOnly = this.studioOverlay.id === 'turn-confirm-scrim' || this.studioOverlay.id === 'turn-confirm-frame';
      if (isPopupOnly) return false;
      if (this.studioOverlay === global.GameSettingsCanvas?.containerNode) {
        return !!(global.GameSettingsCanvas.active || global.GameSettingsCanvas._isLeavingMatch);
      }
      if (this.studioOverlay === global.SigilNookCanvas?.containerNode) return global.SigilNookCanvas.stage !== 'closed';
      if (this.studioOverlay === global.StatCanvas?.containerNode) return !!global.StatCanvas.active;
      return true;
    }

    _syncPodFade() {
      const tweens = global.TweenOrchestrator;
      if (global.GameState?.isMatchEnding && global.BoardRenderer?.matchEndAnim) {
        tweens?.cancel?.('stat_pods_fade');
        this._podsTargetHidden = true;
        this._podFadeAlpha = Math.min(this._podFadeAlpha, global.BoardRenderer.getMatchEndObjectsAlpha());
        return;
      }
      const shouldHide = this._shouldHideStatPods();
      if (shouldHide === this._podsTargetHidden) return;
      this._podsTargetHidden = shouldHide;
      const targetAlpha = shouldHide ? 0.0 : 1.0;
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

    findNodeById(id, start = null) {
      if (!start) {
        const fg = (this.foregroundOverlay?.visible && this.foregroundRoot)
          ? this.findNodeById(id, this.foregroundRoot)
          : null;
        if (fg) return fg;
        return this.root ? this.findNodeById(id, this.root) : null;
      }
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

