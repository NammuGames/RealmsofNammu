/**
 * @fileoverview Spell_Fortify.js - Stone Fortify Spell (PPR) Module
 * @description Encapsulates Stone Fortify material modification logic:
 * Targets the upcoming Tetrahex Material before placement, outlines it in purple,
 * and prevents the components of that material from forming any sigils for that turn.
 */

(function(global) {
  'use strict';

  class SpellFortifyClass {
    constructor() {
      this.formula = 'PPR';
      this.element = 'Stone';
      this.name = 'Lock';
      this.fullName = 'Stone Lock';
    }

    /**
     * Casts Stone Fortify from the spellbook.
     * Applies the 'fortify' modification to the upcoming Material piece.
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
        state.showToast('⚠️ Cannot cast Stone Lock: Material already placed this turn! Only castable before placement.');
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
      state.activeMaterialMod = 'fortify';
      state.isMaterialSelected = true;

      const cleansedPlagueColors = state.cleanseMaterialPlague ? state.cleanseMaterialPlague() : null;

      if (global.UndoManager) {
        global.UndoManager.recordSpellCast({
          type: 'fortify',
          name: consumedSpell.name || this.fullName,
          spell: consumedSpell,
          spellIndex: spellIndex,
          cleansedPlagueColors
        });
      }

      state.showToast('🛡️ STONE LOCK: Material locked in purple! Components will not form sigils this turn.');
      state.syncUI();
      return true;
    }

    /**
     * Undoes a previously cast Stone Fortify from current round.
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
      state.showToast('↶ Undid Stone Lock: Modification removed, spell returned to Spellbook.');
      state.syncUI();
      global.UISidebarDeck?.openSpellbookColumn(false);
      return true;
    }

    reset() {}
  }

  const spellFortifyInstance = new SpellFortifyClass();

  // Register with global Roll Call
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Spell_Fortify', spellFortifyInstance);
  global.SpellFortify = spellFortifyInstance;
  global.SpellLock = spellFortifyInstance;

})(typeof window !== 'undefined' ? window : this);
