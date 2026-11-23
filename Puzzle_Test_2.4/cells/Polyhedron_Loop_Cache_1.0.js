/**
 * @fileoverview cells/Polyhedron_Loop_Cache_1.0.js - WebGL 3D Polyhedron Batch Pipeline (Part 1/2)
 * @description Manages the offscreen 512x512 WebGL context, premultiplied-alpha GLSL shaders,
 * WebGL context-loss recovery, dynamic Float32Array VBO streaming, and analytical SDF primitive
 * emitters (triangles, rounded-cap capsules, and discs). Paired with Polyhedron_Loop_Cache.js.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */
(function(global) {
  'use strict';

  const CANVAS_SIZE = 512;
  const FLOATS_PER_VERT = 11; // x, y, r, g, b, a, u, v, extRad, segLen, feather
  const MAX_VERTS = 32768;

  const VS_SRC = `
    attribute vec2 aPos;
    attribute vec4 aColor;
    attribute vec2 aUV;
    attribute vec3 aMeta;
    varying vec4 vColor;
    varying vec2 vUV;
    varying vec3 vMeta;
    void main() {
      vColor = aColor;
      vUV = aUV;
      vMeta = aMeta;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const FS_SRC = `
    precision mediump float;
    varying vec4 vColor;
    varying vec2 vUV;
    varying vec3 vMeta;
    void main() {
      float cov = 1.0;
      if (vMeta.x > 0.0) {
        float along = clamp(vUV.y, 0.0, max(0.0, vMeta.y));
        float dy = vUV.y - along;
        float dist = length(vec2(vUV.x, dy));
        if (dist > vMeta.x) discard;
        cov = smoothstep(vMeta.x, max(0.0, vMeta.x - vMeta.z), dist);
      }
      float a = clamp(vColor.a * cov, 0.0, 1.0);
      gl_FragColor = vec4(vColor.rgb * a, a);
    }
  `;

  class PolyhedronLoopCacheClass {
    constructor() {
      this.duration = 6.0;
      this.enabled = true;
      this.polyRender = null;
      this.canvas = null;
      this.gl = null;
      this.program = null;
      this.vbo = null;
      this.contextLost = false;
      this._ctxEventsBound = false;

      this._vData = new Float32Array(MAX_VERTS * FLOATS_PER_VERT);
      this._vCount = 0;

      this._rotX = new Float32Array(32);
      this._rotY = new Float32Array(32);
      this._rotZ = new Float32Array(32);
      this._projX = new Float32Array(32);
      this._projY = new Float32Array(32);
      this._facePool = Array.from({ length: 32 }, () => ({
        indices: null, intensity: 0, avgZ: 0, isBackface: false
      }));
    }

    init(polyRender) {
      this.polyRender = polyRender;
      if (polyRender) polyRender.loopCache = this;
      if (!this.gl && typeof document !== 'undefined') {
        this._initWebGL();
      }
      return this;
    }

    invalidate() {
      // Live WebGL batcher reads vibrancy, glassiness, style, and edge widths per frame
    }

    _initWebGL() {
      try {
        if (!this.canvas) {
          this.canvas = document.createElement('canvas');
          this.canvas.width = CANVAS_SIZE;
          this.canvas.height = CANVAS_SIZE;
        }
        if (!this._ctxEventsBound) {
          this._ctxEventsBound = true;
          this.canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            this.contextLost = true;
            global.DevicePerfProfile?.markContextLost?.();
          }, false);
          this.canvas.addEventListener('webglcontextrestored', () => {
            this.contextLost = false;
            this._setupPipeline();
          }, false);
        }
        const isLite = !!global.DevicePerfProfile?.isLiteMode?.();
        const glOpts = {
          alpha: true,
          premultipliedAlpha: true,
          depth: false,
          stencil: false,
          antialias: !isLite,
          powerPreference: isLite ? 'default' : 'high-performance'
        };
        this.gl = this.canvas.getContext('webgl2', glOpts) || this.canvas.getContext('webgl', glOpts);
        if (!this.gl) {
          this.enabled = false;
          return false;
        }
        return this._setupPipeline();
      } catch (_) {
        this.enabled = false;
        return false;
      }
    }

    _compileShader(gl, type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        gl.deleteShader(s);
        return null;
      }
      return s;
    }

    _setupPipeline() {
      const gl = this.gl;
      if (!gl || gl.isContextLost?.()) return false;
      const vs = this._compileShader(gl, gl.VERTEX_SHADER, VS_SRC);
      const fs = this._compileShader(gl, gl.FRAGMENT_SHADER, FS_SRC);
      if (!vs || !fs) { this.enabled = false; return false; }

      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        this.enabled = false;
        return false;
      }
      this.program = prog;
      this.vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, this._vData.byteLength, gl.DYNAMIC_DRAW);

      const stride = FLOATS_PER_VERT * 4;
      const bindAttr = (name, size, offsetBytes) => {
        const loc = gl.getAttribLocation(prog, name);
        if (loc >= 0) {
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offsetBytes);
        }
      };
      gl.useProgram(prog);
      bindAttr('aPos', 2, 0);
      bindAttr('aColor', 4, 8);
      bindAttr('aUV', 2, 24);
      bindAttr('aMeta', 3, 32);

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.viewport(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      this.enabled = true;
      return true;
    }

    _flushVbo() {
      if (this._vCount <= 0 || !this.gl) return;
      const gl = this.gl;
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._vData.subarray(0, this._vCount * FLOATS_PER_VERT));
      gl.drawArrays(gl.TRIANGLES, 0, this._vCount);
      this._vCount = 0;
    }

    _ensureSpace(vertsNeeded) {
      if (this._vCount + vertsNeeded > MAX_VERTS) {
        this._flushVbo();
      }
    }

    _pushVert(px, py, rn, gn, bn, a, u, v, extRad, segLen, feather) {
      const invHalf = 2.0 / CANVAS_SIZE;
      const idx = this._vCount * FLOATS_PER_VERT;
      const d = this._vData;
      d[idx]     = px * invHalf - 1.0;
      d[idx + 1] = 1.0 - py * invHalf;
      d[idx + 2] = rn;
      d[idx + 3] = gn;
      d[idx + 4] = bn;
      d[idx + 5] = a;
      d[idx + 6] = u;
      d[idx + 7] = v;
      d[idx + 8] = extRad;
      d[idx + 9] = segLen;
      d[idx + 10] = feather;
      this._vCount++;
    }

    _emitFacePoly(indices, r, g, b, a) {
      if (a <= 0.002) return;
      const triCount = indices.length - 2;
      if (triCount <= 0) return;
      this._ensureSpace(triCount * 3);
      const rn = r / 255, gn = g / 255, bn = b / 255;
      const px = this._projX, py = this._projY;
      const i0 = indices[0];
      const x0 = px[i0], y0 = py[i0];
      for (let k = 1; k <= triCount; k++) {
        const i1 = indices[k], i2 = indices[k + 1];
        this._pushVert(x0, y0, rn, gn, bn, a, 0, 0, 0, 0, 0);
        this._pushVert(px[i1], py[i1], rn, gn, bn, a, 0, 0, 0, 0, 0);
        this._pushVert(px[i2], py[i2], rn, gn, bn, a, 0, 0, 0, 0, 0);
      }
    }

    _emitDisc(cx, cy, radiusPx, featherPx, r, g, b, a) {
      if (a <= 0.002 || radiusPx <= 0.02) return;
      this._ensureSpace(6);
      const extR = radiusPx + featherPx * 0.5;
      const rn = r / 255, gn = g / 255, bn = b / 255;
      const x0 = cx - extR, x1 = cx + extR, y0 = cy - extR, y1 = cy + extR;
      this._pushVert(x0, y0, rn, gn, bn, a, -extR, -extR, extR, 0, featherPx);
      this._pushVert(x1, y0, rn, gn, bn, a,  extR, -extR, extR, 0, featherPx);
      this._pushVert(x1, y1, rn, gn, bn, a,  extR,  extR, extR, 0, featherPx);
      this._pushVert(x0, y0, rn, gn, bn, a, -extR, -extR, extR, 0, featherPx);
      this._pushVert(x1, y1, rn, gn, bn, a,  extR,  extR, extR, 0, featherPx);
      this._pushVert(x0, y1, rn, gn, bn, a, -extR,  extR, extR, 0, featherPx);
    }

    _emitCapsule(x0, y0, x1, y1, halfWidthPx, featherPx, r, g, b, a) {
      if (a <= 0.002 || halfWidthPx <= 0.02) return;
      const dx = x1 - x0, dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) {
        this._emitDisc(x0, y0, halfWidthPx, featherPx, r, g, b, a);
        return;
      }
      this._ensureSpace(6);
      const extR = halfWidthPx + featherPx * 0.5;
      const tx = dx / len, ty = dy / len;
      const nx = -ty * extR, ny = tx * extR;
      const txR = tx * extR, tyR = ty * extR;
      const rn = r / 255, gn = g / 255, bn = b / 255;

      const ax = x0 - txR + nx, ay = y0 - tyR + ny;
      const bx = x0 - txR - nx, by = y0 - tyR - ny;
      const cx = x1 + txR - nx, cy = y1 + tyR - ny;
      const ex = x1 + txR + nx, ey = y1 + tyR + ny;
      const uEnd = len + extR;

      this._pushVert(ax, ay, rn, gn, bn, a,  extR, -extR, extR, len, featherPx);
      this._pushVert(bx, by, rn, gn, bn, a, -extR, -extR, extR, len, featherPx);
      this._pushVert(cx, cy, rn, gn, bn, a, -extR,  uEnd, extR, len, featherPx);
      this._pushVert(ax, ay, rn, gn, bn, a,  extR, -extR, extR, len, featherPx);
      this._pushVert(cx, cy, rn, gn, bn, a, -extR,  uEnd, extR, len, featherPx);
      this._pushVert(ex, ey, rn, gn, bn, a,  extR,  uEnd, extR, len, featherPx);
    }

    _emitFaceEdges(indices, lineWidthPx, featherPx, r, g, b, a) {
      const hw = Math.max(0.35, lineWidthPx * 0.5);
      const px = this._projX, py = this._projY;
      const n = indices.length;
      for (let i = 0; i < n; i++) {
        const i0 = indices[i], i1 = indices[(i + 1) % n];
        this._emitCapsule(px[i0], py[i0], px[i1], py[i1], hw, featherPx, r, g, b, a);
      }
    }
  }

  PolyhedronLoopCacheClass.CANVAS_SIZE = CANVAS_SIZE;
  global.PolyhedronLoopCacheClass = PolyhedronLoopCacheClass;
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Polyhedron_Loop_Cache_1.0', PolyhedronLoopCacheClass);
  }
})(typeof window !== 'undefined' ? window : this);
