/**
 * @fileoverview cells/Turn_Manager_1.0.js - End Turn Detonations & Spell Forging Engine
 * @description Manages End Turn resolution: Step 1 (unplaced scatter), Step 2 (arch finalization),
 * Step 3 (sequential Burn & Phase disease destruction and non-disease Burns), Step 4 (resonant sigil detonations & Arch flowers),
 * Step 5 (spellbook/overflow forging), and handoff to Step 6 (damage & round advance) (Part 1 of multi-part TurnManager cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  class TurnManagerClass {
    constructor() {
      this.isEndingTurn = false;
    }

    /**
     * Executes the End Turn sequence:
     * 0. 1 H-Beat pause after confirm (congruent with confirm popup collapse).
     * 1. Unplaced Material Scatter (if turn ended without piece placement).
     * 2. Arch Zone Finalization.
     * 3. Burn & Phase Disease Destruction (sequential, one disease body at a time).
     * 4. Resonant Detonations & Point Cascade.
     * 5. Spell Forging & Recharging.
     * 6. Off-Board Damage & Last Breath Survival.
     * 7. Round Advancement and player rotation.
     */
    endTurn() {
      const state = global.GameState;
      if (!state || state.gameOver || this.isEndingTurn) return;
      this.isEndingTurn = true;
      state.isSequentialPlacing = true;
      state.syncUI();
      global.UICardsDeck?.syncSpellbookColumnWithGameState?.();

      const startEndTurnSteps = () => {
        // Step 2: Finalize Arch spell if placed
        if (state.inArchMode && global.SpellArch?.isPlaced) {
          global.SpellArch.finalizeArch();
        }

        // Step 3: Burn & Phase Disease Destruction, then non-disease Burns
        this.resolveStep3DiseaseAndBurn(state, () => {
          // Steps 4+: Resonant Detonations, Spell Forging, Damage & Last Breath
          this.resolveStep4AndTurnCompletion(state);
        });
      };

      const h1Ms = (global.H_TIMING?.BEAT_SEC ?? (Math.pow(12, 8) / 1420405751.768)) * 1000;
      setTimeout(() => {
        state.isSequentialPlacing = false;
        if (state.gameOver) { this.isEndingTurn = false; return; }
        // Step 1: Unplaced Material Scatter
        if (!state.placedThisTurn && global.MatchOrchestrator?.scatterUnplacedMaterial) {
          global.MatchOrchestrator.scatterUnplacedMaterial(state, startEndTurnSteps);
        } else {
          startEndTurnSteps();
        }
      }, h1Ms);
    }

    /**
     * Step 3: Burn & Phase Disease Destruction.
     * 1. Identifies all disease tokens under a Burn or Phase tile (pending destruction).
     * 2. Sorts by lowest tile position first, allowing strictly one entry per disease body.
     * 3. Plays sequential destruction animation per disease body (one at a time).
     * 4. Finalizes non-disease Burns and Burn-enhanced Arch zones before proceeding.
     */
    resolveStep3DiseaseAndBurn(state, onComplete) {
      if (!state || !state.board) {
        if (typeof onComplete === 'function') onComplete();
        return;
      }

      const hexMath = global.HexMath;
      const candidates = [];

      // 1. Query board tiles with Burn or Phase covering disease
      for (const [tk, tile] of state.board.entries()) {
        if (!tile) continue;
        const isBurn = !!tile.burned;
        const isPhase = !!tile.phased;
        if (!isBurn && !isPhase) continue;

        const under = tile.underneath;
        const isDiseaseUnder = !!(under && (under.color === 'disease' || under.plagueId));
        const isDirectDisease = (tile.color === 'disease');

        if (isDiseaseUnder || isDirectDisease) {
          const parts = tk.split(',');
          const q = parseInt(parts[0], 10);
          const r = parseInt(parts[1], 10);
          const tileId = (hexMath?.getTileId ? hexMath.getTileId(q, r) : null) ?? 999999;

          let pId = under?.plagueId || tile.plagueId || null;
          if (!pId && global.ComponentDisease?.shapes) {
            const found = Array.from(global.ComponentDisease.shapes.values()).find(s =>
              s.components && s.components.some(c => c.key === tk)
            );
            if (found) pId = found.id;
          }
          const shapeId = pId || `solo_${tk}`;
          const shape = pId ? global.ComponentDisease?.shapes?.get(pId) : null;

          candidates.push({
            tk,
            q,
            r,
            tileId,
            type: isBurn ? 'burn' : 'phase',
            pId,
            shapeId,
            shape: shape || { id: shapeId, components: [{ q, r, key: tk }] }
          });
        }
      }

      // Query Arch zones with Burn or Phase covering disease
      if (state.archZones && state.archZones.length > 0) {
        global.SpellArch?.syncArchZones?.(state.archZones);
        state.archZones.forEach(z => {
          const isBurnArch = (z.enchantment === 'burn');
          const isPhaseArch = (z.enchantment === 'phase');
          if (isBurnArch || isPhaseArch) {
            (z.flowerTiles || []).forEach(tk => {
              const t = state.board.get(tk);
              if (t && (t.color === 'disease' || t.plagueId)) {
                const parts = tk.split(',');
                const q = parseInt(parts[0], 10);
                const r = parseInt(parts[1], 10);
                const tileId = (hexMath?.getTileId ? hexMath.getTileId(q, r) : null) ?? 999999;
                let pId = t.plagueId;
                if (!pId && global.ComponentDisease?.shapes) {
                  const found = Array.from(global.ComponentDisease.shapes.values()).find(s =>
                    s.components && s.components.some(c => c.key === tk)
                  );
                  if (found) pId = found.id;
                }
                const shapeId = pId || `solo_${tk}`;
                const shape = pId ? global.ComponentDisease?.shapes?.get(pId) : null;
                candidates.push({
                  tk,
                  q,
                  r,
                  tileId,
                  type: isBurnArch ? 'burn' : 'phase',
                  pId,
                  shapeId,
                  shape: shape || { id: shapeId, components: [{ q, r, key: tk }] }
                });
              }
            });
          }
        });
      }

      // Sort candidate hits by lowest tile position first
      candidates.sort((a, b) => a.tileId - b.tileId);

      // Deduplicate: allow strictly one entry per disease body
      const seenBodies = new Set();
      const destructionQueue = [];
      for (const cand of candidates) {
        if (!seenBodies.has(cand.shapeId)) {
          seenBodies.add(cand.shapeId);
          destructionQueue.push(cand);
        }
      }

      const finishStep3 = () => {
        const rr = global.BoardRippleRenderer;
        const hasPersisted = rr && Array.isArray(rr.persistentPreTokens) && rr.persistentPreTokens.length > 0;
        const doneStep3 = () => {
          this.finalizeStep3Burns(state, () => {
            if (typeof onComplete === 'function') onComplete();
          });
        };

        if (hasPersisted && rr.startPreTokensDrift) {
          // Lock zoom and pan functions during the 2 H-Beat pause and drift
          state.cameraLocked = true;
          const beatMs = global.H_TIMING?.TWO_BEATS_MS ?? (2000 * Math.pow(12, 8) / 1420405751.768);
          setTimeout(() => {
            rr.startPreTokensDrift(() => {
              state.cameraLocked = false;
              doneStep3();
            });
          }, beatMs);
        } else {
          doneStep3();
        }
      };

      if (destructionQueue.length === 0) {
        finishStep3();
        return;
      }

      // Process each disease body destruction using Resonance stagger cadence (3 H-Beats base, 12 H-Beats max span)
      const count = destructionQueue.length;
      const h1Sec = global.H_TIMING?.BEAT_SEC ?? (Math.pow(12, 8) / 1420405751.768);
      const h3Sec = global.H_TIMING?.THREE_BEATS_SEC ?? (3 * h1Sec);
      const stepBeats = count <= 1 ? 0 : (((count - 1) * 3 > 12) ? (12 / (count - 1)) : 3);
      const stepMs = stepBeats * h1Sec * 1000;
      let completedCount = 0;
      state.isSequentialPlacing = true;

      destructionQueue.forEach((entry, i) => {
        const launch = () => {
          const hasRippleAnim = !!global.BoardRippleRenderer?.playDiseaseDestructionAnimation;
          const onBodyDestroyed = () => {
            if (entry.pId && global.ComponentDisease?.destroyPlagueShape) {
              global.ComponentDisease.destroyPlagueShape(entry.pId, entry.type, entry.tk, { deferScore: hasRippleAnim });
            }
            const clearedKeys = new Set();
            const directTile = state.board.get(entry.tk);
            if (directTile) {
              directTile.underneath = null;
              if (entry.type === 'burn') { directTile.color = null; directTile.sigilId = null; clearedKeys.add(entry.tk); }
            }
            if (entry.shape?.components) {
              entry.shape.components.forEach(comp => {
                const ct = state.board.get(comp.key);
                if (ct) {
                  if (ct.underneath && (ct.underneath.plagueId === entry.pId || ct.underneath.color === 'disease')) ct.underneath = null;
                  if (ct.burned && comp.key !== entry.tk) { ct.underneath = null; ct.color = null; ct.sigilId = null; clearedKeys.add(comp.key); }
                }
              });
            }
            if (clearedKeys.size > 0) this.pruneDestroyedSigils(state, clearedKeys);
            if (global.AudioSynth?.playDiseaseDestroy) global.AudioSynth.playDiseaseDestroy();
            else global.AudioSynth?.playDetonate?.();
            if (++completedCount >= count) {
              state.isSequentialPlacing = false;
              finishStep3();
            }
          };

          if (global.BoardRippleRenderer?.playDiseaseDestructionAnimation) {
            global.BoardRippleRenderer.playDiseaseDestructionAnimation(entry, onBodyDestroyed, h3Sec);
          } else {
            onBodyDestroyed();
          }
        };
        if (i === 0) launch();
        else setTimeout(launch, i * stepMs);
      });
    }

    /**
     * Finalizes non-disease Burns and Burn-enhanced Arch zones with red despawn animations.
     */
    finalizeStep3Burns(state, onComplete) {
      if (!state || !state.board) {
        if (typeof onComplete === 'function') onComplete();
        return;
      }
      let burnedAny = false;
      let burnedDisease = false;
      const burnTargets = [];
      const seenKeys = new Set();

      // 1. Burn-Enhanced Arch Detonation
      if (state.archZones?.length > 0) {
        global.SpellArch?.syncArchZones?.(state.archZones);
        const burnZones = state.archZones.filter(z => z.enchantment === 'burn');
        burnZones.forEach(bz => {
          (bz.flowerTiles || []).forEach(tk => {
            const t = state.board.get(tk);
            if (!t || t.color === null || seenKeys.has(tk)) return;
            if (t.color === 'disease' || t.plagueId) {
              seenKeys.add(tk); burnedDisease = true;
              burnTargets.push({ q: t.q, r: t.r, key: tk, apply: () => {
                const pId = t.plagueId || (global.ComponentDisease?.shapes ? Array.from(global.ComponentDisease.shapes.values()).find(s => s.components.some(c => c.key === tk))?.id : null);
                if (pId && global.ComponentDisease?.destroyPlagueShape) global.ComponentDisease.destroyPlagueShape(pId, 'burn', tk);
                t.color = null; t.plagueId = null;
              }});
            } else if (!t.fortified) {
              seenKeys.add(tk); burnedAny = true;
              burnTargets.push({ q: t.q, r: t.r, key: tk, apply: () => { t.color = null; t.sigilId = null; } });
            }
          });
        });
        if (burnZones.length > 0) {
          const bIds = new Set(burnZones.map(bz => bz.id || `${bz.center?.q},${bz.center?.r}`));
          state.archZones = state.archZones.filter(z => !bIds.has(z.id) && !bIds.has(`${z.center?.q},${z.center?.r}`));
        }
      }

      // 2. Single-Tile Burn Destruction (leaves empty red tile active until Phase C expiration)
      for (const [tk, tile] of state.board.entries()) {
        if (!tile || !tile.burned) continue;
        const under = tile.underneath;
        if (under) {
          if (under.fortified) {
            tile.color = under.color; tile.sigilId = under.sigilId || null; tile.fortified = true; tile.lockOwner = under.lockOwner || null; tile.underneath = null;
            tile.burned = false; tile.burnOwner = null;
          } else if (!seenKeys.has(tk)) {
            seenKeys.add(tk);
            if (under.color === 'disease' || under.plagueId) burnedDisease = true;
            else burnedAny = true;
            burnTargets.push({ q: tile.q, r: tile.r, key: tk, apply: () => {
              if (under.color === 'disease' || under.plagueId) {
                const pId = under.plagueId || (global.ComponentDisease?.shapes ? Array.from(global.ComponentDisease.shapes.values()).find(s => s.components.some(c => c.key === tk))?.id : null);
                if (pId && global.ComponentDisease?.destroyPlagueShape) global.ComponentDisease.destroyPlagueShape(pId, 'burn', tk);
              }
              tile.underneath = null; tile.color = null; tile.sigilId = null;
            }});
          }
        } else if (tile.color !== null && !seenKeys.has(tk)) {
          seenKeys.add(tk); burnedAny = true;
          burnTargets.push({ q: tile.q, r: tile.r, key: tk, apply: () => { tile.color = null; tile.sigilId = null; } });
        }
      }

      const finishBurns = () => {
        burnTargets.forEach(bt => bt.apply());
        if (seenKeys.size > 0) this.pruneDestroyedSigils(state, seenKeys);
        if (burnedDisease && global.AudioSynth?.playDiseaseDestroy) global.AudioSynth.playDiseaseDestroy();
        if (burnedAny && global.AudioSynth?.playDetonate) global.AudioSynth.playDetonate();
        if (typeof onComplete === 'function') onComplete();
      };

      if (burnTargets.length > 0 && global.BoardRippleRenderer?.playBurnDespawnAnimation) {
        const h3Sec = global.H_TIMING?.THREE_BEATS_SEC ?? (3 * Math.pow(12, 8) / 1420405751.768);
        global.BoardRippleRenderer.playBurnDespawnAnimation(burnTargets, finishBurns, h3Sec);
      } else {
        finishBurns();
      }
    }

    /**
     * Removes sigils invalidated by destroyed Burn tiles so emblems do not pop back before Phase D.
     */
    pruneDestroyedSigils(state, clearedTileKeys) {
      const resolver = global.SigilResolver;
      if (!resolver || !clearedTileKeys?.size) return;
      const deadIds = new Set();
      if (Array.isArray(resolver.allCandidates)) {
        resolver.allCandidates = resolver.allCandidates.filter(cand => {
          const dead = Array.isArray(cand.tiles) && cand.tiles.some(tk => clearedTileKeys.has(tk) || !state?.board?.get(tk)?.color);
          if (dead && cand.id) deadIds.add(cand.id);
          return !dead;
        });
      }
      if (deadIds.size === 0) return;
      deadIds.forEach(id => {
        resolver.lockedSigilIds?.delete(id);
        resolver.dormantSigilIds?.delete(id);
        resolver.savedWildSelections?.delete(id);
        resolver.resonantSigils?.delete(id);
        resolver.overlapsMap?.delete(id);
      });
      if (Array.isArray(resolver.activeSigils)) {
        resolver.activeSigils = resolver.activeSigils.filter(s => !deadIds.has(s.id));
      }
      if (Array.isArray(resolver.resonantPairs)) {
        resolver.resonantPairs = resolver.resonantPairs.filter(([a, b]) => !deadIds.has(a?.id) && !deadIds.has(b?.id));
      }
      if (resolver.overlapsMap) {
        for (const set of resolver.overlapsMap.values()) {
          deadIds.forEach(id => set.delete(id));
        }
      }
      if (state?.board) {
        for (const tile of state.board.values()) {
          if (tile && deadIds.has(tile.sigilId)) tile.sigilId = null;
        }
        global.ComponentEther?.syncBoardEtherActiveColors?.(state.board, resolver.allCandidates, resolver.lockedSigilIds);
      }
    }
  }

  const turnManagerInstance = new TurnManagerClass();
  global.TurnManagerClass = TurnManagerClass;
  global.TurnManager = turnManagerInstance;

  // Register with global Roll Call
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Turn_Manager_1.0', turnManagerInstance);

})(typeof window !== 'undefined' ? window : this);
