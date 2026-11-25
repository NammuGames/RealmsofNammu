/**
 * @fileoverview cells/Turn_Manager_1.1.js - Resonant Detonations & Spell Forging Pipeline
 * @description Coordinates Step 4 (resonant sigil detonations, point cascade swarms, board clearance)
 * and Step 5 (spellbook additions, overflow routing, and handoff to damage phase)
 * (Part 2 of multi-part TurnManager cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const proto = global.TurnManagerClass?.prototype;
  if (!proto) {
    console.error('[Turn_Manager_1.1] TurnManagerClass is not defined. Ensure Turn_Manager_1.0.js is loaded first.');
    return;
  }

  /**
   * Step 4: Resonant Detonations, Point Cascade, and handoff to Spell Forging.
   */
  proto.resolveStep4AndTurnCompletion = function(state) {
    const resolver = global.SigilResolver;
    const engine = global.SigilEngine;

    // Ensure resonance and board sigils are freshly synchronized
    if (resolver && state.board) {
      resolver.syncBoardSigilTiles(state.board);
    }

    // Check for Resonant Detonations
    const resonantPairs = resolver?.resonantPairs || [];
    const resonantSigilIds = resolver?.resonantSigils || new Set();
    const resonantArchZoneIds = resolver?.resonantArchZoneIds || global.SigilEngine?.lastResonantArchZoneIds || new Set();
    const newlyForgedSpells = [];

    if ((resonantSigilIds.size > 0 || resonantArchZoneIds.size > 0) && resolver) {
      // Collect resonant sigils
      const resonantSigils = resolver.activeSigils.filter(s => resonantSigilIds.has(s.id));

      // Calculate points (credited +1 per arriving particle / token at the Score pod)
      const turnPoints = engine ? engine.calculateTotalPoints() : 0;
      state._creditedOverflowPts = 0;

      // Forge spells from formulas
      resonantSigils.forEach(sigil => {
        const spellDef = global.MaterialsData?.ELEMENTAL_SPELLS[sigil.formula];
        if (spellDef) {
          newlyForgedSpells.push({
            formula: sigil.formula,
            element: spellDef.element,
            name: spellDef.name,
            desc: spellDef.desc,
            color: global.MaterialsData?.COLOR_MAP?.[sigil.formula[0]]?.hex || '#38bdf8'
          });
        }
      });

      // Sort resonant sigils according to concentric Vertex Registry and tag drift destination
      const math = global.HexMath, tempCharges = new Map();
      (state.spellbook || []).forEach(s => tempCharges.set(s.formula || s.name, s.charges ?? 0));
      let curBookLen = (state.spellbook || []).length;
      const maxCap = state.spellbookCapacity || 6;
      resonantSigils.forEach(s => {
        if (!s.vertex && math?.findVertexForTiles) s.vertex = math.findVertexForTiles(s.tiles);
        s.vertexId = (s.vertex && math?.getVertexId) ? (math.getVertexId(s.vertex) || 999999) : 999999;
        const k = s.formula;
        if (tempCharges.has(k)) {
          const c = tempCharges.get(k);
          if (c < 3) { tempCharges.set(k, c + 1); s.targetDestination = 'spellbook'; }
          else { s.targetDestination = 'score'; }
        } else if (curBookLen < maxCap) {
          tempCharges.set(k, 1); curBookLen++; s.targetDestination = 'spellbook';
        } else {
          s.targetDestination = 'score';
        }
      });
      const clusterSigilPoints = new Map();
      const clusters = engine?.getClusters ? engine.getClusters() : [];
      clusters.forEach(cl => {
        (cl?.sigils || []).slice().sort((a, b) => a.vertexId - b.vertexId).forEach((s, idx) => {
          clusterSigilPoints.set(s.id, idx + 1);
        });
      });
      resonantSigils.sort((a, b) => a.vertexId - b.vertexId);
      resonantSigils.forEach((s, i) => { s.detonationIndex = i; s.pointValue = clusterSigilPoints.get(s.id) ?? (i + 1); });

      const onAllDetonationsComplete = () => {
        resonantSigilIds.forEach(id => {
          resolver.lockedSigilIds.delete(id); resolver.dormantSigilIds.delete(id); resolver.savedWildSelections?.delete(id);
        });

        // Remove resonant Arch pseudo-sigils from the board (resonant Phase-Arch disease is already handled in Step 3)
        if (resonantArchZoneIds.size > 0 && state.archZones) {
          state.archZones = state.archZones.filter(z => !resonantArchZoneIds.has(z.id) && !resonantArchZoneIds.has(`${z.center?.q},${z.center?.r}`));
        }

        const archCount = resonantArchZoneIds.size;
        const sigilMsg = `${resonantSigilIds.size} resonant sigil${resonantSigilIds.size !== 1 ? 's' : ''}`;
        const archMsg = archCount > 0 ? ` & ${archCount} arch flower${archCount !== 1 ? 's' : ''}` : '';
        state.showToast(`💥 +${turnPoints} PTS! Detonated ${sigilMsg}${archMsg}.`);

        const proceedToTokens = () => {
          const rr = global.BoardRippleRenderer;
          const hasTokens = rr && Array.isArray(rr.persistentSpellTokens) && rr.persistentSpellTokens.length > 0;
          if (global.LastBreathManager?.evaluateAndHoldResonantHeals) {
            global.LastBreathManager.evaluateAndHoldResonantHeals(state, rr?.persistentSpellTokens, newlyForgedSpells);
          }
          if (hasTokens && rr.startSpellTokensDrift) {
            state.cameraLocked = true;
            rr.startSpellTokensDrift('spellbook', () => {
              this.applySpellbookAdditions(state, newlyForgedSpells);
              rr.startSpellTokensDrift('score', () => {
                state.cameraLocked = false;
                this.processForgedSpellsAndCompletion(state, newlyForgedSpells);
              });
            });
          } else {
            this.processForgedSpellsAndCompletion(state, newlyForgedSpells);
          }
        };

        const opr = global.OrbitParticleRenderer;
        if (opr?.hasParticles?.()) {
          state.cameraLocked = true;
          setTimeout(() => opr.startScoreFunnel(() => proceedToTokens(), undefined, turnPoints), 500);
        } else {
          if (turnPoints > 0) {
            if (global.NativeStatPod?.awardArrivedScorePoint) global.NativeStatPod.awardArrivedScorePoint(turnPoints);
            else state.score += turnPoints;
          }
          proceedToTokens();
        }
      };

      // Adaptive overlapping cascade: base spacing 3 H-Beats, max start-to-last-start 12 H-Beats (6 H-Beats per sigil)
      const h1Sec = global.H_TIMING?.BEAT_SEC ?? (Math.pow(12, 8) / 1420405751.768);
      const h6Sec = global.H_TIMING?.SIX_BEATS_SEC ?? (6 * h1Sec);
      const count = resonantSigils.length;
      const stepBeats = count <= 1 ? 0 : (((count - 1) * 3 > 12) ? (12 / (count - 1)) : 3);
      const stepMs = stepBeats * h1Sec * 1000;
      let completedCount = 0;

      const startDetonationCascade = () => {
        if (count === 0) {
          onAllDetonationsComplete();
          return;
        }
        resonantSigils.forEach((sigil, i) => {
          const launch = () => {
            const onDone = () => {
              this.clearDetonatedSigilTiles(state, sigil.tiles);
              sigil.detonated = true;
              resolver?.lockedSigilIds?.delete(sigil.id); resolver?.dormantSigilIds?.delete(sigil.id); resolver?.savedWildSelections?.delete(sigil.id);
              resolver?.resonantSigils?.delete(sigil.id); state?.resonantSigils?.delete?.(sigil.id);
              if (++completedCount >= count) onAllDetonationsComplete();
            };
            if (global.BoardRippleRenderer?.playResonantSigilDetonation) global.BoardRippleRenderer.playResonantSigilDetonation(sigil, onDone, h6Sec);
            else onDone();
          };
          if (i === 0) launch();
          else setTimeout(launch, i * stepMs);
        });
      };

      if (global.BoardRippleRenderer?.fadeConnectedDormantEmblems) {
        global.BoardRippleRenderer.fadeConnectedDormantEmblems(resonantSigils, resonantArchZoneIds, startDetonationCascade, h1Sec);
      } else {
        startDetonationCascade();
      }
    } else if (state.inSigilStage && global.BoardRippleRenderer?.fadeConnectedDormantEmblems) {
      const h1Sec = global.H_TIMING?.BEAT_SEC ?? (Math.pow(12, 8) / 1420405751.768);
      global.BoardRippleRenderer.fadeConnectedDormantEmblems([], null, () => {
        this.processForgedSpellsAndCompletion(state, newlyForgedSpells);
      }, h1Sec);
    } else {
      this.processForgedSpellsAndCompletion(state, newlyForgedSpells);
    }
  };

  /**
   * Cleans board tiles affected by a detonating sigil.
   */
  proto.clearDetonatedSigilTiles = function(state, tileKeys) {
    if (!state?.board || !tileKeys) return;
    tileKeys.forEach(tk => {
      const tile = state.board.get(tk);
      if (!tile) return;
      if (tile.phased && tile.underneath) {
        const under = tile.underneath;
        if (under.color === 'disease' || under.plagueId) {
          const pId = under.plagueId || (global.ComponentDisease?.shapes ? Array.from(global.ComponentDisease.shapes.values()).find(s => s.components.some(c => c.key === tk))?.id : null);
          if (pId && global.ComponentDisease?.destroyPlagueShape) {
            global.ComponentDisease.destroyPlagueShape(pId, 'phase', tk);
            global.AudioSynth?.playDiseaseDestroy?.();
          }
        } else if (under.color) {
          tile.color = under.color; tile.sigilId = under.sigilId || null; tile.fortified = under.fortified || false;
          tile.lockOwner = under.lockOwner || null; tile.underneath = null; tile.phased = false; tile.phaseOwner = null;
          return;
        }
      }
      tile.color = null; tile.sigilId = null; tile.fortified = false; tile.lockOwner = null; tile.woven = false; tile.weaveOwner = null; tile.burned = false; tile.burnOwner = null; tile.phased = false; tile.phaseOwner = null; tile.underneath = null;
    });
  };

  /**
   * Step 5: Forged spells added to spellbook slots or recharged.
   */
  proto.applySpellbookAdditions = function(state, newlyForgedSpells) {
    if (!newlyForgedSpells) return;
    newlyForgedSpells.forEach(spell => {
      if (spell._heldForLastBreath) return;
      const existing = state.spellbook.find(s => s.formula === spell.formula || s.name?.toLowerCase() === spell.name?.toLowerCase());
      if (existing) {
        const maxC = existing.maxCharges || 3;
        if ((existing.charges ?? 0) < maxC) {
          existing.charges = (existing.charges ?? 0) + 1;
          state.showToast(`⚡ Recharged ${existing.name}! (${existing.charges}/${maxC} CHG)`);
          spell._addedToBook = true;
        }
      } else if (state.spellbook.length < state.spellbookCapacity) {
        state.spellbook.push({ ...spell, charges: 1, maxCharges: 3, usableRound: state.round, permanent: true });
        state.showToast(`📖 Unlocked ${spell.name} (1/3 CHG)!`);
        spell._addedToBook = true;
      }
    });
    global.UISidebars?.renderSpellbookUI?.();
    global.UISidebarDeck?.syncSpellbookColumnWithGameState?.();
  };

  /**
   * Routes un-added surplus spells to Overflow and transitions immediately to Damage Phase.
   */
  proto.processForgedSpellsAndCompletion = function(state, newlyForgedSpells) {
    if (newlyForgedSpells?.some(s => !s._addedToBook)) this.applySpellbookAdditions(state, newlyForgedSpells);
    state.overflowSpells = state.overflowSpells || [];
    newlyForgedSpells.forEach(spell => {
      if (!spell._addedToBook && !spell._heldForLastBreath) {
        state.overflowSpells.push({ ...spell });
        state.showToast(`⚡ Surplus ${spell.name} added to Overflow.`);
      }
    });

    if (typeof this.startDamagePhase === 'function') this.startDamagePhase(newlyForgedSpells);
    else if (this.resolveLastBreathAndDamage(newlyForgedSpells)) this.completeRoundAdvancement();
  };

  // Register with global Roll Call
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Turn_Manager_1.1', global.TurnManager);

})(typeof window !== 'undefined' ? window : this);
