/**
 * @fileoverview cells/cosmos/Cosmic_Domain_Warp.js - WebGL Fluid Domain Warp & Hardware Deep Stars (Modular Showcase 5 Cell)
 * @description Encapsulates high-performance GPU domain-warped nebula simulation with embedded
 * aerosol vapor haze and hardware deep twinkling stars.
 */

(function(global) {
  'use strict';

  class CosmicDomainWarpClass {
    constructor() {
      this.gl = null;
      this.canvas = null;
      this.warpProgram = null;
      this.aPosLoc = null;
      this.quadBuf = null;
      this.noiseTexture = null;
      this.uniforms = {};
      this.initialized = false;
    }

    /**
     * Initializes the WebGL context and compiles the domain warp shaders.
     */
    init(canvas) {
      if (!canvas) return false;
      this.canvas = canvas;
      const isMobile = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)')?.matches || Math.min(window.innerWidth, window.innerHeight) <= 560);
      const glOpts = {
        alpha: false,
        depth: false,
        antialias: false,
        powerPreference: isMobile ? 'default' : 'high-performance'
      };
      this.gl = canvas.getContext('webgl2', glOpts) || canvas.getContext('webgl', glOpts);

      if (!this.gl) {
        console.warn('CosmicDomainWarp: WebGL not supported on this context.');
        return false;
      }

      const gl = this.gl;
      this.isWebGL2 = (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext);

      // GPU Hardware Profiler (only active when dev drawers are enabled)
      this.extTimer = null;
      if (global.__NAMMU_DEV_DRAWERS__) {
        try {
          this.extTimer = this.isWebGL2
            ? (gl.getExtension('EXT_disjoint_timer_query_webgl2') || gl.getExtension('EXT_disjoint_timer_query'))
            : gl.getExtension('EXT_disjoint_timer_query');
        } catch (e) {
          this.extTimer = null;
        }
      }

      this.pendingQuery = null;
      this.gpuTimerMode = this.extTimer ? 'Hardware Silicon Query' : 'Sync Pipeline Pulse';
      this.gpuTimeMs = 0.85; // Initial baseline (ms)

      // 1. Fullscreen Quad Buffer
      this.quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

      // 2. Vertex Shader
      const warpVs = `
        attribute vec2 aPos;
        void main() {
          gl_Position = vec4(aPos, 0.0, 1.0);
        }
      `;

      // 3. Fragment Shader (Domain Warp + Caustics + Deep Stars + Aerosol Vapor)
      // Mobile uses mediump float for higher GPU ALU throughput, keeping highp for uTime and star hash.
      const precisionHeader = isMobile
        ? `
          #ifdef GL_FRAGMENT_PRECISION_HIGH
          precision mediump float;
          #define HP highp
          #else
          precision mediump float;
          #define HP
          #endif
        `
        : `
          precision highp float;
          #define HP highp
        `;
      const warpFs = `
        ${precisionHeader}
        uniform vec2 uRes;
        uniform HP float uTime;
        uniform float uDensity;
        uniform vec2 uPan;
        uniform float uCaustic;
        uniform float uVorticity;
        uniform int uFlowMode;
        uniform float uFlowAngle;
        uniform float uAerosolVapor;
        uniform int uPalette;
        uniform sampler2D uNoiseTex;

        // Deep Stars (Behind Mist)
        uniform int uDeepActive;
        uniform float uDeepDensity;
        uniform float uDeepSize;
        uniform float uDeepFreq;

        void main() {
          vec2 uv = gl_FragCoord.xy / uRes;
          vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
          vec2 p = (uv * 2.0 - 1.0) * aspect;
          
          p += uPan * 0.002;
          vec2 coord = p * 2.3;
          
          vec2 flowVec = vec2(cos(uFlowAngle), -sin(uFlowAngle));
          vec2 flowOffset = vec2(0.0);
          if (uFlowMode == 0) {
            flowOffset = flowVec * (uTime * 0.55);
          } else if (uFlowMode == 1) {
            flowOffset = vec2(sin(uTime * 0.65) * 0.55, cos(uTime * 0.52) * 0.55);
          } else if (uFlowMode == 2) {
            float r = length(p);
            float theta = atan(p.y, p.x) + (uTime * 0.45) / (r * 0.45 + 0.35);
            coord = vec2(r * cos(theta), r * sin(theta)) * 2.2;
            flowOffset = vec2(sin(uTime * 0.3), cos(uTime * 0.3)) * 0.3;
          }
          
          vec2 pFlow = coord - flowOffset;
          
          // Domain Warping Layer 1
          vec2 q = vec2(
            sin(pFlow.x + uTime * 0.45) + cos(pFlow.y * 1.3 - uTime * 0.3),
            cos(pFlow.y + uTime * 0.4) + sin(pFlow.x * 1.2 + uTime * 0.5)
          );
          vec2 qCurl = vec2(-q.y, q.x);
          vec2 qEffective = mix(q, qCurl, uVorticity * 0.7);
          
          // Domain Warping Layer 2
          vec2 rCoord = pFlow + 3.2 * qEffective;
          vec2 r = vec2(
            sin(rCoord.x + uTime * 0.3),
            cos(rCoord.y + uTime * 0.35)
          );
          vec2 rCurl = vec2(-r.y, r.x);
          vec2 rEffective = mix(r, rCurl, uVorticity * 0.85);
          
          // Caustic Ridge Sharpening
          float rawWave = sin(rEffective.x * 2.2 + rEffective.y * 2.4 + uTime * 0.4);
          float smoothWave = pow(0.5 + 0.5 * rawWave, 2.2);
          float causticWave = pow(1.0 - pow(abs(rawWave), 0.65), 2.8) * 1.6;
          float baseWave = mix(smoothWave, causticWave, uCaustic);
          float totalIntensity = baseWave * uDensity;
          
          // Palette Colors
          vec3 col = vec3(0.0);
          vec3 cDeep = vec3(0.01, 0.04, 0.10);
          vec3 cMid  = vec3(0.02, 0.71, 0.83);
          vec3 cHigh = vec3(0.13, 0.83, 0.93);
          vec3 cPeak = vec3(0.65, 0.95, 0.82);
          
          if (uPalette == 1) { // Astral
            cDeep = vec3(0.03, 0.02, 0.08);
            cMid  = vec3(0.66, 0.33, 0.97);
            cHigh = vec3(0.96, 0.25, 0.37);
            cPeak = vec3(0.22, 0.74, 0.97);
          } else if (uPalette == 2) { // Solar
            cDeep = vec3(0.04, 0.03, 0.01);
            cMid  = vec3(0.96, 0.62, 0.04);
            cHigh = vec3(0.99, 0.88, 0.28);
            cPeak = vec3(0.40, 0.91, 0.98);
          } else if (uPalette == 3) { // Emerald
            cDeep = vec3(0.01, 0.08, 0.05);
            cMid  = vec3(0.06, 0.73, 0.51);
            cHigh = vec3(0.43, 0.91, 0.72);
            cPeak = vec3(0.49, 0.83, 0.99);
          }
          
          col = mix(cDeep, cMid, clamp(totalIntensity * 1.2, 0.0, 1.0));
          col = mix(col, cHigh, clamp((totalIntensity - 0.45) * 1.8, 0.0, 1.0));
          col = mix(col, cPeak, clamp((totalIntensity - 0.85) * 2.5, 0.0, 1.0));
          
          // LAYER 1: Deep Stars (Behind Mist — Naturally Occluded & Diffused by Aerosol Vapor)
          if (uDeepActive == 1) {
            float gridScale = 30.0 * (uDeepDensity / 300.0);
            vec2 sUV = (p + uPan * 0.0003) * gridScale;
            vec2 iCell = floor(sUV);
            vec2 fCell = fract(sUV);
            
            HP vec2 hCell = iCell;
            HP vec2 hash = fract(sin(vec2(dot(hCell, vec2(127.1, 311.7)), dot(hCell, vec2(269.5, 183.3)))) * 43758.5453);
            vec2 starPos = hash * 0.70 + 0.15;
            vec2 delta = fCell - starPos;
            float dist = length(delta);
            
            // Serene slow twinkling for deep cosmic field
            HP float twSpeed = (hash.x * 1.8 + 0.6) * uDeepFreq;
            HP float twPhase = hash.y * 6.28318;
            float twinkle = sin(uTime * twSpeed + twPhase) * 0.5 + 0.5;
            twinkle = pow(twinkle, 2.0);
            
            // Soft luminous stellar core + celestial glow halo
            float coreRad = 0.075 * uDeepSize * (0.65 + 0.35 * hash.x);
            float starCore = smoothstep(coreRad, 0.0, dist) * twinkle;
            float glowHalo = smoothstep(coreRad * 3.2, 0.0, dist) * twinkle * 0.35;
            
            // Occasional deep hero glint (top 15% cells)
            float deepGlint = 0.0;
            if (hash.x > 0.85) {
              float flareX = max(0.0, 1.0 - abs(delta.x) * 12.0) * max(0.0, 1.0 - abs(delta.y) * 4.0);
              float flareY = max(0.0, 1.0 - abs(delta.y) * 12.0) * max(0.0, 1.0 - abs(delta.x) * 4.0);
              deepGlint = (flareX + flareY) * twinkle * 0.8 * uDeepSize;
            }
            
            vec3 deepStarColor = mix(cHigh, cPeak, hash.y * 0.8 + 0.2);
            col += deepStarColor * (starCore + glowHalo + deepGlint) * 1.1;
          }

          // Aerosol Vapor Haze (Occludes and diffuses Layer 1 Deep Stars)
          if (uAerosolVapor > 0.01) {
            vec2 vaporUV = (pFlow + qEffective * 0.5) * 0.22;
            vec4 s1 = texture2D(uNoiseTex, vaporUV + vec2(uTime * 0.025, -uTime * 0.018));
            vec4 s2 = texture2D(uNoiseTex, vaporUV * 1.85 - vec2(uTime * 0.035, uTime * 0.022));
            float vaporMask = smoothstep(0.30, 0.75, s1.r * 0.60 + s2.g * 0.40);
            float mistGlow = vaporMask * (baseWave * 1.8 + 0.22) * uAerosolVapor;
            col += mix(cMid, cPeak, vaporMask) * mistGlow * 0.85;
          }

          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
      `;

      this.warpProgram = gl.createProgram();
      gl.attachShader(this.warpProgram, this._compileShader(gl.VERTEX_SHADER, warpVs));
      gl.attachShader(this.warpProgram, this._compileShader(gl.FRAGMENT_SHADER, warpFs));
      gl.linkProgram(this.warpProgram);

      this.aPosLoc = gl.getAttribLocation(this.warpProgram, 'aPos');

      // Cache Uniform Locations
      const uNames = [
        'uRes', 'uTime', 'uDensity', 'uPan', 'uCaustic', 'uVorticity',
        'uFlowMode', 'uFlowAngle', 'uAerosolVapor', 'uPalette', 'uNoiseTex',
        'uDeepActive', 'uDeepDensity', 'uDeepSize', 'uDeepFreq'
      ];
      for (const name of uNames) {
        this.uniforms[name] = gl.getUniformLocation(this.warpProgram, name);
      }

      this.noiseTexture = this._createNoiseTexture(gl);
      this.initialized = true;
      return true;
    }

    _compileShader(type, src) {
      const gl = this.gl;
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('CosmicDomainWarp Shader Error:', gl.getShaderInfoLog(s));
      }
      return s;
    }

    _createNoiseTexture(gl) {
      const size = 64;
      const data = new Uint8Array(size * size * 4);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const fx = (x / size) * Math.PI * 2;
          const fy = (y / size) * Math.PI * 2;
          const n1 = Math.sin(fx) * Math.cos(fy) + Math.cos(fx * 2 - fy) * 0.45 + Math.sin(fy * 2 + fx) * 0.45;
          const r = Math.floor(((n1 / 1.9) * 0.5 + 0.5) * 255);
          const n2 = Math.sin(fx * 2 + 1.3) * Math.cos(fy * 2 - 0.8) + Math.sin(fx * 3 - fy * 2) * 0.35;
          const g = Math.floor(((n2 / 1.8) * 0.5 + 0.5) * 255);
          const n3 = Math.sin(fx * 4 - 0.5) * Math.cos(fy * 4 + 1.1) + Math.cos(fx * 5 + fy * 3) * 0.3;
          const b = Math.floor(((n3 / 1.8) * 0.5 + 0.5) * 255);
          const idx = (y * size + x) * 4;
          data[idx] = Math.max(0, Math.min(255, r));
          data[idx + 1] = Math.max(0, Math.min(255, g));
          data[idx + 2] = Math.max(0, Math.min(255, b));
          data[idx + 3] = 255;
        }
      }
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      return tex;
    }

    /**
     * Renders a frame of the domain warp and stellar background.
     */
    render(state) {
      if (!this.initialized || !this.gl || !this.warpProgram) return;
      const gl = this.gl;
      const u = this.uniforms;

      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.disable(gl.BLEND);
      gl.useProgram(this.warpProgram);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.enableVertexAttribArray(this.aPosLoc);
      gl.vertexAttribPointer(this.aPosLoc, 2, gl.FLOAT, false, 0, 0);

      const flowAngleRad = ((state.flowAngleDeg || 35) * Math.PI) / 180.0;
      const paraX = state.parallaxEnabled ? ((state.panX || 0) * 0.08) : 0;
      const paraY = state.parallaxEnabled ? (-(state.panY || 0) * 0.08) : 0;

      gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
      gl.uniform1f(u.uTime, (state.time || 0) * (state.flowSpeed !== undefined ? state.flowSpeed : 0.20));
      gl.uniform1f(u.uDensity, state.mistDensity !== undefined ? state.mistDensity : 0.20);
      gl.uniform2f(u.uPan, paraX, paraY);

      gl.uniform1f(u.uCaustic, state.caustic !== undefined ? state.caustic : 0.50);
      gl.uniform1f(u.uVorticity, state.vorticity !== undefined ? state.vorticity : 0.50);
      gl.uniform1i(u.uFlowMode, state.flowMode !== undefined ? state.flowMode : 0);
      gl.uniform1f(u.uFlowAngle, flowAngleRad);
      gl.uniform1f(u.uAerosolVapor, state.vaporHaze !== undefined ? state.vaporHaze : 0.40);
      gl.uniform1i(u.uPalette, state.palette !== undefined ? state.palette : 1);

      // Deep Stars
      gl.uniform1i(u.uDeepActive, state.deepEnabled ? 1 : 0);
      gl.uniform1f(u.uDeepDensity, state.deepDensity || 250);
      gl.uniform1f(u.uDeepSize, state.deepSize || 0.60);
      gl.uniform1f(u.uDeepFreq, state.deepFreq || 3.00);

      if (this.noiseTexture && u.uNoiseTex) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.noiseTexture);
        gl.uniform1i(u.uNoiseTex, 0);
      }

      // GPU Hardware Profiler: Check previous query results (Dual WebGL 1/2)
      if (this.extTimer && this.pendingQuery) {
        try {
          let available = false;
          let disjoint = false;
          let timeElapsedNano = 0;

          if (this.isWebGL2) {
            available = gl.getQueryParameter(this.pendingQuery, gl.QUERY_RESULT_AVAILABLE);
            disjoint = gl.getParameter(this.extTimer.GPU_DISJOINT_EXT);
            if (available && !disjoint) {
              timeElapsedNano = gl.getQueryParameter(this.pendingQuery, gl.QUERY_RESULT);
            }
          } else {
            available = this.extTimer.getQueryObjectEXT(this.pendingQuery, this.extTimer.QUERY_RESULT_AVAILABLE_EXT);
            disjoint = gl.getParameter(this.extTimer.GPU_DISJOINT_EXT);
            if (available && !disjoint) {
              timeElapsedNano = this.extTimer.getQueryObjectEXT(this.pendingQuery, this.extTimer.QUERY_RESULT_EXT);
            }
          }

          if (available && !disjoint) {
            const measuredMs = Number(timeElapsedNano) / 1000000.0;
            if (measuredMs > 0.005 && measuredMs < 100.0) {
              this.gpuTimeMs = this.gpuTimeMs * 0.85 + measuredMs * 0.15;
            }
          }

          if (available || disjoint) {
            if (this.isWebGL2) {
              gl.deleteQuery(this.pendingQuery);
            } else {
              this.extTimer.deleteQueryEXT(this.pendingQuery);
            }
            this.pendingQuery = null;
          }
        } catch (e) {
          this.extTimer = null;
          this.gpuTimerMode = 'Sync Pipeline Pulse';
          this.pendingQuery = null;
        }
      }

      // Begin Profiler Timing Pass
      let pulseStart = 0;
      let timingActive = false;
      if (this.extTimer) {
        try {
          if (!this.pendingQuery) {
            if (this.isWebGL2) {
              this.pendingQuery = gl.createQuery();
              gl.beginQuery(this.extTimer.TIME_ELAPSED_EXT, this.pendingQuery);
            } else {
              this.pendingQuery = this.extTimer.createQueryEXT();
              this.extTimer.beginQueryEXT(this.extTimer.TIME_ELAPSED_EXT, this.pendingQuery);
            }
            timingActive = true;
          }
        } catch (e) {
          this.extTimer = null;
          this.gpuTimerMode = 'Sync Pipeline Pulse';
          this.pendingQuery = null;
          pulseStart = performance.now();
        }
      } else {
        pulseStart = performance.now();
      }

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // End Profiler Timing Pass
      if (timingActive && this.extTimer && this.pendingQuery) {
        try {
          if (this.isWebGL2) {
            gl.endQuery(this.extTimer.TIME_ELAPSED_EXT);
          } else {
            this.extTimer.endQueryEXT(this.extTimer.TIME_ELAPSED_EXT);
          }
        } catch (e) {
          this.extTimer = null;
          this.gpuTimerMode = 'Sync Pipeline Pulse';
          this.pendingQuery = null;
        }
      } else if (!timingActive) {
        const pulseElapsed = performance.now() - pulseStart;
        if (pulseElapsed > 0.005 && pulseElapsed < 100.0) {
          this.gpuTimeMs = this.gpuTimeMs * 0.85 + pulseElapsed * 0.15;
        }
      }
    }

    /**
     * Calculates total dedicated VRAM allocated for WebGL background pipeline (MB).
     */
    getVramAllocMB() {
      if (!this.canvas) return 0;
      const backbufferMB = (this.canvas.width * this.canvas.height * 4) / (1024 * 1024);
      const noiseTexMB = (256 * 256 * 4) / (1024 * 1024); // 0.25 MB
      const quadVboMB = (8 * 4) / (1024 * 1024);
      return backbufferMB + noiseTexMB + quadVboMB;
    }
  }

  const instance = new CosmicDomainWarpClass();
  global.CosmicDomainWarp = instance;
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Cosmic_Domain_Warp', instance);
  }
})(typeof window !== 'undefined' ? window : this);
