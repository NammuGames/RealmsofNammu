/**
 * @fileoverview Board_Renderer_1.2.js - Placed Entities, Overlay Tiles & Board FX Stack
 * @description Renders placed board back-tiles and 3D polyhedra batches (Layer 3.5), out-of-bounds
 * damage segments (Layer 4), deferred phased/burned overlays (Layer 4.5), and board cursors,
 * dormant/active sigils, placement ghosts, and particle/detonation FX (Layers 4.6-4.97)
 * (Part 3 of multi-part BoardRenderer cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const proto = global.BoardRendererClass?.prototype;
  if (!proto) {
    console.error('[Board_Renderer_1.2] BoardRendererClass is not defined. Ensure Board_Renderer_1.0.js is loaded first.');
    return;
  }

  /**
   * Renders placed components, back-tiles (Fortify/Weave/Disease), out-of-bounds damage tiles,
   * and disease alignment connections. Returns deferred Burn/Phase tiles for Layer 4.5.
   */
  proto._renderPlacedComponents = function(ctx, state, math, opts) {
    const { data, drawBezelHex, backBgOp, backBorderOp, ghostBgOp, ghostBorderOp } = opts;
    const placedBatch = [], overlayList = [];
    const pulseGrey = (Math.sin(this.pulseTime * 2.5) + 1.0) * 0.5;
    const pGreyBg = Math.min(1.0, backBgOp * (0.75 + 0.35 * pulseGrey));
    const pGreyBorder = Math.min(1.0, backBorderOp * (0.75 + 0.35 * pulseGrey));
    const offBoardPlagues = new Set(Array.from(global.ComponentDisease?.shapes?.values() || []).filter(s => s.offBoard).map(s => s.id));
    const pScale = global.COSMOS_STATE?.placedScale || 0.65;

    for (const tile of state.board.values()) {
      const { x, y } = math.hexToScreen(tile.q, tile.r, this.originX, this.originY, this.hexRadius);
      const effR = this.hexRadius - 1.5;

      // Defer Burn and Phase components/back-tiles to Layer 4.5 (renders over disease and connections)
      if (tile.burned || tile.phased) {
        overlayList.push({ tile, x, y, effR, compR: this.hexRadius * pScale });
        continue;
      }

      if (!tile.color) continue;

      if (tile.seedPhase === undefined) {
        tile.seedPhase = (Math.abs(Math.sin(tile.q * 12.9898 + tile.r * 78.233) * 43758.5453)) % 1.0;
        tile.seedTilt = (Math.abs(Math.cos(tile.q * 39.346 + tile.r * 11.135) * 24634.6345)) % 1.0;
      }
      const compR = this.hexRadius * pScale;

      let renderR = compR;
      const animState = global.BoardRippleRenderer?.getTileAnimState?.(tile.q, tile.r);
      const logAlpha = global.TurnLogPlayer?.getTileAlpha?.(tile.q, tile.r) ?? 1.0;
      let eAlpha = ((animState && animState.enchantmentAlpha !== undefined) ? animState.enchantmentAlpha : 1.0) * logAlpha;
      if (global.BoardRippleRenderer?.isSigilDetonatingTile?.(tile.q, tile.r)) {
        eAlpha *= global.BoardRippleRenderer.getResonantSigilBackTileAlpha(`${tile.q},${tile.r}`);
      }
      const isRitualCopied = !!(global.SpellRitual?.inRitualMode && global.SpellRitual?.copiedTileKeys?.has(`${tile.q},${tile.r}`));
      if (isRitualCopied) {
        drawBezelHex(x, y, effR, '#38bdf8', '#38bdf8', backBgOp, backBorderOp);
        renderR = this.hexRadius * (global.COSMOS_STATE?.unplacedScale || 0.90);
      } else if (tile.fortified) {
        drawBezelHex(x, y, effR, '#c084fc', '#c084fc', backBgOp * eAlpha, backBorderOp * eAlpha);
      } else if (tile.woven) {
        let weaveOuter = null;
        const dShift = (state.inShiftMode && global.SpellShift?.isPlaced && global.SpellShift?.placedCenter)
          ? math.hexDistance(tile.q - global.SpellShift.placedCenter.q, tile.r - global.SpellShift.placedCenter.r) : 99;
        const dRitual = (state.inRitualMode && global.SpellRitual?.isPlaced && global.SpellRitual?.placedCenter)
          ? math.hexDistance(tile.q - global.SpellRitual.placedCenter.q, tile.r - global.SpellRitual.placedCenter.r) : 99;
        const dManifest = (state.inManifestMode && global.SpellManifest?.isPlaced && global.SpellManifest?.placedCenter)
          ? math.hexDistance(tile.q - global.SpellManifest.placedCenter.q, tile.r - global.SpellManifest.placedCenter.r) : 99;
        if (dShift === 2) weaveOuter = '#34d399';
        else if (dRitual === 2) weaveOuter = '#38bdf8';
        else if (dManifest === 2) weaveOuter = '#eb66ff';
        drawBezelHex(x, y, effR, '#fde047', '#fde047', backBgOp * eAlpha, backBorderOp * eAlpha, weaveOuter);
      } else if (tile.color === 'disease') {
        const covered = tile.coveredComponent || (tile.underneath?.color && tile.underneath.color !== 'disease' ? tile.underneath : null);
        if (covered) {
          const rr = global.BoardRippleRenderer;
          let covScale = 1.0;
          const covAnim = rr?.getCoverDamageAnim?.(tile.q, tile.r);
          if (covAnim) {
            covScale = covAnim.scaleCover;
          }
          if (covScale > 0.01 && global.PolyhedronRenderer) {
            global.PolyhedronRenderer.drawComponent(ctx, x, y, compR * covScale, covered.color, this.elapsedTime, false, false, 0.95 * logAlpha, tile.seedPhase, tile.seedTilt);
          }
          if (rr?.renderCoverPulse) {
            rr.renderCoverPulse(ctx, math, tile.q, tile.r, this.originX, this.originY, this.hexRadius);
          }
          const covAlpha = ((animState && animState.scale !== undefined) ? animState.scale : 1.0) * logAlpha;
          if (covAlpha > 0.001) {
            drawBezelHex(x, y, effR, '#64748b', '#94a3b8', pGreyBg * covAlpha, pGreyBorder * covAlpha);
          }
          renderR = compR * 0.80; // 20% shrink for disease tokens covering a component
        } else if (tile.plagueId && offBoardPlagues.has(tile.plagueId)) {
          const sh = global.ComponentDisease?.shapes?.get(tile.plagueId);
          const gAlpha = ((sh && sh.greyBackTileAlpha !== undefined) ? sh.greyBackTileAlpha : 1.0) * logAlpha;
          if (gAlpha > 0.001) drawBezelHex(x, y, effR, '#64748b', '#94a3b8', pGreyBg * gAlpha, pGreyBorder * gAlpha);
        }
      } else if (animState && animState.bezelAlpha > 0.001) {
        const bCol = animState.bezelColor || '#22c55e';
        const bBg = animState.bezelBg || bCol;
        const bStroke = animState.bezelStroke || bCol;
        drawBezelHex(x, y, effR, bBg, bStroke, ghostBgOp * animState.bezelAlpha, ghostBorderOp * animState.bezelAlpha);
      }

      if (animState) {
        renderR *= animState.scale;
        if (renderR <= 0.01) continue;
      }

      placedBatch.push({ cx: x, cy: y, radius: renderR, colorName: tile.color, seedPhase: tile.seedPhase, seedTilt: tile.seedTilt, customAlpha: (animState ? animState.alpha : 1.0) * logAlpha });
    }

    // Placed components rendered in a single high-speed batch pass
    if (placedBatch.length > 0 && global.PolyhedronRenderer) {
      if (typeof global.PolyhedronRenderer.drawBatch === 'function') global.PolyhedronRenderer.drawBatch(ctx, placedBatch, this.elapsedTime);
      else placedBatch.forEach(it => global.PolyhedronRenderer.drawComponent(ctx, it.cx, it.cy, it.radius, it.colorName, this.elapsedTime, false, false, 1.0, it.seedPhase, it.seedTilt));
    }
    global.TurnLogPlayer?.renderOutgoingComponents?.(ctx, math, this.originX, this.originY, this.hexRadius, this.elapsedTime, {
      drawBezelHex, backBgOp, backBorderOp, pGreyBg, pGreyBorder
    });

    // 4. RENDER OUT-OF-BOUNDS DAMAGE SEGMENTS PLACED THIS TURN
    if (state.activeDamageTiles && state.activeDamageTiles.length > 0) {
      ctx.save();
      for (const dmg of state.activeDamageTiles) {
        if (global.BoardRippleRenderer?.hasOffBoardCompAnim?.(dmg.q, dmg.r)) continue;
        const animState = global.BoardRippleRenderer?.getTileAnimState?.(dmg.q, dmg.r);
        const s = (animState && animState.scale !== undefined) ? animState.scale : 1.0;
        if (s <= 0.01) continue;
        const { x, y } = math.hexToScreen(dmg.q, dmg.r, this.originX, this.originY, this.hexRadius);
        const dmgR = (this.hexRadius - 1.5) * s;
        const sp = (Math.abs(Math.sin(dmg.q * 12.9898 + dmg.r * 78.233) * 43758.5453)) % 1.0;
        const st = (Math.abs(Math.cos(dmg.q * 39.346 + dmg.r * 11.135) * 24634.6345)) % 1.0;
        const sh = dmg.plagueShapeId ? global.ComponentDisease?.shapes?.get(dmg.plagueShapeId) : null;
        const gAlpha = (sh && sh.greyBackTileAlpha !== undefined) ? sh.greyBackTileAlpha : 1.0;
        if (gAlpha > 0.001) drawBezelHex(x, y, dmgR, '#64748b', '#94a3b8', pGreyBg * gAlpha, pGreyBorder * gAlpha);
        if (global.PolyhedronRenderer) global.PolyhedronRenderer.drawComponent(ctx, x, y, this.hexRadius * 0.65 * s, dmg.color, this.elapsedTime, false, true, animState ? animState.alpha : 1.0, sp, st);
        else { const colorHex = (data && data.COLOR_MAP[dmg.color]) ? data.COLOR_MAP[dmg.color].hex : '#f87171'; math.drawHexagon(ctx, x, y, dmgR, colorHex, 'rgba(248, 113, 113, 0.7)', 2.5); }
        if (gAlpha > 0.001) drawBezelHex(x, y, dmgR, '#64748b', '#94a3b8', pGreyBg * gAlpha, pGreyBorder * gAlpha);
      }
      ctx.restore();
    }

    // Disease connection lines layer OVER disease tokens
    if (global.BoardOverlayRenderer?.drawAlignments) {
      global.BoardOverlayRenderer.drawAlignments(ctx, math, this.originX, this.originY, this.hexRadius, this.pulseTime, 'disease');
    }

    opts.pGreyBg = pGreyBg;
    opts.pGreyBorder = pGreyBorder;
    return overlayList;
  };

  /**
   * Renders deferred Phased and Burned components & bezels on Layer 4.5 (over disease and connections).
   */
  proto._renderPhasedAndBurnedLayer = function(ctx, overlayList, math, opts) {
    if (!overlayList || overlayList.length === 0) return;
    const { drawBezelHex, backBgOp, backBorderOp } = opts;
    const overlayBatch = [];
    for (const p of overlayList) {
      if (p.tile.seedPhase === undefined) {
        p.tile.seedPhase = (Math.abs(Math.sin(p.tile.q * 12.9898 + p.tile.r * 78.233) * 43758.5453)) % 1.0;
        p.tile.seedTilt = (Math.abs(Math.cos(p.tile.q * 39.346 + p.tile.r * 11.135) * 24634.6345)) % 1.0;
      }
      const animState = global.BoardRippleRenderer?.getTileAnimState?.(p.tile.q, p.tile.r);
      const animScale = (animState && animState.scale !== undefined) ? animState.scale : 1.0;
      const oLogAlpha = global.TurnLogPlayer?.getTileAlpha?.(p.tile.q, p.tile.r) ?? 1.0;
      const uRadius = p.tile.burned ? (p.compR * animScale) : p.compR;
      if (p.tile.underneath?.color && global.PolyhedronRenderer && uRadius > 0.001) {
        const uAlpha = ((animScale < 0.5) ? 1.0 : 0.95) * oLogAlpha;
        global.PolyhedronRenderer.drawComponent(ctx, p.x, p.y, uRadius, p.tile.underneath.color, this.elapsedTime, false, false, uAlpha, p.tile.seedPhase, p.tile.seedTilt);
      }
      let eAlpha = (animState && animState.enchantmentAlpha !== undefined) ? animState.enchantmentAlpha : 1.0;
      eAlpha *= oLogAlpha;
      if (global.BoardRippleRenderer?.isSigilDetonatingTile?.(p.tile.q, p.tile.r)) {
        eAlpha *= global.BoardRippleRenderer.getResonantSigilBackTileAlpha(`${p.tile.q},${p.tile.r}`);
      }
      const compAlpha = ((animState && animState.alpha !== undefined) ? animState.alpha : 1.0) * oLogAlpha;
      const isCopied = !!(global.SpellRitual?.inRitualMode && global.SpellRitual?.copiedTileKeys?.has(`${p.tile.q},${p.tile.r}`));
      const bezelCol = isCopied ? '#38bdf8' : (p.tile.burned ? '#ef4444' : '#2563eb');
      const pRadius = (isCopied ? this.hexRadius * (global.COSMOS_STATE?.unplacedScale || 0.90) : p.compR) * animScale;
      drawBezelHex(p.x, p.y, p.effR, bezelCol, bezelCol, backBgOp * eAlpha, backBorderOp * eAlpha);
      if (p.tile.color) {
        overlayBatch.push({ cx: p.x, cy: p.y, radius: pRadius, colorName: p.tile.color, seedPhase: p.tile.seedPhase, seedTilt: p.tile.seedTilt, customAlpha: compAlpha });
      }
    }
    if (overlayBatch.length > 0 && global.PolyhedronRenderer) {
      if (typeof global.PolyhedronRenderer.drawBatch === 'function') global.PolyhedronRenderer.drawBatch(ctx, overlayBatch, this.elapsedTime);
      else overlayBatch.forEach(it => global.PolyhedronRenderer.drawComponent(ctx, it.cx, it.cy, it.radius, it.colorName, this.elapsedTime, false, false, 1.0, it.seedPhase, it.seedTilt));
    }
  };

  /**
   * Renders cursors, dormant/active sigils, aurora/plasma alignments, placement ghosts, and FX overlays.
   */
  proto._renderOverlaysAndFX = function(ctx, state, math, data, opts) {
    const { drawBezelHex, ghostBgOp, ghostBorderOp, backBgOp, backBorderOp, pGreyBg, pGreyBorder } = opts;

    // 4.6. SELECTION, SPELL & SIGIL CURSORS
    if (global.BoardCursorRenderer?.drawCursors) {
      global.BoardCursorRenderer.drawCursors(ctx, math, data, this.originX, this.originY, this.hexRadius, this.pulseTime);
    } else if (global.BoardOverlayRenderer?.drawCursors) {
      global.BoardOverlayRenderer.drawCursors(ctx, math, data, this.originX, this.originY, this.hexRadius, this.pulseTime);
    }

    // 4.7. DORMANT EMBLEMS
    if (global.BoardOverlayRenderer?.drawDormantSigilMarkers) {
      global.BoardOverlayRenderer.drawDormantSigilMarkers(ctx, math, this.originX, this.originY, this.hexRadius, this.pulseTime);
    }

    // 4.8. RESONANCE CONNECTIONS & PLASMA ARCS
    if (global.BoardOverlayRenderer?.drawAlignments) {
      global.BoardOverlayRenderer.drawAlignments(ctx, math, this.originX, this.originY, this.hexRadius, this.pulseTime, 'aurora');
      global.BoardOverlayRenderer.drawAlignments(ctx, math, this.originX, this.originY, this.hexRadius, this.pulseTime, 'plasma');
    }

    if (global.BoardOverlayRenderer?.renderOverlays) {
      global.BoardOverlayRenderer.renderOverlays(ctx, math, data, this.originX, this.originY, this.hexRadius, this.pulseTime);
    }
    if (global.BoardCursorRenderer?.renderActiveHalo) {
      global.BoardCursorRenderer.renderActiveHalo(ctx, math, this.originX, this.originY, this.hexRadius, this.pulseTime);
    }
    if (global.BoardGhostRenderer?.drawPlacementGhost) {
      global.BoardGhostRenderer.drawPlacementGhost(ctx, math, data, this.originX, this.originY, this.hexRadius, this.elapsedTime, {
        drawBezelHex, ghostBgOp, ghostBorderOp, pGreyBg, pGreyBorder
      });
    }
    if (global.BoardRippleRenderer?.renderDiseaseDestruction) {
      global.BoardRippleRenderer.renderDiseaseDestruction(ctx, math, this.originX, this.originY, this.hexRadius, this.elapsedTime, {
        drawBezelHex, ghostBgOp, ghostBorderOp
      });
    }
    if (global.BoardRippleRenderer?.renderResonantDetonations) {
      global.BoardRippleRenderer.renderResonantDetonations(ctx, math, this.originX, this.originY, this.hexRadius, this.elapsedTime, {
        drawBezelHex, ghostBgOp, ghostBorderOp, backBgOp, backBorderOp
      });
    }
    if (global.BoardRippleRenderer?.renderDamageTokens) {
      global.BoardRippleRenderer.renderDamageTokens(ctx, math, this.originX, this.originY, this.hexRadius, this.elapsedTime, {
        drawBezelHex, ghostBgOp, ghostBorderOp
      });
    }
    if (global.LastBreathManager?.render) {
      global.LastBreathManager.render(ctx, math, this.originX, this.originY, this.hexRadius, this.elapsedTime, {
        drawBezelHex, ghostBgOp, ghostBorderOp
      });
    }
    if (global.OrbitParticleRenderer?.renderParticles) {
      global.OrbitParticleRenderer.renderParticles(ctx, math, this.originX, this.originY, this.hexRadius, this.elapsedTime);
    }
  };

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Board_Renderer_1.2', global.BoardRenderer);

})(typeof window !== 'undefined' ? window : this);
