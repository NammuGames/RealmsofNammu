/**
 * @fileoverview Spell_Charge_1.1.js - Light Charge Spell (RRY) Mimic Dispatch & Undo
 * @description Executes mimicked spell routing, lifecycle reset, cancel/undo stepping,
 * and spellbook undo restoration on SpellChargeClass.prototype.
 */

(function(global) {
  'use strict';

  const SpellChargeClass = global.SpellChargeClass;
  if (!SpellChargeClass) return;

  const proto = SpellChargeClass.prototype;

  proto._executeMimic = function(targetSigil) {
    const state = global.GameState;
    if (!state) return false;

    // Auto-lock dormant sigil if selected
    const isDormant = (state.dormantSigilIds && state.dormantSigilIds.has(targetSigil.id)) ||
      (state.allCandidates && (!state.lockedSigilIds || !state.lockedSigilIds.has(targetSigil.id)));
    if (isDormant) {
      if (global.SigilResolver && global.SigilResolver.placeDormantSigil) {
        global.SigilResolver.placeDormantSigil(targetSigil.id, state.board);
      } else {
        state.dormantSigilIds?.delete(targetSigil.id);
        state.lockedSigilIds?.add(targetSigil.id);
      }
    }

    let chargeIdx = this.chargeSpellIndex !== null ? this.chargeSpellIndex : state.chargeSpellIndex;
    if (chargeIdx === null || chargeIdx === undefined || chargeIdx < 0 || chargeIdx >= state.spellbook.length) {
      chargeIdx = state.spellbook.findIndex(s => s.formula === 'RRY');
      if (chargeIdx === -1) chargeIdx = null;
    }
    if (chargeIdx !== null && chargeIdx < state.spellbook.length) {
      state.spellbook[chargeIdx].name = 'Charge';
    }

    const formula = (targetSigil.formula || '').trim().toUpperCase();
    const spellName = (targetSigil.spell || targetSigil.name || '').trim().toLowerCase();

    // Switch Charge to Stage 2: Mimic execution
    this.stage = 'mimic';
    this.inChargeMode = false; state.inChargeMode = false;
    this.activeMimicIndex = chargeIdx;
    this.activeMimicSpell = spellName || formula;
    state.activeChargeMimic = true;
    this.chargeSpellIndex = null; state.chargeSpellIndex = null;
    this.castStartTime = null; state.chargeCastStartTime = null;

    let castSuccess = false;

    switch (formula) {
      case 'PPB': if (global.SpellHeal) { const fn = global.SpellHeal.cast || global.SpellHeal.start; if (typeof fn === 'function') castSuccess = fn.call(global.SpellHeal, chargeIdx); } break;
      case 'YYR': if (global.SpellForesight) { const fn = global.SpellForesight.start || global.SpellForesight.cast; if (typeof fn === 'function') castSuccess = fn.call(global.SpellForesight, chargeIdx); } break;
      case 'BBP': if (global.SpellTeleport) { const fn = global.SpellTeleport.start || global.SpellTeleport.cast; if (typeof fn === 'function') castSuccess = fn.call(global.SpellTeleport, chargeIdx); } break;
      case 'PPY': if (global.SpellShift) { const fn = global.SpellShift.start || global.SpellShift.cast; if (typeof fn === 'function') castSuccess = fn.call(global.SpellShift, chargeIdx); } break;
      case 'YYP': if (global.SpellArch) { const fn = global.SpellArch.start || global.SpellArch.cast; if (typeof fn === 'function') castSuccess = fn.call(global.SpellArch, chargeIdx); } break;
      case 'BBR': if (global.SpellRitual) { const fn = global.SpellRitual.start || global.SpellRitual.cast; if (typeof fn === 'function') castSuccess = fn.call(global.SpellRitual, chargeIdx); } break;
      case 'RRB': if (global.SpellManifest) { const fn = global.SpellManifest.start || global.SpellManifest.cast; if (typeof fn === 'function') castSuccess = fn.call(global.SpellManifest, chargeIdx); } break;
      case 'PPR': if (global.SpellFortify) { const fn = global.SpellFortify.cast || global.SpellFortify.start; if (typeof fn === 'function') castSuccess = fn.call(global.SpellFortify, chargeIdx); } break;
      case 'YYB': if (global.SpellWeave) { const fn = global.SpellWeave.cast || global.SpellWeave.start; if (typeof fn === 'function') castSuccess = fn.call(global.SpellWeave, chargeIdx); } break;
      case 'BBY': if (global.SpellPhase) { const fn = global.SpellPhase.cast || global.SpellPhase.start; if (typeof fn === 'function') castSuccess = fn.call(global.SpellPhase, chargeIdx); } break;
      case 'RRP': if (global.SpellBurn) { const fn = global.SpellBurn.cast || global.SpellBurn.start; if (typeof fn === 'function') castSuccess = fn.call(global.SpellBurn, chargeIdx); } break;
      default:
        if (spellName === 'heal' && global.SpellHeal) {
          castSuccess = (global.SpellHeal.cast || global.SpellHeal.start).call(global.SpellHeal, chargeIdx);
        } else if ((spellName === 'foresight' || spellName === 'seek') && global.SpellForesight) {
          castSuccess = (global.SpellForesight.start || global.SpellForesight.cast).call(global.SpellForesight, chargeIdx);
        } else if ((spellName === 'teleport' || spellName === 'warp') && global.SpellTeleport) {
          castSuccess = (global.SpellTeleport.start || global.SpellTeleport.cast).call(global.SpellTeleport, chargeIdx);
        } else if (spellName === 'shift' && global.SpellShift) {
          castSuccess = (global.SpellShift.start || global.SpellShift.cast).call(global.SpellShift, chargeIdx);
        } else if (spellName === 'arch' && global.SpellArch) {
          castSuccess = (global.SpellArch.start || global.SpellArch.cast).call(global.SpellArch, chargeIdx);
        } else if ((spellName === 'ritual' || spellName === 'store') && global.SpellRitual) {
          castSuccess = (global.SpellRitual.start || global.SpellRitual.cast).call(global.SpellRitual, chargeIdx);
        } else if ((spellName === 'manifest' || spellName === 'form') && global.SpellManifest) {
          castSuccess = (global.SpellManifest.start || global.SpellManifest.cast).call(global.SpellManifest, chargeIdx);
        } else if ((spellName === 'fortify' || spellName === 'lock') && global.SpellFortify) {
          castSuccess = (global.SpellFortify.cast || global.SpellFortify.start).call(global.SpellFortify, chargeIdx);
        } else if (spellName === 'weave' && global.SpellWeave) {
          castSuccess = (global.SpellWeave.cast || global.SpellWeave.start).call(global.SpellWeave, chargeIdx);
        } else if (spellName === 'phase' && global.SpellPhase) {
          castSuccess = (global.SpellPhase.cast || global.SpellPhase.start).call(global.SpellPhase, chargeIdx);
        } else if (spellName === 'burn' && global.SpellBurn) {
          castSuccess = (global.SpellBurn.cast || global.SpellBurn.start).call(global.SpellBurn, chargeIdx);
        }
        break;
    }

    if (!castSuccess) {
      this.stage = 'select';
      this.activeMimicIndex = null;
      this.activeMimicSpell = null;
      if (state) state.activeChargeMimic = false;
      this.inChargeMode = true;
      state.inChargeMode = true;
      this.chargeSpellIndex = chargeIdx;
      state.chargeSpellIndex = chargeIdx;
      if (chargeIdx !== null && chargeIdx < state.spellbook.length) {
        state.spellbook[chargeIdx].name = 'Charge';
      }
      global.AudioSynth?.playCancel?.();
      if (global.UISidebars) {
        global.UISidebars.showToast(`⚠️ Cannot cast mimicked ${targetSigil.spell}: Preconditions not met!`);
      }
      return false;
    }

    if (!this.isAnyMimickedSpellActive()) {
      // Immediate cast completed (Fortify, Weave, Phase, Burn)
      this.finishMimic();
    }

    if (global.UISidebars) {
      global.UISidebars.showToast(`⚡ CHARGE ➔ ${targetSigil.spell.toUpperCase()}: Cast mimicked ${targetSigil.element} spell!`);
    }
    return true;
  };

  /**
   * Resets Charge module to fully idle state once a mimicked spell completes.
   */
  proto.finishMimic = function() {
    this.stage = 'idle';
    this.inChargeMode = false;
    this.chargeSpellIndex = null;
    this.activeMimicIndex = null;
    this.activeMimicSpell = null;
    this.castStartTime = null;
    this.isSelecting = false;
    this.selectionProgress = null;
    this.selectingSigilId = null;
    if (global.GameState) {
      global.GameState.activeChargeMimic = false;
      global.GameState.chargeCastStartTime = null;
    }
  };

  /**
   * Reverts active mimicked spell and returns to Charge sigil selection stage.
   */
  proto.returnToChargeSelection = function() {
    const idx = this.activeMimicIndex !== null ? this.activeMimicIndex : this.chargeSpellIndex;
    this.activeMimicIndex = null;
    this.activeMimicSpell = null;
    this.stage = 'select';
    if (global.GameState) global.GameState.activeChargeMimic = false;

    // Cleanly close any slide-out columns child spells may have opened
    global.UISidebarDeck?.closeComponentsColumn?.();
    global.UISidebarDeck?.closeMaterialsColumn?.();
    global.UISidebarDeck?.closeSpellbookColumn?.();

    if (global.UISidebars) global.UISidebars.showToast('⚡ CHARGE: Aim cursor over a sigil to mimic its spell!');
    return this.start(idx);
  };

  /**
   * Cancels Charge mode, preserves Charge spell, and returns to spellbook.
   */
  proto.cancel = function() {
    const state = global.GameState;
    if (!state || (!this.inChargeMode && !this.isMimicking && this.stage !== 'select')) return false;

    // If in Stage 2, cancel the child spell first if still active
    if (this.isMimicking) {
      const mod = this.getActiveMimicModule();
      if (mod && typeof mod.cancel === 'function') mod.cancel();
    }

    this.finishMimic();
    if (state && !state.placedThisTurn) state.isMaterialSelected = true;

    // Cleanly close any child columns
    global.UISidebarDeck?.closeComponentsColumn?.();
    global.UISidebarDeck?.closeMaterialsColumn?.();

    if (global.AudioSynth) global.AudioSynth.playClick();
    if (global.UISidebars) {
      global.UISidebars.showToast('Charge Cancelled: Spell Preserved');
      global.UISidebars.syncNavState();
      global.UISidebars.updateTelemetry();
    }
    global.UISidebarDeck?.openSpellbookColumn(false);
    if (global.BoardRenderer) global.BoardRenderer.render();
    return true;
  };

  /**
   * Dispatches multi-stage undo:
   * - Stage 2 (mimicking): lets the child spell step backward; if child cancels out of its initial
   *   stage, returns Charge to Stage 1 (sigil selection).
   * - Stage 1 (selecting): cancels Charge mode completely.
   */
  proto.handleUndo = function() {
    const state = global.GameState;
    if (!state) return false;

    // Stage 2: If we are currently running an interactive mimicked spell
    if (this.isMimicking || this.stage === 'mimic') {
      const mod = this.getActiveMimicModule();
      if (mod) {
        if (typeof mod.handleUndo === 'function') {
          mod.handleUndo();
        } else if (typeof mod.cancel === 'function') {
          mod.cancel();
        }
      }

      // If after undoing, the mimicked spell has stepped back out of its initial stage / cancelled,
      // transition Charge from Stage 2 back to Stage 1 (sigil selection).
      if (!this.isAnyMimickedSpellActive()) {
        return this.returnToChargeSelection();
      }
      return true;
    }

    // Stage 1: Cancel Charge mode completely
    return this.cancel();
  };

  /**
   * Undoes a generic spell cast or Charge cast.
   * @param {Object} entry - Spell undo entry
   * @returns {boolean}
   */
  proto.undo = function(entry) {
    const state = global.GameState;
    if (!state || !entry) return false;

    if (entry.spell) {
      const insertIdx = Math.min(entry.spellIndex !== undefined ? entry.spellIndex : 0, state.spellbook.length);
      state.spellbook.splice(insertIdx, 0, entry.spell);
    }

    if (global.AudioSynth) global.AudioSynth.playClick();
    if (global.UISidebars) {
      global.UISidebars.showToast(`↶ Undid ${entry.name}: Restored to Spellbook`);
      global.UISidebars.renderTrayUI();
      global.UISidebars.renderSpellbookUI();
      global.UISidebars.updateTelemetry();
      global.UISidebars.syncNavState();
    }
    return true;
  };

  proto.renderFace = function() {
    // Native Canvas 2D scene graph handles visual feedback
  };

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Spell_Charge_1.1', global.SpellCharge);
})(window);
