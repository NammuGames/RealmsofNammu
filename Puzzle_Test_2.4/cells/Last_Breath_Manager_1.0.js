/**
 * @fileoverview cells/Last_Breath_Manager_1.0.js - Dynamic Last Breath Interception (Evaluation & Tier 1)
 * @description Evaluates Last Breath threat thresholds, holds resonant Heal spell tokens,
 * initializes the defense sequence, and runs Tier 1 staged HP-pod heal launches.
 */

(function(global) {
  'use strict';

  const H1_SEC = global.H_TIMING?.BEAT_SEC ?? (Math.pow(12, 8) / 1420405751.768);
  const H2_MS = global.H_TIMING?.TWO_BEATS_MS ?? (H1_SEC * 2000);
  const H_HALF_MS = global.H_TIMING?.HALF_BEAT_MS ?? (H1_SEC * 500);
  const DRIFT_SPEED = global.H_TIMING?.DRIFT_PX_PER_SEC ?? (144 / H1_SEC);

  class LastBreathManagerClass {
    constructor() {
      this.isThreatened = false;
      this.neededHealSpells = 0;
      this.heldResonantHeals = [];
      this.activeHealTokens = [];
      this.activeSplashes = [];
      this.isInterceptionRunning = false;
    }

    /**
     * Evaluates incoming damage at End Turn Step 4 (Resonant Detonations completion).
     * If net HP <= 0, marks Last Breath as active, calculates needed heal spells,
     * and flags resonant Heal spell tokens so they remain floating on the board.
     * @param {Object} state - GameState instance
     * @param {Array<Object>} persistentSpellTokens - Active spell tokens on the board
     * @param {Array<Object>} newlyForgedSpells - Spells forged during this turn
     */
    evaluateAndHoldResonantHeals(state, persistentSpellTokens, newlyForgedSpells = []) {
      if (!state) return;
      this.isThreatened = false;
      this.neededHealSpells = 0;
      this.heldResonantHeals = [];

      // Calculate incoming damage count
      let coversCount = 0;
      if (state.board) {
        for (const tile of state.board.values()) {
          if (tile && (tile.coveredComponent || (tile.underneath?.color && tile.underneath.color !== 'disease'))) {
            coversCount++;
          }
        }
      }

      let offBoardShapesCount = 0;
      if (global.ComponentDisease?.shapes) {
        for (const shape of global.ComponentDisease.shapes.values()) {
          if (shape.offBoard) offBoardShapesCount++;
        }
      }

      const activeDmg = state.activeDamageTiles || [];
      const overhangCount = activeDmg.filter(t => !t.plagueShapeId && !t.isPlacedPlague && t.color !== 'disease').length;
      const totalDamage = coversCount + offBoardShapesCount + overhangCount;

      const pendingHeal = state.pendingHeal || 0;
      const netHp = state.hp + pendingHeal - totalDamage;

      if (netHp <= 0 && totalDamage > 0) {
        this.isThreatened = true;
        const deficit = Math.max(1, 1 - netHp);
        this.neededHealSpells = Math.ceil(deficit / 4);

        if (Array.isArray(persistentSpellTokens) && this.neededHealSpells > 0) {
          let heldCount = 0;
          for (const tok of persistentSpellTokens) {
            const formula = tok.sigil?.formula;
            const spellName = tok.sigil?.spell?.toLowerCase();
            const elem = tok.sigil?.element;
            const isHeal = (formula === 'PPB' || spellName === 'heal' || elem === 'feral');
            if (isHeal && heldCount < this.neededHealSpells) {
              tok.isHeldForLastBreath = true;
              this.heldResonantHeals.push(tok);
              heldCount++;
              // Also tag the matching forged spell so it isn't committed prematurely to the spellbook
              const matchSpell = newlyForgedSpells.find(s => (s.formula === 'PPB' || s.name?.toLowerCase() === 'heal') && !s._heldForLastBreath);
              if (matchSpell) matchSpell._heldForLastBreath = true;
            }
          }
        }

        if (this.neededHealSpells > 0) {
          state.showToast(`☠️ LAST BREATH ACTIVE! ${this.neededHealSpells} Heal Spell(s) needed for defense.`);
        }
      }
    }

    /**
     * Checks if Last Breath is active when entering Step 5 (Damage Tokens Drift).
     * @param {Object} state - GameState instance
     * @param {number} totalDamageCount - Total damage tokens count
     * @returns {boolean} True if Last Breath interception sequence should run
     */
    isLastBreathActive(state, totalDamageCount = 0) {
      if (!state) return false;
      const pendingHeal = state.pendingHeal || 0;
      return (state.hp + pendingHeal - totalDamageCount) <= 0;
    }

    /**
     * Master execution sequence for Last Breath Interceptions:
     * Tier 1: Staged Turn Heal tokens from HP Sub-Pod.
     * Tier 2: Held Resonant Heal tokens splitting into 4 tokens each.
     * Tier 3: Spellbook opening, firing heal tokens from Heal button.
     * Final: Survival recovery or elimination.
     */
    executeLastBreathSequence(state, newlyForgedSpells = [], onComplete) {
      const rr = global.BoardRippleRenderer;
      if (!state || !rr) {
        if (typeof onComplete === 'function') onComplete();
        return;
      }

      state.cameraLocked = true;
      this.isInterceptionRunning = true;
      this.activeHealTokens = [];
      this.activeSplashes = [];

      state.showToast('🛡️ LAST BREATH DEFENSE: Intercepting incoming damage!');

      // Synchronized Tier 1 (HP) + Tier 2 (Board) + Tier 3 (Spellbook) defense
      this.runTier2And3Heals(state, () => {
        this.finalizeResolution(state, newlyForgedSpells, onComplete);
      });
    }

    /**
     * Legacy hook retained as a pass-through; Tier 1 now launches in sync inside runTier2And3Heals.
     */
    runTier1StagedHeal(state, onDone) {
      if (typeof onDone === 'function') onDone();
    }

    _toBoardLocal(pt) {
      const f = global.HexUIEngine?.boardFrame;
      return f?.screenToLocal ? f.screenToLocal(pt.x, pt.y) : (f?.position ? { x: pt.x - f.position.x, y: pt.y - f.position.y } : pt);
    }
  }

  LastBreathManagerClass._timing = { H1_SEC, H2_MS, H_HALF_MS, DRIFT_SPEED };

  const lastBreathManagerInstance = new LastBreathManagerClass();
  global.LastBreathManagerClass = LastBreathManagerClass;
  global.LastBreathManager = lastBreathManagerInstance;

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Last_Breath_Manager_1.0', lastBreathManagerInstance);
})(typeof window !== 'undefined' ? window : this);
