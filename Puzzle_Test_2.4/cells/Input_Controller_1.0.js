/**
 * @fileoverview Input_Controller_1.0.js - Mouse, Touch & Board Click Targeting Controller
 * @description Coordinates mouse tracking, drag detection, piece placement snapping,
 * double-click camera resets, and elemental spell targeting click delegation.
 * Part 1 of multi-part InputController cell (accompanied by Input_Controller_1.1.js).
 */

(function(global) {
  'use strict';

  class InputControllerClass {
    constructor() {
      this.canvas = null;
      this.initialized = false;

      // Mouse & Drag State
      this.mouseDownX = 0;
      this.mouseDownY = 0;
      this.isMouseDown = false;
      this.hasDragged = false;
      this.dragThreshold = 6; // Pixels
    }

    isAnyCanvasOpen() {
      return !!(global.StatCanvas?.isOpen?.() || global.GameSettingsCanvas?.isOpen?.() || global.CanvasHub?.isOpen?.() || global.SigilNookCanvas?.isOpen?.() || global.SigilEmblemStudio?.isOpen?.() || (global.HexUIEngine?.studioOverlay?.visible));
    }

    /**
     * Initializes input listeners on the board canvas and window.
     * @param {HTMLCanvasElement} canvasElement - Canvas 2D scene graph element
     */
    init(canvasElement) {
      if (this.initialized || !canvasElement) return;
      this.canvas = canvasElement;

      this.bindMouseEvents();
      if (typeof this.bindKeyboardEvents === 'function') {
        this.bindKeyboardEvents();
      }
      this.initialized = true;
    }

    /**
     * Binds mouse and touch events on the canvas.
     */
    bindMouseEvents() {
      const canvas = this.canvas;
      if (!canvas) return;

      const getScreenPos = (e) => {
        const t = (e.touches && e.touches[0]) ? e.touches[0] : ((e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e);
        const clientX = t.clientX ?? 0;
        const clientY = t.clientY ?? 0;
        if (global.HexUIEngine?.isPortrait) {
          return { x: clientY, y: window.innerWidth - clientX };
        }
        const rect = canvas.getBoundingClientRect();
        const sx = rect.width > 0 ? (canvas.width / rect.width) : 1;
        const sy = rect.height > 0 ? (canvas.height / rect.height) : 1;
        return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
      };

      // 1. Mouse Move: Hover tracking & Drag delta
      canvas.addEventListener('mousemove', (e) => {
        const pos = getScreenPos(e);
        const state = global.GameState;
        const renderer = global.BoardRenderer;
        const engine = global.HexUIEngine;

        if (this.isMouseDown) {
          const dist = Math.hypot(e.clientX - this.mouseDownX, e.clientY - this.mouseDownY);
          if (dist > this.dragThreshold) {
            this.hasDragged = true;
          }
        }

        if (this.isAnyCanvasOpen() || !state?.matchStarted || state?.isMatchStarting || state?.isMatchEnding) {
          if (state) state.hoveredHex = null;
          return;
        }
        // Only track board hover if not hitting a sidebar UI node
        if (state && renderer && engine) {
          const hit = engine.hitTestNode(engine.root, pos.x, pos.y);
          if (!hit || hit === engine.boardFrame || hit === engine.root) {
            const hex = renderer.screenToAxial(pos.x, pos.y);
            state.hoveredHex = (hex && global.HexMath && global.HexMath.hexDistance(hex.q, hex.r) <= state.boardRadius + 3) ? hex : null;
          } else {
            state.hoveredHex = null;
          }
        }
      });

      canvas.addEventListener('mouseleave', () => {
        if (global.GameState) global.GameState.hoveredHex = null;
        this.isMouseDown = false;
        this.hasDragged = false;
      });

      // 2. Mouse & Touch Down: Track start of potential drag
      canvas.addEventListener('mousedown', (e) => {
        if (this.isAnyCanvasOpen() || !global.GameState?.matchStarted || global.GameState?.isMatchStarting || global.GameState?.isMatchEnding) return;
        this.isMouseDown = true;
        this.hasDragged = false;
        this.mouseDownX = e.clientX;
        this.mouseDownY = e.clientY;
      });

      canvas.addEventListener('touchstart', (e) => {
        if (this.isAnyCanvasOpen() || !global.GameState?.matchStarted || global.GameState?.isMatchStarting || global.GameState?.isMatchEnding) return;
        this.isMouseDown = true;
        this.hasDragged = false;
        const t = e.touches[0] || {};
        this.mouseDownX = t.clientX ?? 0;
        this.mouseDownY = t.clientY ?? 0;
      }, { passive: true });

      // 3. Window Mouse & Touch Up: Detect clicks vs pans on board
      window.addEventListener('mouseup', (e) => {
        if (!this.isMouseDown) return;
        this.isMouseDown = false;

        // If not dragged and target is our canvas, handle click
        if (!this.hasDragged && e.target === canvas) {
          const pos = getScreenPos(e);
          this.handleBoardClick(pos.x, pos.y);
        }
        this.hasDragged = false;
      });

      window.addEventListener('touchend', (e) => {
        if (!this.isMouseDown) return;
        this.isMouseDown = false;
        if (!this.hasDragged && e.target === canvas) {
          const t = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e;
          const pos = getScreenPos(t);
          this.handleBoardClick(pos.x, pos.y);
        }
        this.hasDragged = false;
      }, { passive: true });

      // 4. Mouse Wheel: Shift + Wheel rotates piece, otherwise camera zooms
      canvas.addEventListener('wheel', (e) => {
        if (this.isAnyCanvasOpen() || !global.GameState?.matchStarted || global.GameState?.isMatchStarting || global.GameState?.isMatchEnding || global.GameState?.cameraLocked) return;
        const state = global.GameState, engine = global.HexUIEngine;
        if (!state) return;

        // Check if cursor is over the board frame
        const pos = getScreenPos(e);
        const hit = engine ? engine.hitTestNode(engine.root, pos.x, pos.y) : null;
        const isOverBoard = !hit || hit === engine?.boardFrame || hit === engine?.root;

        if (e.shiftKey && isOverBoard) {
          e.preventDefault();
          state.rotatePiece(e.deltaY > 0 ? 'cw' : 'ccw');
        }
      }, { passive: false });

      // 5. Double Click: Reset camera
      canvas.addEventListener('dblclick', (e) => {
        if (this.isAnyCanvasOpen() || global.GameState?.cameraLocked) return;
        const engine = global.HexUIEngine, pos = getScreenPos(e);
        const hit = engine ? engine.hitTestNode(engine.root, pos.x, pos.y) : null;
        if (!hit || hit === engine?.boardFrame || hit === engine?.root) {
          if (global.BoardRenderer) global.BoardRenderer.resetCamera();
          if (global.AudioSynth) global.AudioSynth.playClick();
        }
      });
    }

    /**
     * Handles single click on the board canvas.
     * Snaps cursor or places piece on board.
     * @param {number} sx - Screen pixel X
     * @param {number} sy - Screen pixel Y
     */
    handleBoardClick(sx, sy) {
      if (this.isAnyCanvasOpen()) return;
      const state = global.GameState, renderer = global.BoardRenderer, engine = global.HexUIEngine, math = global.HexMath, audio = global.AudioSynth;
      if (!state || !renderer || !math || !state.matchStarted || state.isMatchStarting || state.isMatchEnding || state.isSequentialPlacing) return;

      // Ensure click is within board frame and not on sidebars
      if (engine) {
        const hit = engine.hitTestNode(engine.root, sx, sy);
        if (hit && hit !== engine.boardFrame && hit !== engine.root) return;
      }

      const hex = renderer.screenToAxial(sx, sy);
      if (!hex) return;

      // Max allowable placement reach is boardRadius + 3 (overhangs allowed)
      if (math.hexDistance(hex.q, hex.r) > state.boardRadius + 3) return;

      // Handle active elemental spell targeting modes if engaged
      if (state.inShiftMode && global.SpellShift) {
        this.handleShiftClick(hex);
        return;
      }
      if (state.inArchMode && global.SpellArch) {
        this.handleArchClick(hex);
        return;
      }
      if (state.inRitualMode && global.SpellRitual) {
        this.handleRitualClick(hex);
        return;
      }
      if (state.inManifestMode && global.SpellManifest) {
        this.handleManifestClick(hex);
        return;
      }
      if (state.inTeleportMode || state.inChargeMode || state.inSigilStage) {
        this.handleVertexClick(hex);
        return;
      }

      // Standard Tetrahex Piece Placement
      if (!state.placedThisTurn) {
        if (state.activeMaterialMod === 'weave' && global.SpellWeave?.placedTiles?.length >= 4) {
          state.placeActiveMaterial();
          return;
        }
        if (!state.isMaterialSelected) {
          state.isMaterialSelected = true;
          state.selectedTrayIndex = 0;
        }
        const cursor = state.placementCursor;
        const isSameHex = cursor && cursor.q === hex.q && cursor.r === hex.r;

        if (isSameHex) {
          // Second click on same tile: Attempt piece placement
          if (state.canPlaceMaterialAt(hex.q, hex.r)) {
            state.placeActiveMaterial();
          } else {
            if (audio) audio.playCancel();
            state.showToast('⚠️ Cannot place here (must anchor on an empty board tile)!');
          }
        } else {
          // Snap cursor to clicked tile
          state.placementCursor = { q: hex.q, r: hex.r };
          if (audio) audio.playClick();
          state.syncUI();
        }
      }
    }

    handleShiftClick(hex) {
      const shift = global.SpellShift;
      if (!shift) return;
      if (shift.stage === 'zone') {
        shift.zoneCursor = { q: hex.q, r: hex.r };
        global.AudioSynth?.playClick?.();
      } else {
        const key = `${hex.q},${hex.r}`;
        if (shift.allowedTiles && shift.allowedTiles.has(key)) {
          shift.componentCursor = { q: hex.q, r: hex.r };
          shift.triggerComponentAction?.();
        } else {
          global.AudioSynth?.playCancel?.();
          global.UISidebars?.showToast?.('⚠️ Target tile is outside the flower zone!');
        }
      }
      global.GameState?.syncUI?.();
    }

    handleArchClick(hex) {
      const arch = global.SpellArch;
      if (!arch || arch.isPlaced) return;
      arch.zoneCursor = { q: hex.q, r: hex.r };
      arch.updatePreview?.();
      global.AudioSynth?.playClick?.();
      global.GameState?.syncUI?.();
    }

    handleRitualClick(hex) {
      const ritual = global.SpellRitual;
      if (!ritual) return;
      if (ritual.stage === 'zone') {
        ritual.zoneCursor = { q: hex.q, r: hex.r };
        global.AudioSynth?.playClick?.();
      } else {
        const key = `${hex.q},${hex.r}`;
        if (ritual.allowedTiles && ritual.allowedTiles.has(key)) {
          ritual.componentCursor = { q: hex.q, r: hex.r };
          ritual.triggerComponentAction?.();
        } else {
          global.AudioSynth?.playCancel?.();
          global.UISidebars?.showToast?.('⚠️ Target tile is outside the flower zone!');
        }
      }
      global.GameState?.syncUI?.();
    }

    handleManifestClick(hex) {
      const manifest = global.SpellManifest;
      if (!manifest) return;
      if (manifest.stage === 'zone') {
        manifest.zoneCursor = { q: hex.q, r: hex.r };
        global.AudioSynth?.playClick?.();
      } else {
        const key = `${hex.q},${hex.r}`;
        if (manifest.allowedTiles && manifest.allowedTiles.has(key)) {
          manifest.componentCursor = { q: hex.q, r: hex.r };
          manifest.triggerComponentAction?.();
        } else {
          global.AudioSynth?.playCancel?.();
          global.UISidebars?.showToast?.('⚠️ Target tile is outside the flower zone!');
        }
      }
      global.GameState?.syncUI?.();
    }

    handleVertexClick(hex) {
      const state = global.GameState;
      const math = global.HexMath;
      if (!state || !hex || !math) return;

      const key = `${hex.q},${hex.r}`;
      let v = null;

      // 1. If clicked tile belongs to a candidate sigil, snap directly to its vertex
      const cand = (state.allCandidates || []).find(c => c.tiles && c.tiles.includes(key));
      if (cand && typeof math.findVertexForTiles === 'function') {
        v = math.findVertexForTiles(cand.tiles);
      }

      // 2. Otherwise snap directly to vertex anchored at clicked hex
      if (!v) {
        v = { type: 'up', q: hex.q, r: hex.r };
      }

      const isSameVertex = state.sigilCursorVertex && v &&
        state.sigilCursorVertex.type === v.type &&
        state.sigilCursorVertex.q === v.q &&
        state.sigilCursorVertex.r === v.r;

      state.sigilCursorVertex = v;
      state.selectedSigilId = cand ? cand.id : null;

      if (state.inTeleportMode && isSameVertex) {
        state.placeActiveMaterial();
        return;
      }

      if (state.inSigilStage && isSameVertex) {
        state.placeActiveMaterial();
        return;
      }

      global.AudioSynth?.playClick?.();
      state.syncUI();
      if (global.BoardRenderer) global.BoardRenderer.render();
    }
  }

  global.InputControllerClass = InputControllerClass;

})(typeof window !== 'undefined' ? window : this);
