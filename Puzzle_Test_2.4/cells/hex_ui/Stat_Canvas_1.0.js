/**
 * @fileoverview cells/hex_ui/Stat_Canvas_1.0.js - Player Stat Leaderboard Canvas (Core & Scene Builder)
 * @description Canvas helper primitives, StatCanvasClass lifecycle, player sorting, and scrollable scene assembly.
 */

(function(global) {
  'use strict';

  const fontSciFae = '"Sci-Fae", "SciFaePseudoScript10", "SciFae Pseudo Script 1.0", sans-serif';

  let _measCtx = null;
  function getMeasCtx() {
    if (!_measCtx && typeof document !== 'undefined') _measCtx = document.createElement('canvas').getContext('2d');
    return _measCtx;
  }

  function drawPointyHex(ctx, cx, cy, radius) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const angle = -Math.PI * 0.5 + (k * Math.PI) / 3;
      const vx = cx + radius * Math.cos(angle);
      const vy = cy + radius * Math.sin(angle);
      if (k === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
  }

  function drawSlotHex(ctx, sx, sy, R, fill, stroke, strokeW) {
    drawPointyHex(ctx, sx, sy, R);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeW; ctx.stroke(); }
  }

  const COMP_SLOT_PAL = {
    red:    { f: 'rgba(236, 14, 14, 0.16)', i: '#f87171' },
    blue:   { f: 'rgba(0, 64, 255, 0.16)',  i: '#38bdf8' },
    yellow: { f: 'rgba(255, 221, 87, 0.16)', i: '#fde047' },
    purple: { f: 'rgba(168, 85, 247, 0.16)', i: '#c084fc' }
  };

  class StatCanvasClass {
    constructor() {
      this.engine = null; this.containerNode = null; this.active = false; this.listTrait = null;

      // Real-time Configurable Parameters for green frame stat canvas pods
      this.config = {
        headerPodWidth: 640, headerPodHeight: 72, headerPodApex: 22,
        headerPodSpacing: 20, headerPairsSpacing: 14,
        playerPodWidth: 870, playerPodHeight: 154, playerPodApex: 42,
        playerPodSpacing: 12, playerPairsSpacing: 14, playerRowSpacing: 64, hpCompSpacing: 448
      };

      // Spawn-time seeds for deterministic 3D polyhedron animations across 6 players
      this.playerSeeds = Array.from({ length: 6 }, () => ({
        hpSeeds: Array.from({ length: 12 }, () => ({ phase: Math.random(), tilt: Math.random() })),
        bagSeeds: Array.from({ length: 12 }, () => ({ phase: Math.random(), tilt: Math.random() }))
      }));
    }

    setConfig(updates = {}) {
      Object.assign(this.config, updates);
      if (this.active) this.buildScene();
      global.BoardRenderer?.render?.();
    }

    init(engine) {
      this.engine = engine;
      const HexNode = global.HexNode;
      if (!HexNode) return false;

      this.containerNode = new HexNode({
        id: 'stat-canvas-frame', wBase: 960, hBase: 800, apex: 220, orientation: 'flat', clipContent: true,
        style: {
          bgColor: 'rgba(5, 10, 20, 0.94)', bgOpacity: 0.94,
          innerHighlight: { enabled: true, color: '#10f000', sharpEdgeColor: '#10f000', spread: 8, intensity: 0.80, steps: 3 },
          outerHighlight: { enabled: false, color: '#0284c7', blur: 24, intensity: 0.50 }
        }
      });
      this.containerNode.visible = false;
      this.containerNode.onResize = () => { if (this.active) this.buildScene(); };
      return true;
    }

    isAnimating() { return !!this.containerNode?.animating; }
    isOpen() { return this.active || this.isAnimating(); }
    toggle() { if (this.isAnimating()) return; if (this.active) this.close(); else this.open(); }

    open(keepSelect = false) {
      if (this.isAnimating() || global.GameState?.isMatchStarting || global.GameState?.isMatchEnding) return;
      if (!keepSelect && (this.isOpen() || global.GameSettingsCanvas?.isOpen?.() || global.SigilNookCanvas?.isOpen?.() || global.SigilEmblemStudio?.isOpen?.() || global.TurnConfirmPopup?.isOpen?.())) return;
      if (!keepSelect) this.playerSelectCallback = null;
      this.active = true;
      this._prevScroll = 0; this._prevTarget = 0;
      if (this.engine?.setStudioOverlay) this.engine.setStudioOverlay(this.containerNode);
      this.containerNode.visible = true;
      this.buildScene();
      if (global.TweenOrchestrator?.expandFrame) {
        global.TweenOrchestrator.expandFrame(this.containerNode, 'native-bot-stat-pod');
      }
      if (!keepSelect) global.AudioSynth?.playClick?.();
      global.BoardRenderer?.render?.();
    }

    openForPlayerSelect(callback) {
      this.playerSelectCallback = callback;
      this.open(true);
    }

    close(silent = false, onDone = null) {
      if ((!this.active && !this.containerNode?.visible) || this.isAnimating()) return;
      const wasSelect = !!this.playerSelectCallback;
      const wasMimicHeal = !!(wasSelect && global.SpellCharge?.isMimicking && global.SpellCharge?.activeMimicSpell === 'heal');
      this.active = false;
      this.playerSelectCallback = null;
      this._prevScroll = 0; this._prevTarget = 0;
      const doCloseCleanup = () => {
        if (this.containerNode) {
          this.containerNode.visible = false;
          this.containerNode.children = [];
          if (typeof this.containerNode.invalidateCache === 'function') this.containerNode.invalidateCache();
        }
        if (this.engine?.studioOverlay === this.containerNode && typeof this.engine.setStudioOverlay === 'function') {
          this.engine.setStudioOverlay(null);
        }
        global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
        global.BoardRenderer?.render?.();
        if (typeof onDone === 'function') onDone();
      };
      if (!silent) global.AudioSynth?.playClick?.();
      if (global.TweenOrchestrator?.collapseFrame && this.containerNode?.visible) {
        global.TweenOrchestrator.collapseFrame(this.containerNode, 'native-bot-stat-pod', {
          onComplete: doCloseCleanup
        });
      } else {
        doCloseCleanup();
      }
      global.BoardRenderer?.render?.();
      if (wasMimicHeal) {
        global.SpellCharge?.returnToChargeSelection?.();
      } else if (wasSelect) {
        global.UISidebarDeck?.openSpellbookColumn?.(false);
      }
    }

    goBack() { if (this.isAnimating()) return true; if (this.active) { this.close(); return true; } return false; }

    getSortedPlayers() {
      const g = global.GameState || {};
      global.MatchOrchestrator?.saveActivePlayerFromState?.(g);
      const round = Math.max(1, g.round || 1);
      const activeId = g.currentPlayerId || 1;
      const pts = g.getEstimatedPoints ? g.getEstimatedPoints() : (g.roundBonusPoints || 0);
      const livePending = (typeof g.getPendingDamage === 'function') ? g.getPendingDamage() : (g.pendingDamage || 0);

      const sourceList = (Array.isArray(g.players) && g.players.length > 0)
        ? g.players
        : [{ id: 1, name: 'Player 1', hp: g.hp ?? 12, maxHp: g.maxHp || 12, score: g.score || 0, componentsBag: g.componentsBag || [] }];

      const all = sourceList.map(p => {
        const isActive = (p.id === activeId);
        const score = isActive ? (g.score || 0) : (p.score || 0);
        const rawAve = score / round;
        const average = rawAve >= 100 ? Math.round(rawAve) : Number(rawAve.toFixed(rawAve >= 10 ? 1 : 2));
        return {
          id: p.id, name: p.name || `Player ${p.id}`,
          hp: isActive ? (g.hp ?? 12) : (p.hp ?? 12), maxHp: p.maxHp || 12,
          pendingDamage: isActive ? livePending : 0, pendingHeal: isActive ? (g.pendingHeal || 0) : (p.pendingHeal || 0),
          componentsBag: isActive ? (g.componentsBag || []) : (p.componentsBag || []),
          points: isActive ? pts : 0, score, average
        };
      });
      all.sort((a, b) => (b.average || 0) - (a.average || 0));
      return all;
    }

    buildScene() {
      if (!this.containerNode) return;
      this.containerNode.children = [];

      const HexNode = global.HexNode;
      const traits = global.HexTraits;
      if (!HexNode || !traits) return;

      const self = this;
      const g = global.GameState || {};

      const prevScroll = (this._prevScroll !== undefined) ? this._prevScroll : (this.listTrait ? this.listTrait.scrollOffset : 0);
      const prevTarget = (this._prevTarget !== undefined) ? this._prevTarget : (this.listTrait ? this.listTrait.targetScrollOffset : 0);
      this._prevScroll = undefined;
      this._prevTarget = undefined;

      const listContainer = new HexNode({
        id: 'stat-canvas-list-container',
        position: { x: 0, y: 0 },
        wBase: 960, hBase: 800, apex: 220, orientation: 'flat',
        clipContent: false,
        style: { bgOpacity: 0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
      });

      this.listTrait = new traits.ListTrait({
        slotHeight: this.config.playerPodHeight,
        spacing: this.config.playerPodSpacing,
        capacity: 4,
        allowManualScroll: true
      });
      this.listTrait.scrollOffset = Math.min(0, prevScroll);
      this.listTrait.targetScrollOffset = Math.min(0, prevTarget);

      this.listTrait.layoutChildren = function() {
        if (!this.node || !this.node.children.length) return;
        const items = this.node.children;
        const canvasH = self.containerNode?.dimensions?.hBase || 800;
        let curY = -canvasH * 0.5 + 40 + this.scrollOffset;
        for (let i = 0; i < items.length; i++) {
          const item = items[i], h = item.dimensions?.hBase || self.config.playerPodHeight;
          item.position.x = 0; item.position.y = curY + h * 0.5;
          curY += h + ((i === 0) ? self.config.headerPodSpacing : self.config.playerPodSpacing);
        }
        this.node._dirtyGeometry = true;
      };

      this.listTrait.handleWheel = function(deltaY) {
        if (!this.allowManualScroll || !this.node) return;
        const items = this.node.children;
        let totalH = 0;
        for (let i = 0; i < items.length; i++) {
          totalH += (items[i].dimensions?.hBase || self.config.playerPodHeight) + ((i === 0) ? self.config.headerPodSpacing : self.config.playerPodSpacing);
        }
        totalH -= self.config.playerPodSpacing;
        const canvasH = self.containerNode?.dimensions?.hBase || 800;
        const maxScroll = Math.max(0, totalH - canvasH + 80);
        this.targetScrollOffset = Math.max(-maxScroll, Math.min(0, this.targetScrollOffset - deltaY * 0.6));
      };

      listContainer.addTrait(this.listTrait);
      listContainer.addTrait({
        name: 'scroll-anim',
        render: () => {
          if (self.listTrait) {
            const before = self.listTrait.scrollOffset;
            self.listTrait.update();
            if (Math.abs(self.listTrait.scrollOffset - before) > 0.01) {
              global.BoardRenderer?.render?.();
            }
          }
        }
      });

      // 1. Header Stat Pod
      const headerPod = this.createHeaderStatPod(g);
      listContainer.addChild(headerPod);

      // 2. All Player Double-High Stat Pods
      const sortedPlayers = this.getSortedPlayers();
      sortedPlayers.forEach((p, idx) => {
        const pod = this.createPlayerDoublePod(p, idx);
        listContainer.addChild(pod);
      });

      this.listTrait.layoutChildren();
      this.containerNode.addChild(listContainer);
    }
  }

  StatCanvasClass._gfx = { fontSciFae, getMeasCtx, drawSlotHex, COMP_SLOT_PAL };

  const instance = new StatCanvasClass();
  global.StatCanvasClass = StatCanvasClass;
  global.StatCanvas = instance;
  global.ROLL_CALL?.set?.('Stat_Canvas_1.0', instance);
})(typeof window !== 'undefined' ? window : this);
