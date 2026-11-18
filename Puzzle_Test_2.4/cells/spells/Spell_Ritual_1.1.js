/**
 * @fileoverview Spell_Ritual_1.1.js - Ice Ritual Spell (BBR) Extraction, Finalize & Undo
 * @description Manages component/enchantment copying into bag slots, finalization,
 * multi-stage undo, cancel, and round undo reversal.
 */

(function(global) {
  'use strict';

  const SpellRitualClass = global.SpellRitualClass;
  if (!SpellRitualClass) return;

  const proto = SpellRitualClass.prototype;

  proto.handleSlotClick = function(slotIndex) {
    const state = global.GameState;
    if (!state || !this.inRitualMode || this.stage !== 'component') return false;

    const bag = state.componentsBag || [];
    const cursorKey = `${this.componentCursor.q},${this.componentCursor.r}`;
    if (!this.allowedTiles.has(cursorKey) && !this._isTileAllowed(this.componentCursor.q, this.componentCursor.r, state)) {
      if (global.AudioSynth) global.AudioSynth.playCancel();
      if (global.UISidebars) global.UISidebars.showToast('⚠️ Move cursor to a component within the flower zone to copy!');
      return false;
    }

    if (this.copiedTileKeys && this.copiedTileKeys.has(cursorKey)) {
      if (global.AudioSynth) global.AudioSynth.playCancel();
      if (global.UISidebars) global.UISidebars.showToast('⚠️ This board component has already been copied!');
      return false;
    }

    const tile = state.board.get(cursorKey);
    const isEnchanted = !!(tile && (tile.burned || tile.phased || tile.woven || tile.fortified));
    if (!tile || (!tile.color && !isEnchanted)) {
      if (global.AudioSynth) global.AudioSynth.playCancel();
      if (global.UISidebars) global.UISidebars.showToast('⚠️ Hover over an occupied or enchanted flower hex to copy into this slot.');
      return false;
    }
    if (tile.color === 'disease' || (!tile.phased && tile.plagueId)) {
      if (global.AudioSynth) global.AudioSynth.playCancel();
      if (global.UISidebars) global.UISidebars.showToast('⚠️ Ritual cannot copy Disease components!');
      return false;
    }
    if (tile.color === 'ether') {
      if (global.AudioSynth) global.AudioSynth.playCancel();
      if (global.UISidebars) global.UISidebars.showToast('⚠️ Ritual cannot copy Ether components!');
      return false;
    }

    // If overwriting a slot that already staged an extraction during this cast, release the old tile
    const prevStaged = this.stagedExtractions.get(slotIndex);
    if (prevStaged && prevStaged.fromKey) {
      this.copiedTileKeys.delete(prevStaged.fromKey);
    }
    this.copiedTileKeys.add(cursorKey);

    const copiedColor = tile.color || null;
    let itemToStore;
    if (isEnchanted) {
      itemToStore = {
        color: copiedColor,
        burned: !!tile.burned,
        phased: !!tile.phased,
        woven: !!tile.woven,
        fortified: !!tile.fortified,
        enchantment: tile.burned ? 'burn' : (tile.phased ? 'phase' : (tile.woven ? 'weave' : 'fortify'))
      };
    } else {
      itemToStore = copiedColor;
    }

    const previousItem = (slotIndex < bag.length) ? bag[slotIndex] : null;

    while (bag.length <= slotIndex) bag.push(null);
    bag[slotIndex] = itemToStore;
    state.componentsBag = bag;

    if (!state.newlyCopiedSlots) state.newlyCopiedSlots = new Set();
    state.newlyCopiedSlots.add(slotIndex);

    this.stagedExtractions.set(slotIndex, {
      item: (typeof itemToStore === 'object') ? { ...itemToStore } : itemToStore,
      color: copiedColor,
      isEnchanted,
      fromKey: cursorKey,
      previousItem
    });
    this.actionHistory = this.actionHistory || [];
    this.actionHistory.push({ slotIndex, fromKey: cursorKey, item: itemToStore, previousItem });

    if (global.AudioSynth) global.AudioSynth.playClick();
    if (global.UISidebars) {
      global.UISidebars.syncNavState();
      global.UISidebars.updateComponentsBar?.();
      const label = isEnchanted
        ? (tile.burned ? 'BURN TILE' : (tile.phased ? 'PHASE TILE' : (tile.woven ? 'WEAVE TILE' : 'FORTIFY TILE')))
        : (copiedColor ? copiedColor.toUpperCase() : 'COMPONENT');
      global.UISidebars.showToast(`❄️ Copied ${label} into slot ${slotIndex + 1}!`);
    }
    if (global.UICardsDeck) global.UICardsDeck.syncComponentsColumn();
    if (global.NativeStatPod) global.NativeStatPod.setComponents(bag);
    if (global.BoardRenderer) global.BoardRenderer.render();
    state.syncUI?.();
    return true;
  };

  proto.finalizeRitual = function() {
    const state = global.GameState;
    if (!state || !this.inRitualMode || this.isFinalizing) return false;

    if (this.stage === 'zone' || !this.isPlaced) {
      if (global.AudioSynth) global.AudioSynth.playCancel();
      if (global.UISidebars) global.UISidebars.showToast('⚠️ Position and press SPACE to place the 7-Tile Zone first!');
      return false;
    }

    if (this.stagedExtractions.size === 0) {
      if (global.AudioSynth) global.AudioSynth.playCancel();
      if (global.UISidebars) global.UISidebars.showToast('⚠️ Copy at least 1 component before finalizing!');
      return false;
    }

    const center = this.placedCenter || this.zoneCursor;
    if (global.BoardRippleRenderer?.triggerPlacementRipple && center) {
      global.BoardRippleRenderer.triggerPlacementRipple([{ q: center.q, r: center.r }], '#06b6d4', { profile: 'material', bands: 1 });
    }
    global.BoardCursorRenderer?.startFlowerOut?.();

    this.isFinalizing = true;
    try {
      state.componentsBag = state.componentsBag || [];
      this.stagedExtractions.forEach((data, slotIdx) => {
        while (state.componentsBag.length <= slotIdx) state.componentsBag.push(null);
        state.componentsBag[slotIdx] = (data.item !== undefined) ? data.item : data.color;
        if (!state.ritualSlots) state.ritualSlots = new Set();
        state.ritualSlots.add(slotIdx);
      });

      const ritualIdx = this.ritualSpellIndex;
      const spellData = (ritualIdx !== null && ritualIdx < state.spellbook.length)
        ? { ...state.spellbook[ritualIdx] } : { formula: 'BBR', element: 'Ice', name: 'Ritual', usableRound: state.round };

      if (ritualIdx !== null && ritualIdx < state.spellbook.length) state.spellbook.splice(ritualIdx, 1);
      else { const f = state.spellbook.findIndex(s => s.formula === 'BBR' || s.name === 'Ritual'); if (f !== -1) state.spellbook.splice(f, 1); }

      if (global.UndoManager) {
        global.UndoManager.recordSpellCast({
          type: 'ritual', name: 'Ritual', formula: 'BBR', spell: 'Ritual',
          tilesCleared: [], previousBag: [...this.originalBagBackup],
          previousRitualSlots: new Set(this.originalRitualSlotsBackup || []),
          placedCenter: this.placedCenter ? { ...this.placedCenter } : { q: 0, r: 0 },
          spellbookIndex: (ritualIdx !== null) ? ritualIdx : 0, spellData
        });
      }

      if (global.AudioSynth) global.AudioSynth.playReward('ritual');
      if (global.SigilResolver && state.board) {
        state.placedThisTurn ? global.SigilResolver.restoreSigilStageIfPlaced(state.board)
          : (global.SigilResolver.evaluateSigils(state.board), global.SigilResolver.resolveInitialSigils(state.board));
      }

      const count = this.stagedExtractions.size;
      this.inRitualMode = false; state.inRitualMode = false; this.ritualSpellIndex = null; state.ritualSpellIndex = null;
      this.stage = 'zone'; this.isPlaced = false; this.placedCenter = null; this.flowerTiles = []; this.allowedTiles = new Set();
      this.copiedTileKeys.clear(); this.stagedExtractions.clear();
      if (state.newlyCopiedSlots) state.newlyCopiedSlots.clear();
      this.originalBagBackup = []; this.originalRitualSlotsBackup = new Set(); this.originalTilesBackup.clear();
      if (!state.placedThisTurn) state.isMaterialSelected = true;

      if (global.UISidebars) {
        global.UISidebars.showToast(`❄️ RITUAL FINALIZED: ${count} component(s) copied into your inventory!`);
        global.UISidebars.updateComponentsBar(); global.UISidebars.renderTrayUI();
        global.UISidebars.renderSpellbookUI(); global.UISidebars.syncNavState();
        global.UISidebars.updateTelemetry(); global.UISidebars.updateHpBar();
      }
      global.UISidebarDeck?.openSpellbookColumn(true);
      if (global.UICardsDeck) global.UICardsDeck.syncComponentsColumn();
      if (global.BoardRenderer) global.BoardRenderer.render();
      return true;
    } finally {
      this.isFinalizing = false;
    }
  };

  proto.handleUndo = function() {
    const state = global.GameState;
    if (!state || !this.inRitualMode) return false;

    // Step-by-step undo of each copy action
    if (this.actionHistory && this.actionHistory.length > 0) {
      const last = this.actionHistory.pop();
      if (last && last.fromKey) this.copiedTileKeys.delete(last.fromKey);
      if (state.componentsBag && last.slotIndex < state.componentsBag.length) {
        state.componentsBag[last.slotIndex] = (last.previousItem !== undefined) ? last.previousItem : (last.previousColor || null);
      }
      if (state.newlyCopiedSlots) state.newlyCopiedSlots.delete(last.slotIndex);
      this.stagedExtractions.delete(last.slotIndex);
      if (global.AudioSynth) global.AudioSynth.playClick();
      if (global.UISidebars) {
        global.UISidebars.syncNavState();
        global.UISidebars.updateComponentsBar?.();
        global.UISidebars.showToast(`Reverted slot ${last.slotIndex + 1}.`);
      }
      if (global.UICardsDeck) global.UICardsDeck.syncComponentsColumn();
      if (global.NativeStatPod) global.NativeStatPod.setComponents(state.componentsBag);
      if (global.BoardRenderer) global.BoardRenderer.render();
      state.syncUI?.();
      return true;
    }

    if (this.stage === 'component') {
      this.stage = 'zone';
      this.isPlaced = false;
      this.placedCenter = null;
      this.flowerTiles = [];
      this.allowedTiles = new Set();
      this.copiedTileKeys.clear();
      this.originalTilesBackup.clear();
      state.syncUI?.();
      global.UISidebarDeck?.closeComponentsColumn?.();

      if (global.AudioSynth) global.AudioSynth.playClick();
      if (global.UISidebars) {
        global.UISidebars.showToast('↶ Ritual zone unplaced. Move with WASD, then press SPACE to place.');
        global.UISidebars.syncNavState();
      }
      if (global.BoardRenderer) global.BoardRenderer.render();
      return true;
    }
    return this.cancel();
  };

  proto.cancel = function() {
    const state = global.GameState;
    global.BoardCursorRenderer?.startFlowerOut?.();
    this.stagedExtractions.clear(); this.copiedTileKeys.clear(); this.inRitualMode = false;
    if (state) {
      state.inRitualMode = false; this.ritualSpellIndex = null; state.ritualSpellIndex = null;
      if (state.componentsBag) state.componentsBag = [...this.originalBagBackup];
      if (state.newlyCopiedSlots) state.newlyCopiedSlots.clear();
      state.syncUI?.();
    }
    this.stage = 'zone'; this.isPlaced = false; this.placedCenter = null;
    this.flowerTiles = []; this.allowedTiles = new Set();
    this.originalBagBackup = []; this.originalRitualSlotsBackup = new Set();
    this.originalTilesBackup.clear(); this.isFinalizing = false;
    if (state && !state.placedThisTurn) state.isMaterialSelected = true;

    global.AudioSynth?.playClick?.();
    if (global.UISidebars) {
      global.UISidebars.showToast('Ritual spell cancelled.'); global.UISidebars.resetToFace('spells', 'backward');
      global.UISidebars.updateComponentsBar?.(); global.UISidebars.renderSpellbookUI(); global.UISidebars.syncNavState();
    }
    if (global.UICardsDeck) global.UICardsDeck.syncComponentsColumn();
    if (global.BoardRenderer) global.BoardRenderer.render();
    global.UISidebarDeck?.openSpellbookColumn(false);
    return true;
  };

  proto.undo = function(entry) {
    const state = global.GameState;
    if (!state || !entry) return false;
    if (entry.tilesCleared?.length > 0) {
      for (const { key, color } of entry.tilesCleared) { const tile = state.board.get(key); if (tile) tile.color = color; }
    }
    if (entry.previousBag) state.componentsBag = [...entry.previousBag];
    if (entry.previousRitualSlots) state.ritualSlots = new Set(entry.previousRitualSlots);

    const restoredSpell = entry.spellData || { formula: 'BBR', element: 'Ice', name: 'Ritual', desc: 'Allows you to copy any of the 7 flower tiles into your components inventory.', usableRound: state.round };
    const insertIdx = (entry.spellbookIndex !== undefined && entry.spellbookIndex <= state.spellbook.length) ? entry.spellbookIndex : state.spellbook.length;
    state.spellbook.splice(insertIdx, 0, restoredSpell);

    if (global.SigilResolver && state.board) {
      state.placedThisTurn ? global.SigilResolver.restoreSigilStageIfPlaced(state.board, { animate: false }) : (global.SigilResolver.evaluateSigils(state.board), global.SigilResolver.resolveInitialSigils(state.board, { animate: false }));
    }
    const c = entry.placedCenter || { q: 0, r: 0 };
    this.inRitualMode = true; state.inRitualMode = true;
    this.ritualSpellIndex = insertIdx; state.ritualSpellIndex = insertIdx;
    this.zoneCursor = { ...c }; this.stage = 'zone'; this.actionHistory = []; this.copiedTileKeys.clear();
    this.originalBagBackup = state.componentsBag ? state.componentsBag.map(x => (typeof x === 'object' && x) ? { ...x } : x) : [];
    this.originalRitualSlotsBackup = state.ritualSlots ? new Set(state.ritualSlots) : new Set();
    state.isMaterialSelected = false;
    this.placeZone();
    if (global.UISidebars) {
      global.UISidebars.showToast('❄️ Store unconfirmed: Copied components reverted.');
      global.UISidebars.updateComponentsBar(); global.UISidebars.renderTrayUI(); global.UISidebars.renderSpellbookUI(); global.UISidebars.syncNavState(); global.UISidebars.updateHpBar();
    }
    if (global.UICardsDeck) global.UICardsDeck.syncComponentsColumn();
    return true;
  };

  proto.renderFace = function() {};

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Spell_Ritual_1.1', global.SpellRitual);
})(window);
