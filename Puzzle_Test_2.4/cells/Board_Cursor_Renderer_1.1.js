/**
 * @fileoverview cells/Board_Cursor_Renderer_1.1.js - Master Cursor, Halo & Weave Dot Passes
 * @description Renders active spell cursors, Teleport ghost previews, vertex Charge/Warp halos,
 * and Weave indicator dots (Part 2 of multi-part BoardCursorRenderer cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const proto = global.BoardCursorRendererClass?.prototype;
  if (!proto) {
    console.error('[Board_Cursor_Renderer_1.1] BoardCursorRendererClass is not defined. Ensure Board_Cursor_Renderer_1.0.js is loaded first.');
    return;
  }

  /**
   * Renders selection, vertex, and spell-mode cursors (layered UNDER dormant emblems).
   */
  proto.drawCursors = function(ctx, math, data, originX, originY, hexRadius, pulseTime = 0) {
    const state = global.GameState;
    if (!ctx || !state || !math) return;

    ctx.save();

    // 1. Active Spell Mode Zone & Component Cursors
    if (state.inShiftMode && global.SpellShift) {
      const shift = global.SpellShift;
      if (shift.stage === 'zone' && shift.zoneCursor) {
        const isValid = shift.isZoneValidAt ? shift.isZoneValidAt(shift.zoneCursor.q, shift.zoneCursor.r) : true;
        this.drawFlowerCursor(ctx, math, shift.zoneCursor.q, shift.zoneCursor.r, originX, originY, hexRadius, {
          strokeColor: isValid ? '#34d399' : '#ef4444',
          fillColor: isValid ? 'rgba(52, 211, 153, 0.15)' : 'rgba(239, 68, 68, 0.25)'
        });
      } else if (shift.componentCursor) {
        if (shift.placedCenter) {
          this.drawFlowerCursor(ctx, math, shift.placedCenter.q, shift.placedCenter.r, originX, originY, hexRadius, {
            strokeColor: '#34d399',
            fillColor: 'rgba(52, 211, 153, 0.12)',
            tiles: (shift.flowerTiles?.length > 0) ? shift.flowerTiles : null
          });
        }
        const stroke = shift.heldComponent?.woven ? '#fde047' : (shift.heldComponent?.phased ? '#38bdf8' : (shift.heldComponent?.fortified ? '#c084fc' : '#34d399'));
        this.drawComponentCursor(ctx, math, shift.componentCursor.q, shift.componentCursor.r, originX, originY, hexRadius, { strokeColor: stroke });
        if (shift.heldComponent && global.PolyhedronRenderer) {
          const sq = shift.componentCursor.q, sr = shift.componentCursor.r;
          const seedPhase = (Math.abs(Math.sin(sq * 12.9898 + sr * 78.233) * 43758.5453)) % 1.0;
          const seedTilt = (Math.abs(Math.cos(sq * 39.346 + sr * 11.135) * 24634.6345)) % 1.0;
          const { x, y } = math.hexToScreen(sq, sr, originX, originY, hexRadius);
          global.PolyhedronRenderer.drawComponent(ctx, x, y, hexRadius * 0.85, shift.heldComponent.color, pulseTime, false, false, 0.90, seedPhase, seedTilt);
        }
      }
    } else if (state.inRitualMode && global.SpellRitual) {
      const ritual = global.SpellRitual;
      if (ritual.stage === 'zone' && ritual.zoneCursor) {
        const isValid = ritual.isZoneValidAt ? ritual.isZoneValidAt(ritual.zoneCursor.q, ritual.zoneCursor.r) : true;
        this.drawFlowerCursor(ctx, math, ritual.zoneCursor.q, ritual.zoneCursor.r, originX, originY, hexRadius, {
          strokeColor: isValid ? '#38bdf8' : '#ef4444',
          fillColor: isValid ? 'rgba(56, 189, 248, 0.15)' : 'rgba(239, 68, 68, 0.25)'
        });
      } else if (ritual.componentCursor) {
        if (ritual.placedCenter) {
          this.drawFlowerCursor(ctx, math, ritual.placedCenter.q, ritual.placedCenter.r, originX, originY, hexRadius, {
            strokeColor: '#38bdf8',
            fillColor: 'rgba(56, 189, 248, 0.12)'
          });
        }
        const isCopied = !!(ritual.copiedTileKeys && ritual.copiedTileKeys.has(`${ritual.componentCursor.q},${ritual.componentCursor.r}`));
        this.drawComponentCursor(ctx, math, ritual.componentCursor.q, ritual.componentCursor.r, originX, originY, hexRadius, {
          strokeColor: isCopied ? '#64748b' : '#38bdf8'
        });
      }
    } else if (state.inManifestMode && global.SpellManifest) {
      const manifest = global.SpellManifest;
      if (manifest.stage === 'zone' && manifest.zoneCursor) {
        const isValid = manifest.isZoneValidAt ? manifest.isZoneValidAt(manifest.zoneCursor.q, manifest.zoneCursor.r) : true;
        this.drawFlowerCursor(ctx, math, manifest.zoneCursor.q, manifest.zoneCursor.r, originX, originY, hexRadius, {
          strokeColor: isValid ? '#ef4444' : '#f43f5e',
          fillColor: isValid ? 'rgba(239, 68, 68, 0.15)' : 'rgba(244, 63, 94, 0.25)'
        });
      } else if (manifest.componentCursor) {
        if (manifest.placedCenter) {
          this.drawFlowerCursor(ctx, math, manifest.placedCenter.q, manifest.placedCenter.r, originX, originY, hexRadius, {
            strokeColor: '#ef4444',
            fillColor: 'rgba(239, 68, 68, 0.12)'
          });
        }
        const isRing2 = manifest.isCursorInRing2 ? manifest.isCursorInRing2() : false;
        this.drawComponentCursor(ctx, math, manifest.componentCursor.q, manifest.componentCursor.r, originX, originY, hexRadius, {
          strokeColor: isRing2 ? '#eb66ff' : '#ef4444'
        });
      }
      if (manifest.stagedPlacements?.size > 0 && global.PolyhedronRenderer) {
        manifest.stagedPlacements.forEach(dObj => {
          if (!dObj?.placedKey) return;
          const [pq, pr] = dObj.placedKey.split(',').map(Number);
          const { x, y } = math.hexToScreen(pq, pr, originX, originY, hexRadius);
          const seedPhase = (Math.abs(Math.sin(pq * 12.9898 + pr * 78.233) * 43758.5453)) % 1.0;
          const seedTilt = (Math.abs(Math.cos(pq * 39.346 + pr * 11.135) * 24634.6345)) % 1.0;
          global.PolyhedronRenderer.drawComponent(ctx, x, y, hexRadius * 0.75, dObj.color, pulseTime, false, false, 0.95, seedPhase, seedTilt);
        });
      }
    } else if (state.inArchMode && global.SpellArch) {
      const arch = global.SpellArch;
      const center = arch.isPlaced ? arch.placedCenter : arch.zoneCursor;
      if (center) {
        const isValid = arch.isZoneValidAt ? arch.isZoneValidAt(center.q, center.r) : true;
        const flowerTiles = arch.getFlowerTilesFor ? arch.getFlowerTilesFor(center.q, center.r) : null;
        this.drawFlowerCursor(ctx, math, center.q, center.r, originX, originY, hexRadius, {
          strokeColor: arch.isPlaced ? '#fbbf24' : (isValid ? '#f97316' : '#ef4444'),
          fillColor: arch.isPlaced ? 'rgba(251, 191, 36, 0.18)' : (isValid ? 'rgba(249, 115, 22, 0.15)' : 'rgba(239, 68, 68, 0.25)'),
          tiles: flowerTiles
        });
      }
    }

    // 3. Sigil Selection Cursor & Teleport Ghost Preview (Layered OVER flowers, UNDER plasma)
    const isTeleportTransitioning = !!(global.SpellTeleport?.isTransitioning);
    if (state.inTeleportMode && state.teleportHeldSigil && state.sigilCursorVertex) {
      const held = state.teleportHeldSigil, rot = state.teleportRotation || 0;
      const canPlace = global.SpellTeleport?.canPlaceSigilAt
        ? global.SpellTeleport.canPlaceSigilAt(state.sigilCursorVertex, rot)
        : (state.isTeleportLocationVacant ? state.isTeleportLocationVacant(state.sigilCursorVertex) : false);
      const cursorTiles = math.getVertexTiles(state.sigilCursorVertex);
      const comps = held.components || (held.colors ? held.colors.map(c => ({ color: c })) : []);
      const cState = global.COSMOS_STATE || {};
      const ghostBgOp = cState.tileBgOpacity ?? 0.20;
      const ghostBorderOp = cState.tileBorderOpacity ?? 0.60;
      cursorTiles.forEach((tk, idx) => {
        const [cq, cr] = tk.split(',').map(Number);
        const { x, y } = math.hexToScreen(cq, cr, originX, originY, hexRadius);
        const comp = comps[(idx + rot) % 3] || {};
        const colorName = comp.color || held.colors?.[(idx + rot) % 3];
        let bBg = comp.bezelBg;
        let bStroke = comp.bezelStroke || comp.bezelColor;
        if (!bBg || !bStroke) {
          if (comp.burned) { bBg = '#ef4444'; bStroke = '#ef4444'; }
          else if (comp.phased) { bBg = '#2563eb'; bStroke = '#2563eb'; }
          else if (comp.fortified) { bBg = '#c084fc'; bStroke = '#c084fc'; }
          else if (comp.woven) { bBg = '#fde047'; bStroke = '#fde047'; }
          else {
            const elem = held.element ? global.BoardOverlayRenderer?._getElemInfo?.(held.element) : null;
            bBg = elem?.color || '#000000';
            bStroke = elem?.secondary || elem?.sec || '#06b6d4';
          }
        }
        ctx.save();
        this._drawBezelHex(ctx, math, x, y, hexRadius - 1.5, canPlace ? bBg : 'rgba(239, 68, 68, 0.35)', canPlace ? bStroke : '#ef4444', {
          bgOpacity: ghostBgOp,
          borderOpacity: ghostBorderOp
        });
        if (global.PolyhedronRenderer && colorName) {
          const seedPhase = (Math.abs(Math.sin(cq * 12.9898 + cr * 78.233) * 43758.5453)) % 1.0;
          const seedTilt = (Math.abs(Math.cos(cq * 39.346 + cr * 11.135) * 24634.6345)) % 1.0;
          const uScale = global.COSMOS_STATE?.unplacedScale || 0.90;
          global.PolyhedronRenderer.drawComponent(ctx, x, y, hexRadius * uScale, colorName, pulseTime, false, false, canPlace ? 0.90 : 0.60, seedPhase, seedTilt);
        }
        ctx.restore();
      });
    } else if (state.sigilCursorVertex) {
      const ft = this.getFlowerTransition(state);
      let cursorAlpha = 1.0;
      let stroke = '#ffffff';
      let fill = '#ffffff';
      if (state.inChargeMode) {
        if (global.SpellCharge?.isSelecting) {
          const p = (global.SpellCharge?.selectionProgress !== null && global.SpellCharge?.selectionProgress !== undefined)
            ? global.SpellCharge.selectionProgress : 0.0;
          cursorAlpha = Math.min(1.0, Math.max(0.0, p));
          stroke = '#ffffff'; fill = '#ffffff';
        } else {
          const castStart = global.SpellCharge?.castStartTime || state.chargeCastStartTime;
          if (castStart) {
            const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            const prog = Math.min(1.0, Math.max(0.0, (now - castStart) / 1600));
            const r = Math.round(255 + (235 - 255) * prog);
            const g = Math.round(255 + (102 - 255) * prog);
            stroke = `rgb(${r},${g},255)`;
            fill = stroke;
          } else {
            stroke = '#eb66ff'; fill = '#eb66ff';
          }
        }
      } else if (state.inTeleportMode) {
        if (global.SpellTeleport?.isPlacing) {
          const p = global.SpellTeleport?.placementProgress ?? global.BoardRippleRenderer?.materialPlacementProgress ?? 0.0;
          cursorAlpha = Math.min(1.0, Math.max(0.0, p));
          stroke = '#ffffff'; fill = '#ffffff';
        } else if (isTeleportTransitioning) {
          const p = global.BoardRippleRenderer?.materialPickupProgress ?? global.SpellTeleport?.pickupProgress ?? 0.0;
          cursorAlpha = Math.max(0.0, 1.0 - p);
          stroke = '#06b6d4'; fill = '#06b6d4';
        } else {
          const castStart = global.SpellTeleport?.castStartTime || state.teleportCastStartTime;
          if (castStart) {
            const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
            const prog = Math.min(1.0, Math.max(0.0, (now - castStart) / 1600));
            const r = Math.round(255 + (6 - 255) * prog);
            const g = Math.round(255 + (182 - 255) * prog);
            const b = Math.round(255 + (212 - 255) * prog);
            stroke = `rgb(${r},${g},${b})`; fill = stroke;
          } else { stroke = '#06b6d4'; fill = '#06b6d4'; }
        }
      } else if (ft.active || ft.alpha > 0.001) {
        cursorAlpha = state.inSigilStage ? Math.max(0.0, 1.0 - ft.alpha) : 0.0;
        stroke = '#ffffff'; fill = '#ffffff';
      } else if (!state.inSigilStage) {
        cursorAlpha = 0.0;
      }
      const rr = global.BoardRippleRenderer;
      if (rr?.isFadingSigilCursor) cursorAlpha *= (rr.fadingDormantProgress ?? 1.0);
      if (cursorAlpha > 0.001) {
        this.drawSigilCursor(ctx, math, state.sigilCursorVertex, originX, originY, hexRadius, {
          strokeColor: stroke,
          fillColor: fill,
          lineWidth: 3.5,
          cursorAlpha
        });
      }
    }

    ctx.restore();
  };

  /**
   * Renders active spell halos (Warp or Charge) layered directly on top of the board aperture.
   */
  proto.renderActiveHalo = function(ctx, math, originX, originY, hexRadius, pulseTime) {
    const state = global.GameState;
    if (!ctx || !state || !math || !state.sigilCursorVertex) return;
    if (state.inTeleportMode) {
      this.drawSpellHalo(ctx, math, state.sigilCursorVertex, originX, originY, hexRadius, pulseTime, 'warp');
    } else if (state.inChargeMode) {
      this.drawSpellHalo(ctx, math, state.sigilCursorVertex, originX, originY, hexRadius, pulseTime, 'charge');
    }
  };

  /**
   * Renders small rotating component polyhedra on the left and right vertices
   * of the Weave cursor back-tile (in front of the back-tile, behind the center polyhedron).
   */
  proto.drawWeaveCursorDots = function(ctx, cx, cy, radius, activeMat, placedCount, time = null) {
    if (!ctx || placedCount >= 4) return;
    let unplaced = (global.SpellWeave?.inWeaveMode && Array.isArray(global.SpellWeave?.unplacedSlots) && global.SpellWeave.unplacedSlots.length > 0)
      ? global.SpellWeave.unplacedSlots
      : (activeMat?.colors ? activeMat.colors.map((c, i) => ({ slot: i, color: c })).slice(placedCount) : []);
    if (global.SpellWeave?.inWeaveMode && (!global.SpellWeave.unplacedSlots || global.SpellWeave.unplacedSlots.length === 0) && unplaced.length > 0) {
      global.SpellWeave.unplacedSlots = [...unplaced];
    }
    if (!unplaced || unplaced.length === 0) return;

    // 4 immutable slot vertices in pointy-top hex:
    // Slot 0: Top-Left (210°), Slot 1: Bottom-Left (150°), Slot 2: Top-Right (330°), Slot 3: Bottom-Right (30°)
    const vertexIndices = [3, 2, 5, 0];
    const polyRender = global.PolyhedronRenderer;
    const effTime = (time !== null && time !== undefined) ? time : (global.COSMOS_STATE?.time ?? performance.now() * 0.001);
    const miniR = Math.max(5.0, radius * 0.30);

    ctx.save();
    unplaced.forEach(item => {
      const k = vertexIndices[item.slot % vertexIndices.length];
      const a = (Math.PI / 180) * (30 + 60 * k);
      const vx = cx + radius * Math.cos(a);
      const vy = cy + radius * Math.sin(a);
      const cName = item.color;

      if (polyRender?.drawComponent && cName) {
        polyRender.drawComponent(ctx, vx, vy, miniR, cName, effTime, false, false, 1.0, (item.slot % 4) * 0.25, 0);
      } else {
        const hex = global.MaterialsData?.COLOR_MAP?.[cName]?.hex || polyRender?.colors?.[cName] || cName || '#ffffff';
        ctx.beginPath();
        ctx.arc(vx, vy, Math.max(3.0, radius * 0.14), 0, Math.PI * 2);
        ctx.fillStyle = hex;
        ctx.fill();
      }
    });
    ctx.restore();
  };

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Board_Cursor_Renderer_1.1', global.BoardCursorRenderer);
})(typeof window !== 'undefined' ? window : this);
