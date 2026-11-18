/**
 * @fileoverview cells/hex_ui/Sigil_Emblem_Renderer_1.0.js - Multi-Part Cell: Part 1.0 of Sigil_Emblem_Renderer
 * @description Core engine, cache dispatcher, 3D projecting hex pyramid, and medallion basin.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  // Colors: 100% Solid Red Fill & Crisp White / Black Outlines
  const FILL_RED = '#ef4444', OUTLINE_WHITE = '#ffffff', OUTLINE_BLACK = '#000000', BASIN_BLACK = '#000000';
  const DEFAULT_EMBLEM_INDICES = { cyber: 3, storm: 0, air: 3, water: 5, ice: 5, dark: 1, feral: 1, wood: 2, stone: 0, fire: 4, heat: 5, light: 1 };

  class SigilEmblemRendererClass {
    constructor() {
      this.vibrancy = 1.75;
      this._cache = new Map();
      this.liveTuning = { cyber: null, wood: null };
    }

    clearCache() {
      if (this._cache) this._cache.clear();
    }

    /** Master dispatcher with automatic offscreen bitmap caching */
    renderEmblem(ctx, elem, variantIndex, isSelected, buttonRadius = 58, renderMode = 'wireframe') {
      if (!ctx) return;
      const key = elem?.key || 'fire';
      const vIdx = (variantIndex !== undefined && variantIndex !== null)
        ? variantIndex : (DEFAULT_EMBLEM_INDICES[key] !== undefined ? DEFAULT_EMBLEM_INDICES[key] : 0);
      const prim = elem?.color || FILL_RED, sec = elem?.secondary || elem?.sec || OUTLINE_WHITE, r = Math.round(buttonRadius);
      const mode = (renderMode === 'dormant') ? 'dormant' : 'wireframe';
      const cacheKey = `${key}_${vIdx}_${isSelected ? 1 : 0}_${r}_${mode}_${prim}_${sec}_${this.vibrancy}`;

      let cached = this._cache ? this._cache.get(cacheKey) : null;
      if (!cached) {
        cached = this._createCachedMedallion(elem, vIdx, isSelected, buttonRadius, mode);
        if (cached && this._cache) {
          if (this._cache.size > 120) this._cache.clear();
          this._cache.set(cacheKey, cached);
        }
      }
      if (cached) { ctx.drawImage(cached.canvas, -cached.cx, -cached.cy); return; }
      this._drawEmblemDirect(ctx, elem, vIdx, isSelected, buttonRadius, mode);
    }

    _createCachedMedallion(elem, variantIndex, isSelected, buttonRadius, renderMode) {
      if (typeof document === 'undefined' || !document.createElement) return null;
      const pad = 16, dim = Math.ceil(buttonRadius * 2.5 + pad * 2);
      const canvas = document.createElement('canvas'); canvas.width = dim; canvas.height = dim;
      const ctx = canvas.getContext('2d'); if (!ctx) return null;
      const cx = Math.round(dim / 2), cy = Math.round(dim / 2);
      ctx.translate(cx, cy);
      this._drawEmblemDirect(ctx, elem, variantIndex, isSelected, buttonRadius, renderMode);
      return { canvas, cx, cy };
    }

    _drawEmblemDirect(ctx, elem, variantIndex, isSelected, buttonRadius = 58, renderMode = 'wireframe') {
      ctx.save();
      this.sLw = buttonRadius / 44;
      this.currentColor = elem?.color || FILL_RED; this.currentSecondary = elem?.secondary || elem?.sec || OUTLINE_WHITE;
      this.currentBasinBg = elem?.basinBg || elem?.secondary || elem?.sec || this.currentSecondary;
      const isDormant = (renderMode === 'dormant'), innerScale = isDormant ? (1 / 3) : 0.74;

      // Unconditional 3D Hexagonal Pyramid (Single Unified Style)
      this.drawProjectingHexPyramid(ctx, buttonRadius, elem, isSelected, !isDormant, innerScale);
      const littleHexR = buttonRadius * innerScale;
      this.drawLittleHexMedallion(ctx, littleHexR, isSelected, this.currentBasinBg, OUTLINE_BLACK);

      if (isDormant) { ctx.restore(); return; }
      const key = elem?.key || 'fire', size = littleHexR * 0.90;
      const vIdx = (variantIndex !== undefined && variantIndex !== null)
        ? variantIndex : (DEFAULT_EMBLEM_INDICES[key] !== undefined ? DEFAULT_EMBLEM_INDICES[key] : 0);
      const fnMap = { fire:'drawFireEmblem', heat:'drawHeatEmblem', light:'drawLightEmblem', cyber:'drawCyberEmblem', storm:'drawStormEmblem', air:'drawAirEmblem', water:'drawWaterEmblem', ice:'drawIceEmblem', dark:'drawDarkEmblem', feral:'drawFeralEmblem', wood:'drawWoodEmblem', stone:'drawStoneEmblem' };
      if (this[fnMap[key]]) this[fnMap[key]](ctx, size, vIdx);
      ctx.restore();
    }

    /** 3D Projecting Hexagonal Pyramid behind small hex (Crystalline Facets, Dual-Pass Laser Wireframe) */
    drawProjectingHexPyramid(ctx, R, elem, isSelected, showBeads = true, innerScale = 0.74) {
      const sec = elem?.secondary || elem?.sec || OUTLINE_WHITE, prim = elem?.color || FILL_RED, rInner = R * innerScale;
      const vOut = this.getRegularPointyHexVertices(R), vIn = this.getRegularPointyHexVertices(rInner);
      const toRgb = h => { const n = parseInt((h || '#fff').slice(1), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
      const vib = (c, v = this.vibrancy ?? 1.75) => (v === 1.0 ? c : c.map(ch => Math.min(255, Math.max(0, Math.round((0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) + (ch - (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2])) * v)))));
      const [pr, pg, pb] = vib(toRgb(prim)), [sr, sg, sb] = vib(toRgb(sec));
      const [cr, cg, cb] = [Math.min(255, sr + 90), Math.min(255, sg + 90), Math.min(255, sb + 90)];
      ctx.save();

      // 1. Six Sloping Lateral Facets in Primary Color with Crystalline Shading & Specular Flares
      for (let i = 0; i < 6; i++) {
        const next = (i + 1) % 6, shade = [0.22, 0.10, -0.12, -0.22, -0.12, 0.12][i];
        ctx.beginPath(); ctx.moveTo(vOut[i].x, vOut[i].y); ctx.lineTo(vOut[next].x, vOut[next].y);
        ctx.lineTo(vIn[next].x, vIn[next].y); ctx.lineTo(vIn[i].x, vIn[i].y); ctx.closePath();
        ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, 0.88)`; ctx.fill();
        ctx.fillStyle = shade > 0 ? `rgba(255, 255, 255, ${shade})` : `rgba(0, 0, 0, ${-shade})`; ctx.fill();
        if (shade >= 0.20) { ctx.fillStyle = 'rgba(255, 255, 255, 0.28)'; ctx.fill(); }
      }

      // 2 & 3. Dual-Pass Laser Neon Wireframe (Zero Gaussian shadowBlur)
      const wirePath = new Path2D();
      for (let i = 0; i < 6; i++) (i === 0 ? wirePath.moveTo(vOut[0].x, vOut[0].y) : wirePath.lineTo(vOut[i].x, vOut[i].y));
      wirePath.closePath();
      for (let i = 0; i < 6; i++) { wirePath.moveTo(vOut[i].x, vOut[i].y); wirePath.lineTo(vIn[i].x, vIn[i].y); }
      const sLw = this.sLw || (R / 44);
      // Pass 1: Outer radiant aura
      ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, 0.28)`; ctx.lineWidth = (isSelected ? 6.5 : 4.8) * sLw; ctx.stroke(wirePath);
      // Pass 2: Mid neon beam
      ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, 0.65)`; ctx.lineWidth = (isSelected ? 3.6 : 2.6) * sLw; ctx.stroke(wirePath);
      // Pass 3: Crisp core laser filament
      ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.95)`; ctx.lineWidth = Math.max(0.8, 1.2 * sLw); ctx.stroke(wirePath);

      // 4. Glowing Jewel Vertex Beads with Specular Glints at Outer Base Corners (Awakened Only)
      if (showBeads) this.drawGlowingVertexNodes(ctx, R, prim, 2.4 * sLw, [pr, pg, pb]);
      ctx.restore();
    }

    /** Glowing Primary Vertex Nodes on hex corners (Dual-layer jewel bead + specular glint, Zero shadowBlur) */
    drawGlowingVertexNodes(ctx, r, color, dotR = 2.4, prgb = null) {
      const v = this.getRegularPointyHexVertices(r);
      const [r0, g0, b0] = prgb || (() => { const n = parseInt((color || '#fff').slice(1), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; })();
      const [vr, vg, vb] = [Math.min(255, r0 + 80), Math.min(255, g0 + 80), Math.min(255, b0 + 80)];
      ctx.save();
      ctx.fillStyle = `rgba(${r0}, ${g0}, ${b0}, 0.35)`;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(v[i].x, v[i].y, dotR * 1.8, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = `rgba(${vr}, ${vg}, ${vb}, 0.95)`;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(v[i].x, v[i].y, dotR, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(v[i].x, v[i].y, Math.max(0.7, dotR * 0.42), 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }

    fillStroke(ctx, lw = 1.8, fillRule = 'nonzero') {
      ctx.fillStyle = this.currentColor || FILL_RED; ctx.fill(fillRule);
      ctx.strokeStyle = OUTLINE_BLACK; ctx.lineWidth = lw * (this.sLw || 1.0); ctx.stroke();
    }

    // --- 1. LITTLE HEX MEDALLION BASIN ---
    drawLittleHexMedallion(ctx, r, isSelected, basinBg = BASIN_BLACK, outlineColor = OUTLINE_BLACK) {
      const drawHex = (rad) => {
        const v = this.getRegularPointyHexVertices(rad); ctx.beginPath();
        for (let i = 0; i < 6; i++) (i === 0 ? ctx.moveTo(v[0].x, v[0].y) : ctx.lineTo(v[i].x, v[i].y));
        ctx.closePath();
      };
      const sLw = this.sLw || 1.0;
      drawHex(r); ctx.fillStyle = basinBg; ctx.fill();
      ctx.strokeStyle = outlineColor; ctx.lineWidth = (isSelected ? 2.2 : (r < 10 ? 1.0 : 1.6)) * sLw; ctx.stroke();
      if (r > 12) {
        drawHex(r * 0.92);
        const isLight = ['#ffffff','#eab308','#facc15','#06b6d4','#94a3b8','#f97316'].includes(basinBg);
        ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.0 * sLw; ctx.stroke();
      }
    }

    getRegularPointyHexVertices(r) {
      return [0,1,2,3,4,5].map(i => ({ x: r * Math.cos((i * 60 - 90) * Math.PI / 180), y: r * Math.sin((i * 60 - 90) * Math.PI / 180) }));
    }
  }

  const instance = new SigilEmblemRendererClass();
  instance.DEFAULT_INDICES = DEFAULT_EMBLEM_INDICES;
  global.SigilEmblemRendererClass = SigilEmblemRendererClass;
  global.SigilEmblemRenderer = instance;
  if (global.ROLL_CALL?.set) global.ROLL_CALL.set('Sigil_Emblem_Renderer', instance);

})(typeof window !== 'undefined' ? window : this);
