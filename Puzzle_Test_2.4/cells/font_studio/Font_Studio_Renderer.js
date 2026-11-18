/**
 * @fileoverview cells/font_studio/Font_Studio_Renderer.js - Primitive Geometry & Additive Blending Engine
 * @description Computes 2x3 overlapping square grid metrics, renders straight lines, circles,
 * half arcs, quarter arcs, and dots, and combines them additively into a unified seamless cyber silhouette.
 */

(function(global) {
  'use strict';

  class FontStudioRendererClass {
    constructor() {
      // Offscreen buffer for additive silhouette compositing
      this.offCanvas = null;
      this.offCtx = null;
      this.bufferSize = 512;
      this.initOffscreenBuffer();
    }

    initOffscreenBuffer() {
      if (typeof document !== 'undefined') {
        this.offCanvas = document.createElement('canvas');
        this.offCanvas.width = this.bufferSize;
        this.offCanvas.height = this.bufferSize;
        this.offCtx = this.offCanvas.getContext('2d');
      }
    }

    /**
     * Computes the mathematical 2x3 grid metrics based on square size and 1/24 lattice units.
     */
    getGridMetrics(squareSize = 64, overlapUnits = 2) {
      const S = squareSize;
      const u = S / 24; // 1 unit in the 1/24 lattice

      // overlapUnits is in integer lattice units (default 2 units = 2/24 = S/12)
      let kO = (overlapUnits > 8) ? Math.round((overlapUnits / S) * 24) : overlapUnits;
      kO = Math.max(2, Math.min(8, Math.round(kO || 2)));

      const O = kO * u;
      const W_units = 48 - kO;
      const H_units = 72 - 2 * kO;
      const W = W_units * u;
      const H = H_units * u;

      // 6 discrete square cell centers (c in [0, 1], r in [0, 1, 2])
      const stepX = (24 - kO) * u;
      const stepY = (24 - kO) * u;
      const cellCenters = [
        [ { x: -stepX * 0.5, y: -stepY }, { x: +stepX * 0.5, y: -stepY } ], // Row 0
        [ { x: -stepX * 0.5, y: 0 },      { x: +stepX * 0.5, y: 0 } ],      // Row 1
        [ { x: -stepX * 0.5, y: +stepY }, { x: +stepX * 0.5, y: +stepY } ]  // Row 2
      ];

      // 5 Vertical Snap Lanes (X coordinates)
      const vertLanes = [
        -W * 0.5 + O * 0.5, // 0: Left outer channel
        -stepX * 0.5,       // 1: Col 0 mid-square
        0,                  // 2: Center overlap channel
        +stepX * 0.5,       // 3: Col 1 mid-square
        +W * 0.5 - O * 0.5  // 4: Right outer channel
      ];

      // 4 Horizontal Snap Lanes (Y coordinates)
      const horizLanes = [
        -H * 0.5 + O * 0.5, // 0: Top outer channel
        -stepY * 0.5,       // 1: Waistline 1 overlap channel
        +stepY * 0.5,       // 2: Waistline 2 overlap channel
        +H * 0.5 - O * 0.5  // 3: Bottom outer channel
      ];

      return { S, O, u, kO, W_units, H_units, W, H, stepX, stepY, cellCenters, vertLanes, horizLanes };
    }

    /**
     * Renders faint dashed grid boundaries and glowing overlap channels.
     */
    renderGridGuides(ctx, cx, cy, metrics, activeCell = null) {
      const { S, O, W, H, cellCenters, horizLanes } = metrics;
      ctx.save();
      ctx.translate(cx, cy);

      // 1. Grid Outer Boundary Frame
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.20)';
      ctx.lineWidth = 1.0;
      ctx.strokeRect(-W * 0.5, -H * 0.5, W, H);

      // 2. Overlap Channels Ambient Tint (Center, Waistline 1, Waistline 2)
      ctx.fillStyle = 'rgba(56, 189, 248, 0.05)';
      // Center vertical overlap strip
      ctx.fillRect(-O * 0.5, -H * 0.5, O, H);
      // Waistline 1 overlap strip
      ctx.fillRect(-W * 0.5, horizLanes[1] - O * 0.5, W, O);
      // Waistline 2 overlap strip
      ctx.fillRect(-W * 0.5, horizLanes[2] - O * 0.5, W, O);

      // 3. 6 Square Tiles Dashed Wireframes
      ctx.setLineDash([3, 4]);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 2; c++) {
          const center = cellCenters[r][c];
          const isAct = (activeCell && activeCell.col === c && activeCell.row === r);
          ctx.strokeStyle = isAct ? 'rgba(56, 189, 248, 0.70)' : 'rgba(255, 255, 255, 0.12)';
          ctx.lineWidth = isAct ? 1.5 : 0.8;
          ctx.strokeRect(center.x - S * 0.5, center.y - S * 0.5, S, S);

          // Subtle center crosshair
          ctx.fillStyle = isAct ? '#38bdf8' : 'rgba(255, 255, 255, 0.25)';
          ctx.beginPath();
          ctx.arc(center.x, center.y, isAct ? 2.5 : 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.setLineDash([]);

      // 4. Overlap Guide Hairlines
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.25)'; // Soft amber channels
      ctx.lineWidth = 0.8;
      // Center vertical overlap lane edges
      ctx.beginPath();
      ctx.moveTo(-O * 0.5, -H * 0.5); ctx.lineTo(-O * 0.5, H * 0.5);
      ctx.moveTo(+O * 0.5, -H * 0.5); ctx.lineTo(+O * 0.5, H * 0.5);
      ctx.stroke();

      // 5. Baseline Guide Rule (Underside of Middle Squares at y = S * 0.5)
      const baselineY = S * 0.5;
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.55)'; // Distinct rose baseline guide
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-W * 0.5, baselineY);
      ctx.lineTo(+W * 0.5, baselineY);
      ctx.stroke();

      ctx.restore();
    }

    /**
     * Draws a single primitive stroke into the specified 2D context.
     */
    drawStrokePath(ctx, stroke, metrics, dotDiameter = 22) {
      if (!stroke) return;
      const { S, O, u, W_units, H_units, W, H, cellCenters, vertLanes, horizLanes } = metrics;

      ctx.save();
      ctx.lineWidth = O;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';

      switch (stroke.part) {
        case 'line': {
          const axis = stroke.axis || 'vert';
          const maxUnits = axis === 'vert' ? H_units : W_units;
          let t0 = stroke.tStart !== undefined ? stroke.tStart : 0;
          let t1 = stroke.tEnd !== undefined ? stroke.tEnd : maxUnits;
          if (t0 <= 3.0 && t1 <= 3.0 && maxUnits > 3) {
            const span = axis === 'vert' ? 3.0 : 2.0;
            t0 = (t0 / span) * maxUnits;
            t1 = (t1 / span) * maxUnits;
          }

          if (axis === 'vert') {
            const laneIdx = Math.max(0, Math.min(4, stroke.laneIndex || 0));
            const lx = vertLanes[laneIdx];
            const y0 = -H * 0.5 + t0 * u;
            const y1 = -H * 0.5 + t1 * u;
            const topY = Math.min(y0, y1);
            const botY = Math.max(y0, y1);
            ctx.fillRect(lx - O * 0.5, topY, O, Math.max(1, botY - topY));
          } else {
            const laneIdx = Math.max(0, Math.min(3, stroke.laneIndex || 0));
            const ly = horizLanes[laneIdx];
            const x0 = -W * 0.5 + t0 * u;
            const x1 = -W * 0.5 + t1 * u;
            const leftX = Math.min(x0, x1);
            const rightX = Math.max(x0, x1);
            ctx.fillRect(leftX, ly - O * 0.5, Math.max(1, rightX - leftX), O);
          }
          break;
        }

        case 'circle': {
          const col = Math.max(0, Math.min(1, stroke.col !== undefined ? stroke.col : 0));
          const row = Math.max(0, Math.min(2, stroke.row !== undefined ? stroke.row : 0));
          const stepDistX = metrics.stepX || (S - O);
          const stepDistY = metrics.stepY || (S - O);
          const cx = (col - 0.5) * stepDistX;
          const cy = (row - 1.0) * stepDistY;
          const radius = (S - O) * 0.5;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }

        case 'half_arc':
        case 'quarter_circle': {
          const col = Math.max(0, Math.min(1, stroke.col !== undefined ? stroke.col : 0));
          const row = Math.max(0, Math.min(2, stroke.row !== undefined ? stroke.row : 0));
          const stepDistX = metrics.stepX || (S - O);
          const stepDistY = metrics.stepY || (S - O);
          const cx = (col - 0.5) * stepDistX;
          const cy = (row - 1.0) * stepDistY;
          const radius = (S - O) * 0.5;
          const rot = stroke.rotation || 0;

          // Angles: 0°: Right (-PI/2), 90°: Down (0), 180°: Left (PI/2), 270°: Up (PI)
          const startAngle = (rot - 90) * (Math.PI / 180);
          const sweep = stroke.part === 'quarter_circle' ? Math.PI * 0.5 : Math.PI;

          ctx.beginPath();
          ctx.arc(cx, cy, radius, startAngle, startAngle + sweep);
          ctx.stroke();
          break;
        }

        case 'quarter_arc': {
          const col = Math.max(0, Math.min(1, stroke.col !== undefined ? stroke.col : 0));
          const row = Math.max(0, Math.min(2, stroke.row !== undefined ? stroke.row : 0));
          const stepDistX = metrics.stepX || (S - O);
          const stepDistY = metrics.stepY || (S - O);
          const cx = (col - 0.5) * stepDistX;
          const cy = (row - 1.0) * stepDistY;
          const radius = S - O * 0.5;
          const rot = stroke.rotation || 0;

          // Four corner sweeps across the cell
          let cornerX = cx, cornerY = cy;
          let aStart = 0, aEnd = Math.PI * 0.5;

          if (rot === 0) {
            // Facing Top-Right (origin at Bottom-Left corner)
            cornerX = cx - S * 0.5;
            cornerY = cy + S * 0.5;
            aStart = -Math.PI * 0.5;
            aEnd = 0;
          } else if (rot === 90) {
            // Facing Bottom-Right (origin at Top-Left corner)
            cornerX = cx - S * 0.5;
            cornerY = cy - S * 0.5;
            aStart = 0;
            aEnd = Math.PI * 0.5;
          } else if (rot === 180) {
            // Facing Bottom-Left (origin at Top-Right corner)
            cornerX = cx + S * 0.5;
            cornerY = cy - S * 0.5;
            aStart = Math.PI * 0.5;
            aEnd = Math.PI;
          } else {
            // Facing Top-Left (origin at Bottom-Right corner)
            cornerX = cx + S * 0.5;
            cornerY = cy + S * 0.5;
            aStart = Math.PI;
            aEnd = Math.PI * 1.5;
          }

          ctx.beginPath();
          ctx.arc(cornerX, cornerY, radius, aStart, aEnd);
          ctx.stroke();
          break;
        }

        case 'dot': {
          const col = Math.max(0, Math.min(1, stroke.col !== undefined ? stroke.col : 0));
          const row = Math.max(0, Math.min(2, stroke.row !== undefined ? stroke.row : 0));
          const stepDistX = metrics.stepX || (S - O);
          const stepDistY = metrics.stepY || (S - O);
          const cx = (col - 0.5) * stepDistX;
          const cy = (row - 1.0) * stepDistY;
          const r = Math.max(2, dotDiameter * 0.5);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }

      ctx.restore();
    }

    /**
     * Additive Blending Composite Pipeline:
     * 1. Draws all strokes in solid pure white into offscreen buffer (source-over union).
     * 2. Blits buffer to destination canvas with deep cavity fill, cyber glow, and neon perimeter.
     */
    renderGlyphSilhouette(ctx, cx, cy, strokes, metrics, dotDiameter = 22, activeIndex = -1) {
      if (!this.offCanvas || !this.offCtx) return;
      const bSize = this.bufferSize;
      const halfB = bSize * 0.5;

      // Clear offscreen composite buffer
      this.offCtx.clearRect(0, 0, bSize, bSize);
      this.offCtx.save();
      this.offCtx.translate(halfB, halfB);
      this.offCtx.fillStyle = '#ffffff';
      this.offCtx.strokeStyle = '#ffffff';

      // 1. Render all strokes additively (seamless pixel union)
      for (let i = 0; i < strokes.length; i++) {
        this.drawStrokePath(this.offCtx, strokes[i], metrics, dotDiameter);
      }
      this.offCtx.restore();

      // 2. Composite onto Target Stage
      ctx.save();
      ctx.translate(cx, cy);

      // Pass A: Outer Neon Cyan Aura Glow
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 14;
      ctx.drawImage(this.offCanvas, -halfB, -halfB);

      // Pass B: Solid Cyber Cavity Base Fill
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.offCanvas, -halfB, -halfB);

      // 3. Highlight Active Stroke Handles / Boundary (if editing)
      if (activeIndex >= 0 && activeIndex < strokes.length) {
        const actStroke = strokes[activeIndex];
        ctx.strokeStyle = '#f59e0b'; // Radiant amber marker
        ctx.fillStyle = '#f59e0b';
        ctx.lineWidth = 2.0;
        ctx.setLineDash([4, 3]);
        this.drawStrokePath(ctx, actStroke, metrics, dotDiameter);
        ctx.setLineDash([]);
      }

      ctx.restore();
    }

    /**
     * Fast Scaled Mini Preview for Sidebar Glyph Slots and Gallery Pods.
     */
    renderGlyphMini(ctx, glyph, cx, cy, boxSize = 44, color = '#38bdf8') {
      const strokes = glyph?.strokes;
      if (!strokes || strokes.length === 0) return;

      const data = global.FontStudioData;
      const overlapUnits = data?.config?.squareOverlap || 2;
      const baseMetrics = this.getGridMetrics(48, overlapUnits);
      const isWide = data?.isWideGlyph ? data.isWideGlyph(glyph) : true;
      const hasDesc = data?.hasDescender ? data.hasDescender(glyph) : false;

      // Active bounds excluding unused squares
      const activeWidth = isWide ? baseMetrics.W : (baseMetrics.S - baseMetrics.O * 0.5);
      const activeHeight = hasDesc ? baseMetrics.H : (baseMetrics.H - (baseMetrics.S - baseMetrics.O));
      const scale = (boxSize * 0.85) / Math.max(activeWidth, activeHeight);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);

      // Optical centering: if single column, center on Col 0; if no descender, center above baseline
      const offsetX = isWide ? 0 : ((baseMetrics.S - baseMetrics.O) * 0.5);
      const offsetY = hasDesc ? 0 : ((baseMetrics.S - baseMetrics.O) * 0.5);
      ctx.translate(offsetX, offsetY);

      ctx.fillStyle = color;
      ctx.strokeStyle = color;

      for (let i = 0; i < strokes.length; i++) {
        this.drawStrokePath(ctx, strokes[i], baseMetrics, 16);
      }

      ctx.restore();
    }
  }

  const instance = new FontStudioRendererClass();
  global.FontStudioRenderer = instance;
  if (global.ROLL_CALL?.set) global.ROLL_CALL.set('Font_Studio_Renderer', instance);
})(typeof window !== 'undefined' ? window : this);
