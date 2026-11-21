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
      underPlague: c.underneath?.plagueId || null,
      cov: c.coveredComponent?.color || null,
      covPlague: c.coveredComponent?.plagueId || null
    });
  }

  function sigilSignature(s) {
    if (!s) return '';
    return `${s.id || ''}:${s.formula || ''}:${(s.colors || []).join(',')}:${s.spell || ''}:${s.element || ''}`;
  }

  const ENCH_PLASMA_RGB = { lock: '149, 63, 253', weave: '255, 247, 0', phase: '61, 110, 255', burn: '255, 51, 51' };

  function getZoneRgb(z, board) {
    const ench = (z?.center && global.SpellArch?.getArchEnchantmentAt)
      ? global.SpellArch.getArchEnchantmentAt(z.center.q, z.center.r)
      : (() => {
        const t = board?.get?.(`${z?.center?.q},${z?.center?.r}`);
        return !t ? null : (t.fortified ? 'lock' : t.woven ? 'weave' : t.phased ? 'phase' : t.burned ? 'burn' : null);
      })();
    return (ench && ENCH_PLASMA_RGB[ench]) || '249, 115, 22';
  }

  function diffMap(beforeMap, afterMap, sigFn, fadeInSet, fadeOutArr) {
    afterMap.forEach((v, k) => {
      const prev = beforeMap.get(k);
      if (!prev || sigFn(prev) !== sigFn(v)) fadeInSet.add(k);
    });
    beforeMap.forEach((v, k) => {
      const next = afterMap.get(k);
      if (!next || sigFn(v) !== sigFn(next)) fadeOutArr.push(v);
    });
  }

  function canonPairKey(a, b) {
    return a < b ? `${a}:::${b}` : `${b}:::${a}`;
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

      this._clearDiffs();
      this.deferredTurnSnap = null; // Held target GameState snapshot for local START_TURN after backlog ends
      this._showingSnapshot = false;
    }

    _clearDiffs() {
      this.fadeInTileKeys = new Set(); this.fadeOutTiles = [];
      this.fadeInSigilIds = new Set(); this.fadeOutSigils = [];
      this.fadeInDormantSigilIds = new Set(); this.fadeOutDormantSigils = [];
      this.fadeInAuroraKeys = new Set(); this.fadeOutAuroraPairs = [];
      this.fadeInPlasmaCapKeys = new Set(); this.fadeOutPlasmaCaps = [];
      this.fadeInPlasmaEdgeKeys = new Set(); this.fadeOutPlasmaEdges = [];
      this.fadeInDiseaseEdgeKeys = new Set(); this.fadeOutDiseaseEdges = [];
      this.fadeInDiseaseNodeKeys = new Set(); this.fadeOutDiseaseNodes = [];
    }

    reset() {
      this.active = false;
      this.stage = 'IDLE';
      this.entry = null;
      this.fromSnap = null;
      this.toSnap = null;
      this.progress = 1.0;
      this._clearDiffs();
      this.deferredTurnSnap = null;
      this._showingSnapshot = false;
    }

    _getFadeDurationMs() {
      const h3Sec = global.H_TIMING?.THREE_BEATS_SEC ?? (3 * Math.pow(12, 8) / 1420405751.768);
      return Math.max(250, Math.round(h3Sec * 1000));
    }

    _getEffectivePostEnd(entry) {
      if (!entry?.postEnd) return null;
      if (entry.preEnd && global.TurnLogManager?.areSnapshotsEqual?.(entry.preEnd, entry.postEnd)) return null;
      return entry.postEnd;
    }

    _captureDerivedScene() {
      const state = global.GameState, sr = global.SigilResolver, se = global.SigilEngine;
      const cd = global.ComponentDisease, math = global.HexMath;
      const activeSigils = new Map(), dormantSigils = new Map(), auroraPairs = new Map();
      const plasmaCaps = new Map(), plasmaEdges = new Map(), diseaseEdges = new Map(), diseaseNodes = new Map();
      if (!state) return { activeSigils, dormantSigils, auroraPairs, plasmaCaps, plasmaEdges, diseaseEdges, diseaseNodes };

      const getV = (s) => (s.vertex ? { ...s.vertex } : (math?.findVertexForTiles ? math.findVertexForTiles(s.tiles) : null));
      (sr?.activeSigils || []).forEach(s => {
        if (!s?.id || (sr?.lockedSigilIds && !sr.lockedSigilIds.has(s.id))) return;
        if (s.tiles?.every(tk => !state.board?.get(tk)?.color)) return;
        activeSigils.set(s.id, { id: s.id, element: s.element, formula: s.formula, spell: s.spell, colors: (s.colors || []).slice(), tiles: (s.tiles || []).slice(), vertex: getV(s), vertexId: s.vertexId });
      });
      (sr?.allCandidates || []).forEach(c => {
        if (!c?.id || !sr?.dormantSigilIds?.has?.(c.id)) return;
        dormantSigils.set(c.id, { id: c.id, element: c.element, formula: c.formula, spell: c.spell, tiles: (c.tiles || []).slice(), vertex: getV(c) });
      });
      (sr?.resonantPairs || []).forEach(([sA, sB]) => {
        if (!sA?.id || !sB?.id || sA.detonated || sB.detonated || !activeSigils.has(sA.id) || !activeSigils.has(sB.id)) return;
        const key = canonPairKey(sA.id, sB.id), [f, s] = sA.id < sB.id ? [sA, sB] : [sB, sA];
        auroraPairs.set(key, { key, sA: activeSigils.get(sA.id), sB: activeSigils.get(sB.id), sig: `${f.element || ''}:${s.element || ''}` });
      });

      const archZones = (state.archZones || []).filter(z => z?.center && z.id !== 'preview_arch');
      archZones.forEach(z => plasmaCaps.set(`${z.center.q},${z.center.r}`, { q: z.center.q, r: z.center.r, rgb: getZoneRgb(z, state.board) }));
      if (archZones.length > 0 && se?.getValidArchConnections) {
        const { interArchEdges, sigilArchEdges, diseaseArchEdges } = se.getValidArchConnections(Array.from(activeSigils.values()), archZones);
        (interArchEdges || []).forEach(([zA, zB]) => {
          if (!zA?.center || !zB?.center) return;
          const kA = `${zA.center.q},${zA.center.r}`, kB = `${zB.center.q},${zB.center.r}`;
          plasmaEdges.set(`ia:${kA < kB ? `${kA}|${kB}` : `${kB}|${kA}`}`, { typeA: 'hex', a: { ...zA.center }, typeB: 'hex', b: { ...zB.center }, rgb: getZoneRgb(zA, state.board) });
        });
        (sigilArchEdges || []).forEach(({ sigil, zone }) => {
          if (!sigil?.id || !zone?.center || sigil.detonated || !activeSigils.has(sigil.id)) return;
          const v = activeSigils.get(sigil.id).vertex || getV(sigil);
          if (v) plasmaEdges.set(`sa:${sigil.id}|${zone.center.q},${zone.center.r}`, { typeA: 'vertex', a: { ...v }, typeB: 'hex', b: { ...zone.center }, rgb: getZoneRgb(zone, state.board) });
        });
        (diseaseArchEdges || []).forEach(({ zone, tileKey }) => {
          if (!zone?.center || !tileKey) return;
          const [dq, dr] = tileKey.split(',').map(Number);
          plasmaEdges.set(`da:${tileKey}|${zone.center.q},${zone.center.r}`, { typeA: 'hex', a: { q: dq, r: dr }, typeB: 'hex', b: { ...zone.center }, rgb: ENCH_PLASMA_RGB.burn });
          if (!plasmaCaps.has(tileKey)) plasmaCaps.set(tileKey, { q: dq, r: dr, rgb: ENCH_PLASMA_RGB.burn });
        });
      }

      const isDisTile = (t, sId) => t && ((t.color === 'disease' && (t.plagueId === sId || !t.plagueId)) || (t.underneath && (t.underneath.color === 'disease' || t.underneath.plagueId === sId)));
      cd?.shapes?.forEach?.(shape => {
        const comps = shape?.components;
        if (!comps || comps.length < 2) return;
        for (let i = 0; i < comps.length; i++) {
          const c1 = comps[i];
          if (c1.onBoard && !isDisTile(state.board?.get(c1.key), shape.id)) continue;
          for (let j = i + 1; j < comps.length; j++) {
            const c2 = comps[j];
            if (c2.onBoard && !isDisTile(state.board?.get(c2.key), shape.id)) continue;
            const dist = math?.hexDistanceBetween ? math.hexDistanceBetween(c1.q, c1.r, c2.q, c2.r) : (math?.hexDistance ? math.hexDistance(c1.q - c2.q, c1.r - c2.r) : 999);
            if (dist !== 1) continue;
            const pairKey = c1.key < c2.key ? `${c1.key}|${c2.key}` : `${c2.key}|${c1.key}`;
            if (!diseaseEdges.has(pairKey)) {
              const diffQ = Math.abs(c2.q - c1.q), diffR = Math.abs(c2.r - c1.r);
              diseaseEdges.set(pairKey, { q1: c1.q, r1: c1.r, q2: c2.q, r2: c2.r, dirIndex: (diffQ === 1 && diffR === 1) ? 0 : (diffQ === 1 ? 1 : 2) });
            }
            if (!diseaseNodes.has(c1.key)) diseaseNodes.set(c1.key, { q: c1.q, r: c1.r });
            if (!diseaseNodes.has(c2.key)) diseaseNodes.set(c2.key, { q: c2.q, r: c2.r });
          }
        }
      });
      return { activeSigils, dormantSigils, auroraPairs, plasmaCaps, plasmaEdges, diseaseEdges, diseaseNodes };
    }

    _computeDiff(fromSnap, toSnap, beforeScene, afterScene) {
      this._clearDiffs();

      const fromMap = new Map(), toMap = new Map();
      (fromSnap?.components || []).forEach(c => { if (c?.k) fromMap.set(c.k, c); });
      (toSnap?.components || []).forEach(c => { if (c?.k) toMap.set(c.k, c); });

      toMap.forEach((c, k) => {
        const prev = fromMap.get(k);
        if (!prev || tileSignature(prev) !== tileSignature(c)) this.fadeInTileKeys.add(k);
      });
      fromMap.forEach((c, k) => {
        const next = toMap.get(k);
        if (!next || tileSignature(c) !== tileSignature(next)) this.fadeOutTiles.push({ k, comp: c });
      });

      if (beforeScene && afterScene) {
        diffMap(beforeScene.activeSigils, afterScene.activeSigils, sigilSignature, this.fadeInSigilIds, this.fadeOutSigils);
        diffMap(beforeScene.dormantSigils, afterScene.dormantSigils, sigilSignature, this.fadeInDormantSigilIds, this.fadeOutDormantSigils);
        diffMap(beforeScene.auroraPairs, afterScene.auroraPairs, p => p.sig, this.fadeInAuroraKeys, this.fadeOutAuroraPairs);
        diffMap(beforeScene.plasmaCaps, afterScene.plasmaCaps, c => c.rgb, this.fadeInPlasmaCapKeys, this.fadeOutPlasmaCaps);
        diffMap(beforeScene.plasmaEdges, afterScene.plasmaEdges, e => e.rgb, this.fadeInPlasmaEdgeKeys, this.fadeOutPlasmaEdges);
        diffMap(beforeScene.diseaseEdges, afterScene.diseaseEdges, () => '1', this.fadeInDiseaseEdgeKeys, this.fadeOutDiseaseEdges);
        diffMap(beforeScene.diseaseNodes, afterScene.diseaseNodes, () => '1', this.fadeInDiseaseNodeKeys, this.fadeOutDiseaseNodes);
      }
    }

    _beginFade(fromSnap, toSnap, stageName) {
      const lm = global.TurnLogManager;
      if (!lm || !toSnap) return false;
      const beforeScene = this._captureDerivedScene();
      this.active = true;
      this._showingSnapshot = true;
      this.stage = stageName;
      this.fromSnap = fromSnap;
      this.toSnap = toSnap;
      this.startMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      this.durationMs = this._getFadeDurationMs();
      this.progress = 0.0;
      lm.applyLogSnapshot(toSnap, { skipRender: true });
      const afterScene = this._captureDerivedScene();
      this._computeDiff(fromSnap, toSnap, beforeScene, afterScene);
      global.GameState?.syncUI?.();
      global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
      global.BoardRenderer?.render?.();
      return true;
    }

    _beginViewHold(stageName) {
      this.active = true;
      this._showingSnapshot = true;
      this.stage = stageName;
      this.startMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      this.durationMs = this._getFadeDurationMs();
      this.progress = 1.0;
      this._clearDiffs();
      return true;
    }

    /** Triggered by the orange "Next" button (or Enter) to play or skip through one player's entry. */
    advanceOrSkip() {
      const lm = global.TurnLogManager;
      if (!lm) return false;
      if (!this.active) {
        const next = lm.shiftNextEntry();
        if (!next) { this._finishCaughtUp(); return false; }
        this.entry = next;
        return this._beginFade(lm.captureLogSnapshot('VIEW'), next.preEnd || next.postEnd, next.preEnd ? 'TO_PRE' : 'TO_POST');
      }
      // Clicking "Next" during Pre-End fade or viewing jumps straight into Post-End fade if distinct
      if (this.stage === 'TO_PRE' || this.stage === 'VIEW_PRE') {
        this.progress = 1.0;
        const post = this._getEffectivePostEnd(this.entry);
        if (post) return this._beginFade(this.entry?.preEnd || this.toSnap, post, 'TO_POST');
      }
      // Clicking "Next" during Post-End fade or hold finishes current entry and immediately advances
      this._completeCurrentEntry();
      return lm.hasPendingEntries() ? this.advanceOrSkip() : true;
    }

    _completeCurrentEntry() {
      const lm = global.TurnLogManager;
      if (this.entry && lm) lm.markViewed(this.entry.seq);
      this.active = false; this.stage = 'IDLE'; this.progress = 1.0; this._clearDiffs(); this.entry = null;
      if (!lm?.hasPendingEntries?.()) { this._finishCaughtUp(); return; }
      global.GameState?.syncUI?.();
      global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
      global.BoardRenderer?.render?.();
    }

    _finishCaughtUp() {
      const mc = global.MemoryCardManager, g = global.GameState, net = global.NetworkP2PManager;
      const deferred = this.deferredTurnSnap;
      this.deferredTurnSnap = null;
      this._showingSnapshot = false;
      if (deferred && mc?.restorePuzzleState) { mc.restorePuzzleState(deferred); return; }
      const isMyTurn = !net?.isConnected?.() || net.isLocalPlayersTurn();
      if (isMyTurn && g?.matchStarted && !g.gameOver && g.turnPhase === 'START_TURN') {
        global.TurnManager?.startPlayerTurn?.();
      } else {
        g?.syncUI?.(); global.UIDeckSync?.syncMaterialsTrayWithGameState?.(); global.BoardRenderer?.render?.();
      }
    }

    update() {
      if (!this.active) return;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const raw = (now - this.startMs) / Math.max(1, this.durationMs);
      if (this.stage === 'TO_PRE' || this.stage === 'TO_POST') {
        this.progress = Math.max(0.0, Math.min(1.0, raw));
        if (this.progress < 1.0) return;
        const post = this._getEffectivePostEnd(this.entry);
        if (this.stage === 'TO_PRE' && post) this._beginViewHold('VIEW_PRE');
        else if ((this.stage === 'TO_POST' || (this.stage === 'TO_PRE' && !post)) && !global.TurnLogManager?.hasPendingEntries?.()) this._beginViewHold('VIEW_POST');
        else this._completeCurrentEntry();
      } else if (this.stage === 'VIEW_PRE') {
        this.progress = 1.0;
        if (raw >= 1.0) {
          const post = this._getEffectivePostEnd(this.entry);
          if (post) this._beginFade(this.entry.preEnd || this.toSnap, post, 'TO_POST');
          else this._completeCurrentEntry();
        }
      } else if (this.stage === 'VIEW_POST') {
        this.progress = 1.0;
        if (raw >= 1.0) this._completeCurrentEntry();
      }
    }

    getTileAlpha(q, r) { return (!this.active || !this.fadeInTileKeys.has(`${q},${r}`)) ? 1.0 : this.progress; }
    getSigilAlpha(id) { return (!this.active || !this.fadeInSigilIds.has(id)) ? 1.0 : this.progress; }
    getDormantSigilAlpha(id) { return (!this.active || !this.fadeInDormantSigilIds.has(id)) ? 1.0 : this.progress; }
    getAuroraProgress(a, b) { return (!this.active || !this.fadeInAuroraKeys.has(canonPairKey(a, b))) ? 1.0 : this.progress; }
    getPlasmaCapAlpha(q, r) { return (!this.active || !this.fadeInPlasmaCapKeys.has(`${q},${r}`)) ? 1.0 : this.progress; }
    getPlasmaEdgeAlpha(k) { return (!this.active || !this.fadeInPlasmaEdgeKeys.has(k)) ? 1.0 : this.progress; }
    getDiseaseEdgeAlpha(k) { return (!this.active || !this.fadeInDiseaseEdgeKeys.has(k)) ? 1.0 : this.progress; }
    getDiseaseNodeAlpha(k) { return (!this.active || !this.fadeInDiseaseNodeKeys.has(k)) ? 1.0 : this.progress; }
    hasOutgoingPlasma() { return !!(this.active && (this.fadeOutPlasmaEdges.length || this.fadeOutPlasmaCaps.length) && (1.0 - this.progress) > 0.005); }

    /** Renders removed/replaced tiles at pure fading opacity (1 -> 0) over 3 H-Beats. */
    renderOutgoingComponents(ctx, math, originX, originY, hexRadius, elapsedTime, renderOpts = null) {
      if (!this.active || !this.fadeOutTiles.length || !ctx || !math) return;
      const alpha = Math.max(0, 1.0 - this.progress);
      if (alpha <= 0.005) return;

      const compR = hexRadius * (global.COSMOS_STATE?.placedScale || 0.65);
      const effR = hexRadius - 1.5;
      const drawBezel = renderOpts?.drawBezelHex;
      const backBgOp = renderOpts?.backBgOp ?? 0.40;
      const backBorderOp = renderOpts?.backBorderOp ?? 0.80;
      const pGreyBg = renderOpts?.pGreyBg ?? backBgOp;
      const pGreyBorder = renderOpts?.pGreyBorder ?? backBorderOp;
      const drawRingOrBezel = (x, y, col, bgOp, borderOp) => {
        if (typeof drawBezel === 'function') drawBezel(x, y, effR, col, col, bgOp * alpha, borderOp * alpha);
        else math.drawHexagon(ctx, x, y, effR, null, col, 2);
      };
      const batch = [];

      ctx.save();
      this.fadeOutTiles.forEach(({ k, comp }) => {
        if (!comp) return;
        const parts = k.split(',');
        const q = parseInt(parts[0], 10), r = parseInt(parts[1], 10);
        const { x, y } = math.hexToScreen(q, r, originX, originY, hexRadius);
        const sp = (Math.abs(Math.sin(q * 12.9898 + r * 78.233) * 43758.5453)) % 1.0;
        const st = (Math.abs(Math.cos(q * 39.346 + r * 11.135) * 24634.6345)) % 1.0;
        const covered = comp.coveredComponent || (comp.color === 'disease' && comp.underneath?.color && comp.underneath.color !== 'disease' ? comp.underneath : null);

        if ((comp.phased || comp.burned) && comp.underneath?.color && global.PolyhedronRenderer) {
          global.PolyhedronRenderer.drawComponent(ctx, x, y, compR, comp.underneath.color, elapsedTime, false, false, 0.95 * alpha, sp, st);
        }
        if (comp.fortified) drawRingOrBezel(x, y, '#c084fc', backBgOp, backBorderOp);
        else if (comp.burned) drawRingOrBezel(x, y, '#ef4444', backBgOp, backBorderOp);
        else if (comp.phased) drawRingOrBezel(x, y, '#2563eb', backBgOp, backBorderOp);
        else if (comp.woven) drawRingOrBezel(x, y, '#fde047', backBgOp, backBorderOp);
        else if (comp.color === 'disease' && covered?.color) {
          if (global.PolyhedronRenderer) {
            global.PolyhedronRenderer.drawComponent(ctx, x, y, compR, covered.color, elapsedTime, false, false, 0.95 * alpha, sp, st);
          }
          if (typeof drawBezel === 'function') drawBezel(x, y, effR, '#64748b', '#94a3b8', pGreyBg * alpha, pGreyBorder * alpha);
        } else if (comp.color === 'disease' && comp.plagueId && global.ComponentDisease?.shapes?.get(comp.plagueId)?.offBoard) {
          if (typeof drawBezel === 'function') drawBezel(x, y, effR, '#64748b', '#94a3b8', pGreyBg * alpha, pGreyBorder * alpha);
        }
        if (comp.color) {
          batch.push({ cx: x, cy: y, radius: comp.color === 'disease' && covered ? compR * 0.8 : compR, colorName: comp.color, seedPhase: sp, seedTilt: st, customAlpha: alpha });
        }
      });
      if (batch.length && global.PolyhedronRenderer) {
        if (typeof global.PolyhedronRenderer.drawBatch === 'function') global.PolyhedronRenderer.drawBatch(ctx, batch, elapsedTime);
        else batch.forEach(it => global.PolyhedronRenderer.drawComponent(ctx, it.cx, it.cy, it.radius, it.colorName, elapsedTime, false, false, it.customAlpha, it.seedPhase, it.seedTilt));
      }
      ctx.restore();
    }

    _renderOutgoingEmblems(ctx, math, originX, originY, hexRadius, list, rScale, styleMode) {
      if (!this.active || !list.length || !ctx || !math) return;
      const alpha = Math.max(0, 1.0 - this.progress);
      if (alpha <= 0.005) return;
      const emblemRenderer = global.SigilEmblemRenderer;
      const overlay = global.BoardOverlayRenderer;
      const emblemR = Math.round(hexRadius * rScale);
      if (!emblemRenderer?.renderEmblem || emblemR < 1) return;

      ctx.save();
      list.forEach((sigil) => {
        const v = sigil.vertex || (math.findVertexForTiles ? math.findVertexForTiles(sigil.tiles) : null);
        if (!v) return;
        const elemInfo = overlay?._getElemInfo ? overlay._getElemInfo(sigil.element) : { color: '#ff9214', sec: '#ffffff' };
        const { x: vx, y: vy } = math.vertexToScreen(v, originX, originY, hexRadius);
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.translate(vx, vy);
        emblemRenderer.renderEmblem(ctx, elemInfo, null, false, emblemR, styleMode);
        ctx.restore();
      });
      ctx.restore();
    }

    renderOutgoingSigils(ctx, math, originX, originY, hexRadius) {
      this._renderOutgoingEmblems(ctx, math, originX, originY, hexRadius, this.fadeOutSigils, 0.60, 'wireframe');
    }

    renderOutgoingDormantSigils(ctx, math, originX, originY, hexRadius) {
      this._renderOutgoingEmblems(ctx, math, originX, originY, hexRadius, this.fadeOutDormantSigils, 0.32, 'dormant');
    }

    getOutgoingLockedTileStyles(overlay) {
      if (!this.active || !this.fadeOutSigils.length) return [];
      const alpha = Math.max(0, 1.0 - this.progress);
      if (alpha <= 0.005) return [];
      const styles = [];
      this.fadeOutSigils.forEach((s) => {
        const elem = overlay?._getElemInfo?.(s.element);
        const style = { bg: elem?.color || '#ffffff', stroke: elem?.secondary || elem?.sec || '#38bdf8', alpha };
        (s.tiles || []).forEach(tk => styles.push({ tk, style }));
      });
      return styles;
    }

    renderOutgoingAurora(ctx, math, originX, originY, hexRadius, time, oppositeAlpha, overlay) {
      const retractProgress = Math.max(0, 1.0 - this.progress) * oppositeAlpha;
      if (!this.active || !this.fadeOutAuroraPairs.length || retractProgress <= 0.005) return;
      const fx = global.AlignmentMotionFX;
      if (!fx?.drawAurora) return;
      const hexWidth = hexRadius * Math.sqrt(3);
      this.fadeOutAuroraPairs.forEach(({ sA, sB }) => {
        const vA = sA.vertex || math.findVertexForTiles?.(sA.tiles);
        const vB = sB.vertex || math.findVertexForTiles?.(sB.tiles);
        if (!vA || !vB) return;
        const pA = math.vertexToScreen(vA, originX, originY, hexRadius);
        const pB = math.vertexToScreen(vB, originX, originY, hexRadius);
        const vidA = sA.vertexId ?? (math.getVertexId ? (math.getVertexId(vA) || (Math.abs(vA.q * 17 + vA.r * 31) + 1)) : 1);
        const vidB = sB.vertexId ?? (math.getVertexId ? (math.getVertexId(vB) || (Math.abs(vB.q * 17 + vB.r * 31) + 2)) : 2);
        fx.drawAurora(ctx, pA, pB, time + 3.14 * Math.min(vidA, vidB), overlay._getElemInfo(sA.element), overlay._getElemInfo(sB.element), 0, hexWidth, retractProgress);
      });
    }

    renderOutgoingPlasma(ctx, math, originX, originY, hexRadius, time, baseArchAlpha, addCap) {
      const alpha = Math.max(0, 1.0 - this.progress) * baseArchAlpha;
      if (!this.active || alpha <= 0.005) return;
      const fx = global.AlignmentMotionFX;
      const hexWidth = hexRadius * Math.sqrt(3);
      const toPt = (type, pt) => (type === 'vertex' ? math.vertexToScreen(pt, originX, originY, hexRadius) : math.hexToScreen(pt.q, pt.r, originX, originY, hexRadius));
      if (fx?.drawPlasma) {
        this.fadeOutPlasmaEdges.forEach((e) => {
          fx.drawPlasma(ctx, toPt(e.typeA, e.a), toPt(e.typeB, e.b), time, hexWidth, false, e.rgb, alpha);
        });
      }
      if (addCap) {
        this.fadeOutPlasmaCaps.forEach((c) => addCap(math.hexToScreen(c.q, c.r, originX, originY, hexRadius), c.rgb, alpha));
      }
    }
  }

  const instance = new TurnLogPlayerClass();
  global.TurnLogPlayerClass = TurnLogPlayerClass;
  global.TurnLogPlayer = instance;
  global.ROLL_CALL = global.ROLL_CALL || new Map();
  global.ROLL_CALL.set('Turn_Log_Player', instance);
})(typeof window !== 'undefined' ? window : this);
