/**
 * @fileoverview cells/hex_ui/Native_Stat_Pod_1.0.js - Top Telemetry Pod Core & Scene Graph (Part 1/2)
 * @description Manages NativeStatPodClass state, top flat-top hex pod construction, 6 dual-hex stat
 * pairs, button bindings, and NativeVitalityPod delegation. (Layout, cross-fades & highlights live in 1.1).
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const fontSciFae = '"Sci-Fae", "SciFaePseudoScript10", "SciFae Pseudo Script 1.0", sans-serif';

  let _measCtx = null;
  function getMeasCtx() {
    if (!_measCtx && typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      _measCtx = c.getContext('2d');
    }
    return _measCtx;
  }

  class NativeStatPodClass {
    constructor() {
      this.engine = null;
      this.topPodNode = null;
      this.viewWidth = 0;
      this.viewHeight = 0;

      // Stats Model
      this.stats = { player: '1', turn: 'P1', round: '1', points: '0', score: '0', ave: '0' };

      this.statDefs = [
        { key: 'player', label: 'Player', val: '1', color: '#60a5fa' },
        { key: 'turn', label: 'Turn', val: 'P1', color: '#38bdf8', isTurn: true },
        { key: 'round', label: 'Round', val: '1', color: '#e2e8f0' },
        { key: 'points', label: 'Combo', val: '0', color: '#fbbf24' },
        { key: 'score', label: 'Score', val: '0', color: '#38bdf8' },
        { key: 'ave', label: 'Average', val: '0', color: '#c084fc' }
      ];

      this.statTypeNodes = {};
      this.statValNodes = {};
      this._scorePulse = { state: 'idle', scale: 1.0, lastMs: 0 };
      this._statFades = {};
      this._playerTurnMatched = null;

      // Configurable Parameters (Tuning Lab Controls)
      this.config = {
        podEdgeY: 42,
        podHeight: 72,
        podApex: 22,
        topPodWidth: 1354,
        botPodWidth: 872,
        hpCompScale: 1.5,
        hpCompOffset: 224,
        hpCompY: 0,
        statHeight: 44,
        statApex: 14,
        statValWidth: 72,
        statTextSize: 30,
        statTextY: 1,
        statSpacing: 10,
        statY: 0
      };
    }

    // Delegated Vitality Getters & Forwarders for 100% Backwards Compatibility
    get botPodNode() { return global.NativeVitalityPod?.botPodNode || null; }
    get containerNode() { return global.NativeVitalityPod?.botPodNode || null; }
    get hpNode() { return global.NativeVitalityPod?.hpNode || null; }
    get compNode() { return global.NativeVitalityPod?.compNode || null; }
    get hp() { return global.NativeVitalityPod?.hp ?? 10; }
    set hp(v) { if (global.NativeVitalityPod) global.NativeVitalityPod.hp = v; }
    get maxHp() { return global.NativeVitalityPod?.maxHp ?? 12; }
    get pendingDamage() { return global.NativeVitalityPod?.pendingDamage ?? 0; }
    get pendingHeal() { return global.NativeVitalityPod?.pendingHeal ?? 0; }
    get componentsBag() { return global.NativeVitalityPod?.componentsBag || []; }
    get isLastBreath() { return global.NativeVitalityPod?.isLastBreath || false; }

    updateHpCompLayout() { global.NativeVitalityPod?.updateHpCompLayout?.(); }
    setHp(c, d, h) { global.NativeVitalityPod?.setHp?.(c, d, h); }
    setPendingDamage(dmg) { global.NativeVitalityPod?.setPendingDamage?.(dmg); }
    setPendingHeal(heal) { global.NativeVitalityPod?.setPendingHeal?.(heal); }
    setComponents(bag) { global.NativeVitalityPod?.setComponents?.(bag); }

    setPodConfig(updates = {}) {
      Object.assign(this.config, updates);
      this.applyPodDimensions();
      if (global.NativeVitalityPod?.setPodConfig) {
        global.NativeVitalityPod.setPodConfig(updates);
      }
      if (this.viewWidth && this.viewHeight) {
        this.resize(this.viewWidth, this.viewHeight);
      } else {
        this.updateStatsLayout();
      }
    }

    applyPodDimensions() {
      const cfg = this.config;
      if (this.topPodNode) {
        this.topPodNode.setDimensions(cfg.topPodWidth, cfg.podHeight, cfg.podApex, 'flat');
        this.topPodNode.invalidateCache();
      }
    }

    init(engine) {
      this.engine = engine;
      const HexNode = global.HexNode;
      if (!HexNode) return false;

      const self = this;
      const cfg = this.config;

      // 1. TOP STAT POD (6 Dual-Hex Stat Pairs)
      this.topPodNode = new HexNode({
        id: 'native-top-stat-pod', wBase: cfg.topPodWidth, hBase: cfg.podHeight, apex: cfg.podApex, orientation: 'flat', clipContent: false,
        style: {
          bgColor: 'rgba(7, 12, 24, 0.93)', bgOpacity: 1.0,
          innerHighlight: { enabled: true, color: '#10f000', sharpEdgeColor: '#10f000', spread: 8, intensity: 0.80, lineWidth: 1.4, steps: 3 },
          outerHighlight: { enabled: false, color: '#a855f7', sharpEdgeColor: '#a855f7', blur: 18, intensity: 0.35, steps: 3 }
        }
      });
      this.topPodNode.isSidebarButton = true;
      this.topPodNode.cacheBezel = true;

      // Build Top Pod: 6 Dual-Hex Stat Pairs (Sci-Fae)
      this.statDefs.forEach(def => {
        const typeNode = new HexNode({
          id: `stat-type-${def.key}`, wBase: 56, hBase: cfg.statHeight, apex: cfg.statApex, orientation: 'flat',
          style: {
            bgColor: 'rgba(15, 23, 42, 1.0)', bgOpacity: 1.0,
            innerHighlight: { enabled: true, color: '#953ffd', sharpEdgeColor: '#953ffd', spread: 6, intensity: 0.45, lineWidth: 1.2 },
            outerHighlight: { enabled: false }
          }
        });

        typeNode.addTrait({
          name: 'type-label',
          render(ctx, node) {
            ctx.save();
            ctx.font = `400 ${self.config.statTextSize}px ${fontSciFae}`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            const leftPad = 8;
            const textStartX = - (node.dimensions.wBase * 0.5) + leftPad;
            const tY = (self.config.statTextY || 0) + 0.5;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(def.label, textStartX, tY);
            ctx.restore();
          }
        });
        self.topPodNode.addChild(typeNode);
        self.statTypeNodes[def.key] = typeNode;

        const valNode = new HexNode({
          id: `stat-val-${def.key}`, wBase: 42, hBase: cfg.statHeight, apex: cfg.statApex, orientation: 'flat',
          style: {
            bgColor: '#0f172a', bgOpacity: 1.0,
            innerHighlight: { enabled: true, color: '#3d6eff', sharpEdgeColor: '#3d6eff', spread: 8, intensity: 0.80, steps: 3 },
            outerHighlight: { enabled: false }
          }
        });

        valNode.addTrait({
          name: 'val-display',
          render(ctx) { self._renderStatValue?.(ctx, def); }
        });
        self.topPodNode.addChild(valNode);
        self.statValNodes[def.key] = valNode;
      });
      this.updatePlayerTurnHighlight?.();

      // Keep score value hex above neighbor borders when inflated during point arrivals
      if (this.statValNodes['score']) {
        this.topPodNode.removeChild(this.statValNodes['score']);
        this.topPodNode.addChild(this.statValNodes['score']);
      }

      this.topPodNode.addTrait({
        name: 'score-pulse-anim',
        update() { self._tickStatAnimations?.(); }
      });

      this.updateStatsLayout?.();

      if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => { self.updateStatsLayout?.(); });
      }

      const traits = global.HexTraits;
      if (traits?.ButtonTrait) {
        const onPodClick = () => { if (global.StatCanvas) global.StatCanvas.toggle(); };
        const bindPod = (parentPod, node) => {
          if (!node) return;
          const isParent = (node === parentPod);
          if (isParent) node.isSidebarButton = true;
          const trait = new traits.ButtonTrait({ hoverOutline: false, onClick: onPodClick });
          if (!isParent) {
            const origDown = trait.handlePointerDown.bind(trait);
            trait.handlePointerDown = () => { origDown(); const p = parentPod.getTrait('button'); if (p) p.state = 'pressed'; };
            const origUp = trait.handlePointerUp.bind(trait);
            trait.handlePointerUp = (inside) => { origUp(inside); const p = parentPod.getTrait('button'); if (p) p.state = inside ? 'hovered' : 'idle'; };
            trait.onHover = (h) => { const p = parentPod.getTrait('button'); if (p) p.state = h ? 'hovered' : 'idle'; };
          }
          node.addTrait(trait);
          if (node.children) node.children.forEach(c => bindPod(parentPod, c));
        };
        bindPod(this.topPodNode, this.topPodNode);
      }

      if (this.engine?.setTopPod) {
        this.engine.setTopPod(this.topPodNode);
      } else if (this.engine?.root) {
        this.engine.root.addChild(this.topPodNode);
      }

      // Initialize Companion Bottom Vitality Pod if present
      if (global.NativeVitalityPod?.init) {
        global.NativeVitalityPod.init(engine);
      }

      const initW = this.engine?.viewWidth || (typeof window !== 'undefined' ? window.innerWidth : 0);
      const initH = this.engine?.viewHeight || (typeof window !== 'undefined' ? window.innerHeight : 0);
      if (initW && initH) this.resize?.(initW, initH);

      return true;
    }
  }

  NativeStatPodClass._gfx = { fontSciFae, getMeasCtx };

  const instance = new NativeStatPodClass();
  global.NativeStatPodClass = NativeStatPodClass;
  global.NativeStatPod = instance;
  global.ROLL_CALL?.set?.('Native_Stat_Pod_1.0', instance);
})(typeof window !== 'undefined' ? window : this);
