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
      this.enabled = true;
      this.dirty = true;
      this.polyRender = null;
      this.sheets = {};
      this._bakeToken = 0;
      this.COLORS = ['red', 'blue', 'yellow', 'purple', 'orange', 'green', 'ether'];
      this._configureLayout();
    }

    _configureLayout() {
      const isMobile = typeof window !== 'undefined' && (
        window.matchMedia?.('(pointer: coarse)')?.matches ||
        Math.min(window.innerWidth || 999, window.innerHeight || 999) <= 560
      );
      this.duration = 6.0;
      this.frameCount = 720;
      this.frameSize = isMobile ? 64 : 96;
      this.baseRadius = isMobile ? (46.0 * (64 / 96)) : 46.0;

      // Keep every offscreen canvas under GPU MAX_TEXTURE_SIZE with zero frame/resolution loss
      const maxTex = global.CosmicDomainWarp?.maxTextureSize || 8192;
      const needSplit = (30 * this.frameSize > maxTex) || (24 * this.frameSize > maxTex);
      if (needSplit) {
        this.sheetsPerColor = 2;
        this.framesPerSheet = 360;
        this.cols = 20;
        this.rows = 18;
      } else {
        this.sheetsPerColor = 1;
        this.framesPerSheet = 720;
        this.cols = 30;
        this.rows = 24;
      }

      this.frameSheetIdx = new Uint8Array(this.frameCount);
      this.frameSX = new Int16Array(this.frameCount);
      this.frameSY = new Int16Array(this.frameCount);
      this.initLUT();
    }

    initLUT() {
      const fSize = this.frameSize;
      const cols = this.cols;
      const perSheet = this.framesPerSheet;
      for (let k = 0; k < this.frameCount; k++) {
        this.frameSheetIdx[k] = Math.floor(k / perSheet);
        const localK = k % perSheet;
        this.frameSX[k] = (localK % cols) * fSize;
        this.frameSY[k] = Math.floor(localK / cols) * fSize;
      }
    }

    init(polyRender, opts = null) {
      this.polyRender = polyRender;
      if (polyRender) {
        polyRender.loopCache = this;
      }
      this._configureLayout();
      if (opts && (opts.timeSliced || opts.async)) {
        return this.bakeAllAsync(opts);
      }
      this.bakeAll();
      return this;
    }

    invalidate() {
      this._bakeToken++;
      this.dirty = true;
    }

    _ensureColorSheets(colorName) {
      const sheetW = this.cols * this.frameSize;
      const sheetH = this.rows * this.frameSize;
      const count = this.sheetsPerColor;
      let arr = this.sheets[colorName];
      const valid = Array.isArray(arr) && arr.length === count
        && arr.every(s => s?.canvas && s.ctx && s.canvas.width === sheetW && s.canvas.height === sheetH);
      if (!valid) {
        arr = [];
        for (let i = 0; i < count; i++) {
          const canvas = document.createElement('canvas');
          canvas.width = sheetW;
          canvas.height = sheetH;
          const sCtx = canvas.getContext('2d', { alpha: true });
          if (!sCtx) {
            this.enabled = false;
            this.sheets = {};
            return null;
          }
          arr.push({ canvas, ctx: sCtx });
        }
        this.sheets[colorName] = arr;
      }
      for (let i = 0; i < arr.length; i++) {
        arr[i].ctx.clearRect(0, 0, sheetW, sheetH);
      }
      return arr;
    }

    _renderFrame(poly, model, style, colorName, sheetsArr, k) {
      const fSize = this.frameSize;
      const half = fSize * 0.5;
      const polyR = this.baseRadius * (colorName === 'ether' ? 0.77 : 0.80);
      const tau = k / this.frameCount;
      const theta = tau * Math.PI * 2;
      const sObj = sheetsArr[this.frameSheetIdx[k]];
      poly.renderProjectedPolyhedron(
        sObj.ctx, this.frameSX[k] + half, this.frameSY[k] + half,
        polyR, model, 2 * theta, 3 * theta, theta, colorName, style, false, 1.0
      );
    }

    bakeColor(colorName) {
      if (!this.polyRender || !this.enabled) return null;
      const poly = this.polyRender;
      const modelKey = poly.POLYHEDRON_MAP[colorName];
      if (!modelKey || !poly.models[modelKey]) return null;
      const model = poly.models[modelKey];
      const style = poly.overrideStyle || 'gem';
      const sheetsArr = this._ensureColorSheets(colorName);
      if (!sheetsArr) return null;

      try {
        for (let k = 0; k < this.frameCount; k++) {
          this._renderFrame(poly, model, style, colorName, sheetsArr, k);
        }
      } catch (_) {
        this.enabled = false;
        this.sheets = {};
        return null;
      }
      return sheetsArr;
    }

    bakeAll() {
      if (!this.polyRender || !this.enabled) return;
      for (let i = 0; i < this.COLORS.length; i++) {
        if (!this.bakeColor(this.COLORS[i])) {
          this.enabled = false;
          this.sheets = {};
          return;
        }
      }
      this.dirty = false;
    }

    /**
     * Frame-budgeted async sprite-sheet baker: yields requestAnimationFrame between
     * ~6.5 ms slices so live WebGL + 60 Hz UI never stall or clog the GPU command queue.
     */
    async bakeAllAsync(opts = {}) {
      if (!this.polyRender || !this.enabled) return this;
      const token = ++this._bakeToken;
      const poly = this.polyRender;
      const style = poly.overrideStyle || 'gem';
      const budgetMs = Math.max(2, Number(opts.frameBudgetMs) || 6.5);
      const totalFrames = this.COLORS.length * this.frameCount;
      const yieldFrame = () => (typeof requestAnimationFrame === 'function'
        ? new Promise((r) => requestAnimationFrame(r))
        : new Promise((r) => setTimeout(r, 0)));

      let baked = 0;
      let sliceStart = performance.now();

      for (let c = 0; c < this.COLORS.length; c++) {
        if (token !== this._bakeToken || !this.enabled) return this;
        const colorName = this.COLORS[c];
        const modelKey = poly.POLYHEDRON_MAP[colorName];
        const model = modelKey ? poly.models[modelKey] : null;
        if (!model) { baked += this.frameCount; continue; }

        const sheetsArr = this._ensureColorSheets(colorName);
        if (!sheetsArr) return this;

        for (let k = 0; k < this.frameCount; k++) {
          if (token !== this._bakeToken || !this.enabled) return this;
          try {
            this._renderFrame(poly, model, style, colorName, sheetsArr, k);
          } catch (_) {
            this.enabled = false;
            this.sheets = {};
            return this;
          }
          baked++;
          if ((k & 3) === 3 && (performance.now() - sliceStart) >= budgetMs) {
            if (typeof opts.onProgress === 'function') opts.onProgress(baked, totalFrames);
            await yieldFrame();
            sliceStart = performance.now();
          }
        }
        if (typeof opts.onProgress === 'function') opts.onProgress(baked, totalFrames);
        await yieldFrame();
        sliceStart = performance.now();
      }

      if (token === this._bakeToken) this.dirty = false;
      return this;
    }

    getSheet(colorName) {
      if (this.dirty) {
        this.bakeAll();
      }
      let sheetsArr = this.sheets[colorName];
      if (!sheetsArr) {
        sheetsArr = this.bakeColor(colorName);
      }
      return sheetsArr;
    }

    /**
     * Fast GPU-accelerated Blit for all polyhedra (micro sockets, hero crystals, hubs).
     */
    draw(ctx, cx, cy, radius, colorName, time = 0, customAlpha = null, seedPhase = null, seedTilt = null) {
      if (!this.enabled) return false;

      const sheetsArr = this.getSheet(colorName);
      if (!sheetsArr || !sheetsArr.length) return false;

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
      const sObj = sheetsArr[this.frameSheetIdx[frameIndex]] || sheetsArr[0];
      if (!sObj?.canvas) return false;
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
        sObj.canvas,
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
        const sheetsArr = this.getSheet(colorName);
        if (!sheetsArr || !sheetsArr.length) continue;

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
          const sObj = sheetsArr[this.frameSheetIdx[frameIndex]] || sheetsArr[0];
          if (!sObj?.canvas) continue;
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
            sObj.canvas,
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
        const arr = this.sheets[cKey];
        if (!Array.isArray(arr)) continue;
        for (let i = 0; i < arr.length; i++) {
          const c = arr[i]?.canvas;
          if (c) totalBytes += c.width * c.height * 4;
        }
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
