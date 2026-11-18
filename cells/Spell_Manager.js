/**
 * @fileoverview Spell_Manager.js - Central Elemental Magic Registry & Spell Overflow Engine
 * @description Coordinates spell dispatching to dedicated spell modules (Heal, Foresight, Teleport, Charge,
 * Shift, Arch, Ritual, Manifest, Fortify, Weave, Phase, Burn), manages Spell Overflow resolution,
 * and routes spell reversals.
 */

(function(global) {
  'use strict';

  class SpellManagerClass {
    constructor() {
      this.inSpellOverflow = false;
      this.overflowCandidates = [];
      this.selectedOverflowIndices = new Set();
    }

    // ======================================================================
    // CYBER FORESIGHT (YYR) PROXIES
    // ======================================================================
    get inForesightMode() { return global.SpellForesight ? global.SpellForesight.inForesightMode : false; }
    set inForesightMode(val) { if (global.SpellForesight) global.SpellForesight.inForesightMode = val; }
    get foresightSpellIndex() { return global.SpellForesight ? global.SpellForesight.foresightSpellIndex : null; }
    set foresightSpellIndex(val) { if (global.SpellForesight) global.SpellForesight.foresightSpellIndex = val; }
    get foresightOriginalTray() { return global.SpellForesight ? global.SpellForesight.foresightOriginalTray : null; }
    set foresightOriginalTray(val) { if (global.SpellForesight) global.SpellForesight.foresightOriginalTray = val; }
    get foresightSwappedIndex() { return global.SpellForesight ? global.SpellForesight.foresightSwappedIndex : null; }
    set foresightSwappedIndex(val) { if (global.SpellForesight) global.SpellForesight.foresightSwappedIndex = val; }

    startForesight(spellIndex) { return global.SpellForesight ? global.SpellForesight.start(spellIndex) : false; }
    selectForesightMaterial(targetIndex) { if (global.SpellForesight) global.SpellForesight.selectMaterial(targetIndex); }
    finalizeForesightSwap() { if (global.SpellForesight) global.SpellForesight.finalizeSwap(); }
    cancelForesightSwap() { if (global.SpellForesight) global.SpellForesight.cancelSwap(); }

    // ======================================================================
    // DARK TELEPORT (BBP) PROXIES
    // ======================================================================
    get inTeleportMode() { return global.SpellTeleport ? global.SpellTeleport.inTeleportMode : false; }
    set inTeleportMode(val) { if (global.SpellTeleport) global.SpellTeleport.inTeleportMode = val; }
    get teleportSpellIndex() { return global.SpellTeleport ? global.SpellTeleport.teleportSpellIndex : null; }
    set teleportSpellIndex(val) { if (global.SpellTeleport) global.SpellTeleport.teleportSpellIndex = val; }
    get teleportHeldSigil() { return global.SpellTeleport ? global.SpellTeleport.teleportHeldSigil : null; }
    set teleportHeldSigil(val) { if (global.SpellTeleport) global.SpellTeleport.teleportHeldSigil = val; }
    get teleportRotation() { return global.SpellTeleport ? global.SpellTeleport.teleportRotation : 0; }
    set teleportRotation(val) { if (global.SpellTeleport) global.SpellTeleport.teleportRotation = val; }

    startTeleport(spellIndex) { return global.SpellTeleport ? global.SpellTeleport.start(spellIndex) : false; }
    triggerTeleportAction() { return global.SpellTeleport ? global.SpellTeleport.triggerAction() : false; }
    pickUpSigil() { return global.SpellTeleport ? global.SpellTeleport.pickUpSigil() : false; }
    placeTeleportSigil() { return global.SpellTeleport ? global.SpellTeleport.placeSigil() : false; }
    cancelTeleport() { return global.SpellTeleport ? global.SpellTeleport.cancel() : false; }

    // ======================================================================
    // LIGHT CHARGE (RRY) PROXIES
    // ======================================================================
    get inChargeMode() { return global.SpellCharge ? global.SpellCharge.inChargeMode : false; }
    set inChargeMode(val) { if (global.SpellCharge) global.SpellCharge.inChargeMode = val; }
    get chargeSpellIndex() { return global.SpellCharge ? global.SpellCharge.chargeSpellIndex : null; }
    set chargeSpellIndex(val) { if (global.SpellCharge) global.SpellCharge.chargeSpellIndex = val; }

    startCharge(spellIndex) { return global.SpellCharge ? global.SpellCharge.start(spellIndex) : false; }
    mimicSelectedSigil() { return global.SpellCharge ? global.SpellCharge.mimicSelectedSigil() : false; }
    cancelCharge() { return global.SpellCharge ? global.SpellCharge.cancel() : false; }

    // ======================================================================
    // WOOD SHIFT (PPY) PROXIES
    // ======================================================================
    get inShiftMode() { return global.SpellShift ? global.SpellShift.inShiftMode : false; }
    set inShiftMode(val) { if (global.SpellShift) global.SpellShift.inShiftMode = val; }
    get shiftSpellIndex() { return global.SpellShift ? global.SpellShift.shiftSpellIndex : null; }
    set shiftSpellIndex(val) { if (global.SpellShift) global.SpellShift.shiftSpellIndex = val; }

    startShift(spellIndex) { return global.SpellShift ? global.SpellShift.start(spellIndex) : false; }
    selectShiftSigil() { return global.SpellShift ? global.SpellShift.selectSigil() : false; }
    triggerShiftAction() { return global.SpellShift ? global.SpellShift.triggerAction() : false; }
    finalizeShift() { return global.SpellShift ? global.SpellShift.finalizeShift() : false; }
    cancelShift() { return global.SpellShift ? global.SpellShift.cancel() : false; }

    // ======================================================================
    // STORM ARCH (YYP) PROXIES
    // ======================================================================
    get inArchMode() { return global.SpellArch ? global.SpellArch.inArchMode : false; }
    set inArchMode(val) { if (global.SpellArch) global.SpellArch.inArchMode = val; }
    get archSpellIndex() { return global.SpellArch ? global.SpellArch.archSpellIndex : null; }
    set archSpellIndex(val) { if (global.SpellArch) global.SpellArch.archSpellIndex = val; }

    startArch(spellIndex) { return global.SpellArch ? global.SpellArch.start(spellIndex) : false; }
    toggleArchSigilSelect() { return global.SpellArch ? global.SpellArch.toggleSigilSelect() : false; }
    finalizeArch() { return global.SpellArch ? global.SpellArch.finalizeArch() : false; }
    cancelArch() { return global.SpellArch ? global.SpellArch.cancel() : false; }

    // ======================================================================
    // ICE RITUAL (BBR) PROXIES
    // ======================================================================
    get inRitualMode() { return global.SpellRitual ? global.SpellRitual.inRitualMode : false; }
    set inRitualMode(val) { if (global.SpellRitual) global.SpellRitual.inRitualMode = val; }
    get ritualSpellIndex() { return global.SpellRitual ? global.SpellRitual.ritualSpellIndex : null; }
    set ritualSpellIndex(val) { if (global.SpellRitual) global.SpellRitual.ritualSpellIndex = val; }

    startRitual(spellIndex) { return global.SpellRitual ? global.SpellRitual.start(spellIndex) : false; }
    selectRitualSigil() { return global.SpellRitual ? global.SpellRitual.selectSigil() : false; }
    finalizeRitual() { return global.SpellRitual ? global.SpellRitual.finalizeRitual() : false; }
    cancelRitual() { return global.SpellRitual ? global.SpellRitual.cancel() : false; }

    // ======================================================================
    // HEAT MANIFEST (RRB) PROXIES
    // ======================================================================
    get inManifestMode() { return global.SpellManifest ? global.SpellManifest.inManifestMode : false; }
    set inManifestMode(val) { if (global.SpellManifest) global.SpellManifest.inManifestMode = val; }
    get manifestSpellIndex() { return global.SpellManifest ? global.SpellManifest.manifestSpellIndex : null; }
    set manifestSpellIndex(val) { if (global.SpellManifest) global.SpellManifest.manifestSpellIndex = val; }

    startManifest(spellIndex) { return global.SpellManifest ? global.SpellManifest.start(spellIndex) : false; }
    selectManifestSigil() { return global.SpellManifest ? global.SpellManifest.selectSigil() : false; }
    finalizeManifest() { return global.SpellManifest ? global.SpellManifest.finalizeManifest() : false; }
    cancelManifest() { return global.SpellManifest ? global.SpellManifest.cancel() : false; }

    // ======================================================================
    // SPELL CASTING DISPATCHER
    // ======================================================================

    /**
     * Casts a spell from the player's spellbook by index.
     * @param {number} spellIndex
     * @returns {boolean}
     */
    isTurnTransitionBusy() {
      const state = global.GameState;
      return !!(
        !state?.matchStarted ||
        state?.isMatchStarting ||
        state?.isMatchEnding ||
        global.TurnManager?.isEndingTurn ||
        state?.isSequentialPlacing ||
        global.BoardRippleRenderer?.materialSpawnAnim
      );
    }

    /**
     * Dispatches spell casting by formula/name to the appropriate dedicated spell module.
     * @param {number} spellIndex - Index in state.spellbook
     * @returns {boolean}
     */
    castSpell(spellIndex) {
      const state = global.GameState;
      if (!state || spellIndex < 0 || spellIndex >= state.spellbook.length) return false;
      if (this.isTurnTransitionBusy()) {
        const msg = '⏳ Wait for Start/End Turn animations to finish before casting spells!';
        if (typeof state.showToast === 'function') state.showToast(msg);
        else global.UISidebars?.showToast?.(msg);
        return false;
      }

      const spell = state.spellbook[spellIndex];
      if (!spell) return false;

      // Prevent casting another spell if one is already active or unfinalized
      const isSpellActive = !!(
        state.inArchMode || global.SpellArch?.inArchMode ||
        state.inShiftMode || global.SpellShift?.inShiftMode ||
        state.inRitualMode || global.SpellRitual?.inRitualMode ||
        state.inManifestMode || global.SpellManifest?.inManifestMode ||
        state.inTeleportMode || global.SpellTeleport?.inTeleportMode ||
        state.inChargeMode || global.SpellCharge?.inChargeMode || global.SpellCharge?.isMimicking ||
        state.inForesightMode || global.SpellForesight?.inForesightMode ||
        state.inSpellOverflow ||
        (state.activeMaterialMod === 'weave' && (state.weaveStep || 0) > 0) || global.SpellWeave?.inWeaveMode
      );
      if (isSpellActive) {
        if (typeof state.showToast === 'function') {
          state.showToast('⚠️ A spell is already active! Finish or cancel it first.');
        } else if (global.UISidebars) {
          global.UISidebars.showToast('⚠️ A spell is already active! Finish or cancel it first.');
        }
        return false;
      }

      if (typeof spell.charges === 'number' && spell.charges <= 0) {
        if (global.UISidebars) {
          global.UISidebars.showToast(`⚠️ ${spell.name} is depleted! Forge combos to recharge.`);
        }
        return false;
      }

      if (spell.usableRound > state.round) {
        if (global.UISidebars) {
          global.UISidebars.showToast(`⏳ ${spell.name} is primed for Round ${spell.usableRound}!`);
        }
        return false;
      }

      const formula = (spell.formula || '').trim().toUpperCase();
      const name = (spell.name || '').trim().toLowerCase();

      // Dispatch map for all 12 elemental formulas & spell names
      if ((formula === 'PPB' || name === 'heal') && global.SpellHeal) {
        return (global.SpellHeal.cast || global.SpellHeal.start).call(global.SpellHeal, spellIndex);
      }
      if ((formula === 'YYR' || name === 'foresight' || name === 'seek') && global.SpellForesight) {
        return (global.SpellForesight.start || global.SpellForesight.cast).call(global.SpellForesight, spellIndex);
      }
      if ((formula === 'BBP' || name === 'teleport' || name === 'warp') && global.SpellTeleport) {
        return (global.SpellTeleport.start || global.SpellTeleport.cast).call(global.SpellTeleport, spellIndex);
      }
      if ((formula === 'RRY' || name === 'charge') && global.SpellCharge) {
        return (global.SpellCharge.start || global.SpellCharge.cast).call(global.SpellCharge, spellIndex);
      }
      if ((formula === 'PPY' || name === 'shift') && global.SpellShift) {
        return (global.SpellShift.start || global.SpellShift.cast).call(global.SpellShift, spellIndex);
      }
      if ((formula === 'YYP' || name === 'arch') && global.SpellArch) {
        return (global.SpellArch.start || global.SpellArch.cast).call(global.SpellArch, spellIndex);
      }
      if ((formula === 'BBR' || name === 'ritual' || name === 'store') && global.SpellRitual) {
        return (global.SpellRitual.start || global.SpellRitual.cast).call(global.SpellRitual, spellIndex);
      }
      if ((formula === 'RRB' || name === 'manifest' || name === 'form') && global.SpellManifest) {
        return (global.SpellManifest.start || global.SpellManifest.cast).call(global.SpellManifest, spellIndex);
      }
      if ((formula === 'PPR' || name === 'fortify' || name === 'lock') && global.SpellFortify) {
        return (global.SpellFortify.cast || global.SpellFortify.start).call(global.SpellFortify, spellIndex);
      }
      if ((formula === 'YYB' || name === 'weave') && global.SpellWeave) {
        return (global.SpellWeave.cast || global.SpellWeave.start).call(global.SpellWeave, spellIndex);
      }
      if ((formula === 'BBY' || name === 'phase') && global.SpellPhase) {
        return (global.SpellPhase.cast || global.SpellPhase.start).call(global.SpellPhase, spellIndex);
      }
      if ((formula === 'RRP' || name === 'burn') && global.SpellBurn) {
        return (global.SpellBurn.cast || global.SpellBurn.start).call(global.SpellBurn, spellIndex);
      }

      if (global.UISidebars) {
        global.UISidebars.showToast(`✨ Cast ${spell.name} (${spell.element})!`);
      }
      return true;
    }

    /**
     * Dispatches spell reversal to the appropriate dedicated spell module.
     * @param {Object} entry - Spell undo entry
     * @returns {boolean}
     */
    undoSpell(entry) {
      if (!entry) return false;

      if (entry.spell && entry.spell.formula === 'RRY') {
        entry.spell.name = 'Charge';
      }

      if (entry.type === 'heal' && global.SpellHeal) return global.SpellHeal.undo(entry);
      if ((entry.type === 'foresight' || entry.type === 'seek') && global.SpellForesight) return global.SpellForesight.undo(entry);
      if ((entry.type === 'teleport' || entry.type === 'warp') && global.SpellTeleport) return global.SpellTeleport.undo(entry);
      if ((entry.type === 'charge' || entry.type === 'generic') && global.SpellCharge) return global.SpellCharge.undo(entry);
      if (entry.type === 'shift' && global.SpellShift) return global.SpellShift.undo(entry);
      if (entry.type === 'arch' && global.SpellArch) return global.SpellArch.undo(entry);
      if ((entry.type === 'ritual' || entry.type === 'store') && global.SpellRitual) return global.SpellRitual.undo(entry);
      if ((entry.type === 'manifest' || entry.type === 'form') && global.SpellManifest) return global.SpellManifest.undo(entry);
      if ((entry.type === 'fortify' || entry.type === 'lock') && global.SpellFortify) return global.SpellFortify.undo(entry);
      if (entry.type === 'weave' && global.SpellWeave) return global.SpellWeave.undo(entry);
      if (entry.type === 'phase' && global.SpellPhase) return global.SpellPhase.undo(entry);
      if (entry.type === 'burn' && global.SpellBurn) return global.SpellBurn.undo(entry);

      const state = global.GameState;
      if (state && entry.spell) {
        const insertIdx = Math.min(entry.spellIndex !== undefined ? entry.spellIndex : 0, state.spellbook.length);
        state.spellbook.splice(insertIdx, 0, entry.spell);
        if (global.UISidebars) {
          global.UISidebars.renderSpellbookUI();
          global.UISidebars.syncNavState();
        }
        return true;
      }
      return false;
    }

    // ======================================================================
    // SPELL OVERFLOW RESOLUTION
    // ======================================================================

    /**
     * Initiates Spell Overflow Resolution when book + new spells exceeds capacity.
     * @param {Array<Object>} newlyForgedSpells
     */
    beginOverflow(newlyForgedSpells) {
      const state = global.GameState;
      if (!state) return;

      this.inSpellOverflow = true;
      state.inSpellOverflow = true;
      state.inSigilStage = false;
      state.showSigilAlignments = false;
      if (state.dormantSigilIds) state.dormantSigilIds.clear();
      state.selectedSigilId = null;

      const bookSpells = state.spellbook.map(s => ({ ...s, origin: 'book' }));
      const newSpells = newlyForgedSpells.map(s => ({ ...s, origin: 'new' }));
      this.overflowCandidates = [...bookSpells, ...newSpells];
      state.overflowCandidates = this.overflowCandidates;
      this.selectedOverflowIndices = new Set();
      state.selectedOverflowIndices = this.selectedOverflowIndices;

      if (global.UISidebars) {
        const comboStr = state.getComboText ? state.getComboText() : '0';
        const pointsEarned = state.getEstimatedPoints ? state.getEstimatedPoints() : 0;
        const bonusStr = state.roundBonusPoints > 0 ? ` (+${state.roundBonusPoints})` : '';
        global.UISidebars.showToast(`⚡ Detonation! +${pointsEarned}${bonusStr} Pts [Combo ${comboStr}]. Spell Overflow!`);
        global.UISidebars.navigateTo('overflow');
        global.UISidebars.renderOverflowUI();
      }
    }

    /**
     * Toggles selection of a candidate spell during Spell Overflow resolution.
     * @param {number} index - Index in overflowCandidates
     */
    toggleOverflowSpell(index) {
      const state = global.GameState;
      if (!this.inSpellOverflow || !state) return;

      if (this.selectedOverflowIndices.has(index)) {
        this.selectedOverflowIndices.delete(index);
        if (global.AudioSynth) global.AudioSynth.playClick();
      } else {
        if (this.selectedOverflowIndices.size >= state.spellbookCapacity) {
          if (global.UISidebars) {
            global.UISidebars.showToast(`You already selected ${state.spellbookCapacity} spells! Untoggle one to choose another.`);
          }
          return;
        }
        this.selectedOverflowIndices.add(index);
        if (global.AudioSynth) global.AudioSynth.playClick();
      }

      state.selectedOverflowIndices = this.selectedOverflowIndices;

      if (global.UISidebars) {
        global.UISidebars.renderOverflowUI();
        global.UISidebars.syncNavState();
      }
    }

    /**
     * Confirms exactly 6 spells kept from overflow pool and completes round advancement.
     */
    confirmSpellOverflow() {
      const state = global.GameState;
      if (!this.inSpellOverflow || !state) return;
      if (this.selectedOverflowIndices.size !== state.spellbookCapacity) return;

      const keptSpells = [];
      const sortedIndices = Array.from(this.selectedOverflowIndices).sort((a, b) => a - b);
      for (const idx of sortedIndices) {
        const cand = this.overflowCandidates[idx];
        if (cand) {
          const { origin, ...spellProps } = cand;
          keptSpells.push(spellProps);
        }
      }

      state.spellbook = keptSpells;
      state.enablePermanentSpellbook?.();
      this.inSpellOverflow = false;
      state.inSpellOverflow = false;
      this.overflowCandidates = [];
      state.overflowCandidates = [];
      this.selectedOverflowIndices.clear();
      state.selectedOverflowIndices.clear();

      if (global.AudioSynth) global.AudioSynth.playClick();
      if (global.UISidebars) {
        global.UISidebars.showToast(`✨ Spellbook Updated: 6 Spells Kept for Round ${state.round + 1}!`);
      }

      if (global.TurnManager) {
        global.TurnManager.completeRoundAdvancement();
      } else if (state.completeRoundAdvancement) {
        state.completeRoundAdvancement();
      }
    }
  }

  const spellManagerInstance = new SpellManagerClass();

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Spell_Manager', spellManagerInstance);
  global.SpellManager = spellManagerInstance;

})(window);
