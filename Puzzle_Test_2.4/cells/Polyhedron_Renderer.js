/**
 * @fileoverview Polyhedron_Renderer.js - 3D Projected Polyhedral Component Engine (Modular Showcase 5 Cell)
 * @description Renders rotating 3D polyhedra directly on 2D HTML5 canvas using
 * perspective projection, backface culling, dynamic directional lighting, and multi-style shading:
 * - Fire (Red): 12-sided Dodecahedron (12 regular pentagons)
 * - Water (Blue): 20-sided Icosahedron (20 equilateral triangles)
 * - Air (Yellow): 8-sided Octahedron (8 equilateral triangles)
 * - Earth/Stone (Purple): 6-sided Hexahedron / Cube (6 squares, custom lineMultiplier)
 * - Stellated Octahedron (Orange): Stella Octangula (14 vertices, 24 regular equilateral triangles)
 * - Cuboctahedron (Green): Archimedean solid (12 vertices, 14 faces: 6 squares, 8 triangles)
 * - Ether: 4-sided Tetrahedron (black crystal, white/black edges, 4 hovering face orbs)
 * - Disease/Plague: Thick light-grey ring with a barely translucent core
 */

(function(global) {
  'use strict';

  // Golden ratio constant
  const PHI = (1 + Math.sqrt(5)) / 2;
  const INV_PHI = 1 / PHI;

  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function normalize3(v) { const len = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / len, v[1] / len, v[2] / len]; }


  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const bigint = parseInt(clean, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255,
      hex: hex
    };
  }

  function adjustVibrancy(r, g, b, vibrancy) {
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const nr = Math.min(255, Math.max(0, Math.round(lum + (r - lum) * vibrancy)));
    const ng = Math.min(255, Math.max(0, Math.round(lum + (g - lum) * vibrancy)));
    const nb = Math.min(255, Math.max(0, Math.round(lum + (b - lum) * vibrancy)));
    return { r: nr, g: ng, b: nb };
  }

  class PolyhedronRendererClass {
    constructor() {
      // Light source vector pointing from top-left-front towards origin (-Z is front)
      this.lightVector = normalize3([-0.45, -0.65, -0.85]);

      // Base models cache
      this.models = {};
      this.initModels();

      this.overrideStyle = 'gem';
      this.overrideSpeed = 0.1;
      this.animTime = 0;
      this._hasAdvanced = false;

      // Dynamic Shading Controls
      this.glassiness = 0.50;
      this.vibrancy = 2.00;
      this.edgeNeonWidth = 4.8;
      this.lineMultiplierEarth = 1.40;

      this.POLYHEDRON_MAP = {
        red: 'dodecahedron', blue: 'icosahedron', yellow: 'octahedron',
        purple: 'cube', orange: 'stellated_octahedron', green: 'cuboctahedron',
        ether: 'tetrahedron'
      };
      this.colors = {
        red: '#ec0e0e', blue: '#0040ff', yellow: '#ffdd57', purple: '#5900b3',
        orange: '#ff7614', green: '#008a02', ether: '#ffffff', disease: '#e2e8f0'
      };

      // Reusable Scratch Buffers for Zero-Allocation 3D Projection (eliminates GC stutters)
      this._rotX = new Float32Array(32);
      this._rotY = new Float32Array(32);
      this._rotZ = new Float32Array(32);
      this._projX = new Float32Array(32);
      this._projY = new Float32Array(32);
      this._facePool = [];
      for (let i = 0; i < 32; i++) {
        this._facePool.push({ indices: null, normalZ: 0, intensity: 0, avgZ: 0, isBackface: false });
      }
    }

    setStyle(style) {
      this.overrideStyle = style;
      if (this.loopCache) this.loopCache.invalidate();
    }

    setSpeed(speed) {
      this.overrideSpeed = typeof speed === 'number' ? speed : 0.1;
    }

    advanceTime(dt) {
      this.animTime = (this.animTime || 0) + dt;
      this._hasAdvanced = true;
    }

    setLightDir(x, y, z) {
      this.lightVector = normalize3([x, y, z]);
      if (this.loopCache) this.loopCache.invalidate();
    }

    initModels() {
      if (global.PolyhedronModels?.getModels) {
        this.models = global.PolyhedronModels.getModels();
      } else {
        this.models = {};
      }
    }

    getColorData(colorName) {
      let hex = this.colors[colorName] || '#38bdf8';
      let name = colorName;
      if (colorName === 'red') { hex = this.colors.red; name = 'Fire (Red)'; }
      else if (colorName === 'blue') { hex = this.colors.blue; name = 'Water (Blue)'; }
      else if (colorName === 'yellow') { hex = this.colors.yellow; name = 'Air (Yellow)'; }
      else if (colorName === 'purple') { hex = this.colors.purple; name = 'Stone (Purple)'; }
      else if (colorName === 'orange') { hex = this.colors.orange; name = 'Orange (Stellated)'; }
      else if (colorName === 'green') { hex = this.colors.green; name = 'Green (Cuboctahedron)'; }
      else if (colorName === 'ether') { hex = this.colors.ether; name = 'Ether'; }
      else if (colorName === 'disease') { hex = this.colors.disease; name = 'Disease'; }

      const raw = hexToRgb(hex);
      const vib = adjustVibrancy(raw.r, raw.g, raw.b, this.vibrancy);
      return { r: vib.r, g: vib.g, b: vib.b, hex: hex, name: name };
    }

    drawComponent(ctx, cx, cy, radius, colorName, time = 0, isGhost = false, isOffBoard = false, customAlpha = null, seedPhase = null, seedTilt = null) {
      if (typeof colorName === 'object' && colorName) colorName = colorName.color || colorName.name;
      const style = this.overrideStyle || 'gem';

      // Fast GPU-accelerated Sprite Sheet Cache for ALL polyhedra (Micro Sockets, Hero Crystals & Ghost Previews)
      const speedMult = (typeof this.overrideSpeed === 'number') ? this.overrideSpeed : 1.0;
      const effTime = this._hasAdvanced ? this.animTime : (time * speedMult);

      if (colorName === 'disease' && (typeof this.drawDiseaseToken === 'function' || typeof this.drawDiseaseRing === 'function')) {
        const fn = this.drawDiseaseToken || this.drawDiseaseRing;
        fn.call(this, ctx, cx, cy, radius, effTime, style, isGhost, isOffBoard, customAlpha);
        return;
      }

      if (this.loopCache && this.loopCache.enabled && this.POLYHEDRON_MAP[colorName]) {
        const finalAlpha = (customAlpha !== null && customAlpha !== undefined)
          ? customAlpha
          : (isGhost ? 0.65 : 1.0);
        if (this.loopCache.draw(ctx, cx, cy, radius, colorName, effTime, finalAlpha, seedPhase, seedTilt)) {
          return;
        }
      }

      const modelKey = this.POLYHEDRON_MAP[colorName] || 'icosahedron';
      const rx = effTime * 0.4;
      const ry = effTime * 0.7;
      const rz = 0;
      const model = this.models[modelKey];
      if (!model) return;

      const polyRadius = radius * (colorName === 'ether' ? 0.77 : 0.80);
      this.renderProjectedPolyhedron(ctx, cx, cy, polyRadius, model, rx, ry, rz, colorName, style, isGhost, customAlpha);
    }

    /**
     * High-speed batch rendering for multiple polyhedra:
     * Dispatches items to loopCache.drawBatch in a single state pass.
     */
    drawBatch(ctx, items, time = 0) {
      if (!items || items.length === 0) return;
      const speedMult = (typeof this.overrideSpeed === 'number') ? this.overrideSpeed : 1.0;
      const effTime = this._hasAdvanced ? this.animTime : (time * speedMult);
      const cached = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.colorName === 'disease') {
          this.drawComponent(ctx, it.cx, it.cy, it.radius, it.colorName, time, it.isGhost, it.isOffBoard, it.customAlpha, it.seedPhase, it.seedTilt);
        } else if (this.loopCache && this.loopCache.enabled && this.POLYHEDRON_MAP[it.colorName]) {
          const finalAlpha = (it.customAlpha !== null && it.customAlpha !== undefined) ? it.customAlpha : (it.isGhost ? 0.65 : 1.0);
          cached.push({ cx: it.cx, cy: it.cy, radius: it.radius, colorName: it.colorName, customAlpha: finalAlpha, seedPhase: it.seedPhase, seedTilt: it.seedTilt });
        } else {
          this.drawComponent(ctx, it.cx, it.cy, it.radius, it.colorName, time, it.isGhost, it.isOffBoard, it.customAlpha, it.seedPhase, it.seedTilt);
        }
      }
      if (cached.length > 0 && this.loopCache && !this.loopCache.drawBatch(ctx, cached, effTime)) {
        for (let i = 0; i < cached.length; i++) {
          const it = cached[i];
          this.drawComponent(ctx, it.cx, it.cy, it.radius, it.colorName, time, false, false, it.customAlpha, it.seedPhase, it.seedTilt);
        }
      }
    }

    renderProjectedPolyhedron(ctx, cx, cy, radius, model, rx, ry, rz, colorName, style, isGhost = false, customAlpha = null) {
      const colorData = this.getColorData(colorName);
      const alphaBase = (customAlpha !== null && customAlpha !== undefined) 
        ? customAlpha 
        : (isGhost ? 0.65 : 1.0);

      const numVerts = model.vertices.length;
      const cosX = Math.cos(rx), sinX = Math.sin(rx);
      const cosY = Math.cos(ry), sinY = Math.sin(ry);
      const cosZ = Math.cos(rz), sinZ = Math.sin(rz);
      const perspective = 4.2;

      // 1. Vectorized zero-allocation 3D rotation & perspective projection
      for (let i = 0; i < numVerts; i++) {
        const v = model.vertices[i];
        const y1 = v[1] * cosX - v[2] * sinX;
        const z1 = v[1] * sinX + v[2] * cosX;
        const x2 = v[0] * cosY + z1 * sinY;
        const z2 = -v[0] * sinY + z1 * cosY;
        const x3 = x2 * cosZ - y1 * sinZ;
        const y3 = x2 * sinZ + y1 * cosZ;

        this._rotX[i] = x3;
        this._rotY[i] = y3;
        this._rotZ[i] = z2;

        const scale = perspective / (perspective + z2);
        this._projX[i] = cx + x3 * radius * scale;
        this._projY[i] = cy + y3 * radius * scale;
      }

      // 2. Zero-allocation face normal calculation & backface culling
      let visibleCount = 0;
      const lv = this.lightVector;
      const isEther = (colorName === 'ether');
      for (let fIdx = 0; fIdx < model.faces.length; fIdx++) {
        const faceIndices = model.faces[fIdx];
        const i0 = faceIndices[0], i1 = faceIndices[1], i2 = faceIndices[2];

        const e1x = this._rotX[i1] - this._rotX[i0];
        const e1y = this._rotY[i1] - this._rotY[i0];
        const e1z = this._rotZ[i1] - this._rotZ[i0];

        const e2x = this._rotX[i2] - this._rotX[i0];
        const e2y = this._rotY[i2] - this._rotY[i0];
        const e2z = this._rotZ[i2] - this._rotZ[i0];

        let nx = e1y * e2z - e1z * e2y;
        let ny = e1z * e2x - e1x * e2z;
        let nz = e1x * e2y - e1y * e2x;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;

        let avgZ = 0;
        for (let i = 0; i < faceIndices.length; i++) {
          avgZ += this._rotZ[faceIndices[i]];
        }
        avgZ /= faceIndices.length;

        let isBack = nz > 0.02;
        if (isEther) {
          let avgX = 0, avgY = 0;
          for (let i = 0; i < faceIndices.length; i++) {
            avgX += this._rotX[faceIndices[i]];
            avgY += this._rotY[faceIndices[i]];
          }
          avgX /= faceIndices.length;
          avgY /= faceIndices.length;
          isBack = (nx * (-avgX) + ny * (-avgY) + nz * (-perspective - avgZ)) <= 0;
        }
        if (isBack && style === 'solid') continue;

        const lightDot = nx * lv[0] + ny * lv[1] + nz * lv[2];
        const intensity = Math.max(0.28, Math.min(1.0, 0.42 + 0.58 * lightDot));

        const rec = this._facePool[visibleCount++];
        rec.indices = faceIndices;
        rec.intensity = intensity;
        rec.avgZ = avgZ;
        rec.isBackface = isBack;
      }

      // 3. Painter's algorithm sort on active slice (draw farthest first)
      const visibleFaces = this._facePool.slice(0, visibleCount);
      visibleFaces.sort((a, b) => b.avgZ - a.avgZ);

      ctx.save();
      const baseEdgeW = (this.edgeNeonWidth !== undefined ? this.edgeNeonWidth : 4.8);
      const shapeLineMult = (colorName === 'purple') ? (this.lineMultiplierEarth || 1.4) : 1.0;
      const edgeW = baseEdgeW * shapeLineMult;
      const glass = this.glassiness !== undefined ? this.glassiness : 0.50;
      const faceR = isEther ? 10 : colorData.r;
      const faceG = isEther ? 10 : colorData.g;
      const faceB = isEther ? 16 : colorData.b;
      const edgeR = isEther ? 255 : colorData.r;
      const edgeG = isEther ? 255 : colorData.g;
      const edgeB = isEther ? 255 : colorData.b;

      const drawFace = (face) => {
        ctx.beginPath();
        const f0 = face.indices[0];
        ctx.moveTo(this._projX[f0], this._projY[f0]);
        for (let i = 1; i < face.indices.length; i++) {
          const fi = face.indices[i];
          ctx.lineTo(this._projX[fi], this._projY[fi]);
        }
        ctx.closePath();

        const I = face.intensity;

        if (style === 'wireframe') {
          const faceAlpha = face.isBackface
            ? (isEther ? 0.14 : 0.08) * alphaBase
            : ((isEther ? 0.35 : 0.22) + I * (isEther ? 0.20 : 0.15)) * alphaBase;
          ctx.fillStyle = `rgba(${faceR}, ${faceG}, ${faceB}, ${faceAlpha})`;
          ctx.fill();

          ctx.strokeStyle = face.isBackface
            ? `rgba(${edgeR}, ${edgeG}, ${edgeB}, ${0.3 * alphaBase})`
            : `rgba(${Math.min(255, edgeR + 60)}, ${Math.min(255, edgeG + 60)}, ${Math.min(255, edgeB + 60)}, ${0.9 * alphaBase})`;
          ctx.lineWidth = face.isBackface ? edgeW * 0.4 : edgeW * 0.8;
          ctx.stroke();

        } else if (style === 'solid') {
          const cr = isEther ? Math.round(8 + I * 18) : Math.min(255, Math.round(faceR * (0.45 + I * 0.55)));
          const cg = isEther ? Math.round(8 + I * 18) : Math.min(255, Math.round(faceG * (0.45 + I * 0.55)));
          const cb = isEther ? Math.round(12 + I * 20) : Math.min(255, Math.round(faceB * (0.45 + I * 0.55)));
          ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alphaBase})`;
          ctx.fill();
          ctx.strokeStyle = isEther ? `rgba(255, 255, 255, ${0.9 * alphaBase})` : `rgba(15, 23, 42, ${0.7 * alphaBase})`;
          ctx.lineWidth = edgeW * 0.6;
          ctx.stroke();
        } else {
          // Crystalline Gem Style (Volumetric translucency with visible backfaces)
          if (face.isBackface) {
            const backAlpha = (isEther ? Math.max(0.18, glass * 0.55) : Math.max(0.04, glass * 0.3)) * alphaBase;
            const cr = isEther ? faceR : Math.min(255, Math.round(faceR * 0.45));
            const cg = isEther ? faceG : Math.min(255, Math.round(faceG * 0.45));
            const cb = isEther ? faceB : Math.min(255, Math.round(faceB * 0.45));
            ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${backAlpha})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(${edgeR}, ${edgeG}, ${edgeB}, ${0.32 * alphaBase})`;
            ctx.lineWidth = Math.max(0.5, edgeW * 0.5);
            ctx.stroke();
          } else {
            const frontAlpha = (isEther ? Math.min(0.92, glass * 1.35) : glass) * alphaBase;
            const cr = isEther ? faceR : Math.min(255, Math.round(faceR * (0.35 + I * 0.65)));
            const cg = isEther ? faceG : Math.min(255, Math.round(faceG * (0.35 + I * 0.65)));
            const cb = isEther ? faceB : Math.min(255, Math.round(faceB * (0.35 + I * 0.65)));
            ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${frontAlpha})`;
            ctx.fill();
            if (I > 0.78) {
              ctx.fillStyle = `rgba(255, 255, 255, ${(I - 0.78) * (isEther ? 0.65 : 3.2) * alphaBase})`;
              ctx.fill();
            }
            // Outer soft neon aura & inner crisp laser core stroke (shared by all polyhedra)
            ctx.strokeStyle = `rgba(${edgeR}, ${edgeG}, ${edgeB}, ${0.45 * alphaBase})`;
            ctx.lineWidth = edgeW * 1.2;
            ctx.stroke();
            const lr = Math.min(255, edgeR + 90), lg = Math.min(255, edgeG + 90), lb = Math.min(255, edgeB + 90);
            ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, ${0.92 * alphaBase})`;
            ctx.lineWidth = Math.max(0.5, edgeW * 0.55);
            ctx.stroke();
          }
        }
      };

      const ETHER_FACE_COLORS = ['red', 'blue', 'yellow', 'purple'];
      const drawEtherFaceOrb = (face) => {
        const i0 = face.indices[0], i1 = face.indices[1], i2 = face.indices[2];
        const colorIdx = 6 - i0 - i1 - i2;
        const fx = (this._rotX[i0] + this._rotX[i1] + this._rotX[i2]) / 3;
        const fy = (this._rotY[i0] + this._rotY[i1] + this._rotY[i2]) / 3;
        const fz = (this._rotZ[i0] + this._rotZ[i1] + this._rotZ[i2]) / 3;
        const fLen = Math.hypot(fx, fy, fz) || 1;
        const hoverMult = 0.70 / fLen;
        const hx = fx * hoverMult, hy = fy * hoverMult, hz = fz * hoverMult;
        const hScale = perspective / (perspective + hz);
        const px = cx + hx * radius * hScale;
        const py = cy + hy * radius * hScale;

        const nr = Math.max(1.8, 12.0 * (radius / (46.0 * 0.77)));
        const vc = this.getColorData(ETHER_FACE_COLORS[(colorIdx % 4 + 4) % 4]);
        const nodeAlpha = 0.95 * alphaBase;
        ctx.beginPath();
        ctx.arc(px, py, nr * 1.28, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${vc.r}, ${vc.g}, ${vc.b}, ${0.40 * nodeAlpha})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, nr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${Math.min(255, vc.r + 35)}, ${Math.min(255, vc.g + 35)}, ${Math.min(255, vc.b + 35)}, ${nodeAlpha})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, nr * 0.50, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.60 * alphaBase})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.4, nr * 0.28), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alphaBase})`;
        ctx.fill();
      };

      if (isEther && numVerts === 4) {
        if (style === 'gem' || style === 'wireframe') {
          for (let f = 0; f < visibleCount; f++) {
            if (visibleFaces[f].isBackface) drawEtherFaceOrb(visibleFaces[f]);
          }
        }
        for (let f = 0; f < visibleCount; f++) {
          if (visibleFaces[f].isBackface) drawFace(visibleFaces[f]);
        }
        for (let f = 0; f < visibleCount; f++) {
          if (!visibleFaces[f].isBackface) {
            drawFace(visibleFaces[f]);
            if (style === 'gem' || style === 'wireframe') drawEtherFaceOrb(visibleFaces[f]);
          }
        }
      } else {
        for (let f = 0; f < visibleCount; f++) drawFace(visibleFaces[f]);

        // Step 6: Render glowing color-matched vertex nodes for Gem & Wireframe styles
        if (style === 'gem' || style === 'wireframe') {
          const nodeRadius = Math.max(0.8, Math.min(2.5, edgeW * 0.6));
          const { r, g, b } = colorData;
          const vr = Math.min(255, r + 75), vg = Math.min(255, g + 75), vb = Math.min(255, b + 75);

          for (let i = 0; i < numVerts; i++) {
            if (this._rotZ[i] <= 0.15 || style === 'wireframe') {
              const px = this._projX[i], py = this._projY[i];
              ctx.beginPath();
              ctx.arc(px, py, nodeRadius, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(${vr}, ${vg}, ${vb}, ${0.92 * alphaBase})`;
              ctx.fill();

              ctx.beginPath();
              ctx.arc(px, py, Math.max(0.4, nodeRadius * 0.42), 0, Math.PI * 2);
              ctx.fillStyle = `rgba(255, 255, 255, ${0.95 * alphaBase})`;
              ctx.fill();
            }
          }
        }
      }

      ctx.restore();
    }

    /**
     * Renders a glowing hex socket for a placed component.
     */
    drawHexSocket(ctx, cx, cy, hexRadius, colorHex = '#38bdf8', alpha = 0.55) {
      ctx.save();
      ctx.beginPath();
      const effR = hexRadius - 1.5;
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (30 + 60 * i);
        const vx = cx + effR * Math.cos(angle);
        const vy = cy + effR * Math.sin(angle);
        if (i === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      }
      ctx.closePath();

      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = alpha;
      ctx.stroke();
      ctx.restore();
    }
  }

  const instance = new PolyhedronRendererClass();
  global.PolyhedronRenderer = instance;
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Polyhedron_Renderer', instance);
  }
})(typeof window !== 'undefined' ? window : this);
