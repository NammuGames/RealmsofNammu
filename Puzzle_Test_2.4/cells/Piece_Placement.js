/**
 * @fileoverview Piece_Placement.js - Material Placement Subsystem & Board Commits
 * @description Validates piece coordinates, manages off-board overhang damage,
 * handles Burn/Phase/Fortify tile mutations, commits material placements,
 * and delegates to SigilResolver and UndoManager.
 */

(function(global) {
  'use strict';

  class PiecePlacementManager {
    /**
     * Checks if active material can be placed anchored at (anchorQ, anchorR).
     * @param {Object} state - GameState instance
     * @param {number} anchorQ
     * @param {number} anchorR
     * @returns {boolean}
     */
    canPlaceMaterialAt(state, anchorQ, anchorR) {
      if (!state || state.gameOver) return false;
      if (state.activeMaterialMod === 'weave') {
        return global.SpellWeave?.canPlaceComponentAt(anchorQ, anchorR) ?? false;
      }
      const mat = state.getActiveMaterial();
      if (!mat || !mat.activeCoords) return false;

      let onBoardCount = 0;
      for (const [dq, dr] of mat.activeCoords) {
        const tile = state.board.get(`${anchorQ + dq},${anchorR + dr}`);
        if (tile) {
          if (tile.color !== null) {
            if (state.activeMaterialMod === 'phase') {
              if (tile.phased) return false; // Phase cannot be placed over Phase!
            } else if (state.activeMaterialMod !== 'burn') {
              return false;
            }
          }
          onBoardCount++;
        }
      }
      return onBoardCount >= 1;
    }

    /**
     * Executes placement of active material at the current placement cursor.
     * @param {Object} state - GameState instance
     * @returns {boolean} True if successfully placed
     */
    placeMaterial(state) {
      if (!state) return false;

      // Weave mode component placement
      if (state.activeMaterialMod === 'weave' && !state.placedThisTurn && global.SpellWeave?.inWeaveMode) {
        return global.SpellWeave.placeComponent();
      }

      if (!state.isMaterialSelected) {
        global.AudioSynth?.playCancel?.();
        state.showToast('Please select Material #1 first!');
        return false;
      }
      if (state.placedThisTurn || state.gameOver) return false;

      const anchorQ = state.placementCursor.q, anchorR = state.placementCursor.r;
      if (!this.canPlaceMaterialAt(state, anchorQ, anchorR)) {
        global.AudioSynth?.playCancel?.();
        state.showToast('⚠️ Cannot place here (must anchor on an empty board tile)!');
        return false;
      }

      const mat = state.getActiveMaterial();
      if (!mat) return false;

      const undoEntry = {
        cursor: { ...state.placementCursor },
        rotation: state.selectedRotation,
        upDownAxisState: state.upDownAxisState,
        onBoardTiles: [],
        previousDamageTiles: [...state.activeDamageTiles],
        previousHp: state.hp,
        previousLockedSigilIds: new Set(state.lockedSigilIds),
        activeMaterialMod: state.activeMaterialMod,
        fortifiedTiles: [],
        thrownPlaguePlacements: [],
        placedMat: state.materialsTray[0],
        diseaseSnapshot: global.ComponentDisease?.createSnapshot?.() || null,
        dissolvedPlagues: []
      };

      const offBoardPlagues = [];
      let offBoardCount = 0;
      let onBoardCount = 0;
      const allBurnKeys = state.activeMaterialMod === 'burn'
        ? new Set(mat.activeCoords.map(([dq, dr]) => `${anchorQ + dq},${anchorR + dr}`))
        : null;

      mat.activeCoords.forEach(([dq, dr], idx) => {
        const tq = anchorQ + dq, tr = anchorR + dr, key = `${tq},${tr}`, tile = state.board.get(key);
        if (tile) {
          const prevColor = tile.color, prevSigilId = tile.sigilId, prevFortified = !!tile.fortified;
          const prevUnderneath = tile.underneath ? { ...tile.underneath } : null;
          const prevPlagueId = tile.plagueId || null, prevCovered = tile.coveredComponent || null;
          const prevPhased = !!tile.phased, prevBurned = !!tile.burned;
          const prevPhaseOwner = tile.phaseOwner || null, prevBurnOwner = tile.burnOwner || null;
          const prevLockOwner = tile.lockOwner || null;

          if (state.activeMaterialMod === 'burn') {
            if (prevPhased) {
              // Mutual Annihilation! Burn placed on Phase
              tile.color = null; tile.sigilId = null; tile.phased = false; tile.phaseOwner = null;
              tile.burned = false; tile.burnOwner = null; tile.fortified = false; tile.lockOwner = null;
              tile.underneath = null; tile.plagueId = null; tile.coveredComponent = null;
              undoEntry.onBoardTiles.push({
                key, color: null, annihilated: true, burned: true, previousColor: prevColor, previousSigilId: prevSigilId,
                previousFortified: prevFortified, previousUnderneath: prevUnderneath, previousPlagueId: prevPlagueId,
                previousPhased: prevPhased, previousBurned: prevBurned, previousPhaseOwner: prevPhaseOwner, previousBurnOwner: prevBurnOwner
              });
            } else {
              // Place over top of existing components (normal, disease, or locked/fortified)
              const pIdFound = tile.plagueId || (tile.color === 'disease' && global.ComponentDisease?.shapes
                ? Array.from(global.ComponentDisease.shapes.values()).find(s => s.components.some(c => c.key === key))?.id
                : null);
              const underSnapshot = (tile.color !== null || prevFortified || pIdFound) ? {
                color: tile.color, sigilId: tile.sigilId || null, fortified: prevFortified,
                lockOwner: tile.lockOwner || null, plagueId: pIdFound || null
              } : null;

              tile.underneath = underSnapshot;
              tile.color = mat.colors[idx];
              tile.burned = true;
              tile.burnOwner = state.currentPlayerId || 1;
              if (mat.colors[idx] !== 'disease') tile.plagueId = null;

              undoEntry.onBoardTiles.push({
                key, color: mat.colors[idx], burned: true, previousColor: prevColor, previousSigilId: prevSigilId,
                previousFortified: prevFortified, previousUnderneath: prevUnderneath, previousPlagueId: prevPlagueId,
                previousPhased: prevPhased, previousBurned: prevBurned, previousPhaseOwner: prevPhaseOwner, previousBurnOwner: prevBurnOwner,
                hadUnderneath: !!underSnapshot
              });
            }
          } else if (state.activeMaterialMod === 'phase') {
            if (prevBurned) {
              // Mutual Annihilation! Phase placed on Burn
              tile.color = null; tile.sigilId = null; tile.phased = false; tile.phaseOwner = null;
              tile.burned = false; tile.burnOwner = null; tile.fortified = false; tile.lockOwner = null;
              tile.underneath = null; tile.plagueId = null; tile.coveredComponent = null;
              undoEntry.onBoardTiles.push({
                key, color: null, annihilated: true, phased: true, previousColor: prevColor, previousSigilId: prevSigilId,
                previousFortified: prevFortified, previousUnderneath: prevUnderneath, previousPlagueId: prevPlagueId,
                previousPhased: prevPhased, previousBurned: prevBurned, previousPhaseOwner: prevPhaseOwner, previousBurnOwner: prevBurnOwner
              });
            } else {
              const pIdFound = tile.plagueId || (tile.color === 'disease' && global.ComponentDisease?.shapes
                ? Array.from(global.ComponentDisease.shapes.values()).find(s => s.components.some(c => c.key === key))?.id
                : null);
              const underSnapshot = (tile.color !== null || prevFortified || pIdFound) ? {
                color: tile.color, sigilId: tile.sigilId || null, fortified: !!tile.fortified,
                lockOwner: tile.lockOwner || null, plagueId: pIdFound || null
              } : null;

              tile.underneath = underSnapshot;
              tile.color = mat.colors[idx];
              tile.phased = true;
              tile.phaseOwner = state.currentPlayerId || 1;
              if (mat.colors[idx] !== 'disease') tile.plagueId = null;

              undoEntry.onBoardTiles.push({
                key, color: mat.colors[idx], phased: true, previousColor: prevColor, previousSigilId: prevSigilId,
                previousFortified: prevFortified, previousUnderneath: prevUnderneath, previousPlagueId: prevPlagueId,
                previousPhased: prevPhased, previousBurned: prevBurned, previousPhaseOwner: prevPhaseOwner, previousBurnOwner: prevBurnOwner,
                hadUnderneath: !!underSnapshot
              });
            }
          } else {
            tile.underneath = null;
            tile.color = mat.colors[idx];
            if (state.activeMaterialMod === 'fortify') {
              tile.fortified = true;
              tile.lockOwner = state.currentPlayerId || 1;
              state.fortifiedTiles.add(key);
              undoEntry.fortifiedTiles.push(key);
            }
            let placedPlagueId = null;
            if (mat.colors[idx] === 'disease' && global.ComponentDisease?.registerPlacedPlague) {
              const shape = global.ComponentDisease.registerPlacedPlague(tq, tr, state.round);
              placedPlagueId = shape ? shape.id : null;
              tile.plagueId = placedPlagueId;
            }
            undoEntry.onBoardTiles.push({
              key, color: mat.colors[idx],
              previousColor: prevColor, previousSigilId: prevSigilId, previousFortified: prevFortified,
              previousUnderneath: prevUnderneath, previousPlagueId: prevPlagueId,
              previousPhased: prevPhased, previousBurned: prevBurned,
              placedPlagueId: placedPlagueId
            });
          }
          onBoardCount++;
        } else {
          const compColor = mat.colors[idx];
          if (compColor === 'disease' && state.activeMaterialMod !== 'burn') {
            state.activeDamageTiles.push({ q: tq, r: tr, color: 'disease', isPlacedPlague: true });
            offBoardPlagues.push({ q: tq, r: tr });
          } else {
            state.activeDamageTiles.push({ q: tq, r: tr, color: compColor, isPlacedPlague: false });
            offBoardCount++;
          }
        }
      });

      if (offBoardCount > 0 || offBoardPlagues.length > 0) {
        const plagueMsg = offBoardPlagues.length > 0 ? ` (${offBoardPlagues.length} Disease will teleport at Turn End)` : '';
        if (offBoardCount > 0 && (state.hp - offBoardCount <= 0)) {
          state.showToast(`☠️ LAST BREATH: ${offBoardCount} Overhang Damage threatens all remaining HP!${plagueMsg}`);
        } else if (offBoardCount > 0) {
          state.showToast(`⚠️ ${offBoardCount} Off-Board Segment(s) placed: -${offBoardCount} HP pending at End of Turn${plagueMsg}`);
        } else {
          state.showToast(`☣️ ${offBoardPlagues.length} Off-Board Disease placed: 0 DMG (teleports at End of Turn)`);
        }
      }

      state.placedThisTurn = true;
      state.isMaterialSelected = false;
      state.materialsTray[0] = null;
      global.UndoManager?.recordPlacement(undoEntry);

      if (state.activeMaterialMod) {
        global.AudioSynth?.playReward?.(state.activeMaterialMod);
      } else {
        const matProf = global.BoardRippleRenderer?.profiles?.material;
        const rippleBandMs = (matProf && matProf.speed > 0) ? ((matProf.bandSpacing ?? 22) / matProf.speed) * 1000 : (22 / 144) * 1000;
        global.AudioSynth?.playMaterialBurst?.(4, rippleBandMs);
      }
      if (state.activeMaterialMod === 'burn') {
        state.showToast('🔥 FIRE BURN: Placed over target tiles! Will incinerate before resonance at turn end.');
      }

      // Trigger Material Placement Transition (800ms shrink & green back-tile fade + 4-band ripple at 400ms)
      const onBoardCoords = mat.activeCoords
        .map(([dq, dr]) => ({ q: anchorQ + dq, r: anchorR + dr }))
        .filter(c => state.board.has(`${c.q},${c.r}`));
      const rippleColor = global.BoardRippleRenderer?.getRippleColorForMod ? global.BoardRippleRenderer.getRippleColorForMod(state.activeMaterialMod) : '#22c55e';
      const backCol = state.activeMaterialMod === 'phase' ? '#2563eb' : (state.activeMaterialMod === 'burn' ? '#ef4444' : (state.activeMaterialMod === 'fortify' ? '#c084fc' : '#22c55e'));

      if (global.BoardRippleRenderer?.playMaterialPlacement) {
        global.BoardRippleRenderer.playMaterialPlacement(onBoardCoords, rippleColor, () => {
          global.BoardRenderer?.render?.();
        }, 0.04, backCol);
      } else if (global.BoardRippleRenderer?.triggerPlacementRipple) {
        const profile = state.activeMaterialMod ? 'enchantment' : 'material';
        global.BoardRippleRenderer.triggerPlacementRipple(onBoardCoords, rippleColor, { profile, bands: 4 });
      }

      // Scan Sigils via SigilResolver
      if (global.SigilResolver) {
        global.SigilResolver.evaluateSigils(state.board);
        if (state.allCandidates.length > 0) {
          state.inSigilStage = true;
          state.showSigilAlignments = false;
          global.SigilResolver.resolveInitialSigils(state.board);
          if (state.selectedSigilId) {
            const cand = state.allCandidates.find(c => c.id === state.selectedSigilId);
            if (cand && global.HexMath) {
              state.sigilCursorVertex = global.HexMath.findVertexForTiles(cand.tiles) || { type: 'up', q: 0, r: 0 };
            }
          }
        } else {
          state.inSigilStage = false;
          state.showSigilAlignments = false;
          state.selectedSigilId = null;
          state.sigilCursorVertex = { type: 'up', q: 0, r: 0 };
          state.dormantSigilIds.clear();
          global.SigilResolver.syncBoardSigilTiles(state.board);
        }
      }

      state.syncUI();
      return true;
    }
  }

  const piecePlacementInstance = new PiecePlacementManager();
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Piece_Placement', piecePlacementInstance);
  global.PiecePlacement = piecePlacementInstance;

})(typeof window !== 'undefined' ? window : this);
