/**
 * @fileoverview cells/Board_Ripple_Renderer_1.2.js - End-of-Turn Disease Destruction & Score Telemetry FX
 * @description Coordinates Step 3 sequential disease body despawn pulses, pre-placed floating disease tokens,
 * post-destruction / spell-token constant-speed drift, and developer animation preview triggers
 * (Part 3 of multi-part BoardRippleRenderer cell; paired with Board_Ripple_Detonation_FX.js).
 */

(function(global) {
  'use strict';

  const proto = global.BoardRippleRendererClass?.prototype;
  if (!proto) {
    console.error('[Board_Ripple_Renderer_1.2] BoardRippleRendererClass is not defined. Ensure Board_Ripple_Renderer_1.0.js is loaded first.');
    return;
  }
  const H1_SEC = global.H_TIMING?.BEAT_SEC ?? (Math.pow(12, 8) / 1420405751.768);
  const H1_MS = H1_SEC * 1000;
  const H_HALF_MS = global.H_TIMING?.HALF_BEAT_MS ?? (H1_MS * 0.5);
  const H3_SEC = global.H_TIMING?.THREE_BEATS_SEC ?? (3 * H1_SEC);
  const H3_MS = global.H_TIMING?.THREE_BEATS_MS ?? (3 * H1_MS);
  const DRIFT_SPEED = global.H_TIMING?.DRIFT_PX_PER_SEC ?? (144 / H1_SEC);

  proto._getDiseaseAnims = function() {
    if (!Array.isArray(this.diseaseDestructionAnims)) this.diseaseDestructionAnims = [];
    return this.diseaseDestructionAnims;
  };

  /**
   * Plays a Burn/Phase disease destruction animation (supports concurrent staggered bodies):
   * 1. Board tokens undergo despawn animation with disease-grey pulses.
   * 2. Pre-placed disease token spawns in pre-place layer with Burn-red or Phase-blue back-tile and Red/Blue pulse.
   * 3. 1 H-Beat before end, placement ripple bursts across board tokens with bands = boardTokens.length.
   * 4. Pre-placed token persists on board in persistentPreTokens.
   */
  proto.playDiseaseDestructionAnimation = function(entry, onComplete, durationSec = H3_SEC) {
    const dur = durationSec || H3_SEC, rippleStartT = Math.max(0, 1 - H1_SEC / dur);
    const boardTokens = (entry.shape?.components && entry.shape.components.length > 0)
      ? entry.shape.components.map(c => ({ q: c.q, r: c.r })) : [{ q: entry.q, r: entry.r }];
    const bands = boardTokens.length, preColor = entry.type === 'burn' ? '#ef4444' : '#2563eb';
    boardTokens.forEach(tk => this.activeTileAnims.set(`${tk.q},${tk.r}`, { scale: 1.0, alpha: 1.0 }));

    let rippleFired = false;
    const startNow = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const tokenIdx = (this.persistentPreTokens?.length || 0) + this._getDiseaseAnims().filter(a => a.preType !== 'damage').length;
    const anim = {
      startTime: startNow, tokenSpawnTime: startNow, tokenIdx,
      durationMs: dur * 1000, preCoord: { q: entry.q, r: entry.r }, preType: entry.type,
      preColor, boardTokens, boardPulseColor: '#6b7280', bands, scalePre: 0.0, scaleBoard: 1.0,
      burnedTileKeys: new Set(boardTokens.filter(tk => entry.type === 'burn' && (`${tk.q},${tk.r}` === entry.tk || global.GameState?.board?.get(`${tk.q},${tk.r}`)?.burned)).map(tk => `${tk.q},${tk.r}`))
    };
    this._getDiseaseAnims().push(anim);
    const burnSigilIds = anim.burnedTileKeys.size > 0 ? (this._collectSigilIdsForKeys?.(anim.burnedTileKeys) || []) : [];
    this._setBurnSigilFades?.(burnSigilIds, 1.0);

    this.activeRipples.push({
      type: 'disease_destruction', coords: [], color: preColor, elapsed: 0, duration: dur,
      maxRadius: 0, thickness: 0, bands: 0, alpha0: 0,
      onTick: (t) => {
        const sBoard = t <= 0.5 ? 1.0 : Math.max(0.0, 1.0 - (t - 0.5) / 0.5);
        const sPre = t <= 0.5 ? 0.0 : Math.min(1.0, (t - 0.5) / 0.5);
        boardTokens.forEach(tk => this.activeTileAnims.set(`${tk.q},${tk.r}`, { scale: sBoard, alpha: 1.0 }));
        anim.scaleBoard = sBoard; anim.scalePre = sPre;
        this._setBurnSigilFades?.(burnSigilIds, Math.max(0.0, 1.0 - t));
        if (!rippleFired && t >= rippleStartT) {
          rippleFired = true;
          this.triggerPlacementRipple(boardTokens, preColor, { profile: 'disease', bands });
        }
      },
      onComplete: () => {
        boardTokens.forEach(tk => this.activeTileAnims.delete(`${tk.q},${tk.r}`));
        if (!this.persistentPreTokens) this.persistentPreTokens = [];
        this.persistentPreTokens.push({
          q: entry.q, r: entry.r, type: entry.type, color: preColor,
          spawnTime: anim.startTime, tokenIdx: anim.tokenIdx, pointValue: entry.pId ? 1 : 0
        });
        const list = this._getDiseaseAnims(), idx = list.indexOf(anim);
        if (idx !== -1) list.splice(idx, 1);
        if (typeof onComplete === 'function') onComplete();
        this._setBurnSigilFades?.(burnSigilIds, null);
      }
    });
  };

  /**
   * Helper to build and launch token drift payload into `this[stateKey]`.
   */
  proto._startDrift = function(stateKey, items, targetScreen, speedPxPerSec, isVertex, onComplete) {
    if (!items || items.length === 0) {
      this[stateKey] = null;
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    const br = global.BoardRenderer, math = global.HexMath, engine = global.HexUIEngine;
    const ox = br?.originX ?? (typeof window !== 'undefined' ? window.innerWidth * 0.5 : 0);
    const oy = br?.originY ?? (typeof window !== 'undefined' ? window.innerHeight * 0.5 : 0);
    const hr = br?.hexRadius ?? 30, speed = speedPxPerSec || DRIFT_SPEED, now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    let target = targetScreen;
    if (engine?.boardFrame?.screenToLocal) target = engine.boardFrame.screenToLocal(targetScreen.x, targetScreen.y);
    else if (engine?.boardFrame?.position) target = { x: targetScreen.x - engine.boardFrame.position.x, y: targetScreen.y - engine.boardFrame.position.y };
    const mapped = items.map((it) => {
      const { x, y } = isVertex ? (math?.vertexToScreen ? math.vertexToScreen(it.vertex, ox, oy, hr) : { x: ox, y: oy }) : (math?.hexToScreen ? math.hexToScreen(it.q, it.r, ox, oy, hr) : { x: ox, y: oy });
      const dist = Math.hypot(target.x - x, target.y - y);
      return { ...it, startX: x, startY: y, targetX: target.x, targetY: target.y, dist, delayMs: 0, durationMs: Math.max(H_HALF_MS, (dist / speed) * 1000), completed: false };
    });
    this[stateKey] = { startTime: now, items: mapped, onComplete };
  };

  /**
   * Starts constant-speed smooth drift of all persistent disease bonus tokens to the score sub-pod.
   */
  proto.startPreTokensDrift = function(onComplete, speed = DRIFT_SPEED) {
    const target = global.NativeStatPod?.getScoreSubPodCenter?.() || { x: (typeof window !== 'undefined' ? window.innerWidth : 1920) * 0.5 + 100, y: 42 };
    const items = this.persistentPreTokens;
    this.persistentPreTokens = [];
    this._startDrift('driftingPreTokens', items, target, speed, false, onComplete);
  };

  /**
   * Starts drift of persistent spell tokens to Spell Book button (destination 'spellbook')
   * or Score sub-pod (destination 'score').
   */
  proto.startSpellTokensDrift = function(destination, onComplete, speed = DRIFT_SPEED) {
    const list = this.persistentSpellTokens || [];
    const toDrift = list.filter(t => t.destination === destination && !t.isHeldForLastBreath);
    this.persistentSpellTokens = list.filter(t => t.destination !== destination || t.isHeldForLastBreath);
    const btn = global.UISidebarDeck?.rightButtonNodes?.[0];
    const sbTarget = btn?.worldMatrix ? { x: btn.worldMatrix[4], y: btn.worldMatrix[5] } : { x: (typeof window !== 'undefined' ? window.innerWidth : 1920) - 100, y: 120 };
    const scTarget = global.NativeStatPod?.getScoreSubPodCenter?.() || { x: (typeof window !== 'undefined' ? window.innerWidth : 1920) * 0.5 + 100, y: 42 };
    this._startDrift('driftingSpellTokens', toDrift, destination === 'spellbook' ? sbTarget : scTarget, speed, true, onComplete);
  };

  /**
   * Renders the disease-grey despawn pulses directly onto the floor canvas (Layer 3.3/3.4),
   * strictly underneath placed board tokens.
   */
  proto.renderDiseaseBoardPulses = function(ctx, math, originX, originY, hexRadius) {
    const anims = this._getDiseaseAnims();
    if (anims.length === 0 || !math) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const scale = hexRadius / 30, maxR = 34 * scale;

    for (const anim of anims) {
      const t = Math.min(1.0, (now - anim.startTime) / anim.durationMs);
      const pulseR = (t <= 0.5) ? (t / 0.5) * maxR : (1.0 - (t - 0.5) / 0.5) * maxR;
      if (pulseR > 0.5 && Array.isArray(anim.boardTokens)) {
        anim.boardTokens.forEach(tk => {
          const pCol = anim.burnedTileKeys?.has(`${tk.q},${tk.r}`) ? '#ef4444' : (anim.boardPulseColor || '#6b7280');
          const { x, y } = math.hexToScreen(tk.q, tk.r, originX, originY, hexRadius);
          ctx.save(); ctx.beginPath(); ctx.arc(x, y, pulseR, 0, Math.PI * 2);
          ctx.fillStyle = pCol; ctx.globalAlpha = 0.6; ctx.fill();
          ctx.lineWidth = 3 * scale; ctx.strokeStyle = pCol;
          ctx.globalAlpha = 1.0; ctx.stroke(); ctx.restore();
        });
      }
    }
  };

  /**
   * Renders pre-placed layer elements (Layer 4.9):
   * 1. Active spawning tokens: Red/Blue spawn pulse, back-tile, and floating polyhedron.
   * 2. Persistent pre-placed tokens: scale 1.0 back-tile and polyhedron while waiting for drift.
   * 3. Drifting pre-placed tokens: sliding under stat-pod to score center, shrinking steadily to 0.
   */
  proto.renderDiseaseDestruction = function(ctx, math, originX, originY, hexRadius, elapsedTime, options = {}) {
    const pScale = global.COSMOS_STATE?.placedScale || 0.65;
    const borderOp = options.ghostBorderOp ?? 1.00;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    // 1. Active spawning pre-placed tokens (supports concurrent staggered bodies)
    const diseaseAnims = this._getDiseaseAnims();
    for (let idx = 0; idx < diseaseAnims.length; idx++) {
      const anim = diseaseAnims[idx];
      const t = Math.min(1.0, (now - anim.startTime) / anim.durationMs);
      const scale = hexRadius / 30, maxR = 50 * scale;
      const pulseR = (t <= 0.5) ? (t / 0.5) * maxR : (1.0 - (t - 0.5) / 0.5) * maxR;

      if (pulseR > 0.5 && anim.preCoord) {
        const { x, y } = math.hexToScreen(anim.preCoord.q, anim.preCoord.r, originX, originY, hexRadius);
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, pulseR, 0, Math.PI * 2);
        ctx.fillStyle = anim.preColor; ctx.globalAlpha = 0.6; ctx.fill();
        ctx.lineWidth = 3 * scale; ctx.strokeStyle = anim.preColor; ctx.globalAlpha = 1.0; ctx.stroke(); ctx.restore();
      }

      if (anim.preCoord && typeof options.drawBezelHex === 'function') {
        const { x, y } = math.hexToScreen(anim.preCoord.q, anim.preCoord.r, originX, originY, hexRadius);
        this.drawDoubleTokenBackTiles(options.drawBezelHex, x, y, hexRadius - 1.5, anim.preColor, anim.preColor, borderOp, anim.tokenSpawnTime ?? anim.startTime, anim.tokenIdx ?? idx, now);
        const sPre = t <= 0.5 ? 0.0 : Math.min(1.0, (t - 0.5) / 0.5);
        if (sPre > 0.001 && global.PolyhedronRenderer?.drawComponent) {
          const sp = (Math.abs(Math.sin(anim.preCoord.q * 12.9898 + anim.preCoord.r * 78.233) * 43758.5453)) % 1.0;
          const st = (Math.abs(Math.cos(anim.preCoord.q * 39.346 + anim.preCoord.r * 11.135) * 24634.6345)) % 1.0;
          global.PolyhedronRenderer.drawComponent(ctx, x, y, hexRadius * pScale * sPre, 'disease', elapsedTime, false, false, 1.0, sp, st);
        }
      }
    }

    // 2. Stationary persistent pre-placed tokens (waiting for drift)
    if (Array.isArray(this.persistentPreTokens) && this.persistentPreTokens.length > 0 && typeof options.drawBezelHex === 'function') {
      this.persistentPreTokens.forEach((pt, idx) => {
        const { x, y } = math.hexToScreen(pt.q, pt.r, originX, originY, hexRadius);
        this.drawDoubleTokenBackTiles(options.drawBezelHex, x, y, hexRadius - 1.5, pt.color, pt.color, borderOp, pt.spawnTime ?? 0, pt.tokenIdx ?? idx, now);
        if (global.PolyhedronRenderer?.drawComponent) {
          const sp = (Math.abs(Math.sin(pt.q * 12.9898 + pt.r * 78.233) * 43758.5453)) % 1.0;
          const st = (Math.abs(Math.cos(pt.q * 39.346 + pt.r * 11.135) * 24634.6345)) % 1.0;
          global.PolyhedronRenderer.drawComponent(ctx, x, y, hexRadius * pScale, 'disease', elapsedTime, false, false, 1.0, sp, st);
        }
      });
    }

    // 3. Drifting pre-placed tokens (sliding under stat-pod to score sub-pod, shrinking to 0)
    if (this.driftingPreTokens && typeof options.drawBezelHex === 'function') {
      const drift = this.driftingPreTokens, elapsed = now - drift.startTime;
      let allDone = true;

      drift.items.forEach((it, idx) => {
        const itemElapsed = elapsed - (it.delayMs || 0);
        const p = itemElapsed <= 0 ? 0.0 : Math.min(1.0, itemElapsed / it.durationMs);
        if (p < 1.0) allDone = false;
        else if (!it.completed) {
          it.completed = true;
          global.AudioSynth?.playScoreTick?.();
          if (it.pointValue > 0) global.NativeStatPod?.awardArrivedScorePoint?.(it.pointValue);
          else global.NativeStatPod?.triggerScoreBounce?.();
        }

        const s = Math.max(0.0, 1.0 - p);
        if (s > 0.001) {
          const e = p * p * p;
          const curX = it.startX + (it.targetX - it.startX) * e;
          const curY = it.startY + (it.targetY - it.startY) * e;
          this.drawDoubleTokenBackTiles(options.drawBezelHex, curX, curY, (hexRadius - 1.5) * s, it.color, it.color, borderOp, it.spawnTime ?? drift.startTime, it.tokenIdx ?? idx, now);
          if (global.PolyhedronRenderer?.drawComponent) {
            const sp = (Math.abs(Math.sin(it.q * 12.9898 + it.r * 78.233) * 43758.5453)) % 1.0;
            const st = (Math.abs(Math.cos(it.q * 39.346 + it.r * 11.135) * 24634.6345)) % 1.0;
            global.PolyhedronRenderer.drawComponent(ctx, curX, curY, hexRadius * pScale * s, 'disease', elapsedTime, false, false, 1.0, sp, st);
          }
        }
      });

      if (allDone) {
        const cb = drift.onComplete;
        this.driftingPreTokens = null;
        if (typeof cb === 'function') cb();
      }
    }
  };

  /**
   * Preview trigger for Animation Tuning Lab spawn/slither demos
   */
  proto.triggerDemoSpawn = function(type = 'spawn') {
    const origin = { q: 0, r: 0 }, target = { q: 1, r: 0 };
    const state = global.GameState;
    const origTile = state?.board?.get('0,0');
    const targTile = state?.board?.get('1,0');
    const origOld = origTile?.color, targOld = targTile?.color;

    if (origTile) origTile.color = 'disease';
    const restore = () => { if (origTile && origOld !== 'disease') origTile.color = origOld; if (targTile && targOld !== 'disease') targTile.color = targOld; global.BoardRenderer?.render?.(); };
    if (type === 'slither' && targTile) {
      targTile.color = 'disease';
      this.playSlitherAnimation(origin, target, 'disease', restore, restore);
    } else {
      this.playSpawnAnimation(origin, 'disease', restore);
    }
  };

  // Register with global Roll Call
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Board_Ripple_Renderer_1.2', global.BoardRippleRenderer);

})(typeof window !== 'undefined' ? window : this);
