/**
 * @fileoverview cells/Audio_Synth_1.1.js - Offline Baking, SFX Playback & BGM Engine
 * @description Attaches offline FX baking, prebake queueing, public SFX methods, and the 3+1 H-Breath
 * ambient loop onto AudioSynthClass and instantiates the singleton (Part 2 of multi-part AudioSynth cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */
(function(global) {
  'use strict';

  const SoundEngine = global.AudioSynthClass;
  const proto = SoundEngine?.prototype;
  if (!proto || !SoundEngine._defs) {
    console.error('[Audio_Synth_1.1] AudioSynthClass is not defined. Ensure Audio_Synth_1.0.js is loaded first.');
    return;
  }

  const { SETS, NOTES, resolveNoteIndex, MAX_ACTIVE_SOURCES } = SoundEngine._defs;
  const H_BEAT_SEC = global.H_TIMING.BEAT_SEC;
  const H_BREATH_SEC = global.H_TIMING.BREATH_SEC;

  proto._attachOfflineFx = function(offCtx, dryBus, fx, sr) {
    if (fx.rev) {
      const revSend = offCtx.createGain(); revSend.gain.setValueAtTime(0.80, 0);
      const revLP = offCtx.createBiquadFilter(); revLP.type = 'lowpass';
      revLP.frequency.setValueAtTime(7200, 0); revLP.Q.value = 0.45;
      const conv = offCtx.createConvolver();
      const [L, R] = this._getImpulseData(sr, fx.rev, fx.drop || 1.35);
      const imp = offCtx.createBuffer(2, L.length, sr);
      imp.copyToChannel(L, 0); imp.copyToChannel(R, 1);
      conv.buffer = imp;
      const revRet = offCtx.createGain(); revRet.gain.setValueAtTime(0.58, 0);
      dryBus.connect(revSend); revSend.connect(revLP); revLP.connect(conv);
      conv.connect(revRet); revRet.connect(offCtx.destination);
    }
    if (fx.dly) {
      const dlySend = offCtx.createGain(); dlySend.gain.setValueAtTime(0.60, 0);
      const dlyNode = offCtx.createDelay(2.0); dlyNode.delayTime.setValueAtTime(0.32, 0);
      const dlyLP = offCtx.createBiquadFilter(); dlyLP.type = 'lowpass';
      dlyLP.frequency.setValueAtTime(2400, 0); dlyLP.Q.value = 0.707;
      const dlyFb = offCtx.createGain(); dlyFb.gain.setValueAtTime(0.45, 0);
      const dlyRet = offCtx.createGain(); dlyRet.gain.setValueAtTime(0.50, 0);
      dryBus.connect(dlySend); dlySend.connect(dlyNode); dlyNode.connect(dlyLP);
      dlyLP.connect(dlyFb); dlyFb.connect(dlyNode);
      dlyLP.connect(dlyRet); dlyRet.connect(offCtx.destination);
    }
  };

  proto._bakeSet = async function(setId, noteIdx) {
    const key = `${setId}_${noteIdx}`;
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.pending.has(key)) return this.pending.get(key);

    const job = (async () => {
      if (!this.ctx) this.init();
      if (!this.ctx) return null;
      const def = SETS[setId], baseFreq = NOTES[noteIdx].freq;
      const seq = def.seq || [[0, 0, 1.0]];
      const lastDelay = seq.reduce((m, s) => Math.max(m, s[1]), 0);
      const tail = Math.max(def.fx.rev ? Math.min(8.2, def.fx.rev) : 0, def.fx.dly ? 1.4 : 0);
      const totalSec = Math.min(13.5, lastDelay + def.v.atk + def.v.dec + tail + 0.15);
      const sr = this.ctx.sampleRate || 44100;
      const OffCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const offCtx = new OffCtx(2, Math.max(1024, Math.floor(totalSec * sr)), sr);

      const dryBus = offCtx.createGain(); dryBus.gain.setValueAtTime(1.0, 0); dryBus.connect(offCtx.destination);
      this._attachOfflineFx(offCtx, dryBus, def.fx, sr);

      const seqScale = seq.length > 1 ? 1.0 / Math.sqrt(Math.min(4, seq.length)) : 1.0;
      seq.forEach(([semi, delay, gain]) => {
        this._scheduleVoice(offCtx, dryBus, baseFreq * Math.pow(2, semi / 12), def.v, seqScale * gain, delay);
      });

      const trimmed = this._trimBuffer(await offCtx.startRendering());
      this.cache.set(key, trimmed);
      return trimmed;
    })().finally(() => this.pending.delete(key));

    this.pending.set(key, job);
    return job;
  };

  proto._queuePrebake = function() {
    const queue = [];
    // Pre-bake menu/board click notes (MVB) first so early menu interactions never wait on heavy reverbs
    for (let i = 0; i < 12; i++) queue.push(['MVB', i]);
    for (let i = 0; i < 12; i++) queue.push(['SPK', i]);
    for (let i = 0; i < 12; i++) queue.push(['CFL', i]);
    queue.push(['XDM', SETS.XDM.idx], ['DGS', SETS.DGS.idx], ['GSF', SETS.GSF.idx], ['GDA', SETS.GDA.idx]);
    for (let i = 0; i < 12; i++) queue.push(['PWM', i], ['DGD', i], ['SPM', i]);
    for (let i = 0; i < 12; i++) queue.push(['BGM', i]);
    const isMobileBake = !!(global.DevicePerfProfile?.isLiteMode?.() || (typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)')?.matches || Math.min(window.innerWidth || 999, window.innerHeight || 999) <= 560)));
    const step = () => {
      if (!queue.length) return;
      const [id, idx] = queue.shift();
      const delay = isMobileBake ? (id === 'BGM' ? 260 : 45) : (id === 'BGM' ? 120 : 8);
      this._bakeSet(id, idx).finally(() => setTimeout(step, delay));
    };
    setTimeout(step, 0);
  };

  proto._playSet = function(setId, noteIdx = null, volumeScale = 1.0, delaySec = 0) {
    this.init();
    if (!this.ctx || !this.polyBus) return;
    if (!this.unlocked && this.ctx.state !== 'running') return;
    const idx = noteIdx !== null ? resolveNoteIndex(noteIdx) : SETS[setId].idx;
    const key = `${setId}_${idx}`;

    const playNow = (buf) => {
      if (!buf || !this.ctx || !this.polyBus) return;
      while (this.activeSources.length >= MAX_ACTIVE_SOURCES) {
        const old = this.activeSources.shift();
        try { old.src.stop(); } catch (e) {}
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      const mult = this.setVolumes[setId] !== undefined ? this.setVolumes[setId] : 1.0;
      g.gain.setValueAtTime(volumeScale * mult, this.ctx.currentTime + delaySec);
      src.connect(g);
      g.connect(this.polyBus);
      const entry = { src, g, setId, baseScale: volumeScale };
      this.activeSources.push(entry);
      src.onended = () => {
        const i = this.activeSources.indexOf(entry);
        if (i !== -1) this.activeSources.splice(i, 1);
      };
      src.start(this.ctx.currentTime + delaySec);
    };

    const startBuf = (buf) => {
      if (!buf || !this.ctx) return;
      if (this.ctx.state === 'running') {
        playNow(buf);
        return;
      }
      if (this.unlocked && this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => playNow(buf)).catch(() => {});
      }
    };

    const cached = this.cache.get(key);
    if (cached) startBuf(cached);
    else this._bakeSet(setId, idx).then(startBuf).catch(() => {});
  };

  proto.setSetVolume = function(setId, mult) {
    if (!(setId in this.setVolumes)) return;
    const v = Math.max(0, Math.min(2.0, Number.isFinite(Number(mult)) ? Number(mult) : 1.0));
    this.setVolumes[setId] = v;
    if (this.ctx) this.activeSources.forEach(e => {
      if (e.setId === setId && e.g) e.g.gain.setTargetAtTime(e.baseScale * v, this.ctx.currentTime, 0.015);
    });
  };
  proto.getSetBaseVolumes = function() { return Object.fromEntries(Object.keys(SETS).map(k => [k, SETS[k].v.vol])); };

  // ======================================================================
  // PUBLIC ELEMENT API + LEGACY COMPATIBILITY METHODS
  // ======================================================================
  proto.playConfirm = function(keyOrIdx) { this._playSet('CFL', keyOrIdx !== undefined ? resolveNoteIndex(keyOrIdx, SETS.CFL.idx) : SETS.CFL.idx); };
  proto.playEnchantmentExpiration = function(types) {
    const list = Array.from(new Set(Array.isArray(types) ? types : [types])).filter(Boolean);
    if (list.length === 0) return;
    const gain = 1.0 / Math.sqrt(list.length);
    list.forEach(type => this._playSet('SPM', resolveNoteIndex(type, SETS.SPM.idx), gain));
  };
  proto.playCancel = function()          { this._playSet('XDM'); };
  proto.playMove = function(noteIdx)     { const now = performance.now(); if (now - this.lastMoveMs < (H_BEAT_SEC * 1000 / 6)) return; this.lastMoveMs = now; this._playSet('MVB', noteIdx !== undefined ? noteIdx : Math.floor(Math.random() * 12)); };
  proto.playMaterialBurst = function(count = 4, spacingMs = (22 / 144) * 1000, volumeScale = 1.0) {
    const n = Math.max(1, Math.min(12, count | 0));
    const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    const rawMs = Number(spacingMs);
    const stepSec = Math.max(0, Number.isFinite(rawMs) ? rawMs : (22 / 144) * 1000) / 1000;
    const gain = Math.max(0, Number.isFinite(Number(volumeScale)) ? Number(volumeScale) : 1.0);
    for (let i = 0; i < n; i++) {
      this._playSet('MVB', pool[i], gain, i * stepSec);
    }
  };
  proto.playSpell = function(keyOrIdx)   { this._playSet('SPK', resolveNoteIndex(keyOrIdx, 7)); };
  proto.playReward = function(keyOrIdx)  { this._playSet('PWM', keyOrIdx !== undefined ? resolveNoteIndex(keyOrIdx, SETS.PWM.idx) : SETS.PWM.idx); };
  proto.playDamage = function()          { this._playSet('DGS'); };
  proto.playGameStartFinish = function() { this._playSet('GSF'); };
  proto.playGameOver = function()        { this._playSet('GDA'); };

  proto.playScoreTick = function() {
    const now = performance.now();
    if (now - this.lastTickMs < (H_BEAT_SEC * 1000 / 6)) return;
    this.lastTickMs = now;
    this._playSet('MVB', Math.floor(Math.random() * 12), 0.72);
  };

  // Legacy Puzzle_Test_2.4 callers
  proto.playClick = function()       { this.playMove(); };
  proto.playRotate = function()      { this.playMove(); };
  proto.playPlace = function()       { this.playMove(); };
  proto.playDiseaseGrow = function(noteIdx)    { const now = performance.now(); if (now - this.lastDiseaseGrowMs < (H_BEAT_SEC * 1000 / 6)) return; this.lastDiseaseGrowMs = now; this._playSet('DGD', noteIdx !== undefined ? noteIdx : Math.floor(Math.random() * 12)); };
  proto.playDiseaseDestroy = function(noteIdx) { const now = performance.now(); if (now - this.lastDiseaseDestroyMs < (H_BEAT_SEC * 1000 / 6)) return; this.lastDiseaseDestroyMs = now; this._playSet('SPM', noteIdx !== undefined ? noteIdx : Math.floor(Math.random() * 12)); };
  proto.playDetonate = function(keyOrIdx) { this.playSpell(keyOrIdx !== undefined ? keyOrIdx : 7); };
  proto.playFortify = function()     { this.playSpell('stone'); };
  proto.playWeave = function()       { this.playSpell('air'); };
  proto.playPhase = function()       { this.playSpell('water'); };
  proto.playBurn = function()        { this.playSpell('fire'); };

  // Background 3+1 H-Breath cycle (non-repeating 3 notes from remaining 9)
  proto._pickThreeExcluding = function(excluded) {
    const pool = [];
    for (let i = 0; i < 12; i++) if (!excluded.includes(i)) pool.push(i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, 3);
  };

  proto.startBackground = function() {
    this.bgWanted = true;
    if (this.bgRunning) return;
    this.init();
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.bgRunning = true;
    this.bgCurrentSet = this._pickThreeExcluding([]);
    this.bgNextSet = this._pickThreeExcluding(this.bgCurrentSet);
    this._runBgCycle();
  };

  proto._runBgCycle = function() {
    if (!this.bgRunning) return;
    const breathMs = H_BREATH_SEC * 1000;
    if (!this.bgNextSet || this.bgNextSet.length !== 3) {
      this.bgNextSet = this._pickThreeExcluding(this.bgCurrentSet);
    }
    const BG_OFFSETS = [0, 1.5, 3.0];
    this.bgCurrentSet.forEach((idx, step) => {
      this.bgTimers.push(setTimeout(() => {
        if (this.bgRunning) this._playSet('BGM', idx, 1.0);
      }, BG_OFFSETS[step] * breathMs));
    });
    this.bgTimers.push(setTimeout(() => {
      if (!this.bgRunning) return;
      this.bgCurrentSet = this.bgNextSet;
      this.bgNextSet = this._pickThreeExcluding(this.bgCurrentSet);
      this._runBgCycle();
    }, 5.0 * breathMs));
  };

  proto.stopBackground = function() {
    this.bgWanted = false;
    this.bgRunning = false;
    this.bgTimers.forEach(t => clearTimeout(t));
    this.bgTimers = [];
  };

  const audioInstance = new SoundEngine();
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Audio_Synth_1.1', audioInstance);
  global.AudioSynth = audioInstance;
})(typeof window !== 'undefined' ? window : this);
