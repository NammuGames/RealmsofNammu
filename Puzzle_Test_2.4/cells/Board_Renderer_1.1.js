/**
 * @fileoverview Board_Renderer_1.1.js - Canvas Board Aperture Master Pipeline
 * @description Executes the master multi-layer render pipeline inside the Hex_UI_Engine
 * boardFrame aperture: world grid lattice, mirror spine, dynamic tile bezels, placed 3D polyhedra,
 * out-of-bounds damage tiles, phased/burned overlays, and render hooks
 * (Part 2 of multi-part BoardRenderer cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const proto = global.BoardRendererClass?.prototype;
  if (!proto) {
    console.error('[Board_Renderer_1.1] BoardRendererClass is not defined. Ensure Board_Renderer_1.0.js is loaded first.');
    return;
  }

  const UNIT_HEX_CORNERS = global.BoardRendererClass?.UNIT_HEX_CORNERS || Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 180) * (30 + 60 * k);
    return { cos: Math.cos(a), sin: Math.sin(a) };
  });

  /**
   * Master render pass inside the Hex_UI_Engine boardFrame aperture.
   * Transforms and polygon clipping are already established by Hex_UI_Engine.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} localOriginX - Local center X (0.0)
   * @param {number} localOriginY - Local center Y (0.0)
   * @param {Object} boardFrameNode - The HexNode representing the board aperture
   * @param {number} dt - Frame delta time in seconds
   */
  proto.renderInsideFrame = function(ctx, localOriginX = 0, localOriginY = 0, boardFrameNode = null, dt = 0.016) {
    const state = global.GameState;
    const math = global.HexMath;
    const data = global.MaterialsData;
    if (!state || !math) return;

    this.elapsedTime += dt;
    this.pulseTime += 2.5 * dt;
    global.TurnLogPlayer?.update?.();

    // Smooth 60 FPS Camera Lerp Interpolation
    if (global.COSMOS_STATE) {
      if (typeof global.COSMOS_STATE.targetZoom === 'number') this.targetZoom = global.COSMOS_STATE.targetZoom;
      if (typeof global.COSMOS_STATE.targetPanX === 'number') this.targetPanX = global.COSMOS_STATE.targetPanX;
      if (typeof global.COSMOS_STATE.targetPanY === 'number') this.targetPanY = global.COSMOS_STATE.targetPanY;
    }
    const lerpSpeed = Math.min(1.0, 16.0 * dt);
    this.zoom += (this.targetZoom - this.zoom) * lerpSpeed;
    this.panX += (this.targetPanX - this.panX) * lerpSpeed;
    this.panY += (this.targetPanY - this.panY) * lerpSpeed;
    if (global.COSMOS_STATE) {
      global.COSMOS_STATE.zoom = this.zoom; global.COSMOS_STATE.panX = this.panX; global.COSMOS_STATE.panY = this.panY;
    }

    // Fixed base hex radius (original standard scale)
    const frameW = boardFrameNode ? (boardFrameNode.dimensions?.wBase || boardFrameNode.width || 900) : (this.canvas ? this.canvas.width : 900);
    const frameH = boardFrameNode ? (boardFrameNode.dimensions?.hBase || boardFrameNode.height || 790) : (this.canvas ? this.canvas.height : 790);
    const boardR = state.boardRadius || 6;
    this.baseHexRadius = Math.min(frameW, frameH) / (6 * 2 + 3.8);
    this.hexRadius = this.baseHexRadius * this.zoom;
    this.originX = localOriginX + this.panX; this.originY = localOriginY + this.panY;

    // When board radius changes, dynamically set camera zoom to frame the new bounding box
    if (this.currentBoardRadius !== boardR) {
      this.currentBoardRadius = boardR;
      this.resetCamera();
    }

    // ----------------------------------------------------------------------
    // 1. RENDER 1-RING PERCH FLOWER WORLD GRID (Background Lattice)
    // ----------------------------------------------------------------------
    if (math.PERCH_FLOWER_PERCHES) {
      const perchStepPx = this.hexRadius * 12 * Math.sqrt(3);
      const perchRadiusPx = this.hexRadius * 12;

      ctx.save();
      for (const perch of math.PERCH_FLOWER_PERCHES) {
        const pt = math.axialToOffset(perch.q, perch.r, perchStepPx);
        const px = this.originX + pt.x;
        const py = this.originY + pt.y;

        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = (perch.q === 0 && perch.r === 0)
          ? 'rgba(56, 189, 248, 0.16)'
          : 'rgba(56, 189, 248, 0.05)';
        ctx.lineWidth = 1;
        math.drawHexagon(ctx, px, py, perchRadiusPx - 2, null, ctx.strokeStyle, 1);
      }
      ctx.restore();
    }

    // ----------------------------------------------------------------------
    // 2. CENTRAL BILATERAL MIRROR SPINE (q == r, X = 0)
    // ----------------------------------------------------------------------
    ctx.save();
    ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(56, 189, 248, 0.20)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(this.originX, -frameH * 0.5 + 20); ctx.lineTo(this.originX, frameH * 0.5 - 20); ctx.stroke();
    ctx.restore();

    // ----------------------------------------------------------------------
    // 3. RENDER BOARD OBJECT TILES (Concentric Flower Grid - Normal Board Hexes)
    // ----------------------------------------------------------------------
    const cState = global.COSMOS_STATE || {};
    const tBgOp = cState.tileBgOpacity ?? 0.20, tBorderOp = cState.tileBorderOpacity ?? 0.60;
    const tStepDec = cState.tileStepDecrement ?? 0.25, tSteps = cState.tileInnerSteps ?? 3, tStepThick = cState.tileStepThickness ?? 2.0;
    const cZoom = this.zoom || 1.0, bz = global.HexBezelRenderer;
    const backBgOp = Math.min(1.0, tBgOp + 0.20), backBorderOp = Math.min(1.0, tBorderOp + 0.20);
    const ghostBgOp = Math.min(1.0, backBgOp + 0.20), ghostBorderOp = Math.min(1.0, backBorderOp + 0.20);
    const drawBezelHex = (hx, hy, hr, fillCol, glowCol, bgOp = tBgOp, borderOp = tBorderOp, outerCol = null, rotationRad = 0) => {
      if (!bz) return math.drawHexagon(ctx, hx, hy, hr, fillCol, glowCol, 2.0);
      const cosR = rotationRad ? Math.cos(rotationRad) : 1, sinR = rotationRad ? Math.sin(rotationRad) : 0;
      const verts = UNIT_HEX_CORNERS.map(c => ({
        x: hx + hr * (c.cos * cosR - c.sin * sinR),
        y: hy + hr * (c.sin * cosR + c.cos * sinR)
      }));
      const style = {
        bgColor: fillCol, bgOpacity: bgOp, strokeColor: glowCol, strokeOpacity: borderOp,
        innerHighlight: {
          enabled: true, color: glowCol, steps: tSteps, stepThickness: tStepThick,
          borderOpacity: borderOp, stepDecrement: tStepDec, zoom: cZoom, drawBoundaryLine: false
        }
      };
      if (outerCol) {
        style.outerHighlight = { enabled: true, color: outerCol, steps: 3, reach: 7 * cZoom, intensity: 0.95 };
      }
      bz.renderFrameBezel(ctx, verts, style);
    };

    const lockedTileStyles = [];
    const resolver = global.SigilResolver;
    const allSigilCands = (state.allCandidates?.length > 0) ? state.allCandidates : (state.activeSigils || []);
    if (resolver?.isTransitionActive && resolver?.deactivatingSigilIds?.size > 0) {
      allSigilCands.forEach(s => {
        if (resolver.deactivatingSigilIds.has(s.id) && Array.isArray(s.tiles)) {
          const elem = global.BoardOverlayRenderer?._getElemInfo?.(s.element);
          const tileAlpha = Math.max(0.0, 1.0 - resolver.transitionProgress);
          if (tileAlpha > 0.001) {
            const style = { bg: elem?.color || '#ffffff', stroke: elem?.secondary || elem?.sec || '#38bdf8', alpha: tileAlpha };
            s.tiles.forEach(tk => lockedTileStyles.push({ tk, style }));
          }
        }
      });
    }
    if (state.lockedSigilIds?.size > 0) {
      allSigilCands.forEach(s => {
        if (state.lockedSigilIds.has(s.id) && Array.isArray(s.tiles)) {
          if (s.tiles.every(tk => !state.board?.get(tk)?.color)) return;
          const elem = global.BoardOverlayRenderer?._getElemInfo?.(s.element);
          let tileAlpha = 1.0;
          if (global.SpellTeleport?.isPickingUp && s.id === global.SpellTeleport?.pickingUpSigilId) {
            const p = global.SpellTeleport?.pickupProgress ?? global.BoardRippleRenderer?.materialPickupProgress ?? 0.0;
            tileAlpha = Math.max(0.0, 1.0 - p);
          } else if (global.SpellTeleport?.isPlacing && s.id === global.SpellTeleport?.placingSigilId) {
            const p = global.SpellTeleport?.placementProgress ?? global.BoardRippleRenderer?.materialPlacementProgress ?? 1.0;
            tileAlpha = Math.min(1.0, Math.max(0.0, p));
          } else if (resolver?.isTransitionActive && (resolver.newlyFormedSigilIds?.has(s.id) || resolver.activatingSigilIds?.has(s.id))) {
            tileAlpha = resolver.transitionProgress;
          }
          if (global.BoardRippleRenderer?.isSigilDetonating?.(s.id)) {
            tileAlpha = global.BoardRippleRenderer.getResonantSigilBackTileAlpha(s.id);
          }
          if (global.BoardRippleRenderer?.fadingExpiringSigilIds?.has(s.id)) {
            tileAlpha *= (global.BoardRippleRenderer.fadingExpiringProgress ?? 1.0);
          }
          if (global.BoardRippleRenderer?.getBurnSigilFadeAlpha) {
            tileAlpha *= global.BoardRippleRenderer.getBurnSigilFadeAlpha(s.id);
          }
          if (tileAlpha > 0.001) {
            const style = { bg: elem?.color || '#ffffff', stroke: elem?.secondary || elem?.sec || '#38bdf8', alpha: tileAlpha };
            s.tiles.forEach(tk => lockedTileStyles.push({ tk, style }));
          }
        }
      });
    }

    const spellFlowerMap = new Map();
    const cr = global.BoardCursorRenderer;
    if (math.getFlowerTiles && cr?.getFlowerTransition) {
      const ft = cr.getFlowerTransition(state);
      const spec = ft.active ? cr.getFlowerRenderSpec(state, math) : ft.snapshot;
      if (spec && ft.alpha > 0.001) {
        spec.tiles.forEach(tk => spellFlowerMap.set(tk, { col: spec.col, unp: spec.unp, alpha: ft.alpha }));
      }
    }

    // 3.1. High-Performance Offscreen Background Cache (Static hex grid + concentric ring outlines)
    if (!state.matchStarted) {
      // Wait for Begin Match before spawning board tiles & ring boundaries
    } else if (this.renderMatchStartBackground?.(ctx, state, math, boardR, cState, bz, dt)) {
      // Active ring-by-ring Match Start spawn & boundary fade-in pass
    } else if (this.renderMatchEndBackground?.(ctx, state, math, boardR, cState, bz, dt)) {
      // Active reverse ring-by-ring Match End despawn pass
    } else {
      const subBorderCol = cState.subBorderColor || cState.boardBorderColor || '#3d6eff';
      const outerBorderCol = cState.outerBorderColor || '#953ffd';
      const bgKey = `${boardR}_${Math.round(this.baseHexRadius)}_${tBgOp}_${tBorderOp}_${tSteps}_${tStepThick}_${subBorderCol}_${outerBorderCol}`;
      if (this.bgKey !== bgKey || !this.bgCanvas) {
        this.renderBackgroundCache(state, math, boardR, cState, bz);
        this.bgKey = bgKey;
      }
      if (this.bgCanvas) {
        ctx.save();
        ctx.translate(this.originX, this.originY);
        ctx.scale(this.zoom, this.zoom);
        ctx.drawImage(this.bgCanvas, -this.bgOrigin.x, -this.bgOrigin.y);
        ctx.restore();
      }
    }

    // Offscreen fade wrapper for Layers 3.2 - 4.8 during Match End 3 H-Beat object fade-out
    const objAlpha = this.matchEndAnim ? this.getMatchEndObjectsAlpha() : 1.0;
    if (objAlpha <= 0.001) return;
    const outCtx = ctx;
    let fadeW = 0, fadeH = 0;
    if (objAlpha < 0.999 && this.objFadeCanvas && this.objFadeCtx) {
      fadeW = Math.max(1, Math.ceil(frameW));
      fadeH = Math.max(1, Math.ceil(frameH));
      if (this.objFadeCanvas.width !== fadeW || this.objFadeCanvas.height !== fadeH) {
        this.objFadeCanvas.width = fadeW;
        this.objFadeCanvas.height = fadeH;
      }
      this.objFadeCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.objFadeCtx.clearRect(0, 0, fadeW, fadeH);
      this.objFadeCtx.setTransform(1, 0, 0, 1, fadeW * 0.5, fadeH * 0.5);
      ctx = this.objFadeCtx;
    }

    // 3.2. Render Dynamic Tile Overrides (Active Spell Flowers or Locked Sigil Borders)
    if (spellFlowerMap.size > 0 || lockedTileStyles.length > 0) {
      for (const [tKey, f] of spellFlowerMap.entries()) {
        const [fq, fr] = tKey.split(',').map(Number);
        const { x, y } = math.hexToScreen(fq, fr, this.originX, this.originY, this.hexRadius);
        const aMult = (f.alpha !== undefined) ? f.alpha : 1.0;
        if (aMult <= 0.001) continue;
        drawBezelHex(x, y, this.hexRadius - 1.5, f.col, f.col, (f.unp ? backBgOp : tBgOp) * aMult, (f.unp ? backBorderOp : tBorderOp) * aMult);
      }
      for (let i = 0; i < lockedTileStyles.length; i++) {
        const item = lockedTileStyles[i];
        const fCov = spellFlowerMap.has(item.tk) ? (spellFlowerMap.get(item.tk).alpha ?? 1.0) : 0.0;
        const [lq, lr] = item.tk.split(',').map(Number);
        const { x, y } = math.hexToScreen(lq, lr, this.originX, this.originY, this.hexRadius);
        const aMult = ((item.style.alpha !== undefined) ? item.style.alpha : 1.0) * Math.max(0.0, 1.0 - fCov);
        if (aMult <= 0.001) continue;
        drawBezelHex(x, y, this.hexRadius - 1.5, item.style.bg, item.style.stroke, tBgOp * aMult, tBorderOp * aMult);
      }
    }

    // 3.3. PLACEMENT RIPPLES (Layer 5: Floor Shockwaves)
    if (global.BoardRippleRenderer?.renderRipples) {
      global.BoardRippleRenderer.renderRipples(ctx, math, this.originX, this.originY, this.hexRadius, dt);
    }
    if (global.BoardRippleRenderer?.renderDiseaseBoardPulses) {
      global.BoardRippleRenderer.renderDiseaseBoardPulses(ctx, math, this.originX, this.originY, this.hexRadius);
    }

    // 3.5. PLACED BACK-TILES & BASE COMPONENTS (Fortify violet, Disease grey, Weave yellow, Polyhedra)
    const placedBatch = [], overlayList = [];
    const pulseGrey = (Math.sin(this.pulseTime * 2.5) + 1.0) * 0.5;
    const pGreyBg = Math.min(1.0, backBgOp * (0.75 + 0.35 * pulseGrey)), pGreyBorder = Math.min(1.0, backBorderOp * (0.75 + 0.35 * pulseGrey));
    const offBoardPlagues = new Set(Array.from(global.ComponentDisease?.shapes?.values() || []).filter(s => s.offBoard).map(s => s.id));

    for (const tile of state.board.values()) {
      const { x, y } = math.hexToScreen(tile.q, tile.r, this.originX, this.originY, this.hexRadius);
      const effR = this.hexRadius - 1.5;

      // Defer Burn and Phase components/back-tiles to Layer 4.5 (renders over disease and connections)
      if (tile.burned || tile.phased) {
        overlayList.push({ tile, x, y, effR, compR: this.hexRadius * (global.COSMOS_STATE?.placedScale || 0.65) });
        continue;
      }

      if (!tile.color) continue;

      if (tile.seedPhase === undefined) {
        tile.seedPhase = (Math.abs(Math.sin(tile.q * 12.9898 + tile.r * 78.233) * 43758.5453)) % 1.0;
        tile.seedTilt = (Math.abs(Math.cos(tile.q * 39.346 + tile.r * 11.135) * 24634.6345)) % 1.0;
      }
      const compR = this.hexRadius * (global.COSMOS_STATE?.placedScale || 0.65);

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
      } else if (tile.fortified) drawBezelHex(x, y, effR, '#c084fc', '#c084fc', backBgOp * eAlpha, backBorderOp * eAlpha);
      else if (tile.woven) {
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
      }
      else if (tile.color === 'disease') {
        const covered = tile.coveredComponent || (tile.underneath?.color && tile.underneath.color !== 'disease' ? tile.underneath : null);
        if (covered) {
          const rr = global.BoardRippleRenderer;
          let covScale = 1.0;
          const covAnim = rr?.getCoverDamageAnim?.(tile.q, tile.r);
          if (covAnim) {
            covScale = covAnim.scaleCover;
          }
          if (covScale > 0.01 && global.PolyhedronRenderer) {
            global.PolyhedronRenderer.drawComponent(ctx, x, y, compR * covScale, covered.color, this.elapsedTime, false, false, 0.95, tile.seedPhase, tile.seedTilt);
          }
          if (rr?.renderCoverPulse) {
            rr.renderCoverPulse(ctx, math, tile.q, tile.r, this.originX, this.originY, this.hexRadius);
          }
          const covAlpha = (animState && animState.scale !== undefined) ? animState.scale : 1.0;
          if (covAlpha > 0.001) {
            drawBezelHex(x, y, effR, '#64748b', '#94a3b8', pGreyBg * covAlpha, pGreyBorder * covAlpha);
          }
          renderR = compR * 0.80; // 20% shrink for disease tokens covering a component
        } else if (tile.plagueId && offBoardPlagues.has(tile.plagueId)) {
          const sh = global.ComponentDisease?.shapes?.get(tile.plagueId);
          const gAlpha = (sh && sh.greyBackTileAlpha !== undefined) ? sh.greyBackTileAlpha : 1.0;
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
    global.TurnLogPlayer?.renderOutgoingComponents?.(ctx, math, this.originX, this.originY, this.hexRadius, this.elapsedTime);

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
        const sp = (Math.abs(Math.sin(dmg.q * 12.9898 + dmg.r * 78.233) * 43758.5453)) % 1.0, st = (Math.abs(Math.cos(dmg.q * 39.346 + dmg.r * 11.135) * 24634.6345)) % 1.0;
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

    // 4.5. PLACED PHASED & BURNED COMPONENTS (Renders over disease, under spell cursors)
    if (overlayList.length > 0) {
      const overlayBatch = [];
      for (const p of overlayList) {
        if (p.tile.seedPhase === undefined) {
          p.tile.seedPhase = (Math.abs(Math.sin(p.tile.q * 12.9898 + p.tile.r * 78.233) * 43758.5453)) % 1.0;
          p.tile.seedTilt = (Math.abs(Math.cos(p.tile.q * 39.346 + p.tile.r * 11.135) * 24634.6345)) % 1.0;
        }
        const animState = global.BoardRippleRenderer?.getTileAnimState?.(p.tile.q, p.tile.r);
        const animScale = (animState && animState.scale !== undefined) ? animState.scale : 1.0;
        const uRadius = p.tile.burned ? (p.compR * animScale) : p.compR;
        if (p.tile.underneath?.color && global.PolyhedronRenderer && uRadius > 0.001) {
          const uAlpha = (animScale < 0.5) ? 1.0 : 0.95;
          global.PolyhedronRenderer.drawComponent(ctx, p.x, p.y, uRadius, p.tile.underneath.color, this.elapsedTime, false, false, uAlpha, p.tile.seedPhase, p.tile.seedTilt);
        }
        let eAlpha = (animState && animState.enchantmentAlpha !== undefined) ? animState.enchantmentAlpha : 1.0;
        const oLogAlpha = global.TurnLogPlayer?.getTileAlpha?.(p.tile.q, p.tile.r) ?? 1.0;
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
    }

    // 4.6. SELECTION, SPELL & SIGIL CURSORS (Layered over placed phase; Sigil cursor over flowers)
    if (global.BoardCursorRenderer?.drawCursors) {
      global.BoardCursorRenderer.drawCursors(ctx, math, data, this.originX, this.originY, this.hexRadius, this.pulseTime);
    } else if (global.BoardOverlayRenderer?.drawCursors) {
      global.BoardOverlayRenderer.drawCursors(ctx, math, data, this.originX, this.originY, this.hexRadius, this.pulseTime);
    }

    // 4.7. DORMANT EMBLEMS (Layered under connections)
    if (global.BoardOverlayRenderer?.drawDormantSigilMarkers) {
      global.BoardOverlayRenderer.drawDormantSigilMarkers(ctx, math, this.originX, this.originY, this.hexRadius, this.pulseTime);
    }

    // 4.8. RESONANCE CONNECTIONS & PLASMA ARCS (Layered OVER dormant emblems, UNDER placement ghosts & active emblems)
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
    if (ctx !== outCtx && fadeW > 0 && fadeH > 0) {
      outCtx.save();
      outCtx.globalAlpha *= objAlpha;
      outCtx.drawImage(this.objFadeCanvas, -fadeW * 0.5, -fadeH * 0.5);
      outCtx.restore();
    }
  };

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Board_Renderer_1.1', global.BoardRenderer);

})(typeof window !== 'undefined' ? window : this);

