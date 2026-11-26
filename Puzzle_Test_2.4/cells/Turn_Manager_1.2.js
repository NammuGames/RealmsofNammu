/**
 * @fileoverview cells/Turn_Manager_1.2.js - Damage & Last Breath Pipeline
 * @description Coordinates off-board overhang damage, Last Breath auto-heal resolution,
 * and end-of-turn Damage Token animations (Part 3 of multi-part TurnManager cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const proto = global.TurnManagerClass?.prototype;
  if (!proto) {
    console.error('[Turn_Manager_1.2] TurnManagerClass is not defined. Ensure Turn_Manager_1.0.js is loaded first.');
    return;
  }

  /**
   * Resolves pending off-board overhang damage and Last Breath mode at End of Turn.
   * If damage would reduce HP <= 0, auto-casts available Heal spells (PPB)
   * from newly forged spells and the existing spellbook until HP > 0.
   * If insufficient Heal spells exist, triggers Game Over immediately.
   * @param {Array<Object>} newlyForgedSpells - Spells forged during this turn's alignments
   * @param {number|null} [explicitDamage=null] - Precomputed damage from sequential damage phase
   * @returns {boolean} True if player survived, false if Game Over
   */
  proto.resolveLastBreathAndDamage = function(newlyForgedSpells = [], explicitDamage = null) {
    const state = global.GameState;
    if (!state) return false;

    let totalDamage = 0;
    if (explicitDamage !== null && explicitDamage !== undefined) {
      totalDamage = explicitDamage;
    } else {
      const damageTiles = state.activeDamageTiles ? [...state.activeDamageTiles] : [];
      const offBoardPlacedPlagues = damageTiles.filter(t => !t.plagueShapeId && (t.isPlacedPlague || t.color === 'disease'));
      offBoardPlacedPlagues.forEach(() => {
        global.MatchOrchestrator?.spawnComponentRandomly?.(state, 'disease', state.round);
      });
      const playerOverhangTiles = damageTiles.filter(t => !t.plagueShapeId && !t.isPlacedPlague && t.color !== 'disease');
      const offBoardCount = playerOverhangTiles.length;

      // 1. Covered Normal Components: Deal 1 damage each and remove the covered component
      let coveredCount = 0;
      if (state.board) {
        for (const tile of state.board.values()) {
          if (tile && tile.coveredComponent) {
            coveredCount++;
            tile.coveredComponent = null;
          }
        }
      }

      // 2. Off-Board Plague Shapes (persist off-board across turns until purged or slithered back on-board)
      let offBoardPlagueDamage = 0;
      if (global.ComponentDisease && global.ComponentDisease.shapes) {
        for (const shape of global.ComponentDisease.shapes.values()) {
          if (shape.offBoard) offBoardPlagueDamage += 1;
        }
      }
      totalDamage = offBoardCount + coveredCount + offBoardPlagueDamage;
    }
    // Keep persistent off-board plague segments; clear player overhang & already-teleported placed-plague entries
    state.activeDamageTiles = (state.activeDamageTiles || []).filter(d => !!d.plagueShapeId);
    const pendingHeal = state.pendingHeal || 0;
    state.pendingHeal = 0; // Clear staged pending heal as it resolves into net vitality
    let netHp = state.hp + pendingHeal - totalDamage;

    const overflow = state.overflowSpells || [];
    if (netHp <= 0) {
      // Last Breath triggered! Auto-cast available Heal spells (Overflow FIRST, then Spellbook)
      let autoHealCount = 0;

      // 1. Consume overflow Heal spells first
      while (netHp <= 0) {
        const ofIdx = overflow.findIndex(s => s.formula === 'PPB' || s.name?.toLowerCase() === 'heal');
        if (ofIdx === -1) break;
        overflow.splice(ofIdx, 1); netHp += 4; autoHealCount++;
      }

      // 2. Then consume permanent spellbook Heal charges if still <= 0
      if (netHp <= 0) {
        const bookHeal = state.spellbook.find(s => s.formula === 'PPB' || s.name?.toLowerCase() === 'heal');
        while (netHp <= 0 && bookHeal && (bookHeal.charges || 0) > 0) { bookHeal.charges--; netHp += 4; autoHealCount++; }
      }

      if (netHp <= 0) {
        state.hp = 0;
        global.MatchOrchestrator?.saveActivePlayerFromState?.(state);
        global.AudioSynth?.playClick?.();
        const pName = state.getActivePlayer?.()?.name || `Player ${state.currentPlayerId || 1}`;
        state.showToast(`💀 ${pName} vitality depleted (0 HP)!`);
      } else {
        // Survived via Last Breath
        state.hp = Math.min(state.maxHp, netHp);
        global.AudioSynth?.playDetonate?.();
        state.showToast(`🛡️ LAST BREATH SURVIVED! Auto-cast ${autoHealCount} Heal spell(s). HP restored to ${state.hp}.`);
      }
    } else {
      state.hp = Math.min(state.maxHp, netHp);
    }

    // Convert all remaining overflow spells to 1 bonus point each
    const remainingOverflow = overflow.length;
    const creditedOverflow = state._creditedOverflowPts || 0;
    const uncreditedOverflow = Math.max(0, remainingOverflow - creditedOverflow);
    state._creditedOverflowPts = 0;
    if (remainingOverflow > 0) {
      if (uncreditedOverflow > 0) {
        if (global.NativeStatPod?.awardArrivedScorePoint) global.NativeStatPod.awardArrivedScorePoint(uncreditedOverflow);
        else state.score += uncreditedOverflow;
      }
      state.roundBonusPoints = (state.roundBonusPoints || 0) + remainingOverflow;
      state.showToast(`✨ Overflow Bonus: +${remainingOverflow} PTS from ${remainingOverflow} surplus spell(s)!`);
      state.overflowSpells = [];
    }

    global.MatchOrchestrator?.saveActivePlayerFromState?.(state);
    state.syncUI();
    return true;
  };

  /**
   * Orchestrates the multi-stage Damage Step animations at End of Turn:
   * 1-3. Covered normal components, off-board disease shapes, and off-board normal components
   *      sorted together by tile ID and launched with Resonance stagger cadence (3 H-Beats base,
   *      12 H-Beats max start span), each spawning a floating Damage Token.
   * 4. Placed off-board disease tokens despawn and respawn onto the board with disease slither animation.
   * 5. All floating Damage Tokens drift simultaneously to the center of the HP Sub-Pod.
   * 6. Damage is applied, Last Breath is evaluated, and round advances.
   */
  proto.startDamagePhase = function(newlyForgedSpells = []) {
    const state = global.GameState;
    if (!state) return;
    const rr = global.BoardRippleRenderer;

    // Collect all Damage-Token-spawning events into one unified, tileId-sorted set
    const damageEvents = [];
    if (state.board) {
      for (const tile of state.board.values()) {
        const covered = tile?.coveredComponent || (tile?.underneath?.color && tile.underneath.color !== 'disease' ? tile.underneath : null);
        if (tile && tile.color === 'disease' && covered) {
          const tileId = global.HexMath?.getTileId?.(tile.q, tile.r) ?? 9999;
          damageEvents.push({ kind: 'cover', tileId, entry: { tile, q: tile.q, r: tile.r, tileId, covered } });
        }
      }
    }

    if (global.ComponentDisease?.shapes) {
      for (const shape of global.ComponentDisease.shapes.values()) {
        if (shape.offBoard) {
          const firstC = shape.components?.[0];
          const tileId = firstC ? (global.HexMath?.getTileId?.(firstC.q, firstC.r) ?? 9999) : 9999;
          damageEvents.push({ kind: 'offBoardShape', tileId, shape });
        }
      }
    }

    const damageTiles = state.activeDamageTiles ? [...state.activeDamageTiles] : [];
    const offBoardNormals = damageTiles.filter(t => !t.plagueShapeId && !t.isPlacedPlague && t.color !== 'disease');
    offBoardNormals.forEach(t => {
      const tileId = global.HexMath?.getTileId?.(t.q, t.r) ?? 9999;
      t.tileId = tileId;
      damageEvents.push({ kind: 'offBoardNormal', tileId, entry: t });
    });
    damageEvents.sort((a, b) => a.tileId - b.tileId);

    // 4. Placed off-board disease tokens (slither onto board, no damage token)
    const offBoardPlacedPlagues = damageTiles.filter(t => !t.plagueShapeId && (t.isPlacedPlague || t.color === 'disease'));

    const totalDamageCount = damageEvents.length;
    const totalSteps = totalDamageCount + offBoardPlacedPlagues.length;

    if (totalSteps === 0) {
      const survived = this.resolveLastBreathAndDamage(newlyForgedSpells, 0);
      if (survived) this.completeRoundAdvancement();
      return;
    }

    state.cameraLocked = true;

    // STEPS 1-3: Unified Damage Token spawn set with Resonance stagger cadence (3 H-Beats base, 12 H-Beats max span)
    const runDamageEvents = (onDone) => {
      const count = damageEvents.length;
      if (count === 0) {
        onDone();
        return;
      }
      const h1Sec = global.H_TIMING?.BEAT_SEC ?? (Math.pow(12, 8) / 1420405751.768);
      const stepBeats = count <= 1 ? 0 : (((count - 1) * 3 > 12) ? (12 / (count - 1)) : 3);
      const stepMs = stepBeats * h1Sec * 1000;
      let completedCount = 0;
      const finishOne = () => { if (++completedCount >= count) onDone(); };

      damageEvents.forEach((ev, i) => {
        const launch = () => {
          if (ev.kind === 'cover') {
            const entry = ev.entry;
            if (rr?.playCoverDamageAnimation) {
              rr.playCoverDamageAnimation(entry, () => {
                if (entry.tile) entry.tile.coveredComponent = null;
                finishOne();
              });
            } else {
              if (entry.tile) entry.tile.coveredComponent = null;
              finishOne();
            }
          } else if (ev.kind === 'offBoardShape') {
            const shape = ev.shape;
            if (rr?.playOffBoardDiseaseDamageAnimation) {
              rr.playOffBoardDiseaseDamageAnimation(shape, () => {
                finishOne();
              });
            } else {
              finishOne();
            }
          } else {
            const entry = ev.entry;
            if (rr?.playOffBoardComponentDamageAnimation) {
              rr.playOffBoardComponentDamageAnimation(entry, () => {
                state.activeDamageTiles = (state.activeDamageTiles || []).filter(d => !(d.q === entry.q && d.r === entry.r));
                finishOne();
              });
            } else {
              state.activeDamageTiles = (state.activeDamageTiles || []).filter(d => !(d.q === entry.q && d.r === entry.r));
              finishOne();
            }
          }
        };
        if (i === 0) launch();
        else setTimeout(launch, i * stepMs);
      });
    };

    // STEP 4: Placed Plagues Slither onto Board
    let pIdx = 0;
    const runPlacedPlagues = (onDone) => {
      if (pIdx < offBoardPlacedPlagues.length) {
        const plague = offBoardPlacedPlagues[pIdx++];
        const vacant = global.MatchOrchestrator?.getVacantBoardTiles ? global.MatchOrchestrator.getVacantBoardTiles(state) : [];
        if (vacant.length > 0 && rr?.playSlitherAnimation) {
          const target = vacant[Math.floor(Math.random() * vacant.length)];
          rr.playSlitherAnimation(
            { q: plague.q, r: plague.r },
            { q: target.q, r: target.r },
            'disease',
            () => {
              global.ComponentDisease?.initPlagueShape?.(target.q, target.r, true, state.round);
              if (target.tile) { target.tile.color = 'disease'; target.tile.sigilId = null; }
              state.activeDamageTiles = (state.activeDamageTiles || []).filter(d => !(d.q === plague.q && d.r === plague.r));
              if (global.AudioSynth?.playDiseaseGrow) global.AudioSynth.playDiseaseGrow();
              runPlacedPlagues(onDone);
            },
            () => {
              state.activeDamageTiles = (state.activeDamageTiles || []).filter(d => !(d.q === plague.q && d.r === plague.r));
            }
          );
        } else {
          global.MatchOrchestrator?.spawnComponentRandomly?.(state, 'disease', state.round);
          state.activeDamageTiles = (state.activeDamageTiles || []).filter(d => !(d.q === plague.q && d.r === plague.r));
          runPlacedPlagues(onDone);
        }
      } else {
        onDone();
      }
    };

    // STEP 5: Damage Tokens Drift
    const runDamageDrift = () => {
      const hasDmg = Array.isArray(rr?.persistentDamageTokens) && rr.persistentDamageTokens.length > 0;
      if (global.LastBreathManager?.isLastBreathActive?.(state, totalDamageCount)) {
        global.LastBreathManager.executeLastBreathSequence(state, newlyForgedSpells, () => {
          this.completeRoundAdvancement();
        });
        return;
      }
      if (hasDmg && rr?.startDamageTokensDrift) {
        const beatMs = global.H_TIMING?.TWO_BEATS_MS ?? (2000 * Math.pow(12, 8) / 1420405751.768);
        setTimeout(() => {
          rr.startDamageTokensDrift((appliedDamage = 0) => {
            state.cameraLocked = false;
            const remainingDamage = Math.max(0, totalDamageCount - (appliedDamage || 0));
            const survived = this.resolveLastBreathAndDamage(newlyForgedSpells, remainingDamage);
            if (survived) this.completeRoundAdvancement();
          });
        }, beatMs);
      } else {
        state.cameraLocked = false;
        const survived = this.resolveLastBreathAndDamage(newlyForgedSpells, totalDamageCount);
        if (survived) this.completeRoundAdvancement();
      }
    };

    runDamageEvents(() => {
      runPlacedPlagues(() => {
        runDamageDrift();
      });
    });
  };

  // Register with global Roll Call
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Turn_Manager_1.2', global.TurnManager);

})(typeof window !== 'undefined' ? window : this);

