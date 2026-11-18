/**
 * @fileoverview cells/hex_ui/Alignment_Canvas_Preview.js - Alignment Canvas Sample Previews
 * @description Sample presets, disease/emblem anchor renderers, ribbon helper, and conduit renderers
 * for the Alignment Animation Studio canvas.
 */

(function(global) {
  'use strict';

  // 3 Curated Alignment Motion Paradigms
  const ALIGNMENT_SAMPLES = [
    {
      id: 'resonant-hum', title: 'RESONANT HUM', subtitle: 'Disease to Disease',
      topType: 'disease', bottomType: 'disease', topName: 'DISEASE', bottomName: 'DISEASE',
      color: '#facc15', secondary: '#ffffff', glowColor: '#eab308', style: 'hum'
    },
    {
      id: 'plasma-arc', title: 'PLASMA ARC', subtitle: 'Emblem to Void',
      topType: 'emblem', bottomType: 'none', elemKey: 'stone', topName: 'STONE', bottomName: 'VOID',
      color: '#953ffd', secondary: '#ffffff', variant: 3, glowColor: '#a855f7', style: 'plasma'
    },
    {
      id: 'breathing-aurora', title: 'BREATHING AURORA', subtitle: 'Light to Dark Weave',
      topType: 'emblem', bottomType: 'emblem',
      topElem: { key: 'light', name: 'LIGHT', color: '#ffffff', secondary: '#eb66ff', variant: 5 },
      bottomElem: { key: 'dark', name: 'DARK', color: '#000000', secondary: '#06b6d4', variant: 1 },
      topName: 'LIGHT', bottomName: 'DARK', color: '#ffffff', secondary: '#06b6d4', glowColor: '#ec4899', style: 'aurora'
    }
  ];

  function pHash(seed) {
    const v = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return v - Math.floor(v);
  }

  /**
   * Dedicated Disease Token Renderer (Layer 1: Bottom Anchor)
   * 12-sided flat-top pyramid token with 80% flat front plateau.
   * Primary: Very light grey [226, 232, 240], Secondary: Deep black [0, 0, 0].
   */
  function drawDiseaseAnchor(ctx, cx, cy, radius, time) {
    const pr = global.PolyhedronRenderer;
    if (pr?.drawDiseaseToken) return pr.drawDiseaseToken(ctx, cx, cy, radius, time, 'gem', false, false, 1.0);
    const R = radius, rIn = radius * 0.80, step = (Math.PI * 2) / 12, bA = -Math.PI * 0.5 + Math.PI / 12;
    for (let i = 0; i < 12; i++) {
      const a1 = bA + i * step, a2 = bA + ((i + 1) % 12) * step;
      ctx.beginPath();
      ctx.moveTo(cx + R * Math.cos(a1), cy + R * Math.sin(a1));
      ctx.lineTo(cx + R * Math.cos(a2), cy + R * Math.sin(a2));
      ctx.lineTo(cx + rIn * Math.cos(a2), cy + rIn * Math.sin(a2));
      ctx.lineTo(cx + rIn * Math.cos(a1), cy + rIn * Math.sin(a1));
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? '#e2e8f0' : '#cbd5e1';
      ctx.fill();
    }
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = bA + i * step;
      if (i === 0) ctx.moveTo(cx + rIn * Math.cos(a), cy + rIn * Math.sin(a));
      else ctx.lineTo(cx + rIn * Math.cos(a), cy + rIn * Math.sin(a));
    }
    ctx.closePath();
    ctx.fillStyle = '#e2e8f0'; ctx.fill();
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1.8; ctx.stroke();
  }

  function drawEmblemAnchor(ctx, sample, cx, cy, radius) {
    const renderer = global.SigilEmblemRenderer;
    if (renderer?.renderEmblem) {
      ctx.save();
      ctx.translate(cx, cy);
      const elem = { key: sample.elemKey || sample.key, color: sample.color, secondary: sample.secondary };
      renderer.renderEmblem(ctx, elem, sample.variant || 0, false, radius, 'wireframe');
      ctx.restore();
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = sample.color;
      ctx.fill();
      ctx.strokeStyle = sample.secondary;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  function renderStreamRibbon(ctx, leftPts, rightPts, spinePts, borderColor, coreColor, glowColor, glowBoost) {
    if (!leftPts.length || !rightPts.length) return;
    ctx.save();
    ctx.globalAlpha = 0.50;

    ctx.beginPath();
    ctx.moveTo(leftPts[0].x, leftPts[0].y);
    for (let i = 1; i < leftPts.length; i++) ctx.lineTo(leftPts[i].x, leftPts[i].y);
    for (let i = rightPts.length - 1; i >= 0; i--) ctx.lineTo(rightPts[i].x, rightPts[i].y);
    ctx.closePath();

    const yTop = leftPts[0].y, yBot = leftPts[leftPts.length - 1].y;
    const grad = ctx.createLinearGradient(0, yTop, 0, yBot);
    grad.addColorStop(0.0, borderColor);
    grad.addColorStop(0.5, coreColor);
    grad.addColorStop(1.0, borderColor);
    ctx.fillStyle = grad;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 14 * glowBoost;
    ctx.fill();

    for (const pts of [leftPts, rightPts]) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
        else ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    if (spinePts && spinePts.length > 0) {
      ctx.beginPath();
      for (let i = 0; i < spinePts.length; i++) {
        if (i === 0) ctx.moveTo(spinePts[i].x, spinePts[i].y);
        else ctx.lineTo(spinePts[i].x, spinePts[i].y);
      }
      ctx.strokeStyle = coreColor;
      ctx.lineWidth = 1.6;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 10 * glowBoost;
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Dedicated Animated Line Renderers (Layer 2: Middle Connecting Conduit & Caps)
   */
  function drawSampleLine(ctx, sample, x, y1, y2, time, isHovered, isSelected) {
    ctx.save();
    const length = y2 - y1;
    const glowBoost = (isHovered || isSelected) ? 1.35 : 1.0;

    switch (sample.style) {
      case 'hum': {
        // Sample 1: Resonant Laser Hum (Connecting Two Diseases)
        const shimmer = Math.sin(time * 26) * 0.8 + Math.cos(time * 42) * 0.4;
        const coreWidth = 2.4 + shimmer * 0.6;
        const glowRadius = 12 + Math.sin(time * 16) * 6;

        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.35)';
        ctx.lineWidth = 8 + shimmer * 2;
        ctx.shadowColor = sample.glowColor;
        ctx.shadowBlur = glowRadius * glowBoost;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
        ctx.strokeStyle = sample.color;
        ctx.lineWidth = coreWidth;
        ctx.stroke();

        for (let k = 1; k <= 3; k++) {
          const ny = y1 + (k / 4) * length;
          const nodePulse = Math.abs(Math.sin(time * 3.0 + k * 1.5));
          ctx.beginPath();
          ctx.ellipse(x, ny, 14 * nodePulse + 4, 3, 0, 0, Math.PI * 2);
          ctx.strokeStyle = sample.secondary;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }

        // Terminal Socket Caps at Both Diseases: Blurry Glowing Ball + True Circle Pulsing Ring
        for (const py of [y1, y2]) {
          const blurR = 12 * glowBoost;
          const ballGrad = ctx.createRadialGradient(x, py, 0, x, py, blurR);
          ballGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.95)');
          ballGrad.addColorStop(0.25, sample.color);
          ballGrad.addColorStop(0.60, 'rgba(250, 204, 21, 0.35)');
          ballGrad.addColorStop(1.0, 'rgba(250, 204, 21, 0.0)');
          ctx.beginPath();
          ctx.arc(x, py, blurR, 0, Math.PI * 2);
          ctx.fillStyle = ballGrad;
          ctx.shadowColor = sample.glowColor;
          ctx.shadowBlur = 22 * glowBoost;
          ctx.fill();

          const ringPulse = Math.abs(Math.sin(time * 2.5 + (py === y2 ? 1.5 : 0)));
          const circleRadius = 10 + 9 * ringPulse;
          ctx.beginPath();
          ctx.arc(x, py, circleRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.85 - 0.45 * ringPulse})`;
          ctx.lineWidth = 1.5;
          ctx.shadowColor = sample.glowColor;
          ctx.shadowBlur = 12;
          ctx.stroke();
        }
        break;
      }

      case 'plasma': {
        // Sample 2: 12Hz Staggered 3-Layer Arc (Emblem to Void)
        const fps = 12;
        const segments = 10;

        for (let arcIdx = 0; arcIdx < 3; arcIdx++) {
          // Clock offset by 1/3 tick so arcs change sequentially
          const arcTick = Math.floor(time * fps + arcIdx * 0.333);
          const arcFlash = (0.70 + 0.30 * pHash(arcTick * 53.1 + arcIdx * 29.3)) * glowBoost;
          const arcPts = [{ x, y: y1 }];

          for (let i = 1; i < segments; i++) {
            const tNorm = i / segments;
            const py = y1 + tNorm * length;
            const env = Math.sin(tNorm * Math.PI);
            const r = pHash(arcTick * 37.19 + i * 19.31 + arcIdx * 71.3);
            const sign = pHash(arcTick * 13.1 + i * 7.9 + arcIdx * 41.7) > 0.5 ? 1 : -1;
            const maxAmp = arcIdx === 0 ? 9 : (arcIdx === 1 ? 6 : 3.5);
            arcPts.push({ x: x + sign * (r * maxAmp + 1.2) * env, y: py });
          }
          arcPts.push({ x, y: y2 });

          ctx.beginPath();
          ctx.moveTo(arcPts[0].x, arcPts[0].y);
          for (let i = 1; i < arcPts.length; i++) ctx.lineTo(arcPts[i].x, arcPts[i].y);
          ctx.strokeStyle = `rgba(168, 85, 247, ${0.45 * arcFlash})`;
          ctx.shadowColor = sample.glowColor;
          ctx.shadowBlur = (14 + arcIdx * 4) * glowBoost;
          ctx.lineWidth = 3.6 - arcIdx * 0.8;
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(arcPts[0].x, arcPts[0].y);
          for (let i = 1; i < arcPts.length; i++) ctx.lineTo(arcPts[i].x, arcPts[i].y);
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.90 * arcFlash})`;
          ctx.lineWidth = 1.6 - arcIdx * 0.3;
          ctx.stroke();
        }

        // Terminal Electric Plasma Cap (Void discharge point)
        const capTick = Math.floor(time * 12);
        const capFlash = 0.75 + 0.25 * pHash(capTick * 47.1);
        ctx.beginPath();
        ctx.arc(x, y2, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = sample.glowColor;
        ctx.shadowBlur = 18 * glowBoost;
        ctx.fill();

        for (let rIdx = 0; rIdx < 3; rIdx++) {
          const rTick = Math.floor(time * 12 + rIdx * 0.333);
          const flash = 0.70 + 0.30 * pHash(rTick * 37.3 + rIdx * 19.1);
          const rotOffset = pHash(rTick * 23.3 + rIdx * 41.7) * Math.PI * 2;
          const joints = 12;
          ctx.beginPath();
          for (let j = 0; j < joints; j++) {
            const angle = rotOffset + (j / joints) * Math.PI * 2 + (pHash(rTick * 11.3 + j * 7.1 + rIdx * 17.9) - 0.5) * 0.40;
            const minR = 6.0;
            const maxR = (14.0 + pHash(rTick * 31.3 + j * 19.7 + rIdx * 29.3) * 5.0) * glowBoost;
            const t = pHash(rTick * 47.9 + j * 23.1 + rIdx * 67.3);
            const rad = minR + t * (maxR - minR);
            const jx = x + Math.cos(angle) * rad;
            const jy = y2 + Math.sin(angle) * rad;
            if (j === 0) ctx.moveTo(jx, jy); else ctx.lineTo(jx, jy);
          }
          ctx.closePath();
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.85 * flash})`;
          ctx.lineWidth = 1.25;
          ctx.shadowColor = sample.glowColor;
          ctx.shadowBlur = 12 * glowBoost;
          ctx.stroke();
        }
        break;
      }

      case 'aurora': {
        // Sample 3: Dual Weaving Celestial Ribbons between Light & Dark Emblems
        const boost = (isHovered || isSelected) ? 1.25 : 1.0;
        const ptsLight = [], ptsDark = [];
        const leftLight = [], rightLight = [];
        const leftDark = [], rightDark = [];

        for (let y = y1; y <= y2; y += 4) {
          const tNorm = (y - y1) / length;
          const env = Math.sin(tNorm * Math.PI);

          const swayL = Math.sin(time * 0.75 + (y - y1) * 0.022) * 14;
          const cxL = x + env * swayL * boost;
          const wL1 = env * (6 + Math.sin(time * 0.60 + (y - y1) * 0.028) * 2.5) * boost;
          const wL2 = env * (6 + Math.cos(time * 0.85 - (y - y1) * 0.032) * 2.5) * boost;
          ptsLight.push({ x: cxL, y });
          leftLight.push({ x: cxL - wL1, y });
          rightLight.push({ x: cxL + wL2, y });

          const swayD = -Math.sin(time * 1.05 + (y - y1) * 0.026 + 1.2) * 14;
          const cxD = x + env * swayD * boost;
          const wD1 = env * (6 + Math.cos(time * 0.75 - (y - y1) * 0.026) * 2.5) * boost;
          const wD2 = env * (6 + Math.sin(time * 0.95 + (y - y1) * 0.030) * 2.5) * boost;
          ptsDark.push({ x: cxD, y });
          leftDark.push({ x: cxD - wD1, y });
          rightDark.push({ x: cxD + wD2, y });
        }

        // Render Ribbon 2 (Dark Stream): Center = source primary, Edges = secondary
        renderStreamRibbon(ctx, leftDark, rightDark, ptsDark, sample.bottomElem?.secondary || '#06b6d4', sample.bottomElem?.color || '#000000', sample.bottomElem?.secondary || '#06b6d4', glowBoost);
        // Render Ribbon 1 (Light Stream): Center = source primary, Edges = secondary
        renderStreamRibbon(ctx, leftLight, rightLight, ptsLight, sample.topElem?.secondary || '#eb66ff', sample.topElem?.color || '#ffffff', '#ec4899', glowBoost);
        break;
      }
    }

    ctx.restore();
  }

  const preview = { ALIGNMENT_SAMPLES, drawDiseaseAnchor, drawEmblemAnchor, drawSampleLine };
  global.AlignmentCanvasPreview = preview;
  global.ROLL_CALL?.set?.('Alignment_Canvas_Preview', preview);
})(typeof window !== 'undefined' ? window : this);
