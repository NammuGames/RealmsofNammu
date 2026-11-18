/**
 * @fileoverview Spell_Manifest_1.1.js - Heat Manifest Spell (RRB) Placement, Finalize & Undo
 * @description Manages inventory slot staging/recalling, mutual annihilation, finalization,
 * multi-stage undo, cancel, and round undo reversal.
 */

(function(global) {
  'use strict';

  const SpellManifestClass = global.SpellManifestClass;
  if (!SpellManifestClass) return;

  const proto = SpellManifestClass.prototype;

  proto.handleSlotClick = function(slotIndex) {
    const state = global.GameState;
    if (!state || !this.inManifestMode || this.stage !== 'component') return false;

    const bag = state.componentsBag || [];

    // If slot is already placed, unstage/recall it
    if (this.stagedPlacements.has(slotIndex)) {
      const staged = this.stagedPlacements.get(slotIndex);
      this._restoreTile(state.board?.get(staged.placedKey), staged.placedKey, staged.prevTileState, state);
      bag[slotIndex] = staged.item;
      state.componentsBag = bag;
      this.stagedPlacements.delete(slotIndex);
      if (this.actionHistory) {
        const aIdx = this.actionHistory.findIndex(a => a.slotIndex === slotIndex);
        if (aIdx !== -1) this.actionHistory.splice(aIdx, 1);
      }
      global.AudioSynth?.playClick?.();
      global.UISidebars?.showToast?.(`Recalled component back to Slot ${slotIndex + 1}.`);
      global.UICardsDeck?.syncComponentsColumn?.();
      global.NativeStatPod?.setComponents?.(bag);
      global.BoardRenderer?.render?.(); state.syncUI?.();
      return true;
    }

    const rawComp = (slotIndex < bag.length) ? bag[slotIndex] : null;
    if (!rawComp) {
      global.AudioSynth?.playCancel?.();
      return false;
    }

    const isEnchanted = typeof rawComp === 'object' && rawComp && (rawComp.burned || rawComp.phased || rawComp.woven || rawComp.fortified);
    const compColor = (typeof rawComp === 'object' && rawComp) ? (rawComp.color || null) : rawComp;
    if (!compColor && !isEnchanted) {
      global.AudioSynth?.playCancel?.();
      return false;
    }

    const cursorKey = `${this.componentCursor.q},${this.componentCursor.r}`;
    if (!this.allowedTiles.has(cursorKey) && !this._isTileAllowed(this.componentCursor.q, this.componentCursor.r, state)) {
      global.AudioSynth?.playCancel?.();
      global.UISidebars?.showToast?.('⚠️ Target tile is outside the flower zone!');
      return false;
    }

    const isRing2 = this.isCursorInRing2();
    const isWeave = typeof rawComp === 'object' && rawComp && (rawComp.woven || rawComp.enchantment === 'weave');
    if (isRing2 && !isWeave) {
      global.AudioSynth?.playCancel?.();
      global.UISidebars?.showToast?.('⚠️ Second ring only accepts Weave components!');
      return false;
    }

    const tile = state.board?.get(cursorKey);
    if (!tile) {
      global.AudioSynth?.playCancel?.();
      return false;
    }

    const isVacant = !tile.color && !tile.burned && !tile.phased && !tile.woven && !tile.fortified;
    const isBurn = !!(rawComp.burned || rawComp.enchantment === 'burn');
    const isPhase = !!(rawComp.phased || rawComp.enchantment === 'phase');
    const canPlaceOnTop = isBurn || isPhase;

    if (!isVacant && !canPlaceOnTop) {
      global.AudioSynth?.playCancel?.(); global.UISidebars?.showToast?.('⚠️ Tile is occupied! Only Burn or Phase can place on top.'); return false;
    }
    if (isPhase && tile.phased) { global.AudioSynth?.playCancel?.(); global.UISidebars?.showToast?.('⚠️ Phase cannot be placed over Phase!'); return false; }
    if (isBurn && tile.burned) { global.AudioSynth?.playCancel?.(); global.UISidebars?.showToast?.('⚠️ Burn cannot be placed over Burn!'); return false; }

    const prevTileState = {
      color: tile.color, sigilId: tile.sigilId || null, burned: !!tile.burned, burnOwner: tile.burnOwner || null,
      phased: !!tile.phased, phaseOwner: tile.phaseOwner || null, woven: !!tile.woven, weaveOwner: tile.weaveOwner || null,
      fortified: !!tile.fortified, lockOwner: tile.lockOwner || null, underneath: tile.underneath ? JSON.parse(JSON.stringify(tile.underneath)) : null, plagueId: tile.plagueId || null
    };

    const pId = state.currentPlayerId || 1;
    const isMutualAnnihilation = (isBurn && tile.phased) || (isPhase && tile.burned);

    if (isMutualAnnihilation) {
      tile.color = null; tile.sigilId = null; tile.phased = false; tile.phaseOwner = null;
      tile.burned = false; tile.burnOwner = null; tile.fortified = false; tile.lockOwner = null;
      tile.underneath = null; tile.plagueId = null; state.fortifiedTiles?.delete(cursorKey);
    } else if (!isVacant) {
      const pIdFound = tile.plagueId || (tile.color === 'disease' && global.ComponentDisease?.shapes
        ? Array.from(global.ComponentDisease.shapes.values()).find(s => s.components.some(c => c.key === cursorKey))?.id : null);
      tile.underneath = { color: tile.color, sigilId: tile.sigilId || null, fortified: !!tile.fortified, lockOwner: tile.lockOwner || null, plagueId: pIdFound || null };
      tile.color = compColor;
      if (isBurn) { tile.burned = true; tile.burnOwner = pId; tile.phased = false; tile.phaseOwner = null; }
      else if (isPhase) { tile.phased = true; tile.phaseOwner = pId; tile.burned = false; tile.burnOwner = null; }
      if (tile.color !== 'disease') tile.plagueId = null;
    } else {
      tile.color = compColor; tile.underneath = null;
      if (isEnchanted) {
        if (isBurn) { tile.burned = true; tile.burnOwner = pId; }
        if (isPhase) { tile.phased = true; tile.phaseOwner = pId; }
        if (rawComp.woven || rawComp.enchantment === 'weave') { tile.woven = true; tile.weaveOwner = pId; }
        if (rawComp.fortified || rawComp.enchantment === 'fortify') { tile.fortified = true; tile.lockOwner = pId; state.fortifiedTiles?.add(cursorKey); }
      }
    }

    bag[slotIndex] = null;
    state.componentsBag = bag;

    const pEntry = { item: (typeof rawComp === 'object') ? { ...rawComp } : rawComp, color: compColor, isEnchanted, placedKey: cursorKey, prevTileState, isMutualAnnihilation };
    this.stagedPlacements.set(slotIndex, pEntry);
    this.actionHistory = this.actionHistory || [];
    this.actionHistory.push({ slotIndex, toKey: cursorKey, ...pEntry });

    if (isMutualAnnihilation) {
      global.AudioSynth?.playPlace?.(); global.UISidebars?.syncNavState?.();
      global.UISidebars?.showToast?.('💥 MUTUAL ANNIHILATION: Burn and Phase annihilated each other!');
    } else {
      global.AudioSynth?.playPlace?.();
      if (global.UISidebars) {
        global.UISidebars.syncNavState();
        const label = isEnchanted
          ? (isBurn ? 'BURN TILE' : (isPhase ? 'PHASE TILE' : (rawComp.woven ? 'WEAVE TILE' : 'FORTIFY TILE')))
          : (compColor ? compColor.toUpperCase() : 'COMPONENT');
        global.UISidebars.showToast(`🔥 Placed ${label} onto the board!`);
      }
    }
    global.UICardsDeck?.syncComponentsColumn?.();
    global.NativeStatPod?.setComponents?.(bag);
    global.BoardRenderer?.render?.(); state.syncUI?.();
    return true;
  };

  proto.finalizeManifest = function() {
    const state = global.GameState;
    if (!state || !this.inManifestMode || this.isFinalizing) return false;

    if (this.stage === 'zone' || !this.isPlaced) {
      global.AudioSynth?.playCancel?.(); global.UISidebars?.showToast?.('⚠️ Position and press SPACE to place the 7-Tile Zone first!');
      return false;
    }
    if (this.stagedPlacements.size === 0) {
      global.AudioSynth?.playCancel?.(); global.UISidebars?.showToast?.('⚠️ Place at least 1 component slot before finalizing!');
      return false;
    }

    const center = this.placedCenter || this.zoneCursor;
    if (global.BoardRippleRenderer?.triggerPlacementRipple && center) {
      global.BoardRippleRenderer.triggerPlacementRipple([{ q: center.q, r: center.r }], '#eb66ff', { profile: 'material', bands: 1 });
    }
    global.BoardCursorRenderer?.startFlowerOut?.();

    this.isFinalizing = true;
    try {
      const placedSlots = Array.from(this.stagedPlacements.keys()).sort((a, b) => b - a), tilesPlaced = [];
      placedSlots.forEach(sIdx => {
        const p = this.stagedPlacements.get(sIdx);
        tilesPlaced.push({ slot: sIdx, key: p.placedKey, color: p.color, item: p.item, isEnchanted: p.isEnchanted, prevTileState: p.prevTileState });
        state.componentsBag[sIdx] = null; if (state.ritualSlots) state.ritualSlots.delete(sIdx);
      });
      const mIdx = this.manifestSpellIndex, spellData = (mIdx !== null && mIdx < state.spellbook.length) ? { ...state.spellbook[mIdx] } : { formula: 'RRB', element: 'Heat', name: 'Manifest', usableRound: state.round };
      if (mIdx !== null && mIdx < state.spellbook.length) state.spellbook.splice(mIdx, 1);
      else { const f = state.spellbook.findIndex(s => s.formula === 'RRB' || s.name === 'Manifest'); if (f !== -1) state.spellbook.splice(f, 1); }
      if (global.UndoManager) {
        global.UndoManager.recordSpellCast({
          type: 'manifest', name: 'Manifest', formula: 'RRB', spell: 'Manifest',
          tilesPlaced, previousBag: [...this.originalBagBackup],
          placedCenter: this.placedCenter ? { ...this.placedCenter } : { q: 0, r: 0 },
          spellbookIndex: (mIdx !== null) ? mIdx : 0, spellData
        });
      }
      global.AudioSynth?.playReward?.('manifest');
      if (global.SigilResolver && state.board) {
        state.placedThisTurn ? global.SigilResolver.restoreSigilStageIfPlaced(state.board)
          : (global.SigilResolver.evaluateSigils(state.board), global.SigilResolver.resolveInitialSigils(state.board));
      }
      this.inManifestMode = false; state.inManifestMode = false; this.manifestSpellIndex = null; state.manifestSpellIndex = null;
      this.stage = 'zone'; this.isPlaced = false; this.placedCenter = null; this.flowerTiles = [];
      this.stagedPlacements.clear(); this.originalBagBackup = [];
      if (!state.placedThisTurn) state.isMaterialSelected = true;

      if (global.UISidebars) {
        global.UISidebars.showToast(`🔥 FORM FINALIZED: ${tilesPlaced.length} component(s) forged into the board!`);
        global.UISidebars.updateComponentsBar(); global.UISidebars.resetToFace('materials', 'backward');
        global.UISidebars.renderTrayUI(); global.UISidebars.renderSpellbookUI();
        global.UISidebars.syncNavState(); global.UISidebars.updateTelemetry(); global.UISidebars.updateHpBar();
      }
      global.UISidebarDeck?.openSpellbookColumn(true);
      return true;
    } finally {
      this.isFinalizing = false;
    }
  };

  proto.handleUndo = function() {
    const state = global.GameState;
    if (!state || !this.inManifestMode) return false;
    if (this.actionHistory && this.actionHistory.length > 0) {
      const last = this.actionHistory.pop();
      this._restoreTile(state.board?.get(last.toKey), last.toKey, last.prevTileState, state);
      if (state.componentsBag) {
        while (state.componentsBag.length <= last.slotIndex) state.componentsBag.push(null);
        state.componentsBag[last.slotIndex] = (last.item !== undefined) ? last.item : (last.color || null);
      }
      this.stagedPlacements.delete(last.slotIndex); global.AudioSynth?.playClick?.();
      if (global.UISidebars) {
        global.UISidebars.syncNavState();
        global.UISidebars.showToast(`Recalled ${last.isEnchanted ? 'enchanted tile' : (last.color ? last.color.toUpperCase() : 'component')} back to Slot ${last.slotIndex + 1}.`);
      }
      global.UICardsDeck?.syncComponentsColumn?.(); global.NativeStatPod?.setComponents?.(state.componentsBag);
      global.BoardRenderer?.render?.(); state.syncUI?.(); return true;
    }
    if (this.stage === 'component') {
      this.stage = 'zone'; this.isPlaced = false; this.placedCenter = null; this.flowerTiles = []; this.allowedTiles = new Set();
      global.UISidebarDeck?.closeComponentsColumn?.(); global.AudioSynth?.playClick?.();
      if (global.UISidebars) { global.UISidebars.showToast('↶ Manifest zone unplaced. Move with WASD, then press SPACE to place.'); global.UISidebars.syncNavState(); }
      global.BoardRenderer?.render?.(); return true;
    }
    return this.cancel();
  };

  proto.cancel = function() {
    const state = global.GameState;
    global.BoardCursorRenderer?.startFlowerOut?.();
    if (state?.board) {
      for (const [_, data] of this.stagedPlacements.entries()) this._restoreTile(state.board.get(data.placedKey), data.placedKey, data.prevTileState, state);
    }
    if (state && this.originalBagBackup.length > 0) state.componentsBag = this.originalBagBackup.map(c => (typeof c === 'object' && c) ? { ...c } : c);
    this.inManifestMode = false; if (state) { state.inManifestMode = false; this.manifestSpellIndex = null; state.manifestSpellIndex = null; }
    this.stage = 'zone'; this.isPlaced = false; this.placedCenter = null; this.flowerTiles = [];
    this.stagedPlacements.clear(); this.actionHistory = []; this.originalBagBackup = []; this.isFinalizing = false;
    if (state && !state.placedThisTurn) state.isMaterialSelected = true;
    global.AudioSynth?.playClick?.();
    if (global.UISidebars) {
      global.UISidebars.showToast('Form spell cancelled.'); global.UISidebars.resetToFace('spells', 'backward');
      global.UISidebars.renderSpellbookUI(); global.UISidebars.syncNavState();
      global.UICardsDeck?.syncComponentsColumn?.(); global.NativeStatPod?.setComponents?.(state?.componentsBag);
    }
    global.UISidebarDeck?.openSpellbookColumn(false);
    return true;
  };

  proto.undo = function(entry) {
    const state = global.GameState;
    if (!state || !entry) return false;
    if (entry.tilesPlaced) { for (const t of entry.tilesPlaced) this._restoreTile(state.board.get(t.key), t.key, t.prevTileState, state); }
    if (entry.previousBag) state.componentsBag = entry.previousBag.map(c => (typeof c === 'object' && c) ? { ...c } : c);
    const restoredSpell = entry.spellData || { formula: 'RRB', element: 'Heat', name: 'Form', usableRound: state.round };
    const insertIdx = (entry.spellbookIndex !== undefined && entry.spellbookIndex <= state.spellbook.length) ? entry.spellbookIndex : state.spellbook.length;
    state.spellbook.splice(insertIdx, 0, restoredSpell);
    if (global.SigilResolver && state.board) {
      state.placedThisTurn ? global.SigilResolver.restoreSigilStageIfPlaced(state.board, { animate: false }) : (global.SigilResolver.evaluateSigils(state.board), global.SigilResolver.resolveInitialSigils(state.board, { animate: false }));
    }
    const c = entry.placedCenter || { q: 0, r: 0 };
    this.inManifestMode = true; state.inManifestMode = true; this.manifestSpellIndex = insertIdx; state.manifestSpellIndex = insertIdx;
    this.zoneCursor = { ...c }; this.stage = 'zone'; this.actionHistory = [];
    this.originalBagBackup = state.componentsBag ? state.componentsBag.map(x => (typeof x === 'object' && x) ? { ...x } : x) : [];
    state.isMaterialSelected = false; this.placeZone();
    if (global.UISidebars) {
      global.UISidebars.showToast('🔥 Form unconfirmed: Placed components recalled to inventory.');
      global.UISidebars.updateComponentsBar(); global.UISidebars.renderTrayUI(); global.UISidebars.renderSpellbookUI(); global.UISidebars.syncNavState(); global.UISidebars.updateHpBar();
      global.UICardsDeck?.syncComponentsColumn?.(); global.NativeStatPod?.setComponents?.(state?.componentsBag);
    }
    return true;
  };

  proto.renderFace = function() {};

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Spell_Manifest_1.1', global.SpellManifest);
})(window);
