/**
 * @fileoverview cells/hex_ui/Hex_Bezel_Renderer.js - Visual Aesthetics, Glassmorphic Fills & Directional Highlights (Modular Showcase 5 Cell)
 * @description Renders background fills, sharp-edged inward-diffusing cavities, outward-radiating halos,
 * and dual-chromatic bezels on Canvas 2D.
 */

(function(global) {
  'use strict';

  function toSolidRgb(col, fallback = '#0f172a') {
    if (!col || typeof col !== 'string') return fallback;
    const trimmed = col.trim();
    if (trimmed.startsWith('#')) return trimmed;
    if (trimmed.startsWith('rgba') || trimmed.startsWith('rgb')) {
      const match = trimmed.match(/\d+/g);
      if (match && match.length >= 3) {
        return `rgb(${match[0]}, ${match[1]}, ${match[2]})`;
      }
    }
    return trimmed;
  }

  class HexBezelRendererClass {
    constructor() {}

    /**
     * Renders the complete background and bezel highlight stack for a HexFrame.
     * @param {CanvasRenderingContext2D} ctx - Target 2D canvas context.
     * @param {Array<{x: number, y: number}>} vertices - Array of local polygon vertices.
     * @param {Object} style - Visual styling configuration.
     */
    renderFrameBezel(ctx, vertices, style = {}) {
      this.renderFrameBackground(ctx, vertices, style);
      this.renderFrameBorders(ctx, vertices, style);
    }

    /**
     * Renders outer bloom and background fill (base layer under contents).
     */
    renderFrameBackground(ctx, vertices, style = {}) {
      if (!ctx || !vertices || vertices.length < 3) return;

      const geom = global.HexFrameGeometry;
      if (!geom) return;

      const bgColor = style.bgColor || '#0f172a';
      const bgOpacity = style.bgOpacity !== undefined ? style.bgOpacity : 0.45;
      const outer = style.outerHighlight || {};

      ctx.save();
      const baseAlpha = (ctx.globalAlpha !== undefined) ? ctx.globalAlpha : 1.0;
      if (baseAlpha <= 0.0001) { ctx.restore(); return; }

      // ======================================================================
      // 1. OUTER HIGHLIGHT PASS (Outward Bloom Snapped Adjacently to Frame)
      // ======================================================================
      if (outer.enabled) {
        ctx.save();
        const oColor = outer.color || '#c084fc';
        const oBlur = outer.blur !== undefined ? outer.blur : (outer.spread !== undefined ? outer.spread : (outer.reach !== undefined ? outer.reach : 16));
        const oIntensity = outer.intensity !== undefined ? outer.intensity : 0.8;
        const oSteps = Math.max(1, Math.round(outer.steps || 3));

        // Inverted Outer-Only Clip Mask (evenodd rule: masks out the polygon interior)
        // Snaps the outer border strictly adjacent to the frame perimeter with zero bleed inside
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < vertices.length; i++) {
          const v = vertices[i];
          if (v.x < minX) minX = v.x;
          if (v.x > maxX) maxX = v.x;
          if (v.y < minY) minY = v.y;
          if (v.y > maxY) maxY = v.y;
        }
        const reach = Math.max(oBlur, 1.0);
        const pad = reach * 2.0 + 80;
        ctx.beginPath();
        ctx.rect(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2);
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
          ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();
        ctx.clip('evenodd');

        // Multi-Step Concentric Halos (Equal divisions of total outer reach, matching inner border)
        ctx.strokeStyle = oColor;
        const topAlpha = Math.min(1.0, oIntensity * 1.0);
        const lowAlpha = Math.min(1.0, oIntensity * 0.25);
        geom.buildPath(ctx, vertices);
        for (let s = oSteps; s >= 1; s--) {
          const stepRatio = s / oSteps;
          ctx.lineWidth = reach * stepRatio * 2.0; // Half clipped inside polygon
          const alphaRatio = oSteps > 1 ? (s - 1) / (oSteps - 1) : 1.0;
          ctx.globalAlpha = baseAlpha * (topAlpha + alphaRatio * (lowAlpha - topAlpha));
          ctx.stroke();
        }

        ctx.restore(); // Restore outer clip
      }

      // ======================================================================
      // 2. BACKGROUND FILL PASS (Full 0% to 100% Opacity Scaling)
      // ======================================================================
      if (bgOpacity > 0.001) {
        ctx.save();
        geom.buildPath(ctx, vertices);
        ctx.globalAlpha = baseAlpha * Math.min(1.0, Math.max(0.0, bgOpacity));
        ctx.fillStyle = toSolidRgb(bgColor, '#0f172a');
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();
    }

    /**
     * Renders inner highlight and perimeter stroke (top layer over contents).
     */
    renderFrameBorders(ctx, vertices, style = {}) {
      if (!ctx || !vertices || vertices.length < 3) return;

      const geom = global.HexFrameGeometry;
      if (!geom) return;

      const inner = style.innerHighlight || {};
      const outer = style.outerHighlight || {};

      ctx.save();
      const baseAlpha = (ctx.globalAlpha !== undefined) ? ctx.globalAlpha : 1.0;
      if (baseAlpha <= 0.0001) { ctx.restore(); return; }

      // ======================================================================
      // 3. INNER HIGHLIGHT PASS (Inward Glow with Sharp Outer Boundary)
      // ======================================================================
      if (inner.enabled) {
        ctx.save();
        // Clip strictly to the frame polygon interior
        geom.buildPath(ctx, vertices);
        ctx.clip();

        const iColor = inner.color || '#38bdf8';
        const zoom = inner.zoom !== undefined ? inner.zoom : (inner.scale !== undefined ? inner.scale : 1.0);
        const steps = Math.max(1, Math.round(inner.steps || 3));

        if (inner.stepThickness !== undefined) {
          // Option A: Width added per step, locked to grid zoom; layer 1 is perimeter border
          const stepW = inner.stepThickness * zoom;
          const borderOp = inner.borderOpacity !== undefined ? inner.borderOpacity : (inner.intensity || 0.50);
          const stepDec = inner.stepDecrement !== undefined ? inner.stepDecrement : 0.10;
          ctx.strokeStyle = iColor;
          geom.buildPath(ctx, vertices);
          for (let s = steps; s >= 1; s--) {
            ctx.lineWidth = s * stepW * 2.0; // Half clipped inside polygon
            ctx.globalAlpha = baseAlpha * Math.max(0, borderOp - (s - 1) * stepDec);
            ctx.stroke();
          }
        } else {
          // Inward glow spread (3 diffusion passes)
          const fade = (inner.fade !== undefined ? inner.fade : (inner.lowestWidth !== undefined ? inner.lowestWidth : (inner.spread !== undefined ? inner.spread : 14))) * zoom;
          if (fade > 0.001) {
            ctx.strokeStyle = iColor;
            const topAlpha = inner.topOpacity !== undefined ? inner.topOpacity : (inner.sharpOpacity !== undefined ? inner.sharpOpacity : (inner.intensity || 0.65));
            const lowAlpha = inner.lowestOpacity !== undefined ? inner.lowestOpacity : (topAlpha * 0.25);
            geom.buildPath(ctx, vertices);
            for (let s = steps; s >= 1; s--) {
              const stepRatio = s / steps;
              ctx.lineWidth = fade * stepRatio * 2.0;
              const alphaRatio = steps > 1 ? (s - 1) / (steps - 1) : 1.0;
              ctx.globalAlpha = baseAlpha * (topAlpha + alphaRatio * (lowAlpha - topAlpha));
              ctx.stroke();
            }
          }
        }

        ctx.restore(); // Restore clip
      }

      // Base Perimeter Stroke (Fallback / Core Definition)
      if (!inner.enabled && !outer.enabled && style.strokeColor) {
        ctx.save();
        geom.buildPath(ctx, vertices);
        ctx.strokeStyle = style.strokeColor;
        ctx.globalAlpha = baseAlpha * (style.strokeOpacity !== undefined ? style.strokeOpacity : 0.8);
        ctx.lineWidth = style.lineWidth || 1.5;
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }
  }

  const instance = new HexBezelRendererClass();
  global.HexBezelRenderer = instance;
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Hex_Bezel_Renderer', instance);
  }
})(typeof window !== 'undefined' ? window : this);
