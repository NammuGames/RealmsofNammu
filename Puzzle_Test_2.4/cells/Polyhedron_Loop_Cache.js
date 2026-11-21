/**
 * Polyhedron_Loop_Cache.js
 * 
 * High-performance 3-Axis Harmonic Pre-Rendered Sprite Sheet Cache for ALL polyhedra.
 * Unified Single-Tier Strategy (Hero Resolution = 96px, 720 frames, 30x24 2D grid matrix).
 * 
 * Pre-bakes 1 seamless 6-second harmonic tumble cycle (X: 2 turns, Y: 3 turns, Z: 1 turn)
 * into offscreen atlas canvases per polyhedron color.
 * 
 * Stamps frames via GPU-accelerated ctx.drawImage() with two deterministic pseudo-random offsets:
 *   1. Loop Phase Offset: Staggers starting point along the 6-second tumble timeline.
 *   2. Spatial Tilt Offset: Angles the 2D tumble plane so no two crystals tumble identically.
 */
(function(global) {
  'use strict';

  class PolyhedronLoopCacheClass {
    constructor() {
      const isMobile = typeof window !== 'undefined' && (
        window.matchMedia?.('(pointer: coarse)')?.matches ||
        Math.min(window.innerWidth || 999, window.innerHeight || 999) <= 560
      );
      this.duration = 6.0;      // 6.0 seconds per seamless harmonic cycle
      this.frameCount = isMobile ? 360 : 720;    // Mobile: 360 frames (20x18) at 64px cuts VRAM/bandwidth by ~78%
      this.cols = isMobile ? 20 : 30;
      this.frameSize = isMobile ? 64 : 96;
      this.baseRadius = isMobile ? (46.0 * (64 / 96)) : 46.0;
      this.enabled = true;
      this.dirty = true;
      this.polyRender = null;
      this.sheets = {};

      this.COLORS = ['red', 'blue', 'yellow', 'purple', 'orange', 'green', 'ether'];
      this.frameSX = new Int16Array(this.frameCount);
      this.frameSY = new Int16Array(this.frameCount);
      this.initLUT();
    }

    initLUT() {
      const fSize = this.frameSize;
      const cols = this.cols;
      for (let k = 0; k < this.frameCount; k++) {
        this.frameSX[k] = (k % cols) * fSize;
        this.frameSY[k] = Math.floor(k / cols) * fSize;
      }
    }

    init(polyRender) {
      this.polyRender = polyRender;
      if (polyRender) {
        polyRender.loopCache = this;
      }
      this.bakeAll();
      return this;
    }

    invalidate() {
      this.dirty = true;
    }

    bakeColor(colorName) {
      if (!this.polyRender) return null;
      const poly = this.polyRender;
      const modelKey = poly.POLYHEDRON_MAP[colorName];
      if (!modelKey || !poly.models[modelKey]) return null;
      const model = poly.models[modelKey];
      const style = poly.overrideStyle || 'gem';

      const fSize = this.frameSize;
      const bRad = this.baseRadius;
      const cols = this.cols;
      const rows = Math.ceil(this.frameCount / cols);
      const sheetW = cols * fSize;
      const sheetH = rows * fSize;

      let sheet = this.sheets[colorName];
      if (!sheet || sheet.canvas.width !== sheetW || sheet.canvas.height !== sheetH) {
        const canvas = document.createElement('canvas');
        canvas.width = sheetW;
        canvas.height = sheetH;
        sheet = { canvas, ctx: canvas.getContext('2d', { alpha: true }) };
        this.sheets[colorName] = sheet;
      }

      const sCtx = sheet.ctx;
      sCtx.clearRect(0, 0, sheetW, sheetH);

      const half = fSize * 0.5;
      const polyR = bRad * (colorName === 'ether' ? 0.77 : 0.80);

      // Harmonic 3-Axis Rotation Formula:
      // Over cycle duration T = 6.0s:
      // Pitch (rx) = 2 full turns (4 * PI)
      // Yaw   (ry) = 3 full turns (6 * PI)
      // Roll  (rz) = 1 full turn  (2 * PI)
      for (let k = 0; k < this.frameCount; k++) {
        const tau = k / this.frameCount;
        const theta = tau * Math.PI * 2;
        const rx = 2 * theta;
        const ry = 3 * theta;
        const rz = 1 * theta;

        const col = k % cols;
        const row = Math.floor(k / cols);
        const cx = col * fSize + half;
        const cy = row * fSize + half;

        poly.renderProjectedPolyhedron(
          sCtx, cx, cy, polyR, model,
          rx, ry, rz, colorName, style, false, 1.0
        );
      }

      return sheet;
    }

    bakeAll() {
      if (!this.polyRender) return;
      for (let i = 0; i < this.COLORS.length; i++) {
        this.bakeColor(this.COLORS[i]);
      }
      this.dirty = false;
    }

    getSheet(colorName) {
      if (this.dirty) {
        this.bakeAll();
      }
      let sheet = this.sheets[colorName];
      if (!sheet) {
        sheet = this.bakeColor(colorName);
      }
      return sheet;
    }

    /**
     * Fast GPU-accelerated Blit for all polyhedra (micro sockets, hero crystals, hubs).
     */
    draw(ctx, cx, cy, radius, colorName, time = 0, customAlpha = null, seedPhase = null, seedTilt = null) {
      if (!this.enabled) return false;

      const sheet = this.getSheet(colorName);
      if (!sheet) return false;

      // Camera-invariant deterministic pseudo-random seeds if not explicitly supplied
      if (seedPhase === null || seedPhase === undefined || seedTilt === null || seedTilt === undefined) {
        const s1 = Math.abs(Math.sin(cx * 12.9898 + cy * 78.233) * 43758.5453);
        if (seedPhase === null || seedPhase === undefined) {
          seedPhase = s1 - Math.floor(s1);
        }
        const s2 = Math.abs(Math.cos(cx * 39.346 + cy * 11.135) * 24634.6345);
        if (seedTilt === null || seedTilt === undefined) {
          seedTilt = s2 - Math.floor(s2);
        }
      }

      // 1. Random #1: Staggered time/phase offset along the 6-second harmonic loop
      const progress = ((time / this.duration) + seedPhase) % 1.0;
      const normProgress = progress < 0 ? progress + 1.0 : progress;
      const frameIndex = Math.floor(normProgress * this.frameCount) % this.frameCount;

      // 2. Random #2: Fixed 2D spatial tilt angle (-PI to +PI)
      const tiltAngle = (seedTilt * 2.0 - 1.0) * Math.PI;

      const fSize = this.frameSize;
      const scale = radius / this.baseRadius;
      const destSize = fSize * scale;
      const halfDest = destSize * 0.5;

      // Frame coordinate Lookup Table (LUT) - Fix 3
      const sx = this.frameSX[frameIndex];
      const sy = this.frameSY[frameIndex];

      ctx.save();
      ctx.translate(cx, cy);
      if (customAlpha !== null && customAlpha !== undefined) {
        ctx.globalAlpha = (ctx.globalAlpha || 1.0) * customAlpha;
      }
      ctx.rotate(tiltAngle);
      ctx.imageSmoothingEnabled = true;

      ctx.drawImage(
        sheet.canvas,
        sx, sy, fSize, fSize,
        -halfDest, -halfDest, destSize, destSize
      );

      ctx.restore();
      return true;
    }

    /**
     * High-speed batched stamp rendering:
     * - Uses single ctx.save() and ctx.restore() for the entire batch.
     * - Groups crystals by color sheet to eliminate atlas texture switching.
     * - Uses ctx.setTransform(baseTransform) instead of per-item save/restore state churn.
     */
    drawBatch(ctx, items, time = 0) {
      if (!this.enabled || !items || items.length === 0) return false;

      ctx.save();
      ctx.imageSmoothingEnabled = true;

      const baseTransform = ctx.getTransform();
      const baseAlpha = ctx.globalAlpha !== undefined ? ctx.globalAlpha : 1.0;

      // Group items by color
      const groups = {};
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const c = it.colorName;
        if (!groups[c]) groups[c] = [];
        groups[c].push(it);
      }

      const fSize = this.frameSize;
      const bRad = this.baseRadius;
      const duration = this.duration;
      const invDuration = 1.0 / duration;
      const fCount = this.frameCount;
      let prevRadius = -1, destSize = 0, halfDest = 0;

      for (const colorName in groups) {
        const sheet = this.getSheet(colorName);
        if (!sheet) continue;

        const group = groups[colorName];
        for (let j = 0; j < group.length; j++) {
          const it = group[j];
          let sPhase = it.seedPhase;
          let sTilt = it.seedTilt;

          if (sPhase === null || sPhase === undefined || sTilt === null || sTilt === undefined) {
            const s1 = Math.abs(Math.sin(it.cx * 12.9898 + it.cy * 78.233) * 43758.5453);
            if (sPhase === null || sPhase === undefined) sPhase = s1 - Math.floor(s1);
            const s2 = Math.abs(Math.cos(it.cx * 39.346 + it.cy * 11.135) * 24634.6345);
            if (sTilt === null || sTilt === undefined) sTilt = s2 - Math.floor(s2);
          }

          const progress = (time * invDuration + sPhase) % 1.0;
          const normProgress = progress < 0 ? progress + 1.0 : progress;
          const frameIndex = Math.floor(normProgress * fCount) % fCount;
          const tiltAngle = (sTilt * 2.0 - 1.0) * Math.PI;

          // Scale calculated once per batch / when radius changes - Fix 4
          if (it.radius !== prevRadius) {
            prevRadius = it.radius;
            destSize = fSize * (it.radius / bRad);
            halfDest = destSize * 0.5;
          }

          // Frame coordinate Lookup Table (LUT) - Fix 3
          const sx = this.frameSX[frameIndex];
          const sy = this.frameSY[frameIndex];

          ctx.setTransform(baseTransform);
          ctx.translate(it.cx, it.cy);
          if (it.customAlpha !== null && it.customAlpha !== undefined) {
            ctx.globalAlpha = baseAlpha * it.customAlpha;
          } else {
            ctx.globalAlpha = baseAlpha;
          }
          ctx.rotate(tiltAngle);

          ctx.drawImage(
            sheet.canvas,
            sx, sy, fSize, fSize,
            -halfDest, -halfDest, destSize, destSize
          );
        }
      }

      ctx.setTransform(baseTransform);
      ctx.globalAlpha = baseAlpha;
      ctx.restore();
      return true;
    }

    getVramAllocMB() {
      let totalBytes = 0;
      for (const cKey in this.sheets) {
        const c = this.sheets[cKey]?.canvas;
        if (c) totalBytes += c.width * c.height * 4;
      }
      return totalBytes / (1024 * 1024);
    }
  }

  const instance = new PolyhedronLoopCacheClass();
  global.PolyhedronLoopCache = instance;
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Polyhedron_Loop_Cache', instance);
  }
})(typeof window !== 'undefined' ? window : this);
