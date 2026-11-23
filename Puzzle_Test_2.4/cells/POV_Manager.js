/**
 * @fileoverview cells/POV_Manager.js - Local POV Switching & Pre-Turn Snapshot Isolation
 * @description Manages povPlayerIndex across local/shared-device seats, auto-focuses POV on
 * local turn start, provides unified isPOVActiveTurn() / isSpectatingOrMismatched() guards,
 * and isolates the committed turn-start board snapshot when another local player inspects their
 * POV mid-turn without losing the active local player's in-progress turn state.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  function deepClone(obj) {
    return obj === undefined ? undefined : JSON.parse(JSON.stringify(obj));
  }

  class POVManagerClass {
    constructor() {
      this.povPlayerIndex = 0;
      this._turnStartSnapshot = null;
      this._liveTurnStash = null;
      this._isPeekingTurnStart = false;
      this._stashedActiveIndex = -1;
    }

    reset() {
      this.povPlayerIndex = 0;
      this._turnStartSnapshot = null;
      this._liveTurnStash = null;
      this._isPeekingTurnStart = false;
      this._stashedActiveIndex = -1;
      if (global.GameState) global.GameState.povPlayerIndex = 0;
    }

    isPeekingTurnStart() {
      return !!this._isPeekingTurnStart;
    }

    _isSeatLocal(seatIdx) {
      const net = global.NetworkP2PManager;
      if (!net || net.role === 'offline') return true;
      return !!net.isSeatLocal?.(seatIdx);
    }

    getPOVIndex() {
      const g = global.GameState;
      const count = Math.max(1, g?.playerCount || g?.players?.length || 1);
      let idx = this.povPlayerIndex;
      if (typeof idx !== 'number' || idx < 0 || idx >= count || !this._isSeatLocal(idx)) {
        const net = global.NetworkP2PManager;
        const fallback = (net && net.role !== 'offline' && net.getDefaultPausedPlayerIndex)
          ? net.getDefaultPausedPlayerIndex()
          : (g?.activePlayerIndex || 0);
        idx = Math.max(0, Math.min(count - 1, fallback));
        if (!this._isSeatLocal(idx)) {
          for (let i = 0; i < count; i++) {
            if (this._isSeatLocal(i)) { idx = i; break; }
          }
        }
        this.povPlayerIndex = idx;
      }
      if (g) g.povPlayerIndex = idx;
      return idx;
    }

    getPOVPlayer() {
      const g = global.GameState;
      if (!g) return null;
      const povIdx = this.getPOVIndex();
      const activeIdx = g.activePlayerIndex || 0;
      if (povIdx === activeIdx && !this._isPeekingTurnStart) {
        return {
          id: g.currentPlayerId || (activeIdx + 1),
          seatIndex: activeIdx,
          hp: g.hp ?? 12,
          maxHp: g.maxHp || 12,
          pendingDamage: (typeof g.getPendingDamage === 'function') ? g.getPendingDamage() : (g.pendingDamage || 0),
          pendingHeal: g.pendingHeal || 0,
          score: g.score || 0,
          points: g.getEstimatedPoints ? g.getEstimatedPoints() : (g.roundBonusPoints || 0),
          componentsBag: g.componentsBag || [],
          spellbook: g.spellbook || [],
          materialsTray: g.materialsTray || g.materialTray || []
        };
      }
      const p = g.players?.[povIdx];
      if (!p) return null;
      return {
        id: p.id || (povIdx + 1),
        seatIndex: povIdx,
        hp: p.hp ?? 12,
        maxHp: p.maxHp || 12,
        pendingDamage: 0,
        pendingHeal: p.pendingHeal || 0,
        score: p.score || 0,
        points: 0,
        componentsBag: p.componentsBag || [],
        spellbook: p.spellbook || [],
        materialsTray: p.materialsTray || []
      };
    }

    /** True only when match is active, active turn seat belongs to this device, and POV matches it. */
    isPOVActiveTurn() {
      const g = global.GameState;
      if (!g || !g.matchStarted) return true;
      const activeIdx = g.activePlayerIndex || 0;
      if (!this._isSeatLocal(activeIdx)) return false;
      return this.getPOVIndex() === activeIdx && !this._isPeekingTurnStart;
    }

    /** True when spectating a remote turn OR peeking at a different local player's POV mid-turn. */
    isSpectatingOrMismatched() {
      const g = global.GameState;
      if (!g || !g.matchStarted) return false;
      return !this.isPOVActiveTurn();
    }

    captureTurnStartSnapshot() {
      if (this._isPeekingTurnStart) return this._turnStartSnapshot;
      const lm = global.TurnLogManager;
      if (lm?.captureLogSnapshot) {
        this._turnStartSnapshot = lm.captureLogSnapshot('TURN_START');
      }
      return this._turnStartSnapshot;
    }

    /** Called when a turn settles into play (Round 1 activation, Start-Turn Phase E, or remote turn start). */
    onTurnStarted(activeIdx = null) {
      const g = global.GameState;
      const idx = (typeof activeIdx === 'number') ? activeIdx : (g?.activePlayerIndex || 0);
      this._liveTurnStash = null;
      this._isPeekingTurnStart = false;
      this._stashedActiveIndex = -1;

      if (this._isSeatLocal(idx)) {
        this.povPlayerIndex = idx;
        if (global.NetworkP2PManager) global.NetworkP2PManager.lastLocalActivePlayerIndex = idx;
      } else {
        this.getPOVIndex(); // Keeps last local POV seat
      }
      if (g) g.povPlayerIndex = this.povPlayerIndex;
      this.captureTurnStartSnapshot();
    }

    onMatchRestored(activeIdx = null) {
      this.onTurnStarted(activeIdx);
    }

    _stashActiveTurnState() {
      const g = global.GameState;
      const lm = global.TurnLogManager;
      if (!g || !lm?.captureLogSnapshot || this._isPeekingTurnStart) return false;

      global.MatchOrchestrator?.saveActivePlayerFromState?.(g);
      const boardSnap = lm.captureLogSnapshot('LIVE_MID_TURN');

      this._liveTurnStash = {
        boardSnap,
        flags: {
          placedThisTurn: !!g.placedThisTurn,
          isMaterialSelected: !!g.isMaterialSelected,
          selectedTrayIndex: g.selectedTrayIndex || 0,
          selectedRotation: g.selectedRotation || 0,
          upDownAxisState: g.upDownAxisState || 0,
          placementCursor: deepClone(g.placementCursor || { q: 0, r: 0 }),
          activeMaterialMod: deepClone(g.activeMaterialMod || null),
          roundBonusPoints: g.roundBonusPoints || 0,
          pendingHeal: g.pendingHeal || 0,
          activeDamageTiles: deepClone(g.activeDamageTiles || []),
          inSigilStage: !!g.inSigilStage,
          selectedSigilId: g.selectedSigilId || null,
          sigilCursorVertex: deepClone(g.sigilCursorVertex || null),
          weaveStep: g.weaveStep || 0,
          weavePlacedTiles: deepClone(g.weavePlacedTiles || []),
          score: g.score || 0,
          hp: g.hp ?? 12,
          inArchMode: !!g.inArchMode,
          inShiftMode: !!g.inShiftMode,
          inRitualMode: !!g.inRitualMode,
          inManifestMode: !!g.inManifestMode,
          inTeleportMode: !!g.inTeleportMode,
          inChargeMode: !!g.inChargeMode,
          inForesightMode: !!g.inForesightMode,
          inSpellOverflow: !!g.inSpellOverflow
        },
        spellManagers: {
          arch: !!global.SpellArch?.inArchMode,
          shift: !!global.SpellShift?.inShiftMode,
          ritual: !!global.SpellRitual?.inRitualMode,
          manifest: !!global.SpellManifest?.inManifestMode,
          teleport: !!global.SpellTeleport?.inTeleportMode,
          charge: !!global.SpellCharge?.inChargeMode,
          foresight: !!global.SpellForesight?.inForesightMode,
          weave: !!global.SpellWeave?.inWeaveMode
        }
      };
      this._stashedActiveIndex = g.activePlayerIndex || 0;
      this._isPeekingTurnStart = true;

      // Apply committed turn-start snapshot cleanly so peeking teammate sees pre-turn board
      if (this._turnStartSnapshot) {
        lm.applyLogSnapshot(this._turnStartSnapshot, { skipRender: true, skipStats: true });
      }
      g.isMaterialSelected = false;
      g.inSigilStage = false;
      g.activeDamageTiles = [];
      g.inArchMode = false; g.inShiftMode = false; g.inRitualMode = false;
      g.inManifestMode = false; g.inTeleportMode = false; g.inChargeMode = false;
      g.inForesightMode = false; g.inSpellOverflow = false;
      if (global.SpellArch) global.SpellArch.inArchMode = false;
      if (global.SpellShift) global.SpellShift.inShiftMode = false;
      if (global.SpellRitual) global.SpellRitual.inRitualMode = false;
      if (global.SpellManifest) global.SpellManifest.inManifestMode = false;
      if (global.SpellTeleport) global.SpellTeleport.inTeleportMode = false;
      if (global.SpellCharge) global.SpellCharge.inChargeMode = false;
      if (global.SpellForesight) global.SpellForesight.inForesightMode = false;
      if (global.SpellWeave) global.SpellWeave.inWeaveMode = false;
      return true;
    }

    _restoreStashedTurnState() {
      const g = global.GameState;
      const lm = global.TurnLogManager;
      if (!g || !this._isPeekingTurnStart || !this._liveTurnStash) {
        this._isPeekingTurnStart = false;
        this._liveTurnStash = null;
        return false;
      }
      const stash = this._liveTurnStash;
      this._liveTurnStash = null;
      this._isPeekingTurnStart = false;
      this._stashedActiveIndex = -1;

      if (stash.boardSnap && lm?.applyLogSnapshot) {
        lm.applyLogSnapshot(stash.boardSnap, { skipRender: true, skipStats: true });
      }
      const f = stash.flags || {};
      g.placedThisTurn = !!f.placedThisTurn;
      g.isMaterialSelected = !!f.isMaterialSelected;
      g.selectedTrayIndex = f.selectedTrayIndex || 0;
      g.selectedRotation = f.selectedRotation || 0;
      g.upDownAxisState = f.upDownAxisState || 0;
      g.placementCursor = deepClone(f.placementCursor || { q: 0, r: 0 });
      g.activeMaterialMod = deepClone(f.activeMaterialMod || null);
      g.roundBonusPoints = f.roundBonusPoints || 0;
      g.pendingHeal = f.pendingHeal || 0;
      g.activeDamageTiles = deepClone(f.activeDamageTiles || []);
      g.inSigilStage = !!f.inSigilStage;
      g.selectedSigilId = f.selectedSigilId || null;
      g.sigilCursorVertex = deepClone(f.sigilCursorVertex || null);
      g.weaveStep = f.weaveStep || 0;
      g.weavePlacedTiles = deepClone(f.weavePlacedTiles || []);
      g.score = f.score || 0;
      g.hp = f.hp ?? 12;
      g.inArchMode = !!f.inArchMode; g.inShiftMode = !!f.inShiftMode;
      g.inRitualMode = !!f.inRitualMode; g.inManifestMode = !!f.inManifestMode;
      g.inTeleportMode = !!f.inTeleportMode; g.inChargeMode = !!f.inChargeMode;
      g.inForesightMode = !!f.inForesightMode; g.inSpellOverflow = !!f.inSpellOverflow;

      const sm = stash.spellManagers || {};
      if (global.SpellArch) global.SpellArch.inArchMode = !!sm.arch;
      if (global.SpellShift) global.SpellShift.inShiftMode = !!sm.shift;
      if (global.SpellRitual) global.SpellRitual.inRitualMode = !!sm.ritual;
      if (global.SpellManifest) global.SpellManifest.inManifestMode = !!sm.manifest;
      if (global.SpellTeleport) global.SpellTeleport.inTeleportMode = !!sm.teleport;
      if (global.SpellCharge) global.SpellCharge.inChargeMode = !!sm.charge;
      if (global.SpellForesight) global.SpellForesight.inForesightMode = !!sm.foresight;
      if (global.SpellWeave) global.SpellWeave.inWeaveMode = !!sm.weave;
      return true;
    }

    /** Executes fn against the active player's real live mid-turn state (safe for autosaves while peeking). */
    withLiveTurnState(fn) {
      if (!this._isPeekingTurnStart) return fn();
      const savedPov = this.povPlayerIndex;
      this._restoreStashedTurnState();
      try {
        return fn();
      } finally {
        if (savedPov !== (global.GameState?.activePlayerIndex || 0)) {
          this._stashActiveTurnState();
          this.povPlayerIndex = savedPov;
        }
      }
    }

    /** Manually switches local POV to any local player seat (triggered from StatCanvas). */
    setPOV(seatIndex) {
      const g = global.GameState;
      if (!g || !g.matchStarted) return false;
      const count = Math.max(1, g.playerCount || g.players?.length || 1);
      const targetIdx = Math.max(0, Math.min(count - 1, Number(seatIndex) || 0));
      if (!this._isSeatLocal(targetIdx)) {
        global.AudioSynth?.playCancel?.();
        return false;
      }

      const activeIdx = g.activePlayerIndex || 0;
      const activeIsLocal = this._isSeatLocal(activeIdx);

      // Close open Spell Book / Seek peek drawer when changing POV so views stay clean
      if (global.UICardsDeck) global.UICardsDeck.spectatorSeekPeek = false;
      if (global.UISidebarDeck?.state?.rightSidebarActiveCol > 0) {
        global.UISidebarDeck.closeSpellbookColumn?.(true);
        global.UISidebarDeck.closeMaterialsColumn?.(true);
      }

      if (activeIsLocal) {
        if (targetIdx !== activeIdx && !this._isPeekingTurnStart) {
          this._stashActiveTurnState();
        } else if (targetIdx === activeIdx && this._isPeekingTurnStart) {
          this._restoreStashedTurnState();
        }
      }

      this.povPlayerIndex = targetIdx;
      g.povPlayerIndex = targetIdx;
      if (global.NetworkP2PManager) global.NetworkP2PManager.lastLocalActivePlayerIndex = targetIdx;

      g.syncUI?.();
      global.UICardsDeck?.syncSpellbookColumnWithGameState?.();
      global.UICardsDeck?.syncMaterialsQueueColumn?.();
      global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
      global.BoardRenderer?.render?.();
      const pName = g.players?.[targetIdx]?.name || `Player ${targetIdx + 1}`;
      g.showToast?.(`👁️ Viewing ${pName} POV`);
      return true;
    }
  }

  const instance = new POVManagerClass();
  global.POVManagerClass = POVManagerClass;
  global.POVManager = instance;
  global.ROLL_CALL = global.ROLL_CALL || new Map();
  global.ROLL_CALL.set('POV_Manager', instance);
})(typeof window !== 'undefined' ? window : this);
