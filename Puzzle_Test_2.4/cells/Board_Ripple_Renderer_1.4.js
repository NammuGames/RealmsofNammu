/**
 * @fileoverview cells/Board_Ripple_Renderer_1.4.js - Damage Tokens & End Turn Despawn Animations
 * @description Coordinates cover damage despawn pulses, off-board disease/normal component animations,
 * stationary persistent damage tokens, and damage token drift to the HP Sub-Pod
 * (Part 5 of multi-part BoardRippleRenderer cell).
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const proto = global.BoardRippleRendererClass?.prototype;
  if (!proto) {
    console.error('[Board_Ripple_Renderer_1.4] BoardRippleRendererClass is not defined. Ensure Board_Ripple_Renderer_1.0.js is loaded first.');
    return;
  }
  const H1_SEC = global.H_TIMING?.BEAT_SEC ?? (Math.pow(12, 8) / 1420405751.768);
  const H3_SEC = global.H_TIMING?.THREE_BEATS_SEC ?? (3 * H1_SEC);
  const DRIFT_SPEED = global.H_TIMING?.DRIFT_PX_PER_SEC ?? (144 / H1_SEC);
  const getRippleStartT = (dur) => Math.max(0, 1 - H1_SEC / (dur || H3_SEC));

  proto._getCoverAnims = function() {
    if (!Array.isArray(this.coverDamageAnims)) this.coverDamageAnims = [];
    return this.coverDamageAnims;
  };
  proto._getOffBoardCompAnims = function() {
    if (!Array.isArray(this.offBoardCompAnims)) this.offBoardCompAnims = [];
    return this.offBoardCompAnims;
  };
  proto.getCoverDamageAnim = function(q, r) {
    return this._getCoverAnims().find(a => a.q === q && a.r === r) || null;
  };
  proto.hasOffBoardCompAnim = function(q, r) {
    return this._getOffBoardCompAnims().some(a => a.q === q && a.r === r);
  };

  proto._getNextDamageTokenMeta = function(durSec) {
    const startNow = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const diseaseDmg = this._getDiseaseAnims ? this._getDiseaseAnims().filter(a => a.preType === 'damage').length : 0;
    const tokenIdx = (this.persistentDamageTokens?.length || 0) + this._getCoverAnims().length + this._getOffBoardCompAnims().length + diseaseDmg;
    return { startNow, tokenSpawnTime: startNow + (durSec || H3_SEC) * 500, tokenIdx };
  };

  /**
   * Plays Covered Component Despawn & Damage Token Spawn Animation:
   * 1. 0 to 1.5 H-Beats (~454ms, t <= 0.5): Despawn pulse in component color expands under disease, over component.
   * 2. 1.5 to 3 H-Beats (~454 to 908ms, t > 0.5): Pulse contracts inward, component shrinks (1.0 -> 0.0), floating Damage Token spawns (0.0 -> 1.0).
   * 3. 1 H-Beat before end (t >= 2/3 at default 3 H-Beats): 1-band grey ripple bursts from tile.
   */
  proto.playCoverDamageAnimation = function(entry, onComplete, durationSec = H3_SEC) {
    const dur = durationSec || H3_SEC, q = entry.q, r = entry.r;
    const rippleStartT = getRippleStartT(dur);
    const coveredColor = entry.covered?.color || 'blue';
    const pulseColor = this.resolveRippleColor?.(coveredColor) || coveredColor;
    const fillColor = (coveredColor === 'ether') ? '#000000' : pulseColor;
    let rippleFired = false;
    const meta = this._getNextDamageTokenMeta(dur);
    const anim = {
      q, r, coveredColor, pulseColor, fillColor,
      startTime: meta.startNow, tokenSpawnTime: meta.tokenSpawnTime, tokenIdx: meta.tokenIdx,
      durationMs: dur * 1000, scaleCover: 1.0, scaleToken: 0.0
    };
    const list = this._getCoverAnims();
    list.push(anim);
    this.activeRipples.push({
      type: 'cover_damage', coords: [{ q, r }], color: '#64748b',
      elapsed: 0, duration: dur, maxRadius: 0, thickness: 0, bands: 0, alpha0: 0,
      onTick: (t) => {
        const sCover = t <= 0.5 ? 1.0 : Math.max(0.0, 1.0 - (t - 0.5) / 0.5);
        const sToken = t <= 0.5 ? 0.0 : Math.min(1.0, (t - 0.5) / 0.5);
        anim.scaleCover = sCover;
        anim.scaleToken = sToken;
        if (!rippleFired && t >= rippleStartT) {
          rippleFired = true;
          this.triggerPlacementRipple([{ q, r }], '#64748b', { profile: 'disease', bands: 1 });
        }
      },
      onComplete: () => {
        if (!this.persistentDamageTokens) this.persistentDamageTokens = [];
        this.persistentDamageTokens.push({ q, r, color: '#64748b', componentColor: 'disease', spawnTime: anim.tokenSpawnTime, tokenIdx: anim.tokenIdx });
        const idx = list.indexOf(anim);
        if (idx !== -1) list.splice(idx, 1);
        if (global.AudioSynth?.playDiseaseGrow) global.AudioSynth.playDiseaseGrow();
        if (typeof onComplete === 'function') onComplete();
      }
    });
  };

  /**
   * Renders despawn pulse directly under disease token and OVER covered component.
   */
  proto.renderCoverPulse = function(ctx, math, q, r, originX, originY, hexRadius) {
    const anim = this.getCoverDamageAnim(q, r);
    if (!anim || !math) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t = Math.min(1.0, (now - anim.startTime) / anim.durationMs);
    const scale = hexRadius / 30, maxR = 50 * scale;
    const pulseR = t <= 0.5 ? (t / 0.5) * maxR : (1.0 - (t - 0.5) / 0.5) * maxR;
    if (pulseR <= 0.5) return;
    const { x, y } = math.hexToScreen(q, r, originX, originY, hexRadius);
    this._drawPulseDisc(ctx, x, y, pulseR, anim.pulseColor, anim.fillColor, scale, 0.6);
  };

  /**
   * Plays Off-Board Disease Destruction: identical to disease destruction cascade except
   * all colored elements render in plague grey (#64748b), resulting in a floating Damage Token.
   */
  proto.playOffBoardDiseaseDamageAnimation = function(shape, onComplete, durationSec = H3_SEC) {
    const dur = durationSec || H3_SEC;
    const rippleStartT = getRippleStartT(dur);
    const boardTokens = (shape?.components && shape.components.length > 0)
      ? shape.components.map(c => ({ q: c.q, r: c.r })) : [];
    const primary = shape?.components?.find(c => !c.onBoard) || shape?.components?.[0] || { q: 0, r: 0 };
    const bands = Math.max(1, boardTokens.length), preColor = '#64748b';
    boardTokens.forEach(tk => this.activeTileAnims.set(`${tk.q},${tk.r}`, { scale: 1.0, alpha: 1.0 }));
    let rippleFired = false;
    const meta = this._getNextDamageTokenMeta(dur);
    const anim = {
      startTime: meta.startNow, tokenSpawnTime: meta.tokenSpawnTime, tokenIdx: meta.tokenIdx,
      durationMs: dur * 1000, preCoord: { q: primary.q, r: primary.r },
      preType: 'damage', preColor, boardTokens, boardPulseColor: '#6b7280',
      bands, scalePre: 0.0, scaleBoard: 1.0
    };
    const animList = this._getDiseaseAnims ? this._getDiseaseAnims() : (this.diseaseDestructionAnims = this.diseaseDestructionAnims || []);
    animList.push(anim);
    this.activeRipples.push({
      type: 'disease_destruction', coords: [], color: preColor, elapsed: 0, duration: dur,
      maxRadius: 0, thickness: 0, bands: 0, alpha0: 0,
      onTick: (t) => {
        const sBoard = t <= 0.5 ? 1.0 : Math.max(0.0, 1.0 - (t - 0.5) / 0.5);
        const sPre = t <= 0.5 ? 0.0 : Math.min(1.0, (t - 0.5) / 0.5);
        boardTokens.forEach(tk => this.activeTileAnims.set(`${tk.q},${tk.r}`, { scale: sBoard, alpha: 1.0 }));
        anim.scaleBoard = sBoard;
        anim.scalePre = sPre;
        if (!rippleFired && t >= rippleStartT) {
          rippleFired = true;
          this.triggerPlacementRipple(boardTokens, preColor, { profile: 'disease', bands });
        }
      },
      onComplete: () => {
        boardTokens.forEach(tk => this.activeTileAnims.delete(`${tk.q},${tk.r}`));
        if (!this.persistentDamageTokens) this.persistentDamageTokens = [];
        this.persistentDamageTokens.push({ q: primary.q, r: primary.r, color: preColor, componentColor: 'disease', spawnTime: anim.tokenSpawnTime, tokenIdx: anim.tokenIdx });
        const idx = animList.indexOf(anim);
        if (idx !== -1) animList.splice(idx, 1);
        if (global.AudioSynth?.playDiseaseGrow) global.AudioSynth.playDiseaseGrow();
        if (typeof onComplete === 'function') onComplete();
      }
    });
  };

  /**
   * Plays Off-Board Normal Component Despawn: color pulse expands & contracts,
   * component shrinks to 0, floating Damage Token spawns, ending with 1-band grey ripple.
   */
  proto.playOffBoardComponentDamageAnimation = function(entry, onComplete, durationSec = H3_SEC) {
    const dur = durationSec || H3_SEC, q = entry.q, r = entry.r;
    const rippleStartT = getRippleStartT(dur);
    const compColor = entry.color || 'blue';
    const pulseColor = this.resolveRippleColor?.(compColor) || compColor;
    const fillColor = (compColor === 'ether') ? '#000000' : pulseColor;
    let rippleFired = false;
    const meta = this._getNextDamageTokenMeta(dur);
    const anim = {
      q, r, compColor, pulseColor, fillColor,
      startTime: meta.startNow, tokenSpawnTime: meta.tokenSpawnTime, tokenIdx: meta.tokenIdx,
      durationMs: dur * 1000, scaleComp: 1.0, scaleToken: 0.0
    };
    const list = this._getOffBoardCompAnims();
    list.push(anim);
    this.activeRipples.push({
      type: 'offboard_comp_damage', coords: [{ q, r }], color: '#64748b',
      elapsed: 0, duration: dur, maxRadius: 0, thickness: 0, bands: 0, alpha0: 0,
      onTick: (t) => {
        const sComp = t <= 0.5 ? 1.0 : Math.max(0.0, 1.0 - (t - 0.5) / 0.5);
        const sToken = t <= 0.5 ? 0.0 : Math.min(1.0, (t - 0.5) / 0.5);
        anim.scaleComp = sComp;
        anim.scaleToken = sToken;
        if (!rippleFired && t >= rippleStartT) {
          rippleFired = true;
          this.triggerPlacementRipple([{ q, r }], '#64748b', { profile: 'disease', bands: 1 });
        }
      },
      onComplete: () => {
        if (!this.persistentDamageTokens) this.persistentDamageTokens = [];
        this.persistentDamageTokens.push({ q, r, color: '#64748b', componentColor: 'disease', spawnTime: anim.tokenSpawnTime, tokenIdx: anim.tokenIdx });
        const idx = list.indexOf(anim);
        if (idx !== -1) list.splice(idx, 1);
        if (global.AudioSynth?.playDiseaseGrow) global.AudioSynth.playDiseaseGrow();
        if (typeof onComplete === 'function') onComplete();
      }
    });
  };

  proto._getHeldHealDespawns = function() {
    if (!Array.isArray(this.heldHealDespawns)) this.heldHealDespawns = [];
    return this.heldHealDespawns;
  };

  /**
   * Plays standard 2-half despawn on a held Heal-spell token (Feral-brown pulse #a66a26).
   * 1st half: pulse expands; 2nd half: Heal token(s) expand under the contracting pulse.
   */
  proto.playHeldHealDespawn = function(spellTok, healSpecs, onComplete, durationSec = H3_SEC) {
    const dur = durationSec || H3_SEC, rippleStartT = getRippleStartT(dur);
    const startNow = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const pulseColor = '#a66a26', tokenSpawnTime = startNow + dur * 500;
    let rippleFired = false;
    const anim = { spellTok, healSpecs: healSpecs || [], pulseColor, startTime: startNow, tokenSpawnTime, durationMs: dur * 1000 };
    const list = this._getHeldHealDespawns();
    list.push(anim);
    this.activeRipples.push({
      type: 'held_heal_despawn', coords: [], color: pulseColor, elapsed: 0, duration: dur,
      maxRadius: 0, thickness: 0, bands: 0, alpha0: 0,
      onTick: (t) => {
        if (!rippleFired && t >= rippleStartT && spellTok?.vertex) {
          rippleFired = true;
          this.triggerPlacementRipple([spellTok.vertex], pulseColor, { profile: 'scatter', bands: 1 });
        }
      },
      onComplete: () => {
        const idx = list.indexOf(anim);
        if (idx !== -1) list.splice(idx, 1);
        if (typeof onComplete === 'function') onComplete(anim.tokenSpawnTime);
      }
    });
  };

  /**
   * Starts drift of all persistent Damage Tokens to the center of the HP Sub-Pod.
   */
  proto.startDamageTokensDrift = function(onComplete, speed = DRIFT_SPEED) {
    const list = this.persistentDamageTokens || [];
    const target = global.NativeVitalityPod?.getHpSubPodCenter?.() || {
      x: (typeof window !== 'undefined' ? window.innerWidth * 0.5 - 100 : 860),
      y: (typeof window !== 'undefined' ? window.innerHeight - 42 : 1038)
    };
    this.persistentDamageTokens = [];
    this._startDrift('driftingDamageTokens', list, target, speed, false, onComplete);
  };

  /**
   * Master render pass for Floating Damage Tokens & Off-Board Damage Anims (Layer 4.96):
   */
  proto.renderDamageTokens = function(ctx, math, originX, originY, hexRadius, elapsedTime, options = {}) {
    if (!ctx || !math) return;
    const pScale = global.COSMOS_STATE?.placedScale || 0.65;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const bgOp = options.ghostBgOp ?? 0.60, borderOp = options.ghostBorderOp ?? 1.00;
    const scale = hexRadius / 30, maxR = 50 * scale;

    // 1. Spawning tokens for active cover damage animations
    this._getCoverAnims().forEach((anim, idx) => {
      if (anim.scaleToken <= 0.001) return;
      const s = anim.scaleToken;
      const { x, y } = math.hexToScreen(anim.q, anim.r, originX, originY, hexRadius);
      this.drawDoubleTokenBackTiles(options.drawBezelHex, x, y, (hexRadius - 1.5) * s, '#64748b', '#64748b', borderOp, anim.tokenSpawnTime ?? anim.startTime, anim.tokenIdx ?? idx, now);
      if (global.PolyhedronRenderer?.drawComponent) {
        const sp = (Math.abs(Math.sin(anim.q * 12.9898 + anim.r * 78.233) * 43758.5453)) % 1.0;
        const st = (Math.abs(Math.cos(anim.q * 39.346 + anim.r * 11.135) * 24634.6345)) % 1.0;
        global.PolyhedronRenderer.drawComponent(ctx, x, y, hexRadius * pScale * s, 'disease', elapsedTime, false, false, 1.0, sp, st);
      }
    });

    // 2. Active off-board normal component despawn animations
    this._getOffBoardCompAnims().forEach((anim, idx) => {
      const t = Math.min(1.0, (now - anim.startTime) / anim.durationMs);
      const pulseR = t <= 0.5 ? (t / 0.5) * maxR : (1.0 - (t - 0.5) / 0.5) * maxR;
      const { x, y } = math.hexToScreen(anim.q, anim.r, originX, originY, hexRadius);
      if (pulseR > 0.5) {
        this._drawPulseDisc(ctx, x, y, pulseR, anim.pulseColor, anim.fillColor, scale, 0.6);
      }
      const sp = (Math.abs(Math.sin(anim.q * 12.9898 + anim.r * 78.233) * 43758.5453)) % 1.0;
      const st = (Math.abs(Math.cos(anim.q * 39.346 + anim.r * 11.135) * 24634.6345)) % 1.0;
      if (anim.scaleComp > 0.001 && global.PolyhedronRenderer?.drawComponent) {
        if (typeof options.drawBezelHex === 'function') options.drawBezelHex(x, y, (hexRadius - 1.5) * anim.scaleComp, '#64748b', '#94a3b8', bgOp, borderOp);
        global.PolyhedronRenderer.drawComponent(ctx, x, y, hexRadius * pScale * anim.scaleComp, anim.compColor, elapsedTime, false, true, 1.0, sp, st);
      }
      if (anim.scaleToken > 0.001) {
        this.drawDoubleTokenBackTiles(options.drawBezelHex, x, y, (hexRadius - 1.5) * anim.scaleToken, '#64748b', '#64748b', borderOp, anim.tokenSpawnTime ?? anim.startTime, anim.tokenIdx ?? idx, now);
        if (global.PolyhedronRenderer?.drawComponent) global.PolyhedronRenderer.drawComponent(ctx, x, y, hexRadius * pScale * anim.scaleToken, 'disease', elapsedTime, false, false, 1.0, sp, st);
      }
    });

    // 3. Stationary persistent Damage Tokens waiting for drift
    if (Array.isArray(this.persistentDamageTokens) && this.persistentDamageTokens.length > 0 && typeof options.drawBezelHex === 'function') {
      this.persistentDamageTokens.forEach((pt, idx) => {
        const { x, y } = math.hexToScreen(pt.q, pt.r, originX, originY, hexRadius);
        this.drawDoubleTokenBackTiles(options.drawBezelHex, x, y, hexRadius - 1.5, '#64748b', '#64748b', borderOp, pt.spawnTime, pt.tokenIdx ?? idx, now);
        if (global.PolyhedronRenderer?.drawComponent) {
          const sp = (Math.abs(Math.sin(pt.q * 12.9898 + pt.r * 78.233) * 43758.5453)) % 1.0;
          const st = (Math.abs(Math.cos(pt.q * 39.346 + pt.r * 11.135) * 24634.6345)) % 1.0;
          global.PolyhedronRenderer.drawComponent(ctx, x, y, hexRadius * pScale, pt.componentColor || 'disease', elapsedTime, false, false, 1.0, sp, st);
        }
      });
    }

    // 4. Drifting Damage Tokens sliding into HP Sub-Pod center
    if (this.driftingDamageTokens && typeof options.drawBezelHex === 'function') {
      const drift = this.driftingDamageTokens, elapsed = now - drift.startTime;
      let allDone = true;
      drift.items.forEach((it, idx) => {
        const itemElapsed = elapsed - (it.delayMs || 0);
        const p = itemElapsed <= 0 ? 0.0 : Math.min(1.0, itemElapsed / it.durationMs);
        if (p < 1.0) allDone = false;
        else if (!it.completed) {
          it.completed = true;
          global.AudioSynth?.playDiseaseGrow?.();
          const st = global.GameState;
          if (st) {
            drift.appliedDamage = (drift.appliedDamage || 0) + 1;
            if ((st.pendingHeal || 0) > 0) st.pendingHeal = Math.max(0, st.pendingHeal - 1);
            else st.hp = Math.max(0, (st.hp || 0) - 1);
            const pendingDmg = typeof st.getPendingDamage === 'function' ? st.getPendingDamage() : 0;
            global.NativeVitalityPod?.setHp?.(st.hp, pendingDmg, st.pendingHeal || 0);
          }
        }
        const s = Math.max(0.0, 1.0 - p);
        if (s > 0.001) {
          const e = p * p * p;
          const cx = it.startX + (it.targetX - it.startX) * e, cy = it.startY + (it.targetY - it.startY) * e;
          this.drawDoubleTokenBackTiles(options.drawBezelHex, cx, cy, (hexRadius - 1.5) * s, '#64748b', '#64748b', borderOp, it.spawnTime ?? drift.startTime, it.tokenIdx ?? idx, now);
          if (global.PolyhedronRenderer?.drawComponent) {
            const sp = (Math.abs(Math.sin(it.q * 12.9898 + it.r * 78.233) * 43758.5453)) % 1.0;
            const st = (Math.abs(Math.cos(it.q * 39.346 + it.r * 11.135) * 24634.6345)) % 1.0;
            global.PolyhedronRenderer.drawComponent(ctx, cx, cy, hexRadius * pScale * s, it.componentColor || 'disease', elapsedTime, false, false, 1.0, sp, st);
          }
        }
      });
      if (allDone) {
        const applied = drift.appliedDamage || 0;
        const cb = drift.onComplete;
        this.driftingDamageTokens = null;
        if (typeof cb === 'function') cb(applied);
      }
    }

    // 5. Held Heal-Spell Token Despawn -> Heal Token(s) Expansion (layered under pulse)
    const healDespawns = this._getHeldHealDespawns();
    if (healDespawns.length > 0 && typeof options.drawBezelHex === 'function') {
      healDespawns.forEach((anim) => {
        const st = anim.spellTok;
        if (!st?.vertex) return;
        const t = Math.min(1.0, (now - anim.startTime) / anim.durationMs);
        const { x: vx, y: vy } = math.vertexToScreen(st.vertex, originX, originY, hexRadius);
        const pulseR = (t <= 0.5 ? (t / 0.5) : Math.max(0.0, 1.0 - (t - 0.5) / 0.5)) * maxR;
        const p2 = t <= 0.5 ? 0.0 : Math.min(1.0, (t - 0.5) / 0.5);
        const sSpell = t <= 0.5 ? 1.0 : Math.max(0.0, 1.0 - p2);
        if (sSpell > 0.001) {
          this.drawDoubleTokenBackTiles(options.drawBezelHex, vx, vy, (hexRadius - 1.5) * sSpell, st.primaryColor, st.secondaryColor, borderOp, st.spawnTime, st.tokenIdx ?? 0, now);
          if (global.PolyhedronRenderer?.drawComponent) {
            global.PolyhedronRenderer.drawComponent(ctx, vx, vy, hexRadius * pScale * sSpell, 'orange', elapsedTime, false, false, 1.0, st.seedPhase ?? 0.5, st.seedTilt ?? 0.5);
          }
        }
        if (p2 > 0.001) {
          anim.healSpecs.forEach((hs) => {
            this.drawDoubleTokenBackTiles(options.drawBezelHex, vx, vy, (hexRadius - 1.5) * p2, '#10b981', '#10b981', borderOp, anim.tokenSpawnTime, hs.tokenIdx, now);
            if (global.PolyhedronRenderer?.drawComponent) {
              global.PolyhedronRenderer.drawComponent(ctx, vx, vy, hexRadius * pScale * p2, 'green', elapsedTime, false, false, 1.0, hs.seedPhase, hs.seedTilt);
            }
          });
        }
        if (pulseR > 0.5) {
          ctx.save(); ctx.beginPath(); ctx.arc(vx, vy, pulseR, 0, Math.PI * 2);
          ctx.fillStyle = anim.pulseColor; ctx.globalAlpha = 0.6; ctx.fill();
          ctx.lineWidth = 3 * scale; ctx.strokeStyle = anim.pulseColor; ctx.globalAlpha = 1.0; ctx.stroke(); ctx.restore();
        }
      });
    }
  };

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Board_Ripple_Renderer_1.4', global.BoardRippleRenderer);

})(typeof window !== 'undefined' ? window : this);

