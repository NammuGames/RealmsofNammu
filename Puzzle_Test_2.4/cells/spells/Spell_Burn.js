/**
 * @fileoverview Spell_Burn.js - Fire Burn Spell (RRP) Module
 * @description Encapsulates Fire Burn material modification logic:
 * Outlines the upcoming Material in red, allows placing it on top of other components,
 * and upon placement, immediately destroys itself and all underlying components without points.
 */

(function(global) {
  'use strict';

  class SpellBurnClass {
    constructor() {
      this.formula = 'RRP';
      this.element = 'Fire';
      this.name = 'Burn';
      this.fullName = 'Fire Burn';
    }

    /**
     * Casts Fire Burn from the spellbook.
     * Mutates the active upcoming Material to incinerate target tiles upon placement.
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
        state.showToast('⚠️ Material already placed this turn! Burn can only be cast before placement.');
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
      state.activeMaterialMod = 'burn';
      state.isMaterialSelected = true;

      const cleansedPlagueColors = state.cleanseMaterialPlague ? state.cleanseMaterialPlague() : null;

      if (global.UndoManager) {
        global.UndoManager.recordSpellCast({
          type: 'burn',
          name: consumedSpell.name || this.fullName,
          spell: consumedSpell,
          spellIndex: spellIndex,
          cleansedPlagueColors
        });
      }

      state.showToast('🔥 FIRE BURN: Can be placed over other components! Incinerates all target tiles immediately.');
      state.syncUI();
      return true;
    }

    /**
     * Undoes the Burn spell before placement is finalized.
     * Restores the Burn spell back to the spellbook.
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
      state.showToast('↶ Undid Fire Burn: Spell returned to Spellbook.');
      state.syncUI();
      global.UISidebarDeck?.openSpellbookColumn(false);
      return true;
    }

    reset() {
      const state = global.GameState;
      if (state && state.activeMaterialMod === 'burn') {
        state.activeMaterialMod = null;
      }
    }
  }

  const spellBurnInstance = new SpellBurnClass();

  // Register with global Roll Call
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Spell_Burn', spellBurnInstance);
  global.SpellBurn = spellBurnInstance;

})(typeof window !== 'undefined' ? window : this);
