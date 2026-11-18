/**
 * @fileoverview cells/Component_Disease_1.0.js - Multi-Part Cell: Part 1.0 of Component_Disease
 * @description State, shape registry, placement, Turn 7+ periodic board spawning, and growth / slithering.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  class ComponentDiseaseClass {
    constructor() {
      this.name = 'Disease';
      this.type = 'hazard';
      this.shapes = new Map(); // plagueId -> PlagueShape
      this.nextId = 0;
    }

    /**
     * Resets all active plague shapes (e.g. on new game or full board reset).
     */
    reset() {
      this.shapes.clear();
      this.nextId = 0;
    }

    /**
     * Checks if a tile or coordinate is a Disease component.
     * @param {Object} tile
     * @returns {boolean}
     */
    isDisease(tile) {
      return !!tile && (tile.color === 'disease' || tile.isDisease === true);
    }

    /**
     * Initializes and registers a new individual PlagueShape.
     * @param {number} q
     * @param {number} r
     * @param {boolean} onBoard
     * @param {number} spawnTurn
     * @returns {Object} Newly created PlagueShape
     */
    initPlagueShape(q, r, onBoard = true, spawnTurn = 1) {
      const state = global.GameState;
      const key = `${q},${r}`;
      const shapeId = 'plague_' + (++this.nextId);

      const shape = {
        id: shapeId,
        components: [{ q, r, key, onBoard }],
        offBoard: !onBoard,
        spawnTurn
      };

      this.shapes.set(shapeId, shape);

      if (onBoard && state && state.board) {
        const tile = state.board.get(key);
        if (tile) {
          tile.color = 'disease';
          tile.sigilId = null;
          tile.fortified = false;
          tile.phased = false;
          tile.weaveStep = null;
          tile.plagueId = shapeId;
        }
      }

      return shape;
    }

    /**
     * Registers a plague component placed onto the board by the player from a Material.
     * @param {number} q
     * @param {number} r
     * @param {number} turn
     * @returns {Object} Newly registered PlagueShape
     */
    registerPlacedPlague(q, r, turn = 1) {
      return this.initPlagueShape(q, r, true, turn);
    }

    /**
     * Spawns a brand new 1-component PlagueShape on a random vacant board tile
     * once every 6 turns starting on Turn 7 (Turn 7, 13, 19, 25...).
     * @param {Object} state - GameState instance
     * @returns {boolean} True if a plague spawned
     */
    spawnBoardPlagueIfDue(state) {
      if (!state || !state.board) return false;
      const round = state.round || 1;

      // Spawns once every 6 turns, starting on Turn 7
      if (round < 7 || ((round - 7) % 6 !== 0)) {
        return false;
      }

      // Gather all completely vacant tiles on the board (no component, no covered component)
      const vacantTiles = [];
      for (const [key, tile] of state.board.entries()) {
        if (!tile.color && !tile.coveredComponent && !tile.burned && !tile.phased && !tile.fortified && !tile.woven && !tile.plagueId) {
          vacantTiles.push({ q: tile.q, r: tile.r, key });
        }
      }

      if (vacantTiles.length === 0) return false;

      // Pick a random vacant tile
      const picked = vacantTiles[Math.floor(Math.random() * vacantTiles.length)];
      this.initPlagueShape(picked.q, picked.r, true, round);
      global.BoardRippleRenderer?.triggerPlacementRipple([{ q: picked.q, r: picked.r }], 'disease', { profile: 'disease', bands: 1 });

      if (global.AudioSynth) {
        if (typeof global.AudioSynth.playDiseaseGrow === 'function') {
          global.AudioSynth.playDiseaseGrow();
        } else {
          global.AudioSynth.playClick?.();
        }
      }

      if (global.UISidebars) {
        global.UISidebars.showToast(`☣️ PLAGUE SPAWN: A wild plague spore emerged at (${picked.q}, ${picked.r})!`);
        global.UISidebars.updateHpBar?.();
      }

      return true;
    }

    /**
     * Executes the beginning-of-turn Plague growth for all existing Plague Shapes:
     * - Size 1 to 3: Grows by appending 1 component to a valid adjacent location (1 -> 2 -> 3 -> 4).
     * - Size 4: Selects a valid adjacent location, places head, and moves oldest component (tail) there.
     * - Valid locations: Adjacent tiles without Ether or Plague components.
     * - Covering: Covering a normal component stores it in tile.coveredComponent (cannot form sigils, deals pending damage).
     * - Off-Board: Growing off-board tags the entire shape off-board for end-of-turn removal with damage equal to component count.
     * @param {Object} state - GameState instance
     * @returns {{ grownCount: number, movedCount: number, coveredCount: number }}
     */
    /**
     * Collects staggered Plague growth tasks for all existing on-board Plague Shapes.
     * Snapshotted prior to round spawns so newly spawned Blight does not also grow on the same turn.
     */
    prepareTurnGrowth(state) {
      if (!state || !state.board) return { tasks: [], finish: () => ({ grownCount: 0, movedCount: 0, coveredCount: 0 }) };
      const hexMath = global.HexMath;
      if (!hexMath) return { tasks: [], finish: () => ({ grownCount: 0, movedCount: 0, coveredCount: 0 }) };

      let totalGrown = 0, totalMoved = 0, totalCovered = 0;

      // Iterate through all active on-board Plague Shapes
      const activeShapes = Array.from(this.shapes.values()).filter(s => s && !s.offBoard);

      // Sort active shapes by lowest Tile ID among all constituent tile locations
      const getShapeLowestTileId = (s) => {
        let minId = 999999;
        if (!s.components || s.components.length === 0) return minId;
        for (const c of s.components) {
          const tid = hexMath.getTileId ? hexMath.getTileId(c.q, c.r) : null;
          if (tid && tid < minId) minId = tid;
        }
        return minId;
      };
      activeShapes.sort((a, b) => getShapeLowestTileId(a) - getShapeLowestTileId(b));

      const growSingleShape = (shape, sIdx, stepDone) => {
        if (!shape || shape.offBoard) { stepDone?.(); return; }

        // Step 1: For 4-part bodies, select least-connected component (protecting bridges from removal)
        let partToRemove = null, remainingParts = shape.components;
        if (shape.components.length >= 4) {
          const counts = shape.components.map(c1 => ({
            comp: c1,
            deg: shape.components.reduce((d, c2) => d + (c1 !== c2 && hexMath.hexDistanceBetween(c1.q, c1.r, c2.q, c2.r) === 1 ? 1 : 0), 0)
          }));
          const minDeg = Math.min(...counts.map(i => i.deg));
          const minTies = counts.filter(i => i.deg === minDeg);
          partToRemove = minTies[Math.floor(Math.random() * minTies.length)].comp;
          remainingParts = shape.components.filter(c => c !== partToRemove);
        }

        // Step 2: Gather valid candidates adjacent to surviving components
        const frontierCandidates = [];
        const seenKeys = new Set();
        for (const comp of remainingParts) {
          const neighbors = hexMath.getNeighbors(comp.q, comp.r);
          for (const [nq, nr] of neighbors) {
            const nKey = `${nq},${nr}`;
            if (seenKeys.has(nKey)) continue;
            seenKeys.add(nKey);

            // Cannot grow onto existing disease/plague component on-board
            const isOnBoard = state.isInsideBoard(nq, nr);
            const boardTile = isOnBoard ? state.board.get(nKey) : null;
            if (boardTile && (boardTile.color === 'disease' || boardTile.plagueId)) continue;

            // Cannot grow onto Ether components
            if (boardTile && (boardTile.color === 'ether' || boardTile.isEther)) continue;

            // Flat Rule: Cannot grow onto any enchanted tile space (Phased, Fortified/Locked, Burned, Woven)
            if (boardTile && (boardTile.phased || boardTile.fortified || boardTile.burned || boardTile.woven || boardTile.weaveStep)) continue;

            // Cannot grow onto existing off-board disease tiles
            const isOffBoardDisease = state.activeDamageTiles && state.activeDamageTiles.some(
              d => d.q === nq && d.r === nr && (d.color === 'disease' || d.isDisease)
            );
            if (isOffBoardDisease) continue;

            frontierCandidates.push({ q: nq, r: nr, key: nKey, onBoard: isOnBoard, tile: boardTile });
          }
        }

        if (frontierCandidates.length === 0) { stepDone?.(); return; } // Shape completely surrounded

        // Step 3: Pick a random valid frontier candidate
        const pickIdx = Math.floor(Math.random() * frontierCandidates.length);
        const chosen = frontierCandidates[pickIdx];

        // Step 4: Setup off-board state or on-board tile state
        if (!chosen.onBoard) {
          shape.offBoard = true;
          shape.greyBackTileAlpha = 0.0;
          if (state.activeDamageTiles && !state.activeDamageTiles.some(d => d.q === chosen.q && d.r === chosen.r)) {
            state.activeDamageTiles.push({ q: chosen.q, r: chosen.r, color: 'disease', isDisease: true, plagueShapeId: shape.id });
          }
          if (global.UISidebars) {
            global.UISidebars.showToast(`⚠️ PLAGUE OFF-BOARD: Plague ${shape.id} breached the hull! Entire shape (+${shape.components.length + (partToRemove ? 0 : 1)} HP) pending removal.`);
          }
        } else {
          // On-board growth onto non-enchanted tile
          const targetTile = chosen.tile;

          if (targetTile.color !== null) {
            targetTile.coveredComponent = {
              color: targetTile.color,
              sigilId: targetTile.sigilId || null,
              fortified: false,
              lockOwner: null
            };
            totalCovered++;
          }

          targetTile.color = 'disease'; targetTile.sigilId = null; targetTile.fortified = false;
          targetTile.lockOwner = null; targetTile.phased = false; targetTile.phaseOwner = null;
          targetTile.weaveStep = null; targetTile.plagueId = shape.id;
        }

        // Step 5: Growth phase (size < 4) vs Slither phase (size == 4)
        if (!partToRemove) {
          // Growth phase: Append new component and play spawn animation
          shape.components.push({ q: chosen.q, r: chosen.r, key: chosen.key, onBoard: chosen.onBoard });
          totalGrown++;

          if (!chosen.onBoard && state.activeDamageTiles) {
            shape.components.forEach(c => {
              if (!state.activeDamageTiles.some(d => d.q === c.q && d.r === c.r)) {
                state.activeDamageTiles.push({ q: c.q, r: c.r, color: 'disease', isDisease: true, plagueShapeId: shape.id });
              }
            });
          }

          const onGrowDone = () => {
            if (global.AudioSynth?.playDiseaseGrow) global.AudioSynth.playDiseaseGrow();
            global.BoardRenderer?.render?.();
            stepDone?.();
          };

          if (global.BoardRippleRenderer?.playSpawnAnimation) {
            const onSpawnTick = !chosen.onBoard ? (t) => { shape.greyBackTileAlpha = t; } : null;
            global.BoardRippleRenderer.playSpawnAnimation({ q: chosen.q, r: chosen.r }, 'disease', () => {
              if (!chosen.onBoard) shape.greyBackTileAlpha = 1.0;
              onGrowDone();
            }, null, { onTick: onSpawnTick });
          } else {
            global.BoardRippleRenderer?.triggerPlacementRipple([{ q: chosen.q, r: chosen.r }], 'disease', { profile: 'disease', bands: 1 });
            onGrowDone();
          }
        } else {
          // Slither phase: Size is 4, move least-connected component (partToRemove) to chosen location
          let tailCleared = false;
          const clearTail = () => {
            if (tailCleared) return;
            tailCleared = true;
            const oldTile = state.board.get(partToRemove.key);
            if (oldTile) {
              if (oldTile.plagueId === shape.id) {
                oldTile.color = null; oldTile.plagueId = null; oldTile.coveredComponent = null;
              } else if (oldTile.underneath?.plagueId === shape.id) {
                oldTile.underneath = null; oldTile.coveredComponent = null;
              }
            }
            if (state.activeDamageTiles) {
              state.activeDamageTiles = state.activeDamageTiles.filter(d => !(d.q === partToRemove.q && d.r === partToRemove.r));
            }
            shape.components = remainingParts.slice();
            if (!shape.components.some(c => c.key === chosen.key)) {
              shape.components.push({ q: chosen.q, r: chosen.r, key: chosen.key, onBoard: chosen.onBoard });
            }
            if (state.activeDamageTiles && (shape.offBoard || !chosen.onBoard)) {
              shape.components.forEach(c => {
                if (!state.activeDamageTiles.some(d => d.q === c.q && d.r === c.r)) {
                  state.activeDamageTiles.push({ q: c.q, r: c.r, color: 'disease', isDisease: true, plagueShapeId: shape.id });
                }
              });
            }
            global.BoardRenderer?.render?.();
          };

          const onSlitherDone = () => {
            clearTail();
            totalMoved++;
            if (global.AudioSynth?.playDiseaseGrow) global.AudioSynth.playDiseaseGrow();
            global.BoardRenderer?.render?.();
            stepDone?.();
          };

          if (global.BoardRippleRenderer?.playSlitherAnimation) {
            const onSpawnTick = !chosen.onBoard ? (t) => { shape.greyBackTileAlpha = t; } : null;
            global.BoardRippleRenderer.playSlitherAnimation(
              { q: partToRemove.q, r: partToRemove.r },
              { q: chosen.q, r: chosen.r },
              'disease',
              () => {
                if (!chosen.onBoard) shape.greyBackTileAlpha = 1.0;
                onSlitherDone();
              },
              clearTail,
              onSpawnTick
            );
          } else {
            onSlitherDone();
            global.BoardRippleRenderer?.triggerPlacementRipple([{ q: chosen.q, r: chosen.r }], 'disease', { profile: 'disease', bands: 1 });
          }
        }
      };

      const finish = () => {
        if (totalGrown > 0 || totalMoved > 0 || totalCovered > 0) {
          if (global.AudioSynth && !global.BoardRippleRenderer?.runStaggeredWave && !global.BoardRippleRenderer?.runSequentialPlacement) {
            if (typeof global.AudioSynth.playDiseaseGrow === 'function') global.AudioSynth.playDiseaseGrow();
            else global.AudioSynth.playClick?.();
          }
          if (global.UISidebars) {
            const coveredMsg = totalCovered > 0 ? ` (${totalCovered} normal component(s) covered!)` : '';
            global.UISidebars.showToast(`☣️ PLAGUE ACTIVE: ${totalGrown} grew, ${totalMoved} slithered${coveredMsg}`);
            global.UISidebars.updateHpBar?.();
          }
          if (state.evaluateSigils) state.evaluateSigils();
        }
        return { grownCount: totalGrown, movedCount: totalMoved, coveredCount: totalCovered };
      };

      const tasks = activeShapes.map((shape, i) => (stepDone) => growSingleShape(shape, i, stepDone));
      return { tasks, finish };
    }

    advanceTurnGrowth(state, onComplete) {
      const wave = this.prepareTurnGrowth(state);
      if (wave.tasks.length === 0) {
        const res = wave.finish();
        onComplete?.(res);
        return res;
      }
      if (global.BoardRippleRenderer?.runStaggeredWave && (global.BoardRippleRenderer?.playSpawnAnimation || global.BoardRippleRenderer?.playSlitherAnimation)) {
        global.BoardRippleRenderer.runStaggeredWave(wave.tasks, () => {
          const res = wave.finish();
          onComplete?.(res);
        });
      } else {
        wave.tasks.forEach(t => t(() => {}));
        const res = wave.finish();
        onComplete?.(res);
        return res;
      }
      return { grownCount: 0, movedCount: 0, coveredCount: 0 };
    }
  }

  const componentDiseaseInstance = new ComponentDiseaseClass();

  // Register with global Roll Call
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Component_Disease', componentDiseaseInstance);
  global.ComponentDiseaseClass = ComponentDiseaseClass;
  global.ComponentDisease = componentDiseaseInstance;

})(typeof window !== 'undefined' ? window : this);
