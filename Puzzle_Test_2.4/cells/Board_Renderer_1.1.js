/**
 * @fileoverview Board_Renderer_1.1.js - Canvas Board Aperture Master Pipeline
 * @description Executes the master multi-layer render pipeline inside the Hex_UI_Engine
 * boardFrame aperture: world grid lattice, mirror spine, background cache/animations,
 * dynamic tile bezels, and delegates placed entities & FX to Board_Renderer_1.2.js
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
   * Shared HexBezelRenderer wrapper for dynamic board tile borders & overlays.
   * Uses a zoom-scoped offscreen stamp cache for unrotated tiles to eliminate per-tile ctx.clip() overhead.
   */
  proto._drawBoardBezelHex = function(ctx, math, cState, bz, hx, hy, hr, fillCol, glowCol, bgOp, borderOp, outerCol = null, rotationRad = 0) {
    if (!bz) return math.drawHexagon(ctx, hx, hy, hr, fillCol, glowCol, 2.0);
    const tStepDec = cState.tileStepDecrement ?? 0.25, tSteps = cState.tileInnerSteps ?? 3, tStepThick = cState.tileStepThickness ?? 2.0;
    const cZoom = this.zoom || 1.0;

    if (!rotationRad && hr > 4 && typeof document !== 'undefined' && Math.abs((this.zoom || 1) - (this.targetZoom || 1)) < 0.005) {
      const rKey = Math.round(hr * 2);
      if (this._tileBezelZoomKey !== rKey) {
        this._tileBezelZoomKey = rKey;
        this._tileBezelCache = new Map();
      }
      const cache = this._tileBezelCache || (this._tileBezelCache = new Map());
      const bgQ = Math.round(Math.max(0, Math.min(1, bgOp)) * 50);
      const bdQ = Math.round(Math.max(0, Math.min(1, borderOp)) * 50);
      const key = `${fillCol}|${glowCol}|${bgQ}|${bdQ}|${outerCol || ''}|${tSteps}|${tStepThick}|${tStepDec}`;
      let stamp = cache.get(key);
      if (!stamp) {
        if (cache.size >= 64) cache.clear();
        const pad = outerCol ? Math.ceil(7 * cZoom * 2 + 8) : 6;
        const half = Math.ceil(hr + pad);
        const size = half * 2;
        const sc = document.createElement('canvas');
        sc.width = size; sc.height = size;
        const sCtx = sc.getContext('2d');
        const verts = UNIT_HEX_CORNERS.map(c => ({ x: half + hr * c.cos, y: half + hr * c.sin }));
        const style = {
          bgColor: fillCol, bgOpacity: bgQ / 50, strokeColor: glowCol, strokeOpacity: bdQ / 50,
          innerHighlight: {
            enabled: true, color: glowCol, steps: tSteps, stepThickness: tStepThick,
            borderOpacity: bdQ / 50, stepDecrement: tStepDec, zoom: cZoom, drawBoundaryLine: false
          }
        };
        if (outerCol) style.outerHighlight = { enabled: true, color: outerCol, steps: 3, reach: 7 * cZoom, intensity: 0.95 };
        bz.renderFrameBezel(sCtx, verts, style);
        stamp = { canvas: sc, half };
        cache.set(key, stamp);
      }
      ctx.drawImage(stamp.canvas, hx - stamp.half, hy - stamp.half);
      return;
    }

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

  /**
   * Collects locked/deactivating sigil tile border styles and active spell flower tiles.
   */
  proto._collectDynamicTileOverrides = function(state, math) {
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
          tileAlpha *= (global.TurnLogPlayer?.getSigilAlpha?.(s.id) ?? 1.0);
          if (tileAlpha > 0.001) {
            const style = { bg: elem?.color || '#ffffff', stroke: elem?.secondary || elem?.sec || '#38bdf8', alpha: tileAlpha };
            s.tiles.forEach(tk => lockedTileStyles.push({ tk, style }));
          }
        }
      });
    }
    const outSigilStyles = global.TurnLogPlayer?.getOutgoingLockedTileStyles?.(global.BoardOverlayRenderer);
    if (outSigilStyles && outSigilStyles.length > 0) {
      for (let i = 0; i < outSigilStyles.length; i++) lockedTileStyles.push(outSigilStyles[i]);
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
    return { lockedTileStyles, spellFlowerMap };
  };

  /**
   * Master render pass inside the Hex_UI_Engine boardFrame aperture.
   */
  proto.renderInsideFrame = function(ctx, localOriginX = 0, localOriginY = 0, boardFrameNode = null, dt = undefined) {
    const state = global.GameState;
    const math = global.HexMath;
    const data = global.MaterialsData;
    if (!state || !math) return;

    const nowMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (dt === undefined || dt === null) {
      dt = this._lastFrameMs ? Math.min(0.1, Math.max(0.001, (nowMs - this._lastFrameMs) * 0.001)) : 0.016;
    }
    this._lastFrameMs = nowMs;

    this.elapsedTime += dt;
    this.pulseTime += 2.5 * dt;
    global.TurnLogPlayer?.update?.();

    // Smooth Camera Lerp Interpolation
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

    const frameW = boardFrameNode ? (boardFrameNode.dimensions?.wBase || boardFrameNode.width || 900) : (this.canvas ? this.canvas.width : 900);
    const frameH = boardFrameNode ? (boardFrameNode.dimensions?.hBase || boardFrameNode.height || 790) : (this.canvas ? this.canvas.height : 790);
    const boardR = state.boardRadius || 6;
    this.baseHexRadius = Math.min(frameW, frameH) / (6 * 2 + 3.8);
    this.hexRadius = this.baseHexRadius * this.zoom;
    this.originX = localOriginX + this.panX; this.originY = localOriginY + this.panY;

    if (this.currentBoardRadius !== boardR) {
      this.currentBoardRadius = boardR;
      this.resetCamera();
    }

    // 1. RENDER 1-RING PERCH FLOWER WORLD GRID
    if (math.PERCH_FLOWER_PERCHES) {
      const perchStepPx = this.hexRadius * 12 * Math.sqrt(3);
      const perchRadiusPx = this.hexRadius * 12;
      ctx.save();
      for (const perch of math.PERCH_FLOWER_PERCHES) {
        const pt = math.axialToOffset(perch.q, perch.r, perchStepPx);
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = (perch.q === 0 && perch.r === 0) ? 'rgba(56, 189, 248, 0.16)' : 'rgba(56, 189, 248, 0.05)';
        ctx.lineWidth = 1;
        math.drawHexagon(ctx, this.originX + pt.x, this.originY + pt.y, perchRadiusPx - 2, null, ctx.strokeStyle, 1);
      }
      ctx.restore();
    }

    // 2. CENTRAL BILATERAL MIRROR SPINE (q == r, X = 0)
    ctx.save();
    ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(56, 189, 248, 0.20)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(this.originX, -frameH * 0.5 + 20); ctx.lineTo(this.originX, frameH * 0.5 - 20); ctx.stroke();
    ctx.restore();

    // 3. RENDER BOARD OBJECT TILES & DYNAMIC LAYERS
    const cState = global.COSMOS_STATE || {};
    const tBgOp = cState.tileBgOpacity ?? 0.20, tBorderOp = cState.tileBorderOpacity ?? 0.60;
    const tSteps = cState.tileInnerSteps ?? 3, tStepThick = cState.tileStepThickness ?? 2.0;
    const bz = global.HexBezelRenderer;
    const backBgOp = Math.min(1.0, tBgOp + 0.20), backBorderOp = Math.min(1.0, tBorderOp + 0.20);
    const ghostBgOp = Math.min(1.0, backBgOp + 0.20), ghostBorderOp = Math.min(1.0, backBorderOp + 0.20);

    const { lockedTileStyles, spellFlowerMap } = this._collectDynamicTileOverrides(state, math);

    // 3.1. Offscreen Background Cache or Match Start/End Background Transition
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

    const drawBezelHex = (hx, hy, hr, fillCol, glowCol, bgOp = tBgOp, borderOp = tBorderOp, outerCol = null, rotationRad = 0) => {
      this._drawBoardBezelHex(ctx, math, cState, bz, hx, hy, hr, fillCol, glowCol, bgOp, borderOp, outerCol, rotationRad);
    };

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

    // 3.3. PLACEMENT RIPPLES & DISEASE BOARD PULSES (Layer 5)
    if (global.BoardRippleRenderer?.renderRipples) {
      global.BoardRippleRenderer.renderRipples(ctx, math, this.originX, this.originY, this.hexRadius, dt);
    }
    if (global.BoardRippleRenderer?.renderDiseaseBoardPulses) {
      global.BoardRippleRenderer.renderDiseaseBoardPulses(ctx, math, this.originX, this.originY, this.hexRadius);
    }

    // 3.5 - 4.97. PLACED ENTITIES, DAMAGE/OVERLAY LAYERS & FX STACK (Board_Renderer_1.2.js)
    const renderOpts = { data, drawBezelHex, backBgOp, backBorderOp, ghostBgOp, ghostBorderOp };
    const overlayList = this._renderPlacedComponents ? this._renderPlacedComponents(ctx, state, math, renderOpts) : [];
    this._renderPhasedAndBurnedLayer?.(ctx, overlayList, math, renderOpts);
    this._renderOverlaysAndFX?.(ctx, state, math, data, renderOpts);

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
