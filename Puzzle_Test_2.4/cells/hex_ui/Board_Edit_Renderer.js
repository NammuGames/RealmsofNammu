/**
 * @fileoverview cells/hex_ui/Board_Edit_Renderer.js - Isolated Cursor & Preview Renderer for Board Edit Mode
 * @description Hooks cleanly onto BoardCursorRenderer, BoardGhostRenderer, and BoardOverlayRenderer
 * while BoardEditLab.active is true to render the Weave-style component cursor, Erase reticle,
 * Arch flower preview + plasma arcs, and Sigil vertex reticle without editing core render cells.
 */

(function(global) {
  'use strict';

  const ENCH_COLORS = {
    burn: '#ef4444',
    phase: '#2563eb',
    fortify: '#c084fc',
    weave: '#fde047'
  };

  class BoardEditRendererClass {
    constructor() {
      this._installed = false;
    }

    init() {
      if (this._installed) return;
      this._installed = true;

      const wrap = (obj, name, fn) => {
        if (!obj || typeof obj[name] !== 'function') return;
        const orig = obj[name];
        obj[name] = function(...args) { return fn.call(this, orig, ...args); };
      };

      wrap(global.BoardGhostRenderer, 'drawPlacementGhost', function(orig, ctx, math, data, ox, oy, hr, elapsedTime, options = {}) {
        const lab = global.BoardEditLab;
        if (lab?.active) {
          if (lab.tool === 'component' || lab.tool === 'erase') {
            global.BoardEditRenderer.renderCursorOverlay(ctx, math, ox, oy, hr, elapsedTime, options);
          }
          return; // Suppress normal tray tetrahex ghost while editing
        }
        return orig.call(this, ctx, math, data, ox, oy, hr, elapsedTime, options);
      });

      wrap(global.BoardCursorRenderer, 'drawCursors', function(orig, ctx, math, data, ox, oy, hr, pulseTime = 0) {
        const lab = global.BoardEditLab;
        if (!lab?.active) {
          return orig.call(this, ctx, math, data, ox, oy, hr, pulseTime);
        }
        if (lab.tool === 'arch') {
          global.BoardEditRenderer.renderArchCursor(this, ctx, math, ox, oy, hr);
        } else if (lab.tool === 'sigil' && global.GameState?.sigilCursorVertex) {
          this.drawSigilCursor(ctx, math, global.GameState.sigilCursorVertex, ox, oy, hr, {
            strokeColor: '#38bdf8',
            fillColor: '#ffffff',
            lineWidth: 3.5,
            cursorAlpha: 1.0
          });
        }
      });

      wrap(global.BoardOverlayRenderer, 'drawAlignments', function(orig, ctx, math, ox, oy, hr, pulseTime = 0, layer = 'all') {
        const lab = global.BoardEditLab;
        const state = global.GameState;
        if (lab?.active && lab.tool === 'arch' && state?.board?.has(`${lab.cursor.q},${lab.cursor.r}`) && (layer === 'all' || layer === 'plasma' || layer === 'aurora_plasma')) {
          const exists = state.archZones?.some(z => z.center && z.center.q === lab.cursor.q && z.center.r === lab.cursor.r);
          if (!exists) {
            const arch = global.SpellArch;
            const c = lab.cursor;
            const tiles = arch?.getFlowerTilesFor ? arch.getFlowerTilesFor(c.q, c.r) : (math?.getFlowerTiles ? math.getFlowerTiles(c.q, c.r) : []);
            const ench = arch?.getArchEnchantmentAt ? arch.getArchEnchantmentAt(c.q, c.r) : null;
            const saved = state.archZones || [];
            state.archZones = [...saved, { id: 'preview_edit_arch', center: { ...c }, flowerTiles: tiles, allZoneTiles: tiles, enchantment: ench }];
            try {
              return orig.call(this, ctx, math, ox, oy, hr, pulseTime, layer);
            } finally {
              state.archZones = saved;
            }
          }
        }
        return orig.call(this, ctx, math, ox, oy, hr, pulseTime, layer);
      });
    }

    renderArchCursor(cursorRenderer, ctx, math, ox, oy, hr) {
      const lab = global.BoardEditLab;
      const state = global.GameState;
      const arch = global.SpellArch;
      if (!lab || !state || !math || !cursorRenderer) return;
      const c = lab.cursor;
      const valid = !!(state.board?.has(`${c.q},${c.r}`));
      const flowerTiles = arch?.getFlowerTilesFor
        ? arch.getFlowerTilesFor(c.q, c.r)
        : (math.getFlowerTiles ? math.getFlowerTiles(c.q, c.r) : []);
      const stroke = valid ? '#f97316' : '#ef4444';
      cursorRenderer.drawFlowerCursor(ctx, math, c.q, c.r, ox, oy, hr, {
        strokeColor: stroke,
        fillColor: valid ? 'rgba(249, 115, 22, 0.16)' : 'rgba(239, 68, 68, 0.25)',
        fillTiles: true,
        tiles: flowerTiles
      });
      cursorRenderer.drawComponentCursor(ctx, math, c.q, c.r, ox, oy, hr, { strokeColor: stroke });
    }

    renderCursorOverlay(ctx, math, ox, oy, hr, elapsedTime, options = {}) {
      const lab = global.BoardEditLab;
      const state = global.GameState;
      if (!lab || !state || !math) return;

      const { q, r } = lab.cursor;
      const { x, y } = math.hexToScreen(q, r, ox, oy, hr);
      const effR = hr - 1.5;
      const cState = global.COSMOS_STATE || {};
      const backBgOp = Math.min(1.0, (cState.tileBgOpacity ?? 0.20) + 0.20);
      const backBorderOp = Math.min(1.0, (cState.tileBorderOpacity ?? 0.60) + 0.20);
      const ghostBgOp = options.ghostBgOp ?? Math.min(1.0, backBgOp + 0.20);
      const ghostBorderOp = options.ghostBorderOp ?? Math.min(1.0, backBorderOp + 0.20);

      const drawBezel = (typeof options.drawBezelHex === 'function')
        ? options.drawBezelHex
        : (hx, hy, rad, fill, stroke, bgO, bdrO) => global.BoardGhostRenderer?._drawBezelHex(ctx, math, hx, hy, rad, fill, stroke, bgO, bdrO);

      const isInside = state.isInsideBoard ? state.isInsideBoard(q, r) : true;

      if (lab.tool === 'erase') {
        drawBezel(x, y, effR, '#f43f5e', '#f43f5e', ghostBgOp * 0.85, ghostBorderOp);
        const crossR = hr * 0.28;
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - crossR, y - crossR); ctx.lineTo(x + crossR, y + crossR);
        ctx.moveTo(x + crossR, y - crossR); ctx.lineTo(x - crossR, y + crossR);
        ctx.stroke();
        ctx.restore();
        return;
      }

      // Component Cursor (Weave-style hovering polyhedron + bezel, disease unaffected by enchantments)
      const comp = lab.getCurrentComponent();
      let col = '#22c55e';
      if (comp === 'disease') col = '#64748b';
      else if (lab.enchantment && ENCH_COLORS[lab.enchantment]) col = ENCH_COLORS[lab.enchantment];
      else if (!isInside) col = '#94a3b8';

      const bgCol = comp === 'disease' ? '#64748b' : (isInside ? col : '#64748b');
      drawBezel(x, y, effR, bgCol, col, ghostBgOp, ghostBorderOp);

      if (global.PolyhedronRenderer?.drawComponent) {
        const unplacedScale = cState.unplacedScale || 0.90;
        const sp = (Math.abs(Math.sin(q * 12.9898 + r * 78.233) * 43758.5453)) % 1.0;
        const st = (Math.abs(Math.cos(q * 39.346 + r * 11.135) * 24634.6345)) % 1.0;
        global.PolyhedronRenderer.drawComponent(ctx, x, y, hr * unplacedScale, comp, elapsedTime, false, false, 1.0, sp, st);
      }

      if (!isInside) {
        drawBezel(x, y, effR, '#64748b', '#94a3b8', options.pGreyBg ?? backBgOp, options.pGreyBorder ?? backBorderOp);
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }
  }

  const instance = new BoardEditRendererClass();
  global.BoardEditRenderer = instance;
  global.ROLL_CALL = global.ROLL_CALL || new Map();
  global.ROLL_CALL.set('Board_Edit_Renderer', instance);

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => instance.init());
  }

})(typeof window !== 'undefined' ? window : this);
