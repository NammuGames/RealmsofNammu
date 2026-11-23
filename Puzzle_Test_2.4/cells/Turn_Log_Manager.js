/**
 * @fileoverview cells/Turn_Log_Manager.js - Compact 2-Snapshot Turn Log & Reconnect Catch-Up
 * @description Captures lightweight Pre-End and Post-End snapshots (occupied board components,
 * active sigils, and Stat Pod telemetry — omitting re-derivable dormant sigils & alignments),
 * maintains the Host's authoritative Turn Log across turns/reloads, and queues unread entries
 * for the player-paced Log-Show. Strictly adheres to the 500-line hard cap.
 */

(function(global) {
  'use strict';

  function deepClone(obj) {
    return obj === undefined ? undefined : JSON.parse(JSON.stringify(obj));
  }

  function computeAve(score, round) {
    if (!round || round <= 0) return '0';
    const raw = (score || 0) / round;
    return String(raw >= 100 ? Math.round(raw) : Number(raw.toFixed(raw >= 10 ? 1 : 2)));
  }

  function snapshotStatsFromState(state) {
    const pid = state.currentPlayerId || 1;
    const round = state.round || 1;
    const score = state.score || 0;
    return {
      playerIndex: state.activePlayerIndex || 0,
      player: String(pid),
      turn: `P${pid}`,
      round,
      score,
      ave: computeAve(score, round),
      combo: state.getComboText ? String(state.getComboText()) : '0',
      hp: state.hp ?? 12,
      maxHp: state.maxHp || 12,
      pendingDamage: state.pendingDamage || 0,
      pendingHeal: state.pendingHeal || 0,
      componentsBag: deepClone(state.componentsBag || [])
    };
  }

  function canonicalizeSnapshot(snap) {
    if (!snap) return null;
    const comps = (snap.components || []).slice().sort((a, b) => (a?.k || '').localeCompare(b?.k || ''));
    const sigils = (snap.activeSigils || []).slice().sort((a, b) => (a?.id || '').localeCompare(b?.id || ''));
    const arches = (snap.archZones || []).slice().sort((a, b) => {
      const ka = `${a?.center?.q ?? 0},${a?.center?.r ?? 0}`;
      const kb = `${b?.center?.q ?? 0},${b?.center?.r ?? 0}`;
      return ka.localeCompare(kb);
    });
    const shapes = (snap.disease?.shapes || []).map(s => ({
      ...s,
      components: (s?.components || []).slice().sort((a, b) => (a?.key || '').localeCompare(b?.key || ''))
    })).sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')));
    return JSON.stringify({
      components: comps,
      disease: snap.disease ? { nextId: snap.disease.nextId || 0, shapes } : null,
      archZones: arches,
      activeSigils: sigils,
      stats: snap.stats || null
    });
  }

  function areLogSnapshotsEqual(a, b) {
    if (!a || !b) return false;
    return canonicalizeSnapshot(a) === canonicalizeSnapshot(b);
  }

  class TurnLogManagerClass {
    constructor() {
      this.matchId = null;
      this.nextSeq = 1;
      this.hostLog = [];       // Authoritative [{ seq, playerIndex, playerId, round, preEnd, postEnd, nextPlayerIndex, nextRound }]
      this.lastViewedSeq = 0;  // Highest seq already seen by local POV player
      this.pendingQueue = [];  // Unread entries queued for "Next" Log-Show
      this._pendingPreEnd = null;
      this._pendingMeta = null;
    }

    reset(matchId = null) {
      this.matchId = matchId;
      this.nextSeq = 1;
      this.hostLog = [];
      this.lastViewedSeq = 0;
      this.pendingQueue = [];
      this._pendingPreEnd = null;
      this._pendingMeta = null;
    }

    /**
     * Captures minimal snapshot: occupied board components, active sigils, and Stat Pod telemetry.
     * Dormant sigils and resonance alignments are omitted and re-derived locally on restore.
     */
    captureLogSnapshot(kind = 'PRE_END') {
      const g = global.GameState;
      if (!g) return null;

      const components = [];
      if (g.board) {
        for (const [k, t] of g.board.entries()) {
          if (!t) continue;
          const hasData = !!(
            t.color || t.sigilId || t.fortified || t.burned || t.phased ||
            t.woven || t.plagueId || t.underneath || t.coveredComponent
          );
          if (!hasData) continue;
          const entry = { k };
          if (t.color) entry.color = t.color;
          if (t.sigilId) entry.sigilId = t.sigilId;
          if (t.fortified) { entry.fortified = true; if (t.lockOwner) entry.lockOwner = t.lockOwner; }
          if (t.burned) { entry.burned = true; if (t.burnOwner) entry.burnOwner = t.burnOwner; }
          if (t.phased) { entry.phased = true; if (t.phaseOwner) entry.phaseOwner = t.phaseOwner; }
          if (t.woven) { entry.woven = true; if (t.weaveOwner) entry.weaveOwner = t.weaveOwner; if (t.weaveStep != null) entry.weaveStep = t.weaveStep; }
          if (t.plagueId) entry.plagueId = t.plagueId;
          if (t.underneath) entry.underneath = deepClone(t.underneath);
          if (t.coveredComponent) entry.coveredComponent = deepClone(t.coveredComponent);
          components.push(entry);
        }
      }

      const cd = global.ComponentDisease;
      const disease = cd ? {
        nextId: cd.nextId || 0,
        shapes: Array.from(cd.shapes?.values?.() || []).map(s => deepClone(s))
      } : null;

      const activeSigils = (global.SigilResolver?.activeSigils || g.activeSigils || []).map(s => ({
        id: s.id,
        vertex: deepClone(s.vertex),
        tiles: Array.isArray(s.tiles) ? s.tiles.slice() : [],
        formula: s.formula,
        spell: s.spell,
        colors: Array.isArray(s.colors) ? s.colors.slice() : [],
        isWild: !!s.isWild,
        wildPermutationIndex: s.wildPermutationIndex ?? 0,
        element: s.element,
        category: s.category
      }));

      return {
        kind,
        components,
        disease,
        archZones: deepClone(g.archZones || []),
        activeSigils,
        stats: snapshotStatsFromState(g)
      };
    }

    /** Applies a snapshot onto GameState + Stat Pods and extrapolates dormant sigils & alignments locally. */
    applyLogSnapshot(snap, opts = {}) {
      const g = global.GameState;
      if (!snap || !g || !g.board) return false;

      for (const tile of g.board.values()) {
        if (!tile) continue;
        tile.color = null; tile.sigilId = null;
        tile.fortified = false; tile.lockOwner = null;
        tile.burned = false; tile.burnOwner = null;
        tile.phased = false; tile.phaseOwner = null;
        tile.woven = false; tile.weaveOwner = null; tile.weaveStep = null;
        tile.plagueId = null; tile.underneath = null; tile.coveredComponent = null;
      }
      g.fortifiedTiles?.clear?.();

      (snap.components || []).forEach((c) => {
        const tile = g.board.get(c.k);
        if (!tile) return;
        if (c.color) tile.color = c.color;
        if (c.sigilId) tile.sigilId = c.sigilId;
        if (c.fortified) { tile.fortified = true; tile.lockOwner = c.lockOwner || null; g.fortifiedTiles?.add?.(c.k); }
        if (c.burned) { tile.burned = true; tile.burnOwner = c.burnOwner || null; }
        if (c.phased) { tile.phased = true; tile.phaseOwner = c.phaseOwner || null; }
        if (c.woven) { tile.woven = true; tile.weaveOwner = c.weaveOwner || null; tile.weaveStep = c.weaveStep ?? null; }
        if (c.plagueId) tile.plagueId = c.plagueId;
        if (c.underneath) tile.underneath = deepClone(c.underneath);
        if (c.coveredComponent) tile.coveredComponent = deepClone(c.coveredComponent);
      });

      if (global.ComponentDisease) {
        global.ComponentDisease.reset();
        if (snap.disease) {
          global.ComponentDisease.nextId = snap.disease.nextId || 0;
          (snap.disease.shapes || []).forEach(s => {
            if (s?.id) global.ComponentDisease.shapes.set(s.id, deepClone(s));
          });
        }
      }

      g.archZones = deepClone(snap.archZones || []);

      if (global.SigilResolver) {
        const sr = global.SigilResolver;
        const lockedIds = new Set();
        (snap.activeSigils || []).forEach(s => {
          if (!s?.id) return;
          lockedIds.add(s.id);
          if (s.isWild && s.formula) {
            sr.savedWildSelections?.set?.(s.id, {
              formula: s.formula,
              permIndex: s.wildPermutationIndex ?? 0
            });
          }
        });
        sr.lockedSigilIds = lockedIds;
        sr.activeSigils = (snap.activeSigils || []).map(s => deepClone(s));
        sr.isTransitionActive = false;
        sr.transitionProgress = 1.0;
        sr.newlyFormedSigilIds?.clear?.();
        sr.newlyFormedPairKeys?.clear?.();
        sr.activatingSigilIds?.clear?.();
        sr.deactivatingSigilIds?.clear?.();
        sr.growingPairKeys?.clear?.();
        sr.retractingPairKeys?.clear?.();
        sr.retractingPairs = [];
      }
      g.evaluateSigils?.();
      if (global.SigilResolver) {
        const sr = global.SigilResolver;
        sr.dormantSigilIds.clear();
        (sr.allCandidates || []).forEach(c => {
          if (c?.id && !sr.lockedSigilIds.has(c.id)) sr.dormantSigilIds.add(c.id);
        });
      }

      if (snap.stats && !opts.skipStats) {
        const st = snap.stats;
        const net = global.NetworkP2PManager;
        const povIdx = global.POVManager
          ? global.POVManager.getPOVIndex()
          : ((net?.isConnected?.() && net.getDefaultPausedPlayerIndex) ? net.getDefaultPausedPlayerIndex() : (g.activePlayerIndex || 0));
        const povPlayerId = g.players?.[povIdx]?.id || (povIdx + 1);
        global.NativeStatPod?.setStats?.({
          player: String(povPlayerId), turn: st.turn, round: st.round,
          score: st.score, ave: st.ave, combo: st.combo
        });
        global.NativeVitalityPod?.setHp?.(st.hp ?? 12, st.pendingDamage || 0, st.pendingHeal || 0);
        if (Array.isArray(st.componentsBag)) global.NativeVitalityPod?.setComponents?.(st.componentsBag);
      }

      if (!opts.skipRender) global.BoardRenderer?.render?.();
      return true;
    }

    /** Step 1 of End-Turn: capture Pre-End snapshot before detonations/burns/damage execute. */
    beginLocalEndTurn() {
      const g = global.GameState;
      if (!g) return null;
      this._pendingMeta = {
        playerIndex: g.activePlayerIndex || 0,
        playerId: g.currentPlayerId || 1,
        round: g.round || 1
      };
      this._pendingPreEnd = this.captureLogSnapshot('PRE_END');
      return this._pendingPreEnd;
    }

    /** Step 2A: capture Post-End board & ending player's settled stats BEFORE TurnManager swaps to next player. */
    capturePostEndSnapshot() {
      this._pendingPostEnd = this.captureLogSnapshot('POST_END');
      return this._pendingPostEnd;
    }

    areSnapshotsEqual(a, b) {
      return areLogSnapshotsEqual(a, b);
    }

    /** Step 2B: finalize Turn Log entry after active player/round rotation completes. */
    finishLocalEndTurn(afterMeta = {}) {
      const g = global.GameState;
      const preEnd = this._pendingPreEnd || this.captureLogSnapshot('PRE_END');
      const rawPostEnd = this._pendingPostEnd || this.captureLogSnapshot('POST_END');
      const postEnd = areLogSnapshotsEqual(preEnd, rawPostEnd) ? null : rawPostEnd;
      const meta = this._pendingMeta || {
        playerIndex: g?.activePlayerIndex || 0,
        playerId: g?.currentPlayerId || 1,
        round: g?.round || 1
      };
      this._pendingPreEnd = null;
      this._pendingPostEnd = null;
      this._pendingMeta = null;

      const seq = this.nextSeq++;
      const entry = {
        seq,
        playerIndex: meta.playerIndex,
        playerId: meta.playerId,
        round: meta.round,
        preEnd,
        postEnd,
        nextPlayerIndex: afterMeta.nextPlayerIndex ?? (g?.activePlayerIndex || 0),
        nextRound: afterMeta.nextRound ?? (g?.round || 1)
      };

      this.appendHostEntry(entry);
      // Outgoing player already watched their own End-Turn animations live
      this.markViewed(seq);
      return entry;
    }

    appendHostEntry(entry) {
      if (!entry || typeof entry.seq !== 'number') return false;
      if (this.hostLog.some(e => e.seq === entry.seq)) return false;
      this.hostLog.push(entry);
      this.hostLog.sort((a, b) => a.seq - b.seq);
      if (entry.seq >= this.nextSeq) this.nextSeq = entry.seq + 1;
      return true;
    }

    getEntriesAfter(afterSeq = 0) {
      return this.hostLog.filter(e => e && e.seq > afterSeq);
    }

    enqueueIncomingEntries(entries = []) {
      let added = 0;
      const seenSeqs = new Set(this.pendingQueue.map(e => e.seq));
      entries.forEach((e) => {
        if (!e || typeof e.seq !== 'number') return;
        if (e.seq <= this.lastViewedSeq || seenSeqs.has(e.seq)) return;
        this.appendHostEntry(e);
        this.pendingQueue.push(e);
        seenSeqs.add(e.seq);
        added++;
      });
      if (added > 0) this.pendingQueue.sort((a, b) => a.seq - b.seq);
      return added;
    }

    hasPendingEntries() { return this.pendingQueue.length > 0; }
    peekNextEntry() { return this.pendingQueue[0] || null; }
    shiftNextEntry() { return this.pendingQueue.shift() || null; }
    markViewed(seq) { if (typeof seq === 'number' && seq > this.lastViewedSeq) this.lastViewedSeq = seq; }

    exportState() {
      return {
        matchId: this.matchId,
        nextSeq: this.nextSeq,
        lastViewedSeq: this.lastViewedSeq,
        hostLog: deepClone(this.hostLog)
      };
    }

    importState(data) {
      if (!data || typeof data !== 'object') return false;
      this.matchId = data.matchId || this.matchId;
      this.hostLog = Array.isArray(data.hostLog) ? deepClone(data.hostLog) : [];
      const maxSeq = this.hostLog.reduce((m, e) => Math.max(m, e?.seq || 0), 0);
      this.nextSeq = Math.max(data.nextSeq || 1, maxSeq + 1);
      if (typeof data.lastViewedSeq === 'number') {
        this.lastViewedSeq = Math.max(this.lastViewedSeq, data.lastViewedSeq);
      }
      this.pendingQueue = this.hostLog.filter(e => e && e.seq > this.lastViewedSeq);
      return true;
    }
  }

  const instance = new TurnLogManagerClass();
  global.TurnLogManagerClass = TurnLogManagerClass;
  global.TurnLogManager = instance;
  global.ROLL_CALL = global.ROLL_CALL || new Map();
  global.ROLL_CALL.set('Turn_Log_Manager', instance);
})(typeof window !== 'undefined' ? window : this);
