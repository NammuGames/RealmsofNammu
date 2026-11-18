/**
 * @fileoverview Spell_Heal.js - Feral Heal Spell (PPB) Module
 * @description Encapsulates Feral Heal casting logic (+4 HP recovery up to 24 HP cap),
 * spell consumption, audio/HUD reactions, undo reversal, and Last Breath auto-casting.
 */

(function(global) {
  'use strict';

  class SpellHealClass {
    constructor() {
      this.formula = 'PPB';
      this.element = 'Feral';
      this.name = 'Heal';
      this.fullName = 'Feral Heal';
    }

    /**
     * Casts Feral Heal from the spellbook.
     * @param {number} spellIndex - Index in spellbook
     * @returns {boolean} True if cast succeeded
     */
    cast(spellIndex) {
      const state = global.GameState;
      if (!state || spellIndex < 0 || spellIndex >= state.spellbook.length) return false;

      const spell = state.spellbook[spellIndex];
      if (!spell) return false;
      const consumedSpell = { ...spell };

      if (global.StatCanvas?.openForPlayerSelect) {
        state.showToast('💚 FERAL HEAL: Click a player on the Stat Canvas to heal (+4 HP)!');
        global.StatCanvas.openForPlayerSelect((targetPlayerId) => {
          this.applyTargetedHeal(spellIndex, consumedSpell, targetPlayerId);
        });
        return true;
      }

      return this.applyTargetedHeal(spellIndex, consumedSpell, state.currentPlayerId || 1);
    }

    applyTargetedHeal(spellIndex, consumedSpell, targetPlayerId) {
      const state = global.GameState;
      if (!state) return false;

      const activeId = state.currentPlayerId || 1;
      const isSelf = (targetPlayerId === activeId);
      const targetPlayer = Array.isArray(state.players) ? state.players.find(p => p.id === targetPlayerId) : null;
      let prevTargetHp = null;

      if (isSelf || !targetPlayer) {
        state.pendingHeal = (state.pendingHeal || 0) + 4;
        if (targetPlayer) targetPlayer.pendingHeal = state.pendingHeal;
      } else {
        prevTargetHp = targetPlayer.hp ?? 12;
        targetPlayer.hp = Math.min(targetPlayer.maxHp || 12, prevTargetHp + 4);
      }

      state.spellbook.splice(spellIndex, 1);

      if (global.UndoManager) {
        global.UndoManager.recordSpellCast({
          type: 'heal',
          name: consumedSpell.name || this.fullName,
          spell: consumedSpell,
          spellIndex,
          healedAmount: 4,
          targetPlayerId,
          isSelfHeal: isSelf || !targetPlayer,
          prevTargetHp
        });
      }

      global.AudioSynth?.playReward?.('heal');
      const tName = targetPlayer?.name || `Player ${targetPlayerId}`;
      if (isSelf || !targetPlayer) {
        const net = (state.pendingHeal || 0) - (state.pendingDamage || 0);
        const netMsg = net > 0 ? `+${net} Net Heal` : (net < 0 ? `${net} Net Damage` : 'Balanced (0)');
        state.showToast(`💚 FERAL HEAL: +4 Pending Heal staged for ${tName}! (${netMsg})`);
      } else {
        state.showToast(`💚 FERAL HEAL: Restored +4 HP to ${tName} (${targetPlayer.hp}/${targetPlayer.maxHp || 12} HP)!`);
      }

      state.syncUI();
      global.UICardsDeck?.syncSpellbookColumnWithGameState?.();
      global.UISidebarDeck?.openSpellbookColumn(true);
      global.BoardRenderer?.render?.();
      return true;
    }

    /**
     * Undoes a previously cast Feral Heal from current round.
     * @param {Object} entry - Spell undo entry
     * @returns {boolean}
     */
    undo(entry) {
      const state = global.GameState;
      if (!state || !entry) return false;

      const amount = entry.healedAmount !== undefined ? entry.healedAmount : 4;
      if (entry.isSelfHeal === false && entry.targetPlayerId != null && Array.isArray(state.players)) {
        const tp = state.players.find(p => p.id === entry.targetPlayerId);
        if (tp) tp.hp = entry.prevTargetHp != null ? entry.prevTargetHp : Math.max(0, (tp.hp || 0) - amount);
      } else {
        state.pendingHeal = Math.max(0, (state.pendingHeal || 0) - amount);
      }

      if (entry.spell) {
        const insertIdx = Math.min(entry.spellIndex !== undefined ? entry.spellIndex : 0, state.spellbook.length);
        state.spellbook.splice(insertIdx, 0, entry.spell);
      }

      global.AudioSynth?.playClick?.();
      state.showToast(`↶ Undid Feral Heal: -${amount} Heal removed`);
      state.syncUI();
      global.UISidebarDeck?.openSpellbookColumn(false);
      return true;
    }

    /**
     * Cancels active Feral Heal targeting mode by closing Stat Canvas if open.
     * @returns {boolean}
     */
    cancel() {
      if (global.StatCanvas?.isOpen?.()) {
        global.StatCanvas.close();
      }
      return true;
    }
  }

  const spellHealInstance = new SpellHealClass();

  // Register with global Roll Call
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Spell_Heal', spellHealInstance);
  global.SpellHeal = spellHealInstance;

})(typeof window !== 'undefined' ? window : this);
