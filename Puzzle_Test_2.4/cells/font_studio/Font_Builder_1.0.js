/**
 * @fileoverview cells/font_studio/Font_Builder_1.0.js - OpenType Contour Primitives
 * @description Converts Aetheria 1/24 lattice strokes (lines, circles, half arcs, quarter circles,
 * quarter arcs, dots) into cubic Bezier and TrueType contours.
 */

(function(global) {
  'use strict';

  class FontBuilderClass {
    constructor() {
      this.fontFamily = 'SciFae Pseudo Script 1.0';
      this.fontStyle = 'Regular';
      this.unitsPerEm = 1000;
      this.ascender = 750;
      this.descender = -250;
      this.isApplied = false;
      this.cachedBuffer = null;
    }

    init() {
      return this;
    }

    /**
     * Converts mathematical Aetheria stroke primitives into OpenType vector path contours.
     */
    strokeToOpenTypeContours(stroke, path, metrics, typoMetrics, UPM = 1000) {
      if (!stroke || !path) return;
      const { S, O, u, W, H, cellCenters, vertLanes, horizLanes, W_units, H_units } = metrics;

      // Coordinate scale factor: maps 2-square cap height (W) to standard 720 font units
      const capH = W || (S * 2 - O);
      const scale = 720 / capH;
      const baselineY = S * 0.5; // Row 1 bottom is canvas baseline

      // Symmetrically centers both single-width (center 280 in 560) and wide (center 440 in 880)
      const cxCenter = typoMetrics.isWide ? 0 : (-0.5 * (metrics.stepX || (S - O)));
      const targetCenter = typoMetrics.isWide ? 440 : 280;
      const toFontX = (cx) => Math.round((cx - cxCenter) * scale + targetCenter);
      const toFontY = (cy) => Math.round((baselineY - cy) * scale);
      const toFontDist = (d) => Math.max(1, Math.round(d * scale));

      const strokeW = toFontDist(O);

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
            const cy0 = -H * 0.5 + Math.min(t0, t1) * u;
            const cy1 = -H * 0.5 + Math.max(t0, t1) * u;

            const fx0 = toFontX(lx - O * 0.5);
            const fx1 = fx0 + strokeW;
            const fyTop = toFontY(cy0);
            const fyBot = toFontY(cy1);

            // Clockwise contour (TrueType standard & matching arc winding)
            path.moveTo(fx0, fyTop);
            path.lineTo(fx1, fyTop);
            path.lineTo(fx1, fyBot);
            path.lineTo(fx0, fyBot);
            path.close();
          } else {
            const laneIdx = Math.max(0, Math.min(3, stroke.laneIndex || 0));
            const ly = horizLanes[laneIdx];
            const cx0 = -W * 0.5 + Math.min(t0, t1) * u;
            const cx1 = -W * 0.5 + Math.max(t0, t1) * u;

            const fx0 = toFontX(cx0);
            const fx1 = toFontX(cx1);
            const fyCenter = toFontY(ly);
            const fyTop = fyCenter + Math.round(strokeW * 0.5);
            const fyBot = fyCenter - Math.round(strokeW * 0.5);

            // Clockwise contour (TrueType standard & matching arc winding)
            path.moveTo(fx0, fyTop);
            path.lineTo(fx1, fyTop);
            path.lineTo(fx1, fyBot);
            path.lineTo(fx0, fyBot);
            path.close();
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

          const fcx = toFontX(cx);
          const fcy = toFontY(cy);
          const rOuter = toFontDist((S - O) * 0.5 + O * 0.5);
          const rInner = Math.max(1, toFontDist((S - O) * 0.5 - O * 0.5));

          // Outer circle (clockwise)
          this.addCircleContour(path, fcx, fcy, rOuter, true);
          // Inner hole (counter-clockwise)
          this.addCircleContour(path, fcx, fcy, rInner, false);
          break;
        }

        case 'half_arc':
        case 'quarter_circle': {
          const col = Math.max(0, Math.min(1, stroke.col !== undefined ? stroke.col : 0));
          const row = Math.max(0, Math.min(2, stroke.row !== undefined ? stroke.row : 0));
          const stepDistX = metrics.stepX || (S - O), stepDistY = metrics.stepY || (S - O);
          const cx = (col - 0.5) * stepDistX, cy = (row - 1.0) * stepDistY;
          const fcx = toFontX(cx), fcy = toFontY(cy);
          const rOuter = toFontDist((S - O) * 0.5 + O * 0.5);
          const rInner = Math.max(1, toFontDist((S - O) * 0.5 - O * 0.5));
          const rot = stroke.rotation || 0;
          const sweepDeg = stroke.part === 'quarter_circle' ? -90 : -180;
          this.addSmoothArcRibbon(path, fcx, fcy, rOuter, rInner, 90 - rot, sweepDeg);
          break;
        }

        case 'quarter_arc': {
          const col = Math.max(0, Math.min(1, stroke.col !== undefined ? stroke.col : 0));
          const row = Math.max(0, Math.min(2, stroke.row !== undefined ? stroke.row : 0));
          const stepDistX = metrics.stepX || (S - O);
          const stepDistY = metrics.stepY || (S - O);
          const cx = (col - 0.5) * stepDistX;
          const cy = (row - 1.0) * stepDistY;

          let cornerX = cx, cornerY = cy;
          let fontStartDeg = 90;
          const rot = stroke.rotation || 0;

          if (rot === 0) {
            cornerX = cx - S * 0.5; cornerY = cy + S * 0.5; fontStartDeg = 90;
          } else if (rot === 90) {
            cornerX = cx - S * 0.5; cornerY = cy - S * 0.5; fontStartDeg = 0;
          } else if (rot === 180) {
            cornerX = cx + S * 0.5; cornerY = cy - S * 0.5; fontStartDeg = 270;
          } else {
            cornerX = cx + S * 0.5; cornerY = cy + S * 0.5; fontStartDeg = 180;
          }

          const fcx = toFontX(cornerX);
          const fcy = toFontY(cornerY);
          const rOuter = toFontDist(S);
          const rInner = Math.max(1, toFontDist(S - O));

          this.addSmoothArcRibbon(path, fcx, fcy, rOuter, rInner, fontStartDeg, -90);
          break;
        }

        case 'dot': {
          const col = Math.max(0, Math.min(1, stroke.col !== undefined ? stroke.col : 0));
          const row = Math.max(0, Math.min(2, stroke.row !== undefined ? stroke.row : 0));
          const stepDistX = metrics.stepX || (S - O);
          const stepDistY = metrics.stepY || (S - O);
          const cx = (col - 0.5) * stepDistX;
          const cy = (row - 1.0) * stepDistY;
          const dotD = global.FontStudioData?.config?.dotDiameter || 18;
          const r = toFontDist(dotD * 0.5);

          this.addCircleContour(path, toFontX(cx), toFontY(cy), r, true);
          break;
        }
      }
    }

    /**
     * Approximates full circular contours using standard 4-cubic bezier arcs.
     */
    addCircleContour(path, cx, cy, r, clockwise = true) {
      const k = 0.5522847498 * r;
      const x0 = Math.round(cx), y0 = Math.round(cy);
      const r_int = Math.round(r), k_int = Math.round(k);
      if (clockwise) {
        path.moveTo(x0, y0 + r_int);
        path.curveTo(x0 + k_int, y0 + r_int, x0 + r_int, y0 + k_int, x0 + r_int, y0);
        path.curveTo(x0 + r_int, y0 - k_int, x0 + k_int, y0 - r_int, x0, y0 - r_int);
        path.curveTo(x0 - k_int, y0 - r_int, x0 - r_int, y0 - k_int, x0 - r_int, y0);
        path.curveTo(x0 - r_int, y0 + k_int, x0 - k_int, y0 + r_int, x0, y0 + r_int);
      } else {
        path.moveTo(x0, y0 + r_int);
        path.curveTo(x0 - k_int, y0 + r_int, x0 - r_int, y0 + k_int, x0 - r_int, y0);
        path.curveTo(x0 - r_int, y0 - k_int, x0 - k_int, y0 - r_int, x0, y0 - r_int);
        path.curveTo(x0 + k_int, y0 - r_int, x0 + r_int, y0 - k_int, x0 + r_int, y0);
        path.curveTo(x0 + r_int, y0 + k_int, x0 + k_int, y0 + r_int, x0, y0 + r_int);
      }
      path.close();
    }

    /**
     * Generates a thick arc ribbon contour using true cubic Bezier curves (smooth circles, zero flat facets).
     * @param {opentype.Path} path
     * @param {number} cx - Center X in font units
     * @param {number} cy - Center Y in font units
     * @param {number} rOut - Outer radius in font units
     * @param {number} rIn - Inner radius in font units
     * @param {number} startDeg - Start angle in font degrees (0 = +X, 90 = +Y, 180 = -X, 270 = -Y)
     * @param {number} sweepDeg - Sweep angle in degrees (negative for clockwise in Y-up font space)
     */
    addSmoothArcRibbon(path, cx, cy, rOut, rIn, startDeg, sweepDeg) {
      const toRad = Math.PI / 180;
      const totalSweepRad = sweepDeg * toRad;
      const startRad = startDeg * toRad;
      const endRad = startRad + totalSweepRad;

      // Subdivide sweep into segments of at most 90 degrees for optimal cubic bezier approximation
      const absSweep = Math.abs(totalSweepRad);
      const numSegments = Math.max(1, Math.ceil(absSweep / (Math.PI * 0.5 + 1e-4)));
      const segSweep = totalSweepRad / numSegments;
      const k = (4 / 3) * Math.tan(segSweep / 4);

      // 1. Move to Outer Arc Start
      const ox0 = cx + rOut * Math.cos(startRad);
      const oy0 = cy + rOut * Math.sin(startRad);
      path.moveTo(Math.round(ox0), Math.round(oy0));

      // 2. Outer Arc Cubic Bezier Curves
      let curAngle = startRad;
      for (let i = 0; i < numSegments; i++) {
        const nextAngle = curAngle + segSweep;
        const cos0 = Math.cos(curAngle), sin0 = Math.sin(curAngle);
        const cos1 = Math.cos(nextAngle), sin1 = Math.sin(nextAngle);

        const p0x = cx + rOut * cos0;
        const p0y = cy + rOut * sin0;
        const p3x = cx + rOut * cos1;
        const p3y = cy + rOut * sin1;

        const p1x = p0x + k * rOut * (-sin0);
        const p1y = p0y + k * rOut * cos0;
        const p2x = p3x - k * rOut * (-sin1);
        const p2y = p3y - k * rOut * cos1;

        path.curveTo(
          Math.round(p1x), Math.round(p1y),
          Math.round(p2x), Math.round(p2y),
          Math.round(p3x), Math.round(p3y)
        );
        curAngle = nextAngle;
      }

      // 3. Cap Line from Outer End to Inner End
      const ixEnd = cx + rIn * Math.cos(endRad);
      const iyEnd = cy + rIn * Math.sin(endRad);
      path.lineTo(Math.round(ixEnd), Math.round(iyEnd));

      // 4. Inner Arc Cubic Bezier Curves (in reverse direction back to startRad)
      const revSweep = -segSweep;
      const kRev = (4 / 3) * Math.tan(revSweep / 4);
      let curInnerAngle = endRad;
      for (let i = 0; i < numSegments; i++) {
        const nextInnerAngle = curInnerAngle + revSweep;
        const cos0 = Math.cos(curInnerAngle), sin0 = Math.sin(curInnerAngle);
        const cos1 = Math.cos(nextInnerAngle), sin1 = Math.sin(nextInnerAngle);

        const q0x = cx + rIn * cos0;
        const q0y = cy + rIn * sin0;
        const q3x = cx + rIn * cos1;
        const q3y = cy + rIn * sin1;

        const q1x = q0x + kRev * rIn * (-sin0);
        const q1y = q0y + kRev * rIn * cos0;
        const q2x = q3x - kRev * rIn * (-sin1);
        const q2y = q3y - kRev * rIn * cos1;

        path.curveTo(
          Math.round(q1x), Math.round(q1y),
          Math.round(q2x), Math.round(q2y),
          Math.round(q3x), Math.round(q3y)
        );
        curInnerAngle = nextInnerAngle;
      }

      // 5. Close contour back to outer arc start
      path.close();
    }
  }

  const instance = new FontBuilderClass();
  global.FontBuilderClass = FontBuilderClass;
  global.FontBuilder = instance;
  if (global.ROLL_CALL?.set) global.ROLL_CALL.set('Font_Builder_1.0', instance);
})(typeof window !== 'undefined' ? window : this);
