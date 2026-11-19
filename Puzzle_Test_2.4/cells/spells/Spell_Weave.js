/**
 * @fileoverview Spell_Weave.js - Air Weave Spell (YYB) Module
 * @description Encapsulates Air Weave material modification logic:
 * Outlines the upcoming Material in yellow, and allows placing its 4 components
 * one tile at a time to vacant tiles adjacent to the previous component placed,
 * creating a custom player-designed shape.
 */

(function(global) {
  'use strict';

  class SpellWeaveClass {
    constructor() {
      this.formula = 'YYB';
      this.element = 'Air';
      this.name = 'Weave';
      this.fullName = 'Air Weave';

      this.inWeaveMode = false;
      this.weaveStep = 0; // 0..3
      this.placedTiles = []; // [{ q, r, color, key, slot }]
      this.unplacedSlots = []; // [{ slot: 0..3, color }]
    }

    /**
     * Casts Air Weave from the spellbook.
     * Initiates the 1-tile-at-a-time placement mode.
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
        state.showToast('⚠️ Cannot cast Air Weave: Material already placed this turn! Only castable before placement.');
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

      this.inWeaveMode = true;
      this.weaveStep = 0;
      this.placedTiles = [];
      this.unplacedSlots = activeMat.colors.map((color, slot) => ({ slot, color }));
      state.activeMaterialMod = 'weave';
      state.weaveStep = 0;
      state.weavePlacedTiles = this.placedTiles;
      state.isMaterialSelected = true;

      if (global.UndoManager) {
        global.UndoManager.recordSpellCast({
          type: 'weave',
          name: consumedSpell.name || this.fullName,
          spell: consumedSpell,
          spellIndex: spellIndex,
          originalColors: [...activeMat.colors]
        });
      }

      state.showToast('✨ AIR WEAVE: Place 4 components one-by-one! Each must be adjacent to an already-placed component.');
      state.syncUI();
      return true;
    }

    /**
     * Checks if current single component can be placed at (q, r).
     * @param {number} q
     * @param {number} r
     * @returns {boolean}
     */
    canPlaceComponentAt(q, r) {
      const state = global.GameState;
      if (!state || !state.isInsideBoard(q, r)) return false;

      const key = `${q},${r}`;
      const tile = state.board.get(key);
      if (!tile || tile.color) return false;
      if (this.placedTiles.some(pt => pt.q === q && pt.r === r)) return false;

      if (this.placedTiles.length === 0) return true;

      return this.placedTiles.some(pt => {
        const dist = (global.HexMath && typeof global.HexMath.hexDistanceBetween === 'function')
          ? global.HexMath.hexDistanceBetween(q, r, pt.q, pt.r)
          : Math.max(Math.abs(q - pt.q), Math.abs(r - pt.r), Math.abs((q - pt.q) + (r - pt.r)));
        return dist <= 2;
      });
    }

    /**
     * Positions component 1..4, or on the 5th click finalizes and officially places.
     * @returns {boolean}
     */
    placeComponent() {
      const state = global.GameState;
      if (!state || !this.inWeaveMode) return false;

      // 5th click: Finalize all 4 positioned components
      if (this.placedTiles.length >= 4) {
        return this.finalizePlacement();
      }

      const cursor = state.placementCursor;
      if (!this.canPlaceComponentAt(cursor.q, cursor.r)) {
        if (this.placedTiles.length > 0) {
          state.showToast('⚠️ Must be placed within 2 spaces of an already positioned component!');
        } else {
          state.showToast('⚠️ Must be placed on a vacant board tile!');
        }
        global.AudioSynth?.playCancel?.();
        return false;
      }

      const activeMat = state.getActiveMaterial();
      if (!activeMat) return false;

      const currentIdx = this.placedTiles.length;
      const activeSlot = (this.unplacedSlots && this.unplacedSlots.length > 0)
        ? this.unplacedSlots.shift()
        : { slot: currentIdx, color: activeMat.colors[currentIdx] };
      const color = activeSlot.color;
      const key = `${cursor.q},${cursor.r}`;

      // Staged in high-layer enlarged state (not yet committed to tile.color on board)
      const placedEntry = {
        q: cursor.q,
        r: cursor.r,
        color: color,
        slot: activeSlot.slot,
        key: key,
        step: currentIdx + 1
      };
      this.placedTiles.push(placedEntry);
      state.weaveStep = this.placedTiles.length;
      state.weavePlacedTiles = this.placedTiles;

      if (global.AudioSynth?.playPlace) global.AudioSynth.playPlace();
      else global.AudioSynth?.playClick?.();

      if (global.BoardRippleRenderer?.triggerPlacementRipple) {
        global.BoardRippleRenderer.triggerPlacementRipple([{ q: cursor.q, r: cursor.r }], '#fde047', { profile: 'weave', bands: 1 });
      }

      if (this.placedTiles.length < 4) {
        const nextColor = activeMat.colors[this.placedTiles.length];
        state.showToast(`✨ Positioned Component ${this.placedTiles.length}/4 (${color.toUpperCase()})! Next: ${nextColor.toUpperCase()}`);
      } else {
        state.showToast('✨ All 4 components positioned! 5th click (PLACE / ENTER / SPACE) finalizes placement.');
      }
      state.syncUI();
      if (global.BoardRenderer?.render) global.BoardRenderer.render();
      return true;
    }

    /**
     * Commits all 4 positioned Weave components to the board on the 5th click.
     * @returns {boolean}
     */
    finalizePlacement() {
      const state = global.GameState;
      if (!state || !this.inWeaveMode || this.placedTiles.length !== 4) return false;

      for (const pt of this.placedTiles) {
        const tile = state.board.get(pt.key);
        if (tile) {
          tile.color = pt.color;
          tile.weaveStep = null;
          tile.woven = true;
          tile.weaveOwner = state.currentPlayerId || 1;
        }
      }

      global.AudioSynth?.playReward?.('weave');

      // 5th click: Trigger unified 4-band straight-bridge capsule ripple across all 4 custom woven tiles
      if (global.BoardRippleRenderer?.triggerPlacementRipple) {
        const wovenCoords = this.placedTiles.map(pt => ({ q: pt.q, r: pt.r }));
        global.BoardRippleRenderer.triggerPlacementRipple(wovenCoords, '#fde047', { profile: 'enchantment', bands: 4 });
      }

      const undoEntry = {
        cursor: { ...state.placementCursor },
        rotation: state.selectedRotation,
        upDownAxisState: state.upDownAxisState,
        onBoardTiles: this.placedTiles.map(pt => ({ key: pt.key, color: pt.color, woven: true })),
        previousDamageTiles: [...state.activeDamageTiles],
        previousHp: state.hp,
        previousLockedSigilIds: new Set(state.lockedSigilIds),
        activeMaterialMod: 'weave',
        weavePlacedTiles: [...this.placedTiles],
        placedMat: state.materialsTray[0]
      };

      state.placedThisTurn = true;
      state.isMaterialSelected = false;
      state.materialsTray[0] = null;
      this.inWeaveMode = false;
      state.activeMaterialMod = null;

      if (global.UndoManager) {
        global.UndoManager.recordPlacement(undoEntry);
      }

      if (global.SigilResolver) {
        global.SigilResolver.evaluateSigils(state.board);
        if (state.allCandidates.length > 0) {
          state.inSigilStage = true;
          state.showSigilAlignments = false;
          global.SigilResolver.resolveInitialSigils(state.board);
        } else {
          state.inSigilStage = false;
          state.showSigilAlignments = false;
          state.selectedSigilId = null;
          state.sigilCursorVertex = { type: 'up', q: 0, r: 0 };
          state.dormantSigilIds.clear();
          global.SigilResolver.syncBoardSigilTiles(state.board);
        }
      }

      state.showToast('🎉 CUSTOM SHAPE WOVEN! Sigils evaluated.');
      state.syncUI();
      if (global.BoardRenderer?.render) global.BoardRenderer.render();
      return true;
    }

    /**
     * Cycles the remaining unplaced components of the Weave material in CW or CCW direction.
     * @param {string|number} dir - 'cw' | 'ccw' | 1 | -1
     * @returns {boolean}
     */
    cycleComponent(dir) {
      const state = global.GameState;
      if (!state || !this.inWeaveMode) return false;

      const activeMat = state.getActiveMaterial();
      if (!activeMat || !Array.isArray(activeMat.colors)) return false;

      const currentIdx = this.placedTiles.length;
      const remainingCount = activeMat.colors.length - currentIdx;
      if (remainingCount <= 1) return false;

      const remaining = activeMat.colors.slice(currentIdx);
      if (dir === 'ccw' || dir === -1) {
        remaining.unshift(remaining.pop());
        if (this.unplacedSlots?.length > 1) this.unplacedSlots.unshift(this.unplacedSlots.pop());
      } else {
        remaining.push(remaining.shift());
        if (this.unplacedSlots?.length > 1) this.unplacedSlots.push(this.unplacedSlots.shift());
      }
      activeMat.colors.splice(currentIdx, remainingCount, ...remaining);

      if (global.AudioSynth?.playRotate) global.AudioSynth.playRotate();
      else global.AudioSynth?.playClick?.();

      const nextColor = activeMat.colors[currentIdx];
      state.showToast(`🔄 Weave Component: ${nextColor.toUpperCase()} (${currentIdx + 1}/4)`);
      state.syncUI();
      if (global.UIDeckSync?.syncMaterialsTrayWithGameState) {
        global.UIDeckSync.syncMaterialsTrayWithGameState();
      }
      if (global.BoardRenderer?.render) global.BoardRenderer.render();
      return true;
    }

    /**
     * Retracts the most recently placed single component during active Weave mode.
     * @returns {boolean}
     */
    undoStep() {
      const state = global.GameState;
      if (!state || !this.inWeaveMode || this.placedTiles.length === 0) return false;

      const last = this.placedTiles.pop();
      const tile = state.board.get(last.key);
      if (tile) {
        tile.color = null;
        tile.weaveStep = null;
      }
      if (this.unplacedSlots && last.slot !== undefined) {
        this.unplacedSlots.unshift({ slot: last.slot, color: last.color });
      }

      state.weaveStep = this.placedTiles.length;
      state.weavePlacedTiles = this.placedTiles;

      state.placementCursor.q = last.q;
      state.placementCursor.r = last.r;

      global.AudioSynth?.playClick?.();
      state.showToast(`↶ Retracted Component ${last.color.toUpperCase()} (${this.placedTiles.length}/4 positioned)`);
      state.syncUI();
      if (global.BoardRenderer?.render) global.BoardRenderer.render();
      return true;
    }

    /**
     * Undoes the Weave spell before placement is finalized.
     * @param {Object} entry - Spell undo entry
     * @returns {boolean}
     */
    undo(entry) {
      const state = global.GameState;
      if (!state || !entry) return false;

      if (this.placedTiles && this.placedTiles.length > 0) {
        this.placedTiles.forEach(pt => {
          const tile = state.board.get(pt.key);
          if (tile) {
            tile.color = null;
            tile.weaveStep = null;
          }
        });
      }

      this.placedTiles = [];
      this.inWeaveMode = false;
      this.weaveStep = 0;
      state.activeMaterialMod = null;
      state.weaveStep = 0;
      state.weavePlacedTiles = [];

      if (entry.cleansedPlagueColors && state.revertMaterialPlague) {
        state.revertMaterialPlague(entry.cleansedPlagueColors);
      }

      if (entry.originalColors) {
        const activeMat = state.getActiveMaterial();
        if (activeMat && Array.isArray(activeMat.colors)) {
          activeMat.colors = [...entry.originalColors];
        }
      }

      if (entry.spell) {
        const insertIdx = Math.min(entry.spellIndex !== undefined ? entry.spellIndex : 0, state.spellbook.length);
        state.spellbook.splice(insertIdx, 0, entry.spell);
      }

      global.AudioSynth?.playClick?.();
      state.showToast('↶ Undid Air Weave: Tiles retracted, spell returned to Spellbook.');
      state.syncUI();
      global.UISidebarDeck?.openSpellbookColumn(false);
      return true;
    }

    reset() {
      const state = global.GameState;
      if (this.inWeaveMode && this.placedTiles && this.placedTiles.length > 0 && this.placedTiles.length < 4) {
        if (state && state.board) {
          this.placedTiles.forEach(pt => {
            const tile = state.board.get(pt.key);
            if (tile) {
              tile.color = null;
              tile.weaveStep = null;
            }
          });
        }
      } else if (state && state.board && this.placedTiles && this.placedTiles.length > 0) {
        this.placedTiles.forEach(pt => {
          const tile = state.board.get(pt.key);
          if (tile) tile.weaveStep = null;
        });
      }

      this.inWeaveMode = false;
      this.weaveStep = 0;
      this.placedTiles = [];
      this.unplacedSlots = [];
      if (state) {
        state.weaveStep = 0;
        state.weavePlacedTiles = [];
        if (state.activeMaterialMod === 'weave') state.activeMaterialMod = null;
      }
    }

    cancel() {
      this.reset();
    }
  }

  const spellWeaveInstance = new SpellWeaveClass();

  // Register with global Roll Call
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Spell_Weave', spellWeaveInstance);
  global.SpellWeave = spellWeaveInstance;

})(typeof window !== 'undefined' ? window : this);
