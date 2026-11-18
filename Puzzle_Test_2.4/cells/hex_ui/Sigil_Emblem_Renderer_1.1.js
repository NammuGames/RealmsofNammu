/**
 * @fileoverview cells/hex_ui/Sigil_Emblem_Renderer_1.1.js - Multi-Part Cell: Part 1.1 of Sigil_Emblem_Renderer
 * @description The 12 classic procedural vector elemental shapes and variations.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const Proto = (global.SigilEmblemRendererClass && global.SigilEmblemRendererClass.prototype) ||
                (global.SigilEmblemRenderer && Object.getPrototypeOf(global.SigilEmblemRenderer));

  if (!Proto) {
    console.error('[Sigil_Emblem_Renderer_1.1] SigilEmblemRendererClass prototype not found. Ensure Sigil_Emblem_Renderer_1.0.js is loaded first.');
    return;
  }

  // --- THE 12 ELEMENTAL SHAPES ---

  /** Heat: Hourglass Symbol (#3 Winning Shape: Thicker Caps & Compressed Middle Bulb • 6 Variations) */
  Proto.drawHeatEmblem = function(ctx, size, vIdx = 0) {
    const mode = vIdx % 6, s = size * 1.04;
    const configs = [
      [0.54, 0.40, 0.110, 0.075, 0.12, 0.64, false], // 1. Solid Medium-Thick (Moderate Compression)
      [0.54, 0.40, 0.130, 0.075, 0.12, 0.62, false], // 2. Compact Stout (Heavy Caps)
      [0.56, 0.42, 0.150, 0.075, 0.13, 0.60, false], // 3. Extra-Compressed (Bold Pedestals)
      [0.56, 0.44, 0.170, 0.075, 0.14, 0.58, false], // 4. Ultra-Stout Monolith (Chunky Caps)
      [0.60, 0.40, 0.140, 0.080, 0.10, 0.61, false], // 5. Wide Architectural Wings (Deep Cinch)
      [0.55, 0.41, 0.140, 0.075, 0.12, 0.61, true]   // 6. Rounded Capsule Heavy Caps (Compressed)
    ];
    const [rPw, rBw, rBarH, rGap, rWx, rH, rounded] = configs[mode];
    const pw = s * rPw, bw = s * rBw, barH = s * rBarH, gap = s * rGap, wX = s * rWx, H = s * rH;
    const yTop = -(H - barH - gap), yBot = H - barH - gap;

    ctx.beginPath();
    if (rounded) {
      const r = barH / 2;
      for (let y0 of [-H, H - barH]) {
        ctx.moveTo(-pw + r, y0); ctx.lineTo(pw - r, y0); ctx.arc(pw - r, y0 + r, r, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(-pw + r, y0 + barH); ctx.arc(-pw + r, y0 + r, r, Math.PI / 2, -Math.PI / 2); ctx.closePath();
      }
    } else { ctx.rect(-pw, -H, pw * 2, barH); ctx.rect(-pw, H - barH, pw * 2, barH); }
    ctx.moveTo(-bw, yTop); ctx.lineTo(bw, yTop);
    ctx.bezierCurveTo(bw * 0.92, yTop * 0.40, wX, yTop * 0.15, wX, 0);
    ctx.bezierCurveTo(wX, yBot * 0.15, bw * 0.92, yBot * 0.40, bw, yBot); ctx.lineTo(-bw, yBot);
    ctx.bezierCurveTo(-bw * 0.92, yBot * 0.40, -wX, yBot * 0.15, -wX, 0);
    ctx.bezierCurveTo(-wX, yTop * 0.15, -bw * 0.92, yTop * 0.40, -bw, yTop); ctx.closePath();
    this.fillStroke(ctx, 1.8);
  };

  /** Light: 4-Point Radiant Diamond Star (White / Magenta, Black Basin) */
  Proto.drawLightEmblem = function(ctx, size, vIdx = 0) {
    const v = (vIdx % 6) * 0.03, ray = size * 0.95, valley = size * (0.28 - v * 0.5);
    ctx.beginPath(); ctx.moveTo(0, -ray);
    ctx.bezierCurveTo(valley, -valley, valley, -valley, ray * 0.75, 0); ctx.bezierCurveTo(valley, valley, valley, valley, 0, ray);
    ctx.bezierCurveTo(-valley, valley, -valley, valley, -ray * 0.75, 0); ctx.bezierCurveTo(-valley, -valley, -valley, -valley, 0, -ray);
    ctx.closePath();
    const dw = size * (0.18 + v), dh = size * (0.28 + v);
    ctx.moveTo(0, -dh); ctx.lineTo(dw, 0); ctx.lineTo(0, dh); ctx.lineTo(-dw, 0); ctx.closePath();
    this.fillStroke(ctx, 1.8, 'evenodd');
  };

  /** Cyber: Symmetrical Upright Seeker / Inverted Power Button Symbol (2 Separate Parts • Square Handle • Grand Scale) */
  Proto.drawCyberEmblem = function(ctx, size, vIdx = 0) {
    const mode = vIdx % 6;
    let scale = 0.98;
    if (this.liveTuning?.cyber?.scale !== undefined) {
      scale = this.liveTuning.cyber.scale;
    }
    const s = size * scale;
    const configs = [
      [0.62, 0.16, 0.10, 0.46, 0.045, 'flat', 'slot', false],
      [0.66, 0.16, 0.10, 0.50, 0.045, 'flat', 'slot', false],
      [0.59, 0.16, 0.095, 0.53, 0.045, 'flat', 'slot', false],
      [0.57, 0.23, 0.12, 0.70, 0.090, 'flat', 'slot', false, 0.04],
      [0.62, 0.16, 0.10, 0.46, 0.050, 'flat', 'slot', true, 0.00],
      [0.62, 0.16, 0.10, 0.46, 0.045, 'flat', 'radial', false, 0.00]
    ];

    let [rOut, rThick, rHw, rL, rGap, capStyle, rimStyle, hasCollar, cfgYOffset = 0] = configs[mode];
    let yOffset = cfgYOffset;
    if (this.liveTuning?.cyber) {
      const t = this.liveTuning.cyber;
      if (t.rOut !== undefined) rOut = t.rOut;
      if (t.rThick !== undefined) rThick = t.rThick;
      if (t.rHw !== undefined) rHw = t.rHw;
      if (t.rL !== undefined) rL = t.rL;
      if (t.rGap !== undefined) rGap = t.rGap;
      if (t.capStyle !== undefined) capStyle = t.capStyle;
      if (t.rimStyle !== undefined) rimStyle = t.rimStyle;
      if (t.yOffset !== undefined) yOffset = t.yOffset;
    }

    const Rout = s * rOut, Rin = s * (rOut - rThick), hw = s * rHw, L = s * rL, gap = s * rGap;
    const xCut = hw + gap;
    const capExtra = (capStyle === 'round') ? hw : (capStyle === 'bevel' ? hw * 0.5 : 0);

    const yc = (Rout - Rin - L - capExtra) * 0.5 + s * yOffset;
    const yTop = yc + Rin;
    const yBot = yc + Rin + L;

    // --- PART 1: THE BROKEN RING (RIM) ---
    ctx.beginPath();
    if (rimStyle === 'radial') {
      const alpha = Math.asin(Math.min(0.95, xCut / Rin));
      ctx.arc(0, yc, Rout, Math.PI * 0.5 + alpha, Math.PI * 0.5 - alpha, false);
      ctx.lineTo(Rin * Math.sin(alpha), yc + Rin * Math.cos(alpha));
      ctx.arc(0, yc, Rin, Math.PI * 0.5 - alpha, Math.PI * 0.5 + alpha, true);
      ctx.closePath();
    } else {
      const betaOut = Math.asin(Math.min(0.95, xCut / Rout));
      const betaIn = Math.asin(Math.min(0.95, xCut / Rin));
      const yInCut = yc + Math.sqrt(Math.max(0.01, Rin * Rin - xCut * xCut));
      ctx.arc(0, yc, Rout, Math.PI * 0.5 + betaOut, Math.PI * 0.5 - betaOut, false);
      ctx.lineTo(xCut, yInCut);
      ctx.arc(0, yc, Rin, Math.PI * 0.5 - betaIn, Math.PI * 0.5 + betaIn, true);
      ctx.closePath();
    }
    this.fillStroke(ctx, 1.8);

    // --- PART 2: THE VERTICAL STEM (HANDLE) ---
    ctx.beginPath();
    ctx.moveTo(-hw, yTop);
    ctx.lineTo(hw, yTop);

    if (hasCollar) {
      const collarW = hw + gap * 0.65, collarH = s * 0.07;
      const yCut = yc + Math.sqrt(Math.max(0.01, Rout * Rout - xCut * xCut));
      ctx.lineTo(hw, yCut);
      ctx.lineTo(collarW, yCut + collarH * 0.35);
      ctx.lineTo(collarW, yCut + collarH);
      ctx.lineTo(hw, yCut + collarH);
    }
    ctx.lineTo(hw, yBot);

    if (capStyle === 'round') {
      ctx.arc(0, yBot, hw, 0, Math.PI, false);
    } else if (capStyle === 'bevel') {
      const b = hw * 0.5;
      ctx.lineTo(hw, yBot + b);
      ctx.lineTo(hw - b, yBot + b * 2);
      ctx.lineTo(-hw + b, yBot + b * 2);
      ctx.lineTo(-hw, yBot + b);
    } else {
      ctx.lineTo(-hw, yBot);
    }

    if (hasCollar) {
      const collarW = hw + gap * 0.65, collarH = s * 0.07;
      const yCut = yc + Math.sqrt(Math.max(0.01, Rout * Rout - xCut * xCut));
      ctx.lineTo(-hw, yCut + collarH);
      ctx.lineTo(-collarW, yCut + collarH);
      ctx.lineTo(-collarW, yCut + collarH * 0.35);
      ctx.lineTo(-hw, yCut);
    }
    ctx.lineTo(-hw, yTop);
    ctx.closePath();
    this.fillStroke(ctx, 1.8);
  };

  /** Storm: Single Bolt (#5 Winning Size 94% at -12° • 6 Middle Angle & Thickness Variations) */
  Proto.drawStormEmblem = function(ctx, size, vIdx = 0) {
    const mode = vIdx % 6, s = size * 0.94;
    const variations = [
      [0.56, 0.12, 0.10, 0.23],
      [0.56, 0.10, 0.12, 0.28],
      [0.56, 0.08, 0.14, 0.34],
      [0.54, 0.05, 0.16, 0.40],
      [0.58, 0.16, 0.16, 0.24],
      [0.55, 0.06, 0.15, 0.32]
    ];
    const [ex, ey, nx, ny] = variations[mode];
    const pts = [0.22, -0.86, -ex, -ey, nx, ny, -0.22, 0.86, ex, ey, -nx, -ny];

    ctx.save();
    ctx.rotate(-12 * Math.PI / 180);
    ctx.beginPath();
    ctx.moveTo(s * pts[0], s * pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(s * pts[i], s * pts[i+1]);
    ctx.closePath();
    this.fillStroke(ctx, 1.8);
    ctx.restore();
  };

  /** Air: Lean Aerodynamic Crescent (#3 Winning Shape • Centered Down/Left • 6 Size Scales) */
  Proto.drawAirEmblem = function(ctx, size, vIdx = 0) {
    const scales = [1.02, 1.07, 1.12, 1.17, 1.22, 1.27];
    const offsetsX = [-0.07, -0.07, -0.08, -0.08, -0.085, -0.085];
    const offsetsY = [0.06, 0.065, 0.07, 0.075, 0.08, 0.085];
    const mode = vIdx % 6;
    const s = size * scales[mode];

    const main = [-0.08, 0.65, 0.20, 0.44, 0.56, 0.20, 0.64, -0.06, 0.68, -0.38, 0.46, -0.70, 0.10, -0.70, -0.24, -0.70, -0.50, -0.46, -0.46, -0.14, -0.34, -0.28, -0.10, -0.42, 0.06, -0.42, 0.22, -0.42, 0.39, -0.14, 0.38, 0.04, 0.37, 0.22, 0.17, 0.46, -0.08, 0.65];
    const small = [-0.04, 0.38, 0.05, 0.28, 0.14, 0.16, 0.14, 0.06, 0.14, -0.06, 0.07, -0.14, -0.05, -0.14, -0.17, -0.14, -0.27, -0.04, -0.26, 0.10, -0.20, 0.03, -0.13, 0.05, -0.06, 0.08, 0.01, 0.12, 0.00, 0.26, -0.04, 0.38];

    ctx.save();
    ctx.translate(size * offsetsX[mode], size * offsetsY[mode]);
    ctx.beginPath();
    for (let p of [main, small]) {
      ctx.moveTo(s * p[0], s * p[1]);
      for (let i = 2; i < p.length; i += 6) ctx.bezierCurveTo(s * p[i], s * p[i+1], s * p[i+2], s * p[i+3], s * p[i+4], s * p[i+5]);
      ctx.closePath();
    }
    this.fillStroke(ctx, 1.8);
    ctx.restore();
  };

  /** Water: Zen Bodhi Drop with Dual-Oval Hooked Crescent Ripple (6 Size Variants of #1) */
  Proto.drawWaterEmblem = function(ctx, size, vIdx = 0) {
    const scales = [0.72, 0.80, 0.88, 0.96, 1.04, 1.12];
    const s = size * scales[vIdx % 6];
    const R = s * 0.285, yc = -s * 0.10, yTop = -s * 0.74, th = s * 0.24, k = 0.55228;

    ctx.save(); ctx.translate(0, -s * 0.06);
    ctx.beginPath(); ctx.moveTo(0, yTop);
    ctx.bezierCurveTo(-R * 0.15, yTop + (yc - yTop) * 0.35, -R, yc - R * 0.35, -R, yc);
    ctx.bezierCurveTo(-R, yc + R * k, -R * k, yc + R, 0, yc + R); ctx.bezierCurveTo(R * k, yc + R, R, yc + R * k, R, yc);
    ctx.bezierCurveTo(R, yc - R * 0.35, R * 0.15, yTop + (yc - yTop) * 0.35, 0, yTop); ctx.closePath();
    this.fillStroke(ctx, 1.8, 'evenodd');

    const aO = -40 * Math.PI / 180, rxO = s * 0.65, ryO = s * 0.38, cyO = s * 0.22;
    const inBotY = s * 0.60 - th, tipX = rxO * Math.cos(aO), tipY = cyO + ryO * Math.sin(aO);
    const ryI = (inBotY - tipY) / 1.16, cyI = inBotY - ryI;
    const sinI = (tipY - cyI) / ryI, rxI = tipX / Math.sqrt(Math.max(0.01, 1 - sinI * sinI)), aI = Math.atan2(sinI, tipX / rxI);
    ctx.beginPath();
    ctx.ellipse(0, cyO, rxO, ryO, 0, aO, Math.PI - aO, false);
    ctx.ellipse(0, cyI, rxI, ryI, 0, Math.PI - aI, aI, true);
    ctx.closePath(); this.fillStroke(ctx, 1.8); ctx.restore();
  };

  /** Ice: Chiseled Frost Chevrons Snowflake (#2 Shape • 6 Size Variants • Seamless) */
  Proto.drawIceEmblem = function(ctx, size, vIdx = 0) {
    const scales = [0.68, 0.76, 0.84, 0.92, 1.00, 1.08];
    const s = size * scales[vIdx % 6];
    const tipY = -size * 0.058;
    const L = s * 0.42, ang = 54 * Math.PI / 180, bevel = 0.82;
    const w1 = L * Math.sin(ang), dy = L * Math.cos(ang), notchY = tipY - L;

    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((i * 120) * Math.PI / 180);
      ctx.beginPath();
      ctx.moveTo(0, tipY);
      ctx.lineTo(-w1, tipY - dy);
      ctx.lineTo(-w1 * bevel, notchY - dy * bevel);
      ctx.lineTo(0, notchY);
      ctx.lineTo(w1 * bevel, notchY - dy * bevel);
      ctx.lineTo(w1, tipY - dy);
      ctx.closePath();
      this.fillStroke(ctx, 1.8);
      ctx.restore();
    }
  };

  /** Dark: Twin Spiral Arms around Central Ball (2-Fold Rotational Symmetry • 6 Variations) */
  Proto.drawDarkEmblem = function(ctx, size, vIdx = 0) {
    const mode = vIdx % 6, s = size * 0.94;
    let ballR = s * 0.17, haloRing = false;

    for (let i = 0; i < 2; i++) {
      ctx.save();
      ctx.rotate(i * Math.PI);
      ctx.beginPath();
      if (mode === 0) {
        ctx.moveTo(s * 0.36, -s * 0.72);
        ctx.bezierCurveTo(s * 0.78, -s * 0.40, s * 0.80, s * 0.32, s * 0.32, s * 0.72); ctx.bezierCurveTo(-s * 0.12, s * 0.72, -s * 0.44, s * 0.46, -s * 0.34, s * 0.14);
        ctx.bezierCurveTo(-s * 0.18, s * 0.38, s * 0.14, s * 0.46, s * 0.42, s * 0.28); ctx.bezierCurveTo(s * 0.54, -s * 0.10, s * 0.48, -s * 0.44, s * 0.36, -s * 0.72);
      } else if (mode === 1) {
        ctx.moveTo(s * 0.30, -s * 0.76);
        ctx.bezierCurveTo(s * 0.84, -s * 0.36, s * 0.84, s * 0.36, s * 0.28, s * 0.76); ctx.bezierCurveTo(-s * 0.18, s * 0.74, -s * 0.48, s * 0.38, -s * 0.28, s * 0.08);
        ctx.bezierCurveTo(-s * 0.14, s * 0.32, s * 0.18, s * 0.48, s * 0.46, s * 0.26); ctx.bezierCurveTo(s * 0.58, -s * 0.08, s * 0.46, -s * 0.46, s * 0.30, -s * 0.76);
      } else if (mode === 2) {
        ctx.moveTo(s * 0.36, -s * 0.72);
        ctx.bezierCurveTo(s * 0.78, -s * 0.40, s * 0.80, s * 0.32, s * 0.32, s * 0.72); ctx.bezierCurveTo(-s * 0.12, s * 0.72, -s * 0.44, s * 0.46, -s * 0.34, s * 0.14);
        ctx.bezierCurveTo(-s * 0.18, s * 0.38, s * 0.14, s * 0.46, s * 0.42, s * 0.28); ctx.bezierCurveTo(s * 0.54, -s * 0.10, s * 0.48, -s * 0.44, s * 0.36, -s * 0.72);
        ctx.moveTo(s * 0.36, -s * 0.46);
        ctx.bezierCurveTo(s * 0.56, -s * 0.20, s * 0.56, s * 0.24, s * 0.24, s * 0.50); ctx.bezierCurveTo(s * 0.10, s * 0.48, s * 0.40, s * 0.10, s * 0.36, -s * 0.46);
      } else if (mode === 3) {
        ballR = s * 0.13; ctx.moveTo(s * 0.42, -s * 0.68);
        ctx.bezierCurveTo(s * 0.74, -s * 0.42, s * 0.76, s * 0.34, s * 0.30, s * 0.68); ctx.bezierCurveTo(-s * 0.16, s * 0.72, -s * 0.50, s * 0.40, -s * 0.36, s * 0.10);
        ctx.bezierCurveTo(-s * 0.20, -s * 0.12, 0, -s * 0.20, s * 0.10, -s * 0.16); ctx.bezierCurveTo(0, -s * 0.06, -s * 0.16, s * 0.18, 0, s * 0.40);
        ctx.bezierCurveTo(s * 0.20, s * 0.46, s * 0.48, s * 0.18, s * 0.44, -s * 0.22); ctx.bezierCurveTo(s * 0.46, -s * 0.46, s * 0.44, -s * 0.58, s * 0.42, -s * 0.68);
      } else if (mode === 4) {
        ballR = s * 0.21; ctx.moveTo(s * 0.26, -s * 0.74);
        ctx.bezierCurveTo(s * 0.82, -s * 0.46, s * 0.86, s * 0.28, s * 0.38, s * 0.72); ctx.bezierCurveTo(s * 0.14, s * 0.72, -s * 0.26, s * 0.56, -s * 0.38, s * 0.26);
        ctx.bezierCurveTo(-s * 0.20, s * 0.22, s * 0.10, s * 0.38, s * 0.32, s * 0.26); ctx.bezierCurveTo(s * 0.52, s * 0.14, s * 0.56, -s * 0.28, s * 0.26, -s * 0.74);
      } else {
        haloRing = true; ballR = s * 0.12; ctx.moveTo(s * 0.36, -s * 0.72);
        ctx.bezierCurveTo(s * 0.78, -s * 0.40, s * 0.80, s * 0.32, s * 0.32, s * 0.72); ctx.bezierCurveTo(-s * 0.08, s * 0.72, -s * 0.46, s * 0.50, -s * 0.38, s * 0.24);
        ctx.bezierCurveTo(-s * 0.20, s * 0.40, s * 0.14, s * 0.48, s * 0.42, s * 0.30); ctx.bezierCurveTo(s * 0.54, -s * 0.10, s * 0.48, -s * 0.44, s * 0.36, -s * 0.72);
      }
      ctx.closePath();
      this.fillStroke(ctx, 1.8, 'evenodd');
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(0, 0, ballR, 0, Math.PI * 2);
    if (haloRing) {
      ctx.moveTo(s * 0.24, 0); ctx.arc(0, 0, s * 0.24, 0, Math.PI * 2);
      ctx.moveTo(s * 0.19, 0); ctx.arc(0, 0, s * 0.19, 0, Math.PI * 2);
    }
    ctx.closePath();
    this.fillStroke(ctx, 1.8, 'evenodd');
  };

  /** Feral: Big Tall-Oval Dog Paw Print (#2 Winning Motif • Grand Scale) */
  Proto.drawFeralEmblem = function(ctx, size, vIdx = 0) {
    const mode = vIdx % 6, s = size * 1.22, cy = s * 0.14;
    let padW = s * 0.40, rx = s * 0.118, ry = s * 0.208;
    let inY = cy - s * 0.45, outY = cy - s * 0.25;
    let inX = s * 0.17, outX = s * 0.40, inAng = 0.14, outAng = 0.52;

    if (mode === 1) { inY = cy - s * 0.48; outY = cy - s * 0.26; inAng = 0.12; }
    else if (mode === 2) { padW = s * 0.44; inX = s * 0.18; outX = s * 0.42; }
    else if (mode === 3) { rx = s * 0.128; ry = s * 0.212; padW = s * 0.41; }
    else if (mode === 4) { padW = s * 0.40; }
    else if (mode === 5) { outAng = 0.62; outX = s * 0.42; }

    const drawOvalToe = (tx, ty, ang, rX, rY) => {
      const cos = Math.cos(ang), sin = Math.sin(ang);
      ctx.moveTo(tx + rX * cos, ty + rX * sin); ctx.ellipse(tx, ty, rX, rY, ang, 0, Math.PI * 2);
    };

    ctx.beginPath();
    ctx.moveTo(-padW * 0.22, cy - s * 0.10);
    ctx.bezierCurveTo(-padW * 0.08, cy - s * 0.16, padW * 0.08, cy - s * 0.16, padW * 0.22, cy - s * 0.10);
    ctx.bezierCurveTo(padW * 0.65, cy + s * 0.05, padW * 0.96, cy + s * 0.20, padW * 0.90, cy + s * 0.32);
    ctx.bezierCurveTo(padW * 0.85, cy + s * 0.38, padW * 0.65, cy + s * 0.39, padW * 0.45, cy + s * 0.38);
    ctx.bezierCurveTo(padW * 0.20, cy + s * 0.37, -padW * 0.20, cy + s * 0.37, -padW * 0.45, cy + s * 0.38);
    ctx.bezierCurveTo(-padW * 0.65, cy + s * 0.39, -padW * 0.85, cy + s * 0.38, -padW * 0.90, cy + s * 0.32);
    ctx.bezierCurveTo(-padW * 0.96, cy + s * 0.20, -padW * 0.65, cy + s * 0.05, -padW * 0.22, cy - s * 0.10); ctx.closePath();

    drawOvalToe(-inX, inY, -inAng, rx, ry); drawOvalToe(inX, inY, inAng, rx, ry);
    drawOvalToe(-outX, outY, -outAng, rx * 0.94, ry * 0.92); drawOvalToe(outX, outY, outAng, rx * 0.94, ry * 0.92);

    if (mode === 4) {
      const hr = s * 0.10, hcy = cy + s * 0.15;
      ctx.moveTo(0, hcy + s * 0.10);
      ctx.bezierCurveTo(-hr * 1.1, hcy + s * 0.02, -hr * 0.85, hcy - s * 0.07, 0, hcy - s * 0.02);
      ctx.bezierCurveTo(hr * 0.85, hcy - s * 0.07, hr * 1.1, hcy + s * 0.02, 0, hcy + s * 0.10);
      ctx.closePath();
    }

    this.fillStroke(ctx, 1.8, 'evenodd');
  };

  /** Wood: Leaf with Identical Cutout Slotting Shorter Stem • Concave Top • Tucked Bottom */
  Proto.drawWoodEmblem = function(ctx, size, vIdx = 0) {
    const mode = vIdx % 6;
    let scale = 1.08, yOffset = -0.01;
    if (this.liveTuning?.wood) {
      if (this.liveTuning.wood.scale !== undefined) scale = this.liveTuning.wood.scale;
      if (this.liveTuning.wood.yOffset !== undefined) yOffset = this.liveTuning.wood.yOffset;
    }
    const s = size * scale, cy = s * (0.02 + yOffset);
    let rotDeg = 0, apexY = cy - s * 0.76, flankW = s * 0.50, bellyY = cy - s * 0.08;
    let stemW = s * 0.15, stemBaseY = cy + s * 0.70, tipY = cy + s * 0.18;
    let tuckY = cy + s * 0.40, gapY = s * 0.26, sweepX = 0;

    if (mode === 1) { rotDeg = 20; flankW = s * 0.46; stemBaseY = cy + s * 0.68; stemW = s * 0.14; }
    else if (mode === 2) { flankW = s * 0.55; gapY = s * 0.28; stemBaseY = cy + s * 0.72; stemW = s * 0.16; }
    else if (mode === 3) { apexY = cy - s * 0.82; flankW = s * 0.44; stemBaseY = cy + s * 0.72; stemW = s * 0.13; }
    else if (mode === 4) { sweepX = s * 0.14; flankW = s * 0.46; stemBaseY = cy + s * 0.70; stemW = s * 0.15; }
    else if (mode === 5) { stemW = s * 0.17; stemBaseY = cy + s * 0.74; tipY = cy + s * 0.22; }

    const slope = stemW / (stemBaseY - tipY);
    const cutApexY = tipY - gapY, tuckX = (tuckY - cutApexY) * slope;

    ctx.save(); ctx.translate(0, cy);
    if (rotDeg !== 0) ctx.rotate(rotDeg * Math.PI / 180);

    ctx.beginPath();
    ctx.moveTo(-stemW, stemBaseY); ctx.lineTo(0, tipY); ctx.lineTo(stemW, stemBaseY); ctx.closePath();
    ctx.moveTo(sweepX, apexY);
    ctx.bezierCurveTo(sweepX + flankW * 0.15, apexY + s * 0.24, flankW * 0.95, bellyY - s * 0.18, flankW, bellyY);
    ctx.bezierCurveTo(flankW * 1.02, bellyY + s * 0.22, tuckX * 1.45, tuckY + s * 0.04, tuckX, tuckY);
    ctx.lineTo(0, cutApexY); ctx.lineTo(-tuckX, tuckY);
    ctx.bezierCurveTo(-tuckX * 1.45, tuckY + s * 0.04, -flankW * 1.02, bellyY + s * 0.22, -flankW, bellyY);
    ctx.bezierCurveTo(-flankW * 0.95, bellyY - s * 0.18, sweepX - flankW * 0.15, apexY + s * 0.24, sweepX, apexY);
    ctx.closePath();
    this.fillStroke(ctx, 1.8); ctx.restore();
  };

  /** Stone: Centered Stout Megalith (#2 Favorite • Shorter & Centered • Pronounced Gap) */
  Proto.drawStoneEmblem = function(ctx, size, vIdx = 0) {
    const mode = vIdx % 6, cy = -size * 0.04, baseY = cy + size * 0.46;
    let topY = cy - size * 0.54, topL = -size * 0.30, topR = size * 0.18, baseL = -size * 0.66;
    let cutTopX = size * 0.36, cutTopY = cy + size * 0.02, cutBotX = size * 0.16;
    let shTopY = cy + size * 0.02, shTopL = size * 0.50, shTopR = size * 0.66, shBaseL = size * 0.30, shBaseR = size * 0.72;

    if (mode === 1) { topY = cy - size * 0.48; topL = -size * 0.32; topR = size * 0.20; cutTopX = size * 0.36; cutTopY = cy + size * 0.06; cutBotX = size * 0.16; shTopY = cy + size * 0.06; shTopL = size * 0.51; shTopR = size * 0.67; shBaseL = size * 0.31; }
    else if (mode === 2) { topY = cy - size * 0.58; topL = -size * 0.28; topR = size * 0.16; cutTopX = size * 0.37; cutTopY = cy; cutBotX = size * 0.17; shTopY = cy; shTopL = size * 0.51; shTopR = size * 0.65; shBaseL = size * 0.31; shBaseR = size * 0.70; }
    else if (mode === 3) { shTopY = cy - size * 0.18; shTopL = size * 0.46; shTopR = size * 0.60; cutTopX = size * 0.32; cutTopY = cy - size * 0.18; cutBotX = size * 0.16; shBaseL = size * 0.30; }
    else if (mode === 4) { topL = -size * 0.36; topR = size * 0.10; baseL = -size * 0.70; cutTopX = size * 0.35; cutTopY = cy + size * 0.02; cutBotX = size * 0.15; shBaseL = size * 0.30; }
    else if (mode === 5) { topY = cy - size * 0.56; topL = -size * 0.24; topR = size * 0.18; baseL = -size * 0.62; cutTopX = size * 0.36; cutTopY = cy + size * 0.01; cutBotX = size * 0.16; shTopY = cy + size * 0.01; shTopL = size * 0.50; shTopR = size * 0.64; shBaseL = size * 0.30; shBaseR = size * 0.68; }

    ctx.beginPath();
    ctx.moveTo(baseL, baseY); ctx.lineTo(topL, topY); ctx.lineTo(topR, topY); ctx.lineTo(cutTopX, cutTopY); ctx.lineTo(cutBotX, baseY); ctx.closePath();
    ctx.moveTo(shBaseL, baseY); ctx.lineTo(shTopL, shTopY); ctx.lineTo(shTopR, shTopY); ctx.lineTo(shBaseR, baseY); ctx.closePath();
    this.fillStroke(ctx, 1.8);
  };

  /** Fire: 3-Piece Towering Crystal Flame (#2 Winner • 6 Size Variants • Centered) */
  Proto.drawFireEmblem = function(ctx, size, vIdx = 0) {
    const scales = [0.72, 0.80, 0.88, 0.96, 1.04, 1.12];
    const s = size * scales[vIdx % 6], cy = s * 0.17;
    const cTop = -0.82, cBase = 0.46, cW = 0.18, cMidY = 0.04, gap = 0.09;
    const fX = 0.46, fY = 0.28, eX = 0.64, eY = -0.04, tX = 0.44, tY = -0.58, wX = 0.32, wY = -0.28;

    ctx.beginPath();
    ctx.moveTo(0, cy + s * cTop);
    ctx.lineTo(s * (cW * 0.85), cy - s * 0.36); ctx.lineTo(s * cW, cy + s * cMidY); ctx.lineTo(0, cy + s * cBase);
    ctx.lineTo(-s * cW, cy + s * cMidY); ctx.lineTo(-s * (cW * 0.85), cy - s * 0.36); ctx.closePath();
    for (let dir of [-1, 1]) {
      ctx.moveTo(dir * s * gap, cy + s * cBase); ctx.lineTo(dir * s * fX, cy + s * fY); ctx.lineTo(dir * s * eX, cy + s * eY);
      ctx.lineTo(dir * s * tX, cy + s * tY); ctx.lineTo(dir * s * wX, cy + s * wY); ctx.lineTo(dir * s * (cW + gap), cy + s * cMidY); ctx.closePath();
    }
    this.fillStroke(ctx, 1.8);
  };

  Proto.drawCenteredSweptWing = function(ctx, size) {
    this.drawFireEmblem(ctx, size, 0);
  };

})(typeof window !== 'undefined' ? window : this);
