/**
 * @fileoverview Undo_Manager.js - Centralized Placement & Round Spell Undo / Redo Engine
 * @description Manages placement undo/redo history, damage tile reversals, and round-level
 * spell reversal stack with multi-stage undo dispatching.
 */

(function(global) {
  'use strict';

  class UndoManagerClass {
    constructor() {
      this.undoStack = [];
      this.redoStack = [];
      this.spellsCastThisRound = [];
    }

    /**
     * Records a material placement record onto the undo stack.
     * @param {Object} entry
     */
    recordPlacement(entry) {
      this.undoStack.push(entry);
      this.redoStack = [];
    }

    /**
     * Undoes the material placement action for current turn.
     * Restores on-board tiles, off-board damage tiles, HP, cursor, rotation, and locked sigil IDs.
     * @returns {boolean} True if undone
     */
    undoPlacement() {
      const state = global.GameState;
      if (!state) return false;
      if (state.inSpellOverflow || state.inForesightMode || !state.placedThisTurn || this.undoStack.length === 0) {
        return false;
      }

      const entry = this.undoStack.pop();

      // Clear on-board tiles placed this turn and revert fortification / weave / phase / burn
      entry.onBoardTiles.forEach(({ key, previousColor, previousSigilId, previousFortified, hadUnderneath, burned, previousUnderneath, previousPlagueId, previousCovered, previousPhaseOwner, previousLockOwner, previousPhased, previousBurned, previousBurnOwner }) => {
        global.BoardRippleRenderer?.activeTileAnims?.delete?.(key);
        const tile = state.board.get(key);
        if (tile) {
          if (burned) {
            tile.color = previousColor;
            tile.sigilId = previousSigilId;
            tile.fortified = previousFortified;
            tile.lockOwner = previousLockOwner || null;
            tile.underneath = previousUnderneath || null;
            tile.plagueId = previousPlagueId || null;
            tile.coveredComponent = previousCovered || null;
            tile.burned = previousBurned || false;
            tile.burnOwner = previousBurnOwner || null;
          } else if (hadUnderneath) {
            tile.color = previousColor;
            tile.sigilId = previousSigilId;
            tile.fortified = previousFortified;
            tile.lockOwner = previousLockOwner || null;
            tile.plagueId = previousPlagueId || null;
            tile.underneath = previousUnderneath || null;
            tile.burned = previousBurned || false;
            tile.burnOwner = previousBurnOwner || null;
          } else {
            tile.color = null;
            tile.sigilId = null;
            tile.fortified = false;
            tile.lockOwner = null;
            tile.underneath = null;
            tile.plagueId = null;
            tile.burned = previousBurned || false;
            tile.burnOwner = previousBurnOwner || null;
          }
          tile.phased = previousPhased || false;
          tile.phaseOwner = previousPhaseOwner || null;
          tile.weaveStep = null;
          tile.woven = false;
          tile.weaveOwner = null;
        }
      });

      // Restore discrete plague shape snapshot if present
      if (entry.diseaseSnapshot && global.ComponentDisease && typeof global.ComponentDisease.restoreSnapshot === 'function') {
        global.ComponentDisease.restoreSnapshot(entry.diseaseSnapshot);
      }

      // Restore any dissolved plague shapes and all their connected body tiles
      if (entry.dissolvedPlagues && entry.dissolvedPlagues.length > 0) {
        entry.dissolvedPlagues.forEach(record => {
          if (record.clearedTiles && Array.isArray(record.clearedTiles)) {
            record.clearedTiles.forEach(tInfo => {
              const tile = state.board.get(tInfo.key);
              if (tile) {
                tile.color = tInfo.previousColor;
                tile.plagueId = tInfo.previousPlagueId;
                tile.coveredComponent = tInfo.previousCoveredComponent ? { ...tInfo.previousCoveredComponent } : null;
                tile.sigilId = null;
                tile.fortified = false;
                tile.phased = false;
                tile.weaveStep = null;
              }
            });
          }
          if (record.shapeSnapshot && global.ComponentDisease && global.ComponentDisease.shapes) {
            global.ComponentDisease.shapes.set(record.plagueId, {
              id: record.shapeSnapshot.id,
              components: JSON.parse(JSON.stringify(record.shapeSnapshot.components)),
              offBoard: record.shapeSnapshot.offBoard,
              spawnTurn: record.shapeSnapshot.spawnTurn
            });
          }
        });
      }

      if (entry.fortifiedTiles && state.fortifiedTiles) {
        entry.fortifiedTiles.forEach(key => state.fortifiedTiles.delete(key));
      }

      // Revert deflected off-board plague placements
      if (entry.thrownPlaguePlacements && entry.thrownPlaguePlacements.length > 0) {
        entry.thrownPlaguePlacements.forEach(({ key, previousColor, previousSigilId, previousFortified, previousPhased, previousWeaveStep, previousUnderneath }) => {
          const tile = state.board.get(key);
          if (tile) {
            tile.color = previousColor;
            tile.sigilId = previousSigilId;
            tile.fortified = previousFortified;
            tile.phased = previousPhased;
            tile.weaveStep = previousWeaveStep;
            tile.underneath = previousUnderneath;
          }
        });
      }

      // Restore damage tiles, HP, cursor & rotation
      state.activeDamageTiles = [...entry.previousDamageTiles];
      state.hp = entry.previousHp;
      state.placementCursor = { ...entry.cursor };
      state.selectedRotation = entry.rotation;
      if (entry.upDownAxisState !== undefined) {
        state.upDownAxisState = entry.upDownAxisState;
      }
      if (entry.activeMaterialMod !== undefined) {
        state.activeMaterialMod = entry.activeMaterialMod;
      }
      if (entry.placedMat !== undefined) state.materialsTray[0] = entry.placedMat;
      if (entry.activeMaterialMod === 'weave' && global.SpellWeave) {
        global.SpellWeave.inWeaveMode = true;
        global.SpellWeave.placedTiles = [];
        global.SpellWeave.weaveStep = 0;
        const mat = state.materialsTray[0];
        global.SpellWeave.unplacedSlots = mat?.colors ? mat.colors.map((color, slot) => ({ slot, color })) : [];
        state.weaveStep = 0;
        state.weavePlacedTiles = [];
      }
      state.placedThisTurn = false;
      state.inSigilStage = false;
      state.showSigilAlignments = false;
      state.isMaterialSelected = true; // Return to active ghost steering mode
      state.selectedSigilId = null;
      state.sigilCursorVertex = { type: 'up', q: 0, r: 0 };
      state.lockedSigilIds = new Set(entry.previousLockedSigilIds || []);
      state.evaluateSigils();
      state.resolveInitialSigils({ animate: false });

      this.redoStack.push(entry);

      if (global.AudioSynth) global.AudioSynth.playClick();
      if (global.UISidebars) {
        global.UISidebars.renderTrayUI?.();
        global.UISidebars.syncNavState?.();
        global.UISidebars.updateHpBar?.();
        global.UISidebars.showToast?.('↶ Placement Undone');
      } else if (global.SigilEmblemStudio) {
        global.SigilEmblemStudio.showToast?.('↶ Placement Undone');
      }
      return true;
    }

    /**
     * Records a spell cast during the current round onto the spell undo stack.
     * Automatically tags whether the spell was cast before or after material placement.
     * @param {Object} entry - Spell cast descriptor
     */
    recordSpellCast(entry) {
      if (!this.spellsCastThisRound) this.spellsCastThisRound = [];
      const state = global.GameState;
      if (entry.castPostPlacement === undefined) {
        entry.castPostPlacement = !!(state && state.placedThisTurn);
      }
      this.spellsCastThisRound.push(entry);
      if (global.SpellCharge?.finishMimic) {
        global.SpellCharge.finishMimic();
      }
      if (global.UISidebars?.syncNavState) {
        global.UISidebars.syncNavState();
      }
    }

    /**
     * Undoes the last cast spell from the current round stack.
     * If a material has been placed, only allows undoing spells cast post-placement;
     * pre-placement spells require undoing placement first.
     * @returns {boolean} True if spell effect was undone
     */
    undoLastSpell() {
      const state = global.GameState;
      if (!state) return false;

      if (!this.spellsCastThisRound || this.spellsCastThisRound.length === 0) {
        const toast = global.UISidebars?.showToast || global.SigilEmblemStudio?.showToast;
        if (toast) toast('No spells to undo this round');
        return false;
      }

      const topSpell = this.spellsCastThisRound[this.spellsCastThisRound.length - 1];
      if (state.placedThisTurn && !topSpell.castPostPlacement) {
        const toast = global.UISidebars?.showToast || global.SigilEmblemStudio?.showToast;
        if (toast) toast('⚠️ Undo material placement first before undoing pre-placement spells!');
        return false;
      }

      const entry = this.spellsCastThisRound.pop();
      if (global.SpellManager && global.SpellManager.undoSpell) {
        const success = global.SpellManager.undoSpell(entry);
        if (!success) {
          // Push back if reversal failed
          this.spellsCastThisRound.push(entry);
        }
        return success;
      }
      return false;
    }

    /**
     * Dispatches the last action undo in strict LIFO order:
     * Weave step -> Post-placement spell -> Placement -> Pre-placement spell.
     * @returns {boolean}
     */
    undoLastAction() {
      const state = global.GameState;
      const canUndoWeaveStep = state && state.activeMaterialMod === 'weave' && state.weaveStep > 0 && !state.placedThisTurn;
      const canUndoPlacement = state && (state.placedThisTurn || this.undoStack.length > 0);
      const hasSpellToUndo = this.spellsCastThisRound && this.spellsCastThisRound.length > 0;
      const hasPostPlacementSpell = hasSpellToUndo && this.spellsCastThisRound[this.spellsCastThisRound.length - 1].castPostPlacement;

      if (canUndoWeaveStep && global.SpellWeave?.undoStep) {
        return global.SpellWeave.undoStep();
      } else if (hasPostPlacementSpell) {
        return this.undoLastSpell();
      } else if (canUndoPlacement) {
        return this.undoPlacement();
      } else if (hasSpellToUndo) {
        return this.undoLastSpell();
      }
      return false;
    }

    /**
     * Resets placement and spell undo history for a fresh round.
     */
    clearForNewRound() {
      this.undoStack = [];
      this.redoStack = [];
      this.spellsCastThisRound = [];
    }

    clearTurnHistory() {
      this.clearForNewRound();
    }

    /**
     * Queries current undo navigation state for Left Dock Button #1.
     * Supports strict LIFO order: Weave Step -> Post-Placement Spell -> Placement -> Pre-Placement Spell.
     * @returns {Object} { canUndo, title, label, badge, active }
     */
    getUndoNavState() {
      const state = global.GameState;
      if (state?.inForesightMode) {
        return { canUndo: true, active: true, title: '◄ CANCEL', label: 'Cancel Seek', badge: 'KEY: ESC' };
      }
      if (state?.inArchMode) {
        const isPlaced = global.SpellArch?.isPlaced;
        return { canUndo: true, active: true, title: isPlaced ? '◄ UNPLACE' : '◄ CANCEL', label: isPlaced ? 'Unplace Conduit' : 'Cancel Arch', badge: isPlaced ? 'KEY: Z' : 'KEY: ESC' };
      }
      if (state?.inShiftMode) {
        const isComp = global.SpellShift?.stage === 'component';
        return { canUndo: true, active: true, title: isComp ? '◄ UNPLACE' : '◄ CANCEL', label: isComp ? 'Revert to Zone' : 'Cancel Shift', badge: isComp ? 'KEY: Z' : 'KEY: ESC' };
      }
      if (state?.inRitualMode) {
        const isComp = global.SpellRitual?.stage === 'component';
        return { canUndo: true, active: true, title: isComp ? '◄ UNPLACE' : '◄ CANCEL', label: isComp ? 'Revert to Zone' : 'Cancel Store', badge: isComp ? 'KEY: Z' : 'KEY: ESC' };
      }
      if (state?.inManifestMode) {
        const isComp = global.SpellManifest?.stage === 'component';
        return { canUndo: true, active: true, title: isComp ? '◄ UNPLACE' : '◄ CANCEL', label: isComp ? 'Revert to Zone' : 'Cancel Form', badge: isComp ? 'KEY: Z' : 'KEY: ESC' };
      }
      if (state?.inTeleportMode) {
        return { canUndo: true, active: true, title: '◄ CANCEL', label: 'Cancel Warp', badge: 'KEY: ESC' };
      }
      if (state?.inChargeMode) {
        return { canUndo: true, active: true, title: '◄ CANCEL', label: 'Cancel Charge', badge: 'KEY: ESC' };
      }

      const canUndoWeaveStep = state && state.activeMaterialMod === 'weave' && state.weaveStep > 0 && !state.placedThisTurn;
      const canUndoPlacement = state && (state.placedThisTurn || this.undoStack.length > 0);
      const hasSpellToUndo = this.spellsCastThisRound && this.spellsCastThisRound.length > 0;
      const hasPostPlacementSpell = hasSpellToUndo && this.spellsCastThisRound[this.spellsCastThisRound.length - 1].castPostPlacement;

      if (canUndoWeaveStep) {
        return {
          canUndo: true,
          active: true,
          title: '◄ UNDO TILE',
          label: `Retract Tile ${state.weaveStep}/4`,
          badge: 'KEY: Z'
        };
      } else if (hasPostPlacementSpell) {
        const lastSpell = this.spellsCastThisRound[this.spellsCastThisRound.length - 1];
        return {
          canUndo: true,
          active: true,
          title: '◄ UNDO SPELL',
          label: `Revert ${lastSpell.name || 'Spell'}`,
          badge: 'KEY: Z'
        };
      } else if (canUndoPlacement) {
        return {
          canUndo: true,
          active: true,
          title: '◄ UNDO',
          label: 'Revert Placement',
          badge: 'KEY: Z'
        };
      } else if (hasSpellToUndo) {
        const lastSpell = this.spellsCastThisRound[this.spellsCastThisRound.length - 1];
        return {
          canUndo: true,
          active: true,
          title: '◄ UNDO SPELL',
          label: `Revert ${lastSpell.name || 'Spell'}`,
          badge: 'KEY: Z'
        };
      } else {
        return {
          canUndo: false,
          active: false,
          title: '◄ UNDO',
          label: 'No Action to Undo',
          badge: 'IDLE'
        };
      }
    }
  }

  const undoManagerInstance = new UndoManagerClass();

  // Register with global Roll Call
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Undo_Manager', undoManagerInstance);
  global.UndoManager = undoManagerInstance;

})(window);
