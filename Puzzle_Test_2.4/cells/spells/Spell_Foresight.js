/**
 * @fileoverview Spell_Foresight.js - Cyber Foresight Spell (YYR) Module
 * @description Manages queue-swapping mechanics, conveyor line re-ordering,
 * staged swap preview, cancellation, and spell undo reversal for Canvas UI.
 */

(function(global) {
  'use strict';

  class SpellForesightClass {
    constructor() {
      this.formula = 'YYR';
      this.element = 'Cyber';
      this.name = 'Seek';
      this.fullName = 'Cyber Seek';

      this.inForesightMode = false;
      this.foresightSpellIndex = null;
      this.foresightOriginalTray = null;
      this.foresightSwappedIndex = null;
    }

    /**
     * Initiates Cyber Foresight (YYR) material swap sequence.
     * @param {number} spellIndex - Index in spellbook
     * @returns {boolean} True if started
     */
    start(spellIndex) {
      const state = global.GameState;
      if (!state || state.gameOver || state.inSpellOverflow) return false;

      this.inForesightMode = true;
      state.inForesightMode = true;
      this.foresightSpellIndex = spellIndex;
      state.foresightSpellIndex = spellIndex;

      if (!this.foresightOriginalTray) {
        this.foresightOriginalTray = [...state.materialsTray];
        state.foresightOriginalTray = this.foresightOriginalTray;
      }
      this.foresightSwappedIndex = null;
      state.foresightSwappedIndex = null;
      state.isMaterialSelected = !state.placedThisTurn;

      if (global.UISidebars) {
        if (global.UISidebars.finishRotationInstantly) {
          global.UISidebars.finishRotationInstantly();
        }
        global.UISidebars.navigateTo('foresight');
        global.UISidebars.syncNavState();
        if (state.placedThisTurn) {
          global.UISidebars.showToast('🔮 CYBER SEEK: Click an upcoming piece (2–6) to queue into Slot 1 for next turn');
        } else {
          global.UISidebars.showToast('🔮 CYBER SEEK: Click an upcoming piece (2–6) to replace Slot 1');
        }
      }
      return true;
    }

    /**
     * Handles selecting/swapping materials in Foresight mode.
     * @param {number} targetIndex - 0..5
     */
    selectMaterial(targetIndex) {
      const state = global.GameState;
      if (!this.inForesightMode || !this.foresightOriginalTray || !state) return;

      if (targetIndex === 0) {
        if (this.foresightSwappedIndex !== null) {
          this.finalizeSwap();
          return;
        } else {
          if (global.AudioSynth) global.AudioSynth.playCancel();
          if (global.UISidebars) {
            global.UISidebars.showToast(state.placedThisTurn
              ? 'Select an upcoming material (Slots 2–6) to queue into Slot 1 for next turn!'
              : 'Select an upcoming material (Slots 2–6) to replace Slot 1!');
          }
          return;
        }
      }

      if (this.foresightSwappedIndex === targetIndex) {
        state.materialsTray = [...this.foresightOriginalTray];
        this.foresightSwappedIndex = null;
        state.foresightSwappedIndex = null;

        if (global.AudioSynth) global.AudioSynth.playClick();
        if (global.UISidebars) {
          this.renderFace();
          global.UISidebars.showToast('Selection reset. Select an upcoming material to replace Slot 1.');
        }
        return;
      }

      const newTray = [...this.foresightOriginalTray];
      const targetMat = newTray[targetIndex];
      if (!targetMat) {
        if (global.AudioSynth) global.AudioSynth.playCancel();
        if (global.UISidebars) global.UISidebars.showToast('That slot is empty!');
        return;
      }

      // Replaces slot 0, leaving targetIndex empty and deleting the old slot 0 piece
      newTray[0] = targetMat;
      newTray[targetIndex] = null;

      state.materialsTray = newTray;
      this.foresightSwappedIndex = targetIndex;
      state.foresightSwappedIndex = targetIndex;

      if (global.AudioSynth) global.AudioSynth.playRotate();
      if (global.UISidebars) {
        this.renderFace();
        if (state.placedThisTurn) {
          global.UISidebars.showToast(`Queued ${targetMat.name} into Slot 1 for next turn! Click Slot 1 to finalize.`);
        } else {
          global.UISidebars.showToast(`Replaced Slot 1 with ${targetMat.name}! Click Slot 1 again to finalize.`);
        }
      }
    }

    /**
     * Finalizes staged swap, consumes the spell, and returns to Material Tray.
     */
    finalizeSwap() {
      const state = global.GameState;
      if (!this.inForesightMode || this.foresightSwappedIndex === null || !state) return;

      const swappedMat = state.materialsTray[0];
      let consumedSpell = null;
      const sIdx = this.foresightSpellIndex;

      if (sIdx !== null && sIdx < state.spellbook.length) {
        consumedSpell = { ...state.spellbook[sIdx] };
        state.spellbook.splice(sIdx, 1);
      }

      if (consumedSpell && this.foresightOriginalTray && global.UndoManager) {
        global.UndoManager.recordSpellCast({
          type: 'foresight',
          name: consumedSpell.name || this.fullName,
          spell: consumedSpell,
          spellIndex: sIdx,
          previousTray: [...this.foresightOriginalTray]
        });
      }

      this.inForesightMode = false;
      state.inForesightMode = false;
      this.foresightSpellIndex = null;
      state.foresightSpellIndex = null;
      this.foresightOriginalTray = null;
      state.foresightOriginalTray = null;
      this.foresightSwappedIndex = null;
      state.foresightSwappedIndex = null;
      state.isMaterialSelected = !state.placedThisTurn;
      if (!state.placedThisTurn) state.selectedTrayIndex = 0;

      if (global.AudioSynth) global.AudioSynth.playReward('foresight');
      if (global.UISidebars) {
        if (state.placedThisTurn) {
          global.UISidebars.showToast(`✨ FORESIGHT FINALIZED: ${swappedMat ? swappedMat.name : 'Piece'} queued for next turn!`);
        } else {
          global.UISidebars.showToast(`✨ FORESIGHT FINALIZED: ${swappedMat ? swappedMat.name : 'Piece'} replaced Slot 1!`);
        }
        if (global.UISidebars.resetToFace) {
          global.UISidebars.resetToFace('materials', 'backward');
        } else {
          global.UISidebars.navStack = ['materials'];
          global.UISidebars.rotateToFace('materials', 'backward');
        }
        global.UISidebars.renderTrayUI();
        global.UISidebars.renderSpellbookUI();
        global.UISidebars.syncNavState();
      }

      global.UISidebarDeck?.openSpellbookColumn(true);
    }

    /**
     * Multi-stage undo: resets staged swap if one is active, else cancels Foresight.
     */
    handleUndo() {
      if (this.foresightSwappedIndex !== null) {
        const state = global.GameState;
        if (state && this.foresightOriginalTray) {
          state.materialsTray = [...this.foresightOriginalTray];
        }
        this.foresightSwappedIndex = null;
        if (state) state.foresightSwappedIndex = null;
        if (global.AudioSynth) global.AudioSynth.playClick();
        if (global.UISidebars) {
          this.renderFace();
          global.UISidebars.showToast('Selection reset. Select an upcoming material to replace Slot 1.');
        }
        if (global.UICardsDeck) global.UICardsDeck.syncMaterialsQueueColumn();
        if (global.BoardRenderer) global.BoardRenderer.render();
        return true;
      }
      return this.cancelSwap();
    }

    /**
     * Cancels Foresight mode, reverts staged swap, and preserves the spell.
     */
    cancelSwap() {
      const state = global.GameState;
      if (!this.inForesightMode || !state) return false;

      if (this.foresightOriginalTray) {
        state.materialsTray = [...this.foresightOriginalTray];
      }

      this.inForesightMode = false;
      state.inForesightMode = false;
      this.foresightSpellIndex = null;
      state.foresightSpellIndex = null;
      this.foresightOriginalTray = null;
      state.foresightOriginalTray = null;
      this.foresightSwappedIndex = null;
      state.foresightSwappedIndex = null;
      state.isMaterialSelected = !state.placedThisTurn;
      if (!state.placedThisTurn) state.selectedTrayIndex = 0;

      if (global.AudioSynth) global.AudioSynth.playClick();
      if (global.UISidebars) {
        global.UISidebars.showToast('Seek cancelled. Spell preserved.');
        global.UISidebars.syncNavState();
        global.UISidebars.updateTelemetry();
      }

      global.UISidebarDeck?.openSpellbookColumn(false);
      if (global.UICardsDeck) global.UICardsDeck.syncMaterialsQueueColumn();
      if (global.BoardRenderer) global.BoardRenderer.render();
      return true;
    }

    /**
     * Undoes a previously cast Cyber Foresight from current round.
     * @param {Object} entry - Spell undo entry
     * @returns {boolean}
     */
    undo(entry) {
      const state = global.GameState;
      if (!state || !entry) return false;

      if (entry.previousTray) {
        state.materialsTray = [...entry.previousTray];
      }
      const insertIdx = Math.min(entry.spellIndex !== undefined ? entry.spellIndex : 0, state.spellbook.length);
      if (entry.spell) {
        state.spellbook.splice(insertIdx, 0, entry.spell);
      }

      this.foresightOriginalTray = [...state.materialsTray];
      state.foresightOriginalTray = this.foresightOriginalTray;
      this.start(insertIdx);
      global.UISidebarDeck?.openMaterialsColumn(true);
      if (global.UISidebars) {
        global.UISidebars.showToast('↶ Seek unconfirmed: Queue restored.');
        global.UISidebars.renderTrayUI();
        global.UISidebars.renderSpellbookUI();
        global.UISidebars.updateTelemetry();
        global.UISidebars.syncNavState();
      }
      return true;
    }

    renderFace() {
      if (global.UISidebars && typeof global.UISidebars.renderForesightUI === 'function') {
        global.UISidebars.renderForesightUI();
      }
      if (global.BoardRenderer) global.BoardRenderer.render();
    }
  }

  const spellForesightInstance = new SpellForesightClass();

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Spell_Foresight', spellForesightInstance);
  global.SpellForesight = spellForesightInstance;

})(window);
