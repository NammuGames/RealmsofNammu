/**
 * @fileoverview Spell_Teleport_1.0.js - Dark Teleport Spell (BBP) Core & Pickup
 * @description Manages teleport initiation, cursor aiming, bezel styling, sigil pickup,
 * and tile snapshot restoration.
 */

(function (global) {
  'use strict';

  class SpellTeleportClass {
    constructor() {
      this.formula = 'BBP';
      this.element = 'Void';
      this.name = 'Warp';
      this.fullName = 'Dark Warp';

      this.inTeleportMode = false; this.teleportSpellIndex = null;
      this.teleportHeldSigil = null; this.teleportRotation = 0;
      this.isTransitioning = false; this.pickupProgress = null; this.castStartTime = null;
      this.isPickingUp = false; this.pickingUpSigilId = null; this.pickingUpTiles = null;
      this.isPlacing = false; this.placingSigilId = null;
      this.placementProgress = null; this.placementTargetTiles = null;
    }

    getTileBezelStyle(t, element) {
      if (!t) return { bg: '#38bdf8', stroke: '#38bdf8' };
      if (t.burned) return { bg: '#ef4444', stroke: '#ef4444' };
      if (t.phased) return { bg: '#2563eb', stroke: '#2563eb' };
      if (t.fortified) return { bg: '#c084fc', stroke: '#c084fc' };
      if (t.woven) return { bg: '#fde047', stroke: '#fde047' };
      const elem = element ? global.BoardOverlayRenderer?._getElemInfo?.(element) : null;
      if (elem) return { bg: elem.color || '#ffffff', stroke: elem.secondary || elem.sec || '#38bdf8' };
      return { bg: '#38bdf8', stroke: '#38bdf8' };
    }

    getTileBezelColor(t, element) {
      return this.getTileBezelStyle(t, element).stroke;
    }

    /**
     * Initiates Dark Teleport (BBP) sigil relocation sequence.
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
          global.UISidebars.showToast('⚠️ No active or dormant Sigils on board to warp!');
        }
        return false;
      }

      this.inTeleportMode = true; state.inTeleportMode = true;
      this.teleportSpellIndex = spellIndex; state.teleportSpellIndex = spellIndex;
      this.teleportHeldSigil = null; state.teleportHeldSigil = null;
      this.teleportRotation = 0; state.teleportRotation = 0;
      this.castStartTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      state.teleportCastStartTime = this.castStartTime;
      state.isMaterialSelected = false;

      // Position sigil cursor over first locked or dormant sigil if not already positioned
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
        if (global.UISidebars.finishRotationInstantly) global.UISidebars.finishRotationInstantly();
        global.UISidebars.navigateTo('teleport'); global.UISidebars.syncNavState();
        global.UISidebars.showToast('🌌 WARP: Aim cursor over a sigil and select it.');
      }
      return true;
    }

    /**
     * Contextual primary action:
     * - If not holding sigil: pick up sigil under cursor.
     * - If holding sigil: place held sigil at vacant cursor vertex.
     */
    triggerAction() {
      const state = global.GameState;
      if (!state || !this.inTeleportMode) return false;
      return !this.teleportHeldSigil ? this.pickUpSigil() : this.placeSigil();
    }

    /**
     * Picks up the locked or dormant sigil under cursor (auto-locking if dormant),
     * removing its tiles from board and storing in held state.
     */
    pickUpSigil() {
      const state = global.GameState;
      if (!state || !this.inTeleportMode || this.teleportHeldSigil || this.isTransitioning) return false;

      let targetSigil = state.getTargetableSigilAtCursor ? state.getTargetableSigilAtCursor() : (state.getLockedSigilAtCursor ? state.getLockedSigilAtCursor() : null);
      if (!targetSigil) {
        global.AudioSynth?.playCancel?.();
        global.UISidebars?.showToast?.('⚠️ No Sigil under cursor to pick up!');
        return false;
      }

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

      const vTiles = global.HexMath.getVertexTiles(state.sigilCursorVertex);
      const components = vTiles.map(tk => {
        const t = state.board.get(tk);
        if (!t) return { color: null, key: tk };
        const bStyle = this.getTileBezelStyle(t, targetSigil.element);
        return {
          key: tk, color: t.color, bezelBg: bStyle.bg, bezelStroke: bStyle.stroke, bezelColor: bStyle.stroke,
          phased: !!t.phased, phaseOwner: t.phaseOwner || null, fortified: !!t.fortified, lockOwner: t.lockOwner || null,
          burned: !!t.burned, burnOwner: t.burnOwner || null, woven: !!t.woven, weaveOwner: t.weaveOwner || null,
          underneath: t.underneath ? { ...t.underneath } : null, plagueId: t.plagueId || null
        };
      });

      const held = {
        id: targetSigil.id, formula: targetSigil.formula, element: targetSigil.element, spell: targetSigil.spell,
        originalVertex: { ...state.sigilCursorVertex }, originalTiles: components.map(c => ({ ...c })),
        components, colors: components.map(c => c.color)
      };

      const coords = vTiles.map(tk => {
        const [q, r] = tk.split(',').map(Number);
        const bStyle = this.getTileBezelStyle(state.board.get(tk), targetSigil.element);
        return { q, r, bezelBg: bStyle.bg, bezelStroke: bStyle.stroke, bezelColor: bStyle.stroke };
      });

      const finalizePickup = () => {
        this.isPickingUp = false; this.pickingUpSigilId = null; this.pickingUpTiles = null;
        this.pickupProgress = null;
        this.teleportHeldSigil = held; state.teleportHeldSigil = held;
        this.teleportRotation = 0; state.teleportRotation = 0;
        targetSigil.tiles.forEach(tk => {
          const tile = state.board.get(tk);
          if (!tile) return;
          if (tile.underneath) this._restoreTile(tile, tile.underneath, tk, state);
          else this._restoreTile(tile, null, tk, state);
        });
        state.lockedSigilIds.delete(targetSigil.id);
        if (global.SigilEngine) {
          state.allCandidates = global.SigilEngine.findCandidates(state.board);
          state.overlapsMap = global.SigilEngine.computeOverlaps(state.allCandidates);
        }
        state.syncBoardSigilTiles();
        this.isTransitioning = false;
        global.AudioSynth?.playClick?.();
        global.UISidebars?.showToast?.(`✨ Picked up ${targetSigil.spell}! Move to a vacant spot.`);
        global.UISidebars?.syncNavState?.();
        global.BoardRenderer?.render?.();
      };

      this.isTransitioning = true;
      if (global.BoardRippleRenderer?.playMaterialPickup) {
        this.isPickingUp = true;
        this.pickingUpSigilId = targetSigil.id;
        this.pickingUpTiles = vTiles.slice();
        this.pickupProgress = 0.0;
        const h3Sec = global.H_TIMING?.THREE_BEATS_SEC ?? (3 * Math.pow(12, 8) / 1420405751.768);
        global.BoardRippleRenderer.playMaterialPickup(coords, finalizePickup, h3Sec);
      } else {
        finalizePickup();
      }
      return true;
    }

    _restoreTile(tile, snap, key, state) {
      if (!tile) return;
      tile.color = snap ? snap.color : null;
      tile.sigilId = snap ? (snap.sigilId || null) : null;
      tile.phased = !!snap?.phased; tile.phaseOwner = snap?.phaseOwner || null;
      tile.fortified = !!snap?.fortified; tile.lockOwner = snap?.lockOwner || null;
      tile.burned = !!snap?.burned; tile.burnOwner = snap?.burnOwner || null;
      tile.woven = !!snap?.woven; tile.weaveOwner = snap?.weaveOwner || null;
      tile.underneath = snap?.underneath ? { ...snap.underneath } : null;
      tile.plagueId = snap?.plagueId || null;
      if (tile.fortified) state?.fortifiedTiles?.add(key); else state?.fortifiedTiles?.delete(key);
    }
  }

  const spellTeleportInstance = new SpellTeleportClass();
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Spell_Teleport_1.0', spellTeleportInstance);
  global.SpellTeleportClass = SpellTeleportClass;
  global.SpellTeleport = spellTeleportInstance;
})(window);
