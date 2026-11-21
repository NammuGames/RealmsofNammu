/**
 * @fileoverview cells/Board_Ripple_Renderer_1.3.js - Material Pulses & Placement Sequencer
 * @description Coordinates active unplaced material spawn/despawn pulses, unplaced ghost scale
 * transitions, mid-turn placement transitions, and sequential vacant tile placement sweeps
 * (Part 4 of multi-part BoardRippleRenderer cell).
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const proto = global.BoardRippleRendererClass?.prototype;
  if (!proto) {
    console.error('[Board_Ripple_Renderer_1.3] BoardRippleRendererClass is not defined. Ensure Board_Ripple_Renderer_1.0.js is loaded first.');
    return;
  }
  const H3_SEC = global.H_TIMING?.THREE_BEATS_SEC ?? (3 * Math.pow(12, 8) / 1420405751.768);

  /**
   * Plays simultaneous Spawn Pulse animation across all components of an active material.
   * 1. 0 to 1.5 H-Beats (~454ms, t <= 0.5): Ripple expands to peak (34px) with 0.6 translucent fill in each component's color. Polyhedra scale = 0.
   * 2. 1.5 to 3 H-Beats (~454 to 908ms, t > 0.5): Ripple contracts back inward; polyhedra scale up from center (0.0 to 1.0) simultaneously.
   * 3. No placement ripple is fired upon completion.
   * @param {Array<{q: number, r: number, color: string}>} components
   * @param {Function} [onComplete]
   * @param {number} [durationSec] Defaults to 3 H-Beats (~0.908s)
   */
  proto.playMaterialSpawnPulse = function(components, onComplete, durationSec = H3_SEC, onMidpoint = null) {
    if (!Array.isArray(components) || components.length === 0) {
      if (typeof onMidpoint === 'function') onMidpoint();
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    this.materialSpawnAnim = {
      startTime: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
      durationMs: (durationSec || H3_SEC) * 1000,
      components,
      scale: 0.0,
      isDespawn: false,
      maxRadius: 34,
      _midpointFired: false,
      onMidpoint,
      onComplete
    };
  };

  /**
   * Plays simultaneous Despawn Pulse animation across unplaced material components (no ripples).
   * 1. 0 to 1.5 H-Beats (~454ms, t <= 0.5): Ripple expands to 50px peak while polyhedra and back-tiles hold at 1.0 scale.
   * 2. 1.5 to 3 H-Beats (~454 to 908ms, t > 0.5): Ripple contracts back inward (50px to 0) while polyhedra and back-tiles shrink from 1.0 down to 0.0.
   * 3. No placement ripple is fired upon completion.
   * @param {Array<{q: number, r: number, color: string}>} components
   * @param {Function} [onComplete]
   * @param {number} [durationSec] Defaults to 3 H-Beats (~0.908s)
   */
  proto.playMaterialDespawnPulse = function(components, onComplete, durationSec = H3_SEC) {
    if (!Array.isArray(components) || components.length === 0) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    const durMs = (durationSec || H3_SEC) * 1000;
    const anim = {
      startTime: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
      durationMs: durMs,
      components,
      scale: 1.0,
      isDespawn: true,
      maxRadius: 50,
      onComplete
    };
    anim._fallbackTimer = setTimeout(() => {
      if (this.materialSpawnAnim !== anim || anim._done) return;
      anim._done = true;
      this.materialSpawnAnim = null;
      if (typeof onComplete === 'function') onComplete();
    }, Math.ceil(durMs) + 60);
    this.materialSpawnAnim = anim;
  };

  proto.getMaterialAnimScale = function() {
    const state = global.GameState;
    if (state && (!state.isMaterialSelected || state.placedThisTurn)) return 0.0;
    if (!this.materialSpawnAnim) return 1.0;
    const anim = this.materialSpawnAnim;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t = Math.min(1.0, (now - anim.startTime) / anim.durationMs);
    if (t >= 0.5 && !anim._midpointFired) {
      anim._midpointFired = true;
      if (typeof anim.onMidpoint === 'function') anim.onMidpoint();
    }
    const s = anim.isDespawn
      ? (t <= 0.5 ? 1.0 : Math.max(0.0, 1.0 - (t - 0.5) / 0.5))
      : (t <= 0.5 ? 0.0 : (t - 0.5) / 0.5);
    anim.scale = s;
    if (t >= 1.0 && !anim._done) {
      anim._done = true;
      if (anim._fallbackTimer) clearTimeout(anim._fallbackTimer);
      const cb = anim.onComplete;
      this.materialSpawnAnim = null;
      if (typeof cb === 'function') cb();
      return anim.isDespawn ? 0.0 : 1.0;
    }
    return s;
  };

  proto.renderMaterialSpawnPulses = function(ctx, math, originX, originY, hexRadius) {
    if (!this.materialSpawnAnim || !math) return;
    const anim = this.materialSpawnAnim;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t = Math.min(1.0, (now - anim.startTime) / anim.durationMs);
    if (t >= 0.5 && !anim._midpointFired) {
      anim._midpointFired = true;
      if (typeof anim.onMidpoint === 'function') anim.onMidpoint();
    }
    if (t >= 1.0) {
      if (!anim._done) {
        anim._done = true;
        if (anim._fallbackTimer) clearTimeout(anim._fallbackTimer);
        const cb = anim.onComplete;
        this.materialSpawnAnim = null;
        if (typeof cb === 'function') cb();
      }
      return;
    }

    const scale = hexRadius / 30;
    const maxR = (anim.maxRadius || (anim.isDespawn ? 50 : 34)) * scale;
    const pulseR = t <= 0.5 ? (t / 0.5) * maxR : (1.0 - (t - 0.5) / 0.5) * maxR;
    if (pulseR <= 0.5) return;

    anim.components.forEach(c => {
      const { x, y } = math.hexToScreen(c.q, c.r, originX, originY, hexRadius);
      const col = this.resolveRippleColor(c.color);
      const fillCol = (c.color === 'ether') ? '#000000' : col;
      this._drawPulseDisc(ctx, x, y, pulseR, col, fillCol, scale, 0.6);
    });
  };

  /**
   * Mid-Turn Material Placement Transition:
   * 1. Shrinks components from unplaced scale (0.90) to board placed scale (0.65) over 40ms.
   * 2. Fades green back-tiles from 1.0 to 0.0 opacity over 40ms.
   * 3. Triggers 4-band floor placement ripple right at the end of placement (40ms).
   * @param {Array<{q: number, r: number}>} coords
   * @param {string} [rippleColor='#22c55e']
   * @param {Function} [onComplete]
   * @param {number} [durationSec=0.04]
   * @param {string} [bezelColor='#22c55e']
   */
  proto.playMaterialPlacement = function(coords, rippleColor = '#22c55e', onComplete, durationSec = 0.30, bezelColor = '#22c55e') {
    if (!Array.isArray(coords) || coords.length === 0) { if (typeof onComplete === 'function') onComplete(); return; }
    const dur = durationSec || 0.30, startScale = 0.90 / 0.65;
    this.materialPlacementProgress = 0.0;
    if (global.SpellTeleport?.isPlacing) global.SpellTeleport.placementProgress = 0.0;
    coords.forEach(c => this.activeTileAnims.set(`${c.q},${c.r}`, {
      scale: startScale, alpha: 1.0, bezelAlpha: 1.0,
      bezelBg: c.bezelBg || c.bezelColor || bezelColor,
      bezelStroke: c.bezelStroke || c.bezelColor || bezelColor,
      bezelColor: c.bezelColor || bezelColor
    }));
    let rippleFired = false;
    const triggerRipple = () => {
      if (!rippleFired) {
        rippleFired = true;
        const profile = (global.GameState?.activeMaterialMod) ? 'enchantment' : 'material';
        this.triggerPlacementRipple(coords, rippleColor, { profile, bands: 4 });
      }
    };
    this.activeRipples.push({
      type: 'placement_transition', coords: coords.map(c => ({ q: c.q, r: c.r })), color: '#ffffff', elapsed: 0, duration: dur,
      maxRadius: 0, thickness: 0, bands: 0, alpha0: 0,
      onTick: (t) => {
        this.materialPlacementProgress = t;
        if (global.SpellTeleport?.isPlacing) global.SpellTeleport.placementProgress = t;
        const curScale = (0.90 - 0.25 * t) / 0.65, bAlpha = Math.max(0.0, 1.0 - t);
        coords.forEach(c => this.activeTileAnims.set(`${c.q},${c.r}`, {
          scale: curScale, alpha: 1.0, bezelAlpha: bAlpha,
          bezelBg: c.bezelBg || c.bezelColor || bezelColor,
          bezelStroke: c.bezelStroke || c.bezelColor || bezelColor,
          bezelColor: c.bezelColor || bezelColor
        }));
        if (t >= 1.0) triggerRipple();
      },
      onComplete: () => {
        this.materialPlacementProgress = null;
        if (global.SpellTeleport?.isPlacing) global.SpellTeleport.placementProgress = null;
        coords.forEach(c => this.activeTileAnims.delete(`${c.q},${c.r}`));
        triggerRipple();
        if (typeof onComplete === 'function') onComplete();
      }
    });
  };

  proto.playMaterialPickup = function(coords, onComplete, durationSec = 0.30, defaultBezel = '#38bdf8') {
    if (!Array.isArray(coords) || coords.length === 0) { if (typeof onComplete === 'function') onComplete(); return; }
    const dur = durationSec || 0.30;
    this.materialPickupProgress = 0.0;
    if (global.SpellTeleport) global.SpellTeleport.pickupProgress = 0.0;
    coords.forEach(c => this.activeTileAnims.set(`${c.q},${c.r}`, {
      scale: 1.0, alpha: 1.0, bezelAlpha: 1.0,
      bezelBg: c.bezelBg || c.bezelColor || defaultBezel,
      bezelStroke: c.bezelStroke || c.bezelColor || defaultBezel,
      bezelColor: c.bezelColor || defaultBezel
    }));
    this.activeRipples.push({
      type: 'pickup_transition', coords: coords.map(c => ({ q: c.q, r: c.r })), color: '#ffffff', elapsed: 0, duration: dur,
      maxRadius: 0, thickness: 0, bands: 0, alpha0: 0,
      onTick: (t) => {
        this.materialPickupProgress = t;
        if (global.SpellTeleport) global.SpellTeleport.pickupProgress = t;
        const curScale = (0.65 + 0.25 * t) / 0.65;
        coords.forEach(c => this.activeTileAnims.set(`${c.q},${c.r}`, {
          scale: curScale, alpha: 1.0, bezelAlpha: 1.0,
          bezelBg: c.bezelBg || c.bezelColor || defaultBezel,
          bezelStroke: c.bezelStroke || c.bezelColor || defaultBezel,
          bezelColor: c.bezelColor || defaultBezel
        }));
      },
      onComplete: () => {
        this.materialPickupProgress = null;
        if (global.SpellTeleport) global.SpellTeleport.pickupProgress = null;
        coords.forEach(c => this.activeTileAnims.delete(`${c.q},${c.r}`));
        if (typeof onComplete === 'function') onComplete();
      }
    });
  };

  /**
   * Selects random vacant tiles and orders them by concentric Tile ID ascending.
   */
  proto.pickAndOrderVacantTiles = function(vacant, count) {
    if (!Array.isArray(vacant) || vacant.length === 0 || count <= 0) return [];
    const pool = vacant.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const hexMath = global.HexMath;
    return pool.slice(0, count).map(v => ({
      ...v,
      tileId: (hexMath?.getTileId ? hexMath.getTileId(v.q, v.r) : 999999) || 999999
    })).sort((a, b) => a.tileId - b.tileId);
  };

  /**
   * Executes a list of placement actions sequentially. Supports synchronous or async (step, idx, next) steps.
   */
  proto.runSequentialPlacement = function(items, onStep, onComplete, intervalMs = 120) {
    const state = global.GameState;
    if (!Array.isArray(items) || items.length === 0) { if (typeof onComplete === 'function') onComplete(); return; }
    if (state) state.isSequentialPlacing = true;
    let idx = 0;
    const step = () => {
      if (idx < items.length) {
        const next = () => {
          idx++;
          if (idx < items.length) setTimeout(step, intervalMs);
          else {
            if (state) state.isSequentialPlacing = false;
            if (typeof onComplete === 'function') setTimeout(onComplete, Math.max(16, Math.floor(intervalMs * 0.5)));
          }
        };
        try {
          if (onStep.length >= 3) onStep(items[idx], idx, next);
          else { onStep(items[idx], idx); next(); }
        } catch (err) { console.error('Error in sequential placement step:', err); next(); }
      }
    };
    step();
  };

  /**
   * Launches an array of async animation tasks (`done => void`) as one staggered wave
   * using `baseBeats` spacing compressed within `maxWindowBeats` down to a `minBeats` floor.
   */
  proto.runStaggeredWave = function(tasks, onComplete, baseBeats = 3, maxWindowBeats = 12, minBeats = 2) {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    const state = global.GameState;
    const h1Sec = global.H_TIMING?.BEAT_SEC ?? (Math.pow(12, 8) / 1420405751.768);
    const count = tasks.length;
    const stepBeats = count <= 1 ? 0 : Math.max(minBeats, ((count - 1) * baseBeats > maxWindowBeats) ? (maxWindowBeats / (count - 1)) : baseBeats);
    const stepMs = stepBeats * h1Sec * 1000;
    let completedCount = 0;
    if (state) state.isSequentialPlacing = true;
    const onItemDone = () => {
      if (++completedCount >= count) {
        if (state) state.isSequentialPlacing = false;
        if (typeof onComplete === 'function') onComplete();
      }
    };
    tasks.forEach((task, i) => {
      const launch = () => {
        try { task(onItemDone); }
        catch (err) { console.error('Error in staggered wave task:', err); onItemDone(); }
      };
      if (i === 0) launch();
      else setTimeout(launch, i * stepMs);
    });
  };

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Board_Ripple_Renderer_1.3', global.BoardRippleRenderer);

})(typeof window !== 'undefined' ? window : this);

