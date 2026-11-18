/**
 * @fileoverview cells/Match_Orchestrator_1.0.js - Match Schedule, Vectors & Board Spawning Engine
 * @description Coordinates lightweight non-exponential Round Schedule evaluation for Playfield and
 * Material Luck/Blight vectors, procedural Material generation with parity rules, and sequential
 * concentric ripple board spawns (Part 1 of multi-part MatchOrchestrator cell).
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const BASE_COLORS = ['blue', 'red', 'purple', 'yellow'];
  const RANDOM_LUCK_POOL = ['blue', 'red', 'purple', 'yellow', 'ether'];

  class MatchOrchestratorClass {
    constructor() {
      this.scheduleCache = new Map(); // round -> { playfieldLuck, materialLuck, playfieldBlight, materialBlight }
    }

    /**
     * Evaluates a vector list of Boons or Strains for a specific round and returns
     * the flat array of active spawn percentages scheduled for that round.
     * Duplicate (dupInterval > 0) adds linear shifted series (start + k * dupInterval)
     * without duplicating the duplicator itself (zero exponential growth).
     * @param {Array<Object>} items
     * @param {number} round
     * @param {number|string} maxRounds
     * @param {boolean} isEndless
     * @returns {Array<number>}
     */
    evaluateVectorForRound(items, round, maxRounds = 12, isEndless = false) {
      if (!Array.isArray(items) || round < 0) return [];
      const chances = [];
      const numericMax = (isEndless || maxRounds === '∞') ? Infinity : (Number(maxRounds) || 432);

      for (const item of items) {
        if (!item) continue;
        const chance = Number(item.chance || 0);
        if (chance <= 0) continue;

        const start = Number(item.turnStart ?? 1);
        const interval = Math.max(1, Number(item.turnInterval || 1));
        const baseEnd = item.isEndOfMatch ? numericMax : Number(item.turnEnd ?? 24);
        const dup = Math.max(0, Number(item.dupInterval || 0));
        const spawnCount = Math.max(1, Math.min(24, Number(item.spawnCount ?? 1) || 1));

        // k = 0 is the original series; k = 1, 2, ... are linear shifted duplicate series
        for (let k = 0; ; k++) {
          const offset = k * dup;
          const sStart = start + offset;
          if (sStart > round) break;

          const sEnd = item.isEndOfMatch ? numericMax : (baseEnd + offset);
          if (round >= sStart && round <= sEnd && ((round - sStart) % interval === 0)) {
            for (let s = 0; s < spawnCount; s++) {
              chances.push(chance);
            }
          }

          if (dup === 0) break;
        }
      }
      return chances;
    }

    /** Builds and caches the Round Schedule for fast O(1) lookup per round. */
    buildRoundSchedule(config) {
      this.scheduleCache.clear();
      if (!config) return;
      const isEndless = !!config.isEndless || config.rounds === '∞';
      const maxR = isEndless ? 432 : Math.max(12, Number(config.rounds) || 12);
      for (let r = 0; r <= maxR; r++) this.getRoundScheduleEntry({ matchConfig: config }, r);
    }

    /** Retrieves (or computes on demand for Endless mode) the Round Schedule entry for a round. */
    getRoundScheduleEntry(state, round) {
      if (this.scheduleCache.has(round)) return this.scheduleCache.get(round);
      const cfg = state?.matchConfig;
      if (!cfg) return { playfieldLuck: [], materialLuck: [], playfieldBlight: [], materialBlight: [] };
      const isEndless = !!cfg.isEndless || cfg.rounds === '∞';
      const maxRounds = cfg.rounds;
      const luckP = cfg.luckPreset || {}, blightP = cfg.blightPreset || {};

      const entry = {
        playfieldLuck: this.evaluateVectorForRound(luckP.playfieldItems, round, maxRounds, isEndless),
        materialLuck: this.evaluateVectorForRound(luckP.materialItems, round, maxRounds, isEndless),
        playfieldBlight: this.evaluateVectorForRound(blightP.playfieldItems, round, maxRounds, isEndless),
        materialBlight: this.evaluateVectorForRound(blightP.materialItems, round, maxRounds, isEndless)
      };
      this.scheduleCache.set(round, entry);
      return entry;
    }

    /** Selects a spawned Luck component based on the active Luck Composition setting. */
    pickLuckComponent(matchConfig) {
      if (matchConfig?.luckComposition === 'Random') {
        return RANDOM_LUCK_POOL[Math.floor(Math.random() * RANDOM_LUCK_POOL.length)];
      }
      return 'ether';
    }

    /**
     * Generates a single Material using the active Match Settings:
     * - Material Composition: 'Even' (1 of each color) vs 'Random' (4 independent random base colors)
     * - Material Luck & Material Blight per-component rolls (Luck rolls first and cannot be overwritten by Disease).
     * @param {Object} state - GameState instance
     * @param {Array<string>} excludedShapeIds - Currently queued shape IDs to avoid duplicates
     * @param {number|null} roundOverride - Optional round number override (e.g., 0 for Turn 0 initial queue)
     * @returns {Object} Generated Material object
     */
    createMatchMaterial(state, excludedShapeIds = [], roundOverride = null) {
      const shapes = global.MaterialsData?.TETRAHEX_SHAPES || [];
      if (shapes.length === 0) return null;

      const cfg = state?.matchConfig;
      if (!cfg) {
        const allowSpecials = ((state?.totalMaterialsSpawned || 0) >= 6);
        return global.MaterialsData.createRandomMaterialExcluding(excludedShapeIds, allowSpecials);
      }

      const available = shapes.filter(s => !excludedShapeIds.includes(s.id));
      const pool = available.length > 0 ? available : shapes;
      const shapeDef = pool[Math.floor(Math.random() * pool.length)];

      // 1. Base Material Composition ('Even' vs 'Random')
      let baseColors;
      if (cfg.materialComposition === 'Random') {
        baseColors = [0, 1, 2, 3].map(() => BASE_COLORS[Math.floor(Math.random() * BASE_COLORS.length)]);
      } else {
        baseColors = [...BASE_COLORS].sort(() => Math.random() - 0.5);
      }

      const colors = [...baseColors];
      const targetRound = (roundOverride !== null && roundOverride !== undefined)
        ? roundOverride
        : (state.round ?? 1);
      const sched = this.getRoundScheduleEntry(state, targetRound);

      // 2. Per-Component Spawning: Luck rolls first, Disease rolls second (cannot overwrite Luck)
      for (let i = 0; i < 4; i++) {
        let luckReplaced = false;
        for (const pct of sched.materialLuck) {
          if (Math.random() * 100 < pct) {
            colors[i] = this.pickLuckComponent(cfg);
            luckReplaced = true;
            break;
          }
        }
        if (!luckReplaced) {
          for (const pct of sched.materialBlight) {
            if (Math.random() * 100 < pct) {
              colors[i] = 'disease';
              break;
            }
          }
        }
      }

      return {
        id: shapeDef.id,
        name: shapeDef.name,
        coords: JSON.parse(JSON.stringify(shapeDef.coords)),
        colors,
        originalColors: [...baseColors]
      };
    }

    /**
     * Refills the active player's material queue up to 6 slots using createMatchMaterial.
     * Supports Turn 0 (24 components), normal turn replenishment (4 components), and Foresight refills.
     * @param {Object} state - GameState instance
     * @param {number|null} roundOverride - Round number to evaluate Material Luck/Blight against
     */
    refillPlayerTray(state, roundOverride = null) {
      if (!state || !global.MaterialsData) return;
      while (state.materialsTray.length < 6) {
        const currentShapes = state.materialsTray.map(m => m?.id).filter(Boolean);
        const newMat = this.createMatchMaterial(state, currentShapes, roundOverride);
        if (!newMat) break;
        state.materialsTray.push(newMat);
        state.totalMaterialsSpawned = (state.totalMaterialsSpawned || 0) + 1;
      }
      state.selectedTrayIndex = 0;
    }

    /**
     * Executes Playfield Luck and Playfield Blight spawns on the board for the given round.
     * Triggered every turn (once per player) of the affected round.
     * @param {Object} state - GameState instance
     */
    getVacantBoardTiles(state) {
      const list = [];
      if (!state?.board) return list;
      for (const [key, tile] of state.board.entries()) {
        if (!tile.color && !tile.coveredComponent && !tile.burned && !tile.phased && !tile.fortified && !tile.woven && !tile.plagueId) {
          list.push({ q: tile.q, r: tile.r, key, tile });
        }
      }
      return list;
    }

    spawnComponentRandomly(state, color, round = state?.round || 1) {
      const vacant = this.getVacantBoardTiles(state);
      if (vacant.length === 0) return null;
      const picked = vacant[Math.floor(Math.random() * vacant.length)];
      if (color === 'disease') {
        const shape = global.ComponentDisease?.initPlagueShape?.(picked.q, picked.r, true, round);
        global.BoardRippleRenderer?.triggerPlacementRipple([{ q: picked.q, r: picked.r }], 'disease', { profile: 'disease', bands: 1 });
        return { q: picked.q, r: picked.r, key: picked.key, color: 'disease', plagueId: shape?.id || null };
      }
      picked.tile.color = color;
      picked.tile.sigilId = null;
      global.BoardRippleRenderer?.triggerPlacementRipple([{ q: picked.q, r: picked.r }], color, { profile: 'single', bands: 1 });
      return { q: picked.q, r: picked.r, key: picked.key, color, plagueId: null };
    }

    scatterUnplacedMaterial(state, onComplete) {
      if (!state || state.placedThisTurn) { onComplete?.(); return; }
      const activeMat = (state.getActiveMaterial ? state.getActiveMaterial() : null) || state.materialsTray?.[0];
      if (!activeMat || !Array.isArray(activeMat.colors) || activeMat.colors.length === 0) {
        onComplete?.(); return;
      }

      // Collect unplaced material component positions from current placement cursor
      const cursor = state.placementCursor || { q: 0, r: 0 };
      const placedWeave = (global.SpellWeave && global.SpellWeave.placedTiles) || state.weavePlacedTiles || [];
      let matComponents = [];
      if (state.activeMaterialMod === 'weave' && placedWeave.length > 0) {
        placedWeave.forEach(pt => matComponents.push({ q: pt.q, r: pt.r, color: pt.color }));
        if (placedWeave.length < activeMat.colors.length) {
          const cName = activeMat.colors[placedWeave.length] || activeMat.colors[0];
          matComponents.push({ q: cursor.q, r: cursor.r, color: cName });
        }
      } else {
        const coords = activeMat.activeCoords || activeMat.coords || [[0, 0]];
        matComponents = coords.map(([dq, dr], idx) => ({
          q: cursor.q + dq,
          r: cursor.r + dr,
          color: activeMat.colors[idx] || 'disease'
        }));
      }

      const doScatter = () => {
        global.AudioSynth?.playMaterialBurst?.(4, 0, 0.5);
        state.materialsTray[0] = null;
        state.unplacedMaterialDiscarded = true;
        state.isMaterialSelected = false;
        state.placedThisTurn = true;
        if (global.SpellWeave?.reset) global.SpellWeave.reset();

        const vacant = this.getVacantBoardTiles(state);
        const chosen = global.BoardRippleRenderer?.pickAndOrderVacantTiles
          ? global.BoardRippleRenderer.pickAndOrderVacantTiles(vacant, activeMat.colors.length)
          : vacant.slice(0, activeMat.colors.length);
        if (chosen.length === 0) { onComplete?.(); return; }

        const assigned = chosen.map((v, i) => ({ ...v, color: activeMat.colors[i] }));
        let count = 0, expandedCount = 0, seqDone = false;
        const finish = () => {
          if (count > 0) {
            state.evaluateSigils?.();
            state.showToast(`🎲 Unplaced Material scattered: ${count} component(s) spawned onto board!`);
            global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
          }
          onComplete?.();
        };
        const tryFinish = () => { if (seqDone && expandedCount >= assigned.length) finish(); };
        const h3Sec = global.H_TIMING?.THREE_BEATS_SEC ?? (3 * Math.pow(12, 8) / 1420405751.768);
        const hHalfSec = global.H_TIMING?.HALF_BEAT_SEC ?? (h3Sec / 6);
        const placeOne = (item) => {
          const isDisease = item.color === 'disease';
          if (isDisease) {
            global.ComponentDisease?.initPlagueShape?.(item.q, item.r, true, state.round);
          } else {
            item.tile.color = item.color;
            item.tile.sigilId = null;
          }
          const onCompDone = () => {
            if (isDisease) {
              global.AudioSynth?.playDiseaseGrow ? global.AudioSynth.playDiseaseGrow() : global.AudioSynth?.playClick?.();
            } else if (global.AudioSynth?._playSet) {
              global.AudioSynth._playSet('MVB', Math.floor(Math.random() * 12));
            } else {
              global.AudioSynth?.playPlace ? global.AudioSynth.playPlace() : global.AudioSynth?.playClick?.();
            }
            expandedCount++;
            tryFinish();
          };
          count++;
          if (global.BoardRippleRenderer?.playSpawnAnimation) {
            global.BoardRippleRenderer.playSpawnAnimation(item, item.color, onCompDone, h3Sec, {
              profile: isDisease ? 'disease' : 'scatter',
              rippleOffset: -hHalfSec
            });
          } else {
            onCompDone();
            global.BoardRippleRenderer?.triggerPlacementRipple([{ q: item.q, r: item.r }], item.color, { profile: 'scatter', bands: 1 });
          }
          global.BoardRenderer?.render?.();
        };
        if (global.BoardRippleRenderer?.runSequentialPlacement) {
          const hHalfMs = global.H_TIMING?.HALF_BEAT_MS ?? (hHalfSec * 1000);
          global.BoardRippleRenderer.runSequentialPlacement(assigned, placeOne, () => { seqDone = true; tryFinish(); }, hHalfMs);
        } else {
          assigned.forEach(placeOne);
          seqDone = true;
          tryFinish();
        }
      };

      if (global.BoardRippleRenderer?.playMaterialDespawnPulse) {
        const h3Sec = global.H_TIMING?.THREE_BEATS_SEC ?? (3 * Math.pow(12, 8) / 1420405751.768);
        global.BoardRippleRenderer.playMaterialDespawnPulse(matComponents, doScatter, h3Sec);
      } else {
        doScatter();
      }
    }

    prepareRoundSpawnsWave(state, round) {
      const empty = { tasks: [], finish: () => ({ luckCount: 0, blightCount: 0, spawnedTotal: 0 }) };
      if (!state || !state.board || !state.matchConfig) return empty;
      const sched = this.getRoundScheduleEntry(state, round);
      if (sched.playfieldLuck.length === 0 && sched.playfieldBlight.length === 0) return empty;

      const blightPlanned = [];
      for (const pct of sched.playfieldBlight) {
        if (Math.random() * 100 < pct) blightPlanned.push({ type: 'blight', color: 'disease' });
      }
      const luckPlanned = [];
      for (const pct of sched.playfieldLuck) {
        if (Math.random() * 100 < pct) luckPlanned.push({ type: 'luck', color: this.pickLuckComponent(state.matchConfig) });
      }
      if (blightPlanned.length === 0 && luckPlanned.length === 0) return empty;

      let luckCount = 0, blightCount = 0;
      const finish = () => {
        if (luckCount > 0 || blightCount > 0) {
          const parts = [];
          if (luckCount > 0) parts.push(`✦ ${luckCount} Luck`);
          if (blightCount > 0) parts.push(`☣️ ${blightCount} Blight`);
          state.showToast(`${parts.join(' & ')} spawned on the Playfield!`);
          state.evaluateSigils?.();
          global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
        }
        return { luckCount, blightCount, spawnedTotal: luckCount + blightCount };
      };

      const spawnOne = (it, stepDone, immediate = false) => {
        const isDisease = it.color === 'disease';
        if (isDisease) {
          global.ComponentDisease?.initPlagueShape?.(it.q, it.r, true, round);
          blightCount++;
        } else {
          it.tile.color = it.color;
          it.tile.sigilId = null;
          luckCount++;
        }
        if (immediate) { stepDone?.(); return; }
        const playSfx = () => isDisease ? global.AudioSynth?.playDiseaseGrow?.() : global.AudioSynth?.playPlace?.();
        const prof = isDisease ? 'disease' : (it.color === 'ether' ? 'ether' : 'single');
        if (global.BoardRippleRenderer?.playSpawnAnimation) {
          global.BoardRippleRenderer.playSpawnAnimation({ q: it.q, r: it.r }, it.color, () => {
            playSfx(); global.BoardRenderer?.render?.(); stepDone?.();
          });
        } else {
          global.BoardRippleRenderer?.triggerPlacementRipple([{ q: it.q, r: it.r }], it.color, { profile: prof, bands: 1 });
          playSfx(); global.BoardRenderer?.render?.(); stepDone?.();
        }
      };

      const makeGroupTasks = (planned, immediate = false) => {
        let chosen = null;
        return planned.map((_, idx) => (stepDone) => {
          if (!chosen) {
            const v = this.getVacantBoardTiles(state);
            const c = global.BoardRippleRenderer?.pickAndOrderVacantTiles
              ? global.BoardRippleRenderer.pickAndOrderVacantTiles(v, planned.length)
              : v.slice(0, planned.length);
            chosen = c.map((tile, i) => ({ ...tile, ...planned[i] }));
          }
          const item = chosen[idx];
          if (!item) { stepDone?.(); return; }
          spawnOne(item, stepDone, immediate);
        });
      };

      const tasks = [...makeGroupTasks(blightPlanned), ...makeGroupTasks(luckPlanned)];
      const runImmediate = () => {
        [...makeGroupTasks(blightPlanned, true), ...makeGroupTasks(luckPlanned, true)].forEach(t => t());
        global.BoardRenderer?.render?.();
        return finish();
      };
      return { tasks, finish, runImmediate };
    }

    spawnPlayfieldForRound(state, round, onComplete, immediate = false) {
      const wave = this.prepareRoundSpawnsWave(state, round);
      if (wave.tasks.length === 0) {
        onComplete?.(wave.finish());
        return;
      }
      if (immediate || !global.BoardRippleRenderer?.runStaggeredWave) {
        const res = wave.runImmediate ? wave.runImmediate() : wave.finish();
        onComplete?.(res);
        return;
      }
      global.BoardRippleRenderer.runStaggeredWave(wave.tasks, () => onComplete?.(wave.finish()));
    }
  }

  const instance = new MatchOrchestratorClass();
  global.MatchOrchestratorClass = MatchOrchestratorClass;
  global.MatchOrchestrator = instance;
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Match_Orchestrator_1.0', instance);

})(typeof window !== 'undefined' ? window : this);

