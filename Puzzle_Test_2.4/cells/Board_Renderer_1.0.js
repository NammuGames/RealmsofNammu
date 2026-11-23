/**
 * @fileoverview Board_Renderer_1.0.js - Canvas Board & Aperture Geometry Engine
 * @description Coordinates board dimensions, camera zoom/pan lerp mechanics, dynamic
 * standard zoom framing, screen-to-axial projections, and offscreen background grid caching
 * (Part 1 of multi-part BoardRenderer cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const UNIT_HEX_CORNERS = Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 180) * (30 + 60 * k);
    return { cos: Math.cos(a), sin: Math.sin(a) };
  });

  class BoardRendererClass {
    constructor() {
      this.canvas = null;
      this.ctx = null;
      this.mountedEngine = null;

      // Board Dimensions & Geometry
      this.hexRadius = 24; this.baseHexRadius = 24;
      this.currentBoardRadius = null;
      this.originX = 0; this.originY = 0;
      this.pulseTime = 0; this.elapsedTime = 0;

      // Camera Zoom & Pan Mechanics
      this.zoom = 1.0; this.targetZoom = 1.0;
      this.panX = 0; this.panY = 0;
      this.targetPanX = 0; this.targetPanY = 0;

      // Offscreen Background Grid & Ring Outline Cache
      this.bgCanvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
      this.bgCtx = this.bgCanvas ? this.bgCanvas.getContext('2d') : null;
      this.bgKey = '';
      this.bgOrigin = { x: 0, y: 0 };
      this.matchStartAnim = null;
      this.matchEndAnim = null;
      this.objFadeCanvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
      this.objFadeCtx = this.objFadeCanvas ? this.objFadeCanvas.getContext('2d') : null;
    }

    /**
     * Mounts the board renderer directly into the Hex_UI_Engine boardFrame aperture.
     */
    mount(hexUIEngine) {
      if (!hexUIEngine) return;
      this.mountedEngine = hexUIEngine;
      hexUIEngine.boardRenderDelegate = (ctx, ox, oy, node) => this.renderInsideFrame(ctx, ox, oy, node);
    }

    /**
     * Optional standalone initialization for fallback canvas drawing.
     * @param {HTMLCanvasElement} canvasElement
     */
    init(canvasElement) {
      this.canvas = canvasElement;
      this.ctx = canvasElement.getContext('2d');
      this.resizeStandalone();
      window.addEventListener('resize', () => this.resizeStandalone());
    }

    /**
     * Calculates the dynamic camera zoom that frames the board's bounding box
     * to maintain a consistent relative visual size, while keeping base tile size fixed.
     * @param {number|null} boardR - Board radius in rings
     * @returns {number}
     */
    getStandardZoom(boardR = null) {
      const state = global.GameState, r = boardR !== null ? boardR : (state?.boardRadius || 6);
      const boxRatio = Math.max((Math.sqrt(3) * (2 * r + 1)) / (13 * Math.sqrt(3)), (3 * r + 2) / 20);
      return (1.0 / boxRatio) * (global.COSMOS_STATE?.zoomBaseScale ?? 0.66);
    }

    getZoomLimits(boardR = null) {
      const base = this.getStandardZoom(boardR), cs = global.COSMOS_STATE || {};
      return { minZoom: Math.max(0.15, base * (1.0 - (cs.zoomOutBuffer ?? 0.20))), maxZoom: Math.max(0.3, cs.zoomClosestTile ?? 1.50) };
    }

    resizeStandalone() {
      if (!this.canvas) return;
      const rect = this.canvas.parentElement ? this.canvas.parentElement.getBoundingClientRect() : this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.ctx.resetTransform();
      this.ctx.scale(dpr, dpr);

      this.baseHexRadius = Math.min(rect.width, rect.height) / (6 * 2 + 3.8);
      this.hexRadius = this.baseHexRadius * this.zoom;
      this.originX = (rect.width * 0.5) + this.panX;
      this.originY = (rect.height * 0.5) + this.panY;
    }

    /**
     * Renders the static empty hex grid and concentric ring outlines onto an offscreen canvas.
     */
    renderBackgroundCache(state, math, boardR, cState, bz) {
      if (!this.bgCanvas || !this.bgCtx) return;
      const hexR = this.baseHexRadius;
      const halfW = Math.ceil((boardR + 1.5) * Math.sqrt(3) * hexR) + 60;
      const halfH = Math.ceil((boardR + 1.5) * 1.5 * hexR + hexR) + 60;
      const w = halfW * 2, h = halfH * 2;

      if (this.bgCanvas.width !== w || this.bgCanvas.height !== h) {
        this.bgCanvas.width = w; this.bgCanvas.height = h;
      } else {
        this.bgCtx.clearRect(0, 0, w, h);
      }
      this.bgOrigin.x = halfW; this.bgOrigin.y = halfH;

      const tBgOp = cState.tileBgOpacity ?? 0.20, tBorderOp = cState.tileBorderOpacity ?? 0.60;
      const tStepDec = cState.tileStepDecrement ?? 0.25, tSteps = cState.tileInnerSteps ?? 3, tStepThick = cState.tileStepThickness ?? 2.0;
      const effR = hexR - 1.5;

      const bgDrawBezel = (hx, hy, hr, fillCol, glowCol, bgOp, borderOp) => {
        if (!bz) return math.drawHexagon(this.bgCtx, hx, hy, hr, fillCol, glowCol, 2.0);
        const verts = UNIT_HEX_CORNERS.map(c => ({ x: hx + hr * c.cos, y: hy + hr * c.sin }));
        const style = {
          bgColor: fillCol, bgOpacity: bgOp, strokeColor: glowCol, strokeOpacity: borderOp,
          innerHighlight: {
            enabled: true, color: glowCol, steps: tSteps, stepThickness: tStepThick,
            borderOpacity: borderOp, stepDecrement: tStepDec, zoom: 1.0, drawBoundaryLine: false
          }
        };
        bz.renderFrameBezel(this.bgCtx, verts, style);
      };

      for (const tile of state.board.values()) {
        const { x, y } = math.hexToScreen(tile.q, tile.r, halfW, halfH, hexR);
        bgDrawBezel(x, y, effR, 'rgba(15, 23, 42, 0.35)', 'rgba(56, 189, 248, 0.14)', tBgOp, tBorderOp);
      }

      if (global.BoardOverlayRenderer?.drawRingOutlines) {
        global.BoardOverlayRenderer.drawRingOutlines(this.bgCtx, math, halfW, halfH, hexR, boardR, 1.0);
      }
    }

    /**
     * Converts a screen pixel coordinate into board axial (q, r).
     * Automatically inverts the Hex_UI_Engine boardFrame matrix if mounted.
     * @param {number} screenX
     * @param {number} screenY
     * @returns {{ q: number, r: number } | null}
     */
    screenToAxial(screenX, screenY) {
      const math = global.HexMath;
      if (!math) return null;
      if (this.mountedEngine?.boardFrame) {
        const frame = this.mountedEngine.boardFrame;
        const local = (typeof frame.screenToLocal === 'function') ? frame.screenToLocal(screenX, screenY) : { x: screenX - (frame.position?.x || 0), y: screenY - (frame.position?.y || 0) };
        return math.screenToHex(local.x - this.panX, local.y - this.panY, 0, 0, this.hexRadius);
      }
      return math.screenToHex(screenX, screenY, this.originX, this.originY, this.hexRadius);
    }

    /**
     * Adjusts target camera zoom with optional focal point.
     * @param {number} newZoom
     * @param {number|null} cursorX
     * @param {number|null} cursorY
     */
    setZoom(newZoom, cursorX = 0, cursorY = 0) {
      if (global.GameState?.cameraLocked) return;
      const { minZoom, maxZoom } = this.getZoomLimits();
      const clamped = Math.max(minZoom, Math.min(maxZoom, newZoom));
      if (cursorX !== null && cursorY !== null && this.targetZoom > 0) {
        const wx = (cursorX - this.targetPanX) / this.targetZoom, wy = (cursorY - this.targetPanY) / this.targetZoom;
        this.targetPanX = cursorX - (wx * clamped);
        this.targetPanY = cursorY - (wy * clamped);
      }
      this.targetZoom = clamped;
      if (global.COSMOS_STATE) { global.COSMOS_STATE.targetZoom = clamped; global.COSMOS_STATE.targetPanX = this.targetPanX; global.COSMOS_STATE.targetPanY = this.targetPanY; }
    }

    panBy(dx, dy) {
      if (global.GameState?.cameraLocked) return;
      this.targetPanX += dx;
      this.targetPanY += dy;
    }
    invalidateBackground() { this.bgKey = ''; }

    _getMatchAnimTimings() {
      const beatSec = global.H_TIMING?.BEAT_SEC ?? (Math.pow(12, 8) / 1420405751.768);
      return {
        beatSec,
        tileSpawnSec: beatSec * 3,
        ringSpacingSec: beatSec * 0.5,
        boundaryFadeSec: beatSec
      };
    }

    startMatchStartAnim(boardR, onComplete = null) {
      this.matchEndAnim = null;
      const { beatSec, tileSpawnSec, ringSpacingSec, boundaryFadeSec } = this._getMatchAnimTimings();
      const totalRingsTime = Math.max(0, boardR) * ringSpacingSec + tileSpawnSec;
      this.matchStartAnim = {
        boardR,
        elapsed: 0,
        tileSpawnSec,
        ringSpacingSec,
        boundaryFadeSec,
        gsfDelaySec: beatSec,
        gsfPlayed: false,
        totalRingsTime,
        totalDuration: totalRingsTime + boundaryFadeSec,
        onComplete
      };
      this.bgKey = '';
    }

    startMatchEndAnim(boardR, options = {}) {
      this.matchStartAnim = null;
      const { beatSec, tileSpawnSec, ringSpacingSec, boundaryFadeSec } = this._getMatchAnimTimings();
      const objectsFadeSec = beatSec * 3;
      const despawnRingsDur = Math.max(0, boardR) * ringSpacingSec + tileSpawnSec;
      this.matchEndAnim = {
        boardR,
        elapsed: 0,
        objectsFadeSec,
        tileSpawnSec,
        ringSpacingSec,
        boundaryFadeSec,
        despawnRingsDur,
        soundDelaySec: objectsFadeSec + beatSec,
        soundPlayed: false,
        useGSF: !!options.useGSF,
        silent: !!options.silent,
        totalDuration: objectsFadeSec + boundaryFadeSec + despawnRingsDur,
        onComplete: options.onComplete || null
      };
      this.bgKey = '';
    }

    cancelMatchStartAnim() {
      this.matchStartAnim = null;
      this.matchEndAnim = null;
      this.bgKey = '';
    }

    _evalOvershootCurve(u) {
      if (u <= 0) return 0.0;
      if (u >= 1) return 1.0;
      const tPeak = 0.6;
      if (u <= tPeak) {
        const k = u / tPeak;
        return 1.20 * (1 - Math.pow(1 - k, 3));
      }
      const k = (u - tPeak) / (1 - tPeak);
      return 1.20 - 0.20 * (k * k * (3 - 2 * k));
    }

    getTileSpawnScale(ring) {
      const anim = this.matchStartAnim;
      if (!anim) return 1.0;
      const localT = anim.elapsed - ring * anim.ringSpacingSec;
      if (localT <= 0) return 0.0;
      return this._evalOvershootCurve(localT / Math.max(0.016, anim.tileSpawnSec));
    }

    getTileDespawnScale(ring) {
      const anim = this.matchEndAnim;
      if (!anim) return 1.0;
      const ringsStart = anim.objectsFadeSec + anim.boundaryFadeSec;
      if (anim.elapsed <= ringsStart) return 1.0;
      const ringOffset = Math.max(0, anim.boardR - ring) * anim.ringSpacingSec;
      const localT = (anim.elapsed - ringsStart) - ringOffset;
      if (localT <= 0) return 1.0;
      const u = Math.min(1.0, localT / Math.max(0.016, anim.tileSpawnSec));
      return this._evalOvershootCurve(1.0 - u);
    }

    getMatchEndObjectsAlpha() {
      const anim = this.matchEndAnim;
      if (!anim) return 1.0;
      if (anim.elapsed >= anim.objectsFadeSec) return 0.0;
      return Math.max(0.0, 1.0 - (anim.elapsed / Math.max(0.016, anim.objectsFadeSec)));
    }

    _drawAnimatedBaseTiles(ctx, state, math, cState, bz, scaleFn) {
      const hexR = this.baseHexRadius;
      const effR = hexR - 1.5;
      const tBgOp = cState.tileBgOpacity ?? 0.20, tBorderOp = cState.tileBorderOpacity ?? 0.60;
      const tStepDec = cState.tileStepDecrement ?? 0.25, tSteps = cState.tileInnerSteps ?? 3, tStepThick = cState.tileStepThickness ?? 2.0;

      for (const tile of state.board.values()) {
        const tileScale = scaleFn(math.hexDistance(tile.q, tile.r));
        if (tileScale <= 0.001) continue;
        const { x, y } = math.hexToScreen(tile.q, tile.r, 0, 0, hexR);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(tileScale, tileScale);
        if (!bz) {
          math.drawHexagon(ctx, 0, 0, effR, 'rgba(15, 23, 42, 0.35)', 'rgba(56, 189, 248, 0.14)', 2.0);
        } else {
          const verts = UNIT_HEX_CORNERS.map(c => ({ x: effR * c.cos, y: effR * c.sin }));
          bz.renderFrameBezel(ctx, verts, {
            bgColor: 'rgba(15, 23, 42, 0.35)', bgOpacity: tBgOp,
            strokeColor: 'rgba(56, 189, 248, 0.14)', strokeOpacity: tBorderOp,
            innerHighlight: {
              enabled: true, color: 'rgba(56, 189, 248, 0.14)', steps: tSteps,
              stepThickness: tStepThick, borderOpacity: tBorderOp, stepDecrement: tStepDec,
              zoom: 1.0, drawBoundaryLine: false
            }
          });
        }
        ctx.restore();
      }
    }

    renderMatchStartBackground(ctx, state, math, boardR, cState, bz, dt) {
      const anim = this.matchStartAnim;
      if (!anim) return false;
      anim.elapsed += Math.min(0.1, Math.max(0, dt));
      if (!anim.gsfPlayed && anim.elapsed >= (anim.gsfDelaySec || 0)) {
        anim.gsfPlayed = true;
        global.AudioSynth?.playGameStartFinish?.();
      }

      ctx.save();
      ctx.translate(this.originX, this.originY);
      ctx.scale(this.zoom, this.zoom);
      this._drawAnimatedBaseTiles(ctx, state, math, cState, bz, r => this.getTileSpawnScale(r));

      if (anim.elapsed >= anim.totalRingsTime && global.BoardOverlayRenderer?.drawRingOutlines) {
        const bAlpha = Math.min(1.0, (anim.elapsed - anim.totalRingsTime) / Math.max(0.016, anim.boundaryFadeSec));
        if (bAlpha > 0.001) {
          global.BoardOverlayRenderer.drawRingOutlines(ctx, math, 0, 0, this.baseHexRadius, boardR, 1.0, bAlpha);
        }
      }
      ctx.restore();

      if (anim.elapsed >= anim.totalDuration) {
        const cb = anim.onComplete;
        this.matchStartAnim = null;
        this.bgKey = '';
        if (typeof cb === 'function') cb();
      }
      return true;
    }

    renderMatchEndBackground(ctx, state, math, boardR, cState, bz, dt) {
      const anim = this.matchEndAnim;
      if (!anim) return false;
      anim.elapsed += Math.min(0.1, Math.max(0, dt));
      if (!anim.soundPlayed && anim.elapsed >= anim.soundDelaySec) {
        anim.soundPlayed = true;
        if (!anim.silent) {
          if (anim.useGSF) global.AudioSynth?.playGameStartFinish?.();
          else global.AudioSynth?.playGameOver?.();
        }
      }
      // During the 3 H-Beat object fade-out, static tiles + boundaries stay full strength via bgCanvas
      if (anim.elapsed < anim.objectsFadeSec) return false;

      ctx.save();
      ctx.translate(this.originX, this.originY);
      ctx.scale(this.zoom, this.zoom);
      this._drawAnimatedBaseTiles(ctx, state, math, cState, bz, r => this.getTileDespawnScale(r));

      const despawnT = anim.elapsed - anim.objectsFadeSec;
      if (despawnT < anim.boundaryFadeSec && global.BoardOverlayRenderer?.drawRingOutlines) {
        const bAlpha = Math.max(0.0, 1.0 - (despawnT / Math.max(0.016, anim.boundaryFadeSec)));
        if (bAlpha > 0.001) {
          global.BoardOverlayRenderer.drawRingOutlines(ctx, math, 0, 0, this.baseHexRadius, boardR, 1.0, bAlpha);
        }
      }
      ctx.restore();

      if (anim.elapsed >= anim.totalDuration) {
        const cb = anim.onComplete;
        this.matchEndAnim = null;
        this.bgKey = '';
        if (typeof cb === 'function') cb();
      }
      return true;
    }

    resetCamera() {
      if (global.GameState?.cameraLocked) return;
      const stdZoom = this.getStandardZoom();
      this.targetZoom = stdZoom; this.targetPanX = 0; this.targetPanY = 0; this.bgKey = '';
      if (global.COSMOS_STATE) {
        global.COSMOS_STATE.targetZoom = stdZoom;
        global.COSMOS_STATE.targetPanX = 0;
        global.COSMOS_STATE.targetPanY = 0;
      }
    }
    render() {}
  }

  BoardRendererClass.UNIT_HEX_CORNERS = UNIT_HEX_CORNERS;

  const boardRendererInstance = new BoardRendererClass();
  global.BoardRendererClass = BoardRendererClass;
  global.BoardRenderer = boardRendererInstance;
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Board_Renderer_1.0', boardRendererInstance);

})(typeof window !== 'undefined' ? window : this);

