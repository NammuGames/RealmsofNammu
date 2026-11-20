/**
 * @fileoverview cells/Board_Cursor_Renderer_1.0.js - Cursor Transition State & Primitive Reticles
 * @description Coordinates flower cursor transition timing and draws base 1-tile, 3-tile sigil,
 * 7-tile flower, and halo cursor primitives (Part 1 of multi-part BoardCursorRenderer cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  class BoardCursorRendererClass {
    constructor() {
      this._flowerTrans = { active: false, fromAlpha: 0, toAlpha: 0, startMs: 0, isArch: false, snapshot: null, confirmed: false };
    }

    /** Returns the active flower spell's tile list, color, unplaced flag, and Arch preview zone. */
    getFlowerRenderSpec(state = global.GameState, math = global.HexMath) {
      if (!state || !math?.getFlowerTiles) return null;
      const defs = [
        [state.inShiftMode && global.SpellShift, '#34d399'],
        [state.inRitualMode && global.SpellRitual, '#38bdf8'],
        [state.inManifestMode && global.SpellManifest, '#ef4444']
      ];
      for (const [sp, col] of defs) {
        if (!sp) continue;
        const u = sp.stage === 'zone', c = u ? sp.zoneCursor : sp.placedCenter;
        const tiles = (!u && sp.flowerTiles?.length > 0) ? sp.flowerTiles.slice() : (c ? math.getFlowerTiles(c.q, c.r) : []);
        return tiles.length ? { tiles, col, unp: u, isArch: false } : null;
      }
      if (state.inArchMode && global.SpellArch) {
        const a = global.SpellArch, u = !a.isPlaced, c = u ? a.zoneCursor : a.placedCenter;
        const tiles = (c && a.getFlowerTilesFor) ? a.getFlowerTilesFor(c.q, c.r) : (c ? math.getFlowerTiles(c.q, c.r) : []);
        const valid = !!(c && (!a.isZoneValidAt || a.isZoneValidAt(c.q, c.r)));
        const ench = (c && a.getArchEnchantmentAt) ? a.getArchEnchantmentAt(c.q, c.r) : null;
        const previewArchZone = valid ? { id: 'preview_arch', center: { ...c }, flowerTiles: tiles.slice(), enchantment: ench } : null;
        return tiles.length ? { tiles, col: u ? '#f97316' : '#fbbf24', unp: u, isArch: true, previewArchZone } : null;
      }
      return null;
    }

    startFlowerIn(isArch = false) {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const tObj = this._flowerTrans;
      const h3Ms = global.H_TIMING?.THREE_BEATS_MS ?? (3 * Math.pow(12, 8) / 1420405751.768 * 1000);
      const cur = (tObj.active && tObj.toAlpha === 0)
        ? Math.max(0.0, tObj.fromAlpha * (1.0 - Math.min(1.0, Math.max(0.0, (now - tObj.startMs) / h3Ms))))
        : 0.0;
      this._flowerTrans = { active: true, fromAlpha: cur, toAlpha: 1, startMs: now, isArch: !!isArch, snapshot: null, confirmed: false };
    }

    startFlowerOut(opts = {}) {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const cur = this.getFlowerTransition(global.GameState).alpha;
      const spec = this.getFlowerRenderSpec(global.GameState, global.HexMath);
      if (cur <= 0.001 || !spec) {
        this._flowerTrans = { active: false, fromAlpha: 0, toAlpha: 0, startMs: now, isArch: false, snapshot: null, confirmed: false };
        return;
      }
      this._flowerTrans = { active: true, fromAlpha: cur, toAlpha: 0, startMs: now, isArch: !!spec.isArch, snapshot: spec, confirmed: !!opts.confirmed };
    }

    /** Evaluates current 3 H-Beat flower fade progress (0..1) and optional exit snapshot. */
    getFlowerTransition(state = global.GameState) {
      const active = !!(state && (state.inShiftMode || state.inRitualMode || state.inManifestMode || state.inArchMode));
      const tObj = this._flowerTrans;
      const h3Ms = global.H_TIMING?.THREE_BEATS_MS ?? (3 * Math.pow(12, 8) / 1420405751.768 * 1000);
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const t = tObj.active ? Math.min(1.0, Math.max(0.0, (now - tObj.startMs) / h3Ms)) : 1.0;
      if (active) {
        const isArch = !!(state.inArchMode && global.SpellArch?.inArchMode);
        if (tObj.active && tObj.toAlpha === 0) { tObj.active = false; tObj.snapshot = null; }
        const alpha = (tObj.active && tObj.toAlpha === 1) ? (tObj.fromAlpha + (1.0 - tObj.fromAlpha) * t) : 1.0;
        return { alpha, active: true, isArch, snapshot: null, confirmed: false };
      }
      if (tObj.active && tObj.toAlpha === 0) {
        const alpha = Math.max(0.0, tObj.fromAlpha * (1.0 - t));
        if (t >= 1.0 || alpha <= 0.001) {
          tObj.active = false; tObj.snapshot = null;
          return { alpha: 0.0, active: false, isArch: false, snapshot: null, confirmed: false };
        }
        return { alpha, active: false, isArch: tObj.isArch, snapshot: tObj.snapshot, confirmed: !!tObj.confirmed };
      }
      return { alpha: 0.0, active: false, isArch: false, snapshot: null, confirmed: false };
    }

    /**
     * Highlights 1 single hex bezel at pixel (x, y).
     */
    _drawBezelHex(ctx, math, x, y, r, fill, stroke, style = {}) {
      const bz = global.HexBezelRenderer;
      if (!bz) return math.drawHexagon(ctx, x, y, r, fill, stroke, 2.5);
      const cState = global.COSMOS_STATE || {};
      const zoom = cState.zoom || 1.0;
      const bgOp = style.bgOpacity !== undefined ? style.bgOpacity : (cState.tileBgOpacity ?? 0.20);
      const borderOp = style.borderOpacity !== undefined ? style.borderOpacity : (cState.tileBorderOpacity ?? 0.60);
      const verts = [0, 1, 2, 3, 4, 5].map(k => {
        const a = (Math.PI / 180) * (30 + 60 * k); return { x: x + r * Math.cos(a), y: y + r * Math.sin(a) };
      });
      bz.renderFrameBezel(ctx, verts, {
        bgColor: fill, bgOpacity: bgOp, strokeColor: stroke, strokeOpacity: borderOp,
        innerHighlight: {
          enabled: true, color: stroke, steps: cState.tileInnerSteps ?? 3,
          stepThickness: cState.tileStepThickness ?? 2.0,
          borderOpacity: borderOp, stepDecrement: cState.tileStepDecrement ?? 0.25,
          zoom, drawBoundaryLine: false
        }
      });
    }

    /**
     * Active Spell Halo FX delegate (delegates to WarpHaloRenderer cell)
     */
    drawSpellHalo(ctx, math, vertex, originX, originY, hexRadius, time, mode = 'warp') {
      if (global.WarpHaloRenderer?.render) {
        global.WarpHaloRenderer.render(ctx, math, vertex, originX, originY, hexRadius, time, mode);
      }
    }

    /**
     * Highlights 1 single tile at axial (q, r).
     */
    drawComponentCursor(ctx, math, q, r, originX, originY, hexRadius, style = {}) {
      if (!ctx || !math) return [];
      const { x, y } = math.hexToScreen(q, r, originX, originY, hexRadius);
      const stroke = style.strokeColor || '#ffffff';
      const fill = '#ffffff';
      const cState = global.COSMOS_STATE || {};
      const cursorStyle = {
        bgOpacity: Math.min(1.0, (cState.tileBgOpacity ?? 0.20) + 0.20),
        borderOpacity: Math.min(1.0, (cState.tileBorderOpacity ?? 0.60) + 0.20),
        ...style,
        bgColor: fill
      };

      ctx.save();
      this._drawBezelHex(ctx, math, x, y, hexRadius - 1.5, fill, stroke, cursorStyle);
      ctx.restore();
      return [`${q},${r}`];
    }

    /**
     * Highlights 3 mutual adjacent tiles meeting at a vertex.
     */
    drawSigilCursor(ctx, math, vertex, originX, originY, hexRadius, style = {}) {
      if (!ctx || !math || !vertex) return [];
      const cAlpha = style.cursorAlpha !== undefined ? style.cursorAlpha : 1.0;
      if (cAlpha <= 0.001) return [];
      const tiles = math.getVertexTiles ? math.getVertexTiles(vertex) : [];
      if (!tiles || tiles.length === 0) return [];

      const stroke = style.strokeColor || '#ffffff';
      const fill = style.fillColor || '#ffffff';
      const cState = global.COSMOS_STATE || {};
      const cursorStyle = {
        bgOpacity: Math.min(1.0, (cState.tileBgOpacity ?? 0.20) + 0.20) * cAlpha,
        borderOpacity: Math.min(1.0, (cState.tileBorderOpacity ?? 0.60) + 0.20) * cAlpha,
        ...style
      };

      ctx.save();
      tiles.forEach(tk => {
        const [tq, tr] = tk.split(',').map(Number);
        const { x, y } = math.hexToScreen(tq, tr, originX, originY, hexRadius);
        this._drawBezelHex(ctx, math, x, y, hexRadius - 1.5, fill, stroke, cursorStyle);
      });

      // Small vertex marker at mutual junction (Dual-Pass Alpha, Zero Gaussian shadowBlur)
      if (style.showVertexMarker !== false && math.vertexToScreen) {
        const vPos = math.vertexToScreen(vertex, originX, originY, hexRadius);
        ctx.save();
        ctx.globalAlpha = (ctx.globalAlpha || 1.0) * cAlpha * 0.30;
        ctx.beginPath();
        ctx.arc(vPos.x, vPos.y, 8.0, 0, Math.PI * 2);
        ctx.fillStyle = stroke;
        ctx.fill();
        ctx.globalAlpha = (ctx.globalAlpha || 1.0) * cAlpha;
        ctx.beginPath();
        ctx.arc(vPos.x, vPos.y, 4.2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      return tiles;
    }

    /**
     * Highlights 7 tiles forming a 1-ring hex flower zone (center + 6 neighbors).
     */
    drawFlowerCursor(ctx, math, centerQ, centerR, originX, originY, hexRadius, style = {}) {
      if (!ctx || !math) return [];
      const flowerTiles = style.tiles || (math.getFlowerTiles ? math.getFlowerTiles(centerQ, centerR) : []);
      if (!flowerTiles || flowerTiles.length === 0) return [];

      ctx.save();
      if (style.fillTiles) {
        const fill = style.fillColor || 'rgba(249, 115, 22, 0.20)';
        flowerTiles.forEach(tk => {
          const [fq, fr] = tk.split(',').map(Number);
          const { x, y } = math.hexToScreen(fq, fr, originX, originY, hexRadius);
          math.drawHexagon(ctx, x, y, hexRadius - 1.5, fill, null, 0);
        });
      }
      ctx.restore();
      return flowerTiles;
    }
  }

  const cursorRendererInstance = new BoardCursorRendererClass();
  global.BoardCursorRendererClass = BoardCursorRendererClass;
  global.BoardCursorRenderer = cursorRendererInstance;
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Board_Cursor_Renderer_1.0', cursorRendererInstance);
})(typeof window !== 'undefined' ? window : this);
