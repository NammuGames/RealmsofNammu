/**
 * @fileoverview cells/Audio_Synth_1.0.js - Harmonic Data, H_TIMING & Offline Voice Synthesizer
 * @description Defines committed 128 H-Hz notes, Studio 1.2 sound set definitions, H_TIMING constants,
 * WebAudio bus initialization, and harmonic/noise voice scheduling (Part 1 of multi-part AudioSynth cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */
(function(global) {
  'use strict';

  const H_CLICK_FREQ = 1420405751.768;
  const H_BEAT_SEC = Math.pow(12, 8) / H_CLICK_FREQ;   // ~0.302718s (1 H-Beat)
  const H_BREATH_SEC = Math.pow(12, 9) / H_CLICK_FREQ; // ~3.632610s (1 H-Breath = 12 H-Beats)
  const MAX_ACTIVE_SOURCES = 48;

  // Shared Hydrogen Beat timing constants for synchronized audio/animation cells
  global.H_TIMING = Object.freeze({
    CLICK_FREQ: H_CLICK_FREQ,
    BEAT_SEC: H_BEAT_SEC,
    BREATH_SEC: H_BREATH_SEC,
    HALF_BEAT_SEC: H_BEAT_SEC * 0.5,
    ONE_HALF_BEATS_SEC: H_BEAT_SEC * 1.5,
    TWO_BEATS_SEC: H_BEAT_SEC * 2,
    THREE_BEATS_SEC: H_BEAT_SEC * 3,
    FOUR_BEATS_SEC: H_BEAT_SEC * 4,
    SIX_BEATS_SEC: H_BEAT_SEC * 6,
    HALF_BEAT_MS: H_BEAT_SEC * 500,
    ONE_HALF_BEATS_MS: H_BEAT_SEC * 1500,
    TWO_BEATS_MS: H_BEAT_SEC * 2000,
    THREE_BEATS_MS: H_BEAT_SEC * 3000,
    FOUR_BEATS_MS: H_BEAT_SEC * 4000,
    SIX_BEATS_MS: H_BEAT_SEC * 6000,
    DRIFT_PX_PER_BEAT: 144,
    DRIFT_PX_PER_SEC: 144 / H_BEAT_SEC
  });

  // Committed 4-Octave 128 H-Hz scale (66.59 Hz - 845.67 Hz)
  const NOTES = [
    { id: 'stone', spell: 'lock',     formula: 'PPR', freq: 66.59 },
    { id: 'water', spell: 'phase',    formula: 'BBY', freq: 83.90 },
    { id: 'fire',  spell: 'burn',     formula: 'RRP', freq: 105.71 },
    { id: 'air',   spell: 'weave',    formula: 'YYB', freq: 133.19 },
    { id: 'wood',  spell: 'shift',    formula: 'PPY', freq: 167.80 },
    { id: 'ice',   spell: 'store',    formula: 'BBR', freq: 211.42 },
    { id: 'heat',  spell: 'form',     formula: 'RRB', freq: 266.37 },
    { id: 'storm', spell: 'arch',     formula: 'YYP', freq: 335.60 },
    { id: 'feral', spell: 'heal',     formula: 'PPB', freq: 422.84 },
    { id: 'dark',  spell: 'warp',     formula: 'BBP', freq: 532.74 },
    { id: 'light', spell: 'charge',   formula: 'RRY', freq: 671.21 },
    { id: 'cyber', spell: 'seek',     formula: 'YYR', freq: 845.67 }
  ];

  // Committed Audio_Studio_1.2 sound sets (Score_Tick omitted -> MVB)
  const SETS = {
    CFL: { idx: 8,  v: { cat: 'res',  atk: 0.025, dec: 0.90, brt: 1.50, vol: 0.68 }, seq: [[0, 0, 0.90], [7, 0.085, 0.85]], fx: { rev: 3.6 } },
    XDM: { idx: 4,  v: { cat: 'res',  atk: 0.020, dec: 0.55, brt: 1.30, vol: 0.68 }, seq: [[0, 0, 0.85], [-3, 0.095, 0.70]], fx: { rev: 3.6 } },
    MVB: { idx: 6,  v: { cat: 'res',  atk: 0.008, dec: 0.22, brt: 1.50, vol: 0.62 }, fx: { rev: 3.6 } },
    SPK: { idx: 7,  v: { cat: 'res',  atk: 0.030, dec: 1.80, brt: 1.70, warmth: 1200, filterQ: 0.75, otRatio: 2.0, otVol: 0.20, vol: 0.70 }, fx: { rev: 3.6, dly: true } },
    SPM: { idx: 7,  v: { cat: 'perc', atk: 0.008, dec: 1.70, brt: 1.40, pitchChirp: true, chirpDepth: 0.16, chirpDur: 0.07, vol: 0.76 }, fx: { rev: 3.6 } },
    PWM: { idx: 10, v: { cat: 'res',  atk: 0.020, dec: 1.40, brt: 1.75, vol: 0.66 }, seq: [[0, 0, 0.75], [2, 0.06, 0.78], [7, 0.12, 0.82], [12, 0.18, 0.90]], fx: { rev: 3.6, dly: true } },
    DGS: { idx: 1,  v: { cat: 'res',  atk: 0.035, dec: 1.10, brt: 1.25, vol: 0.66 }, seq: [[0, 0, 0.85], [-3, 0.095, 0.75], [-7, 0.19, 0.65]], fx: { rev: 3.6 } },
    DGD: { idx: 1,  v: { cat: 'wind', atk: 0.008, dec: 0.90, brt: 1.10, noiseBreath: true, noiseVol: 0.16, glide: -2.5, vol: 0.74 }, fx: { rev: 3.6 } },
    GSF: { idx: 8,  v: { cat: 'wind', atk: 0.140, dec: 2.10, brt: 1.60, vol: 0.72, noiseBreath: true, noiseVol: 0.09, vibDepth: 6 }, seq: [[0, 0, 0.80], [5, 0.16, 0.84], [12, 0.32, 0.88]], fx: { rev: 3.6, dly: true } },
    GDA: { idx: 0,  v: { cat: 'res',  atk: 0.080, dec: 2.40, brt: 1.25, vol: 0.70 }, seq: [[7, 0, 0.85], [3, 0.22, 0.78], [0, 0.44, 0.72]], fx: { rev: 3.6 } },
    BGM: { idx: 4,  v: { cat: 'res',  atk: 0.0252, dec: 5.0, brt: 1.40, warmth: 1200, filterQ: 0.75, vol: 0.62 }, seq: [[0, 0, 0.85], [7, 0.22, 0.55]], fx: { rev: 8.0, drop: 0.5, dly: true } }
  };

  // Aliases for Warp/Teleport + Form/Store/Seek
  const SPELL_ALIASES = { fortify: 0, teleport: 9, manifest: 6, foresight: 11, ritual: 5 };

  function resolveNoteIndex(keyOrIdx, fallback = 7) {
    if (typeof keyOrIdx === 'number' && !isNaN(keyOrIdx)) return ((keyOrIdx | 0) % 12 + 12) % 12;
    if (typeof keyOrIdx === 'string') {
      const k = keyOrIdx.trim().toLowerCase();
      if (k in SPELL_ALIASES) return SPELL_ALIASES[k];
      const found = NOTES.findIndex(n => n.id === k || n.spell === k || n.formula.toLowerCase() === k);
      if (found !== -1) return found;
    }
    return fallback;
  }

  function loudnessComp(freq) {
    const f = Math.max(20, freq);
    const base = f < 300 ? 1.0 + ((300 - f) / 240) * 0.35 : 1.0;
    const tilt = Math.pow(274 / f, 0.40); // +1.00 Bass Tilt
    return Math.min(1.75, Math.max(0.45, base * tilt));
  }

  function createHarmonicWave(ctx, freq) {
    const f = Math.max(20, freq), nMax = 12;
    const real = new Float32Array(nMax + 1), imag = new Float32Array(nMax + 1);
    imag[1] = 1.0;
    const p = f < 250 ? 1.05 + (f / 250) * 0.45 : 1.50 + Math.min(1.0, (f - 250) / 350);
    for (let n = 2; n <= nMax; n++) imag[n] = (1.0 / Math.pow(n, p)) / (1.0 + Math.pow((f * n) / 1800, 2.0));
    return ctx.createPeriodicWave(real, imag);
  }

  class SoundEngine {
    constructor() {
      this.ctx = null; this.polyBus = null; this.masterGain = null; this.masterVolume = 0.80;
      this.cache = new Map(); this.pending = new Map(); this.impulses = new Map();
      this.noiseChannels = null; this.activeSources = []; this.lastTickMs = 0; this.lastMoveMs = 0; this.lastDiseaseDestroyMs = 0; this.lastDiseaseGrowMs = 0;
      this.setVolumes = Object.assign(Object.fromEntries(Object.keys(SETS).map(k => [k, 1.0])), { BGM: 0.30 });
      this.bgRunning = false; this.bgWanted = false; this.bgTimers = [];
      this.bgCurrentSet = []; this.bgNextSet = []; this.prebakeStarted = false;
      this.unlocked = false;
      this._bindUnlockAndAutoStart();
    }

    _bindUnlockAndAutoStart() {
      if (typeof window === 'undefined') return;
      const cleanup = () => {
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
      };
      const tryStartBg = () => {
        if (this.bgWanted && !this.bgRunning && this.ctx && this.ctx.state === 'running') {
          this.startBackground();
        }
      };
      const unlock = () => {
        this.unlocked = true;
        this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'running') {
          cleanup();
          tryStartBg();
        } else if (this.ctx.state === 'suspended') {
          this.ctx.resume().then(() => {
            if (this.ctx && this.ctx.state === 'running') {
              cleanup();
              tryStartBg();
            }
          }).catch(() => {});
        }
      };
      window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
      window.addEventListener('keydown', unlock, { capture: true, passive: true });
      // Begin prebaking click notes immediately on load while waiting for gesture unlock
      this.init();
      setTimeout(() => {
        this.bgWanted = true;
        this.init();
        tryStartBg();
      }, Math.round(H_BREATH_SEC * 1000));
    }

    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();

        this.polyBus = this.ctx.createGain();
        this.polyBus.gain.setValueAtTime(0.60, this.ctx.currentTime);

        const softClipper = this.ctx.createWaveShaper();
        const n = 1024, curve = new Float32Array(n);
        for (let i = 0; i < n; ++i) {
          const x = (i * 2) / n - 1;
          curve[i] = Math.tanh(x * 1.15) / Math.tanh(1.15);
        }
        softClipper.curve = curve;
        const isMobileAudio = !!(global.DevicePerfProfile?.isLiteMode?.() || (typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)')?.matches || Math.min(window.innerWidth || 999, window.innerHeight || 999) <= 560)));
        softClipper.oversample = isMobileAudio ? 'none' : '2x';

        const limiter = this.ctx.createDynamicsCompressor();
        limiter.threshold.setValueAtTime(-0.5, this.ctx.currentTime);
        limiter.knee.setValueAtTime(12.0, this.ctx.currentTime);
        limiter.ratio.setValueAtTime(2.5, this.ctx.currentTime);
        limiter.attack.setValueAtTime(0.030, this.ctx.currentTime);
        limiter.release.setValueAtTime(0.15, this.ctx.currentTime);

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);

        this.polyBus.connect(softClipper);
        softClipper.connect(limiter);
        limiter.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
      }

      if (this.unlocked && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      if (!this.prebakeStarted) {
        this.prebakeStarted = true;
        this._queuePrebake();
      }
      return this.ctx;
    }

    _getImpulseData(sr, duration, dropOff = 1.35) {
      const key = `${sr}_${duration.toFixed(1)}_${dropOff.toFixed(2)}`;
      if (this.impulses.has(key)) return this.impulses.get(key);
      const length = Math.floor(sr * duration), preDelay = Math.floor(sr * 0.024);
      const L = new Float32Array(length), R = new Float32Array(length);
      for (let i = preDelay; i < length; i++) {
        const t = (i - preDelay) / (length - preDelay);
        const env = (1.0 - Math.exp(-(i - preDelay) / (sr * 0.035))) * Math.pow(1.0 - t, dropOff);
        const spread = Math.sin(t * 35.0) * 0.20;
        L[i] = (Math.random() * 2 - 1) * (1.0 + spread) * env * 0.65;
        R[i] = (Math.random() * 2 - 1) * (1.0 - spread) * env * 0.65;
      }
      const pair = [L, R];
      this.impulses.set(key, pair);
      return pair;
    }

    _getNoiseBuffer(offCtx) {
      const sr = offCtx.sampleRate, len = Math.floor(sr * 1.5);
      if (!this.noiseChannels || this.noiseChannels.length !== len) {
        const data = new Float32Array(len);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99765 * b0 + w * 0.0990460;
          b1 = 0.96300 * b1 + w * 0.1132717;
          b2 = 0.81000 * b2 + w * 0.2974423;
          data[i] = (b0 + b1 + b2 + w * 0.05) * 0.20;
        }
        this.noiseChannels = data;
      }
      const buf = offCtx.createBuffer(1, len, sr);
      buf.copyToChannel(this.noiseChannels, 0);
      return buf;
    }

    _scheduleVoice(offCtx, dest, freq, v, volumeScale, timeOffset) {
      const now = 0.002 + timeOffset;
      const atk = Math.max(0.002, v.atk), dec = Math.max(0.05, v.dec);
      const endTime = now + atk + dec + 0.08;
      const effectiveVol = v.vol * loudnessComp(freq) * volumeScale * 0.55;

      const voiceGain = offCtx.createGain();
      voiceGain.gain.setValueAtTime(0.0001, now);
      voiceGain.gain.linearRampToValueAtTime(effectiveVol, now + atk);
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + atk + dec);

      const filter = offCtx.createBiquadFilter();
      filter.type = 'lowpass';
      const rawCut = freq * Math.pow(Math.max(0.8, v.brt), 1.35) * 1.2 + (v.warmth ? v.warmth * 0.15 : 0);
      filter.frequency.setValueAtTime(Math.min(16000, Math.max(850, freq * 2.0, rawCut)), now);
      filter.Q.value = v.filterQ || 0.85;
      voiceGain.connect(filter);
      filter.connect(dest);

      const osc1 = offCtx.createOscillator();
      osc1.setPeriodicWave(createHarmonicWave(offCtx, freq));
      osc1.frequency.setValueAtTime(freq, now);
      osc1.connect(voiceGain);
      osc1.start(now);
      osc1.stop(endTime);

      let oct = null;
      if (freq < 220) {
        oct = offCtx.createOscillator();
        oct.setPeriodicWave(createHarmonicWave(offCtx, freq * 2.0));
        oct.frequency.setValueAtTime(freq * 2.0, now);
        const octGain = offCtx.createGain();
        const maxBlend = v.cat === 'wind' ? 0.60 : 0.65;
        octGain.gain.setValueAtTime(Math.max(0.15, Math.min(maxBlend, ((220 - freq) / 160) * maxBlend)), now);
        oct.connect(octGain);
        octGain.connect(voiceGain);
        oct.start(now);
        oct.stop(endTime);
      }

      if (v.pitchChirp && v.chirpDepth) {
        const chirpStart = Math.max(10, freq * v.chirpDepth);
        const baseDur = Math.max(0.003, v.chirpDur || 0.018);
        const chirpDur = freq < 220 ? Math.max(baseDur * 2.0, 0.050) : baseDur;
        osc1.frequency.setValueAtTime(chirpStart, now);
        osc1.frequency.exponentialRampToValueAtTime(freq, now + chirpDur);
        if (oct) {
          oct.frequency.setValueAtTime(chirpStart * 2.0, now);
          oct.frequency.exponentialRampToValueAtTime(freq * 2.0, now + chirpDur);
        }
      } else if (v.glide && v.glide !== 0) {
        const targetFreq = Math.max(20, freq * Math.pow(2, v.glide / 12));
        osc1.frequency.exponentialRampToValueAtTime(targetFreq, now + atk + dec);
        if (oct) oct.frequency.exponentialRampToValueAtTime(targetFreq * 2.0, now + atk + dec);
      }

      if (v.otRatio && v.otVol > 0) {
        const osc2 = offCtx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq * v.otRatio, now);
        const otGain = offCtx.createGain();
        otGain.gain.setValueAtTime(0.0001, now);
        otGain.gain.linearRampToValueAtTime(v.otVol, now + atk * 0.8);
        otGain.gain.exponentialRampToValueAtTime(0.0001, now + atk + dec * 0.65);
        osc2.connect(otGain);
        otGain.connect(voiceGain);
        osc2.start(now);
        osc2.stop(endTime);
      }

      if (v.cat === 'wind') {
        const vibOsc = offCtx.createOscillator();
        vibOsc.frequency.setValueAtTime(4.8, now);
        const vibGain = offCtx.createGain();
        vibGain.gain.setValueAtTime(v.vibDepth || 3.2, now);
        vibOsc.connect(vibGain);
        vibGain.connect(osc1.frequency);
        if (oct) vibGain.connect(oct.frequency);
        vibOsc.start(now);
        vibOsc.stop(endTime);

        if (v.noiseBreath && v.noiseVol > 0) {
          const nSrc = offCtx.createBufferSource();
          nSrc.buffer = this._getNoiseBuffer(offCtx);
          nSrc.loop = true;
          const nFilt = offCtx.createBiquadFilter();
          nFilt.type = 'bandpass';
          nFilt.frequency.setValueAtTime(freq * 2.2, now);
          nFilt.Q.value = 3.0;
          const nGain = offCtx.createGain();
          nGain.gain.setValueAtTime(0.0001, now);
          nGain.gain.linearRampToValueAtTime(v.noiseVol, now + atk * 1.2);
          nGain.gain.exponentialRampToValueAtTime(0.0001, now + atk + dec * 0.75);
          nSrc.connect(nFilt);
          nFilt.connect(nGain);
          nGain.connect(voiceGain);
          nSrc.start(now);
          nSrc.stop(endTime);
        }
      }
    }

    _trimBuffer(buf) {
      const chs = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
      let last = 0;
      for (let ch = 0; ch < chs; ch++) {
        const data = buf.getChannelData(ch);
        for (let i = len - 1; i > last; i--) {
          if (Math.abs(data[i]) > 0.0004) { last = i; break; }
        }
      }
      const outLen = Math.max(256, Math.min(len, last + Math.floor(sr * 0.02)));
      const out = this.ctx.createBuffer(chs, outLen, sr);
      const fade = Math.min(Math.floor(outLen * 0.15), Math.floor(sr * 0.012));
      for (let ch = 0; ch < chs; ch++) {
        const src = buf.getChannelData(ch).subarray(0, outLen);
        const dst = out.getChannelData(ch);
        dst.set(src);
        for (let f = 0; f < fade; f++) {
          dst[outLen - 1 - f] *= f / fade;
        }
      }
      return out;
    }
  }

  SoundEngine._defs = { SETS, NOTES, resolveNoteIndex, MAX_ACTIVE_SOURCES };
  global.AudioSynthClass = SoundEngine;
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Audio_Synth_1.0', SoundEngine);
})(typeof window !== 'undefined' ? window : this);
