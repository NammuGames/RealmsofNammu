/**
 * @fileoverview cells/spells/Spell_Shift_1.1.js - Wood Shift Component Swapping & Finalization
 * @description Manages Wood Shift Stage 2 (Component) interactions: pick-up, placement,
 * component swapping, mutual annihilation (Burn + Phase), confirmation ripple animation,
 * undo/cancellation state management, and singleton registration (Part 2 of multi-part SpellShift cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const proto = global.SpellShiftClass?.prototype;
  if (!proto) {
    console.error('[Spell_Shift_1.1] SpellShiftClass is not defined. Ensure Spell_Shift_1.0.js is loaded first.');
    return;
  }

  proto.triggerComponentAction = function() {
    const state = global.GameState;
    if (!state || !this.inShiftMode || this.stage !== 'component') return false;

    const currentKey = `${this.componentCursor.q},${this.componentCursor.r}`;
    if (!this.allowedTiles.has(currentKey) && !this._isTileAllowed(this.componentCursor.q, this.componentCursor.r, state)) {
      global.AudioSynth?.playCancel?.();
      global.UISidebars?.showToast?.('⚠️ Target tile is outside the flower zone!');
      return false;
    }
    const tile = state.board.get(currentKey);
    if (!tile) {
      global.AudioSynth?.playCancel?.();
      return false;
    }

    if (this.heldComponent === null) {
      if (!tile.color && !tile.burned) {
        global.AudioSynth?.playCancel?.();
        global.UISidebars?.showToast?.('⚠️ Tile is empty! Move to a component or burn tile to pick it up.');
        return false;
      }
      if ((tile.color === 'disease' || (!tile.phased && tile.plagueId)) && !tile.burned) {
        global.AudioSynth?.playCancel?.();
        global.UISidebars?.showToast?.('⚠️ Wood Shift can only target Normal, Enchanted, or Burn tiles!');
        return false;
      }

      if (!this.originalTilesBackup.has(currentKey)) this.originalTilesBackup.set(currentKey, this._cloneTile(tile));
      this.heldComponent = { ...this._cloneTile(tile), fromQ: this.componentCursor.q, fromR: this.componentCursor.r };

      if (tile.underneath) {
        tile.color = tile.underneath.color; tile.sigilId = tile.underneath.sigilId || null;
        tile.fortified = tile.underneath.fortified || false; tile.lockOwner = tile.underneath.lockOwner || null;
        tile.plagueId = tile.underneath.plagueId || null; tile.underneath = null;
        tile.phased = false; tile.phaseOwner = null; tile.burned = false; tile.burnOwner = null;
        if (tile.fortified) state.fortifiedTiles?.add(currentKey); else state.fortifiedTiles?.delete(currentKey);
      } else {
        tile.color = null; tile.sigilId = null; tile.phased = false; tile.phaseOwner = null; tile.fortified = false;
        tile.lockOwner = null; tile.underneath = null; tile.plagueId = null; tile.burned = false; tile.burnOwner = null; tile.woven = false; tile.weaveOwner = null;
        state.fortifiedTiles?.delete(currentKey);
      }

      if (this.heldComponent.woven) this._updateFlowerRadius(true, state);
      global.AudioSynth?.playClick?.();
      if (global.UISidebars) {
        global.UISidebars.syncNavState();
        const name = this.heldComponent.burned ? 'BURN TILE' : (this.heldComponent.color || 'COMPONENT').toUpperCase();
        global.UISidebars.showToast(`🖐 Picked up ${name}. Move and press SPACE to place or swap.`);
      }
      return true;
    } else {
      const held = this.heldComponent;
      const wasWoven = !!held.woven;
      // Mutual Annihilation: Burn placed on Phase OR Phase placed on Burn
      if ((held.burned && tile.phased) || (held.phased && tile.burned)) {
        tile.color = null; tile.sigilId = null; tile.phased = false; tile.phaseOwner = null;
        tile.burned = false; tile.burnOwner = null; tile.fortified = false; tile.lockOwner = null;
        tile.underneath = null; tile.plagueId = null; tile.coveredComponent = null;
        state.fortifiedTiles?.delete(currentKey);
        this.heldComponent = null;
        if (wasWoven) this._updateFlowerRadius(false, state);
        if (global.AudioSynth?.playPlace) global.AudioSynth.playPlace();
        global.UISidebars?.syncNavState?.();
        global.UISidebars?.showToast?.('💥 MUTUAL ANNIHILATION: Burn and Phase annihilated each other!');
        return true;
      }

      // Placing on empty tile
      if (!tile.color && !tile.burned) {
        tile.color = held.color; tile.phased = !!held.phased; tile.underneath = null; tile.plagueId = null;
        tile.phaseOwner = held.phased ? (held.phaseOwner || state.currentPlayerId || 1) : null;
        tile.fortified = !!held.fortified; tile.lockOwner = held.fortified ? (held.lockOwner || state.currentPlayerId || 1) : null;
        tile.burned = !!held.burned; tile.burnOwner = held.burned ? (held.burnOwner || state.currentPlayerId || 1) : null;
        tile.woven = !!held.woven; tile.weaveOwner = held.woven ? (held.weaveOwner || state.currentPlayerId || 1) : null;
        if (tile.fortified) state.fortifiedTiles?.add(currentKey); else state.fortifiedTiles?.delete(currentKey);
        this.heldComponent = null;
        if (wasWoven) this._updateFlowerRadius(false, state);
        global.AudioSynth?.playPlace?.();
        if (global.UISidebars) {
          global.UISidebars.syncNavState();
          const name = held.burned ? 'BURN TILE' : (held.color || 'COMPONENT').toUpperCase();
          global.UISidebars.showToast(`⬇ Placed ${name}.`);
        }
        return true;
      }

      // Placing Burn on top of existing component (normal, disease, or fortify)
      if (held.burned) {
        const pIdFound = tile.plagueId || (tile.color === 'disease' && global.ComponentDisease?.shapes
          ? Array.from(global.ComponentDisease.shapes.values()).find(s => s.components.some(c => c.key === currentKey))?.id : null);
        tile.underneath = { color: tile.color, sigilId: tile.sigilId || null, fortified: !!tile.fortified, lockOwner: tile.lockOwner || null, plagueId: pIdFound || null };
        tile.color = held.color; tile.burned = true; tile.burnOwner = held.burnOwner || state.currentPlayerId || 1;
        tile.phased = false; tile.phaseOwner = null; if (tile.color !== 'disease') tile.plagueId = null;
        this.heldComponent = null;
        global.AudioSynth?.playPlace?.();
        if (global.UISidebars) { global.UISidebars.syncNavState(); global.UISidebars.showToast(`🔥 Burn tile placed! Will incinerate target at turn end.`); }
        return true;
      }

      // Placing Phase on top of existing component
      if (held.phased) {
        if (tile.phased) { global.AudioSynth?.playCancel?.(); global.UISidebars?.showToast?.('⚠️ Phase cannot be placed over Phase!'); return false; }
        const pIdFound = tile.plagueId || (tile.color === 'disease' && global.ComponentDisease?.shapes
          ? Array.from(global.ComponentDisease.shapes.values()).find(s => s.components.some(c => c.key === currentKey))?.id : null);
        tile.underneath = { color: tile.color, sigilId: tile.sigilId || null, fortified: !!tile.fortified, lockOwner: tile.lockOwner || null, plagueId: pIdFound || null };
        tile.color = held.color; tile.phased = true; tile.phaseOwner = held.phaseOwner || state.currentPlayerId || 1;
        tile.fortified = !!held.fortified; tile.lockOwner = held.fortified ? (held.lockOwner || state.currentPlayerId || 1) : null;
        if (tile.color !== 'disease') tile.plagueId = null;
        if (tile.fortified) state.fortifiedTiles?.add(currentKey); else state.fortifiedTiles?.delete(currentKey);
        this.heldComponent = null;
        global.AudioSynth?.playPlace?.();
        if (global.UISidebars) { global.UISidebars.syncNavState(); global.UISidebars.showToast(`🌌 Phased ${held.color?.toUpperCase()} component onto tile!`); }
        return true;
      }

      // Standard Component Swap
      if (tile.color === 'disease' || (!tile.phased && tile.plagueId)) {
        global.AudioSynth?.playCancel?.(); global.UISidebars?.showToast?.('⚠️ Wood Shift can only target Normal and Ether components!');
        return false;
      }
      const targetSnapshot = this._cloneTile(tile);
      tile.color = held.color; tile.phased = !!held.phased; tile.phaseOwner = held.phaseOwner || null;
      tile.fortified = !!held.fortified; tile.lockOwner = held.lockOwner || null;
      tile.burned = !!held.burned; tile.burnOwner = held.burnOwner || null;
      tile.woven = !!held.woven; tile.weaveOwner = held.weaveOwner || null;
      tile.underneath = held.underneath ? { ...held.underneath } : null;
      tile.plagueId = held.plagueId || null;
      if (tile.fortified) state.fortifiedTiles?.add(currentKey); else state.fortifiedTiles?.delete(currentKey);

      this.heldComponent = { ...targetSnapshot, fromQ: this.componentCursor.q, fromR: this.componentCursor.r };
      const isSwappedWoven = !!this.heldComponent.woven;
      this._updateFlowerRadius(isSwappedWoven, state);
      if (!isSwappedWoven && this.placedCenter) {
        const dist = global.HexMath ? global.HexMath.hexDistance(this.componentCursor.q - this.placedCenter.q, this.componentCursor.r - this.placedCenter.r) : 0;
        if (dist > 1) this.componentCursor = { ...this.placedCenter };
      }
      global.AudioSynth?.playRotate?.();
      if (global.UISidebars) {
        global.UISidebars.syncNavState();
        global.UISidebars.showToast(`⇄ Swapped with ${(targetSnapshot.color || 'burn tile').toUpperCase()}!`);
      }
      return true;
    }
  };

  proto.finalizeShift = function() {
    const state = global.GameState;
    if (!state || !this.inShiftMode || this.isFinalizing) return false;
    if (this.stage === 'zone' || !this.isPlaced) {
      global.AudioSynth?.playCancel?.(); global.UISidebars?.showToast?.('⚠️ Position and press SPACE to place the 7-Tile Zone first!');
      return false;
    }
    if (this.heldComponent !== null) {
      global.AudioSynth?.playCancel?.(); global.UISidebars?.showToast?.('⚠️ Place or swap your held component before finalizing!');
      return false;
    }

    const center = this.placedCenter || this.zoneCursor;
    if (global.BoardRippleRenderer?.triggerPlacementRipple && center) {
      global.BoardRippleRenderer.triggerPlacementRipple([{ q: center.q, r: center.r }], '#34d399', { profile: 'material', bands: 1 });
    }
    global.BoardCursorRenderer?.startFlowerOut?.();

    this.isFinalizing = true;
    try {
      const finalTiles = new Map();
      for (const tk of this.allowedTiles) finalTiles.set(tk, this._cloneTile(state.board.get(tk)));

      const shiftIdx = this.shiftSpellIndex;
      const shiftSpell = (shiftIdx !== null && shiftIdx < state.spellbook.length)
        ? { ...state.spellbook[shiftIdx] }
        : { formula: 'PPY', element: 'Wood', name: 'Shift', usableRound: state.round };

      const spellEntry = {
        type: 'shift', spellIndex: shiftIdx, originalTiles: new Map(this.originalTilesBackup),
        finalTiles, spell: shiftSpell, name: 'Shift',
        placedCenter: this.placedCenter ? { ...this.placedCenter } : { q: 0, r: 0 }
      };

      if (shiftIdx !== null && shiftIdx < state.spellbook.length) state.spellbook.splice(shiftIdx, 1);
      else {
        const found = state.spellbook.findIndex(s => s.formula === 'PPY' || s.name === 'Shift');
        if (found !== -1) state.spellbook.splice(found, 1);
      }

      if (global.UndoManager) global.UndoManager.recordSpellCast(spellEntry);
      if (global.SigilResolver) {
        state.placedThisTurn ? global.SigilResolver.restoreSigilStageIfPlaced(state.board)
          : (global.SigilResolver.evaluateSigils(state.board), global.SigilResolver.resolveInitialSigils(state.board));
      }

      this.inShiftMode = false; state.inShiftMode = false; this.shiftSpellIndex = null; state.shiftSpellIndex = null;
      this.stage = 'zone'; this.isPlaced = false; this.placedCenter = null; this.flowerTiles = []; this.allowedTiles = new Set(); this.heldComponent = null;
      if (!state.placedThisTurn) state.isMaterialSelected = true;

      global.AudioSynth?.playReward?.('shift');
      if (global.UISidebars) {
        global.UISidebars.showToast('🌿 Wood Shift finalized! Components rearranged.');
        global.UISidebars.renderTrayUI(); global.UISidebars.renderSpellbookUI();
        global.UISidebars.syncNavState(); global.UISidebars.updateTelemetry();
      }
      global.UISidebarDeck?.openSpellbookColumn(true);
      return true;
    } finally {
      this.isFinalizing = false;
    }
  };

  proto.handleUndo = function() {
    const state = global.GameState;
    if (!state || !this.inShiftMode) return false;
    if (this.stage === 'component') {
      const hasMoved = this.heldComponent !== null || Array.from(this.originalTilesBackup.entries()).some(
        ([tk, snap]) => JSON.stringify(this._cloneTile(state.board.get(tk))) !== JSON.stringify(snap)
      );
      for (const [tk, snapshot] of this.originalTilesBackup) this._restoreTile(state.board.get(tk), tk, snapshot, state);
      this.heldComponent = null;
      if (hasMoved) {
        this._updateFlowerRadius(false, state); global.AudioSynth?.playClick?.();
        global.UISidebars?.showToast?.('↶ Shifted components reset to original positions.');
        global.UISidebars?.syncNavState?.(); return true;
      }
      this.stage = 'zone'; this.isPlaced = false; this.placedCenter = null;
      this.flowerTiles = []; this.allowedTiles = new Set(); this.originalTilesBackup.clear();
      global.AudioSynth?.playClick?.();
      global.UISidebars?.showToast?.('↶ Shift zone unplaced. Move with WASD, then press SPACE to place.');
      global.UISidebars?.syncNavState?.(); return true;
    }
    return this.cancel();
  };

  proto.cancel = function() {
    const state = global.GameState;
    if (!state || !this.inShiftMode) return false;
    global.BoardCursorRenderer?.startFlowerOut?.();
    if (this.originalTilesBackup.size > 0) {
      for (const [tk, snapshot] of this.originalTilesBackup) this._restoreTile(state.board.get(tk), tk, snapshot, state);
    }
    this.inShiftMode = false; state.inShiftMode = false; this.shiftSpellIndex = null; state.shiftSpellIndex = null;
    this.stage = 'zone'; this.isPlaced = false; this.placedCenter = null; this.heldComponent = null; this.originalTilesBackup.clear();
    if (!state.placedThisTurn) state.isMaterialSelected = true;
    if (global.SigilResolver) {
      state.placedThisTurn ? global.SigilResolver.restoreSigilStageIfPlaced(state.board, { animate: false })
        : (global.SigilResolver.evaluateSigils(state.board), global.SigilResolver.resolveInitialSigils(state.board, { animate: false }));
    }
    global.AudioSynth?.playClick?.();
    if (global.UISidebars) {
      global.UISidebars.showToast('Shift Cancelled: Spell Preserved');
      global.UISidebars.syncNavState(); global.UISidebars.updateTelemetry();
    }
    global.UISidebarDeck?.openSpellbookColumn(false);
    if (global.BoardRenderer?.render) global.BoardRenderer.render();
    return true;
  };

  proto.undo = function(entry) {
    const state = global.GameState;
    if (!state || !entry) return false;
    if (entry.originalTiles) {
      for (const [tk, snapshot] of entry.originalTiles) this._restoreTile(state.board.get(tk), tk, snapshot, state);
    }
    const insertIdx = Math.min(entry.spellIndex !== undefined ? entry.spellIndex : 0, state.spellbook.length);
    if (entry.spell) state.spellbook.splice(insertIdx, 0, entry.spell);
    if (global.SigilResolver) {
      state.placedThisTurn ? global.SigilResolver.restoreSigilStageIfPlaced(state.board, { animate: false })
        : (global.SigilResolver.evaluateSigils(state.board), global.SigilResolver.resolveInitialSigils(state.board, { animate: false }));
    }
    const c = entry.placedCenter || { q: 0, r: 0 };
    this.inShiftMode = true; state.inShiftMode = true;
    this.shiftSpellIndex = insertIdx; state.shiftSpellIndex = insertIdx; this.zoneCursor = { ...c }; this.stage = 'zone'; state.isMaterialSelected = false;
    this.placeZone();
    global.UISidebarDeck?.closeSpellbookColumn();
    if (global.UISidebars) {
      global.UISidebars.showToast('↶ Shift unconfirmed: Components reset to original positions.');
      global.UISidebars.renderTrayUI(); global.UISidebars.renderSpellbookUI();
      global.UISidebars.syncNavState(); global.UISidebars.updateTelemetry();
    }
    return true;
  };

  proto.renderFace = function() {};

  const spellShiftInstance = new global.SpellShiftClass();
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Spell_Shift', spellShiftInstance);
  global.SpellShift = spellShiftInstance;

})(typeof window !== 'undefined' ? window : this);
