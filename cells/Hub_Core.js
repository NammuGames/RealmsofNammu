/**
 * @fileoverview cells/Hub_Core.js - Nammu Games Hub Opening Sequence & Crown Navigation (Group E)
 * @description Renders the pure Canvas 2D Hub landing sequence over Cosmic_Domain_Warp:
 * 1. Solid #000000 boot -> slow fade-in of the WebGL Cosmic Background.
 * 2. Expansion of the regular point-up Root hex ("Nammu" / "Games").
 * 3. Click drifts 3 regular point-up branch hexes (Empty / Puzzle / Empty) into a 3-point crown
 *    tethered by black-core, green-sides Aurora ribbons (Alignment_Motion_FX).
 * 4. Clicking "Puzzle" fades out Hub UI cleanly before Hub_Game_Loader mounts Puzzle.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const AURORA_CORE_GREEN = { color: '#000000', secondary: '#0abd0d', glow: '#0abd0d' };
  const AURORA_BRIGHT_GREEN = { color: '#000000', secondary: '#10f000', glow: '#10f000' };

  function makeRegularPointyHexDims(radius) {
    const r = Math.max(24, radius);
    return {
      wBase: Math.round(Math.sqrt(3) * r),
      hBase: Math.round(r),
      apex: Math.round(r * 0.5),
      orientation: 'pointy'
    };
  }

  class HubCoreClass {
    constructor() {
      this.ctx = null;
      this.stageNode = null;
      this.rootNode = null;
      this.branchNodes = []; // [leftEmpty, middlePuzzle, rightEmpty]

      this.stage = 'idle'; // 'fade_cosmos' | 'expand_root' | 'idle_root' | 'crown_expand' | 'idle_crown' | 'launching'
      this.veilAlpha = 1.0;
      this.uiAlpha = 1.0;
      this.crownProgress = 0.0;
      this.ribbonProgress = 0.0;
      this.crownOpen = false;
      this.metrics = { rootR: 112, branchR: 84, rootCrownY: 96, spreadX: 225, sideY: -78, topY: -162 };
    }

    /**
     * Mounts the Hub scene graph onto HexUIEngine and begins the opening sequence.
     * @param {Object} hubContext
     * @param {Object} [opts]
     */
    mount(hubContext = {}, opts = {}) {
      this.ctx = hubContext;
      const engine = hubContext.engine || global.HexUIEngine;
      if (!engine || !global.HexNode || !global.HexTraits) {
        console.error('[Hub_Core] Missing HexUIEngine, HexNode, or HexTraits.');
        return false;
      }

      if (engine.boardFrame) engine.boardFrame.visible = false;
      if (engine.leftSidebar) engine.leftSidebar.visible = false;
      if (engine.rightSidebar) engine.rightSidebar.visible = false;
      if (engine.topPod) engine.topPod.visible = false;
      if (engine.bottomPod) engine.bottomPod.visible = false;

      this._buildScene(engine);
      engine.setStudioOverlay(this.stageNode);
      this._layoutForViewport(engine.viewWidth || window.innerWidth, engine.viewHeight || window.innerHeight);

      if (opts.skipIntro) {
        this._cancelTweens();
        this.veilAlpha = 0.0;
        this.uiAlpha = 1.0;
        this.crownOpen = true;
        this.crownProgress = 1.0;
        this.ribbonProgress = 1.0;
        this.stage = 'idle_crown';
        this.rootNode.visible = true;
        this.rootNode.scale = 1.0;
        this.rootNode.alpha = 1.0;
        this.branchNodes.forEach((b) => {
          b.visible = true;
          b.scale = 1.0;
          b.alpha = 1.0;
        });
        this._applyPositions();
      } else {
        this._startIntroSequence();
      }
      return true;
    }

    /** Unmounts the Hub overlay cleanly before handing over to a launched game. */
    unmount() {
      this._cancelTweens();
      const engine = this.ctx?.engine || global.HexUIEngine;
      if (engine && engine.studioOverlay === this.stageNode) {
        engine.setStudioOverlay(null);
      }
      if (this.stageNode) this.stageNode.visible = false;
    }

    _cancelTweens() {
      const tweens = global.TweenOrchestrator;
      if (!tweens?.cancel) return;
      tweens.cancel('hub_cosmos_fade');
      tweens.cancel('hub_root_expand');
      tweens.cancel('hub_crown_drift');
      tweens.cancel('hub_fade_out');
    }

    _buildScene(engine) {
      const HexNode = global.HexNode;
      const { ButtonTrait, TextTrait } = global.HexTraits;
      const self = this;

      // Full-viewport inert stage container centered by HexUIEngine
      const stageNode = new HexNode({
        id: 'hub-core-stage',
        wBase: 1920,
        hBase: 1080,
        apex: 0,
        orientation: 'flat',
        clipContent: false,
        inert: true,
        style: { bgColor: '#000000', bgOpacity: 0.0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
      });
      stageNode.pointerEvents = 'none';
      stageNode.isCustomSized = true;
      stageNode.onResize = () => {
        self._layoutForViewport(engine.viewWidth || window.innerWidth, engine.viewHeight || window.innerHeight);
      };

      // Trait drawing Aurora ribbons underneath branch/root nodes and boot black veil
      stageNode.addTrait({
        name: 'hubStageBackdrop',
        render(ctx) {
          self._renderStageBackdrop(ctx);
        }
      });

      const makeStyle = (isEnabled) => ({
        bgColor: isEnabled ? 'rgba(4, 12, 14, 0.90)' : 'rgba(6, 10, 16, 0.72)',
        bgOpacity: isEnabled ? 0.90 : 0.72,
        innerHighlight: { enabled: true, color: isEnabled ? '#10f000' : '#1f3a2e', sharpEdgeColor: isEnabled ? '#10f000' : '#2d5240', spread: isEnabled ? 8 : 5, intensity: isEnabled ? 0.85 : 0.45, steps: 3 },
        outerHighlight: { enabled: isEnabled, color: '#0abd0d', blur: 18, intensity: 0.42 }
      });

      const createBranch = (id, label, isPuzzle) => {
        const node = new HexNode({ id, ...makeRegularPointyHexDims(84), clipContent: false, visible: false, alpha: 0, scale: 0.65, style: makeStyle(isPuzzle) });
        node.isCustomSized = true;
        node.addTrait(new TextTrait({
          title: label, titleSize: isPuzzle ? 24 : 18,
          titleColor: isPuzzle ? '#f8fafc' : 'rgba(203, 213, 225, 0.55)',
          fontFamily: '"Orbitron", "Inter", sans-serif'
        }));
        node.addTrait(new ButtonTrait({
          disabled: !isPuzzle, hoverGlowColor: '#10f000', hoverOutline: isPuzzle, soundClick: false,
          onClick: () => { if (isPuzzle) self._onPuzzleClicked(); }
        }));
        return node;
      };

      const leftEmpty = createBranch('hub-branch-left-empty', 'Empty', false);
      const midPuzzle = createBranch('hub-branch-puzzle', 'Puzzle', true);
      const rightEmpty = createBranch('hub-branch-right-empty', 'Empty', false);

      // Root node is added LAST so branch nodes visibly emerge from behind it
      const rootNode = new HexNode({
        id: 'hub-root-nammu-games', ...makeRegularPointyHexDims(112),
        clipContent: false, visible: false, alpha: 0, scale: 0.001, style: makeStyle(true)
      });
      rootNode.isCustomSized = true;
      rootNode.addTrait(new TextTrait({
        title: ['Nammu', 'Games'], titleSize: 28, lineSpacing: 32,
        titleColor: '#f8fafc', fontFamily: '"Orbitron", "Inter", sans-serif'
      }));
      rootNode.addTrait(new ButtonTrait({ hoverGlowColor: '#10f000', soundClick: false, onClick: () => self._onRootClicked() }));

      stageNode.addChild(leftEmpty);
      stageNode.addChild(midPuzzle);
      stageNode.addChild(rightEmpty);
      stageNode.addChild(rootNode);

      this.stageNode = stageNode;
      this.rootNode = rootNode;
      this.branchNodes = [leftEmpty, midPuzzle, rightEmpty];
    }

    _layoutForViewport(w, h) {
      if (!this.stageNode || !this.rootNode) return;
      const vw = Math.max(320, w || 1280);
      const vh = Math.max(240, h || 720);
      this.stageNode.setDimensions(vw, vh, 0, 'flat');

      const s = Math.min(1.0, vw / 1180, vh / 680);
      const rootR = Math.round(112 * s);
      const branchR = Math.round(84 * s);

      this.metrics = {
        rootR,
        branchR,
        rootCrownY: Math.round(108 * s),
        spreadX: Math.round(235 * s),
        sideY: Math.round(-72 * s),
        topY: Math.round(-162 * s),
        ribbonWidth: Math.max(44, Math.round(104 * s))
      };

      const rootDims = makeRegularPointyHexDims(rootR);
      this.rootNode.setDimensions(rootDims.wBase, rootDims.hBase, rootDims.apex, 'pointy');
      const rootText = this.rootNode.getTrait('text');
      if (rootText) {
        rootText.titleSize = Math.max(14, Math.round(28 * s));
        rootText.lineSpacing = Math.max(16, Math.round(32 * s));
      }

      const branchDims = makeRegularPointyHexDims(branchR);
      this.branchNodes.forEach((b, idx) => {
        b.setDimensions(branchDims.wBase, branchDims.hBase, branchDims.apex, 'pointy');
        const txt = b.getTrait('text');
        if (txt) {
          txt.titleSize = idx === 1 ? Math.max(12, Math.round(24 * s)) : Math.max(10, Math.round(18 * s));
        }
      });

      this._applyPositions();
      this.stageNode.updateTransforms();
    }

    _applyPositions() {
      if (!this.rootNode || this.branchNodes.length < 3) return;
      const m = this.metrics;
      const p = this.crownProgress;
      const rootY = m.rootCrownY * p;

      this.rootNode.position.x = 0;
      this.rootNode.position.y = rootY;

      const targets = [
        { x: -m.spreadX, y: m.sideY },
        { x: 0, y: m.topY },
        { x: m.spreadX, y: m.sideY }
      ];

      this.branchNodes.forEach((b, i) => {
        b.position.x = targets[i].x * p;
        b.position.y = rootY + (targets[i].y - rootY) * p;
      });
    }

    _startIntroSequence() {
      this._cancelTweens();
      this.stage = 'fade_cosmos';
      this.veilAlpha = 1.0;
      this.uiAlpha = 1.0;
      this.crownOpen = false;
      this.crownProgress = 0.0;
      this.ribbonProgress = 0.0;

      this.rootNode.visible = false;
      this.rootNode.scale = 0.001;
      this.rootNode.alpha = 0.0;
      this.branchNodes.forEach((b) => {
        b.visible = false;
        b.alpha = 0.0;
      });
      this._applyPositions();

      const tweens = global.TweenOrchestrator;
      const beatMs = (global.H_TIMING?.BEAT_SEC || 0.302718) * 1000;

      if (!tweens?.add) {
        this.veilAlpha = 0.0;
        this._expandRootButton();
        return;
      }

      // Phase A: Slow Cosmic Background fade-in from pure black
      tweens.add({
        id: 'hub_cosmos_fade',
        from: 1.0,
        to: 0.0,
        duration: Math.round(beatMs * 6),
        easing: 'easeInOutQuad',
        onUpdate: (val) => { this.veilAlpha = val; },
        onComplete: () => {
          this.veilAlpha = 0.0;
          this._expandRootButton();
        }
      });
    }

    _expandRootButton() {
      this.stage = 'expand_root';
      this.rootNode.visible = true;
      this.rootNode.scale = 0.02;
      this.rootNode.alpha = 0.0;

      const tweens = global.TweenOrchestrator;
      const beatMs = (global.H_TIMING?.BEAT_SEC || 0.302718) * 1000;

      if (!tweens?.add) {
        this.rootNode.scale = 1.0;
        this.rootNode.alpha = 1.0;
        this.stage = 'idle_root';
        return;
      }

      tweens.add({
        id: 'hub_root_expand',
        from: 0.0,
        to: 1.0,
        duration: Math.round(beatMs * 3),
        easing: 'easeOutBack',
        onUpdate: (val, rawT) => {
          this.rootNode.scale = Math.max(0.02, val);
          this.rootNode.alpha = Math.min(1.0, rawT * 1.4);
          this.stageNode?.updateTransforms();
        },
        onComplete: () => {
          this.rootNode.scale = 1.0;
          this.rootNode.alpha = 1.0;
          this.stage = 'idle_root';
          this.stageNode?.updateTransforms();
        }
      });
    }

    _onRootClicked() {
      if (this.stage !== 'idle_root' || this.crownOpen) return;
      this.crownOpen = true;
      this.stage = 'crown_expand';
      global.AudioSynth?.playConfirm?.();

      const tweens = global.TweenOrchestrator;
      const beatMs = (global.H_TIMING?.BEAT_SEC || 0.302718) * 1000;

      this.branchNodes.forEach((b) => {
        b.visible = true;
        b.scale = 0.72;
        b.alpha = 0.0;
      });

      if (!tweens?.add) {
        this.crownProgress = 1.0;
        this.ribbonProgress = 1.0;
        this.branchNodes.forEach((b) => { b.scale = 1.0; b.alpha = 1.0; });
        this._applyPositions();
        this.stage = 'idle_crown';
        return;
      }

      tweens.add({
        id: 'hub_crown_drift',
        from: 0.0,
        to: 1.0,
        duration: Math.round(beatMs * 3.5),
        easing: 'easeOutCubic',
        onUpdate: (val, rawT) => {
          this.crownProgress = val;
          this.ribbonProgress = Math.min(1.0, rawT * 1.1);
          const bAlpha = Math.min(1.0, rawT * 1.5);
          const bScale = 0.72 + 0.28 * val;
          this.branchNodes.forEach((b) => {
            b.alpha = bAlpha * this.uiAlpha;
            b.scale = bScale;
          });
          this._applyPositions();
          this.stageNode?.updateTransforms();
        },
        onComplete: () => {
          this.crownProgress = 1.0;
          this.ribbonProgress = 1.0;
          this.branchNodes.forEach((b) => {
            b.scale = 1.0;
            b.alpha = this.uiAlpha;
          });
          this._applyPositions();
          this.stage = 'idle_crown';
          this.stageNode?.updateTransforms();
        }
      });
    }

    _onPuzzleClicked() {
      if (this.stage !== 'idle_crown') return;
      this.stage = 'launching';
      global.AudioSynth?.playConfirm?.();

      const lockBtn = (n) => {
        const b = n?.getTrait?.('button');
        if (b) b.disabled = true;
      };
      lockBtn(this.rootNode);
      this.branchNodes.forEach(lockBtn);

      const tweens = global.TweenOrchestrator;
      const beatMs = (global.H_TIMING?.BEAT_SEC || 0.302718) * 1000;
      const launch = async () => {
        this.unmount();
        const loader = this.ctx?.loader || global.HubGameLoader;
        const ok = loader ? await loader.launchGame('puzzle') : false;
        if (!ok) {
          this.mount(this.ctx, { skipIntro: true });
        }
      };

      if (!tweens?.add) {
        launch();
        return;
      }

      tweens.add({
        id: 'hub_fade_out',
        from: 1.0,
        to: 0.0,
        duration: Math.round(beatMs * 2),
        easing: 'easeInOutQuad',
        onUpdate: (val) => {
          this.uiAlpha = val;
          if (this.rootNode) this.rootNode.alpha = val;
          this.branchNodes.forEach((b) => { b.alpha = val; });
        },
        onComplete: () => {
          this.uiAlpha = 0.0;
          launch();
        }
      });
    }

    _renderStageBackdrop(ctx) {
      // 1. Aurora ribbons (black core, green sides) connecting Root -> 3 Crown branches
      if (this.ribbonProgress > 0.01 && this.uiAlpha > 0.01 && global.AlignmentMotionFX?.drawAurora && this.rootNode) {
        const time = this.ctx?.state?.time ?? (performance.now() * 0.001);
        const pRoot = { x: this.rootNode.position.x, y: this.rootNode.position.y };
        ctx.save();
        ctx.globalAlpha *= Math.max(0, Math.min(1, this.uiAlpha));
        this.branchNodes.forEach((branch, idx) => {
          if (!branch.visible) return;
          const pTarget = { x: branch.position.x, y: branch.position.y };
          const phase = idx * 1.4;
          global.AlignmentMotionFX.drawAurora(
            ctx,
            pRoot,
            pTarget,
            time,
            AURORA_CORE_GREEN,
            AURORA_BRIGHT_GREEN,
            phase,
            this.metrics.ribbonWidth || 92,
            this.ribbonProgress
          );
        });
        ctx.restore();
      }

      // 2. Opening Black Boot Veil fading out cleanly to reveal Cosmic_Domain_Warp
      if (this.veilAlpha > 0.002) {
        const w = (this.stageNode?.dimensions?.wBase || 2000) + 120;
        const h = (this.stageNode?.dimensions?.hBase || 1200) + 120;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, this.veilAlpha));
        ctx.fillStyle = '#000000';
        ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
        ctx.restore();
      }
    }
  }

  const instance = new HubCoreClass();
  global.HubCore = instance;
  global.ROLL_CALL = global.ROLL_CALL || new Map();
  global.ROLL_CALL.set('Hub_Core', instance);
})(typeof window !== 'undefined' ? window : this);
