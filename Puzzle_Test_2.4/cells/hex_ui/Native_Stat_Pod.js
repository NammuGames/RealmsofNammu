/**
 * @fileoverview cells/hex_ui/Native_Stat_Pod.js - Top Telemetry Flat-Top Hex Pod
 * @description Manages the top flat-top hex pod displaying 5 overlapping dual-hex stat pairs
 * [TURN, ROUND, POINTS/COMBO, SCORE, AVERAGE] rendered in Sci-Fae script.
 * Delegates the bottom Vitality (HP & Component Bag) HUD to Native_Vitality_Pod.
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

    // Delegated Vitality Getters for 100% Backwards Compatibility
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
            innerHighlight: { enabled: true, color: '#3d6eff', sharpEdgeColor: '#3d6eff', spread: 6, intensity: 0.65, lineWidth: 1.4 },
            outerHighlight: { enabled: true, color: '#3d6eff', blur: 8, intensity: 0.35 }
          }
        });

        valNode.addTrait({
          name: 'val-display',
          render(ctx) {
            ctx.save();
            ctx.font = `400 ${self.config.statTextSize}px ${fontSciFae}`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const tY = (self.config.statTextY || 0) + 1.5;
            const drawVal = (txt, alpha) => {
              if (alpha <= 0.005) return;
              ctx.save(); ctx.globalAlpha *= alpha;
              ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; ctx.fillText(txt, 0.5, tY + 0.5);
              ctx.fillStyle = '#ffffff'; ctx.fillText(txt, 0, tY);
              ctx.restore();
            };
            const fade = self._statFades?.[def.key];
            if (fade) {
              const lp = global.TurnLogPlayer;
              const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
              const p = fade.logDriven
                ? ((lp?.active && (lp.stage === 'TO_PRE' || lp.stage === 'TO_POST')) ? (lp.progress ?? 1.0) : 1.0)
                : Math.max(0.0, Math.min(1.0, (now - fade.startMs) / Math.max(1, fade.durationMs)));
              if (p < 1.0) { drawVal(fade.oldVal, 1.0 - p); drawVal(fade.newVal, p); }
              else { delete self._statFades[def.key]; drawVal(self.stats[def.key] ?? def.val, 1.0); }
            } else {
              drawVal(self.stats[def.key] ?? def.val, 1.0);
            }
            ctx.restore();
          }
        });
        self.topPodNode.addChild(valNode);
        self.statValNodes[def.key] = valNode;
      });
      this.updatePlayerTurnHighlight();

      // Keep score value hex above neighbor borders when inflated during point arrivals
      if (this.statValNodes['score']) {
        this.topPodNode.removeChild(this.statValNodes['score']);
        this.topPodNode.addChild(this.statValNodes['score']);
      }

      // Per-frame attack/release scale bounce on the score value hex (1/8 H-Beat up to 1.20x, 1 H-Beat down)
      // plus timed cross-fade tick cleanup for non-log stat number transitions
      this.topPodNode.addTrait({
        name: 'score-pulse-anim',
        update() {
          const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          const fades = self._statFades;
          if (fades) {
            let hasActiveTimedFade = false;
            for (const k of Object.keys(fades)) {
              const f = fades[k];
              if (!f) continue;
              if (f.logDriven) {
                const lp = global.TurnLogPlayer;
                if (!lp?.active || (lp.stage !== 'TO_PRE' && lp.stage !== 'TO_POST') || (lp.progress ?? 1) >= 1) delete fades[k];
              } else if ((now - f.startMs) >= f.durationMs) {
                delete fades[k];
              } else {
                hasActiveTimedFade = true;
              }
            }
            if (hasActiveTimedFade) global.BoardRenderer?.render?.();
          }
          const p = self._scorePulse, vNode = self.statValNodes['score'];
          if (!p || !vNode) return;
          if (p.state === 'idle') {
            vNode.scale = 1.0;
            return;
          }
          const dt = p.lastMs > 0 ? Math.min(0.1, Math.max(0, (now - p.lastMs) * 0.001)) : 0;
          p.lastMs = now;
          const h1Sec = global.H_TIMING?.BEAT_SEC ?? (Math.pow(12, 8) / 1420405751.768);
          if (p.state === 'attack') {
            p.scale += (0.20 / (0.125 * h1Sec)) * dt;
            if (p.scale >= 1.20) { p.scale = 1.20; p.state = 'release'; }
          } else if (p.state === 'release') {
            p.scale -= (0.20 / (1.0 * h1Sec)) * dt;
            if (p.scale <= 1.0) { p.scale = 1.0; p.state = 'idle'; }
          }
          vNode.scale = p.scale;
        }
      });

      this.updateStatsLayout();

      if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          self.updateStatsLayout();
        });
      }

      const traits = global.HexTraits;
      if (traits?.ButtonTrait) {
        const onPodClick = () => {
          if (global.StatCanvas) {
            global.StatCanvas.toggle();
          }
        };
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
      if (initW && initH) {
        this.resize(initW, initH);
      }

      return true;
    }

    updateStatsLayout() {
      const meas = getMeasCtx();
      const cfg = this.config;
      const leftApex = cfg.statApex, rightApex = cfg.statApex, statH = cfg.statHeight;
      const clearance = 4, leftPad = 8;
      const pairMetrics = [];
      let totalPairsWidth = 0;

      this.statDefs.forEach(def => {
        let labelW = 24;
        if (meas) {
          meas.font = `400 ${cfg.statTextSize}px ${fontSciFae}`;
          meas.textAlign = 'left'; meas.textBaseline = 'middle';
          const metrics = meas.measureText(def.label);
          const inkW = metrics.actualBoundingBoxRight;
          labelW = Math.ceil((inkW && inkW > 0) ? inkW : metrics.width);
        }
        const contentW = labelW;

        const rightWBase = Math.round((cfg.statValWidth || 44) / 2) * 2;
        const rightHalfSpan = rightWBase * 0.5 + rightApex;
        const leftWBase = Math.round((leftPad + contentW + clearance + rightWBase * 0.5) / 2) * 2;
        const leftHalfSpan = leftWBase * 0.5 + leftApex;

        const textEndX = - (leftWBase * 0.5) + leftPad + contentW;
        const dx = textEndX + clearance + rightHalfSpan;
        const pairSpan = leftHalfSpan + dx + rightHalfSpan;

        pairMetrics.push({ def, leftWBase, rightWBase, dx, leftHalfSpan, rightHalfSpan, pairSpan });
        totalPairsWidth += pairSpan;
      });

      const numPairs = pairMetrics.length;
      const gap = cfg.statSpacing;
      const fullSpanWithGaps = totalPairsWidth + (numPairs - 1) * gap;
      let curX = - fullSpanWithGaps * 0.5;

      pairMetrics.forEach(m => {
        const typeNode = this.statTypeNodes[m.def.key];
        const valNode = this.statValNodes[m.def.key];

        if (typeNode && valNode) {
          typeNode.setDimensions(m.leftWBase, statH, leftApex, 'flat');
          valNode.setDimensions(m.rightWBase, statH, rightApex, 'flat');

          typeNode.position.x = Math.round(curX + m.leftHalfSpan);
          typeNode.position.y = cfg.statY;

          valNode.position.x = Math.round(typeNode.position.x + m.dx);
          valNode.position.y = cfg.statY;
        }

        curX += m.pairSpan + gap;
      });

      if (this.topPodNode) this.topPodNode.updateTransforms(this.topPodNode.parent?.worldMatrix || this.engine?.root?.worldMatrix || null);
    }

    updateHpCompLayout() { global.NativeVitalityPod?.updateHpCompLayout?.(); }
    setHp(c, d, h) { global.NativeVitalityPod?.setHp?.(c, d, h); }
    setPendingDamage(dmg) { global.NativeVitalityPod?.setPendingDamage?.(dmg); }
    setPendingHeal(heal) { global.NativeVitalityPod?.setPendingHeal?.(heal); }
    setComponents(bag) { global.NativeVitalityPod?.setComponents?.(bag); }

    /** Highlights right pods of Player and Turn with standard double orange border when they match. */
    updatePlayerTurnHighlight() {
      const pNode = this.statValNodes?.['player'], tNode = this.statValNodes?.['turn'];
      if (!pNode || !tNode) return;
      const norm = v => String(v ?? '').replace(/^P/i, '').trim();
      const isMatch = norm(this.stats.player) !== '' && norm(this.stats.player) === norm(this.stats.turn);
      if (this._playerTurnMatched === isMatch) return;
      this._playerTurnMatched = isMatch;
      const style = isMatch
        ? { bgColor: '#0f172a', bgOpacity: 1.0, innerHighlight: { enabled: true, color: '#ff9214', sharpEdgeColor: '#ff9214', spread: 8, intensity: 0.80, steps: 3 }, outerHighlight: { enabled: true, color: '#ff9214', sharpEdgeColor: '#ff9214', blur: 8, intensity: 0.80, steps: 3 } }
        : { bgColor: '#0f172a', bgOpacity: 1.0, innerHighlight: { enabled: true, color: '#3d6eff', sharpEdgeColor: '#3d6eff', spread: 6, intensity: 0.65, lineWidth: 1.4 }, outerHighlight: { enabled: true, color: '#3d6eff', blur: 8, intensity: 0.35 } };
      [pNode, tNode].forEach(n => { Object.assign(n.style, style); n.invalidateCache?.(); });
    }

    _applyStatValue(normalizedKey, valStr, opts = {}) {
      if (this.stats[normalizedKey] === undefined) return;
      const prevStr = String(this.stats[normalizedKey] ?? '');
      if (prevStr === valStr) return;
      const lp = global.TurnLogPlayer;
      const isLogFade = !!(lp?.active && (lp.stage === 'TO_PRE' || lp.stage === 'TO_POST'));
      if (opts.immediate || !this.topPodNode?.visible) {
        delete this._statFades[normalizedKey];
      } else {
        const durMs = global.H_TIMING?.THREE_BEATS_MS ?? (3000 * Math.pow(12, 8) / 1420405751.768);
        this._statFades[normalizedKey] = { oldVal: prevStr, newVal: valStr, startMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()), durationMs: durMs, logDriven: isLogFade };
      }
      this.stats[normalizedKey] = valStr;
    }

    setStat(key, val, opts = {}) {
      const normalizedKey = (key === 'average') ? 'ave' : ((key === 'combo') ? 'points' : key);
      if (this.stats[normalizedKey] === undefined) return;
      this._applyStatValue(normalizedKey, val.toString(), opts);
      this.updatePlayerTurnHighlight();
      this.updateStatsLayout();
    }
    setStats(updates = {}, opts = {}) {
      if (updates.average !== undefined && updates.ave === undefined) updates.ave = updates.average;
      if (updates.combo !== undefined && updates.points === undefined) updates.points = updates.combo;
      Object.keys(updates).forEach(k => { if (updates[k] !== undefined) this._applyStatValue(k, updates[k].toString(), opts); });
      this.updatePlayerTurnHighlight();
      this.updateStatsLayout();
    }

    resize(viewWidth, viewHeight) {
      this.viewWidth = viewWidth;
      this.viewHeight = viewHeight;
      const cfg = this.config;
      if (this.topPodNode) {
        this.topPodNode.position.x = viewWidth * 0.5;
        this.topPodNode.position.y = cfg.podEdgeY;
      }
      this.updateStatsLayout();
      if (global.NativeVitalityPod?.resize) {
        global.NativeVitalityPod.resize(viewWidth, viewHeight);
      }
    }

    getScoreSubPodCenter() {
      const top = this.topPodNode;
      const val = this.statValNodes?.['score'];
      if (val?.worldMatrix) return { x: val.worldMatrix[4], y: val.worldMatrix[5] };
      const topX = top ? top.position.x : ((this.viewWidth || (typeof window !== 'undefined' ? window.innerWidth : 1920)) * 0.5);
      const topY = top ? top.position.y : (this.config.podEdgeY || 42);
      const valX = val?.position?.x ?? 0;
      const valY = val?.position?.y ?? 0;
      return { x: topX + valX, y: topY + valY };
    }

    /**
     * Triggers the Score hex 1.0x -> 1.20x flutter pulse (1/8 H-Beat expand, 1 H-Beat deflate).
     */
    triggerScoreBounce() {
      const p = this._scorePulse;
      if (!p) return;
      p.lastMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (p.state !== 'attack') p.state = 'attack';
    }

    /**
     * Increments GameState score upon particle/token arrival, refreshes HUD telemetry, and triggers bounce.
     * @param {number} [pts=1]
     */
    awardArrivedScorePoint(pts = 1) {
      const g = global.GameState;
      if (g && pts > 0) {
        g.score = Number(g.score || 0) + pts;
        this.setStat('score', g.score, { immediate: true });
        if (g.round > 0) {
          const rawAve = g.score / g.round;
          const ave = rawAve >= 100 ? Math.round(rawAve) : Number(rawAve.toFixed(rawAve >= 10 ? 1 : 2));
          this.setStat('ave', ave, { immediate: true });
        }
      }
      this.triggerScoreBounce();
    }
  }

  const instance = new NativeStatPodClass();
  global.NativeStatPod = instance;
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Native_Stat_Pod', instance);
  }
})(typeof window !== 'undefined' ? window : this);
