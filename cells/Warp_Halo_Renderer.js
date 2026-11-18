/**
 * @fileoverview Warp_Halo_Renderer.js - Active Spell Halo FX Engine
 * @description Coordinates the active spell halo around the targeting / held cursor vertex,
 * featuring a two-pass dark void eclipse style with full live tuning controls:
 * - Bottom Layer: enlarged Store/Ritual-Cyan (#38bdf8) comets with glowing aura and tails.
 * - Top Layer: solid black (#000000) comets centered directly over the bottom layer.
 * - Dynamic concentric CW & CCW rings with configurable radius, spacing, tails, and deltas.
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  class WarpHaloRendererClass {
    constructor() {
      this.config = {
        ballRadius: 2.4,
        tailLength: 36,
        tailWidth: 2.4,
        tailAngle: -12,
        frontTailAngle: 12,
        underRadiusDelta: 2.4,
        underLengthDelta: 2.5,
        underWidthDelta: 2.4,
        bandsCW: 3,
        radiusInnerCW: 74,
        spacingCW: 4,
        bandsCCW: 3,
        radiusInnerCCW: 74,
        spacingCCW: 4,
        particlesPerBand: 12,
        baseSpeed: 0.5,
        speedCW: 0.4,
        speedCCW: 0.55
      };
    }

    /**
     * Renders the active spell halo around a target vertex.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} math - HexMath helper
     * @param {{type: 'up'|'down', q: number, r: number}} vertex
     * @param {number} originX
     * @param {number} originY
     * @param {number} hexRadius
     * @param {number} time - Animation elapsed seconds / pulse time
     * @param {'warp'|'charge'} [mode='warp']
     */
    render(ctx, math, vertex, originX, originY, hexRadius, time, mode = 'warp') {
      if (!ctx || !math || !vertex || !math.vertexToScreen) return;
      const vPos = math.vertexToScreen(vertex, originX, originY, hexRadius);
      if (!vPos) return;

      const cfg = this.config || {};
      const t = (typeof performance !== 'undefined' ? performance.now() * 0.001 : (time || 0));

      const isCharge = mode === 'charge';
      const botColor = isCharge ? '#eb66ff' : '#38bdf8';
      const botTail = botColor;
      const topColor = isCharge ? '#ffffff' : '#000000';
      const topTail = topColor;

      let haloScale = 1.0;
      let haloAlpha = 1.0;
      const isDespawning = (mode === 'warp' && !!global.SpellTeleport?.isPlacing) ||
                           (mode === 'charge' && !!global.SpellCharge?.isSelecting);
      const despawnProg = (mode === 'warp')
        ? ((global.SpellTeleport?.placementProgress !== null && global.SpellTeleport?.placementProgress !== undefined)
            ? global.SpellTeleport.placementProgress
            : global.BoardRippleRenderer?.materialPlacementProgress)
        : (mode === 'charge' ? (global.SpellCharge?.selectionProgress ?? null) : null);

      if (isDespawning && despawnProg !== null && despawnProg !== undefined) {
        const rem = Math.max(0.0, 1.0 - despawnProg);
        haloScale = rem;
        haloAlpha = rem;
      } else {
        const castStart = (mode === 'warp')
          ? (global.SpellTeleport?.castStartTime || global.GameState?.teleportCastStartTime)
          : (mode === 'charge' ? (global.SpellCharge?.castStartTime || global.GameState?.chargeCastStartTime) : null);
        if (castStart) {
          const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          const elapsed = (now - castStart) / 1000;
          const dur = 1.60;
          if (elapsed < dur) {
            const prog = Math.max(0.0, Math.min(1.0, elapsed / dur));
            haloScale = 1 - Math.pow(1 - prog, 3);
            haloAlpha = Math.min(1.0, prog / 0.40);
          }
        }
      }
      if (haloAlpha <= 0.0001 || haloScale <= 0.0001) return;

      const scale = hexRadius / 30;

      const bRadTop = (cfg.ballRadius ?? 2.2);
      const tLenTop = (cfg.tailLength ?? 10.0);
      const tWidTop = (cfg.tailWidth ?? 1.8);
      const tAngDeg = (cfg.tailAngle ?? 0);
      const fAngDeg = (cfg.frontTailAngle ?? 0);

      const bRadBot = bRadTop + (cfg.underRadiusDelta ?? 1.4);
      const tLenBot = tLenTop + (cfg.underLengthDelta ?? 4.0);
      const tWidBot = tWidTop + (cfg.underWidthDelta ?? 1.2);

      const sComet = isDespawning ? haloScale : Math.max(0.25, haloScale);
      const ballR_bot = bRadBot * scale * sComet;
      const tailLen_bot = tLenBot * scale * sComet;
      const tailW_bot = tWidBot * scale * sComet;

      const ballR_top = bRadTop * scale * sComet;
      const tailLen_top = tLenTop * scale * sComet;
      const tailW_top = tWidTop * scale * sComet;

      const count = Math.max(1, Math.round(cfg.particlesPerBand ?? 6));
      const bandsCW = Math.max(0, Math.round(cfg.bandsCW ?? 1));
      const bandsCCW = Math.max(0, Math.round(cfg.bandsCCW ?? 1));
      const rInCW = (cfg.radiusInnerCW ?? 39.0);
      const spCW = (cfg.spacingCW ?? 5.0);
      const rInCCW = (cfg.radiusInnerCCW ?? 33.0);
      const spCCW = (cfg.spacingCCW ?? 5.0);
      const baseSpdCW = (cfg.speedCW ?? 0.40);
      const baseSpdCCW = (cfg.speedCCW ?? 0.55);

      const tiers = [];
      for (let k = 0; k < bandsCW; k++) {
        tiers.push({
          rad: (rInCW + k * spCW) * scale,
          count,
          dir: 1,
          speed: baseSpdCW / (1.0 + k * 0.15)
        });
      }
      for (let k = 0; k < bandsCCW; k++) {
        tiers.push({
          rad: (rInCCW + k * spCCW) * scale,
          count,
          dir: -1,
          speed: baseSpdCCW / (1.0 + k * 0.15)
        });
      }

      const baseSpeed = Math.max(0.01, cfg.baseSpeed ?? 1.0);

      // Precompute comet coordinates and tangent vectors with prebaked speed offsets
      const comets = [];
      tiers.forEach((tier, tierIdx) => {
        const rad = tier.rad;
        const dir = tier.dir;

        for (let i = 0; i < tier.count; i++) {
          // Deterministic unique speed variance (+/- 25%) per particle so they never line up
          const pSeed = (Math.abs(Math.sin((tierIdx + 1) * 17.31 + (i + 1) * 43.19)) * 43758.5453) % 1.0;
          const speedVar = 0.75 + pSeed * 0.50;
          const pSpeed = tier.speed * baseSpeed * speedVar;

          const angle = (Math.PI * 2 * i / tier.count) + dir * pSpeed * t;
          const wobble = (Math.sin(3 * angle - t * 0.8) * 2.0 + Math.sin(t * 1.2) * 0.8) * scale;
          const r = (rad + wobble) * haloScale;
          const px = vPos.x + Math.cos(angle) * r;
          const py = vPos.y + Math.sin(angle) * r;

          const tx0 = -Math.sin(angle) * dir;
          const ty0 = Math.cos(angle) * dir;

          // Rear tail vector
          let tx = tx0, ty = ty0;
          if (tAngDeg !== 0) {
            const radOff = (tAngDeg * Math.PI / 180) * dir;
            const cosA = Math.cos(radOff), sinA = Math.sin(radOff);
            tx = tx0 * cosA - ty0 * sinA;
            ty = tx0 * sinA + ty0 * cosA;
          }
          const nx = -ty, ny = tx;

          // Front tail vector
          let fx = tx0, fy = ty0;
          if (fAngDeg !== 0) {
            const radOffF = (fAngDeg * Math.PI / 180) * dir;
            const cosF = Math.cos(radOffF), sinF = Math.sin(radOffF);
            fx = tx0 * cosF - ty0 * sinF;
            fy = tx0 * sinF + ty0 * cosF;
          }
          const fnx = -fy, fny = fx;

          comets.push({ px, py, tx, ty, nx, ny, fx, fy, fnx, fny });
        }
      });

      ctx.save();
      if (haloAlpha < 1.0) ctx.globalAlpha = (ctx.globalAlpha || 1.0) * haloAlpha;

      // PASS 1: Bottom Layer (Enlarged Store/Ritual-Cyan with glowing aura)
      comets.forEach(c => {
        // Rear tail
        ctx.beginPath();
        ctx.moveTo(c.px - c.tx * tailLen_bot, c.py - c.ty * tailLen_bot);
        ctx.lineTo(c.px + c.nx * tailW_bot, c.py + c.ny * tailW_bot);
        ctx.lineTo(c.px - c.nx * tailW_bot, c.py - c.ny * tailW_bot);
        ctx.closePath();
        ctx.fillStyle = botTail;
        ctx.fill();

        // Front tail
        ctx.beginPath();
        ctx.moveTo(c.px + c.fx * tailLen_bot, c.py + c.fy * tailLen_bot);
        ctx.lineTo(c.px + c.fnx * tailW_bot, c.py + c.fny * tailW_bot);
        ctx.lineTo(c.px - c.fnx * tailW_bot, c.py - c.fny * tailW_bot);
        ctx.closePath();
        ctx.fillStyle = botTail;
        ctx.fill();

        // Particle Orb
        ctx.beginPath();
        ctx.arc(c.px, c.py, ballR_bot, 0, Math.PI * 2);
        ctx.fillStyle = botColor;
        ctx.fill();
      });

      // PASS 2: Top Layer (Solid black comets centered directly over the bottom layer)
      comets.forEach(c => {
        // Rear tail
        ctx.beginPath();
        ctx.moveTo(c.px - c.tx * tailLen_top, c.py - c.ty * tailLen_top);
        ctx.lineTo(c.px + c.nx * tailW_top, c.py + c.ny * tailW_top);
        ctx.lineTo(c.px - c.nx * tailW_top, c.py - c.ny * tailW_top);
        ctx.closePath();
        ctx.fillStyle = topTail;
        ctx.fill();

        // Front tail
        ctx.beginPath();
        ctx.moveTo(c.px + c.fx * tailLen_top, c.py + c.fy * tailLen_top);
        ctx.lineTo(c.px + c.fnx * tailW_top, c.py + c.fny * tailW_top);
        ctx.lineTo(c.px - c.fnx * tailW_top, c.py - c.fny * tailW_top);
        ctx.closePath();
        ctx.fillStyle = topTail;
        ctx.fill();

        // Particle Orb
        ctx.beginPath();
        ctx.arc(c.px, c.py, ballR_top, 0, Math.PI * 2);
        ctx.fillStyle = topColor;
        ctx.fill();
      });

      ctx.restore();
    }
  }

  const warpHaloInstance = new WarpHaloRendererClass();
  global.WarpHaloRenderer = warpHaloInstance;

  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Warp_Halo_Renderer', warpHaloInstance);
  }

})(typeof window !== 'undefined' ? window : this);
