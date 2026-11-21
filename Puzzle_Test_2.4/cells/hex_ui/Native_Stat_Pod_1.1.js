/**
 * @fileoverview cells/hex_ui/Native_Stat_Pod_1.1.js - Layout, Highlights & Stat Cross-Fade Engine (Part 2/2)
 * @description Attaches dynamic pair layout, resize, double-orange Player/Turn highlight syncing,
 * 3 H-Beat & Log-Show stat number cross-fades, and score arrival pulse onto NativeStatPodClass.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const NativeStatPodClass = global.NativeStatPodClass;
  if (!NativeStatPodClass) {
    console.error('[Native_Stat_Pod_1.1] NativeStatPodClass is not defined. Ensure Native_Stat_Pod_1.0.js is loaded first.');
    return;
  }

  const { fontSciFae, getMeasCtx } = NativeStatPodClass._gfx;
  const proto = NativeStatPodClass.prototype;

  /** Renders a stat value hex's number with 3-HB or Log-Show opacity cross-fade. */
  proto._renderStatValue = function(ctx, def) {
    ctx.save();
    ctx.font = `400 ${this.config.statTextSize}px ${fontSciFae}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tY = (this.config.statTextY || 0) + 1.5;
    const drawVal = (txt, alpha) => {
      if (alpha <= 0.005) return;
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillText(txt, 0.5, tY + 0.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(txt, 0, tY);
      ctx.restore();
    };
    const fade = this._statFades?.[def.key];
    if (fade) {
      const lp = global.TurnLogPlayer;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const p = fade.logDriven
        ? ((lp?.active && (lp.stage === 'TO_PRE' || lp.stage === 'TO_POST')) ? (lp.progress ?? 1.0) : 1.0)
        : Math.max(0.0, Math.min(1.0, (now - fade.startMs) / Math.max(1, fade.durationMs)));
      if (p < 1.0) {
        drawVal(fade.oldVal, 1.0 - p);
        drawVal(fade.newVal, p);
      } else {
        delete this._statFades[def.key];
        drawVal(this.stats[def.key] ?? def.val, 1.0);
      }
    } else {
      drawVal(this.stats[def.key] ?? def.val, 1.0);
    }
    ctx.restore();
  };

  /** Per-frame tick for score hex bounce (1/8 HB up, 1 HB down) and live stat cross-fade cleanup. */
  proto._tickStatAnimations = function() {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const fades = this._statFades;
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

    const p = this._scorePulse, vNode = this.statValNodes?.['score'];
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
  };

  proto.updateStatsLayout = function() {
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
      const rightWBase = Math.round((cfg.statValWidth || 44) / 2) * 2;
      const rightHalfSpan = rightWBase * 0.5 + rightApex;
      const leftWBase = Math.round((leftPad + labelW + clearance + rightWBase * 0.5) / 2) * 2;
      const leftHalfSpan = leftWBase * 0.5 + leftApex;

      const textEndX = - (leftWBase * 0.5) + leftPad + labelW;
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
  };

  /** Highlights right pods of Player and Turn with standard double orange border when they match. */
  proto.updatePlayerTurnHighlight = function() {
    const pNode = this.statValNodes?.['player'], tNode = this.statValNodes?.['turn'];
    if (!pNode || !tNode) return;
    const norm = v => String(v ?? '').replace(/^P/i, '').trim();
    const isMatch = norm(this.stats.player) !== '' && norm(this.stats.player) === norm(this.stats.turn);
    const alreadySynced = (this._playerTurnMatched === isMatch)
      && (!!pNode.style?.outerHighlight?.enabled === isMatch)
      && (!!tNode.style?.outerHighlight?.enabled === isMatch);
    if (alreadySynced) return;
    this._playerTurnMatched = isMatch;
    const style = isMatch
      ? { bgColor: '#0f172a', bgOpacity: 1.0, innerHighlight: { enabled: true, color: '#ff9214', sharpEdgeColor: '#ff9214', spread: 8, intensity: 0.80, steps: 3 }, outerHighlight: { enabled: true, color: '#ff9214', sharpEdgeColor: '#ff9214', blur: 8, intensity: 0.80, steps: 3 } }
      : { bgColor: '#0f172a', bgOpacity: 1.0, innerHighlight: { enabled: true, color: '#3d6eff', sharpEdgeColor: '#3d6eff', spread: 8, intensity: 0.80, steps: 3 }, outerHighlight: { enabled: false } };
    [pNode, tNode].forEach(n => { Object.assign(n.style, style); n.invalidateCache?.(); });
  };

  proto._applyStatValue = function(normalizedKey, valStr, opts = {}) {
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
  };

  proto.setStat = function(key, val, opts = {}) {
    const normalizedKey = (key === 'average') ? 'ave' : ((key === 'combo') ? 'points' : key);
    if (this.stats[normalizedKey] === undefined) return;
    this._applyStatValue(normalizedKey, val.toString(), opts);
    this.updatePlayerTurnHighlight();
  };

  proto.setStats = function(updates = {}, opts = {}) {
    if (updates.average !== undefined && updates.ave === undefined) updates.ave = updates.average;
    if (updates.combo !== undefined && updates.points === undefined) updates.points = updates.combo;
    Object.keys(updates).forEach(k => { if (updates[k] !== undefined) this._applyStatValue(k, updates[k].toString(), opts); });
    this.updatePlayerTurnHighlight();
  };

  proto.resize = function(viewWidth, viewHeight) {
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
    const cfg = this.config;
    if (this.topPodNode) {
      this.topPodNode.position.x = viewWidth * 0.5;
      this.topPodNode.position.y = cfg.podEdgeY;
    }
    this.updateStatsLayout();
    global.NativeVitalityPod?.resize?.(viewWidth, viewHeight);
  };

  proto.getScoreSubPodCenter = function() {
    const top = this.topPodNode;
    const val = this.statValNodes?.['score'];
    if (val?.worldMatrix) return { x: val.worldMatrix[4], y: val.worldMatrix[5] };
    const topX = top ? top.position.x : ((this.viewWidth || (typeof window !== 'undefined' ? window.innerWidth : 1920)) * 0.5);
    const topY = top ? top.position.y : (this.config.podEdgeY || 42);
    return { x: topX + (val?.position?.x ?? 0), y: topY + (val?.position?.y ?? 0) };
  };

  proto.triggerScoreBounce = function() {
    const p = this._scorePulse;
    if (!p) return;
    p.lastMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (p.state !== 'attack') p.state = 'attack';
  };

  proto.awardArrivedScorePoint = function(pts = 1) {
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
  };

  global.ROLL_CALL?.set?.('Native_Stat_Pod_1.1', global.NativeStatPod);
})(typeof window !== 'undefined' ? window : this);
