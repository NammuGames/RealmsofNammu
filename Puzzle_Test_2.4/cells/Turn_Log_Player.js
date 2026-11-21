/**
 * @fileoverview cells/Turn_Log_Player.js - Player-Paced "Next" Log-Show & 3-HB Diff Cross-Fade
 * @description Advances through queued Pre-End -> Post-End turn snapshots one player entry per
 * "Next" press using a pure 3 H-Beat opacity cross-fade on only changed components and active
 * sigils (zero scale/shrink/pulse), while updating Stat Pods step-by-step.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  function tileSignature(c) {
    if (!c) return '';
    return JSON.stringify({
      color: c.color || null,
      fortified: !!c.fortified,
      burned: !!c.burned,
      phased: !!c.phased,
      woven: !!c.woven,
      plagueId: c.plagueId || null,
      under: c.underneath?.color || null,
      cov: c.coveredComponent?.color || null
    });
  }

  function sigilSignature(s) {
    if (!s) return '';
    return `${s.id || ''}:${s.formula || ''}:${(s.colors || []).join(',')}:${s.spell || ''}`;
  }

  class TurnLogPlayerClass {
    constructor() {
      this.active = false;
      this.stage = 'IDLE'; // 'IDLE' | 'TO_PRE' | 'VIEW_PRE' | 'TO_POST' | 'VIEW_POST'
      this.entry = null;
      this.fromSnap = null;
      this.toSnap = null;
      this.startMs = 0;
      this.durationMs = 1500;
      this.progress = 1.0;

      this.fadeInTileKeys = new Set();
      this.fadeOutTiles = []; // [{ k, comp }]
      this.fadeInSigilIds = new Set();
      this.fadeOutSigils = []; // [sigil]
      this.deferredTurnSnap = null; // Held target GameState snapshot for local START_TURN after backlog ends
      this._showingSnapshot = false;
    }

    reset() {
      this.active = false;
      this.stage = 'IDLE';
      this.entry = null;
      this.fromSnap = null;
      this.toSnap = null;
      this.progress = 1.0;
      this.fadeInTileKeys.clear();
      this.fadeOutTiles = [];
      this.fadeInSigilIds.clear();
      this.fadeOutSigils = [];
      this.deferredTurnSnap = null;
      this._showingSnapshot = false;
    }

    _getFadeDurationMs() {
      const h3Sec = global.H_TIMING?.THREE_BEATS_SEC ?? (3 * Math.pow(12, 8) / 1420405751.768);
      return Math.max(250, Math.round(h3Sec * 1000));
    }

    _computeDiff(fromSnap, toSnap) {
      this.fadeInTileKeys.clear();
      this.fadeOutTiles = [];
      this.fadeInSigilIds.clear();
      this.fadeOutSigils = [];

      const fromMap = new Map();
      (fromSnap?.components || []).forEach(c => { if (c?.k) fromMap.set(c.k, c); });
      const toMap = new Map();
      (toSnap?.components || []).forEach(c => { if (c?.k) toMap.set(c.k, c); });

      toMap.forEach((c, k) => {
        const prev = fromMap.get(k);
        if (!prev || tileSignature(prev) !== tileSignature(c)) {
          this.fadeInTileKeys.add(k);
        }
      });
      fromMap.forEach((c, k) => {
        const next = toMap.get(k);
        if (!next || tileSignature(prevOrNull(c)) !== tileSignature(next)) {
          this.fadeOutTiles.push({ k, comp: c });
        }
      });

      function prevOrNull(v) { return v; }

      const fromSig = new Map();
      (fromSnap?.activeSigils || []).forEach(s => { if (s?.id) fromSig.set(s.id, s); });
      const toSig = new Map();
      (toSnap?.activeSigils || []).forEach(s => { if (s?.id) toSig.set(s.id, s); });

      toSig.forEach((s, id) => {
        const prev = fromSig.get(id);
        if (!prev || sigilSignature(prev) !== sigilSignature(s)) {
          this.fadeInSigilIds.add(id);
        }
      });
      fromSig.forEach((s, id) => {
        const next = toSig.get(id);
        if (!next || sigilSignature(s) !== sigilSignature(next)) {
          this.fadeOutSigils.push(s);
        }
      });
    }

    _beginFade(fromSnap, toSnap, stageName) {
      const lm = global.TurnLogManager;
      if (!lm || !toSnap) return false;
      this.active = true;
      this._showingSnapshot = true;
      this.stage = stageName;
      this.fromSnap = fromSnap;
      this.toSnap = toSnap;
      this.startMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      this.durationMs = this._getFadeDurationMs();
      this.progress = 0.0;
      this._computeDiff(fromSnap, toSnap);
      lm.applyLogSnapshot(toSnap);
      global.GameState?.syncUI?.();
      global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
      return true;
    }

    _beginViewHold(stageName) {
      this.active = true;
      this._showingSnapshot = true;
      this.stage = stageName;
      this.startMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      this.durationMs = this._getFadeDurationMs();
      this.progress = 1.0;
      this.fadeInTileKeys.clear();
      this.fadeOutTiles = [];
      this.fadeInSigilIds.clear();
      this.fadeOutSigils = [];
      return true;
    }

    /** Triggered by the orange "Next" button (or Enter) to play or skip through one player's entry. */
    advanceOrSkip() {
      const lm = global.TurnLogManager;
      if (!lm) return false;

      if (!this.active) {
        const next = lm.shiftNextEntry();
        if (!next) {
          this._finishCaughtUp();
          return false;
        }
        const curSnap = lm.captureLogSnapshot('VIEW');
        this.entry = next;
        const target = next.preEnd || next.postEnd;
        const stage = next.preEnd ? 'TO_PRE' : 'TO_POST';
        return this._beginFade(curSnap, target, stage);
      }

      // Clicking "Next" during Pre-End fade or viewing jumps straight into Post-End fade
      if (this.stage === 'TO_PRE' || this.stage === 'VIEW_PRE') {
        this.progress = 1.0;
        const from = this.entry?.preEnd || this.toSnap;
        if (this.entry?.postEnd) {
          return this._beginFade(from, this.entry.postEnd, 'TO_POST');
        }
      }

      // Clicking "Next" during Post-End fade or hold finishes current entry and immediately advances
      this._completeCurrentEntry();
      if (lm.hasPendingEntries()) {
        return this.advanceOrSkip();
      }
      return true;
    }

    _completeCurrentEntry() {
      const lm = global.TurnLogManager;
      if (this.entry && lm) {
        lm.markViewed(this.entry.seq);
      }
      this.active = false;
      this.stage = 'IDLE';
      this.progress = 1.0;
      this.fadeInTileKeys.clear();
      this.fadeOutTiles = [];
      this.fadeInSigilIds.clear();
      this.fadeOutSigils = [];
      this.entry = null;

      if (!lm?.hasPendingEntries?.()) {
        this._finishCaughtUp();
      } else {
        global.GameState?.syncUI?.();
        global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
        global.BoardRenderer?.render?.();
      }
    }

    _finishCaughtUp() {
      const mc = global.MemoryCardManager;
      const g = global.GameState;
      const net = global.NetworkP2PManager;
      const deferred = this.deferredTurnSnap;
      this.deferredTurnSnap = null;
      this._showingSnapshot = false;

      if (deferred && mc?.restorePuzzleState) {
        mc.restorePuzzleState(deferred);
        return;
      }

      const isMyTurn = !net?.isConnected?.() || net.isLocalPlayersTurn();
      if (isMyTurn && g?.matchStarted && !g.gameOver && g.turnPhase === 'START_TURN') {
        global.TurnManager?.startPlayerTurn?.();
      } else {
        g?.syncUI?.();
        global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
        global.BoardRenderer?.render?.();
      }
    }

    update() {
      if (!this.active) return;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const raw = (now - this.startMs) / Math.max(1, this.durationMs);

      if (this.stage === 'TO_PRE' || this.stage === 'TO_POST') {
        this.progress = Math.max(0.0, Math.min(1.0, raw));
        if (this.progress < 1.0) return;
        if (this.stage === 'TO_PRE' && this.entry?.postEnd) {
          this._beginViewHold('VIEW_PRE');
        } else if (this.stage === 'TO_POST' && !global.TurnLogManager?.hasPendingEntries?.()) {
          this._beginViewHold('VIEW_POST');
        } else {
          this._completeCurrentEntry();
        }
      } else if (this.stage === 'VIEW_PRE') {
        this.progress = 1.0;
        if (raw >= 1.0) {
          if (this.entry?.postEnd) {
            this._beginFade(this.entry.preEnd || this.toSnap, this.entry.postEnd, 'TO_POST');
          } else {
            this._completeCurrentEntry();
          }
        }
      } else if (this.stage === 'VIEW_POST') {
        this.progress = 1.0;
        if (raw >= 1.0) {
          this._completeCurrentEntry();
        }
      }
    }

    getTileAlpha(q, r) {
      if (!this.active) return 1.0;
      return this.fadeInTileKeys.has(`${q},${r}`) ? this.progress : 1.0;
    }

    getSigilAlpha(sigilId) {
      if (!this.active) return 1.0;
      return this.fadeInSigilIds.has(sigilId) ? this.progress : 1.0;
    }

    /** Renders removed/replaced tiles at pure fading opacity (1 -> 0) over 3 H-Beats. */
    renderOutgoingComponents(ctx, math, originX, originY, hexRadius, elapsedTime) {
      if (!this.active || !this.fadeOutTiles.length || !ctx || !math) return;
      const alpha = Math.max(0, 1.0 - this.progress);
      if (alpha <= 0.005) return;

      const compR = hexRadius * (global.COSMOS_STATE?.placedScale || 0.65);
      const effR = hexRadius - 1.5;
      const batch = [];

      ctx.save();
      this.fadeOutTiles.forEach(({ k, comp }) => {
        if (!comp) return;
        const parts = k.split(',');
        const q = parseInt(parts[0], 10), r = parseInt(parts[1], 10);
        const { x, y } = math.hexToScreen(q, r, originX, originY, hexRadius);
        const sp = (Math.abs(Math.sin(q * 12.9898 + r * 78.233) * 43758.5453)) % 1.0;
        const st = (Math.abs(Math.cos(q * 39.346 + r * 11.135) * 24634.6345)) % 1.0;
        if (comp.fortified) math.drawHexagon(ctx, x, y, effR, null, `rgba(192,132,252,${0.6 * alpha})`, 2);
        else if (comp.burned) math.drawHexagon(ctx, x, y, effR, null, `rgba(239,68,68,${0.6 * alpha})`, 2);
        else if (comp.phased) math.drawHexagon(ctx, x, y, effR, null, `rgba(37,99,235,${0.6 * alpha})`, 2);
        else if (comp.woven) math.drawHexagon(ctx, x, y, effR, null, `rgba(253,224,71,${0.6 * alpha})`, 2);
        if (comp.color) {
          batch.push({ cx: x, cy: y, radius: comp.color === 'disease' && comp.coveredComponent ? compR * 0.8 : compR, colorName: comp.color, seedPhase: sp, seedTilt: st, customAlpha: alpha });
        }
      });
      if (batch.length && global.PolyhedronRenderer) {
        if (typeof global.PolyhedronRenderer.drawBatch === 'function') global.PolyhedronRenderer.drawBatch(ctx, batch, elapsedTime);
        else batch.forEach(it => global.PolyhedronRenderer.drawComponent(ctx, it.cx, it.cy, it.radius, it.colorName, elapsedTime, false, false, it.customAlpha, it.seedPhase, it.seedTilt));
      }
      ctx.restore();
    }

    /** Renders removed active sigil emblems at pure fading opacity (1 -> 0) over 3 H-Beats. */
    renderOutgoingSigils(ctx, math, originX, originY, hexRadius) {
      if (!this.active || !this.fadeOutSigils.length || !ctx || !math) return;
      const alpha = Math.max(0, 1.0 - this.progress);
      if (alpha <= 0.005) return;
      const emblemRenderer = global.SigilEmblemRenderer;
      const overlay = global.BoardOverlayRenderer;
      if (!emblemRenderer?.renderEmblem) return;
      const emblemR = Math.round(hexRadius * 0.60);
      if (emblemR < 1) return;

      ctx.save();
      this.fadeOutSigils.forEach((sigil) => {
        const v = sigil.vertex || (math.findVertexForTiles ? math.findVertexForTiles(sigil.tiles) : null);
        if (!v) return;
        const elemInfo = overlay?._getElemInfo ? overlay._getElemInfo(sigil.element) : { color: '#ff9214', sec: '#ffffff' };
        const { x: vx, y: vy } = math.vertexToScreen(v, originX, originY, hexRadius);
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.translate(vx, vy);
        emblemRenderer.renderEmblem(ctx, elemInfo, null, false, emblemR, 'wireframe');
        ctx.restore();
      });
      ctx.restore();
    }
  }

  const instance = new TurnLogPlayerClass();
  global.TurnLogPlayerClass = TurnLogPlayerClass;
  global.TurnLogPlayer = instance;
  global.ROLL_CALL = global.ROLL_CALL || new Map();
  global.ROLL_CALL.set('Turn_Log_Player', instance);
})(typeof window !== 'undefined' ? window : this);
