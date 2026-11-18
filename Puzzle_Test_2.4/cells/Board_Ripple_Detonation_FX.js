/**
 * @fileoverview cells/Board_Ripple_Detonation_FX.js - Resonant Sigil Detonation VFX
 * @description Coordinates Step 4 Resonant Sigil detonation pulses, emblem shrinking,
 * vertex bonus token spawning, swarm particle bursts, and persistent/drifting spell tokens
 * (Unique-cell companion to Board_Ripple_Renderer_1.2.js).
 */

(function(global) {
  'use strict';

  const proto = global.BoardRippleRendererClass?.prototype;
  if (!proto) {
    console.error('[Board_Ripple_Detonation_FX] BoardRippleRendererClass is not defined. Ensure Board_Ripple_Renderer_1.0.js is loaded first.');
    return;
  }
  const H1_SEC = global.H_TIMING?.BEAT_SEC ?? (Math.pow(12, 8) / 1420405751.768);
  const H6_SEC = global.H_TIMING?.SIX_BEATS_SEC ?? (6 * H1_SEC);

  proto._getDetonationAnims = function() {
    if (!Array.isArray(this.resonantDetonationAnims)) this.resonantDetonationAnims = [];
    return this.resonantDetonationAnims;
  };

  proto.isSigilDetonating = function(sigilId) {
    return this._getDetonationAnims().some(a => a.sigilId === sigilId);
  };

  proto.isSigilDetonatingTile = function(q, r) {
    const tk = `${q},${r}`;
    return this._getDetonationAnims().some(a => a.tiles?.includes(tk));
  };

  proto.isSigilDetonatingVertex = function(vertex) {
    if (!vertex) return false;
    return this._getDetonationAnims().some(a => a.vertex && a.vertex.q === vertex.q && a.vertex.r === vertex.r && a.vertex.type === vertex.type);
  };

  proto.getResonantSigilBackTileAlpha = function(target = null) {
    const list = this._getDetonationAnims();
    const anim = target ? list.find(a => a.sigilId === target || a.tiles?.includes(target)) : list[0];
    if (!anim) return 1.0;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t = Math.min(1.0, (now - anim.startTime) / anim.durationMs);
    return t <= 0.5 ? Math.max(0.0, 1.0 - (t / 0.5)) : 0.0;
  };

  /**
   * Resonant Sigil Detonation Animation (Step 4 Adaptive Cascade):
   * 1. 0 to 3 H-Beats (~908ms, t <= 0.5): Emblem shrinks at vertex, aurora ribbons retract,
   *    back-tiles fade (1.0 -> 0.0), components remain at tile centers, spawn pulse in primary color
   *    expands over the emblem (0 -> maxR).
   * 2. 3 to 6 H-Beats (~908 to 1816ms, t > 0.5): Pulse contracts inward (maxR -> 0), spell bonus token expands
   *    (0.0 -> 1.0) layered over the pulse, components translate from tiles into vertex and shrink (1.0 -> 0.0).
   * 3. At offset -200ms (t >= 0.890): 3-band placement ripple bursts from the vertex in primary color, audio detonate plays.
   * 4. At t = 1.0: Tile entities clear, spell bonus token persists on board in persistentSpellTokens.
   */
  proto.playResonantSigilDetonation = function(sigil, onComplete, durationSec = H6_SEC) {
    if (!sigil || !Array.isArray(sigil.tiles) || sigil.tiles.length === 0) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    const math = global.HexMath;
    let vertex = sigil.vertex;
    if (!vertex && math?.findVertexForTiles) vertex = math.findVertexForTiles(sigil.tiles);
    if (!vertex) { if (typeof onComplete === 'function') onComplete(); return; }

    const state = global.GameState, dur = durationSec || H6_SEC;
    const elemName = sigil.element || global.MaterialsData?.ELEMENTAL_SPELLS?.[sigil.formula]?.element;
    const elemInfo = global.BoardOverlayRenderer?._getElemInfo?.(elemName);
    const primaryColor = elemInfo?.color || '#ff3333';
    const secondaryColor = elemInfo?.secondary || elemInfo?.sec || '#ffffff';
    const primaryName = elemInfo?.key || 'fire';
    const secondaryName = elemInfo?.secKey || primaryName;

    // Suppress static board components on constituent tiles during shrink
    sigil.tiles.forEach(tk => this.activeTileAnims.set(tk, { scale: 0.0, alpha: 0.0, enchantmentAlpha: 1.0 }));

    const offsetSec = this.placementRippleOffset ?? -0.20;
    const earlyTriggerT = offsetSec < 0 ? Math.max(0.5, 1.0 + (offsetSec / dur)) : 1.0;

    let rippleFired = false;
    const startNow = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const tokenIdx = (sigil.detonationIndex !== undefined) ? sigil.detonationIndex : ((this.persistentSpellTokens?.length || 0) + this._getDetonationAnims().length);
    const anim = {
      sigilId: sigil.id, sigil, vertex, tiles: sigil.tiles,
      primaryColor, secondaryColor, primaryName, secondaryName,
      startTime: startNow, tokenSpawnTime: startNow + dur * 500, tokenIdx,
      seedPhase: Math.random(), seedTilt: Math.random(),
      durationMs: dur * 1000
    };
    this._getDetonationAnims().push(anim);
    this.activeRipples.push({
      type: 'resonant_detonation', coords: [], color: primaryColor, elapsed: 0, duration: dur,
      maxRadius: 0, thickness: 0, bands: 0, alpha0: 0,
      onTick: (t) => {
        if (!rippleFired && t >= earlyTriggerT) {
          rippleFired = true;
          this.triggerPlacementRipple([vertex], primaryColor, { profile: 'scatter', bands: 3 });
          global.AudioSynth?.playDetonate?.(sigil.formula || sigil.spell || elemName);
          const sigilNum = (sigil.detonationIndex !== undefined) ? (sigil.detonationIndex + 1) : (sigil.pointValue || 1);
          global.OrbitParticleRenderer?.spawnSwarm?.(vertex, sigil.pointValue || sigilNum, sigilNum, primaryColor);
        }
      },
      onComplete: () => {
        sigil.tiles.forEach(tk => this.activeTileAnims.delete(tk));
        if (!this.persistentSpellTokens) this.persistentSpellTokens = [];
        this.persistentSpellTokens.push({ vertex, primaryColor, secondaryColor, destination: sigil.targetDestination || 'score', sigil, spawnTime: anim.tokenSpawnTime, tokenIdx: anim.tokenIdx, seedPhase: anim.seedPhase, seedTilt: anim.seedTilt });
        const list = this._getDetonationAnims();
        const rmIdx = list.indexOf(anim);
        if (rmIdx !== -1) list.splice(rmIdx, 1);
        if (typeof onComplete === 'function') onComplete();
      }
    });
  };

  /**
   * Master render pass for Resonant Detonations (Layer 4.95):
   * 1. Active detonating sigils (shrink into vertex + expanding pulse -> contracting pulse + spawning token)
   * 2. Persistent Spell Bonus Tokens on the board (vertex hex bezel + orange polyhedron)
   * 3. Drifting Spell Tokens (sliding to Spell Book button or Score sub-pod)
   */
  proto.renderResonantDetonations = function(ctx, math, originX, originY, hexRadius, elapsedTime, options = {}) {
    if (!math || !ctx) return;
    const state = global.GameState, pScale = global.COSMOS_STATE?.placedScale || 0.65;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const scale = hexRadius / 30, maxR = 34 * scale;
    const bgOp = this.spellTokenBgOpacity ?? global.COSMOS_STATE?.spellTokenBgOpacity ?? options.ghostBgOp ?? 0.60;
    const borderOp = options.ghostBorderOp ?? 1.00;

    // 1. Active detonating resonant sigils (supports concurrent overlapping animations)
    const activeAnims = this._getDetonationAnims();
    for (let aIdx = 0; aIdx < activeAnims.length; aIdx++) {
      const anim = activeAnims[aIdx];
      const t = Math.min(1.0, (now - anim.startTime) / anim.durationMs);
      const { x: vx, y: vy } = math.vertexToScreen(anim.vertex, originX, originY, hexRadius);
      const pulseR = t <= 0.5 ? (t / 0.5) * maxR : (1.0 - (t - 0.5) / 0.5) * maxR;
      const drawPulse = () => {
        if (pulseR > 0.5) {
          ctx.save(); ctx.beginPath(); ctx.arc(vx, vy, pulseR, 0, Math.PI * 2);
          ctx.fillStyle = anim.primaryColor; ctx.globalAlpha = 0.6; ctx.fill();
          ctx.lineWidth = 3 * scale; ctx.strokeStyle = anim.primaryColor; ctx.globalAlpha = 1.0; ctx.stroke();
          ctx.restore();
        }
      };
      if (t <= 0.5) {
        const p1 = t / 0.5;
        if (global.PolyhedronRenderer?.drawComponent) {
          anim.tiles.forEach(tk => {
            const [tq, tr] = tk.split(',').map(Number);
            const { x: tx, y: ty } = math.hexToScreen(tq, tr, originX, originY, hexRadius);
            const sp = (Math.abs(Math.sin(tq * 12.9898 + tr * 78.233) * 43758.5453)) % 1.0;
            const st = (Math.abs(Math.cos(tq * 39.346 + tr * 11.135) * 24634.6345)) % 1.0;
            global.PolyhedronRenderer.drawComponent(ctx, tx, ty, hexRadius * pScale, state?.board?.get(tk)?.color || anim.primaryName, elapsedTime, false, false, 1.0, sp, st);
          });
        }
        const elemInfo = global.BoardOverlayRenderer?._getElemInfo?.(anim.sigil?.element) || { color: anim.primaryColor };
        const activeR = Math.round(hexRadius * 0.60 * Math.max(0.0, 1.0 - p1));
        if (activeR > 1 && global.SigilEmblemRenderer?.renderEmblem) {
          ctx.save(); ctx.translate(vx, vy);
          global.SigilEmblemRenderer.renderEmblem(ctx, elemInfo, null, false, activeR, 'wireframe');
          ctx.restore();
        }
        drawPulse();
      } else {
        const p2 = (t - 0.5) / 0.5, s2 = Math.max(0.0, 1.0 - p2);
        if (global.PolyhedronRenderer?.drawComponent && s2 > 0.01) {
          anim.tiles.forEach(tk => {
            const [tq, tr] = tk.split(',').map(Number);
            const { x: tx, y: ty } = math.hexToScreen(tq, tr, originX, originY, hexRadius);
            const sp = (Math.abs(Math.sin(tq * 12.9898 + tr * 78.233) * 43758.5453)) % 1.0;
            const st = (Math.abs(Math.cos(tq * 39.346 + tr * 11.135) * 24634.6345)) % 1.0;
            global.PolyhedronRenderer.drawComponent(ctx, tx + (vx - tx) * p2, ty + (vy - ty) * p2, hexRadius * pScale * s2, state?.board?.get(tk)?.color || anim.primaryName, elapsedTime, false, false, 1.0, sp, st);
          });
        }
        drawPulse();
        this.drawDoubleTokenBackTiles(options.drawBezelHex, vx, vy, (hexRadius - 1.5) * p2, anim.primaryColor, anim.secondaryColor, borderOp, anim.tokenSpawnTime, anim.tokenIdx || 0, now);
        if (global.PolyhedronRenderer?.drawComponent) {
          global.PolyhedronRenderer.drawComponent(ctx, vx, vy, hexRadius * pScale * p2, 'orange', elapsedTime, false, false, 1.0, anim.seedPhase, anim.seedTilt);
        }
      }
    }

    // 2. Persistent Spell Bonus Tokens on the board (waiting for drift)
    if (Array.isArray(this.persistentSpellTokens) && this.persistentSpellTokens.length > 0) {
      const borderOp = options.ghostBorderOp ?? 1.00;
      this.persistentSpellTokens.forEach((tok, idx) => {
        const { x, y } = math.vertexToScreen(tok.vertex, originX, originY, hexRadius);
        this.drawDoubleTokenBackTiles(options.drawBezelHex, x, y, hexRadius - 1.5, tok.primaryColor, tok.secondaryColor, borderOp, tok.spawnTime, tok.tokenIdx ?? idx, now);
        if (global.PolyhedronRenderer?.drawComponent) {
          global.PolyhedronRenderer.drawComponent(ctx, x, y, hexRadius * pScale, 'orange', elapsedTime, false, false, 1.0, tok.seedPhase ?? 0.5, tok.seedTilt ?? 0.5);
        }
      });
    }

    // 3. Drifting Spell Tokens (sliding to Spell Book button or Score sub-pod)
    if (this.driftingSpellTokens && typeof options.drawBezelHex === 'function') {
      const drift = this.driftingSpellTokens, elapsed = now - drift.startTime;
      let allDone = true;
      const borderOp = options.ghostBorderOp ?? 1.00;

      drift.items.forEach((it, idx) => {
        const itemElapsed = elapsed - (it.delayMs || 0);
        const p = itemElapsed <= 0 ? 0.0 : Math.min(1.0, itemElapsed / it.durationMs);
        if (p < 1.0) allDone = false;
        else if (!it.completed) {
          it.completed = true;
          if (it.destination === 'spellbook') {
            global.AudioSynth?.playDiseaseDestroy?.();
          } else {
            global.AudioSynth?.playScoreTick?.();
            if (global.GameState) {
              global.GameState._creditedOverflowPts = (global.GameState._creditedOverflowPts || 0) + 1;
            }
            global.NativeStatPod?.awardArrivedScorePoint?.(1);
          }
        }
        const s = Math.max(0.0, 1.0 - p);
        if (s > 0.001) {
          const e = p * p * p;
          const cx = it.startX + (it.targetX - it.startX) * e, cy = it.startY + (it.targetY - it.startY) * e;
          this.drawDoubleTokenBackTiles(options.drawBezelHex, cx, cy, (hexRadius - 1.5) * s, it.primaryColor, it.secondaryColor, borderOp, it.spawnTime ?? drift.startTime, it.tokenIdx ?? idx, now);
          if (global.PolyhedronRenderer?.drawComponent) global.PolyhedronRenderer.drawComponent(ctx, cx, cy, hexRadius * pScale * s, 'orange', elapsedTime, false, false, 1.0, it.seedPhase ?? 0.5, it.seedTilt ?? 0.5);
        }
      });
      if (allDone) {
        const cb = drift.onComplete;
        this.driftingSpellTokens = null;
        if (typeof cb === 'function') cb();
      }
    }
  };

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Board_Ripple_Detonation_FX', global.BoardRippleRenderer);
})(typeof window !== 'undefined' ? window : this);
