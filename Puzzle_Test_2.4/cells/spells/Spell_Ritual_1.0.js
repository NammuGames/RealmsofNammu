/**
 * @fileoverview Spell_Ritual_1.0.js - Ice Ritual Spell (BBR) Core & Zone Navigation
 * @description Manages Ice Ritual initiation, 7-tile flower zone placement, Ring-2 Weave
 * allowance checks, and component cursor targeting/validation.
 */

(function(global) {
  'use strict';

  class SpellRitualClass {
    constructor() {
      this.formula = 'BBR';
      this.element = 'Ice';
      this.name = 'Store';
      this.fullName = 'Ice Store';

      this.inRitualMode = false; this.ritualSpellIndex = null; this.stage = 'zone'; this.zoneCursor = { q: 0, r: 0 };
      this.isPlaced = false; this.placedCenter = null; this.flowerTiles = []; this.allowedTiles = new Set();
      this.componentCursor = { q: 0, r: 0 }; this.stagedExtractions = new Map(); this.copiedTileKeys = new Set();
      this.originalBagBackup = []; this.originalRitualSlotsBackup = new Set(); this.originalTilesBackup = new Map();
      this.isFinalizing = false;
    }

    isZoneValidAt(q, r) {
      const state = global.GameState;
      return !!(state?.board && state.board.has(`${q},${r}`));
    }

    start(spellIndex) {
      const state = global.GameState;
      if (!state || state.gameOver || state.inSpellOverflow) return false;

      this.inRitualMode = true; state.inRitualMode = true; this.ritualSpellIndex = spellIndex; state.ritualSpellIndex = spellIndex;
      this.stage = 'zone'; this.zoneCursor = { q: 0, r: 0 }; this.isPlaced = false; this.placedCenter = null;
      this.flowerTiles = []; this.allowedTiles = new Set(); this.stagedExtractions.clear(); this.copiedTileKeys.clear(); this.actionHistory = [];
      if (state.newlyCopiedSlots) state.newlyCopiedSlots.clear(); else state.newlyCopiedSlots = new Set();
      this.originalBagBackup = state.componentsBag ? state.componentsBag.map(c => (typeof c === 'object' && c) ? { ...c } : c) : [];
      this.originalRitualSlotsBackup = state.ritualSlots ? new Set(state.ritualSlots) : new Set();
      this.originalTilesBackup.clear(); this.isFinalizing = false; state.isMaterialSelected = false;
      global.BoardCursorRenderer?.startFlowerIn?.(false);

      if (global.UISidebars) {
        if (global.UISidebars.finishRotationInstantly) global.UISidebars.finishRotationInstantly();
        global.UISidebars.navigateTo('ritual');
        global.UISidebars.syncNavState();
        global.UISidebars.showToast('❄️ ICE STORE: Position 7-tile flower with WASD, then press SPACE to place!');
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

    _isTileAllowed(q, r, state) {
      const key = `${q},${r}`;
      if (this.allowedTiles.has(key)) return true;
      if (!this.placedCenter || !state?.board?.has(key)) return false;
      const dist = global.HexMath ? global.HexMath.hexDistance(q - this.placedCenter.q, r - this.placedCenter.r) : 99;
      return dist === 2 && !!state.board.get(key)?.woven;
    }

    moveDirection(dir) {
      const state = global.GameState;
      if (!state || !this.inRitualMode) return false;

      if (this.stage === 'zone') {
        const next = this._step(this.zoneCursor, dir, state);
        if (global.HexMath && global.HexMath.hexDistance(next.q, next.r) <= (state.boardRadius || 6) + 1) {
          this.zoneCursor = next;
          if (global.AudioSynth) global.AudioSynth.playClick();
          if (global.UISidebars) global.UISidebars.syncNavState();
          return true;
        }
        return false;
      }

      // Stage 'component'
      const next = this._step(this.componentCursor, dir, state);
      if (this._isTileAllowed(next.q, next.r, state)) {
        this.componentCursor = next;
        if (global.AudioSynth) global.AudioSynth.playClick();
        if (global.UISidebars) global.UISidebars.syncNavState();
        return true;
      }
      if (dir === 'up' || dir === 'down') {
        let altQ = this.componentCursor.q, altR = this.componentCursor.r;
        if (dir === 'up') { if (state.upDownAxisState === 0) altQ += 1; else altR += 1; }
        else { if (state.upDownAxisState === 0) altR -= 1; else altQ -= 1; }
        if (this._isTileAllowed(altQ, altR, state)) {
          this.componentCursor = { q: altQ, r: altR };
          if (global.AudioSynth) global.AudioSynth.playClick();
          if (global.UISidebars) global.UISidebars.syncNavState();
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
      if (!state || !this.inRitualMode || this.stage !== 'zone') return false;

      if (!this.isZoneValidAt(this.zoneCursor.q, this.zoneCursor.r)) {
        if (global.AudioSynth) global.AudioSynth.playCancel();
        if (global.UISidebars) global.UISidebars.showToast('⚠️ Center of Ice Store Zone must be on the board!');
        return false;
      }

      this.isPlaced = true;
      this.placedCenter = { ...this.zoneCursor };
      this.flowerTiles = global.HexMath ? global.HexMath.getFlowerTiles(this.placedCenter.q, this.placedCenter.r) : [];
      this.allowedTiles = new Set(this.flowerTiles.filter(tk => state.board.has(tk)));
      this.stagedExtractions.clear();

      this.originalTilesBackup.clear();
      this.flowerTiles.forEach(tk => {
        const tile = state.board.get(tk);
        this.originalTilesBackup.set(tk, tile && tile.color ? tile.color : null);
      });

      this.stage = 'component';
      this.componentCursor = { ...this.placedCenter };

      if (global.AudioSynth) global.AudioSynth.playPlace();
      if (global.UISidebars) {
        global.UISidebars.syncNavState();
        global.UISidebarDeck?.openComponentsColumn?.();
        global.UISidebars.showToast('❄️ 7-Tile Zone Placed! Move cursor over a component and click an empty or ritual slot in the deck.');
      }
      return true;
    }

    selectSigil() {
      return this.placeZone();
    }

    canPickUpAtCursor(state = global.GameState) {
      if (!state || !this.inRitualMode || this.stage !== 'component') return false;
      const cKey = `${this.componentCursor.q},${this.componentCursor.r}`;
      if (!this.allowedTiles.has(cKey) && !this._isTileAllowed(this.componentCursor.q, this.componentCursor.r, state)) return false;
      if (this.copiedTileKeys && this.copiedTileKeys.has(cKey)) return false;
      const tile = state.board?.get(cKey);
      const isEnch = !!(tile && (tile.burned || tile.phased || tile.woven || tile.fortified));
      if (!tile || (!tile.color && !isEnch) || tile.color === 'disease' || tile.color === 'ether' || (!tile.phased && tile.plagueId)) return false;
      const bag = state.componentsBag || [];
      return bag.some(c => !c) || !!(state.ritualSlots && state.ritualSlots.size > 0);
    }

    triggerComponentAction() {
      const state = global.GameState;
      if (!state || !this.inRitualMode || this.stage !== 'component') return false;
      const bag = state.componentsBag || [];
      let targetSlot = -1;
      for (let s = 0; s < 12; s++) { if (!bag[s]) { targetSlot = s; break; } }
      if (targetSlot === -1 && state.ritualSlots && state.ritualSlots.size > 0) {
        for (let s = 0; s < 12; s++) { if (state.ritualSlots.has(s)) { targetSlot = s; break; } }
      }
      if (targetSlot === -1) {
        global.AudioSynth?.playCancel?.();
        global.UISidebars?.showToast?.('⚠️ All 12 component slots are full of non-ritual items!');
        return false;
      }
      return this.handleSlotClick(targetSlot);
    }
  }

  const spellRitualInstance = new SpellRitualClass();
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Spell_Ritual_1.0', spellRitualInstance);
  global.SpellRitualClass = SpellRitualClass;
  global.SpellRitual = spellRitualInstance;
})(window);
