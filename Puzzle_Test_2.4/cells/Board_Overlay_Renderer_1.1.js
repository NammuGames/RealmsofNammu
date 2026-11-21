/**
 * @fileoverview cells/Board_Overlay_Renderer_1.1.js - Alignment Conduits, Overlays & Ring Outlines
 * @description Renders breathing aurora & plasma Arch alignment conduits, dispatches cursors,
 * and draws concentric ring perimeter bezels.
 */

(function (global) {
  'use strict';

  const BoardOverlayRendererClass = global.BoardOverlayRendererClass;
  if (!BoardOverlayRendererClass) return;

  const proto = BoardOverlayRendererClass.prototype;

  /**
   * Draws animated alignment lines: Aurora for basic alignments, Orange Plasma Arc
   * for Arch conduits, and Resonant Hum for same-body disease components.
   */
  proto.drawAlignments = function (ctx, math, originX, originY, hexRadius, pulseTime = 0, layer = 'all') {
    const state = global.GameState;
    if (!state || !math || !ctx) return;
    const time = (global.COSMOS_STATE?.time !== undefined) ? global.COSMOS_STATE.time : (performance.now() * 0.001);
    const fx = global.AlignmentMotionFX;
    const resolver = global.SigilResolver;

    // 1. Same-Body Disease Components (Resonant Hum)
    if (layer === 'all' || layer === 'disease') {
      if (fx) fx.drawDiseaseConnections(ctx, math, originX, originY, hexRadius, time);
    }
    if (layer === 'disease') return;

    // Check flower cursor transition (0..1)
    const inArch = !!(state.inArchMode && global.SpellArch?.inArchMode);
    const ft = global.BoardCursorRenderer?.getFlowerTransition?.(state) || { alpha: 0, active: false, isArch: inArch, snapshot: null, confirmed: false };
    const flowerAlpha = ft.alpha;
    const oppositeAlpha = Math.max(0.0, Math.min(1.0, 1.0 - flowerAlpha));

    const adjacentPairs = (state.resonantPairs && state.resonantPairs.length > 0)
      ? state.resonantPairs : (global.SigilEngine ? global.SigilEngine.getAdjacentPairs() : []);

    // 2. Adjacent Resonant Sigils (Breathing Aurora) - grows opposite flower fade
    if (oppositeAlpha > 0.001 && (layer === 'all' || layer === 'aurora' || layer === 'aurora_plasma')) {
      const resSigils = state.resonantSigils || resolver?.resonantSigils;

      if (adjacentPairs && adjacentPairs.length > 0) {
        adjacentPairs.forEach(([sA, sB]) => {
          if (sA.detonated || sB.detonated) return;
          if (resSigils && (!resSigils.has(sA.id) || !resSigils.has(sB.id))) return;
          if (resolver?.lockedSigilIds && (!resolver.lockedSigilIds.has(sA.id) || !resolver.lockedSigilIds.has(sB.id))) return;
          const isDead = sA.tiles?.every(tk => !state?.board?.get(tk)?.color) || sB.tiles?.every(tk => !state?.board?.get(tk)?.color);
          if (isDead) return;
          const isDetonating = !!(global.BoardRippleRenderer?.isSigilDetonating?.(sA.id) || global.BoardRippleRenderer?.isSigilDetonating?.(sB.id));
          if (global.SigilEngine?.areSigilsAdjacent && !global.SigilEngine.areSigilsAdjacent(sA, sB)) return;
          if (!sA.vertex && math.findVertexForTiles) sA.vertex = math.findVertexForTiles(sA.tiles);
          if (!sB.vertex && math.findVertexForTiles) sB.vertex = math.findVertexForTiles(sB.tiles);
          const vA = sA.vertex, vB = sB.vertex;
          if (vA && vB) {
            let growProgress = 1.0;
            if (isDetonating) {
              const rr = global.BoardRippleRenderer;
              const aAlpha = rr?.isSigilDetonating?.(sA.id) ? rr.getResonantSigilBackTileAlpha(sA.id) : 1.0;
              const bAlpha = rr?.isSigilDetonating?.(sB.id) ? rr.getResonantSigilBackTileAlpha(sB.id) : 1.0;
              growProgress = Math.min(aAlpha, bAlpha);
            } else if (global.SpellTeleport?.isPickingUp && (sA.id === global.SpellTeleport?.pickingUpSigilId || sB.id === global.SpellTeleport?.pickingUpSigilId)) {
              const p = (global.SpellTeleport?.pickupProgress !== null && global.SpellTeleport?.pickupProgress !== undefined)
                ? global.SpellTeleport.pickupProgress
                : (global.BoardRippleRenderer?.materialPickupProgress ?? 0.0);
              growProgress = Math.max(0.0, 1.0 - p);
            } else if (global.SpellTeleport?.isPlacing && (sA.id === global.SpellTeleport?.placingSigilId || sB.id === global.SpellTeleport?.placingSigilId)) {
              const p = (global.SpellTeleport?.placementProgress !== null && global.SpellTeleport?.placementProgress !== undefined)
                ? global.SpellTeleport.placementProgress
                : (global.BoardRippleRenderer?.materialPlacementProgress ?? 1.0);
              growProgress = Math.min(1.0, Math.max(0.0, p));
            } else if (resolver?.isTransitionActive) {
              const pairKey1 = `${sA.id}:::${sB.id}`, pairKey2 = `${sB.id}:::${sA.id}`;
              if (resolver.growingPairKeys?.has(pairKey1) || resolver.growingPairKeys?.has(pairKey2)
                || resolver.newlyFormedPairKeys?.has(pairKey1) || resolver.newlyFormedPairKeys?.has(pairKey2)) {
                growProgress = resolver.transitionProgress;
              }
            }
            growProgress = Math.min(growProgress, oppositeAlpha, global.TurnLogPlayer?.getAuroraProgress?.(sA.id, sB.id) ?? 1.0);
            if (growProgress <= 0.001) return;

            const pA = math.vertexToScreen(vA, originX, originY, hexRadius);
            const pB = math.vertexToScreen(vB, originX, originY, hexRadius);
            if (sA.vertexId === undefined) sA.vertexId = math.getVertexId ? (math.getVertexId(vA) || (Math.abs(vA.q * 17 + vA.r * 31) + 1)) : 1;
            if (sB.vertexId === undefined) sB.vertexId = math.getVertexId ? (math.getVertexId(vB) || (Math.abs(vB.q * 17 + vB.r * 31) + 2)) : 2;
            const hexWidth = hexRadius * Math.sqrt(3);
            const timeStagger = 3.14 * Math.min(sA.vertexId, sB.vertexId);
            const connTime = time + timeStagger;
            if (fx) fx.drawAurora(ctx, pA, pB, connTime, this._getElemInfo(sA.element), this._getElemInfo(sB.element), 0, hexWidth, growProgress);
          }
        });
      }

      // Retracting Pairs (switched to dormant - reverse animation)
      if (resolver?.isTransitionActive && resolver.retractingPairs?.length > 0) {
        const retractProgress = Math.max(0.0, 1.0 - resolver.transitionProgress) * oppositeAlpha;
        if (retractProgress > 0.001) {
          resolver.retractingPairs.forEach(([sA, sB]) => {
            if (!sA.vertex && math.findVertexForTiles) sA.vertex = math.findVertexForTiles(sA.tiles);
            if (!sB.vertex && math.findVertexForTiles) sB.vertex = math.findVertexForTiles(sB.tiles);
            const vA = sA.vertex, vB = sB.vertex;
            if (vA && vB) {
              const pA = math.vertexToScreen(vA, originX, originY, hexRadius);
              const pB = math.vertexToScreen(vB, originX, originY, hexRadius);
              if (sA.vertexId === undefined) sA.vertexId = math.getVertexId ? (math.getVertexId(vA) || (Math.abs(vA.q * 17 + vA.r * 31) + 1)) : 1;
              if (sB.vertexId === undefined) sB.vertexId = math.getVertexId ? (math.getVertexId(vB) || (Math.abs(vB.q * 17 + vB.r * 31) + 2)) : 2;
              const hexWidth = hexRadius * Math.sqrt(3);
              const timeStagger = 3.14 * Math.min(sA.vertexId, sB.vertexId);
              const connTime = time + timeStagger;
              if (fx) fx.drawAurora(ctx, pA, pB, connTime, this._getElemInfo(sA.element), this._getElemInfo(sB.element), 0, hexWidth, retractProgress);
            }
          });
        }
      }
      global.TurnLogPlayer?.renderOutgoingAurora?.(ctx, math, originX, originY, hexRadius, time, oppositeAlpha, this);
    }

    // 3. Arch Spell Conduit Connections (Orange Plasma Arc)
    // Non-Arch flowers fade existing conduits out/in opposite the flower; Arch fades only its preview
    const baseArchAlpha = ft.isArch ? 1.0 : oppositeAlpha;
    let archZones = (baseArchAlpha > 0.001) ? (state.archZones || []).slice() : [];
    if (inArch) {
      const previewZone = global.BoardCursorRenderer?.getFlowerRenderSpec?.(state, math)?.previewArchZone;
      if (previewZone) archZones.push(previewZone);
    } else if (ft.isArch && !ft.confirmed && ft.snapshot?.previewArchZone && flowerAlpha > 0.001) {
      archZones.push(ft.snapshot.previewArchZone);
    }

    const hasOutPlasma = !!global.TurnLogPlayer?.hasOutgoingPlasma?.();
    if ((layer === 'all' || layer === 'plasma' || layer === 'aurora_plasma') && (archZones.length > 0 || hasOutPlasma)) {
      const sigils = (state.activeSigils && state.activeSigils.length > 0) ? state.activeSigils : (state.allCandidates || []);
      const hexWidth = hexRadius * Math.sqrt(3);
      const seenCaps = new Map();
      const addCap = (pos, rgb, alpha) => {
        if (!pos || alpha <= 0.001) return;
        const k = `${Math.round(pos.x)},${Math.round(pos.y)}`;
        const prev = seenCaps.get(k);
        if (!prev || alpha > prev.alpha) seenCaps.set(k, { pos, rgb, alpha });
      };
      const zoneAlpha = (z) => (z?.id === 'preview_arch' ? flowerAlpha : baseArchAlpha);
      const lp = global.TurnLogPlayer;

      const ENCH_PLASMA_RGB = {
        'lock': '149, 63, 253', // Stone PPR (#953ffd)
        'weave': '255, 247, 0',   // Air YYB (#fff700)
        'phase': '61, 110, 255',  // Water BBY (#3d6eff)
        'burn': '255, 51, 51'    // Fire RRP (#ff3333)
      };
      const getZoneColorRgb = (z) => {
        const ench = (z?.center && global.SpellArch?.getArchEnchantmentAt)
          ? global.SpellArch.getArchEnchantmentAt(z.center.q, z.center.r)
          : (() => {
            const tile = state.board?.get(`${z.center?.q},${z.center?.r}`);
            if (!tile) return null;
            if (tile.fortified) return 'lock';
            if (tile.woven) return 'weave';
            if (tile.phased) return 'phase';
            if (tile.burned) return 'burn';
            return null;
          })();
        return (ench && ENCH_PLASMA_RGB[ench]) || '249, 115, 22';
      };

      // 0. Ensure every Arch center node (confirmed and preview) renders even with no connections
      archZones.forEach(z => {
        if (!z?.center) return;
        const capLogA = (z.id === 'preview_arch') ? 1.0 : (lp?.getPlasmaCapAlpha?.(z.center.q, z.center.r) ?? 1.0);
        const eAlpha = zoneAlpha(z) * capLogA;
        if (eAlpha <= 0.001) return;
        addCap(math.hexToScreen(z.center.q, z.center.r, originX, originY, hexRadius), getZoneColorRgb(z), eAlpha);
      });

      const { interArchEdges, sigilArchEdges, diseaseArchEdges } = global.SigilEngine?.getValidArchConnections
        ? global.SigilEngine.getValidArchConnections(sigils, archZones)
        : { interArchEdges: [], sigilArchEdges: [], diseaseArchEdges: [] };

      // 1. Inter-Arch touching pseudo-sigil connections
      interArchEdges.forEach(([zA, zB]) => {
        if (!zA.center || !zB.center) return;
        const kA = `${zA.center.q},${zA.center.r}`, kB = `${zB.center.q},${zB.center.r}`;
        const edgeKey = `ia:${kA < kB ? `${kA}|${kB}` : `${kB}|${kA}`}`;
        const isPrev = (zA.id === 'preview_arch' || zB.id === 'preview_arch');
        const eAlpha = Math.min(zoneAlpha(zA), zoneAlpha(zB)) * (isPrev ? 1.0 : (lp?.getPlasmaEdgeAlpha?.(edgeKey) ?? 1.0));
        if (eAlpha <= 0.001) return;
        const posA = math.hexToScreen(zA.center.q, zA.center.r, originX, originY, hexRadius);
        const posB = math.hexToScreen(zB.center.q, zB.center.r, originX, originY, hexRadius);
        const rgb = getZoneColorRgb(zA);
        if (fx) fx.drawPlasma(ctx, posA, posB, time, hexWidth, false, rgb, eAlpha);
        addCap(posA, rgb, eAlpha);
        addCap(posB, rgb, eAlpha);
      });

      // 2. Real Sigils to Arch conduits
      sigilArchEdges.forEach(({ sigil, zone }) => {
        if (!zone.center || sigil.detonated) return;
        const edgeKey = `sa:${sigil.id}|${zone.center.q},${zone.center.r}`;
        const eAlpha = zoneAlpha(zone) * (zone.id === 'preview_arch' ? 1.0 : (lp?.getPlasmaEdgeAlpha?.(edgeKey) ?? 1.0));
        if (eAlpha <= 0.001) return;
        const lockedIds = resolver?.lockedSigilIds || state.lockedSigilIds;
        if (lockedIds && !lockedIds.has(sigil.id)) return;
        if (!sigil.vertex && math.findVertexForTiles) sigil.vertex = math.findVertexForTiles(sigil.tiles);
        const vSig = sigil.vertex;
        if (vSig) {
          const posSig = math.vertexToScreen(vSig, originX, originY, hexRadius);
          const posZone = math.hexToScreen(zone.center.q, zone.center.r, originX, originY, hexRadius);
          const rgb = getZoneColorRgb(zone);
          if (fx) fx.drawPlasma(ctx, posSig, posZone, time, hexWidth, false, rgb, eAlpha);
          addCap(posZone, rgb, eAlpha);
        }
      });

      // 3. Burn Arch to disease tokens
      (diseaseArchEdges || []).forEach(({ zone, tileKey }) => {
        if (!zone.center) return;
        const edgeKey = `da:${tileKey}|${zone.center.q},${zone.center.r}`;
        const eAlpha = zoneAlpha(zone) * (zone.id === 'preview_arch' ? 1.0 : (lp?.getPlasmaEdgeAlpha?.(edgeKey) ?? 1.0));
        if (eAlpha <= 0.001) return;
        const [dq, dr] = tileKey.split(',').map(Number);
        const posDis = math.hexToScreen(dq, dr, originX, originY, hexRadius);
        const posZone = math.hexToScreen(zone.center.q, zone.center.r, originX, originY, hexRadius);
        const rgb = ENCH_PLASMA_RGB.burn;
        if (fx) fx.drawPlasma(ctx, posDis, posZone, time, hexWidth, false, rgb, eAlpha);
        addCap(posZone, rgb, eAlpha);
        addCap(posDis, rgb, eAlpha);
      });

      if (hasOutPlasma) {
        lp.renderOutgoingPlasma(ctx, math, originX, originY, hexRadius, time, baseArchAlpha, addCap);
      }

      // Terminal discharge center point & 3 jittery rings layered strictly OVER plasma lines
      if (fx?.drawPlasmaCap) {
        seenCaps.forEach(c => fx.drawPlasmaCap(ctx, c.pos, time, hexWidth, c.rgb, c.alpha));
      }
    }
  };

  // ========================================================================
  // 3. MASTER OVERLAY DISPATCHER PASS
  // ========================================================================

  /**
   * Dispatch cursors to BoardCursorRenderer.
   */
  proto.drawCursors = function (ctx, math, data, originX, originY, hexRadius, pulseTime = 0) {
    if (global.BoardCursorRenderer?.drawCursors) {
      return global.BoardCursorRenderer.drawCursors(ctx, math, data, originX, originY, hexRadius, pulseTime);
    }
  };

  /**
   * Master overlay render pass (Locked vector emblems).
   */
  proto.renderOverlays = function (ctx, math, data, originX, originY, hexRadius, pulseTime = 0) {
    const state = global.GameState;
    if (!ctx || !state || !math) return;

    ctx.save();
    // Active Sigil Markers (Locked Emblems layered OVER connections & cursors)
    this.drawLockedSigilMarkers(ctx, math, originX, originY, hexRadius, pulseTime);
    ctx.restore();
  };

  /**
   * Renders standard white bezel outlines around concentric board rings stepping outward.
   * Outermost ring at 0.80 intensity; inner rings (0, 3, 6, 9 within board) at inactive tile intensity (0.14).
   */
  proto.drawRingOutlines = function (ctx, math, originX, originY, hexRadius, boardRadius = 6, zoom = 1.0, alphaMult = 1.0) {
    if (!ctx || !math || typeof math.getRingVertices !== 'function' || alphaMult <= 0.001) return;

    const cState = global.COSMOS_STATE || {};
    const stepThick = cState.tileStepThickness ?? 2.0;
    const steps = cState.tileInnerSteps ?? 3;
    const stepW = stepThick * zoom;
    const outerRing = boardRadius;
    const interiorRings = [0, 3, 6, 9, 12].filter(r => r < outerRing);
    const subBorderCol = cState.subBorderColor || cState.boardBorderColor || '#3d6eff';
    const outerBorderCol = cState.outerBorderColor || '#953ffd';

    const drawRing = (ring, intensity, color = subBorderCol) => {
      const ringVerts = math.getRingVertices(ring);
      if (!ringVerts || ringVerts.length < 3) return;
      const screenVerts = ringVerts.map(v => math.vertexToScreen(v, originX, originY, hexRadius));
      const stepDec = intensity <= 0.20 ? (intensity / steps) : (cState.tileStepDecrement ?? 0.25);

      ctx.save();
      // Inverted outer-only clip mask (evenodd rule: masks out the polygon interior)
      // Snaps the border strictly to the ring perimeter and steps outward
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < screenVerts.length; i++) {
        const pt = screenVerts[i];
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }
      const reach = steps * stepW;
      const pad = reach * 2.0 + 80;
      ctx.beginPath();
      ctx.rect(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2);
      ctx.moveTo(screenVerts[0].x, screenVerts[0].y);
      for (let i = 1; i < screenVerts.length; i++) ctx.lineTo(screenVerts[i].x, screenVerts[i].y);
      ctx.closePath();
      ctx.clip('evenodd');

      ctx.strokeStyle = color;
      for (let s = steps; s >= 1; s--) {
        ctx.lineWidth = s * stepW * 2.0; // Half clipped inside polygon by evenodd
        ctx.globalAlpha = Math.max(0, intensity - (s - 1) * stepDec) * alphaMult;
        ctx.beginPath();
        ctx.moveTo(screenVerts[0].x, screenVerts[0].y);
        for (let i = 1; i < screenVerts.length; i++) ctx.lineTo(screenVerts[i].x, screenVerts[i].y);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    };

    for (const r of interiorRings) drawRing(r, 0.14, subBorderCol);
    drawRing(outerRing, 0.14, outerBorderCol);
  };

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Board_Overlay_Renderer_1.1', global.BoardOverlayRenderer);
})(typeof window !== 'undefined' ? window : this);
