/**
 * @fileoverview cells/Match_Orchestrator_1.2.js - Playfield Spawning & Sequential Scatter Engine
 * @description Coordinates board-mutating playfield spawns (Playfield Luck & Blight waves,
 * pre-determined online Round 0/1 spawn lists, random single spawns, and unplaced material
 * scattering with concentric ripple choreography) (Part 3 of multi-part MatchOrchestrator cell).
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const proto = global.MatchOrchestratorClass?.prototype;
  if (!proto) {
    console.error('[Match_Orchestrator_1.2] MatchOrchestratorClass is not defined. Ensure Match_Orchestrator_1.0.js is loaded first.');
    return;
  }

  /**
   * Collects all currently vacant, unenchanted board tiles eligible for playfield spawns.
   * @param {Object} state
   */
  proto.getVacantBoardTiles = function(state) {
    const list = [];
    if (!state?.board) return list;
    for (const [key, tile] of state.board.entries()) {
      if (!tile.color && !tile.coveredComponent && !tile.burned && !tile.phased && !tile.fortified && !tile.woven && !tile.plagueId) {
        list.push({ q: tile.q, r: tile.r, key, tile });
      }
    }
    return list;
  };

  proto.spawnComponentRandomly = function(state, color, round = state?.round || 1) {
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
  };

  proto.scatterUnplacedMaterial = function(state, onComplete) {
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
  };

  proto.prepareRoundSpawnsWave = function(state, round) {
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
  };

  /**
   * Pre-rolls ordered Round playfield spawns (blight then luck) without mutating the board,
   * allowing Host to broadcast exact coordinates/colors so all peers animate in lockstep.
   */
  proto.planRoundSpawns = function(state, round, occupiedKeys = new Set()) {
    if (!state?.board || !state?.matchConfig) return [];
    const sched = this.getRoundScheduleEntry(state, round);
    const blightPlanned = [], luckPlanned = [];
    for (const pct of sched.playfieldBlight) {
      if (Math.random() * 100 < pct) blightPlanned.push({ type: 'blight', color: 'disease' });
    }
    for (const pct of sched.playfieldLuck) {
      if (Math.random() * 100 < pct) luckPlanned.push({ type: 'luck', color: this.pickLuckComponent(state.matchConfig) });
    }
    const pickGroup = (planned) => {
      if (!planned.length) return [];
      const v = this.getVacantBoardTiles(state).filter(t => !occupiedKeys.has(`${t.q},${t.r}`));
      const chosen = global.BoardRippleRenderer?.pickAndOrderVacantTiles
        ? global.BoardRippleRenderer.pickAndOrderVacantTiles(v, planned.length)
        : v.slice(0, planned.length);
      return chosen.map((t, i) => {
        occupiedKeys.add(`${t.q},${t.r}`);
        return { q: t.q, r: t.r, color: planned[i].color };
      });
    };
    return [...pickGroup(blightPlanned), ...pickGroup(luckPlanned)];
  };

  proto.spawnPlayfieldForRound = function(state, round, onComplete, immediate = false, predeterminedSpawns = null) {
    if (Array.isArray(predeterminedSpawns)) {
      if (predeterminedSpawns.length === 0) { onComplete?.({ luckCount: 0, blightCount: 0, spawnedTotal: 0 }); return; }
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
        onComplete?.({ luckCount, blightCount, spawnedTotal: luckCount + blightCount });
      };
      const tasks = predeterminedSpawns.map(it => (stepDone) => {
        const tile = state.board?.get(`${it.q},${it.r}`);
        if (!tile) { stepDone?.(); return; }
        const isDisease = it.color === 'disease';
        if (isDisease) { global.ComponentDisease?.initPlagueShape?.(it.q, it.r, true, round); blightCount++; }
        else { tile.color = it.color; tile.sigilId = null; luckCount++; }
        if (immediate) { stepDone?.(); return; }
        const playSfx = () => isDisease ? global.AudioSynth?.playDiseaseGrow?.() : global.AudioSynth?.playPlace?.();
        const prof = isDisease ? 'disease' : (it.color === 'ether' ? 'ether' : 'single');
        if (global.BoardRippleRenderer?.playSpawnAnimation) {
          global.BoardRippleRenderer.playSpawnAnimation({ q: it.q, r: it.r }, it.color, () => { playSfx(); global.BoardRenderer?.render?.(); stepDone?.(); });
        } else {
          global.BoardRippleRenderer?.triggerPlacementRipple([{ q: it.q, r: it.r }], it.color, { profile: prof, bands: 1 });
          playSfx(); global.BoardRenderer?.render?.(); stepDone?.();
        }
      });
      if (immediate || !global.BoardRippleRenderer?.runStaggeredWave) {
        tasks.forEach(t => t());
        global.BoardRenderer?.render?.();
        finish();
        return;
      }
      global.BoardRippleRenderer.runStaggeredWave(tasks, finish);
      return;
    }
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
  };

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Match_Orchestrator_1.2', global.MatchOrchestrator);
})(typeof window !== 'undefined' ? window : this);
