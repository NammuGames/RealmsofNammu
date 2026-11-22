/**
 * @fileoverview cells/Match_Orchestrator_1.0.js - Match Schedule, Vectors & Procedural Material Factory
 * @description Coordinates lightweight non-exponential Round Schedule evaluation for Playfield and
 * Material Luck/Blight vectors and procedural Material generation with parity rules
 * (Part 1 of multi-part MatchOrchestrator cell; Playfield spawning lives in Part 1.2).
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
        const duration = Math.max(1, Number(item.turnEnd ?? 24));
        const dup = Math.max(0, Number(item.dupInterval || 0));
        const spawnCount = Math.max(1, Math.min(24, Number(item.spawnCount ?? 1) || 1));

        // k = 0 is the original series; k = 1, 2, ... are linear shifted duplicate series
        for (let k = 0; ; k++) {
          const offset = k * dup;
          const sStart = start + offset;
          if (sStart > round) break;

          const sEnd = item.isEndOfMatch ? numericMax : (sStart + duration - 1);
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
  }

  const instance = new MatchOrchestratorClass();
  global.MatchOrchestratorClass = MatchOrchestratorClass;
  global.MatchOrchestrator = instance;
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Match_Orchestrator_1.0', instance);

})(typeof window !== 'undefined' ? window : this);

