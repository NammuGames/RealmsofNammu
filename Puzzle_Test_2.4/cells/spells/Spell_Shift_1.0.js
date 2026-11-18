/**
 * @fileoverview cells/spells/Spell_Shift_1.0.js - Wood Shift Spell (PPY) Core & Zone Positioning
 * @description Manages Wood Shift spell initialization, Stage 1 (Zone) cursor navigation,
 * tile snapshots/restoration, and hex flower zone placement (Part 1 of multi-part SpellShift cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  class SpellShiftClass {
    constructor() {
      this.formula = 'PPY';
      this.element = 'Wood';
      this.name = 'Shift';
      this.fullName = 'Wood Shift';

      this.inShiftMode = false; this.shiftSpellIndex = null;
      this.stage = 'zone'; // 'zone' | 'component'
      this.zoneCursor = { q: 0, r: 0 };
      this.isPlaced = false;
      this.placedCenter = null;
      this.flowerTiles = [];
      this.allowedTiles = new Set();
      this.componentCursor = { q: 0, r: 0 };
      this.heldComponent = null; // null | { color: string, fromQ: number, fromR: number }
      this.originalTilesBackup = new Map(); // "q,r" -> color
      this.isFinalizing = false;
    }

    isZoneValidAt(q, r) {
      const state = global.GameState;
      return !!(state?.board && state.board.has(`${q},${r}`));
    }

    _cloneTile(t) {
      if (!t || (!t.color && !t.burned && !t.woven)) return null;
      return {
        color: t.color, phased: !!t.phased, fortified: !!t.fortified,
        burned: !!t.burned, burnOwner: t.burnOwner || null,
        woven: !!t.woven, weaveOwner: t.weaveOwner || null,
        underneath: t.underneath ? { ...t.underneath } : null,
        sigilId: t.sigilId || null, plagueId: t.plagueId || null,
        phaseOwner: t.phaseOwner || null, lockOwner: t.lockOwner || null
      };
    }

    _restoreTile(t, tk, s, state) {
      if (!t) return;
      if (!s) {
        t.color = null; t.phased = false; t.fortified = false; t.burned = false; t.woven = false;
        t.burnOwner = null; t.weaveOwner = null; t.phaseOwner = null; t.lockOwner = null;
        t.underneath = null; t.sigilId = null; t.plagueId = null;
        state?.fortifiedTiles?.delete(tk);
      } else {
        t.color = s.color; t.phased = !!s.phased; t.fortified = !!s.fortified;
        t.burned = !!s.burned; t.burnOwner = s.burnOwner || null;
        t.woven = !!s.woven; t.weaveOwner = s.weaveOwner || null;
        t.phaseOwner = s.phaseOwner || null; t.lockOwner = s.lockOwner || null;
        t.underneath = s.underneath ? { ...s.underneath } : null;
        t.sigilId = s.sigilId || null; t.plagueId = s.plagueId || null;
        if (t.fortified) state?.fortifiedTiles?.add(tk); else state?.fortifiedTiles?.delete(tk);
      }
    }

    start(spellIndex) {
      const state = global.GameState;
      if (!state || state.gameOver || state.inSpellOverflow) return false;

      this.inShiftMode = true; state.inShiftMode = true;
      this.shiftSpellIndex = spellIndex; state.shiftSpellIndex = spellIndex;
      this.stage = 'zone'; this.zoneCursor = { q: 0, r: 0 };
      this.isPlaced = false; this.placedCenter = null;
      this.flowerTiles = []; this.allowedTiles = new Set();
      this.heldComponent = null; this.originalTilesBackup.clear();
      this.isFinalizing = false; state.isMaterialSelected = false;
      global.BoardCursorRenderer?.startFlowerIn?.(false);

      if (global.UISidebars) {
        if (global.UISidebars.finishRotationInstantly) global.UISidebars.finishRotationInstantly();
        global.UISidebars.navigateTo('shift');
        global.UISidebars.syncNavState();
        global.UISidebars.showToast('🌿 WOOD SHIFT: Position 7-tile flower with WASD, then press SPACE to place!');
      }
      return true;
    }

    _step(pos, dir, state) {
      let { q, r } = pos;
      if (dir === 'left') { q -= 1; r += 1; }
      else if (dir === 'right') { q += 1; r -= 1; }
      else if (dir === 'up') { if (state.upDownAxisState === 0) r += 1; else q += 1; state.upDownAxisState = 1 - state.upDownAxisState; }
      else if (dir === 'down') { if (state.upDownAxisState === 0) q -= 1; else r -= 1; state.upDownAxisState = 1 - state.upDownAxisState; }
      return { q, r };
    }

    _getFlowerTiles(cq, cr, r2 = false) {
      if (!r2) return global.HexMath ? global.HexMath.getFlowerTiles(cq, cr) : [];
      const tiles = [];
      for (let dq = -2; dq <= 2; dq++) {
        for (let dr = Math.max(-2, -dq - 2); dr <= Math.min(2, -dq + 2); dr++) tiles.push(`${cq + dq},${cr + dr}`);
      }
      return tiles;
    }

    _updateFlowerRadius(isR2, state) {
      if (!this.placedCenter) return;
      this.flowerTiles = this._getFlowerTiles(this.placedCenter.q, this.placedCenter.r, isR2);
      this.allowedTiles = new Set(this.flowerTiles.filter(tk => state?.board?.has(tk)));
      if (isR2 && state?.board) {
        for (const tk of this.allowedTiles) {
          if (!this.originalTilesBackup.has(tk)) this.originalTilesBackup.set(tk, this._cloneTile(state.board.get(tk)));
        }
      }
    }

    _isTileAllowed(q, r, state) {
      const key = `${q},${r}`;
      if (this.allowedTiles.has(key)) return true;
      if (!this.placedCenter || !state?.board?.has(key)) return false;
      const dist = global.HexMath ? global.HexMath.hexDistance(q - this.placedCenter.q, r - this.placedCenter.r) : 99;
      return dist === 2 && this.heldComponent === null && !!state.board.get(key)?.woven;
    }

    moveDirection(dir) {
      const state = global.GameState;
      if (!state || !this.inShiftMode) return false;

      if (this.stage === 'zone') {
        const next = this._step(this.zoneCursor, dir, state);
        if (global.HexMath && global.HexMath.hexDistance(next.q, next.r) <= (state.boardRadius || 6) + 1) {
          this.zoneCursor = next;
          global.AudioSynth?.playClick?.(); global.UISidebars?.syncNavState?.();
          return true;
        }
        return false;
      }

      // Stage 'component'
      const next = this._step(this.componentCursor, dir, state);
      if (this._isTileAllowed(next.q, next.r, state)) {
        this.componentCursor = next;
        global.AudioSynth?.playClick?.(); global.UISidebars?.syncNavState?.();
        return true;
      }

      if (dir === 'up' || dir === 'down') {
        let altQ = this.componentCursor.q, altR = this.componentCursor.r;
        if (dir === 'up') { if (state.upDownAxisState === 0) altQ += 1; else altR += 1; }
        else { if (state.upDownAxisState === 0) altR -= 1; else altQ -= 1; }
        if (this._isTileAllowed(altQ, altR, state)) {
          this.componentCursor = { q: altQ, r: altR };
          global.AudioSynth?.playClick?.(); global.UISidebars?.syncNavState?.();
          return true;
        }
      }
      return false;
    }

    triggerAction() {
      return this.stage === 'zone' ? this.placeZone() : this.triggerComponentAction();
    }

    placeZone() {
      const state = global.GameState;
      if (!state || !this.inShiftMode || this.stage !== 'zone') return false;
      if (!this.isZoneValidAt(this.zoneCursor.q, this.zoneCursor.r)) {
        global.AudioSynth?.playCancel?.();
        global.UISidebars?.showToast?.('⚠️ Center of Wood Shift Zone must be on the board!');
        return false;
      }
      this.isPlaced = true;
      this.placedCenter = { ...this.zoneCursor };
      this.flowerTiles = this._getFlowerTiles(this.placedCenter.q, this.placedCenter.r, false);
      this.allowedTiles = new Set(this.flowerTiles.filter(tk => state.board.has(tk)));
      this.originalTilesBackup.clear();
      for (const tk of this.allowedTiles) this.originalTilesBackup.set(tk, this._cloneTile(state.board.get(tk)));
      this.stage = 'component';
      this.componentCursor = { ...this.placedCenter };
      this.heldComponent = null;
      global.AudioSynth?.playPlace?.();
      global.UISidebars?.syncNavState?.();
      global.UISidebars?.showToast?.('🌿 7-Tile Zone Placed! Rearrange components within the flower, then press ENTER to finalize.');
      return true;
    }

    selectSigil() {
      return this.placeZone();
    }
  }

  global.SpellShiftClass = SpellShiftClass;

})(typeof window !== 'undefined' ? window : this);
