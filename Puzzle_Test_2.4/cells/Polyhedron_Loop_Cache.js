/**
 * @fileoverview cells/Polyhedron_Loop_Cache.js - WebGL 3D Polyhedron Batch Compositor (Part 2/2)
 * @description Projects 3D polyhedral meshes at continuous 60/120 Hz angles into DPR-scaled WebGL
 * slots (64px / 128px / 256px) with crystalline shading, dual neon laser strokes, specular flashes,
 * vertex glow nodes, and Ether face orbs, then composites batches onto Canvas 2D contexts.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */
(function(global) {
  'use strict';

  const Cls = global.PolyhedronLoopCacheClass;
  if (!Cls) {
    console.error('[Polyhedron_Loop_Cache] Load Polyhedron_Loop_Cache_1.0.js first.');
    return;
  }

  const proto = Cls.prototype;
  const CANVAS_SIZE = Cls.CANVAS_SIZE || 512;
  const PERSPECTIVE = 4.2;
  const SLOT_RADIUS_PAD = 1.28;
  const REF_BASE_RADIUS = 46.0;
  const ETHER_FACE_COLORS = ['red', 'blue', 'yellow', 'purple'];

  proto._emitCrystalToSlot = function(slotCenterX, slotCenterY, innerSize, colorName, time, seedPhase, seedTilt) {
    const poly = this.polyRender;
    const modelKey = poly?.POLYHEDRON_MAP?.[colorName];
    const model = modelKey ? poly.models?.[modelKey] : null;
    if (!model) return false;

    const progress = ((time / this.duration) + seedPhase) % 1.0;
    const normP = progress < 0 ? progress + 1.0 : progress;
    const theta = normP * Math.PI * 2;
    const rx = 2 * theta, ry = 3 * theta, rz = theta;
    const tilt = (seedTilt * 2.0 - 1.0) * Math.PI;

    const cosX = Math.cos(rx), sinX = Math.sin(rx);
    const cosY = Math.cos(ry), sinY = Math.sin(ry);
    const cosZ = Math.cos(rz), sinZ = Math.sin(rz);
    const cosT = Math.cos(tilt), sinT = Math.sin(tilt);

    const isEther = (colorName === 'ether');
    const halfInner = innerSize * 0.5;
    const refToSlotPx = halfInner / (REF_BASE_RADIUS * SLOT_RADIUS_PAD);
    const polyRadiusPx = (REF_BASE_RADIUS * (isEther ? 0.77 : 0.80)) * refToSlotPx;

    const verts = model.vertices;
    const numVerts = verts.length;
    for (let i = 0; i < numVerts; i++) {
      const v = verts[i];
      const y1 = v[1] * cosX - v[2] * sinX;
      const z1 = v[1] * sinX + v[2] * cosX;
      const x2 = v[0] * cosY + z1 * sinY;
      const z2 = -v[0] * sinY + z1 * cosY;
      const x3 = x2 * cosZ - y1 * sinZ;
      const y3 = x2 * sinZ + y1 * cosZ;

      const xt = x3 * cosT - y3 * sinT;
      const yt = x3 * sinT + y3 * cosT;

      this._rotX[i] = xt;
      this._rotY[i] = yt;
      this._rotZ[i] = z2;

      const pScale = PERSPECTIVE / (PERSPECTIVE + z2);
      this._projX[i] = slotCenterX + xt * polyRadiusPx * pScale;
      this._projY[i] = slotCenterY + yt * polyRadiusPx * pScale;
    }

    const style = poly.overrideStyle || 'gem';
    const lv = poly.lightVector;
    let visibleCount = 0;
    const faces = model.faces;

    for (let fIdx = 0; fIdx < faces.length; fIdx++) {
      const fi = faces[fIdx];
      const i0 = fi[0], i1 = fi[1], i2 = fi[2];
      const e1x = this._rotX[i1] - this._rotX[i0], e1y = this._rotY[i1] - this._rotY[i0], e1z = this._rotZ[i1] - this._rotZ[i0];
      const e2x = this._rotX[i2] - this._rotX[i0], e2y = this._rotY[i2] - this._rotY[i0], e2z = this._rotZ[i2] - this._rotZ[i0];
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;

      let avgZ = 0;
      for (let k = 0; k < fi.length; k++) avgZ += this._rotZ[fi[k]];
      avgZ /= fi.length;

      let isBack = nz > 0.02;
      if (isEther) {
        let avgX = 0, avgY = 0;
        for (let k = 0; k < fi.length; k++) { avgX += this._rotX[fi[k]]; avgY += this._rotY[fi[k]]; }
        avgX /= fi.length; avgY /= fi.length;
        isBack = (nx * (-avgX) + ny * (-avgY) + nz * (-PERSPECTIVE - avgZ)) <= 0;
      }
      if (isBack && style === 'solid') continue;

      const lightDot = nx * lv[0] + ny * lv[1] + nz * lv[2];
      const rec = this._facePool[visibleCount++];
      rec.indices = fi;
      rec.intensity = Math.max(0.28, Math.min(1.0, 0.42 + 0.58 * lightDot));
      rec.avgZ = avgZ;
      rec.isBackface = isBack;
    }

    const vis = this._facePool.slice(0, visibleCount);
    vis.sort((a, b) => b.avgZ - a.avgZ);

    const colorData = poly.getColorData(colorName);
    const baseEdgeW = poly.edgeNeonWidth !== undefined ? poly.edgeNeonWidth : 4.8;
    const shapeLineMult = (colorName === 'purple') ? (poly.lineMultiplierEarth || 1.4) : 1.0;
    const edgeW = baseEdgeW * shapeLineMult * refToSlotPx;
    const glass = poly.glassiness !== undefined ? poly.glassiness : 0.50;
    const faceR = isEther ? 10 : colorData.r, faceG = isEther ? 10 : colorData.g, faceB = isEther ? 16 : colorData.b;
    const edgeR = isEther ? 255 : colorData.r, edgeG = isEther ? 255 : colorData.g, edgeB = isEther ? 255 : colorData.b;

    const emitFace = (face) => {
      const ind = face.indices, I = face.intensity;
      if (style === 'wireframe') {
        const fa = face.isBackface ? (isEther ? 0.14 : 0.08) : ((isEther ? 0.35 : 0.22) + I * (isEther ? 0.20 : 0.15));
        this._emitFacePoly(ind, faceR, faceG, faceB, fa);
        if (face.isBackface) {
          this._emitFaceEdges(ind, edgeW * 0.4, 1.1, edgeR, edgeG, edgeB, 0.30);
        } else {
          this._emitFaceEdges(ind, edgeW * 0.8, 1.15, Math.min(255, edgeR + 60), Math.min(255, edgeG + 60), Math.min(255, edgeB + 60), 0.90);
        }
      } else if (style === 'solid') {
        const cr = isEther ? Math.round(8 + I * 18) : Math.min(255, Math.round(faceR * (0.45 + I * 0.55)));
        const cg = isEther ? Math.round(8 + I * 18) : Math.min(255, Math.round(faceG * (0.45 + I * 0.55)));
        const cb = isEther ? Math.round(12 + I * 20) : Math.min(255, Math.round(faceB * (0.45 + I * 0.55)));
        this._emitFacePoly(ind, cr, cg, cb, 1.0);
        if (isEther) this._emitFaceEdges(ind, edgeW * 0.6, 1.1, 255, 255, 255, 0.90);
        else this._emitFaceEdges(ind, edgeW * 0.6, 1.1, 15, 23, 42, 0.70);
      } else if (face.isBackface) {
        const ba = isEther ? Math.max(0.18, glass * 0.55) : Math.max(0.04, glass * 0.30);
        const cr = isEther ? faceR : Math.min(255, Math.round(faceR * 0.45));
        const cg = isEther ? faceG : Math.min(255, Math.round(faceG * 0.45));
        const cb = isEther ? faceB : Math.min(255, Math.round(faceB * 0.45));
        this._emitFacePoly(ind, cr, cg, cb, ba);
        this._emitFaceEdges(ind, Math.max(0.5, edgeW * 0.5), 1.1, edgeR, edgeG, edgeB, 0.32);
      } else {
        const fa = isEther ? Math.min(0.92, glass * 1.35) : glass;
        const cr = isEther ? faceR : Math.min(255, Math.round(faceR * (0.35 + I * 0.65)));
        const cg = isEther ? faceG : Math.min(255, Math.round(faceG * (0.35 + I * 0.65)));
        const cb = isEther ? faceB : Math.min(255, Math.round(faceB * (0.35 + I * 0.65)));
        this._emitFacePoly(ind, cr, cg, cb, fa);
        if (I > 0.78) {
          this._emitFacePoly(ind, 255, 255, 255, Math.min(1.0, (I - 0.78) * (isEther ? 0.65 : 3.2)));
        }
        const outerW = edgeW * 1.2;
        this._emitFaceEdges(ind, outerW, Math.max(1.2, outerW * 0.45), edgeR, edgeG, edgeB, 0.45);
        this._emitFaceEdges(ind, Math.max(0.55, edgeW * 0.55), 1.05, Math.min(255, edgeR + 90), Math.min(255, edgeG + 90), Math.min(255, edgeB + 90), 0.92);
      }
    };

    const emitEtherOrb = (face) => {
      const i0 = face.indices[0], i1 = face.indices[1], i2 = face.indices[2];
      const fx = (this._rotX[i0] + this._rotX[i1] + this._rotX[i2]) / 3;
      const fy = (this._rotY[i0] + this._rotY[i1] + this._rotY[i2]) / 3;
      const fz = (this._rotZ[i0] + this._rotZ[i1] + this._rotZ[i2]) / 3;
      const hoverMult = 0.70 / (Math.hypot(fx, fy, fz) || 1);
      const hz = fz * hoverMult;
      const hScale = PERSPECTIVE / (PERSPECTIVE + hz);
      const px = slotCenterX + (fx * hoverMult) * polyRadiusPx * hScale;
      const py = slotCenterY + (fy * hoverMult) * polyRadiusPx * hScale;
      const nr = Math.max(1.2, 12.0 * refToSlotPx);
      const vc = poly.getColorData(ETHER_FACE_COLORS[((6 - i0 - i1 - i2) % 4 + 4) % 4]);
      this._emitDisc(px, py, nr * 1.28, 1.3, vc.r, vc.g, vc.b, 0.38);
      this._emitDisc(px, py, nr, 1.1, Math.min(255, vc.r + 35), Math.min(255, vc.g + 35), Math.min(255, vc.b + 35), 0.95);
      this._emitDisc(px, py, nr * 0.50, 1.0, 255, 255, 255, 0.60);
      this._emitDisc(px, py, Math.max(0.4, nr * 0.28), 0.9, 255, 255, 255, 1.0);
    };

    if (isEther && numVerts === 4) {
      if (style === 'gem' || style === 'wireframe') {
        for (let f = 0; f < visibleCount; f++) if (vis[f].isBackface) emitEtherOrb(vis[f]);
      }
      for (let f = 0; f < visibleCount; f++) if (vis[f].isBackface) emitFace(vis[f]);
      for (let f = 0; f < visibleCount; f++) {
        if (!vis[f].isBackface) {
          emitFace(vis[f]);
          if (style === 'gem' || style === 'wireframe') emitEtherOrb(vis[f]);
        }
      }
    } else {
      for (let f = 0; f < visibleCount; f++) emitFace(vis[f]);
      if (style === 'gem' || style === 'wireframe') {
        const baseNodeR = Math.max(0.8, Math.min(2.5, (baseEdgeW * shapeLineMult) * 0.6));
        const nodeR = Math.max(0.55, baseNodeR * refToSlotPx);
        const vr = Math.min(255, colorData.r + 75), vg = Math.min(255, colorData.g + 75), vb = Math.min(255, colorData.b + 75);
        for (let i = 0; i < numVerts; i++) {
          if (this._rotZ[i] <= 0.15 || style === 'wireframe') {
            this._emitDisc(this._projX[i], this._projY[i], nodeR, 1.05, vr, vg, vb, 0.92);
            this._emitDisc(this._projX[i], this._projY[i], Math.max(0.35, nodeR * 0.42), 0.9, 255, 255, 255, 0.95);
          }
        }
      }
    }
    return true;
  };

  proto._resolveSeeds = function(cx, cy, seedPhase, seedTilt) {
    if (seedPhase === null || seedPhase === undefined) {
      const s1 = Math.abs(Math.sin(cx * 12.9898 + cy * 78.233) * 43758.5453);
      seedPhase = s1 - Math.floor(s1);
    }
    if (seedTilt === null || seedTilt === undefined) {
      const s2 = Math.abs(Math.cos(cx * 39.346 + cy * 11.135) * 24634.6345);
      seedTilt = s2 - Math.floor(s2);
    }
    return { seedPhase, seedTilt };
  };

  proto._pickSlotSize = function(maxDestDiamPx) {
    const isLite = !!global.DevicePerfProfile?.isLiteMode?.();
    if (maxDestDiamPx <= (isLite ? 80 : 62)) return 64;
    if (maxDestDiamPx <= (isLite ? 160 : 124)) return 128;
    return 256;
  };

  proto.draw = function(ctx, cx, cy, radius, colorName, time = 0, customAlpha = null, seedPhase = null, seedTilt = null) {
    if (!this.enabled || !this.polyRender || radius <= 0.05) return false;
    if (!this.gl && !this._initWebGL()) return false;
    if (!this.gl || this.contextLost || this.gl.isContextLost?.()) return false;

    const t = ctx.getTransform();
    const dprScale = Math.max(0.5, Math.hypot(t.a, t.b));
    const destHalf = radius * SLOT_RADIUS_PAD;
    const destSize = destHalf * 2.0;
    const slotSize = this._pickSlotSize(destSize * dprScale);
    const innerSize = slotSize - 2;
    const seeds = this._resolveSeeds(cx, cy, seedPhase, seedTilt);

    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, CANVAS_SIZE - slotSize, slotSize, slotSize);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);

    this._vCount = 0;
    if (!this._emitCrystalToSlot(slotSize * 0.5, slotSize * 0.5, innerSize, colorName, time, seeds.seedPhase, seeds.seedTilt)) {
      return false;
    }
    this._flushVbo();

    ctx.save();
    if (customAlpha !== null && customAlpha !== undefined) {
      ctx.globalAlpha = (ctx.globalAlpha ?? 1.0) * customAlpha;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.canvas, 1, 1, innerSize, innerSize, cx - destHalf, cy - destHalf, destSize, destSize);
    ctx.restore();
    return true;
  };

  proto.drawBatch = function(ctx, items, time = 0) {
    if (!this.enabled || !this.polyRender || !items || items.length === 0) return false;
    if (!this.gl && !this._initWebGL()) return false;
    if (!this.gl || this.contextLost || this.gl.isContextLost?.()) return false;

    const baseTransform = ctx.getTransform();
    const baseAlpha = ctx.globalAlpha !== undefined ? ctx.globalAlpha : 1.0;
    const dprScale = Math.max(0.5, Math.hypot(baseTransform.a, baseTransform.b));

    let maxR = 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].radius > maxR) maxR = items[i].radius;
    }
    if (maxR <= 0.05) return true;

    const slotSize = this._pickSlotSize(maxR * SLOT_RADIUS_PAD * 2.0 * dprScale);
    const innerSize = slotSize - 2;
    const cols = Math.floor(CANVAS_SIZE / slotSize);
    const slotsPerPass = cols * cols;
    const gl = this.gl;

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);

    ctx.save();
    ctx.setTransform(baseTransform);
    ctx.imageSmoothingEnabled = true;

    for (let start = 0; start < items.length; start += slotsPerPass) {
      const end = Math.min(items.length, start + slotsPerPass);
      const count = end - start;
      const usedRows = Math.ceil(count / cols);
      const clearH = usedRows * slotSize;

      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, CANVAS_SIZE - clearH, CANVAS_SIZE, clearH);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.SCISSOR_TEST);

      this._vCount = 0;
      for (let k = 0; k < count; k++) {
        const it = items[start + k];
        if (it.radius <= 0.05) continue;
        const col = k % cols;
        const row = Math.floor(k / cols);
        const scx = col * slotSize + slotSize * 0.5;
        const scy = row * slotSize + slotSize * 0.5;
        const seeds = this._resolveSeeds(it.cx, it.cy, it.seedPhase, it.seedTilt);
        this._emitCrystalToSlot(scx, scy, innerSize, it.colorName, time, seeds.seedPhase, seeds.seedTilt);
      }
      this._flushVbo();

      for (let k = 0; k < count; k++) {
        const it = items[start + k];
        if (it.radius <= 0.05) continue;
        const col = k % cols;
        const row = Math.floor(k / cols);
        const sx = col * slotSize + 1;
        const sy = row * slotSize + 1;
        const destHalf = it.radius * SLOT_RADIUS_PAD;
        const destSize = destHalf * 2.0;
        ctx.globalAlpha = (it.customAlpha !== null && it.customAlpha !== undefined)
          ? (baseAlpha * it.customAlpha)
          : baseAlpha;
        ctx.drawImage(this.canvas, sx, sy, innerSize, innerSize, it.cx - destHalf, it.cy - destHalf, destSize, destSize);
      }
    }

    ctx.globalAlpha = baseAlpha;
    ctx.restore();
    return true;
  };

  proto.getVramAllocMB = function() {
    if (!this.gl || !this.canvas || this.contextLost) return 0;
    const fbBytes = this.canvas.width * this.canvas.height * 4;
    const vboBytes = this._vData.byteLength;
    return (fbBytes + vboBytes) / (1024 * 1024);
  };

  const instance = new Cls();
  global.PolyhedronLoopCache = instance;
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Polyhedron_Loop_Cache', instance);
  }
})(typeof window !== 'undefined' ? window : this);
