/**
 * @fileoverview cells/Sigil_Resolver_1.0.js - Candidate Graph, Locking & Cascade Resolution
 * @description Manages candidate evaluation, initial locking, cascading uncontested locks,
 * overlapping conflict arbitration, and 3 H-Beat sigil transition progress (Part 1 of multi-part SigilResolver cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  class SigilResolverManager {
    constructor() {
      this.allCandidates = []; this.overlapsMap = new Map();
      this.lockedSigilIds = new Set(); this.dormantSigilIds = new Set();
      this.selectedSigilId = null; this.sigilCursorVertex = { type: 'up', q: 0, r: 0 };
      this.activeSigils = []; this.resonantSigils = new Set();
      this.resonantArchZoneIds = new Set(); this.resonantPairs = [];
      this.inSigilStage = false; this.showSigilAlignments = false;
      this.savedWildSelections = new Map();
      this.newlyFormedSigilIds = new Set(); this.newlyFormedPairKeys = new Set();
      this.activatingSigilIds = new Set(); this.deactivatingSigilIds = new Set();
      this.growingPairKeys = new Set(); this.retractingPairKeys = new Set(); this.retractingPairs = [];
      this.isTransitionActive = false; this.transitionProgress = 1.0;
    }

    get activeSigilIds() { return this.lockedSigilIds; }
    set activeSigilIds(v) { this.lockedSigilIds = v; }

    /**
     * Resets candidate and cursor tracking for a fresh round.
     */
    clear() {
      this.allCandidates = []; this.overlapsMap.clear(); this.dormantSigilIds.clear();
      this.selectedSigilId = null; this.sigilCursorVertex = { type: 'up', q: 0, r: 0 };
      this.inSigilStage = false; this.showSigilAlignments = false; this.resonantPairs = [];
      this.resonantArchZoneIds = new Set(); this.savedWildSelections.clear();
      this.newlyFormedSigilIds.clear(); this.newlyFormedPairKeys.clear();
      this.activatingSigilIds.clear(); this.deactivatingSigilIds.clear();
      this.growingPairKeys.clear(); this.retractingPairKeys.clear(); this.retractingPairs = [];
      this.isTransitionActive = false; this.transitionProgress = 1.0;
    }

    /**
     * Scans the board for all 3-hex triangle candidates and builds the overlap graph.
     * @param {Map} board
     */
    evaluateSigils(board) {
      if (!global.SigilEngine) return;
      if (this.allCandidates) {
        for (const c of this.allCandidates) {
          if (c.isWild && c.formula) {
            this.savedWildSelections.set(c.id, {
              formula: c.formula,
              formulaIndex: c.formulaIndex,
              permIndex: c.wildPermutationIndex ?? 0
            });
          }
        }
      }
      this.allCandidates = global.SigilEngine.findCandidates(board);
      if (this.savedWildSelections.size > 0) {
        for (const cand of this.allCandidates) {
          if (!cand.isWild || !this.savedWildSelections.has(cand.id)) continue;
          const saved = this.savedWildSelections.get(cand.id);
          if (saved && cand.validFormulas) {
            const idx = cand.validFormulas.findIndex(f => (typeof f === 'string' ? f : f.formula) === saved.formula);
            if (idx !== -1) {
              cand.formulaIndex = idx;
              const fDef = cand.validFormulas[idx];
              cand.formula = typeof fDef === 'string' ? fDef : fDef.formula;
              cand.spell = fDef.name || cand.spell;
              cand.element = fDef.element || cand.element;
              if (global.ComponentEther?.applyWildAssignment) {
                global.ComponentEther.applyWildAssignment(cand, saved.permIndex ?? 0);
              }
            }
          }
        }
      }
      this.overlapsMap = global.SigilEngine.computeOverlaps(this.allCandidates);
      this.syncBoardSigilTiles(board);
    }

    /**
     * Resolves initial sigil locks after a piece is placed:
     * - Candidates with 0 overlaps are automatically locked.
     * - Overlapping candidates: randomly select 1 to lock, marking partners dormant.
     * - Cascades uncontested dormant candidates to locked.
     * @param {Map} board
     */
    resolveInitialSigils(board, options = {}) {
      const validCandIds = new Set(this.allCandidates.map(c => c.id));
      const rawLocked = Array.from(this.lockedSigilIds).filter(id => validCandIds.has(id));
      const prioritySet = options.prioritizeIds ? new Set(options.prioritizeIds) : null;
      if (prioritySet && prioritySet.size > 0) {
        rawLocked.sort((a, b) => (prioritySet.has(a) === prioritySet.has(b) ? 0 : (prioritySet.has(a) ? -1 : 1)));
      }
      const previouslyLocked = new Set();
      for (const id of rawLocked) {
        const oids = this.overlapsMap.get(id) || new Set();
        const conflictsWithAccepted = Array.from(oids).some(oid => previouslyLocked.has(oid));
        if (!conflictsWithAccepted) previouslyLocked.add(id);
      }
      const previouslyDormant = new Set(this.dormantSigilIds);
      const previouslyPairs = new Set((this.resonantPairs || []).flatMap(p => [`${p[0]?.id}:::${p[1]?.id}`, `${p[1]?.id}:::${p[0]?.id}`]));

      this.lockedSigilIds = new Set(previouslyLocked);
      this.dormantSigilIds.clear();

      const unassigned = new Set(this.allCandidates.map(c => c.id));

      // Retain previously locked sigils and mark their overlapping partners dormant
      this.lockedSigilIds.forEach(lockedId => {
        unassigned.delete(lockedId);
        (this.overlapsMap.get(lockedId) || []).forEach(oid => {
          if (unassigned.has(oid)) { this.dormantSigilIds.add(oid); unassigned.delete(oid); }
        });
      });

      // Singletons with 0 overlaps auto-lock
      for (const cand of this.allCandidates) {
        if (!unassigned.has(cand.id)) continue;
        const oids = this.overlapsMap.get(cand.id) || new Set();
        if (oids.size === 0) { this.lockedSigilIds.add(cand.id); unassigned.delete(cand.id); }
      }

      // Contested candidates: choose 1 to lock (deterministic sorted order for synced online starts)
      while (unassigned.size > 0) {
        const idList = Array.from(unassigned);
        if (options.deterministic) idList.sort();
        const chosenId = options.deterministic ? idList[0] : idList[Math.floor(Math.random() * idList.length)];
        this.lockedSigilIds.add(chosenId);
        unassigned.delete(chosenId);
        (this.overlapsMap.get(chosenId) || []).forEach(oid => {
          if (unassigned.has(oid)) { this.dormantSigilIds.add(oid); unassigned.delete(oid); }
        });
      }

      this.cascadeLockResolutions();
      this.syncBoardSigilTiles(board);

      // Identify newly formed active/dormant sigils and newly resonant pairs
      const newActive = Array.from(this.lockedSigilIds).filter(id => !previouslyLocked.has(id));
      const newDormant = Array.from(this.dormantSigilIds).filter(id => !previouslyDormant.has(id));
      const newPairs = (this.resonantPairs || []).filter(p => !previouslyPairs.has(`${p[0]?.id}:::${p[1]?.id}`));
      this.newlyFormedSigilIds = new Set([...newActive, ...newDormant]);
      this.newlyFormedPairKeys = new Set(newPairs.flatMap(p => [`${p[0]?.id}:::${p[1]?.id}`, `${p[1]?.id}:::${p[0]?.id}`]));
      if (options.animate === false) {
        this.newlyFormedSigilIds.clear(); this.newlyFormedPairKeys.clear();
        if (typeof options.onComplete === 'function') options.onComplete();
      } else if (this.hasNewSigilTransition()) {
        this.playSigilTransition(options.onComplete, options.durationSec);
      } else if (typeof options.onComplete === 'function') {
        options.onComplete();
      }
    }

    /**
     * Checks if new active/dormant sigils or connection pairs formed and need animation.
     * @returns {boolean}
     */
    hasNewSigilTransition() {
      return (this.newlyFormedSigilIds?.size > 0 || this.newlyFormedPairKeys?.size > 0
        || this.activatingSigilIds?.size > 0 || this.deactivatingSigilIds?.size > 0);
    }

    /**
     * Executes the simultaneous 3 H-Beats (~908ms) transition for newly formed sigils, themed tiles, and ribbons.
     * @param {Function} [onComplete]
     * @param {number} [durationSec] Defaults to 3 H-Beats (~0.908s)
     */
    playSigilTransition(onComplete, durationSec = (global.H_TIMING?.THREE_BEATS_SEC ?? (3 * Math.pow(12, 8) / 1420405751.768))) {
      if (!this.hasNewSigilTransition()) {
        if (typeof onComplete === 'function') onComplete();
        return;
      }
      const dur = durationSec;
      this.isTransitionActive = true;
      this.transitionProgress = 0.0;

      const finishAnim = () => {
        this.transitionProgress = 1.0;
        this.isTransitionActive = false;
        this.newlyFormedSigilIds.clear();
        this.newlyFormedPairKeys.clear();
        this.activatingSigilIds.clear();
        this.deactivatingSigilIds.clear();
        this.growingPairKeys.clear();
        this.retractingPairKeys.clear();
        this.retractingPairs = [];
        global.BoardRenderer?.render?.();
        if (typeof onComplete === 'function') onComplete();
      };

      if (global.BoardRippleRenderer?.activeRipples) {
        const ripples = global.BoardRippleRenderer.activeRipples;
        for (let i = ripples.length - 1; i >= 0; i--) { if (ripples[i].type === 'sigil_transition') ripples.splice(i, 1); }
        ripples.push({
          type: 'sigil_transition', coords: [], color: '#ffffff', elapsed: 0, duration: dur, maxRadius: 0, thickness: 0, bands: 0, alpha0: 0,
          onTick: (t) => { this.transitionProgress = Math.max(0.0, Math.min(1.0, t)); global.BoardRenderer?.render?.(); },
          onComplete: finishAnim
        });
      } else {
        const start = performance.now();
        const step = () => {
          const t = Math.min(1.0, (performance.now() - start) / (dur * 1000));
          this.transitionProgress = t;
          global.BoardRenderer?.render?.();
          if (t < 1.0) requestAnimationFrame(step);
          else finishAnim();
        };
        requestAnimationFrame(step);
      }
    }

    /**
     * Cascading lock resolution:
     * If a dormant candidate has 0 overlapping partners currently in the locked set,
     * it automatically promotes to locked.
     */
    cascadeLockResolutions() {
      let changed = true;
      while (changed) {
        changed = false;
        const dormantList = Array.from(this.dormantSigilIds);
        for (const dId of dormantList) {
          const oids = this.overlapsMap.get(dId) || new Set();
          const hasLockedOverlap = Array.from(oids).some(oid => this.lockedSigilIds.has(oid));
          if (!hasLockedOverlap) {
            this.dormantSigilIds.delete(dId);
            this.lockedSigilIds.add(dId);
            changed = true;
            break;
          }
        }
      }
    }

    /**
     * Promotes a dormant candidate to locked, demoting any conflicting locked partners to dormant.
     * @param {string} chosenId
     * @param {Map} board
     * @returns {boolean}
     */
    placeDormantSigil(chosenId, board) {
      const isDormant = this.dormantSigilIds.has(chosenId) ||
        (this.allCandidates && this.allCandidates.some(c => c.id === chosenId && (!this.lockedSigilIds || !this.lockedSigilIds.has(chosenId))));
      if (!isDormant) return false;

      const prevLocked = new Set(this.lockedSigilIds);
      const prevPairs = this.resonantPairs ? [...this.resonantPairs] : [];

      this.dormantSigilIds.delete(chosenId);
      this.lockedSigilIds.add(chosenId);

      const oids = this.overlapsMap.get(chosenId) || new Set();
      oids.forEach(oid => {
        if (this.lockedSigilIds.has(oid)) { this.lockedSigilIds.delete(oid); this.dormantSigilIds.add(oid); }
      });

      this.cascadeLockResolutions();
      this.syncBoardSigilTiles(board);

      this.newlyFormedSigilIds.clear(); this.newlyFormedPairKeys.clear();
      this.activatingSigilIds = new Set(Array.from(this.lockedSigilIds).filter(id => !prevLocked.has(id)));
      this.deactivatingSigilIds = new Set(Array.from(prevLocked).filter(id => !this.lockedSigilIds.has(id)));
      this.growingPairKeys = new Set();
      this.retractingPairKeys = new Set();
      this.retractingPairs = [];

      const prevPairSet = new Set(prevPairs.flatMap(([a, b]) => [`${a.id}:::${b.id}`, `${b.id}:::${a.id}`]));
      const newPairs = this.resonantPairs || [];
      const newPairSet = new Set(newPairs.flatMap(([a, b]) => [`${a.id}:::${b.id}`, `${b.id}:::${a.id}`]));

      newPairs.forEach(([sA, sB]) => {
        if (!prevPairSet.has(`${sA.id}:::${sB.id}`)) {
          this.growingPairKeys.add(`${sA.id}:::${sB.id}`);
          this.growingPairKeys.add(`${sB.id}:::${sA.id}`);
        }
      });
      prevPairs.forEach(([pa, pb]) => {
        if (!newPairSet.has(`${pa.id}:::${pb.id}`)) {
          this.retractingPairKeys.add(`${pa.id}:::${pb.id}`);
          this.retractingPairKeys.add(`${pb.id}:::${pa.id}`);
          this.retractingPairs.push([pa, pb]);
        }
      });

      global.AudioSynth?.playClick?.();
      this.playSigilTransition(null, global.H_TIMING?.THREE_BEATS_SEC ?? (3 * Math.pow(12, 8) / 1420405751.768));
      return true;
    }
  }

  const sigilResolverInstance = new SigilResolverManager();
  global.SigilResolverClass = SigilResolverManager;
  global.SigilResolver = sigilResolverInstance;
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Sigil_Resolver_1.0', sigilResolverInstance);
})(typeof window !== 'undefined' ? window : this);
