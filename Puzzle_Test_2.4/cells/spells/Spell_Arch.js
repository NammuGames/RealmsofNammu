/**
 * @fileoverview Spell_Arch.js - Storm Arch Spell (YYP) Module
 * @description Manages Storm Arch spell: provides a 7-tile hex flower zone cursor that moves freely
 * across the board, places/unplaces with Space, and finalizes with Enter into an active 7-tile alignment conduit.
 */

(function(global) {
  'use strict';

  class SpellArchClass {
    constructor() {
      this.formula = 'YYP';
      this.element = 'Storm';
      this.name = 'Arch';
      this.fullName = 'Storm Arch';

      this.inArchMode = false;
      this.archSpellIndex = null;
      this.zoneCursor = { q: 0, r: 0 };
      this.isPlaced = false;
      this.placedCenter = null;
      this.isFinalizing = false;
    }

    /**
     * Checks if all 7 tiles of the flower zone centered at (q, r) exist on the board.
     * @param {number} q
     * @param {number} r
     * @returns {boolean}
     */
    isZoneValidAt(q, r) {
      const state = global.GameState;
      return !!(state?.board && state.board.has(`${q},${r}`));
    }

    /**
     * Inspects the tile at (q, r) for active enchantments.
     * @param {number} q
     * @param {number} r
     * @returns {'lock'|'weave'|'phase'|'burn'|null}
     */
    getArchEnchantmentAt(q, r) {
      const state = global.GameState;
      const tile = state?.board?.get(`${q},${r}`);
      if (!tile) return null;
      if (tile.fortified) return 'lock';
      if (tile.woven) return 'weave';
      if (tile.phased) return 'phase';
      if (tile.burned) return 'burn';
      return null;
    }

    /**
     * Returns tile keys for flower zone. Expands to radius 2 (19 tiles) if center is Weave.
     * @param {number} centerQ
     * @param {number} centerR
     * @returns {Array<string>}
     */
    getFlowerTilesFor(centerQ, centerR) {
      const state = global.GameState;
      const ench = this.getArchEnchantmentAt(centerQ, centerR);
      const math = global.HexMath;
      if (ench === 'weave' && math && state?.board) {
        const tiles = [];
        for (const [tk] of state.board.entries()) {
          const [tq, tr] = tk.split(',').map(Number);
          const dist = math.hexDistanceBetween ? math.hexDistanceBetween(tq, tr, centerQ, centerR)
            : (math.hexDistance ? math.hexDistance(tq - centerQ, tr - centerR) : 999);
          if (dist <= 2) tiles.push(tk);
        }
        return tiles;
      }
      return math ? math.getFlowerTiles(centerQ, centerR) : [];
    }

    /**
     * Synchronizes an Arch zone's enchantment, radius, and flowerTiles with its live center tile.
     * @param {Object} archZone
     * @returns {Object}
     */
    syncArchZone(archZone) {
      if (!archZone?.center) return archZone;
      const ench = this.getArchEnchantmentAt(archZone.center.q, archZone.center.r);
      const bRad = global.GameState?.boardRadius || 6;
      const hasTiles = Array.isArray(archZone.flowerTiles) && archZone.flowerTiles.length > 0;
      if (hasTiles && archZone._syncedEnch === ench && archZone._syncedBoardRadius === bRad) return archZone;

      const flowerTiles = this.getFlowerTilesFor(archZone.center.q, archZone.center.r);
      archZone.enchantment = ench;
      archZone.radius = (ench === 'weave') ? 2 : 1;
      archZone.flowerTiles = flowerTiles.slice();
      archZone.tiles = flowerTiles.slice();
      archZone.allZoneTiles = flowerTiles.slice();
      archZone._syncedEnch = ench;
      archZone._syncedBoardRadius = bRad;
      return archZone;
    }

    /**
     * Synchronizes an array of Arch zones with their live center tiles.
     * @param {Array<Object>} archZones
     */
    syncArchZones(archZones = global.GameState?.archZones) {
      if (!Array.isArray(archZones)) return;
      for (let i = 0; i < archZones.length; i++) this.syncArchZone(archZones[i]);
    }

    /**
     * Determines whether a given sigil is within or adjacent to an Arch zone.
     * @param {Object} sigil - Sigil object with { id, tiles: ["q,r", ...] }
     * @param {Object} archZone - Arch zone object with { center, flowerTiles, allZoneTiles }
     * @returns {boolean} True if within or adjacent to the flower
     */
    isSigilInOrAdjacentToArch(sigil, archZone) {
      if (!sigil || !sigil.tiles || !archZone) return false;
      this.syncArchZone(archZone);
      const zoneSet = new Set(archZone.flowerTiles || archZone.allZoneTiles || []);

      for (const tk of sigil.tiles) {
        if (zoneSet.has(tk)) return true;
        const [q, r] = tk.split(',').map(Number);
        if (global.HexMath) {
          const neighbors = global.HexMath.getNeighbors(q, r).map(([nq, nr]) => `${nq},${nr}`);
          if (neighbors.some(nk => zoneSet.has(nk))) return true;
        }
      }
      return false;
    }

    /**
     * Determines whether two Arch zones touch or overlap.
     * @param {Object} zoneA
     * @param {Object} zoneB
     * @returns {boolean}
     */
    doArchZonesTouch(zoneA, zoneB) {
      if (!zoneA || !zoneB) return false;
      this.syncArchZone(zoneA);
      this.syncArchZone(zoneB);
      const setB = new Set(zoneB.flowerTiles || zoneB.allZoneTiles || []);
      const tilesA = zoneA.flowerTiles || zoneA.allZoneTiles || [];
      for (const tk of tilesA) {
        if (setB.has(tk)) return true;
        const [q, r] = tk.split(',').map(Number);
        if (global.HexMath) {
          const neighbors = global.HexMath.getNeighbors(q, r).map(([nq, nr]) => `${nq},${nr}`);
          if (neighbors.some(nk => setB.has(nk))) return true;
        }
      }
      return false;
    }

    /**
     * Returns a Set of sigil IDs that are within or adjacent to any active Arch zone.
     * @param {Array<Object>} activeSigils
     * @returns {Set<string>}
     */
    getSigilsInArch(activeSigils) {
      const state = global.GameState;
      const res = new Set();
      if (!state || !state.archZones || state.archZones.length === 0 || !activeSigils) {
        return res;
      }
      for (const zone of state.archZones) {
        for (const sigil of activeSigils) {
          if (this.isSigilInOrAdjacentToArch(sigil, zone)) {
            res.add(sigil.id);
          }
        }
      }
      return res;
    }

    /**
     * Initiates Storm Arch (YYP) sequence.
     * @param {number} spellIndex - Index in spellbook
     * @returns {boolean} True if started
     */
    start(spellIndex) {
      const state = global.GameState;
      if (!state || state.gameOver || state.inSpellOverflow) return false;

      this.inArchMode = true;
      state.inArchMode = true;
      this.archSpellIndex = spellIndex;
      state.archSpellIndex = spellIndex;
      this.isPlaced = false;
      this.placedCenter = null;
      this.isFinalizing = false;
      state.isMaterialSelected = false;
      global.BoardCursorRenderer?.startFlowerIn?.(true);

      this.zoneCursor = { q: 0, r: 0 };
      state.archZones = state.archZones || [];

      if (global.UISidebars) {
        if (global.UISidebars.finishRotationInstantly) {
          global.UISidebars.finishRotationInstantly();
        }
        global.UISidebars.navigateTo('arch');
        global.UISidebars.syncNavState();
        global.UISidebars.showToast('⚡ STORM ARCH: Position 7-tile flower with WASD, then press SPACE to place!');
      }
      return true;
    }

    /**
     * Context-sensitive directional navigation for the 7-tile flower Zone Cursor.
     * @param {'up'|'down'|'left'|'right'} dir 
     * @returns {boolean}
     */
    moveDirection(dir) {
      const state = global.GameState;
      if (!state || !this.inArchMode || this.isPlaced) return false;

      let nq = this.zoneCursor.q;
      let nr = this.zoneCursor.r;

      if (dir === 'left') {
        nq -= 1;
        nr += 1;
      } else if (dir === 'right') {
        nq += 1;
        nr -= 1;
      } else if (dir === 'up') {
        if (state.upDownAxisState === 0) nr += 1;
        else nq += 1;
        state.upDownAxisState = 1 - state.upDownAxisState;
      } else if (dir === 'down') {
        if (state.upDownAxisState === 0) nq -= 1;
        else nr -= 1;
        state.upDownAxisState = 1 - state.upDownAxisState;
      }

      if (global.HexMath && global.HexMath.hexDistance(nq, nr) <= (state.boardRadius || 6) + 1) {
        this.zoneCursor = { q: nq, r: nr };
        if (global.AudioSynth) global.AudioSynth.playClick();
        if (global.UISidebars) {
          global.UISidebars.syncNavState();
        }
        return true;
      }
      return false;
    }

    /**
     * Toggles placement of the 7-tile flower Arch zone at current cursor.
     * @returns {boolean} True if toggled
     */
    togglePlace() {
      const state = global.GameState;
      if (!state || !this.inArchMode) return false;

      if (!this.isPlaced) {
        if (!this.isZoneValidAt(this.zoneCursor.q, this.zoneCursor.r)) {
          if (global.AudioSynth) global.AudioSynth.playCancel();
          if (global.UISidebars) {
            global.UISidebars.showToast('⚠️ Center of Arch Zone must be on the board!');
          }
          return false;
        }
        this.isPlaced = true;
        this.placedCenter = { ...this.zoneCursor };
        if (global.AudioSynth) global.AudioSynth.playPlace();
        if (global.SigilResolver && state.board) {
          global.SigilResolver.syncBoardSigilTiles(state.board);
        }
        if (global.UISidebars) {
          global.UISidebars.syncNavState();
          global.UISidebars.updateTelemetry();
          global.UISidebars.updateHpBar();
          const ench = this.getArchEnchantmentAt(this.zoneCursor.q, this.zoneCursor.r);
          const tag = ench === 'lock' ? '🔒 LOCK' : ench === 'weave' ? '🌾 WEAVE (Radius 2)' : ench === 'phase' ? '💧 PHASE' : ench === 'burn' ? '🔥 BURN' : '7-Tile';
          global.UISidebars.showToast(`⚡ ${tag} Arch Zone placed! Press ENTER to finalize, or SPACE to unplace.`);
        }
        if (global.BoardRenderer?.render) global.BoardRenderer.render();
        return true;
      } else {
        this.isPlaced = false;
        this.placedCenter = null;
        if (global.AudioSynth) global.AudioSynth.playClick();
        if (global.SigilResolver && state.board) {
          global.SigilResolver.syncBoardSigilTiles(state.board);
        }
        if (global.UISidebars) {
          global.UISidebars.syncNavState();
          global.UISidebars.updateTelemetry();
          global.UISidebars.updateHpBar();
          global.UISidebars.showToast('Arch zone unplaced. Move with WASD, then press SPACE to place.');
        }
        if (global.BoardRenderer?.render) global.BoardRenderer.render();
        return true;
      }
    }

    toggleSigilSelect() {
      return this.togglePlace();
    }

    triggerAction() {
      return this.togglePlace();
    }

    handleUndo() {
      if (this.isPlaced) return this.togglePlace();
      return this.cancel();
    }

    updatePreview() {
      if (global.UISidebars) {
        global.UISidebars.syncNavState();
      }
    }

    /**
     * Finalizes the Arch spell, creating an active 7-tile Arch Zone on the board.
     * @returns {boolean} True if successfully finalized
     */
    finalizeArch() {
      const state = global.GameState;
      if (!state || !this.inArchMode || this.isFinalizing) return false;

      if (!this.isPlaced || !this.placedCenter) {
        if (global.AudioSynth) global.AudioSynth.playCancel();
        if (global.UISidebars) global.UISidebars.showToast('⚠️ Press SPACE to place the 7-Tile Arch Zone first before finalizing!');
        return false;
      }

      const center = { ...this.placedCenter };
      if (global.BoardRippleRenderer?.triggerPlacementRipple) {
        global.BoardRippleRenderer.triggerPlacementRipple([{ q: center.q, r: center.r }], '#f97316', { profile: 'material', bands: 1 });
      }
      global.BoardCursorRenderer?.startFlowerOut?.({ confirmed: true });

      this.isFinalizing = true;
      try {
        const ench = this.getArchEnchantmentAt(center.q, center.r);
        const flowerTiles = this.getFlowerTilesFor(center.q, center.r);

        const archZone = {
          id: `arch_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          center: center, tiles: [...flowerTiles], flowerTiles: [...flowerTiles],
          allZoneTiles: [...flowerTiles], enchantment: ench,
          radius: ench === 'weave' ? 2 : 1, color: '#f97316'
        };
        state.archZones = state.archZones || [];
        state.archZones.push(archZone);

        const archIdx = this.archSpellIndex;
        const spellData = (archIdx !== null && archIdx < state.spellbook.length)
          ? { ...state.spellbook[archIdx] }
          : { formula: 'YYP', element: 'Storm', name: 'Arch', usableRound: state.round };

        if (archIdx !== null && archIdx < state.spellbook.length) state.spellbook.splice(archIdx, 1);
        else {
          const found = state.spellbook.findIndex(s => s.formula === 'YYP' || s.name === 'Arch');
          if (found !== -1) state.spellbook.splice(found, 1);
        }

        state.recordSpellCast({
          type: 'arch', name: 'Arch', formula: 'YYP', spell: 'Arch',
          archZoneId: archZone.id, archZone: archZone,
          spellbookIndex: (archIdx !== null) ? archIdx : 0, spellData
        });

        if (global.AudioSynth) global.AudioSynth.playReward('arch');

        if (global.SigilResolver && state.board) {
          if (state.placedThisTurn) global.SigilResolver.restoreSigilStageIfPlaced(state.board);
          else { global.SigilResolver.evaluateSigils(state.board); global.SigilResolver.resolveInitialSigils(state.board); }
        } else if (global.SigilEngine && state.activeSigils && global.SigilResolver) {
          global.SigilResolver.resonantSigils = global.SigilEngine.computeResonance(state.activeSigils);
          global.SigilResolver.resonantPairs = global.SigilEngine.getAdjacentPairs();
        }

        this.inArchMode = false; state.inArchMode = false;
        this.archSpellIndex = null; state.archSpellIndex = null;
        this.isPlaced = false; this.placedCenter = null;
        if (!state.placedThisTurn) state.isMaterialSelected = true;

        if (global.UISidebars) {
          global.UISidebars.showToast('⚡ ARCH FINALIZED: 7-Tile alignment conduit active on board!');
          global.UISidebars.resetToFace('materials', 'backward');
          global.UISidebars.renderTrayUI(); global.UISidebars.renderSpellbookUI();
          global.UISidebars.syncNavState(); global.UISidebars.updateTelemetry(); global.UISidebars.updateHpBar();
        }

        global.UISidebarDeck?.openSpellbookColumn(true);
        return true;
      } finally {
        this.isFinalizing = false;
      }
    }

    /**
     * Cancels Arch mode without consuming the spell.
     */
    cancel() {
      const state = global.GameState;
      global.BoardCursorRenderer?.startFlowerOut?.();
      this.inArchMode = false;
      if (state) {
        state.inArchMode = false;
        this.archSpellIndex = null;
        state.archSpellIndex = null;
        if (!state.placedThisTurn) state.isMaterialSelected = true;
      }
      this.isPlaced = false; this.placedCenter = null; this.isFinalizing = false;

      if (global.AudioSynth) global.AudioSynth.playClick();
      if (global.SigilResolver && state?.board) {
        global.SigilResolver.syncBoardSigilTiles(state.board);
      }
      if (global.UISidebars) {
        global.UISidebars.showToast('Arch spell cancelled.');
        global.UISidebars.syncNavState();
        global.UISidebars.updateTelemetry();
        global.UISidebars.updateHpBar();
      }
      global.UISidebarDeck?.openSpellbookColumn(false);
      if (global.BoardRenderer?.render) global.BoardRenderer.render();
      return true;
    }

    /**
     * Undoes a finalized Arch spell during the active round.
     * @param {Object} entry - Spell undo entry
     * @returns {boolean}
     */
    undo(entry) {
      const state = global.GameState;
      if (!state || !entry) return false;

      if (state.archZones && entry.archZoneId) {
        state.archZones = state.archZones.filter(z => z.id !== entry.archZoneId);
      }

      const restoredSpell = entry.spellData || {
        formula: 'YYP', element: 'Storm', name: 'Arch',
        desc: 'Creates a 7-tile flower alignment conduit linking all within and adjacent sigils.',
        usableRound: state.round
      };
      const insertIdx = (entry.spellbookIndex !== undefined && entry.spellbookIndex <= state.spellbook.length)
        ? entry.spellbookIndex : state.spellbook.length;
      state.spellbook.splice(insertIdx, 0, restoredSpell);

      if (global.SigilResolver && state.board) {
        if (state.placedThisTurn) global.SigilResolver.restoreSigilStageIfPlaced(state.board, { animate: false });
        else { global.SigilResolver.evaluateSigils(state.board); global.SigilResolver.resolveInitialSigils(state.board, { animate: false }); }
      } else if (global.SigilEngine && state.activeSigils && global.SigilResolver) {
        global.SigilResolver.resonantSigils = global.SigilEngine.computeResonance(state.activeSigils);
        global.SigilResolver.resonantPairs = global.SigilEngine.getAdjacentPairs();
      }

      const c = entry.archZone?.center || { q: 0, r: 0 };
      this.inArchMode = true; state.inArchMode = true;
      this.archSpellIndex = insertIdx; state.archSpellIndex = insertIdx;
      this.isPlaced = true; this.placedCenter = { ...c }; this.zoneCursor = { ...c };
      state.isMaterialSelected = false;
      global.UISidebarDeck?.closeSpellbookColumn();
      if (global.AudioSynth) global.AudioSynth.playClick();
      if (global.UISidebars) {
        global.UISidebars.showToast('⚡ Arch unconfirmed: Press SPACE or RETURN to unplace flower.');
        global.UISidebars.renderTrayUI(); global.UISidebars.renderSpellbookUI();
        global.UISidebars.syncNavState(); global.UISidebars.updateHpBar();
      }
      return true;
    }

    renderFace() {
      // Native Canvas 2D scene graph handles visual feedback
    }
  }

  const spellArchInstance = new SpellArchClass();

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Spell_Arch', spellArchInstance);
  global.SpellArch = spellArchInstance;

})(window);
