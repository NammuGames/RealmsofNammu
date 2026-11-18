/**
 * @fileoverview cells/Board_Ripple_Renderer_1.0.js - Multi-Purpose Straight-Bridge Ripple & Shockwave Engine
 * @description Coordinates expanding hollow stadium/capsule wave ripples for material piece placements
 * and spell component deployments (Part 1 of 3 in multi-part BoardRippleRenderer cell). Strictly follows note_pad.md:
 * 1. Constant Thickness (R_outer - R_inner = thickness).
 * 2. Straight Capsule Bridging (no valleys between adjacent tiles).
 * 3. Union Cutout Masking (destination-out scratch pass, zero interior seams).
 * 4. Alpha Step Rings (radar wavefront echoes).
 * 5. Exponential Fade Drop-Off: alpha(t) = alpha0 * (1 - t)^2.
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  class BoardRippleRendererClass {
    constructor() {
      this.activeRipples = [];

      // Reusable offscreen scratch canvas for destination-out union carving
      this.scratchSize = 1600;
      this.scratchCanvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
      if (this.scratchCanvas) { this.scratchCanvas.width = 1600; this.scratchCanvas.height = 1600; }
      this.scratchCtx = this.scratchCanvas ? this.scratchCanvas.getContext('2d', { willReadFrequently: false }) : null;

      // Active transient tile animations for scaling components on spawn/despawn
      this.activeTileAnims = new Map();
      const h1Sec = global.H_TIMING?.BEAT_SEC ?? (Math.pow(12, 8) / 1420405751.768);
      this.spawnDuration = global.H_TIMING?.THREE_BEATS_SEC ?? (h1Sec * 3); // Configurable spawn pulse duration in seconds (default 3 H-Beats ~0.908s)
      this.placementRippleOffset = -h1Sec; // Configurable start offset for placement ripple in seconds (default -1 H-Beat ~-303ms)

      // Semantic ripple profiles rooted in a shared schema (mirrors Hex-Frames)
      this.profiles = {
        material: { speed: 144, thickness: 3, bands: 4, alpha0: 1.00, bandSpacing: 22, maxRadius: 360, color: '#22c55e' },
        enchantment: { speed: 144, thickness: 3, bands: 4, alpha0: 1.00, bandSpacing: 22, maxRadius: 360, color: '#2563eb' },
        single: { speed: 144, thickness: 3, bands: 1, alpha0: 1.00, bandSpacing: 22, maxRadius: 360, color: '#22c55e' },
        disease: { speed: 144, thickness: 3, bands: 1, alpha0: 1.00, bandSpacing: 22, maxRadius: 360, color: '#64748b' },
        ether: { speed: 144, thickness: 3, bands: 1, alpha0: 1.00, bandSpacing: 22, maxRadius: 360, color: '#ffffff' },
        scatter: { speed: 144, thickness: 3, bands: 1, alpha0: 1.00, bandSpacing: 22, maxRadius: 360, color: '#f59e0b' },
        weave: { speed: 144, thickness: 3, bands: 1, alpha0: 1.00, bandSpacing: 22, maxRadius: 360, color: '#fde047' },
        spawn: { speed: 144, thickness: 3, bands: 1, alpha0: 1.00, bandSpacing: 22, maxRadius: 34, color: '#64748b', fillAlpha: 0.6 },
        despawn: { speed: 144, thickness: 3, bands: 1, alpha0: 1.00, bandSpacing: 22, maxRadius: 34, color: '#64748b', fillAlpha: 0.6 },
        vanish: { speed: 144, thickness: 12, bands: 1, alpha0: 1.00, bandSpacing: 22, maxRadius: 68, color: '#64748b' }
      };
    }

    /**
     * Resolves profile config by key, applying live overrides from Animation Tuning Lab
     */
    getProfileConfig(key) {
      const base = this.profiles[key] || this.profiles.material;
      const live = global.AnimationTuningLab?.getRippleProfileConfig?.(key);
      return live ? { ...base, ...live } : { ...base };
    }

    /**
     * Resolves ripple color matching pre-placed back-tile green (#22c55e), elemental colors, or tokens.
     */
    resolveRippleColor(colorOrMod) {
      if (!colorOrMod) return '#22c55e';
      if (typeof colorOrMod === 'string' && (colorOrMod.startsWith('#') || colorOrMod.startsWith('rgb'))) return colorOrMod;
      const map = {
        disease: '#64748b', ether: '#ffffff', phase: '#2563eb', burn: '#ef4444',
        fortify: '#c084fc', weave: '#fde047', red: '#ef4444', fire: '#ef4444',
        blue: '#2563eb', water: '#2563eb', purple: '#c084fc', stone: '#c084fc',
        yellow: '#fde047', air: '#fde047', green: '#22c55e', orange: '#f97316'
      };
      return map[String(colorOrMod).toLowerCase()] || '#22c55e';
    }

    getRippleColorForMod(mod) { return this.resolveRippleColor(mod); }

    /**
     * Instantaneous thick vanish ripple bursting from behind a despawning entity.
     */
    triggerVanishRipple(coord, color = 'disease', durationSec = null) {
      const prof = this.getProfileConfig('vanish'), maxRadius = prof.maxRadius ?? 68;
      const dur = durationSec ?? Math.max(0.2, maxRadius / (prof.speed ?? 144));
      this.activeRipples.push({
        type: 'vanish', coords: [{ q: coord.q, r: coord.r }], color: this.resolveRippleColor(color),
        elapsed: 0, duration: dur, maxRadius, thickness: prof.thickness ?? 12,
        bands: prof.bands ?? 1, bandSpacing: prof.bandSpacing ?? 22, alpha0: prof.alpha0 ?? 1.0
      });
    }

    /**
     * Spawns an expanding straight-bridge ripple wave across the specified tile coordinates.
     * Uses profile defaults (speed: 144, thickness: 3, alpha0: 1.00, bands: 4 for multi, 1 for singles)
     * merged with any live Tuning Lab overrides or custom options.
     * @param {Array<{q: number, r: number}>} coords - Placed component hex coordinates
     * @param {string} [color='#22c55e'] - Wavefront color or token ('disease', 'ether', etc.)
     * @param {object} [options={}] - Custom speed, thickness, bands, profile, or radius overrides
     */
    triggerPlacementRipple(coords, color = '#22c55e', options = {}) {
      if (!Array.isArray(coords) || coords.length === 0) return;

      let pKey = options.profile;
      if (!pKey) {
        if (typeof color === 'string' && this.profiles[color.toLowerCase()]) {
          pKey = color.toLowerCase();
        } else if (coords.length > 1) {
          pKey = (global.GameState?.activeMaterialMod) ? 'enchantment' : 'material';
        } else {
          pKey = 'single';
        }
      }

      const prof = this.getProfileConfig(pKey);
      const finalColor = this.resolveRippleColor(options.color || color || prof.color);
      const speed = options.speed ?? prof.speed ?? 144, thickness = options.thickness ?? prof.thickness ?? 3;
      const bands = options.bands ?? prof.bands ?? (coords.length > 1 ? 4 : 1), alpha0 = options.alpha0 ?? prof.alpha0 ?? 1.00;
      const maxRadius = options.maxRadius ?? prof.maxRadius ?? 360, bandSpacing = options.bandSpacing ?? prof.bandSpacing ?? 22;
      const durationSec = Math.max(0.2, options.duration ?? (maxRadius / speed));

      this.activeRipples.push({
        coords: coords.map(c => (c.type ? { type: c.type, q: c.q, r: c.r } : { q: c.q, r: c.r })), color: finalColor,
        elapsed: 0, speed, duration: durationSec, maxRadius, thickness, bands, bandSpacing, alpha0
      });
    }

    /**
     * Preview trigger for Animation Tuning Lab
     */
    triggerDemoRipple(profileKey) {
      const pKey = profileKey || global.AnimationTuningLab?.currentRippleProfile || 'material';
      const prof = this.getProfileConfig(pKey);
      const coords = (prof.bands >= 4 || pKey === 'material' || pKey === 'enchantment')
        ? [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }] : [{ q: 0, r: 0 }];
      this.triggerPlacementRipple(coords, prof.color, { profile: pKey });
    }

    /**
     * Master render pass for Layer 5 (between dynamic tile overrides and placed back-tiles).
     * @param {CanvasRenderingContext2D} ctx - Transformed board aperture context
     * @param {object} math - HexMath singleton
     * @param {number} originX - Board origin X in local frame
     * @param {number} originY - Board origin Y in local frame
     * @param {number} hexRadius - Current camera-zoomed hex radius
     * @param {number} dt - Frame delta time in seconds
     */
    renderRipples(ctx, math, originX, originY, hexRadius, dt = 0.016) {
      if (this.activeRipples.length === 0 || !this.scratchCanvas || !this.scratchCtx || !math) return;

      const safeDt = Math.min(0.1, Math.max(0.001, dt));
      const sCenter = this.scratchSize * 0.5;

      for (let i = this.activeRipples.length - 1; i >= 0; i--) {
        const ripple = this.activeRipples[i];
        ripple.elapsed += safeDt;

        const t = ripple.elapsed / ripple.duration;
        if (typeof ripple.onTick === 'function') ripple.onTick(Math.min(1.0, t));

        if (t >= 1.0) {
          if (typeof ripple.onComplete === 'function') ripple.onComplete();
          this.activeRipples.splice(i, 1);
          continue;
        }

        // Dynamically scale all spatial ripple dimensions relative to board hex scale (30px standard)
        const scale = hexRadius / 30;
        const maxR = ripple.maxRadius * scale;
        const thickness = Math.max(1.0, ripple.thickness * scale);
        const bandSpacing = ripple.bandSpacing * scale;

        // Calculate leading radius & alpha for standard, spawn, despawn, or vanish types
        let leadingRadius, baseAlpha;
        if (ripple.type === 'spawn' || ripple.type === 'despawn') {
          leadingRadius = (t <= 0.5) ? (t / 0.5) * maxR : (1.0 - (t - 0.5) / 0.5) * maxR;
          baseAlpha = ripple.alpha0;
        } else {
          leadingRadius = t * maxR;
          baseAlpha = ripple.alpha0 * Math.pow(1.0 - t, 2);
        }

        if (baseAlpha <= 0.005 || leadingRadius <= 0.5) continue;

        // Calculate screen positions in local board frame space (supports hex or vertex coords)
        const pts = ripple.coords.map(c => (c.type && math.vertexToScreen) ? math.vertexToScreen(c, originX, originY, hexRadius) : math.hexToScreen(c.q, c.r, originX, originY, hexRadius));
        let sumX = 0, sumY = 0;
        for (let p = 0; p < pts.length; p++) { sumX += pts[p].x; sumY += pts[p].y; }
        const cX = sumX / pts.length, cY = sumY / pts.length;
        const scratchPts = pts.map(p => ({ x: sCenter + (p.x - cX), y: sCenter + (p.y - cY) }));

        const bridges = [];
        for (let a = 0; a < ripple.coords.length; a++) {
          for (let b = a + 1; b < ripple.coords.length; b++) {
            if (math.hexDistance(ripple.coords[a].q - ripple.coords[b].q, ripple.coords[a].r - ripple.coords[b].r) === 1) {
              bridges.push([scratchPts[a], scratchPts[b]]);
            }
          }
        }

        // Calculate max extent for bounding box clear & drawImage blit
        let maxSpread = 0;
        for (let p = 0; p < scratchPts.length; p++) {
          const dx = scratchPts[p].x - sCenter, dy = scratchPts[p].y - sCenter;
          const d = Math.hypot(dx, dy);
          if (d > maxSpread) maxSpread = d;
        }

        // 4. Alpha Step Rings: Render concentric bands from trailing to leading
        for (let b = ripple.bands - 1; b >= 0; b--) {
          const bandR = leadingRadius - (b * bandSpacing);
          if (bandR <= 1.0) continue;

          const bandWeight = 1.0 - (b / ripple.bands) * 0.75;
          const bandAlpha = Math.max(0.0, Math.min(1.0, baseAlpha * bandWeight));
          if (bandAlpha <= 0.005) continue;

          const boxSize = Math.min(this.scratchSize, Math.ceil((bandR + maxSpread + 16 * scale) * 2));
          const halfBox = boxSize * 0.5;

          // Clear scratch area for this band
          this.scratchCtx.clearRect(sCenter - halfBox, sCenter - halfBox, boxSize, boxSize);

          // --- PASS 1: Solid Outer Stadium/Capsule Hull ---
          this.scratchCtx.globalCompositeOperation = 'source-over';
          this.scratchCtx.fillStyle = ripple.color;
          this.scratchCtx.strokeStyle = ripple.color;
          this.scratchCtx.lineCap = 'round';
          this.scratchCtx.lineJoin = 'round';

          // Straight bridging between adjacent tiles
          if (bridges.length > 0) {
            this.scratchCtx.lineWidth = bandR * 2.0;
            this.scratchCtx.beginPath();
            for (let k = 0; k < bridges.length; k++) {
              this.scratchCtx.moveTo(bridges[k][0].x, bridges[k][0].y);
              this.scratchCtx.lineTo(bridges[k][1].x, bridges[k][1].y);
            }
            this.scratchCtx.stroke();
          }

          // Rounded circles at each tile center
          for (let p = 0; p < scratchPts.length; p++) {
            this.scratchCtx.beginPath();
            this.scratchCtx.arc(scratchPts[p].x, scratchPts[p].y, bandR, 0, Math.PI * 2);
            this.scratchCtx.fill();
          }

          // --- PASS 2: Union Cutout Mask (destination-out at R - thickness) + Optional Solid Fill ---
          const innerR = Math.max(0, bandR - thickness);
          if (innerR > 0.5) {
            const fillAlpha = (ripple.fillAlpha !== undefined) ? ripple.fillAlpha : ((ripple.type === 'spawn' || ripple.type === 'despawn') ? 0.6 : 0.0);
            const traceInner = () => {
              if (bridges.length > 0) {
                this.scratchCtx.lineWidth = innerR * 2.0;
                this.scratchCtx.beginPath();
                for (let k = 0; k < bridges.length; k++) {
                  this.scratchCtx.moveTo(bridges[k][0].x, bridges[k][0].y);
                  this.scratchCtx.lineTo(bridges[k][1].x, bridges[k][1].y);
                }
                this.scratchCtx.stroke();
              }
              for (let p = 0; p < scratchPts.length; p++) {
                this.scratchCtx.beginPath();
                this.scratchCtx.arc(scratchPts[p].x, scratchPts[p].y, innerR, 0, Math.PI * 2);
                this.scratchCtx.fill();
              }
            };
            this.scratchCtx.globalCompositeOperation = 'destination-out';
            const eraseAlpha = ripple.fillColor ? 1.0 : Math.max(0.0, Math.min(1.0, 1.0 - fillAlpha));
            const eraseColor = `rgba(0, 0, 0, ${eraseAlpha})`;
            this.scratchCtx.fillStyle = eraseColor;
            this.scratchCtx.strokeStyle = eraseColor;
            traceInner();
            this.scratchCtx.globalCompositeOperation = 'source-over';
            if (ripple.fillColor && fillAlpha > 0.005) {
              this.scratchCtx.save();
              this.scratchCtx.globalAlpha = fillAlpha;
              this.scratchCtx.fillStyle = ripple.fillColor;
              this.scratchCtx.strokeStyle = ripple.fillColor;
              traceInner();
              this.scratchCtx.restore();
            }
          }

          // --- PASS 3: Composite Hollow Band to Main Board Context ---
          ctx.save();
          ctx.globalAlpha = bandAlpha;
          ctx.drawImage(this.scratchCanvas, sCenter - halfBox, sCenter - halfBox, boxSize, boxSize, cX - halfBox, cY - halfBox, boxSize, boxSize);
          ctx.restore();
        }
      }
    }

    /**
     * Renders transparent double counter-rotating bezel hex back-tiles (bottom then top).
     * Odd tokens (0-based even idx): top CCW (-), bottom CW (+). Even tokens: top CW (+), bottom CCW (-).
     */
    drawDoubleTokenBackTiles(drawBezelHex, x, y, radius, topColor, bottomColor, borderOp = 1.0, spawnTimeMs = 0, tokenIdx = 0, nowMs = null) {
      if (typeof drawBezelHex !== 'function' || radius <= 0.001) return;
      const now = nowMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const h1Sec = global.H_TIMING?.BEAT_SEC ?? (Math.pow(12, 8) / 1420405751.768);
      const ang = Math.max(0, (now - (spawnTimeMs || now)) * 0.001) * ((24 * Math.PI / 180) / h1Sec);
      const topDir = (tokenIdx % 2 === 0) ? -1 : 1;
      drawBezelHex(x, y, radius, bottomColor, bottomColor, 0, borderOp, bottomColor, -topDir * ang);
      drawBezelHex(x, y, radius, topColor, topColor, 0, borderOp, topColor, topDir * ang);
    }

    /**
     * Draws a single circular pulse disc with independent interior fill and outer band color.
     */
    _drawPulseDisc(ctx, x, y, r, strokeCol, fillCol, scale, fillAlpha = 0.6) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fillCol || strokeCol;
      ctx.globalAlpha = fillAlpha;
      ctx.fill();
      ctx.lineWidth = 3 * scale;
      ctx.strokeStyle = strokeCol;
      ctx.globalAlpha = 1.0;
      ctx.stroke();
      ctx.restore();
    }
  }

  const instance = new BoardRippleRendererClass();
  global.BoardRippleRendererClass = BoardRippleRendererClass;
  global.BoardRippleRenderer = instance;
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Board_Ripple_Renderer_1.0', instance);

})(typeof window !== 'undefined' ? window : this);

