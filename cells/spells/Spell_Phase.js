/**
 * @fileoverview Spell_Phase.js - Water Phase Spell (BBY) Module
 * @description Encapsulates Water Phase material modification logic:
 * Outlines the upcoming Material in blue, allows placing it on top of existing components,
 * and clears unaligned Phase components at End of Turn, revealing underlying components.
 */

(function(global) {
  'use strict';

  class SpellPhaseClass {
    constructor() {
      this.formula = 'BBY';
      this.element = 'Water';
      this.name = 'Phase';
      this.fullName = 'Water Phase';
    }

    /**
     * Casts Water Phase from the spellbook.
     * Mutates the active upcoming Material to allow overlay placement.
     * @param {number} spellIndex - Index in spellbook
     * @returns {boolean} True if cast succeeded
     */
    cast(spellIndex) {
      const state = global.GameState;
      if (!state) return false;
      if (spellIndex < 0 || spellIndex >= state.spellbook.length) return false;

      const spell = state.spellbook[spellIndex];
      if (!spell) return false;

      if (state.placedThisTurn) {
        state.showToast('⚠️ Cannot cast Water Phase: Material already placed this turn! Only castable before placement.');
        return false;
      }

      if (state.activeMaterialMod) {
        state.showToast(`⚠️ Material already modified with ${state.activeMaterialMod.toUpperCase()}! Only 1 mod allowed.`);
        return false;
      }

      if (spell.usableRound > state.round) {
        state.showToast(`⏳ ${spell.name} is primed for Round ${spell.usableRound}!`);
        return false;
      }

      const activeMat = state.getActiveMaterial();
      if (!activeMat) return false;
      if (activeMat.colors?.includes('disease')) {
        state.showToast('⚠️ Disease materials cannot be enchanted!');
        return false;
      }

      const consumedSpell = { ...spell };
      state.spellbook.splice(spellIndex, 1);
      state.activeMaterialMod = 'phase';
      state.isMaterialSelected = true;

      const cleansedPlagueColors = state.cleanseMaterialPlague ? state.cleanseMaterialPlague() : null;

      if (global.UndoManager) {
        global.UndoManager.recordSpellCast({
          type: 'phase',
          name: consumedSpell.name || this.fullName,
          spell: consumedSpell,
          spellIndex: spellIndex,
          cleansedPlagueColors
        });
      }

      state.showToast('🌊 WATER PHASE: Material can be placed directly on top of existing components!');
      state.syncUI();
      return true;
    }

    /**
     * Undoes the Phase spell before placement is finalized.
     * Restores the Phase spell back to the spellbook.
     * @param {Object} entry - Spell undo entry
     * @returns {boolean}
     */
    undo(entry) {
      const state = global.GameState;
      if (!state || !entry) return false;

      state.activeMaterialMod = null;

      if (entry.cleansedPlagueColors && state.revertMaterialPlague) {
        state.revertMaterialPlague(entry.cleansedPlagueColors);
      }

      if (entry.spell) {
        const insertIdx = Math.min(entry.spellIndex !== undefined ? entry.spellIndex : 0, state.spellbook.length);
        state.spellbook.splice(insertIdx, 0, entry.spell);
      }

      global.AudioSynth?.playClick?.();
      state.showToast('↶ Undid Water Phase: Spell returned to Spellbook.');
      state.syncUI();
      global.UISidebarDeck?.openSpellbookColumn(false);
      return true;
    }

    reset() {
      const state = global.GameState;
      if (state && state.activeMaterialMod === 'phase') {
        state.activeMaterialMod = null;
      }
    }
  }

  const spellPhaseInstance = new SpellPhaseClass();

  // Register with global Roll Call
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Spell_Phase', spellPhaseInstance);
  global.SpellPhase = spellPhaseInstance;

})(typeof window !== 'undefined' ? window : this);
