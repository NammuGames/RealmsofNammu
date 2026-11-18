/**
 * @fileoverview cells/Hex_Bilateral_Math_1.0.js - Multi-Part Cell: Part 1.0 of Hex_Bilateral_Math
 * @description Core Duodecimal Bilateral Coordinate Math: Physical dimensions, neighbor vectors,
 * axial distance, rotation, Yard/Perch projections, and Canvas 2D screen coordinate transformations.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  // Base Duodecimal Physical Dimensions
  const YARD_R = 14;
  const YARD_r = YARD_R * Math.sqrt(3) / 2;
  const YARD_W = 2 * YARD_r;

  const PERCH_INRADIUS = 6.0 * YARD_W;          // ~145.49px
  const PERCH_R = 12.0 * YARD_R;                 // 168px
  const PERCH_STEP_DIST = 2.0 * PERCH_INRADIUS;  // ~290.98px

  // Pure Leftward Tie-Breaker Math (breaks boundary ties Westward with zero vertical drift)
  const TIE_BIAS_Q = -0.0001;
  const TIE_BIAS_R =  0.0001;

  // Bilateral 6-Direction Neighbor Vectors (Point-Up Hex Grid)
  const HEX_NEIGHBORS = [
    [1, -1],  // Pure East (0°)
    [1, 0],   // Top-Right / Northeast (60°)
    [0, 1],   // Top-Left / Northwest (120°)
    [-1, 1],  // Pure West (180°)
    [-1, 0],  // Down-Left / Southwest (240°)
    [0, -1]   // Down-Right / Southeast (300°)
  ];

  const AXIAL_DIRS = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
  ];

  // 1-Ring Perch Flower: Center Perch (0, 0) + 6 Ring-1 Neighbor Perches (7 Perches Total)
  const PERCH_FLOWER_PERCHES = [
    { q: 0, r: 0, ring: 0, label: 'Center' },
    { q: 1, r: 0, ring: 1, label: 'Northeast' }, { q: 1, r: -1, ring: 1, label: 'East' },
    { q: 0, r: -1, ring: 1, label: 'Southeast' }, { q: -1, r: 0, ring: 1, label: 'Southwest' },
    { q: -1, r: 1, ring: 1, label: 'West' }, { q: 0, r: 1, ring: 1, label: 'Northwest' }
  ];

  /**
   * Distance from center (0,0) in bilateral coordinate space.
   */
  function hexDistance(q, r) {
    return ((q >= 0 && r >= 0) || (q <= 0 && r <= 0)) ? (Math.abs(q) + Math.abs(r)) : Math.max(Math.abs(q), Math.abs(r));
  }

  function hexDistanceBetween(q1, r1, q2, r2) {
    return hexDistance(q2 - q1, r2 - r1);
  }

  function rotateCoordsCCW(coords) {
    return coords.map(([q, r]) => [-r, q + r]);
  }

  function rotateCoordsCW(coords) {
    return coords.map(([q, r]) => [q + r, -q]);
  }

  function getNeighbors(q, r) {
    return HEX_NEIGHBORS.map(([dq, dr]) => [q + dq, r + dr]);
  }

  function getFlowerTiles(q, r) {
    return [`${q},${r}`, ...HEX_NEIGHBORS.map(([dq, dr]) => `${q + dq},${r + dr}`)];
  }

  /**
   * Bilateral Mirror-Symmetric Projection: axial (q, r) to pixel offset (x, y)
   */
  function axialToOffset(q, r, stepDist) {
    const x = stepDist * (q - r) * 0.5;
    const y = -stepDist * (q + r) * (Math.sqrt(3) / 2);
    return { x, y };
  }

  /**
   * Continuous pixel offset (x, y) to discrete axial coordinates (q, r)
   */
  function pixelToAxial(x, y, stepDist) {
    const invDist = 1 / stepDist;
    const sqrt3InvDist = 1 / (Math.sqrt(3) * stepDist);

    const qFrac = (x * invDist) - (y * sqrt3InvDist) + TIE_BIAS_Q;
    const rFrac = -(x * invDist) - (y * sqrt3InvDist) + TIE_BIAS_R;
    const sFrac = -qFrac - rFrac;

    let q = Math.round(qFrac);
    let r = Math.round(rFrac);
    let s = Math.round(sFrac);

    const qDiff = Math.abs(q - qFrac);
    const rDiff = Math.abs(r - rFrac);
    const sDiff = Math.abs(s - sFrac);

    if (qDiff > rDiff && qDiff > sDiff) {
      q = -r - s;
    } else if (rDiff > sDiff) {
      r = -q - s;
    }
    return { q, r };
  }

  /**
   * Quantize axial coordinates into coarser grids by factor (e.g. 12 for Yard -> Perch)
   */
  function quantizeAxial(q, r, factor = 12) {
    const qFrac = (q + TIE_BIAS_Q) / factor;
    const rFrac = (r + TIE_BIAS_R) / factor;
    const sFrac = -qFrac - rFrac;

    let rq = Math.round(qFrac);
    let rr = Math.round(rFrac);
    let rs = Math.round(sFrac);

    const qDiff = Math.abs(rq - qFrac);
    const rDiff = Math.abs(rr - rFrac);
    const sDiff = Math.abs(rs - sFrac);

    if (qDiff > rDiff && qDiff > sDiff) {
      rq = -rr - rs;
    } else if (rDiff > sDiff) {
      rr = -rq - rs;
    }
    return { q: rq, r: rr };
  }

  /**
   * Maps individual Yard tile coordinates (yq, yr) to its parent Perch (pq, pr)
   */
  function yardToPerch(yq, yr) {
    return quantizeAxial(yq, yr, 12);
  }

  /**
   * Check if a Perch coordinate belongs to the 1-Ring Perch Flower
   */
  function isInsidePerchFlower(pq, pr) {
    return (pq === 0 && pr === 0) || (hexDistance(pq, pr) === 1);
  }

  // Precompute the 144 Yard offsets relative to a Perch center
  const PERCH_YARD_OFFSETS = [];
  for (let dq = -12; dq <= 12; dq++) {
    for (let dr = -12; dr <= 12; dr++) {
      const p = yardToPerch(dq, dr);
      if (p.q === 0 && p.r === 0) {
        PERCH_YARD_OFFSETS.push({ dq, dr });
      }
    }
  }

  /**
   * Convert bilateral Yard coordinates to screen pixel coordinates on canvas.
   */
  function hexToScreen(q, r, originX, originY, hexRadius) {
    const stepDist = hexRadius * Math.sqrt(3);
    const x = originX + stepDist * (q - r) * 0.5;
    const y = originY - stepDist * (q + r) * (Math.sqrt(3) / 2);
    return { x, y };
  }

  /**
   * Convert screen pixel coordinates to nearest bilateral (q, r) Yard coordinate.
   */
  function screenToHex(px, py, originX, originY, hexRadius, clampMaxRadius = null) {
    const stepDist = hexRadius * Math.sqrt(3);
    const relX = px - originX;
    const relY = py - originY;

    const u = relX / (stepDist * 0.5);
    const v = -relY / (stepDist * (Math.sqrt(3) / 2));

    const floatQ = (v + u) * 0.5;
    const floatR = (v - u) * 0.5;

    const q = Math.round(floatQ + TIE_BIAS_Q);
    const r = Math.round(floatR + TIE_BIAS_R);

    if (clampMaxRadius === null || hexDistance(q, r) <= clampMaxRadius) {
      return { q, r };
    }
    return null;
  }

  /**
   * Render a point-up regular hexagon on canvas context.
   */
  function drawHexagon(ctx, centerX, centerY, radius, fillColor, strokeColor, lineWidth = 1) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (30 + 60 * i);
      const vx = centerX + radius * Math.cos(angle);
      const vy = centerY + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    if (fillColor) {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  const hexMathInstance = {
    YARD_R,
    YARD_r,
    YARD_W,
    PERCH_INRADIUS,
    PERCH_R,
    PERCH_STEP_DIST,
    TIE_BIAS_Q,
    TIE_BIAS_R,
    HEX_NEIGHBORS,
    AXIAL_DIRS,
    PERCH_FLOWER_PERCHES,
    PERCH_YARD_OFFSETS,
    hexDistance,
    hexDistanceBetween,
    rotateCoordsCCW,
    rotateCoordsCW,
    getNeighbors,
    getFlowerTiles,
    axialToOffset,
    pixelToAxial,
    quantizeAxial,
    yardToPerch,
    isInsidePerchFlower,
    hexToScreen,
    screenToHex,
    drawHexagon
  };

  // Register with global Roll Call
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Hex_Bilateral_Math', hexMathInstance);
  global.HexMath = hexMathInstance;
  global.HexBilateralMath = hexMathInstance;

})(typeof window !== 'undefined' ? window : this);

