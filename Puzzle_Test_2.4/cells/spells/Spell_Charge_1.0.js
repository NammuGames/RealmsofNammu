/**
 * @fileoverview Spell_Charge_1.0.js - Light Charge Spell (RRY) State & Sigil Selection
 * @description Manages Light Charge state getters, mimic module lookup, targeting initiation,
 * and sigil selection transition prior to mimicked spell dispatch.
 */

(function(global) {
  'use strict';

  class SpellChargeClass {
    constructor() {
      this.formula = 'RRY';
      this.element = 'Solar';
      this.name = 'Charge';
      this.fullName = 'Light Charge';

      this.stage = 'idle'; // 'idle' | 'select' (Stage 1) | 'mimic' (Stage 2)
      this.inChargeMode = false; this.chargeSpellIndex = null;
      this.activeMimicIndex = null; this.activeMimicSpell = null;
      this.castStartTime = null; this.isSelecting = false;
      this.selectionProgress = null; this.selectingSigilId = null;
    }

    /**
     * Checks if Charge is currently in Stage 2 running an active mimicked spell.
     * @returns {boolean}
     */
    get isMimicking() {
      const state = global.GameState;
      if (!state) return false;
      const hasMimicIndex = this.activeMimicIndex !== null && this.activeMimicIndex !== undefined;
      return (hasMimicIndex || !!state.activeChargeMimic) && this.stage === 'mimic' && this.isAnyMimickedSpellActive();
    }

    /**
     * Helper to verify if any interactive mimicked spell mode is currently active.
     * @returns {boolean}
     */
    isAnyMimickedSpellActive() {
      const state = global.GameState;
      if (!state) return false;
      return !!(
        state.inRitualMode ||
        state.inManifestMode ||
        state.inTeleportMode ||
        state.inShiftMode ||
        state.inArchMode ||
        state.inForesightMode ||
        (this.activeMimicSpell === 'heal' && global.StatCanvas?.isOpen?.())
      );
    }

    /**
     * Returns the active spell module for whichever mimicked spell is currently running.
     * @returns {Object|null}
     */
    getActiveMimicModule() {
      const state = global.GameState;
      if (!state) return null;
      if (state.inRitualMode && global.SpellRitual) return global.SpellRitual;
      if (state.inManifestMode && global.SpellManifest) return global.SpellManifest;
      if (state.inTeleportMode && global.SpellTeleport) return global.SpellTeleport;
      if (state.inShiftMode && global.SpellShift) return global.SpellShift;
      if (state.inArchMode && global.SpellArch) return global.SpellArch;
      if (state.inForesightMode && global.SpellForesight) return global.SpellForesight;

      if (this.activeMimicSpell) {
        const name = this.activeMimicSpell.toLowerCase();
        if (name === 'ritual' && global.SpellRitual) return global.SpellRitual;
        if (name === 'manifest' && global.SpellManifest) return global.SpellManifest;
        if (name === 'teleport' && global.SpellTeleport) return global.SpellTeleport;
        if (name === 'shift' && global.SpellShift) return global.SpellShift;
        if (name === 'arch' && global.SpellArch) return global.SpellArch;
        if (name === 'foresight' && global.SpellForesight) return global.SpellForesight;
        if (name === 'heal' && global.SpellHeal) return global.SpellHeal;
      }
      return null;
    }

    /**
     * Initiates Light Charge (RRY) sequence.
     * @param {number} spellIndex - Index in spellbook
     * @returns {boolean} True if started
     */
    start(spellIndex) {
      const state = global.GameState;
      if (!state || state.gameOver || state.inSpellOverflow) return false;

      const hasTargetable = (state.lockedSigilIds && state.lockedSigilIds.size > 0) ||
        (state.dormantSigilIds && state.dormantSigilIds.size > 0) ||
        (state.allCandidates && state.allCandidates.length > 0);
      if (!hasTargetable) {
        if (global.UISidebars) {
          global.UISidebars.showToast('⚠️ No active or dormant Sigils on board to mimic!');
        }
        return false;
      }

      this.stage = 'select';
      this.inChargeMode = true; state.inChargeMode = true;
      this.chargeSpellIndex = spellIndex; state.chargeSpellIndex = spellIndex;
      this.activeMimicIndex = null; this.activeMimicSpell = null;
      state.activeChargeMimic = false; state.isMaterialSelected = false;
      this.isSelecting = false; this.selectionProgress = null; this.selectingSigilId = null;
      this.castStartTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      state.chargeCastStartTime = this.castStartTime;

      // Position sigil cursor over first locked or dormant sigil if available
      if (!state.sigilCursorVertex) {
        const firstLocked = state.activeSigils ? state.activeSigils.find(s => state.lockedSigilIds && state.lockedSigilIds.has(s.id)) : null;
        let initialSigil = firstLocked;
        if (!initialSigil && state.allCandidates) {
          initialSigil = state.allCandidates.find(c => (state.dormantSigilIds && state.dormantSigilIds.has(c.id)) || (!state.lockedSigilIds || !state.lockedSigilIds.has(c.id)));
        }
        if (initialSigil && global.HexMath) {
          const v = global.HexMath.findVertexForTiles(initialSigil.tiles);
          if (v) state.sigilCursorVertex = v;
        }
      }

      if (global.UISidebars) {
        if (global.UISidebars.finishRotationInstantly) {
          global.UISidebars.finishRotationInstantly();
        }
        global.UISidebars.navigateTo('charge');
        global.UISidebars.syncNavState();
        global.UISidebars.showToast('⚡ CHARGE: Aim cursor over a sigil to mimic its spell!');
      }
      return true;
    }

    /**
     * Executes the mimicked spell function of the selected locked or dormant sigil under the cursor.
     */
    mimicSelectedSigil() {
      const state = global.GameState;
      if (!state || !this.inChargeMode || this.isSelecting) return false;

      let targetSigil = state.getTargetableSigilAtCursor ? state.getTargetableSigilAtCursor() : (state.getLockedSigilAtCursor ? state.getLockedSigilAtCursor() : null);
      if (!targetSigil) {
        global.AudioSynth?.playCancel?.();
        if (global.UISidebars) global.UISidebars.showToast('⚠️ Aim cursor over a Sigil first!');
        return false;
      }

      if (targetSigil.formula === 'RRY' || targetSigil.spell === 'Charge') {
        global.AudioSynth?.playCancel?.();
        if (global.UISidebars) global.UISidebars.showToast('⚠️ Cannot mimic Charge with Charge! Aim at a different sigil.');
        return false;
      }

      const formula = (targetSigil.formula || '').trim().toUpperCase();
      const spellName = (targetSigil.spell || targetSigil.name || '').trim().toLowerCase();

      // Lock (PPR), Weave (YYB), Phase (BBY), and Burn (RRP) pre-placement checks
      const isMaterialModSpell = ['PPR', 'YYB', 'BBY', 'RRP'].includes(formula) ||
        ['fortify', 'lock', 'weave', 'phase', 'burn'].includes(spellName);
      if (isMaterialModSpell) {
        if (state.placedThisTurn) {
          global.AudioSynth?.playCancel?.();
          if (global.UISidebars) global.UISidebars.showToast(`⚠️ Cannot mimic ${targetSigil.spell}: Material already placed this turn! Pre-placement only.`);
          return false;
        }
        if (state.activeMaterialMod != null) {
          global.AudioSynth?.playCancel?.();
          if (global.UISidebars) global.UISidebars.showToast(`⚠️ Cannot mimic ${targetSigil.spell}: Material already modified with ${state.activeMaterialMod.toUpperCase()}!`);
          return false;
        }
      }

      // Validated: Start 3 H-Beats (~908ms) despawn sequence on chosen sigil
      this.isSelecting = true;
      this.selectionProgress = 0.0;
      this.selectingSigilId = targetSigil.id;

      const dur = global.H_TIMING?.THREE_BEATS_SEC ?? (3 * Math.pow(12, 8) / 1420405751.768);
      const coords = (targetSigil.tiles || []).map(tk => {
        const [q, r] = tk.split(',').map(Number);
        return { q, r };
      });

      let rippleFired = false;
      const triggerRipple = () => {
        if (!rippleFired) {
          rippleFired = true;
          if (formula !== 'PPB' && spellName !== 'heal') {
            global.AudioSynth?.playConfirm?.(formula || spellName);
          }
          if (global.BoardRippleRenderer?.triggerPlacementRipple) {
            global.BoardRippleRenderer.triggerPlacementRipple(coords, '#eb66ff', { profile: 'material', bands: 4 });
          }
        }
      };

      const finishSelection = () => {
        this.isSelecting = false;
        this.selectionProgress = null;
        this.selectingSigilId = null;
        triggerRipple();
        this._executeMimic(targetSigil);
      };

      if (global.BoardRippleRenderer?.activeRipples) {
        global.BoardRippleRenderer.activeRipples.push({
          type: 'charge_selection_transition', coords: coords.slice(), color: '#eb66ff',
          elapsed: 0, duration: dur, maxRadius: 0, thickness: 0, bands: 0, alpha0: 0,
          onTick: (t) => {
            this.selectionProgress = Math.max(0.0, Math.min(1.0, t));
            if (t >= 1.0) triggerRipple();
            global.BoardRenderer?.render?.();
          },
          onComplete: finishSelection
        });
      } else {
        const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const step = () => {
          const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          const t = Math.min(1.0, (now - start) / (dur * 1000));
          this.selectionProgress = t;
          global.BoardRenderer?.render?.();
          if (t >= 1.0) triggerRipple();
          if (t < 1.0) requestAnimationFrame(step);
          else finishSelection();
        };
        requestAnimationFrame(step);
      }
      return true;
    }
  }

  const spellChargeInstance = new SpellChargeClass();

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Spell_Charge_1.0', spellChargeInstance);
  global.SpellChargeClass = SpellChargeClass;
  global.SpellCharge = spellChargeInstance;
})(window);
