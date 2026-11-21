/**
 * @fileoverview cells/Turn_Manager_1.3.js - End-Turn Settlement & Start-Turn Pipeline
 * @description Separates End-Turn settlement (undo clear, tray replenish, turn/round rotation)
 * from the active player's Start-Turn pipeline (Phases B-E: disease growth, playfield spawns,
 * enchantment expirations, sigil re-evaluation, tray refill, and material spawn pulse)
 * (Part 4 of multi-part TurnManager cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const proto = global.TurnManagerClass?.prototype;
  if (!proto) {
    console.error('[Turn_Manager_1.3] TurnManagerClass is not defined. Ensure Turn_Manager_1.0.js is loaded first.');
    return;
  }

  /**
   * Finalizes the outgoing player's End-Turn (replenishes tray, rotates active player/round,
   * clears turn modifiers) and stops cleanly before the next player's Start-Turn.
   */
  proto.completeRoundAdvancement = function() {
    const state = global.GameState;
    if (!state) return;

    // Clear undo history and capture settled Post-End board + stats before rotating active player/round
    global.UndoManager?.clearTurnHistory?.();
    global.TurnLogManager?.capturePostEndSnapshot?.();

    const finalizeAdvancement = () => {
      if (!state.matchStarted && !state.gameOver) return;

      // Replenish queue, advance active player in roster, and increment round when wrapping to Player 1
      if (global.MatchOrchestrator?.advanceTurnAndRound) {
        const res = global.MatchOrchestrator.advanceTurnAndRound(state);
        if (res.matchEnded) {
          if (!state.isMatchEnding) this.isEndingTurn = false;
          this.isStartingTurn = false;
          state.turnPhase = 'MID_TURN';
          global.TurnLogManager?.finishLocalEndTurn?.({ nextPlayerIndex: state.activePlayerIndex, nextRound: state.round });
          global.NetworkP2PManager?.onTurnAdvancementComplete?.();
          state.syncUI();
          global.BoardRenderer?.render?.();
          return;
        }
      } else {
        state.round++;
        state.refillTray();
      }

      global.TurnLogManager?.finishLocalEndTurn?.({ nextPlayerIndex: state.activePlayerIndex, nextRound: state.round });

      // Lock mid-turn inputs at settled Post-End state until the active player runs startPlayerTurn()
      this.isEndingTurn = false;
      state.turnPhase = 'START_TURN';
      state.placedThisTurn = true;
      state.isMaterialSelected = false;
      state.selectedTrayIndex = 0;
      state.selectedRotation = 0;
      state.upDownAxisState = 0;
      state.placementCursor = { q: 0, r: 0 };
      state.inSigilStage = false;
      state.activeMaterialMod = null;
      state.roundBonusPoints = 0;
      state.pendingHeal = 0;

      // Retain un-resonated Arch pseudo-sigil zones on the board until they resonate
      if (global.SpellArch) { global.SpellArch.isPlaced = false; global.SpellArch.placedCenter = null; global.SpellArch.inArchMode = false; }
      global.SpellWeave?.reset?.();

      const net = global.NetworkP2PManager;
      const isOnline = !!net?.isConnected?.();
      const isLocalTurnNow = !isOnline || net.isLocalPlayersTurn();

      if (!isLocalTurnNow) {
        // Outgoing player stops at their settled Post-End board; incoming player runs Start-Turn on their device
        net.onTurnAdvancementComplete?.();
        state.syncUI();
        global.UICardsDeck?.syncMaterialsQueueColumn?.();
        global.UICardsDeck?.syncSpellbookColumn?.();
        global.BoardRenderer?.render?.();
        return;
      }

      // Local / same-device multi-seat: immediately run this player's Start-Turn phase
      this.startPlayerTurn();
    };

    const isMultiplayer = (state.players?.length || 1) > 1;
    if (isMultiplayer && state.matchStarted && !state.gameOver && !state.isMatchEnding) {
      this.isEndingTurn = true;
      state.placedThisTurn = true;
      state.isMaterialSelected = false;
      state.syncUI();
      global.BoardRenderer?.render?.();
      const h3Ms = global.H_TIMING?.THREE_BEATS_MS ?? (3000 * Math.pow(12, 8) / 1420405751.768);
      setTimeout(finalizeAdvancement, Math.round(h3Ms));
      return;
    }

    finalizeAdvancement();
  };

  /**
   * Executes the active player's Start-Turn phase (Phases B through E):
   * Disease growth, playfield spawns, enchantment expirations, sigil re-evaluation,
   * tray unlock, and active material spawn animation.
   */
  proto.startPlayerTurn = function() {
    const state = global.GameState;
    const resolver = global.SigilResolver;
    if (!state || state.gameOver || this.isStartingTurn) return;
    if (global.TurnLogManager?.hasPendingEntries?.() || global.TurnLogPlayer?.active) return;

    this.isEndingTurn = false;
    this.isStartingTurn = true;
    state.turnPhase = 'START_TURN';
    state.placedThisTurn = true;
    state.isMaterialSelected = false;
    state.syncUI();
    global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
    global.BoardRenderer?.render?.();

    const onSpawnsAndGrowthFinished = () => {
      const currentPl = state.currentPlayerId || 1, expiringTiles = [];
      if (state.board) {
        for (const tile of state.board.values()) {
          if (tile.fortified && (!tile.lockOwner || tile.lockOwner === currentPl)) expiringTiles.push({ q: tile.q, r: tile.r, color: '#c084fc', type: 'fortify' });
          if (tile.burned && (!tile.burnOwner || tile.burnOwner === currentPl)) expiringTiles.push({ q: tile.q, r: tile.r, color: '#ef4444', type: 'burn' });
          if (tile.woven && (!tile.weaveOwner || tile.weaveOwner === currentPl)) expiringTiles.push({ q: tile.q, r: tile.r, color: '#fde047', type: 'weave' });
          if (tile.phased && (!tile.phaseOwner || tile.phaseOwner === currentPl)) expiringTiles.push({ q: tile.q, r: tile.r, color: '#2563eb', type: 'phase' });
        }
      }

      // Phase C: Commit tile modifier resets
      const commitPhaseC = () => {
        if (state.board) {
          for (const tile of state.board.values()) {
            if (tile.fortified && (!tile.lockOwner || tile.lockOwner === currentPl)) { tile.fortified = false; tile.lockOwner = null; }
            tile.weaveStep = null;
            if (tile.burned && (!tile.burnOwner || tile.burnOwner === currentPl)) { tile.burned = false; tile.burnOwner = null; }
            if (tile.woven && (!tile.weaveOwner || tile.weaveOwner === currentPl)) { tile.woven = false; tile.weaveOwner = null; }
            if (tile.phased && (!tile.phaseOwner || tile.phaseOwner === currentPl)) {
              if (tile.underneath) {
                tile.color = tile.underneath.color; tile.sigilId = tile.underneath.sigilId || null;
                tile.fortified = tile.underneath.fortified || false; tile.lockOwner = tile.underneath.lockOwner || null;
                if (tile.underneath.plagueId) tile.plagueId = tile.underneath.plagueId;
                tile.underneath = null;
              } else { tile.color = null; tile.sigilId = null; }
              tile.phased = false; tile.phaseOwner = null;
            }
          }
        }
        state.fortifiedTiles?.clear?.();
        if (state.board) {
          for (const [key, t] of state.board.entries()) { if (t.fortified) state.fortifiedTiles?.add(key); }
        }
        state.weaveStep = 0; state.weavePlacedTiles = [];
        runPhaseD();
      };

      // Phase D: Re-evaluate sigils on refreshed board
      const runPhaseD = () => {
        const h3Sec = global.H_TIMING?.THREE_BEATS_SEC ?? (3 * Math.pow(12, 8) / 1420405751.768);
        if (resolver && state.board) {
          resolver.evaluateSigils(state.board);
          resolver.resolveInitialSigils(state.board, { onComplete: runPhaseE, durationSec: h3Sec });
        } else {
          runPhaseE();
        }
      };

      // Phase E: Refill tray, unlock controls into MID_TURN, and spawn active material for its owner
      const runPhaseE = () => {
        this.isStartingTurn = false;
        this.isEndingTurn = false;
        state.turnPhase = 'MID_TURN';
        state.refillTray();
        state.placedThisTurn = false;
        state.isMaterialSelected = true;
        state.selectedTrayIndex = 0;
        state.selectedRotation = 0;
        state.upDownAxisState = 0;
        state.placementCursor = { q: 0, r: 0 };

        const activeMat = state.getActiveMaterial ? state.getActiveMaterial() : null;
        if (activeMat && activeMat.activeCoords && global.BoardRippleRenderer?.playMaterialSpawnPulse) {
          const coordsWithColors = activeMat.activeCoords.map(([dq, dr], idx) => ({
            q: (state.placementCursor?.q || 0) + dq,
            r: (state.placementCursor?.r || 0) + dr,
            color: activeMat.colors[idx] || 'blue'
          }));
          const h3Sec = global.H_TIMING?.THREE_BEATS_SEC ?? (3 * Math.pow(12, 8) / 1420405751.768);
          global.BoardRippleRenderer.playMaterialSpawnPulse(coordsWithColors, () => {
            global.AudioSynth?.playMaterialBurst?.(4, 0, 0.5);
            state.syncUI();
            global.UICardsDeck?.syncSpellbookColumnWithGameState?.();
            global.BoardRenderer?.render?.();
          }, h3Sec);
        } else if (activeMat) {
          global.AudioSynth?.playMaterialBurst?.(4, 0, 0.5);
        }

        const pLabel = (state.playerCount > 1) ? `Player ${state.currentPlayerId || 1} • ` : '';
        state.showToast(`${pLabel}Round ${state.round} Begins`);
        state.syncUI();
        global.UICardsDeck?.syncMaterialsQueueColumn?.();
        global.UICardsDeck?.syncSpellbookColumn?.();
        global.UISidebars?.renderTrayUI?.();
        global.BoardRenderer?.render?.();
      };

      if (expiringTiles.length > 0 && global.BoardRippleRenderer?.playEnchantmentExpiration) {
        global.BoardRippleRenderer.playEnchantmentExpiration(expiringTiles, commitPhaseC);
      } else {
        commitPhaseC();
      }
    };

    // Phase B: Plague growth + Scheduled Playfield Blight & Luck
    const diseaseWave = global.ComponentDisease?.prepareTurnGrowth
      ? global.ComponentDisease.prepareTurnGrowth(state)
      : null;
    const spawnWave = (state.matchConfig && global.MatchOrchestrator?.prepareRoundSpawnsWave)
      ? global.MatchOrchestrator.prepareRoundSpawnsWave(state, state.round)
      : null;

    if (diseaseWave || spawnWave) {
      const combinedTasks = [...(diseaseWave?.tasks || []), ...(spawnWave?.tasks || [])];
      const finalizeWave = () => {
        diseaseWave?.finish?.();
        spawnWave?.finish?.();
        if (!state.matchConfig && global.ComponentDisease?.spawnBoardPlagueIfDue) {
          global.ComponentDisease.spawnBoardPlagueIfDue(state);
        }
        onSpawnsAndGrowthFinished();
      };
      if (combinedTasks.length > 0 && global.BoardRippleRenderer?.runStaggeredWave) {
        global.BoardRippleRenderer.runStaggeredWave(combinedTasks, finalizeWave);
      } else {
        combinedTasks.forEach(t => t(() => {}));
        finalizeWave();
      }
      return;
    }

    const runPlayfieldSpawns = () => {
      if (state.matchConfig && global.MatchOrchestrator) {
        global.MatchOrchestrator.spawnPlayfieldForRound(state, state.round, () => onSpawnsAndGrowthFinished());
      } else if (global.ComponentDisease?.spawnBoardPlagueIfDue) {
        global.ComponentDisease.spawnBoardPlagueIfDue(state);
        onSpawnsAndGrowthFinished();
      } else {
        onSpawnsAndGrowthFinished();
      }
    };

    if (global.ComponentDisease?.advanceTurnGrowth) {
      global.ComponentDisease.advanceTurnGrowth(state, () => runPlayfieldSpawns());
    } else {
      runPlayfieldSpawns();
    }
  };

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Turn_Manager_1.3', global.TurnManager);
})(typeof window !== 'undefined' ? window : this);
