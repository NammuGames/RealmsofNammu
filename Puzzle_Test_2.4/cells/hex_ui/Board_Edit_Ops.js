/**
 * @fileoverview cells/hex_ui/Board_Edit_Ops.js - Isolated Sandbox Board Editor Operations (Part 2)
 * @description Board mutation logic for BoardEditLab: component/overhang placement, enchantments,
 * Disease covering and <=4 body merging with random tiebreaker, Erase, Arch Plasma Nodes, and Sigil activation.
 */

(function(global) {
  'use strict';

  const proto = global.BoardEditLabClass?.prototype;
  if (!proto) {
    console.error('[Board_Edit_Ops] BoardEditLabClass not found. Load Board_Edit_Lab.js first.');
    return;
  }

  proto._clearDamageTilesAt = function(q, r) {
    const state = global.GameState;
    if (!state?.activeDamageTiles) return;
    state.activeDamageTiles = state.activeDamageTiles.filter(d => !(d.q === q && d.r === r));
  };

  proto._syncShapeOffBoardDamage = function(shape) {
    const state = global.GameState;
    if (!state || !shape) return;
    shape.offBoard = shape.components.some(c => !c.onBoard);
    if (!state.activeDamageTiles) state.activeDamageTiles = [];
    state.activeDamageTiles = state.activeDamageTiles.filter(d => d.plagueShapeId !== shape.id);
    if (shape.offBoard) {
      shape.components.forEach(c => {
        if (!c.onBoard) {
          state.activeDamageTiles.push({
            q: c.q, r: c.r, color: 'disease', isDisease: true, plagueShapeId: shape.id
          });
        }
      });
    }
  };

  proto._removeCoordFromDisease = function(q, r) {
    const cd = global.ComponentDisease;
    if (!cd?.shapes) return;
    const key = `${q},${r}`;
    const toDelete = [];
    cd.shapes.forEach((shape, id) => {
      const before = shape.components.length;
      shape.components = shape.components.filter(c => c.key !== key && !(c.q === q && c.r === r));
      if (shape.components.length !== before) {
        if (shape.components.length === 0) {
          this._clearDamageTilesForShape(id);
          toDelete.push(id);
        } else {
          this._syncShapeOffBoardDamage(shape);
        }
      }
    });
    toDelete.forEach(id => cd.shapes.delete(id));
  };

  proto._clearDamageTilesForShape = function(shapeId) {
    const state = global.GameState;
    if (state?.activeDamageTiles) {
      state.activeDamageTiles = state.activeDamageTiles.filter(d => d.plagueShapeId !== shapeId);
    }
  };

  proto._findAdjacentMergeShapes = function(q, r) {
    const cd = global.ComponentDisease;
    const math = global.HexMath;
    if (!cd?.shapes || !math) return [];
    const key = `${q},${r}`;
    const matches = [];
    cd.shapes.forEach(shape => {
      if (!shape?.components || shape.components.length >= 4) return;
      if (shape.components.some(c => c.key === key || (c.q === q && c.r === r))) return;
      const adj = shape.components.some(c => {
        const dist = math.hexDistanceBetween
          ? math.hexDistanceBetween(q, r, c.q, c.r)
          : math.hexDistance(q - c.q, r - c.r);
        return dist === 1;
      });
      if (adj) matches.push(shape);
    });
    return matches;
  };

  proto.placeComponentAt = function(q, r) {
    const state = global.GameState;
    if (!state?.board) return false;

    const color = this.getCurrentComponent();
    if (color === 'disease') return this._placeDiseaseAt(q, r);

    const key = `${q},${r}`;
    const tile = state.board.get(key);
    const ench = this.enchantment;

    if (!tile) {
      this._clearDamageTilesAt(q, r);
      this._removeCoordFromDisease(q, r);
      state.activeDamageTiles = state.activeDamageTiles || [];
      state.activeDamageTiles.push({ q, r, color, isPlacedPlague: false });
      global.AudioSynth?.playPlace?.();
      this.refreshSigils();
      return true;
    }

    if (ench === 'burn' || ench === 'phase') {
      const oppFlag = ench === 'burn' ? tile.phased : tile.burned;
      if (oppFlag) {
        this._removeCoordFromDisease(q, r);
        tile.color = null; tile.sigilId = null;
        tile.phased = false; tile.phaseOwner = null;
        tile.burned = false; tile.burnOwner = null;
        tile.fortified = false; tile.lockOwner = null;
        tile.woven = false; tile.weaveStep = null;
        tile.underneath = null; tile.plagueId = null; tile.coveredComponent = null;
        state.fortifiedTiles?.delete(key);
        global.AudioSynth?.playDetonate?.();
      } else {
        const prevPlague = tile.plagueId || null;
        const under = (tile.color !== null || tile.fortified || prevPlague) ? {
          color: tile.color, sigilId: tile.sigilId || null,
          fortified: !!tile.fortified, lockOwner: tile.lockOwner || null, plagueId: prevPlague
        } : null;
        tile.underneath = under;
        tile.color = color;
        tile.sigilId = null;
        tile.fortified = false; tile.lockOwner = null;
        tile.woven = false; tile.weaveStep = null;
        tile.plagueId = null; tile.coveredComponent = null;
        state.fortifiedTiles?.delete(key);
        if (ench === 'burn') {
          tile.burned = true; tile.burnOwner = state.currentPlayerId || 1;
          tile.phased = false; tile.phaseOwner = null;
        } else {
          tile.phased = true; tile.phaseOwner = state.currentPlayerId || 1;
          tile.burned = false; tile.burnOwner = null;
        }
        global.AudioSynth?.playReward?.(ench);
      }
    } else {
      this._removeCoordFromDisease(q, r);
      tile.underneath = null; tile.coveredComponent = null;
      tile.plagueId = null; tile.sigilId = null;
      tile.burned = false; tile.burnOwner = null;
      tile.phased = false; tile.phaseOwner = null;
      tile.fortified = false; tile.lockOwner = null;
      tile.woven = false; tile.weaveStep = null;
      state.fortifiedTiles?.delete(key);
      tile.color = color;

      if (ench === 'fortify') {
        tile.fortified = true; tile.lockOwner = state.currentPlayerId || 1;
        state.fortifiedTiles?.add(key);
        global.AudioSynth?.playReward?.('fortify');
      } else if (ench === 'weave') {
        tile.woven = true;
        global.AudioSynth?.playReward?.('weave');
      } else {
        global.AudioSynth?.playPlace?.();
      }
    }

    const ripCol = ench ? global.BoardRippleRenderer?.getRippleColorForMod?.(ench) : color;
    global.BoardRippleRenderer?.triggerPlacementRipple?.([{ q, r }], ripCol || color, { bands: 1 });
    this.refreshSigils();
    return true;
  };

  proto._placeDiseaseAt = function(q, r) {
    const state = global.GameState;
    const cd = global.ComponentDisease;
    const key = `${q},${r}`;
    const tile = state.board.get(key);
    const onBoard = !!tile;

    if (tile && (tile.color === 'disease' || tile.plagueId)) {
      global.AudioSynth?.playCancel?.();
      state.showToast?.('⚠️ Disease already occupies this tile.');
      return false;
    }

    const alreadyOff = state.activeDamageTiles?.some(d => d.q === q && d.r === r && (d.color === 'disease' || d.isDisease));
    if (!onBoard && alreadyOff) {
      global.AudioSynth?.playCancel?.();
      state.showToast?.('⚠️ Disease already occupies this overhang.');
      return false;
    }

    this._clearDamageTilesAt(q, r);

    // Cover existing component on board tile; clear enchantments (kept toggled on cursor)
    if (tile) {
      tile.coveredComponent = (tile.color !== null) ? {
        color: tile.color,
        sigilId: tile.sigilId || null,
        fortified: false,
        lockOwner: null
      } : null;
      tile.underneath = null;
      tile.burned = false; tile.burnOwner = null;
      tile.phased = false; tile.phaseOwner = null;
      tile.fortified = false; tile.lockOwner = null;
      tile.woven = false; tile.weaveStep = null;
      tile.sigilId = null;
      state.fortifiedTiles?.delete(key);
    }

    const validNeighbors = this._findAdjacentMergeShapes(q, r);
    if (validNeighbors.length > 0) {
      const picked = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
      picked.components.push({ q, r, key, onBoard });
      if (tile) {
        tile.color = 'disease';
        tile.plagueId = picked.id;
      }
      this._syncShapeOffBoardDamage(picked);
    } else if (onBoard && cd?.initPlagueShape) {
      cd.initPlagueShape(q, r, true, state.round || 1);
    } else {
      state.activeDamageTiles = state.activeDamageTiles || [];
      state.activeDamageTiles.push({ q, r, color: 'disease', isPlacedPlague: true });
    }

    global.BoardRippleRenderer?.triggerPlacementRipple?.([{ q, r }], 'disease', { profile: 'disease', bands: 1 });
    global.AudioSynth?.playDiseaseGrow ? global.AudioSynth.playDiseaseGrow() : global.AudioSynth?.playPlace?.();
    this.refreshSigils();
    return true;
  };

  proto.eraseAt = function(q, r) {
    const state = global.GameState;
    if (!state) return false;
    const key = `${q},${r}`;
    const tile = state.board?.get(key);
    let erased = false;

    if (state.archZones?.length > 0) {
      const before = state.archZones.length;
      state.archZones = state.archZones.filter(z => !(z.center && z.center.q === q && z.center.r === r));
      if (state.archZones.length !== before) erased = true;
    }

    const dmgBefore = state.activeDamageTiles?.length || 0;
    this._clearDamageTilesAt(q, r);
    if ((state.activeDamageTiles?.length || 0) !== dmgBefore) erased = true;

    this._removeCoordFromDisease(q, r);

    if (tile) {
      if (tile.color !== null || tile.coveredComponent || tile.underneath || tile.burned || tile.phased || tile.fortified || tile.woven || tile.plagueId) {
        erased = true;
      }
      tile.color = null; tile.sigilId = null;
      tile.coveredComponent = null; tile.underneath = null;
      tile.burned = false; tile.burnOwner = null;
      tile.phased = false; tile.phaseOwner = null;
      tile.fortified = false; tile.lockOwner = null;
      tile.woven = false; tile.weaveStep = null;
      tile.plagueId = null;
      state.fortifiedTiles?.delete(key);
    }

    if (erased) {
      global.BoardRippleRenderer?.triggerVanishRipple?.({ q, r }, '#f43f5e');
      global.AudioSynth?.playClick?.();
      this.refreshSigils();
    } else {
      global.AudioSynth?.playCancel?.();
    }
    return erased;
  };

  proto.toggleArchAt = function(q, r) {
    const state = global.GameState;
    const arch = global.SpellArch;
    if (!state) return false;

    state.archZones = state.archZones || [];
    const existingIdx = state.archZones.findIndex(z => z.center && z.center.q === q && z.center.r === r);
    if (existingIdx !== -1) {
      state.archZones.splice(existingIdx, 1);
      global.AudioSynth?.playClick?.();
      this.refreshSigils();
      return true;
    }

    if (!state.board?.has(`${q},${r}`)) {
      global.AudioSynth?.playCancel?.();
      state.showToast?.('⚠️ Arch Plasma Nodes must be centered on a board tile.');
      return false;
    }

    const ench = arch?.getArchEnchantmentAt ? arch.getArchEnchantmentAt(q, r) : null;
    const flowerTiles = arch?.getFlowerTilesFor
      ? arch.getFlowerTilesFor(q, r)
      : (global.HexMath?.getFlowerTiles ? global.HexMath.getFlowerTiles(q, r) : []);

    state.archZones.push({
      id: `edit_arch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      center: { q, r }, tiles: [...flowerTiles], flowerTiles: [...flowerTiles],
      allZoneTiles: [...flowerTiles], enchantment: ench,
      radius: ench === 'weave' ? 2 : 1, color: '#f97316'
    });

    global.BoardRippleRenderer?.triggerPlacementRipple?.([{ q, r }], '#f97316', { profile: 'material', bands: 1 });
    if (global.AudioSynth?.playReward) global.AudioSynth.playReward('arch');
    else global.AudioSynth?.playPlace?.();
    this.refreshSigils();
    return true;
  };

  proto.activateSigilAtCursor = function() {
    const state = global.GameState;
    const res = global.SigilResolver;
    if (!state || !res) return false;

    let candId = state.selectedSigilId;
    if (!candId && state.sigilCursorVertex && global.HexMath) {
      const dorm = res.getDormantSigilAtCursor?.();
      const lock = res.getLockedSigilAtCursor?.();
      candId = dorm?.id || lock?.id || null;
    }

    if (candId && state.dormantSigilIds.has(candId)) {
      const ok = res.placeDormantSigil(candId, state.board);
      this.syncUI();
      global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
      global.BoardRenderer?.render?.();
      return ok;
    }

    if (candId && state.lockedSigilIds.has(candId)) {
      const cand = (state.allCandidates || []).find(c => c.id === candId);
      if (cand?.isWild) {
        const ok = res.cycleWildSpell(candId, state.board);
        this.syncUI();
        global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
        global.BoardRenderer?.render?.();
        return ok;
      }
    }

    global.AudioSynth?.playCancel?.();
    state.showToast?.('⚠️ Aim Sigil Cursor over a Dormant or Wild Sigil.');
    return false;
  };

  proto.refreshSigils = function() {
    const state = global.GameState;
    const res = global.SigilResolver;
    if (!state || !res) return;
    res.evaluateSigils(state.board);
    if (state.allCandidates.length > 0) {
      res.resolveInitialSigils(state.board, { animate: false });
    } else {
      state.dormantSigilIds.clear();
      state.lockedSigilIds.clear();
      res.syncBoardSigilTiles(state.board);
    }
    this.syncUI();
    global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
    global.BoardRenderer?.render?.();
  };

})(typeof window !== 'undefined' ? window : this);
