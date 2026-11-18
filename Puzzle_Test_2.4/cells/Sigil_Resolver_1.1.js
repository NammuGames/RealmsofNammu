/**
 * @fileoverview cells/Sigil_Resolver_1.1.js - Wild Cycling, Tile Sync & Vertex Cursor Navigation
 * @description Manages Ether wild spell cycling/permutation, board tile sigil sync,
 * and 3-hex vertex cursor navigation & targeting (Part 2 of multi-part SigilResolver cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const proto = global.SigilResolverClass?.prototype;
  if (!proto) {
    console.error('[Sigil_Resolver_1.1] SigilResolverClass is not defined. Ensure Sigil_Resolver_1.0.js is loaded first.');
    return;
  }

  /**
   * Cycles the wild spell formula on a wild sigil candidate.
   */
  proto.cycleWildSpell = function(candId, board) {
    if (!candId || !this.lockedSigilIds.has(candId)) return false;
    const cand = this.allCandidates.find(c => c.id === candId);
    if (!cand || !cand.isWild) return false;

    if (global.ComponentEther?.cycleNextSpell) {
      global.ComponentEther.cycleNextSpell(cand);
    } else if (cand.validFormulas && cand.validFormulas.length > 1) {
      const idx = cand.validFormulas.indexOf(cand.formula);
      const nextIdx = (idx + 1) % cand.validFormulas.length;
      cand.formula = cand.validFormulas[nextIdx];
      const spellDef = global.MaterialsData?.ELEMENTAL_SPELLS[cand.formula];
      if (spellDef) {
        cand.element = spellDef.element;
        cand.spell = spellDef.name;
      }
    }

    this.savedWildSelections.set(cand.id, {
      formula: cand.formula,
      formulaIndex: cand.formulaIndex,
      permIndex: cand.wildPermutationIndex ?? 0
    });
    this.syncBoardSigilTiles(board);
    global.AudioSynth?.playRotate?.();
    global.UISidebars?.showToast?.(`✨ Channeled: ${cand.spell?.toUpperCase() || cand.formula} (${cand.formula}) [Wild]`);
    return true;
  };

  /**
   * Permutes wild colors on an ether candidate.
   */
  proto.permuteWildColors = function(candId, dir, board) {
    if (!candId || !this.lockedSigilIds.has(candId)) return false;
    const cand = this.allCandidates.find(c => c.id === candId);
    if (!cand || !cand.isWild) return false;

    let changed = false;
    if (global.ComponentEther?.permuteWildColors) {
      changed = global.ComponentEther.permuteWildColors(cand, dir);
    } else if (cand.validFormulas && cand.validFormulas.length > 1) {
      const idx = cand.validFormulas.indexOf(cand.formula);
      const nextIdx = (idx + (dir === -1 ? cand.validFormulas.length - 1 : 1)) % cand.validFormulas.length;
      cand.formula = cand.validFormulas[nextIdx];
      const spellDef = global.MaterialsData?.ELEMENTAL_SPELLS[cand.formula];
      if (spellDef) {
        cand.element = spellDef.element;
        cand.spell = spellDef.name;
      }
      changed = true;
    }

    if (changed) {
      this.savedWildSelections.set(cand.id, {
        formula: cand.formula,
        formulaIndex: cand.formulaIndex,
        permIndex: cand.wildPermutationIndex ?? 0
      });
      this.syncBoardSigilTiles(board);
      global.AudioSynth?.playRotate?.();
      global.UISidebars?.showToast?.(`🔄 Permuted Wild Colors: ${cand.spell?.toUpperCase() || cand.formula} (${cand.formula})`);
    }
    return changed;
  };

  /**
   * Synchronizes board tiles with their active sigil IDs and evaluates resonance alignments.
   * @param {Map} board
   */
  proto.syncBoardSigilTiles = function(board) {
    if (!board) return;
    for (const tile of board.values()) {
      tile.sigilId = null;
    }

    this.activeSigils = [];
    const lockedList = this.allCandidates.filter(c => this.lockedSigilIds.has(c.id));

    lockedList.forEach(cand => {
      cand.tiles.forEach(tk => {
        const t = board.get(tk);
        if (t) t.sigilId = cand.id;
      });
      this.activeSigils.push(cand);
    });

    // Evaluate resonance alignments across locked sigils
    const archZones = (global.GameState?.archZones || []).slice();
    global.SpellArch?.syncArchZones?.(archZones);
    if (global.GameState?.inArchMode && global.SpellArch?.isPlaced && global.SpellArch?.placedCenter) {
      const center = global.SpellArch.placedCenter;
      const flower = global.SpellArch.getFlowerTilesFor
        ? global.SpellArch.getFlowerTilesFor(center.q, center.r)
        : (global.HexMath?.getFlowerTiles ? global.HexMath.getFlowerTiles(center.q, center.r) : []);
      const ench = global.SpellArch.getArchEnchantmentAt ? global.SpellArch.getArchEnchantmentAt(center.q, center.r) : null;
      archZones.push({ center, flowerTiles: flower, allZoneTiles: flower, enchantment: ench });
    }
    if (global.SigilEngine) {
      const res = global.SigilEngine.findResonances(lockedList, archZones);
      this.resonantSigils = res.resonantSigils;
      this.resonantPairs = res.resonantPairs;
      this.resonantArchZoneIds = res.resonantArchZoneIds || new Set();
    }

    // Synchronize active element color onto Ether wild tiles
    if (global.ComponentEther?.syncBoardEtherActiveColors) {
      global.ComponentEther.syncBoardEtherActiveColors(board, this.allCandidates, this.lockedSigilIds);
    }
  };

  /**
   * Navigates the 3-hex vertex cursor across the board grid.
   * @param {string} dir - 'up' | 'down' | 'left' | 'right'
   * @param {number} boardRadius
   * @returns {boolean}
   */
  proto.moveSigilVertex = function(dir, boardRadius = 6) {
    if (!this.sigilCursorVertex || !global.HexMath) return false;
    const next = global.HexMath.stepVertex(this.sigilCursorVertex, dir);
    if (!next) return false;

    // Ensure at least one constituent tile is within boardRadius + 1
    const tiles = global.HexMath.getVertexTiles(next);
    const isInside = tiles.some(tk => {
      const [q, r] = tk.split(',').map(Number);
      return global.HexMath.hexDistance(q, r) <= boardRadius + 1;
    });

    if (isInside) {
      this.sigilCursorVertex = next;
      this.selectedSigilId = null;
      global.AudioSynth?.playClick?.();
      return true;
    }
    return false;
  };

  proto.focusSigil = function(sigilId) {
    this.selectedSigilId = sigilId;
    global.AudioSynth?.playClick?.();
    global.GameState?.syncUI?.();
  };

  proto.getEstimatedPoints = function() {
    return global.SigilEngine ? global.SigilEngine.calculateTotalPoints() : 0;
  };

  proto.getComboText = function() {
    return global.SigilEngine ? global.SigilEngine.getComboText() : '0';
  };

  proto.getLockedSigilAtCursor = function() {
    if (!this.sigilCursorVertex || !global.HexMath || !this.lockedSigilIds || this.lockedSigilIds.size === 0) return null;
    const tiles = global.HexMath.getVertexTiles(this.sigilCursorVertex).sort().join('|');
    const list = (this.activeSigils && this.activeSigils.length > 0)
      ? this.activeSigils
      : (this.allCandidates ? this.allCandidates.filter(c => this.lockedSigilIds.has(c.id)) : []);
    return list.find(s =>
      this.lockedSigilIds.has(s.id) && s.tiles.slice().sort().join('|') === tiles
    ) || null;
  };

  proto.getDormantSigilAtCursor = function() {
    if (!this.sigilCursorVertex || !global.HexMath || !this.allCandidates || this.allCandidates.length === 0) return null;
    const tiles = global.HexMath.getVertexTiles(this.sigilCursorVertex).sort().join('|');
    const list = this.allCandidates.filter(c => !this.lockedSigilIds || !this.lockedSigilIds.has(c.id));
    return list.find(s =>
      s.tiles.slice().sort().join('|') === tiles
    ) || null;
  };

  proto.getTargetableSigilAtCursor = function() {
    return this.getLockedSigilAtCursor() || this.getDormantSigilAtCursor();
  };

  /**
   * Re-runs sigil detector after piece placement or board-modifying spells.
   * Restores sigil stage if a piece was placed this turn.
   * @param {Map} board
   */
  proto.restoreSigilStageIfPlaced = function(board, options = {}) {
    if (!board) return;
    this.evaluateSigils(board);
    if (this.allCandidates && this.allCandidates.length > 0) {
      if (global.GameState && global.GameState.placedThisTurn) global.GameState.inSigilStage = true;
      this.resolveInitialSigils(board, options);
    } else {
      if (global.GameState) global.GameState.inSigilStage = false;
      this.dormantSigilIds.clear(); this.newlyFormedSigilIds.clear(); this.newlyFormedPairKeys.clear(); this.syncBoardSigilTiles(board);
      if (typeof options.onComplete === 'function') options.onComplete();
    }
  };

  proto.isTeleportLocationVacant = function(v, board, boardRadius = 6) {
    if (global.SpellTeleport?.inTeleportMode && global.SpellTeleport?.teleportHeldSigil) {
      return global.SpellTeleport.canPlaceSigilAt(v, global.GameState?.teleportRotation || 0);
    }
    if (!v || !global.HexMath || !board) return false;
    const tiles = global.HexMath.getVertexTiles(v);
    for (const tk of tiles) {
      const [q, r] = tk.split(',').map(Number);
      if (global.HexMath.hexDistance(q, r) > boardRadius) return false;
      const tile = board.get(tk);
      if (!tile || tile.color !== null) return false;
    }
    return true;
  };

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Sigil_Resolver_1.1', global.SigilResolver);
})(typeof window !== 'undefined' ? window : this);
