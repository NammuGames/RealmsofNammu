/**
 * @fileoverview Board_Ghost_Renderer.js - Placement Ghost & Weave Staging Visual Engine
 * @description Encapsulates rendering for the player's active placement ghost:
 * 1. Standard 4-Hex Tetrahex Ghost Reticle (enlarged hovering 3D polyhedra, colored back-tiles, off-board pulsing grey hazard ghosts)
 * 2. Air Weave Mode Staged Ghost (floating staged polyhedra, animated glow-ball connection lines, Weave cursor with indicator dots)
 * 3. Center Anchor Dot
 */

(function(global) {
  'use strict';

  class BoardGhostRendererClass {
    constructor() {}

    /**
     * Fallback bezel drawer if not provided by caller.
     */
    _drawBezelHex(ctx, math, x, y, r, fill, stroke, bgOp, borderOp) {
      const bz = global.HexBezelRenderer;
      if (!bz) return math.drawHexagon(ctx, x, y, r, fill, stroke, 2.5);
      const cState = global.COSMOS_STATE || {};
      const zoom = cState.zoom || 1.0;
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
     * Master placement ghost pass.
     * Renders floating unplaced tetrahex reticle or Weave staging sequence at placement cursor.
     */
    drawPlacementGhost(ctx, math, data, originX, originY, hexRadius, elapsedTime, options = {}) {
      const state = global.GameState;
      if (!state || !math || !state.isMaterialSelected || state.placedThisTurn || !state.placementCursor) return;

      const activeMat = state.getActiveMaterial ? state.getActiveMaterial() : null;
      if (!activeMat) return;

      const cursor = state.placementCursor;
      const canPlace = state.canPlaceMaterialAt ? state.canPlaceMaterialAt(cursor.q, cursor.r) : false;
      const cState = global.COSMOS_STATE || {};
      const tBgOp = cState.tileBgOpacity ?? 0.20, tBorderOp = cState.tileBorderOpacity ?? 0.60;
      const backBgOp = options.backBgOp !== undefined ? options.backBgOp : Math.min(1.0, tBgOp + 0.20);
      const backBorderOp = options.backBorderOp !== undefined ? options.backBorderOp : Math.min(1.0, tBorderOp + 0.20);
      const ghostBgOp = options.ghostBgOp !== undefined ? options.ghostBgOp : Math.min(1.0, backBgOp + 0.20);
      const ghostBorderOp = options.ghostBorderOp !== undefined ? options.ghostBorderOp : Math.min(1.0, backBorderOp + 0.20);
      const pGreyBg = options.pGreyBg !== undefined ? options.pGreyBg : backBgOp;
      const pGreyBorder = options.pGreyBorder !== undefined ? options.pGreyBorder : backBorderOp;

      const drawBezel = (typeof options.drawBezelHex === 'function')
        ? options.drawBezelHex
        : (hx, hy, hr, fill, stroke, bgO = ghostBgOp, bdrO = ghostBorderOp) => this._drawBezelHex(ctx, math, hx, hy, hr, fill, stroke, bgO, bdrO);

      if (global.BoardRippleRenderer?.renderMaterialSpawnPulses) {
        global.BoardRippleRenderer.renderMaterialSpawnPulses(ctx, math, originX, originY, hexRadius);
      }

      if (!state.isMaterialSelected || state.placedThisTurn) return;

      if (state.activeMaterialMod === 'weave') {
        this._drawWeaveGhost(ctx, math, data, originX, originY, hexRadius, elapsedTime, cursor, activeMat, canPlace, drawBezel, ghostBgOp, ghostBorderOp);
      } else {
        this._drawStandardGhost(ctx, math, data, originX, originY, hexRadius, elapsedTime, cursor, activeMat, drawBezel, ghostBgOp, ghostBorderOp, pGreyBg, pGreyBorder);
      }

      // Center anchor dot (hidden when Weave positioned all 4 components)
      const hideDot = state.activeMaterialMod === 'weave' && (global.SpellWeave?.placedTiles?.length >= 4 || state.weavePlacedTiles?.length >= 4);
      if (!hideDot) {
        const dotScale = global.BoardRippleRenderer?.getMaterialAnimScale ? global.BoardRippleRenderer.getMaterialAnimScale() : 1.0;
        if (dotScale > 0.001) {
          const anchor = math.hexToScreen(cursor.q, cursor.r, originX, originY, hexRadius);
          ctx.save();
          ctx.beginPath();
          ctx.arc(anchor.x, anchor.y, 4 * dotScale, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.restore();
        }
      }
    }

    _drawWeaveGhost(ctx, math, data, originX, originY, hexRadius, elapsedTime, cursor, activeMat, canPlace, drawBezel, ghostBgOp, ghostBorderOp) {
      const state = global.GameState;
      const placedTiles = (global.SpellWeave && global.SpellWeave.placedTiles) || state.weavePlacedTiles || [];
      const currentStep = state.weaveStep || 0;
      const unplacedScale = global.COSMOS_STATE?.unplacedScale || 0.90;
      const effR = hexRadius - 1.5;
      const cursorScr = math.hexToScreen(cursor.q, cursor.r, originX, originY, hexRadius);
      const canWeave = global.SpellWeave?.canPlaceComponentAt ? global.SpellWeave.canPlaceComponentAt(cursor.q, cursor.r) : canPlace;
      const matScale = global.BoardRippleRenderer?.getMaterialAnimScale ? global.BoardRippleRenderer.getMaterialAnimScale() : 1.0;
      if (matScale <= 0.001) return;

      // 1. LAYER 1: BACK-TILES (Lighter yellow #fde047, ghost opacity tier)
      placedTiles.forEach(pt => {
        const s = math.hexToScreen(pt.q, pt.r, originX, originY, hexRadius);
        drawBezel(s.x, s.y, effR * matScale, '#fde047', '#fde047', ghostBgOp, ghostBorderOp);
      });
      if (placedTiles.length < 4) {
        drawBezel(cursorScr.x, cursorScr.y, effR * matScale, canWeave ? '#fde047' : '#f97316', canWeave ? '#fde047' : '#f97316', ghostBgOp, ghostBorderOp);
        global.BoardCursorRenderer?.drawWeaveCursorDots?.(ctx, cursorScr.x, cursorScr.y, effR * matScale, activeMat, placedTiles.length, elapsedTime);
      }

      // 2. LAYER 2: CONNECTION LINES (Alpha glow balls with triangular tails along parallel paths)
      const connections = [], isFull = placedTiles.length >= 4;
      const hexDist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((a.q - b.q) + (a.r - b.r)));
      for (let i = 0; i < placedTiles.length; i++) {
        for (let j = i + 1; j < placedTiles.length; j++) {
          if (hexDist(placedTiles[i], placedTiles[j]) <= 2) connections.push([placedTiles[i], placedTiles[j]]);
        }
      }
      if (!isFull && canWeave) {
        placedTiles.forEach(pt => {
          if (hexDist(pt, cursor) <= 2) connections.push([pt, { q: cursor.q, r: cursor.r }]);
        });
      }

      if (connections.length > 0) {
        ctx.save();
        const time = elapsedTime || 0, ballR = hexRadius * 0.08, tailLen = hexRadius * 0.42, w = ballR * 0.85;
        const laneSpacing = hexRadius * 0.14, laneOffsets = isFull ? [-laneSpacing, 0, laneSpacing] : [0];
        connections.forEach(([p1, p2], cIdx) => {
          const s1 = math.hexToScreen(p1.q, p1.r, originX, originY, hexRadius);
          const s2 = math.hexToScreen(p2.q, p2.r, originX, originY, hexRadius);
          const dx = s2.x - s1.x, dy = s2.y - s1.y, dist = Math.hypot(dx, dy);
          if (dist <= 0) return;
          const ux = dx / dist, uy = dy / dist, nx = -uy, ny = ux;
          laneOffsets.forEach((lOff, lIdx) => {
            const ox1 = s1.x + nx * lOff, oy1 = s1.y + ny * lOff;
            for (let k = 0; k < 3; k++) {
              const dir = (k % 2 === 0) ? 1 : -1, spd = 0.55 + 0.35 * ((k * 1.73 + cIdx * 0.31 + lIdx * 0.23) % 1.0);
              const t = (time * spd + (k * 0.33 + cIdx * 0.19 + lIdx * 0.27)) % 1.0, prog = dir === 1 ? t : 1 - t;
              const px = ox1 + dx * prog, py = oy1 + dy * prog, alpha = Math.sin(t * Math.PI) * 0.90;
              const mx = ux * dir, my = uy * dir, tnx = -my, tny = mx;
              ctx.beginPath();
              ctx.moveTo(px - mx * tailLen, py - my * tailLen);
              ctx.lineTo(px + tnx * w, py + tny * w);
              ctx.lineTo(px - tnx * w, py - tny * w);
              ctx.fillStyle = `rgba(254, 240, 138, ${alpha * 0.40})`;
              ctx.fill();
              ctx.beginPath();
              ctx.arc(px, py, ballR, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
              ctx.shadowColor = '#fde047';
              ctx.shadowBlur = ballR * 2.5;
              ctx.fill();
              ctx.shadowBlur = 0;
            }
          });
        });
        ctx.restore();
      }

      // 3. LAYER 3: UNPLACED COMPONENTS (Enlarged floating polyhedra, 1.0 alpha)
      if (global.PolyhedronRenderer) {
        placedTiles.forEach(pt => {
          const scr = math.hexToScreen(pt.q, pt.r, originX, originY, hexRadius);
          const sp = (Math.abs(Math.sin(pt.q * 12.9898 + pt.r * 78.233) * 43758.5453)) % 1.0;
          const st = (Math.abs(Math.cos(pt.q * 39.346 + pt.r * 11.135) * 24634.6345)) % 1.0;
          global.PolyhedronRenderer.drawComponent(ctx, scr.x, scr.y, hexRadius * unplacedScale * matScale, pt.color, elapsedTime, false, false, 1.0, sp, st);
        });
        if (placedTiles.length < 4) {
          const colorName = activeMat.colors[currentStep] || activeMat.colors[0];
          const matScale = global.BoardRippleRenderer?.getMaterialAnimScale ? global.BoardRippleRenderer.getMaterialAnimScale() : 1.0;
          if (matScale > 0.001) {
            const sp = (Math.abs(Math.sin(cursor.q * 12.9898 + cursor.r * 78.233) * 43758.5453)) % 1.0;
            const st = (Math.abs(Math.cos(cursor.q * 39.346 + cursor.r * 11.135) * 24634.6345)) % 1.0;
            global.PolyhedronRenderer.drawComponent(ctx, cursorScr.x, cursorScr.y, hexRadius * unplacedScale * matScale, colorName, elapsedTime, false, false, 1.0, sp, st);
          }
        }
      }
    }

    _drawStandardGhost(ctx, math, data, originX, originY, hexRadius, elapsedTime, cursor, activeMat, drawBezel, ghostBgOp, ghostBorderOp, pGreyBg, pGreyBorder) {
      const state = global.GameState;
      const unplacedScale = global.COSMOS_STATE?.unplacedScale || 0.90;
      const gCompR = hexRadius * unplacedScale;
      const effR = hexRadius - 1.5;

      const matScale = global.BoardRippleRenderer?.getMaterialAnimScale ? global.BoardRippleRenderer.getMaterialAnimScale() : 1.0;
      if (matScale <= 0.001) return;

      activeMat.activeCoords.forEach(([dq, dr], idx) => {
        const tq = cursor.q + dq;
        const tr = cursor.r + dr;

        const { x, y } = math.hexToScreen(tq, tr, originX, originY, hexRadius);
        const isInside = state.isInsideBoard ? state.isInsideBoard(tq, tr) : true;
        const cName = activeMat.colors[idx];
        const targetTile = state.board ? state.board.get(`${tq},${tr}`) : null;
        const isOccupied = !!(targetTile && targetTile.color !== null);

        const seedPhase = (Math.abs(Math.sin(tq * 12.9898 + tr * 78.233) * 43758.5453)) % 1.0;
        const seedTilt = (Math.abs(Math.cos(tq * 39.346 + tr * 11.135) * 24634.6345)) % 1.0;

        ctx.save();
        let backCol = '#22c55e';
        if (state.activeMaterialMod === 'phase') backCol = '#2563eb';
        else if (state.activeMaterialMod === 'burn') backCol = '#ef4444';
        else if (isOccupied) backCol = '#f97316';
        else if (state.activeMaterialMod === 'fortify') backCol = '#c084fc';

        const scaledEffR = effR * matScale;
        const scaledCompR = gCompR * matScale;

        if (!isInside) {
          drawBezel(x, y, scaledEffR, '#64748b', '#94a3b8', pGreyBg, pGreyBorder);
          if (global.PolyhedronRenderer) {
            global.PolyhedronRenderer.drawComponent(ctx, x, y, scaledCompR, cName, elapsedTime, false, false, 1.0, seedPhase, seedTilt);
          }
          drawBezel(x, y, scaledEffR, '#64748b', '#94a3b8', pGreyBg, pGreyBorder);
        } else {
          drawBezel(x, y, scaledEffR, backCol, backCol, ghostBgOp, ghostBorderOp);
          if (global.PolyhedronRenderer) {
            global.PolyhedronRenderer.drawComponent(ctx, x, y, scaledCompR, cName, elapsedTime, false, false, 1.0, seedPhase, seedTilt);
          }
        }
        ctx.restore();
      });
    }
  }

  const ghostRendererInstance = new BoardGhostRendererClass();
  global.BoardGhostRenderer = ghostRendererInstance;
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Board_Ghost_Renderer', ghostRendererInstance);
  }
})(typeof window !== 'undefined' ? window : this);
