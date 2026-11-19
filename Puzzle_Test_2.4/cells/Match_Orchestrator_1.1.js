/**
 * @fileoverview cells/Match_Orchestrator_1.1.js - Multi-Player Roster & Match Advancement Engine
 * @description Coordinates Match initialization, player theme management, GameState roster
 * serialization/deserialization, and turn/round progression across 1-6 players (Part 2 of
 * multi-part MatchOrchestrator cell).
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const PLAYER_THEMES = [
    { id: 1, name: 'Player 1', color: '#00f0ff', accent: '#38bdf8' },
    { id: 2, name: 'Player 2', color: '#b347ff', accent: '#c084fc' },
    { id: 3, name: 'Player 3', color: '#ffaa00', accent: '#fbbf24' },
    { id: 4, name: 'Player 4', color: '#00ff88', accent: '#34d399' },
    { id: 5, name: 'Player 5', color: '#ff2a55', accent: '#f87171' },
    { id: 6, name: 'Player 6', color: '#ff66cc', accent: '#f472b6' }
  ];

  const proto = global.MatchOrchestratorClass?.prototype;
  if (!proto) {
    console.error('[Match_Orchestrator_1.1] MatchOrchestratorClass is not defined. Ensure Match_Orchestrator_1.0.js is loaded first.');
    return;
  }

  /**
   * Initializes a new match from the Game Menu configuration, building the board,
   * Round Schedule, and revolving roster of 1-6 players.
   * @param {Object} state - GameState instance
   * @param {Object} config - Match configuration
   */
  proto.initMatch = function(state, config) {
    if (!state || !config) return;
    state.matchConfig = config;
    state.isEndless = !!config.isEndless || config.rounds === '∞';
    state.maxRounds = state.isEndless ? '∞' : (Number(config.rounds) || 12);
    state.totalRounds = state.maxRounds;
    state.playerCount = Math.max(1, Math.min(6, Number(config.playerCount) || 1));
    state.activePlayerIndex = 0;
    state.currentPlayerId = 1;
    state.round = 1;
    state.level = 1;
    state.gameOver = false;
    state.activeDamageTiles = [];
    state.archZones = [];
    state.fortifiedTiles?.clear?.();
    state.placedThisTurn = false;
    state.inSigilStage = false;
    state.activeMaterialMod = null;
    state.roundBonusPoints = 0;
    state.pendingHeal = 0;

    // 1. Configure Board Size (Radius 3..12) & reset Disease / Camera / Undo
    const targetRadius = Math.max(3, Math.min(12, Number(config.boardRadius) || 6));
    state.boardRadius = targetRadius;
    state.initBoard();
    state.matchStarted = true;
    state.isMatchStarting = true;
    state.isMatchEnding = false;
    state.placedThisTurn = true;
    state.isMaterialSelected = false;
    state.materialsTray = [];
    state.spellbook = [];
    state.players = [];
    global.ComponentDisease?.reset?.();
    global.UndoManager?.clearTurnHistory?.();
    if (global.BoardRenderer) {
      global.BoardRenderer.currentBoardRadius = targetRadius;
      global.BoardRenderer.resetCamera?.();
      if (typeof global.BoardRenderer.targetZoom === 'number') {
        global.BoardRenderer.zoom = global.BoardRenderer.targetZoom;
        global.BoardRenderer.panX = 0;
        global.BoardRenderer.panY = 0;
      }
    }

    // 2. Build Round Schedule (keep Tray & Spellbook hidden until Round 1 starts)
    this.buildRoundSchedule(config);
    state.syncUI();
    global.UICardsDeck?.syncMaterialsQueueColumn?.();
    global.UICardsDeck?.syncSpellbookColumn?.();

    const runRound0Operations = () => {
      if (!state.matchStarted) return;

      // 3. Round 0 Operations: Create Revolving Player Roster & roll Round 0 Material Luck/Blight
      const startingSpells = Math.max(0, Math.min(3, Number(config.startingSpells ?? 0)));
      state.players = [];
      for (let i = 0; i < state.playerCount; i++) {
        const theme = PLAYER_THEMES[i % PLAYER_THEMES.length];
        const spellbook = global.MaterialsData?.createDefaultSpellbook?.(false, startingSpells) || [];
        state.spellbook = spellbook;
        state.enablePermanentSpellbook();

        const tray = [];
        for (let m = 0; m < 6; m++) {
          const excluded = tray.map(item => item.id);
          const mat = this.createMatchMaterial(state, excluded, 0);
          if (mat) tray.push(mat);
        }

        state.players.push({
          id: theme.id, name: theme.name, color: theme.color, accent: theme.accent,
          hp: 12, maxHp: 12, pendingHeal: 0, score: 0, turnsPlayed: 0,
          materialsTray: tray, spellbook, componentsBag: Array(12).fill(null), overflowSpells: []
        });
      }
      // Keep active tray & spellbook hidden until Round 1 begins
      state.materialsTray = [];
      state.spellbook = [];
      state.isMaterialSelected = false;

      const startRound1Operations = () => {
        if (!state.matchStarted) return;
        // 4. Round 1 Begins: Reveal Player 1 roster (materials tray + spellbook) & roll Round 1 Playfield spawns
        this.loadPlayerIntoState(state, 0);
        state.placedThisTurn = true;
        state.isMaterialSelected = false;
        global.UICardsDeck?.syncMaterialsQueueColumn?.();
        global.UICardsDeck?.syncSpellbookColumn?.();
        state.syncUI();

        const finalizeRound1 = () => {
          if (!state.matchStarted) return;
          const finishActivation = () => {
            if (!state.matchStarted) return;
            state.isMatchStarting = false;
            state.placedThisTurn = false;
            state.isMaterialSelected = true;
            state.selectedTrayIndex = 0;
            state.selectedRotation = 0;
            state.upDownAxisState = 0;
            state.placementCursor = { q: 0, r: 0 };

            const activeMat = state.getActiveMaterial ? state.getActiveMaterial() : null;
            const h3Sec = global.H_TIMING?.THREE_BEATS_SEC ?? (3 * Math.pow(12, 8) / 1420405751.768);
            if (activeMat && activeMat.activeCoords && global.BoardRippleRenderer?.playMaterialSpawnPulse) {
              const coordsWithColors = activeMat.activeCoords.map(([dq, dr], idx) => ({
                q: dq, r: dr, color: activeMat.colors[idx] || 'blue'
              }));
              global.BoardRippleRenderer.playMaterialSpawnPulse(coordsWithColors, () => {
                global.AudioSynth?.playMaterialBurst?.(4, 0, 0.5);
                state.syncUI();
                global.UICardsDeck?.syncSpellbookColumnWithGameState?.();
                global.BoardRenderer?.render?.();
              }, h3Sec);
            } else if (activeMat) {
              global.AudioSynth?.playMaterialBurst?.(4, 0, 0.5);
            }

            state.syncUI();
            global.UICardsDeck?.syncMaterialsQueueColumn?.();
            global.UICardsDeck?.syncSpellbookColumn?.();
            global.BoardRenderer?.render?.();
          };

          const h3Sec = global.H_TIMING?.THREE_BEATS_SEC ?? (3 * Math.pow(12, 8) / 1420405751.768);
          state.evaluateSigils();
          if (global.SigilResolver && state.board) {
            global.SigilResolver.resolveInitialSigils(state.board, { durationSec: h3Sec, onComplete: finishActivation });
          } else {
            finishActivation();
          }
        };

        this.spawnPlayfieldForRound(state, 1, finalizeRound1, false);
      };

      this.spawnPlayfieldForRound(state, 0, startRound1Operations, false);
    };

    if (global.BoardRenderer?.startMatchStartAnim) {
      global.BoardRenderer.startMatchStartAnim(targetRadius, runRound0Operations);
      global.BoardRenderer?.render?.();
    } else {
      runRound0Operations();
    }
  };

  /**
   * Saves the active player's live GameState fields back into their roster entry.
   * @param {Object} state
   */
  proto.saveActivePlayerFromState = function(state) {
    if (!state?.players || state.players.length === 0) return;
    const p = state.players[state.activePlayerIndex % state.players.length];
    if (!p) return;
    p.hp = state.hp;
    p.maxHp = state.maxHp;
    p.pendingHeal = state.pendingHeal || 0;
    p.score = state.score || 0;
    p.materialsTray = state.materialsTray;
    p.spellbook = state.spellbook;
    p.componentsBag = state.componentsBag;
    p.overflowSpells = state.overflowSpells || [];
  };

  /**
   * Loads the specified player index from state.players into active GameState fields.
   * @param {Object} state
   * @param {number} playerIdx
   */
  proto.loadPlayerIntoState = function(state, playerIdx) {
    if (!state?.players || state.players.length === 0) return;
    const idx = playerIdx % state.players.length;
    const p = state.players[idx];
    if (!p) return;
    state.activePlayerIndex = idx;
    state.currentPlayerId = p.id;
    state.hp = p.hp;
    state.maxHp = p.maxHp || 12;
    state.pendingHeal = p.pendingHeal || 0;
    state.score = p.score || 0;
    state.materialsTray = p.materialsTray || [];
    state.spellbook = p.spellbook || [];
    state.enablePermanentSpellbook();
    state.componentsBag = p.componentsBag || Array(12).fill(null);
    state.overflowSpells = p.overflowSpells || [];
  };

  /**
   * Replenishes the active player's material queue at end of turn, rotates to the next
   * surviving player in the roster, increments the round when wrapping back to the first player,
   * and returns whether a new round began.
   * @param {Object} state
   * @returns {{ wrappedNewRound: boolean, matchEnded: boolean }}
   */
  proto.advanceTurnAndRound = function(state) {
    if (!state) return { wrappedNewRound: false, matchEnded: false };

    // 1. Replenish current player's conveyor queue for the round they just played
    if (state.placedThisTurn || state.unplacedMaterialDiscarded) {
      if (state.materialsTray[0] === null || state.unplacedMaterialDiscarded) {
        state.materialsTray.shift();
      }
      const first = state.materialsTray[0];
      const rest = state.materialsTray.slice(1).filter(Boolean);
      state.materialsTray = first ? [first, ...rest] : rest;
      this.refillPlayerTray(state, state.round);
    }
    state.unplacedMaterialDiscarded = false;

    // 2. Save active player's state and increment their turnsPlayed counter
    if (state.players && state.players.length > 0) {
      const n = state.players.length;
      const curP = state.players[state.activePlayerIndex % n];
      if (curP) curP.turnsPlayed = (curP.turnsPlayed || 0) + 1;
      this.saveActivePlayerFromState(state);

      // 3. Advance to next player with > 0 HP; skip downed players; end match if all skipped in a round
      let nextIdx = state.activePlayerIndex;
      let wrappedNewRound = false;
      let skippedCount = 0;
      const skippedNames = [];

      while (skippedCount < n) {
        nextIdx = (nextIdx + 1) % n;
        if (nextIdx === 0) {
          wrappedNewRound = true;
          state.round++;
          if (!state.isEndless && typeof state.maxRounds === 'number' && state.round > state.maxRounds) {
            state.round = state.maxRounds;
            state.gameOver = true;
            this.loadPlayerIntoState(state, 0);
            state.showToast(`🏆 MATCH COMPLETE! Final Round ${state.maxRounds} concluded.`);
            this.triggerMatchEndSequence(state, true);
            return { wrappedNewRound: true, matchEnded: true };
          }
        }
        const candidate = state.players[nextIdx];
        if (candidate && (candidate.hp || 0) > 0) {
          if (skippedNames.length > 0) state.showToast(`⏭️ Skipped (0 HP): ${skippedNames.join(', ')}`);
          this.loadPlayerIntoState(state, nextIdx);
          return { wrappedNewRound, matchEnded: false };
        }
        skippedCount++;
        if (candidate) skippedNames.push(candidate.name || `Player ${candidate.id}`);
      }

      state.gameOver = true;
      this.loadPlayerIntoState(state, 0);
      state.showToast('☠️ GAME OVER: All players eliminated (0 HP)!');
      this.triggerMatchEndSequence(state, false);
      return { wrappedNewRound, matchEnded: true };
    }

    // Fallback single-player progression when no roster is initialized
    if ((state.hp || 0) <= 0) {
      state.gameOver = true;
      state.showToast('☠️ GAME OVER: Vitality depleted (0 HP)!');
      this.triggerMatchEndSequence(state, false);
      return { wrappedNewRound: true, matchEnded: true };
    }
    state.round++;
    this.refillPlayerTray(state, state.round);
    return { wrappedNewRound: true, matchEnded: false };
  };

  proto.triggerMatchEndSequence = function(state, isVictory = false) {
    if (!state) return;
    state.isMatchEnding = true;
    state.placedThisTurn = true;
    state.isMaterialSelected = false;

    const finishEnd = () => {
      state.matchStarted = false;
      state.isMatchEnding = false;
      state.placedThisTurn = false;
      state.isMaterialSelected = false;
      state.activeDamageTiles = [];
      state.archZones = [];
      state.fortifiedTiles?.clear?.();
      state.inSigilStage = false;
      state.activeMaterialMod = null;
      state.materialsTray = [];
      state.spellbook = [];
      state.board?.clear?.();
      global.ComponentDisease?.reset?.();
      global.UndoManager?.clearTurnHistory?.();
      if (global.BoardRippleRenderer) {
        global.BoardRippleRenderer.activeRipples = [];
        global.BoardRippleRenderer.activeTileAnims?.clear?.();
        global.BoardRippleRenderer.materialSpawnAnim = null;
      }
      state.evaluateSigils?.();
      if (global.GameSettingsCanvas) global.GameSettingsCanvas.isMatchActive = false;
      if (global.TurnManager) global.TurnManager.isEndingTurn = false;
      state.syncUI();
      global.UICardsDeck?.syncMaterialsQueueColumn?.();
      global.UICardsDeck?.syncSpellbookColumn?.();
      global.BoardRenderer?.render?.();
      global.StatCanvas?.open?.();
    };

    if (global.BoardRenderer?.startMatchEndAnim) {
      global.BoardRenderer.startMatchEndAnim(state.boardRadius || 6, {
        useGSF: !!isVictory,
        onComplete: finishEnd
      });
      global.BoardRenderer?.render?.();
    } else {
      finishEnd();
    }
  };

  // Expose player themes
  if (global.MatchOrchestrator) {
    global.MatchOrchestrator.PLAYER_THEMES = PLAYER_THEMES;
  }
  global.MatchOrchestratorClass.PLAYER_THEMES = PLAYER_THEMES;

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Match_Orchestrator_1.1', global.MatchOrchestrator);

})(typeof window !== 'undefined' ? window : this);

