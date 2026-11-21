/**
 * @fileoverview cells/Board_Overlay_Renderer_1.0.js - Element Palette, Cursor Proxies & Sigil Markers
 * @description Holds the canonical element color map, cursor proxy helpers, and locked/dormant
 * sigil medallion marker renderers.
 */

(function (global) {
  'use strict';

  const ELEMENT_MAP = {
    feral: { key: 'feral', color: '#a66a26', sec: '#0abd0d', secondary: '#0abd0d', basinBg: '#0abd0d' },
    metal: { key: 'cyber', color: '#b8d1f4', sec: '#ff9214', secondary: '#ff9214', basinBg: '#ff9214' },
    cyber: { key: 'cyber', color: '#b8d1f4', sec: '#ff9214', secondary: '#ff9214', basinBg: '#ff9214' },
    void: { key: 'dark', color: '#000000', sec: '#06b6d4', secondary: '#06b6d4', basinBg: '#06b6d4' },
    dark: { key: 'dark', color: '#000000', sec: '#06b6d4', secondary: '#06b6d4', basinBg: '#06b6d4' },
    solar: { key: 'light', color: '#ffffff', sec: '#eb66ff', secondary: '#eb66ff', basinBg: '#eb66ff' },
    light: { key: 'light', color: '#ffffff', sec: '#eb66ff', secondary: '#eb66ff', basinBg: '#eb66ff' },
    wood: { key: 'wood', color: '#0abd0d', sec: '#953ffd', secondary: '#953ffd', basinBg: '#953ffd' },
    storm: { key: 'storm', color: '#ff9214', sec: '#fff700', secondary: '#fff700', basinBg: '#fff700' },
    ice: { key: 'ice', color: '#06b6d4', sec: '#3d6eff', secondary: '#3d6eff', basinBg: '#3d6eff' },
    heat: { key: 'heat', color: '#eb66ff', sec: '#ff3333', secondary: '#ff3333', basinBg: '#ff3333' },
    stone: { key: 'stone', color: '#953ffd', sec: '#a66a26', secondary: '#a66a26', basinBg: '#a66a26' },
    earth: { key: 'stone', color: '#953ffd', sec: '#a66a26', secondary: '#a66a26', basinBg: '#a66a26' },
    air: { key: 'air', color: '#fff700', sec: '#b8d1f4', secondary: '#b8d1f4', basinBg: '#b8d1f4' },
    water: { key: 'water', color: '#3d6eff', sec: '#000000', secondary: '#000000', basinBg: '#000000' },
    fire: { key: 'fire', color: '#ff3333', sec: '#ffffff', secondary: '#ffffff', basinBg: '#ffffff' }
  };

  class BoardOverlayRendererClass {
    constructor() { }

    // ========================================================================
    // 1. TILE-HIGHLIGHTING CURSOR FUNCTIONS
    // ========================================================================

    _drawBezelHex(ctx, math, x, y, r, fill, stroke, style = {}) {
      return global.BoardCursorRenderer?._drawBezelHex?.(ctx, math, x, y, r, fill, stroke, style);
    }

    drawComponentCursor(ctx, math, q, r, originX, originY, hexRadius, style = {}) {
      return global.BoardCursorRenderer?.drawComponentCursor?.(ctx, math, q, r, originX, originY, hexRadius, style) || [];
    }

    drawSigilCursor(ctx, math, vertex, originX, originY, hexRadius, style = {}) {
      return global.BoardCursorRenderer?.drawSigilCursor?.(ctx, math, vertex, originX, originY, hexRadius, style) || [];
    }

    drawFlowerCursor(ctx, math, centerQ, centerR, originX, originY, hexRadius, style = {}) {
      return global.BoardCursorRenderer?.drawFlowerCursor?.(ctx, math, centerQ, centerR, originX, originY, hexRadius, style) || [];
    }

    // ========================================================================
    // 2. SIGIL SYSTEM VISUAL ENGINE (LOCKED & DORMANT EMBLEMS)
    // ========================================================================

    _getElemInfo(elementName) {
      const key = (elementName || 'fire').toLowerCase();
      return ELEMENT_MAP[key] || ELEMENT_MAP.fire;
    }

    _isVertexSelected(state, v) {
      if (!state || !state.sigilCursorVertex || !v) return false;
      const cv = state.sigilCursorVertex;
      return cv.type === v.type && cv.q === v.q && cv.r === v.r;
    }

    /**
     * Draws green boundary outlines and full procedural vector emblems on active (resolved) sigils.
     */
    drawActiveSigilMarkers(ctx, math, originX, originY, hexRadius, pulseTime) {
      return this.drawLockedSigilMarkers(ctx, math, originX, originY, hexRadius, pulseTime);
    }

    drawLockedSigilMarkers(ctx, math, originX, originY, hexRadius, pulseTime) {
      const state = global.GameState;
      if (!state || !math || !ctx) return;
      const resolver = global.SigilResolver;
      const allCands = (state.allCandidates && state.allCandidates.length > 0)
        ? state.allCandidates
        : (state.activeSigils || []);
      const lockedSigils = allCands.filter(s =>
        (state.lockedSigilIds && state.lockedSigilIds.has(s.id)) ||
        (resolver?.isTransitionActive && resolver?.deactivatingSigilIds?.has(s.id))
      );

      const emblemRenderer = global.SigilEmblemRenderer;
      const pulse = (Math.sin((pulseTime || 0) * 4) + 1) * 0.5;

      (lockedSigils || []).forEach(sigil => {
        if (global.BoardRippleRenderer?.isSigilDetonating?.(sigil.id)) return;
        let emblemScale = 1.0, expAlpha = 1.0;
        const rr = global.BoardRippleRenderer;
        if (global.SpellTeleport?.isPickingUp && sigil.id === global.SpellTeleport?.pickingUpSigilId) {
          const p = (global.SpellTeleport?.pickupProgress !== null && global.SpellTeleport?.pickupProgress !== undefined)
            ? global.SpellTeleport.pickupProgress
            : (global.BoardRippleRenderer?.materialPickupProgress ?? 0.0);
          emblemScale = Math.max(0.0, 1.0 - p);
        } else if (global.SpellTeleport?.isPlacing && sigil.id === global.SpellTeleport?.placingSigilId) {
          const p = (global.SpellTeleport?.placementProgress !== null && global.SpellTeleport?.placementProgress !== undefined)
            ? global.SpellTeleport.placementProgress
            : (global.BoardRippleRenderer?.materialPlacementProgress ?? 1.0);
          emblemScale = Math.min(1.0, Math.max(0.0, p));
        } else if (resolver?.isTransitionActive) {
          if (resolver.newlyFormedSigilIds?.has(sigil.id) || resolver.activatingSigilIds?.has(sigil.id)) {
            emblemScale = resolver.transitionProgress;
          } else if (resolver.deactivatingSigilIds?.has(sigil.id)) {
            emblemScale = Math.max(0.0, 1.0 - resolver.transitionProgress);
          }
        }
        if (rr?.fadingExpiringSigilIds?.has(sigil.id)) {
          const ea = rr.fadingExpiringProgress !== undefined ? rr.fadingExpiringProgress : 1.0;
          expAlpha *= ea;
          emblemScale *= ea;
        }
        const burnAlpha = rr?.getBurnSigilFadeAlpha ? rr.getBurnSigilFadeAlpha(sigil.id) : 1.0;
        if (burnAlpha < 1.0) {
          expAlpha *= burnAlpha;
          emblemScale *= burnAlpha;
        }
        expAlpha *= (global.TurnLogPlayer?.getSigilAlpha?.(sigil.id) ?? 1.0);
        if (emblemScale <= 0.001 || expAlpha <= 0.001) return;

        const elemInfo = this._getElemInfo(sigil.element);
        if (!sigil.vertex && math.findVertexForTiles) sigil.vertex = math.findVertexForTiles(sigil.tiles);
        const v = sigil.vertex;
        const isSelected = this._isVertexSelected(state, v);
        // Vector Emblem Medallion at Center Vertex (Boundary outlines removed per request)
        if (v && emblemRenderer?.renderEmblem) {
          const emblemR = Math.round(hexRadius * 0.60 * emblemScale);
          if (emblemR < 1) return;
          const { x: vx, y: vy } = math.vertexToScreen(v, originX, originY, hexRadius);
          ctx.save();
          if (expAlpha < 1.0) ctx.globalAlpha *= expAlpha;
          ctx.translate(vx, vy);
          emblemRenderer.renderEmblem(ctx, elemInfo, null, isSelected, emblemR, 'wireframe');
          ctx.restore();
        }
      });
      global.TurnLogPlayer?.renderOutgoingSigils?.(ctx, math, originX, originY, hexRadius);
    }

    /**
     * Draws cyan outlines and reduced small versions of emblems on dormant sigils.
     */
    drawDormantSigilMarkers(ctx, math, originX, originY, hexRadius, pulseTime) {
      const state = global.GameState;
      if (!state || !math || !ctx) return;
      const resolver = global.SigilResolver;
      const dormantCands = (state.allCandidates && state.allCandidates.length > 0)
        ? state.allCandidates.filter(c =>
          (state.dormantSigilIds && state.dormantSigilIds.has(c.id)) ||
          (resolver?.isTransitionActive && resolver?.activatingSigilIds?.has(c.id))
        )
        : [];
      if (!dormantCands || dormantCands.length === 0) return;

      const emblemRenderer = global.SigilEmblemRenderer;

      dormantCands.forEach(cand => {
        if (global.BoardRippleRenderer?.isSigilDetonating?.(cand.id)) return;
        if (!cand.vertex && math.findVertexForTiles) cand.vertex = math.findVertexForTiles(cand.tiles);
        const v = cand.vertex;
        if (global.BoardRippleRenderer?.isSigilDetonatingVertex?.(v)) return;
        let dormantScale = 1.0;
        if (global.SpellTeleport?.isPickingUp && Array.isArray(global.SpellTeleport?.pickingUpTiles)) {
          const sharesTile = cand.tiles?.some(tk => global.SpellTeleport.pickingUpTiles.includes(tk));
          if (sharesTile) {
            const p = (global.SpellTeleport?.pickupProgress !== null && global.SpellTeleport?.pickupProgress !== undefined)
              ? global.SpellTeleport.pickupProgress
              : (global.BoardRippleRenderer?.materialPickupProgress ?? 0.0);
            dormantScale = Math.max(0.0, 1.0 - p);
          }
        } else if (global.SpellTeleport?.isPlacing && Array.isArray(global.SpellTeleport?.placementTargetTiles)) {
          const sharesTile = cand.tiles?.some(tk => global.SpellTeleport.placementTargetTiles.includes(tk));
          if (sharesTile) {
            const p = (global.SpellTeleport?.placementProgress !== null && global.SpellTeleport?.placementProgress !== undefined)
              ? global.SpellTeleport.placementProgress
              : (global.BoardRippleRenderer?.materialPlacementProgress ?? 1.0);
            dormantScale = Math.min(1.0, Math.max(0.0, p));
          }
        } else if (resolver?.isTransitionActive && resolver?.newlyFormedSigilIds?.has(cand.id)) {
          dormantScale = resolver.transitionProgress;
        }
        const rr = global.BoardRippleRenderer;
        let expAlpha = 1.0;
        if (rr?.fadingDormantSigilIds?.has(cand.id)) {
          dormantScale *= (rr.fadingDormantProgress !== undefined ? rr.fadingDormantProgress : 1.0);
        }
        if (rr?.fadingExpiringSigilIds?.has(cand.id)) {
          const ea = rr.fadingExpiringProgress !== undefined ? rr.fadingExpiringProgress : 1.0;
          expAlpha *= ea;
          dormantScale *= ea;
        }
        const burnAlpha = rr?.getBurnSigilFadeAlpha ? rr.getBurnSigilFadeAlpha(cand.id) : 1.0;
        if (burnAlpha < 1.0) {
          expAlpha *= burnAlpha;
          dormantScale *= burnAlpha;
        }
        if (dormantScale <= 0.001) return;

        const elemInfo = this._getElemInfo(cand.element);
        const isSelected = this._isVertexSelected(state, v);
        // Reduced Small Version of the Emblem at Center Vertex (Boundary outlines removed per request)
        if (v && emblemRenderer?.renderEmblem) {
          const smallR = Math.round(hexRadius * 0.32 * dormantScale);
          if (smallR < 1) return;
          const { x: vx, y: vy } = math.vertexToScreen(v, originX, originY, hexRadius);
          ctx.save();
          if (expAlpha < 1.0) ctx.globalAlpha *= expAlpha;
          ctx.translate(vx, vy);
          emblemRenderer.renderEmblem(ctx, elemInfo, null, isSelected, smallR, 'dormant');
          ctx.restore();
        }
      });
    }
  }

  const boardOverlayRendererInstance = new BoardOverlayRendererClass();

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Board_Overlay_Renderer_1.0', boardOverlayRendererInstance);
  global.BoardOverlayRendererClass = BoardOverlayRendererClass;
  global.BoardOverlayRenderer = boardOverlayRendererInstance;
})(typeof window !== 'undefined' ? window : this);
