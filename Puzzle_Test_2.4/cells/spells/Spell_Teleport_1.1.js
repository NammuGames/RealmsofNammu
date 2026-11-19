/**
 * @fileoverview Spell_Teleport_1.1.js - Dark Teleport Spell (BBP) Placement, Rotation & Undo
 * @description Manages vacant hex placement validation, sigil placement, unpick/cancel,
 * held rotation, and spell undo reversal.
 */

(function (global) {
  'use strict';

  const SpellTeleportClass = global.SpellTeleportClass;
  if (!SpellTeleportClass) return;

  const proto = SpellTeleportClass.prototype;

  /**
   * Checks if held sigil can be placed at vertex v with rotation rot by enchantment rules.
   */
  proto.canPlaceSigilAt = function (v, rot = 0) {
    const state = global.GameState;
    if (!state || !v || !global.HexMath || !state.board) return false;
    const held = this.teleportHeldSigil;
    if (!held) return false;
    const comps = held.components || held.colors.map(c => ({ color: c }));
    const tiles = global.HexMath.getVertexTiles(v);
    const bRad = state.boardRadius || 6;

    for (let i = 0; i < 3; i++) {
      const tk = tiles[i];
      const [q, r] = tk.split(',').map(Number);
      if (global.HexMath.hexDistance(q, r) > bRad) return false;
      const tile = state.board.get(tk);
      if (!tile) return false;

      const comp = comps[(i + rot) % 3];
      if (!comp) return false;

      if (comp.burned) {
        if (tile.burned) return false;
      } else if (comp.phased) {
        if (tile.phased) return false;
      } else {
        if (tile.color !== null || tile.burned) return false;
      }
    }
    return true;
  };

  /**
   * Places held sigil onto board at vacant sigil cursor vertex.
   */
  proto.placeSigil = function () {
    const state = global.GameState;
    if (!state || !this.inTeleportMode || !this.teleportHeldSigil || this.isTransitioning) return false;

    if (!this.canPlaceSigilAt(state.sigilCursorVertex, this.teleportRotation)) {
      global.AudioSynth?.playCancel?.();
      global.UISidebars?.showToast?.('⚠️ Target location is invalid for this Sigils enchantments!');
      return false;
    }

    const held = this.teleportHeldSigil;
    const rot = this.teleportRotation || 0;
    const targetTiles = global.HexMath.getVertexTiles(state.sigilCursorVertex);
    const targetSnapshots = [];
    let hadAnnihilation = false;
    const comps = held.components;

    targetTiles.forEach((tk, idx) => {
      const tile = state.board.get(tk);
      if (!tile) return;
      const comp = comps ? comps[(idx + rot) % 3] : { color: held.colors[(idx + rot) % 3] };

      targetSnapshots.push({
        key: tk, color: tile.color, sigilId: tile.sigilId || null,
        phased: !!tile.phased, phaseOwner: tile.phaseOwner || null, fortified: !!tile.fortified, lockOwner: tile.lockOwner || null,
        burned: !!tile.burned, burnOwner: tile.burnOwner || null, woven: !!tile.woven, weaveOwner: tile.weaveOwner || null,
        underneath: tile.underneath ? { ...tile.underneath } : null, plagueId: tile.plagueId || null
      });

      // 1. Mutual Annihilation (Burn vs Phase)
      if ((comp.burned && tile.phased) || (comp.phased && tile.burned)) {
        this._restoreTile(tile, null, tk, state);
        hadAnnihilation = true;
        return;
      }

      // 2. Placing Burn or Phase over existing component / disease
      if ((comp.burned || comp.phased) && (tile.color !== null || tile.fortified)) {
        const pId = tile.plagueId || (tile.color === 'disease' && global.ComponentDisease?.shapes
          ? Array.from(global.ComponentDisease.shapes.values()).find(s => s.components.some(c => c.key === tk))?.id : null);
        tile.underneath = { color: tile.color, sigilId: tile.sigilId || null, fortified: !!tile.fortified, lockOwner: tile.lockOwner || null, plagueId: pId || null };
        tile.color = comp.color;
        tile.burned = !!comp.burned; tile.burnOwner = comp.burned ? (comp.burnOwner || state.currentPlayerId || 1) : null;
        tile.phased = !!comp.phased; tile.phaseOwner = comp.phased ? (comp.phaseOwner || state.currentPlayerId || 1) : null;
        tile.fortified = false; tile.lockOwner = null; tile.woven = false; tile.weaveOwner = null;
        if (tile.color !== 'disease') tile.plagueId = null;
        state.fortifiedTiles?.delete(tk);
        return;
      }

      // 3. Standard / vacant placement
      this._restoreTile(tile, comp, tk, state);
    });

    const triKeys = targetTiles.slice().sort();
    const newSigilId = 'sigil_' + triKeys.join('|');
    if (!hadAnnihilation) state.lockedSigilIds.add(newSigilId);

    if (global.SigilResolver) {
      if (state.placedThisTurn) global.SigilResolver.restoreSigilStageIfPlaced(state.board);
      else { global.SigilResolver.evaluateSigils(state.board); global.SigilResolver.resolveInitialSigils(state.board); }
      state.selectedSigilId = null;
    } else if (global.SigilEngine) {
      state.allCandidates = global.SigilEngine.findCandidates(state.board);
      state.overlapsMap = global.SigilEngine.computeOverlaps(state.allCandidates);
      state.syncBoardSigilTiles();
    }

    let consumedSpell = null;
    const sIdx = this.teleportSpellIndex;
    if (sIdx !== null && sIdx < state.spellbook.length) {
      consumedSpell = { ...state.spellbook[sIdx] };
      state.spellbook.splice(sIdx, 1);
    }

    if (consumedSpell && global.UndoManager) {
      global.UndoManager.recordSpellCast({
        type: 'teleport', name: consumedSpell.name || this.fullName,
        spell: consumedSpell, spellIndex: sIdx, originalSigilId: held.id,
        originalTiles: held.originalTiles ? held.originalTiles.slice() : [],
        targetTiles: targetTiles.slice(), targetSnapshots, newSigilId,
        heldSigil: { ...held }, rotation: rot, targetVertex: { ...state.sigilCursorVertex }
      });
    }

    const coords = targetTiles.map((tk, idx) => {
      const [q, r] = tk.split(',').map(Number);
      const comp = comps ? comps[(idx + rot) % 3] : null;
      const bBg = comp?.bezelBg || comp?.bezelColor || this.getTileBezelColor(comp, held.element);
      const bStroke = comp?.bezelStroke || comp?.bezelColor || this.getTileBezelColor(comp, held.element);
      return { q, r, bezelBg: bBg, bezelStroke: bStroke, bezelColor: bStroke };
    });

    this.teleportHeldSigil = null; state.teleportHeldSigil = null;
    this.isTransitioning = true;
    this.isPlacing = true;
    this.placingSigilId = newSigilId;
    this.placementTargetTiles = targetTiles.slice();
    this.placementProgress = 0.0;

    const finalizePlacement = () => {
      this.isTransitioning = false; this.isPlacing = false;
      this.placingSigilId = null; this.placementTargetTiles = null; this.placementProgress = null;
      global.AudioSynth?.playReward?.('teleport');
      if (global.UISidebars) {
        global.UISidebars.showToast(`🌌 WARP COMPLETE: ${held.spell} relocated!`);
        global.UISidebars.resetToFace('materials', 'backward');
        global.UISidebars.renderTrayUI(); global.UISidebars.renderSpellbookUI();
        global.UISidebars.syncNavState(); global.UISidebars.updateTelemetry();
      }
      this.inTeleportMode = false; state.inTeleportMode = false;
      this.teleportSpellIndex = null; state.teleportSpellIndex = null;
      this.teleportRotation = 0; this.castStartTime = null; state.teleportCastStartTime = null;
      if (!state.placedThisTurn) state.isMaterialSelected = true;
      global.UISidebarDeck?.openSpellbookColumn(true);
      global.BoardRenderer?.render?.();
    };

    if (global.BoardRippleRenderer?.playMaterialPlacement) {
      global.BoardRippleRenderer.playMaterialPlacement(coords, '#06b6d4', finalizePlacement, global.H_TIMING?.THREE_BEATS_SEC ?? (3 * Math.pow(12, 8) / 1420405751.768));
    } else {
      if (global.BoardRippleRenderer?.triggerPlacementRipple) global.BoardRippleRenderer.triggerPlacementRipple(coords, '#06b6d4');
      finalizePlacement();
    }
    return true;
  };

  /**
   * Restores held sigil back to its original tiles and returns to sigil selection stage.
   */
  proto.unpickSigil = function () {
    const state = global.GameState;
    if (!state || !this.inTeleportMode || !this.teleportHeldSigil || this.isTransitioning) return false;
    const held = this.teleportHeldSigil;
    (held.originalTiles || []).forEach(snap => this._restoreTile(state.board.get(snap.key), snap, snap.key, state));
    state.lockedSigilIds.add(held.id);
    if (global.SigilResolver) {
      if (state.placedThisTurn) global.SigilResolver.restoreSigilStageIfPlaced(state.board, { animate: false });
      else { global.SigilResolver.evaluateSigils(state.board); global.SigilResolver.resolveInitialSigils(state.board, { animate: false }); }
    } else if (global.SigilEngine) {
      state.allCandidates = global.SigilEngine.findCandidates(state.board);
      state.overlapsMap = global.SigilEngine.computeOverlaps(state.allCandidates);
      state.syncBoardSigilTiles();
    }
    this.teleportHeldSigil = null; state.teleportHeldSigil = null;
    this.teleportRotation = 0; state.teleportRotation = 0;
    if (global.AudioSynth) global.AudioSynth.playClick();
    if (global.UISidebars) {
      global.UISidebars.showToast('Sigil returned. Aim cursor over a sigil and select it.');
      global.UISidebars.syncNavState();
    }
    if (global.BoardRenderer) global.BoardRenderer.render();
    return true;
  };

  /**
   * Multi-stage undo: returns held sigil if held, else cancels Teleport.
   */
  proto.handleUndo = function () {
    if (this.teleportHeldSigil) return this.unpickSigil();
    return this.cancel();
  };

  /**
   * Cancels Teleport mode, restoring any held sigil and returning to spellbook or Charge.
   */
  proto.cancel = function () {
    const state = global.GameState;
    if (!state || !this.inTeleportMode || this.isTransitioning) return false;
    if (this.teleportHeldSigil) this.unpickSigil();
    this.inTeleportMode = false; state.inTeleportMode = false;
    this.teleportHeldSigil = null; state.teleportHeldSigil = null;
    this.teleportSpellIndex = null; this.teleportRotation = 0; state.teleportRotation = 0;
    this.castStartTime = null; state.teleportCastStartTime = null;
    this.isPickingUp = false; this.pickingUpSigilId = null; this.pickingUpTiles = null; this.pickupProgress = null;
    this.isPlacing = false; this.placingSigilId = null; this.placementProgress = null; this.placementTargetTiles = null;
    if (!state.placedThisTurn) state.isMaterialSelected = true;
    global.AudioSynth?.playClick?.();
    if (global.UISidebars) {
      global.UISidebars.showToast('Warp Cancelled: Spell Preserved');
      global.UISidebars.syncNavState(); global.UISidebars.updateTelemetry();
    }
    global.UISidebarDeck?.openSpellbookColumn(false);
    global.BoardRenderer?.render?.();
    return true;
  };

  /**
   * Rotates held sigil orientation (0, 1, 2)
   * @param {'cw'|'ccw'} dir
   */
  proto.rotate = function (dir) {
    if (!this.teleportHeldSigil || this.isTransitioning) return false;
    const state = global.GameState;
    if (dir === 'cw') {
      this.teleportRotation = (this.teleportRotation + 1) % 3;
    } else {
      this.teleportRotation = (this.teleportRotation + 2) % 3;
    }
    if (state) state.teleportRotation = this.teleportRotation;
    if (global.AudioSynth) global.AudioSynth.playRotate();
    if (global.BoardRenderer) {
      global.BoardRenderer.render();
    }
    return true;
  };

  /**
   * Undoes a previously cast Dark Teleport from current round.
   * @param {Object} entry - Spell undo entry
   * @returns {boolean}
   */
  proto.undo = function (entry) {
    const state = global.GameState;
    if (!state || !entry) return false;

    if (entry.targetSnapshots) {
      entry.targetSnapshots.forEach(snap => this._restoreTile(state.board.get(snap.key), snap, snap.key, state));
    } else if (entry.targetTiles) {
      entry.targetTiles.forEach(tk => this._restoreTile(state.board.get(tk), null, tk, state));
    }
    if (entry.newSigilId) state.lockedSigilIds.delete(entry.newSigilId);

    const insertIdx = Math.min(entry.spellIndex ?? 0, state.spellbook.length);
    if (entry.spell) state.spellbook.splice(insertIdx, 0, entry.spell);

    if (entry.heldSigil) {
      this.inTeleportMode = true; state.inTeleportMode = true;
      this.teleportSpellIndex = insertIdx; state.teleportSpellIndex = insertIdx;
      this.teleportHeldSigil = { ...entry.heldSigil }; state.teleportHeldSigil = this.teleportHeldSigil;
      this.teleportRotation = entry.rotation || 0; state.teleportRotation = this.teleportRotation;
      if (entry.targetVertex) state.sigilCursorVertex = { ...entry.targetVertex };
      state.isMaterialSelected = false;
      global.UISidebarDeck?.closeSpellbookColumn();
    } else {
      if (entry.originalTiles) entry.originalTiles.forEach(snap => this._restoreTile(state.board.get(snap.key), snap, snap.key, state));
      if (entry.originalSigilId) state.lockedSigilIds.add(entry.originalSigilId);
    }

    if (global.SigilResolver) {
      if (state.placedThisTurn) global.SigilResolver.restoreSigilStageIfPlaced(state.board, { animate: false });
      else { global.SigilResolver.evaluateSigils(state.board); global.SigilResolver.resolveInitialSigils(state.board, { animate: false }); }
    } else if (global.SigilEngine) {
      state.allCandidates = global.SigilEngine.findCandidates(state.board);
      state.overlapsMap = global.SigilEngine.computeOverlaps(state.allCandidates);
      state.syncBoardSigilTiles();
    }
    global.BoardRenderer?.render?.();
    global.AudioSynth?.playClick?.();
    if (global.UISidebars) {
      global.UISidebars.showToast('↶ Warp unconfirmed: Sigil returned to cursor.');
      global.UISidebars.renderTrayUI(); global.UISidebars.renderSpellbookUI();
      global.UISidebars.updateTelemetry(); global.UISidebars.syncNavState();
    }
    return true;
  };

  proto.renderFace = function () {
    // Native Canvas 2D scene graph handles visual feedback
  };

  global.ROLL_CALL?.set?.('Spell_Teleport_1.1', global.SpellTeleport);
})(window);
