/**
 * @fileoverview Spell_Manifest_1.0.js - Heat Manifest Spell (RRB) Core & Stage 1/Navigation
 * @description Manages Heat Manifest initiation, 7-tile flower zone cursor movement, Ring-2 Weave
 * allowance checks, and placement cursor navigation/triggers.
 */

(function(global) {
  'use strict';

  class SpellManifestClass {
    constructor() {
      this.formula = 'RRB'; this.element = 'Heat'; this.name = 'Form'; this.fullName = 'Heat Form';
      this.inManifestMode = false; this.manifestSpellIndex = null; this.stage = 'zone'; this.zoneCursor = { q: 0, r: 0 };
      this.isPlaced = false; this.placedCenter = null; this.flowerTiles = []; this.allowedTiles = new Set();
      this.componentCursor = { q: 0, r: 0 }; this.stagedPlacements = new Map(); this.actionHistory = [];
      this.originalBagBackup = []; this.isFinalizing = false;
    }

    isZoneValidAt(q, r) {
      const state = global.GameState;
      return !!(state?.board && state.board.has(`${q},${r}`));
    }

    _restoreTile(t, tk, s, state) {
      if (!t) return;
      if (s) {
        t.color = s.color; t.sigilId = s.sigilId || null; t.burned = s.burned; t.burnOwner = s.burnOwner; t.phased = s.phased; t.phaseOwner = s.phaseOwner;
        t.woven = s.woven; t.weaveOwner = s.weaveOwner; t.fortified = s.fortified; t.lockOwner = s.lockOwner; t.underneath = s.underneath || null; t.plagueId = s.plagueId || null;
        if (t.fortified) state?.fortifiedTiles?.add(tk); else state?.fortifiedTiles?.delete(tk);
      } else {
        t.color = null; t.sigilId = null; t.burned = false; t.burnOwner = null; t.phased = false; t.phaseOwner = null; t.woven = false; t.weaveOwner = null;
        t.fortified = false; t.lockOwner = null; t.underneath = null; t.plagueId = null; state?.fortifiedTiles?.delete(tk);
      }
    }

    start(spellIndex) {
      const state = global.GameState;
      if (!state || state.gameOver || state.inSpellOverflow) return false;

      const hasComponents = state.componentsBag && state.componentsBag.some(c => c && (typeof c === 'object' ? (c.color || c.burned || c.phased || c.woven || c.fortified) : c));
      if (!hasComponents) {
        global.UISidebars?.showToast?.('⚠️ Inventory is empty! Extract components with Store first.');
        return false;
      }

      this.inManifestMode = true; state.inManifestMode = true;
      this.manifestSpellIndex = spellIndex; state.manifestSpellIndex = spellIndex;
      this.stage = 'zone'; this.zoneCursor = { q: 0, r: 0 };
      this.isPlaced = false; this.placedCenter = null;
      this.flowerTiles = []; this.allowedTiles = new Set(); this.stagedPlacements.clear(); this.actionHistory = [];
      this.originalBagBackup = state.componentsBag ? state.componentsBag.map(c => (typeof c === 'object' && c) ? { ...c } : c) : [];
      this.isFinalizing = false; state.isMaterialSelected = false;
      global.BoardCursorRenderer?.startFlowerIn?.(false);

      if (global.UISidebars) {
        if (global.UISidebars.finishRotationInstantly) global.UISidebars.finishRotationInstantly();
        global.UISidebars.navigateTo('manifest'); global.UISidebars.syncNavState();
        global.UISidebars.showToast('🔥 HEAT FORM: Position 7-tile flower with WASD, then press SPACE to place!');
      }
      return true;
    }

    _step(pos, dir, state) {
      let { q, r } = pos;
      if (dir === 'left') { q -= 1; r += 1; } else if (dir === 'right') { q += 1; r -= 1; }
      else if (dir === 'up') { if (state.upDownAxisState === 0) r += 1; else q += 1; state.upDownAxisState = 1 - state.upDownAxisState; }
      else if (dir === 'down') { if (state.upDownAxisState === 0) q -= 1; else r -= 1; state.upDownAxisState = 1 - state.upDownAxisState; }
      return { q, r };
    }

    hasWeaveInBag(state) {
      const bag = state?.componentsBag || [];
      return bag.some((c, idx) => !this.stagedPlacements.has(idx) && c && (c.woven || c.enchantment === 'weave'));
    }

    isCursorInRing2() {
      if (!this.inManifestMode || this.stage !== 'component' || !this.placedCenter) return false;
      const dist = global.HexMath ? global.HexMath.hexDistance(this.componentCursor.q - this.placedCenter.q, this.componentCursor.r - this.placedCenter.r) : 0;
      return dist === 2;
    }

    _isTileAllowed(q, r, state) {
      const key = `${q},${r}`;
      if (this.allowedTiles.has(key)) return true;
      if (!this.placedCenter || !state?.board?.has(key)) return false;
      const dist = global.HexMath ? global.HexMath.hexDistance(q - this.placedCenter.q, r - this.placedCenter.r) : 99;
      return dist === 2 && this.hasWeaveInBag(state);
    }

    moveDirection(dir) {
      const state = global.GameState;
      if (!state || !this.inManifestMode) return false;

      if (this.stage === 'zone') {
        const next = this._step(this.zoneCursor, dir, state);
        if (global.HexMath && global.HexMath.hexDistance(next.q, next.r) <= (state.boardRadius || 6) + 1) {
          this.zoneCursor = next;
          global.AudioSynth?.playClick?.(); global.UISidebars?.syncNavState?.();
          return true;
        }
        return false;
      }

      const next = this._step(this.componentCursor, dir, state);
      if (this._isTileAllowed(next.q, next.r, state)) {
        this.componentCursor = next;
        global.AudioSynth?.playClick?.(); global.UISidebars?.syncNavState?.();
        global.UICardsDeck?.syncComponentsColumn?.();
        return true;
      }
      if (dir === 'up' || dir === 'down') {
        let altQ = this.componentCursor.q, altR = this.componentCursor.r;
        if (dir === 'up') { if (state.upDownAxisState === 0) altQ += 1; else altR += 1; }
        else { if (state.upDownAxisState === 0) altR -= 1; else altQ -= 1; }
        if (this._isTileAllowed(altQ, altR, state)) {
          this.componentCursor = { q: altQ, r: altR };
          global.AudioSynth?.playClick?.(); global.UISidebars?.syncNavState?.(); global.UICardsDeck?.syncComponentsColumn?.();
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
      if (!state || !this.inManifestMode || this.stage !== 'zone') return false;
      if (!this.isZoneValidAt(this.zoneCursor.q, this.zoneCursor.r)) {
        global.AudioSynth?.playCancel?.(); global.UISidebars?.showToast?.('⚠️ Center of Heat Form Zone must be on the board!');
        return false;
      }
      this.isPlaced = true; this.placedCenter = { ...this.zoneCursor };
      this.flowerTiles = global.HexMath ? global.HexMath.getFlowerTiles(this.placedCenter.q, this.placedCenter.r) : [];
      this.allowedTiles = new Set(this.flowerTiles.filter(tk => state.board.has(tk)));
      this.stagedPlacements.clear(); this.stage = 'component'; this.componentCursor = { ...this.placedCenter };
      global.AudioSynth?.playPlace?.();
      global.UISidebars?.syncNavState?.();
      global.UISidebars?.showToast?.('🔥 7-Tile Zone Placed! Select component slots to place, then press ENTER to finalize.');
      global.UISidebarDeck?.openComponentsColumn?.();
      return true;
    }

    selectSigil() { return this.placeZone(); }

    canPlaceAtCursor(state = global.GameState) {
      if (!state || !this.inManifestMode || this.stage !== 'component') return false;
      const cKey = `${this.componentCursor.q},${this.componentCursor.r}`;
      if (!this.allowedTiles.has(cKey) && !this._isTileAllowed(this.componentCursor.q, this.componentCursor.r, state)) return false;
      for (const [_, data] of this.stagedPlacements.entries()) { if (data.placedKey === cKey) return true; }
      const tile = state.board?.get(cKey);
      if (!tile) return false;
      const isVacant = !tile.color && !tile.burned && !tile.phased && !tile.woven && !tile.fortified, isRing2 = this.isCursorInRing2();
      return (state.componentsBag || []).some((rawComp, i) => {
        if (this.stagedPlacements.has(i) || !rawComp) return false;
        if (isRing2 && !(typeof rawComp === 'object' && (rawComp.woven || rawComp.enchantment === 'weave'))) return false;
        const isBurn = typeof rawComp === 'object' && (rawComp.burned || rawComp.enchantment === 'burn');
        const isPhase = typeof rawComp === 'object' && (rawComp.phased || rawComp.enchantment === 'phase');
        return isVacant || (isBurn && !tile.burned) || (isPhase && !tile.phased);
      });
    }

    triggerComponentAction() {
      const state = global.GameState;
      if (!state || !this.inManifestMode || this.stage !== 'component') return false;

      const cursorKey = `${this.componentCursor.q},${this.componentCursor.r}`;
      if (!this.allowedTiles.has(cursorKey) && !this._isTileAllowed(this.componentCursor.q, this.componentCursor.r, state)) {
        global.AudioSynth?.playCancel?.();
        global.UISidebars?.showToast?.('⚠️ Target tile is outside the flower zone!');
        return false;
      }

      for (const [sIdx, data] of this.stagedPlacements.entries()) {
        if (data.placedKey === cursorKey) return this.handleSlotClick(sIdx);
      }

      const tile = state.board.get(cursorKey);
      if (!tile) {
        global.AudioSynth?.playCancel?.();
        return false;
      }

      const isRing2 = this.isCursorInRing2();
      const isVacant = !tile.color && !tile.burned && !tile.phased && !tile.woven && !tile.fortified;
      const bag = state.componentsBag || [];
      for (let i = 0; i < bag.length; i++) {
        if (this.stagedPlacements.has(i)) continue;
        const rawComp = bag[i];
        if (!rawComp) continue;
        const isWeave = typeof rawComp === 'object' && (rawComp.woven || rawComp.enchantment === 'weave');
        if (isRing2 && !isWeave) continue;
        const isBurn = typeof rawComp === 'object' && (rawComp.burned || rawComp.enchantment === 'burn');
        const isPhase = typeof rawComp === 'object' && (rawComp.phased || rawComp.enchantment === 'phase');
        if (isVacant) return this.handleSlotClick(i);
        if (isBurn || isPhase) {
          if (isPhase && tile.phased) continue;
          if (isBurn && tile.burned) continue;
          return this.handleSlotClick(i);
        }
      }

      global.AudioSynth?.playCancel?.();
      const msg = !isVacant ? '⚠️ Tile is occupied! Only Burn or Phase can place on top.' : (isRing2 ? '⚠️ Second ring only accepts Weave components!' : '⚠️ All bag components have already been placed!');
      global.UISidebars?.showToast?.(msg);
      return false;
    }
  }

  const spellManifestInstance = new SpellManifestClass();
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Spell_Manifest_1.0', spellManifestInstance);
  global.SpellManifestClass = SpellManifestClass;
  global.SpellManifest = spellManifestInstance;
})(window);
