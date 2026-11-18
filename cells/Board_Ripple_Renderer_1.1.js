/**
 * @fileoverview cells/Board_Ripple_Renderer_1.1.js - Board Tile Entity Tweens
 * @description Coordinates component scaling/contraction state during spawn, despawn, and slither
 * animations, as well as simultaneous enchantment tile expiration fading
 * (Part 2 of 4 in multi-part BoardRippleRenderer cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const proto = global.BoardRippleRendererClass?.prototype;
  if (!proto) {
    console.error('[Board_Ripple_Renderer_1.1] BoardRippleRendererClass is not defined. Ensure Board_Ripple_Renderer_1.0.js is loaded first.');
    return;
  }
  const H1_SEC = global.H_TIMING?.BEAT_SEC ?? (Math.pow(12, 8) / 1420405751.768);
  const H3_SEC = global.H_TIMING?.THREE_BEATS_SEC ?? (3 * H1_SEC);
  const H4_SEC = global.H_TIMING?.FOUR_BEATS_SEC ?? (4 * H1_SEC);

  /**
   * Retrieves active scaling/alpha state for an animating tile
   * @param {number} q
   * @param {number} r
   * @returns {{scale: number, alpha: number}|null}
   */
  proto.getTileAnimState = function(q, r) {
    return this.activeTileAnims.get(`${q},${r}`) || null;
  };

  /**
   * Plays the Spawning animation:
   * 1. Ripple expands to peak slightly beyond tile point-to-point.
   * 2. Ripple contracts back inward; component expands from center simultaneously.
   * 3. Contracting ripple disappears behind expanding component.
   * 4. Standard placement ripple activates upon completion.
   */
  proto.playSpawnAnimation = function(coord, color = 'disease', onComplete, durationSec = null, options = {}) {
    const dur = durationSec ?? this.spawnDuration ?? H3_SEC;
    const offsetSec = (options && typeof options.rippleOffset === 'number') ? options.rippleOffset : (this.placementRippleOffset || 0);
    const key = `${coord.q},${coord.r}`;
    this.activeTileAnims.set(key, { scale: 0.0, alpha: 1.0 });

    let rippleFired = false;
    const triggerPlacement = () => {
      if (rippleFired) return;
      rippleFired = true;
      if (options && options.noRipple) return;
      const prof = (options && options.profile) ? options.profile : ((color === 'disease') ? 'disease' : (color === 'ether' ? 'ether' : 'single'));
      this.triggerPlacementRipple([coord], color, { profile: prof, bands: (options && options.bands) || 1 });
    };

    // For negative offsets, calculate early trigger threshold (clamped >= 0.5 so component has started scaling)
    const earlyTriggerT = offsetSec < 0 ? Math.max(0.5, 1.0 + (offsetSec / dur)) : 1.0;

    this.activeRipples.push({
      type: 'spawn',
      coords: [{ q: coord.q, r: coord.r }],
      color: this.resolveRippleColor(color),
      fillColor: (color === 'ether') ? '#000000' : null,
      elapsed: 0,
      duration: dur,
      maxRadius: 34,
      thickness: 3,
      bands: 1,
      bandSpacing: 22,
      alpha0: 1.0,
      fillAlpha: 0.6,
      onTick: (t) => {
        const s = t <= 0.5 ? 0.0 : (t - 0.5) / 0.5;
        this.activeTileAnims.set(key, { scale: s, alpha: 1.0 });
        if (typeof options?.onTick === 'function') options.onTick(t);
        if (!rippleFired && offsetSec < 0 && t >= earlyTriggerT) {
          triggerPlacement();
        }
      },
      onComplete: () => {
        this.activeTileAnims.delete(key);
        if (typeof options?.onTick === 'function') options.onTick(1.0);
        if (offsetSec > 0) {
          // Option 1 (Paced): Wait for delayed placement ripple before completing step
          setTimeout(() => {
            triggerPlacement();
            if (typeof onComplete === 'function') onComplete();
          }, offsetSec * 1000);
        } else {
          triggerPlacement();
          if (typeof onComplete === 'function') onComplete();
        }
      }
    });
  };

  /**
   * Plays the Despawning animation:
   * 1. Ripple expands from behind the component.
   * 2. Both contract at the same time into a vanishing point.
   * 3. Just before vanishing point, placement ripple bursts outward and fades.
   */
  proto.playDespawnAnimation = function(coord, color = 'disease', onComplete, durationSec = null) {
    const dur = durationSec ?? this.spawnDuration ?? H3_SEC;
    const key = `${coord.q},${coord.r}`;
    this.activeTileAnims.set(key, { scale: 1.0, alpha: 1.0 });
    let rippleFired = false;

    this.activeRipples.push({
      type: 'despawn',
      coords: [{ q: coord.q, r: coord.r }],
      color: this.resolveRippleColor(color),
      fillColor: (color === 'ether') ? '#000000' : null,
      elapsed: 0,
      duration: dur,
      maxRadius: 34,
      thickness: 3,
      bands: 1,
      bandSpacing: 22,
      alpha0: 1.0,
      fillAlpha: 0.6,
      onTick: (t) => {
        const s = t <= 0.5 ? 1.0 : Math.max(0.0, 1.0 - (t - 0.5) / 0.5);
        this.activeTileAnims.set(key, { scale: s, alpha: 1.0 });
        if (!rippleFired && t >= 0.82) {
          rippleFired = true;
          this.triggerPlacementRipple([coord], color, { profile: 'disease', bands: 1 });
        }
      },
      onComplete: () => {
        this.activeTileAnims.delete(key);
        if (typeof onComplete === 'function') onComplete();
      }
    });
  };

  /**
   * Overlapping Slither animation: Tail despawn (3 H-Beats) and Head spawn (3 H-Beats)
   * staggered by 1.5 H-Beats so Head pulse opens right as Tail begins shrinking (4.5 H-Beats total).
   */
  proto.playSlitherAnimation = function(tailCoord, headCoord, color = 'disease', onComplete, onTailCleared = null, onSpawnTick = null) {
    const baseDur = this.spawnDuration ?? H3_SEC;
    const headDelayMs = global.H_TIMING?.ONE_HALF_BEATS_MS ?? (1.5 * H1_SEC * 1000);
    const despawnKey = `${tailCoord.q},${tailCoord.r}`;
    const headKey = `${headCoord.q},${headCoord.r}`;

    // Lock tail to 1.0 and head to 0.0 immediately so head never flashes before spawn begins
    this.activeTileAnims.set(despawnKey, { scale: 1.0, alpha: 1.0 });
    this.activeTileAnims.set(headKey, { scale: 0.0, alpha: 1.0 });
    let rippleFired = false, tailDone = false, headDone = false;
    const checkDone = () => {
      if (tailDone && headDone && typeof onComplete === 'function') onComplete();
    };

    this.activeRipples.push({
      type: 'despawn',
      coords: [{ q: tailCoord.q, r: tailCoord.r }],
      color: this.resolveRippleColor(color),
      elapsed: 0,
      duration: baseDur,
      maxRadius: 34,
      thickness: 3,
      bands: 1,
      bandSpacing: 22,
      alpha0: 1.0,
      fillAlpha: 0.6,
      onTick: (t) => {
        const s = t <= 0.5 ? 1.0 : Math.max(0.0, 1.0 - (t - 0.5) / 0.5);
        this.activeTileAnims.set(despawnKey, { scale: s, alpha: 1.0 });
        if (!rippleFired && t >= 0.82) {
          rippleFired = true;
          this.triggerPlacementRipple([tailCoord], color, { profile: 'disease', bands: 1 });
        }
      },
      onComplete: () => {
        this.activeTileAnims.delete(despawnKey);
        if (typeof onTailCleared === 'function') onTailCleared();
        if (global.AudioSynth?.playDiseaseGrow) global.AudioSynth.playDiseaseGrow();
        tailDone = true;
        checkDone();
      }
    });

    // Launch Head spawn 2 H-Beats after Tail despawn starts
    setTimeout(() => {
      this.playSpawnAnimation(headCoord, color, () => {
        headDone = true;
        checkDone();
      }, baseDur, { onTick: onSpawnTick, profile: 'disease', bands: 1 });
    }, headDelayMs);
  };

  /**
   * Simultaneous Enchantment Expiration:
   * Fades out enchanted tile bezels & overlays over 3 H-Beats (~908ms).
   * Halfway through (1.5 H-Beats ~454ms), expands a color-matched placement ripple from each expiring hex.
   * @param {Array<{q: number, r: number, color: string, type: string}>} expiringTiles
   * @param {Function} [onComplete]
   * @param {number} [durationSec] Defaults to 3 H-Beats (~0.908s)
   */
  proto.playEnchantmentExpiration = function(expiringTiles, onComplete, durationSec = H3_SEC) {
    if (!Array.isArray(expiringTiles) || expiringTiles.length === 0) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    const dur = durationSec, state = global.GameState;
    for (const t of expiringTiles) {
      this.activeTileAnims.set(`${t.q},${t.r}`, { scale: 1.0, alpha: 1.0, enchantmentAlpha: 1.0 });
    }
    const fadingPhaseKeys = new Set(expiringTiles.filter(t => {
      if (t.type !== 'phase') return false;
      const bt = state?.board?.get(`${t.q},${t.r}`);
      return !bt?.underneath?.color || bt.underneath.color !== bt.color;
    }).map(t => `${t.q},${t.r}`));
    const fadingIds = new Set();
    if (state?.board && Array.isArray(state.allCandidates)) {
      state.allCandidates.forEach(cand => {
        if (Array.isArray(cand.tiles) && cand.tiles.some(tk => !state.board.get(tk)?.color || fadingPhaseKeys.has(tk))) {
          fadingIds.add(cand.id);
        }
      });
    }
    this.fadingExpiringSigilIds = fadingIds.size > 0 ? fadingIds : null;
    this.fadingExpiringProgress = 1.0;

    let rippleFired = false;
    this.activeRipples.push({
      type: 'expiration',
      coords: expiringTiles.map(t => ({ q: t.q, r: t.r })),
      color: '#ffffff',
      elapsed: 0,
      duration: dur,
      maxRadius: 0,
      thickness: 0,
      bands: 0,
      alpha0: 0,
      onTick: (t) => {
        const a = Math.max(0.0, 1.0 - t);
        this.fadingExpiringProgress = a;
        for (const tile of expiringTiles) {
          this.activeTileAnims.set(`${tile.q},${tile.r}`, { scale: tile.type === 'phase' ? a : 1.0, alpha: 1.0, enchantmentAlpha: a });
        }
        if (!rippleFired && t >= 0.50) {
          rippleFired = true;
          for (const tile of expiringTiles) {
            this.triggerPlacementRipple([{ q: tile.q, r: tile.r }], tile.color || tile.type, { profile: tile.type, bands: 1 });
          }
          global.AudioSynth?.playEnchantmentExpiration?.(expiringTiles.map(tile => tile.type));
        }
      },
      onComplete: () => {
        for (const tile of expiringTiles) {
          this.activeTileAnims.delete(`${tile.q},${tile.r}`);
        }
        this.fadingExpiringSigilIds = null;
        this.fadingExpiringProgress = 1.0;
        if (typeof onComplete === 'function') onComplete();
      }
    });
  };

  /**
   * Collects all sigil candidate IDs containing any tile in keySet, and tracks per-sigil Burn fade alpha.
   */
  proto._collectSigilIdsForKeys = function(keySet) {
    const ids = [], cands = global.GameState?.allCandidates;
    if (!keySet?.size || !Array.isArray(cands)) return ids;
    for (const cand of cands) {
      if (cand?.id && Array.isArray(cand.tiles) && cand.tiles.some(tk => keySet.has(tk))) {
        ids.push(cand.id);
      }
    }
    return ids;
  };

  proto._setBurnSigilFades = function(sigilIds, alpha) {
    if (!Array.isArray(sigilIds) || sigilIds.length === 0) return;
    if (!this.fadingBurnSigils) this.fadingBurnSigils = new Map();
    for (const id of sigilIds) {
      if (alpha === null) this.fadingBurnSigils.delete(id);
      else this.fadingBurnSigils.set(id, alpha);
    }
  };

  proto.getBurnSigilFadeAlpha = function(sigilId) {
    return this.fadingBurnSigils?.has(sigilId) ? this.fadingBurnSigils.get(sigilId) : 1.0;
  };

  /**
   * Standard 2-half red (#ef4444) despawn animation for Burned / Burn-Arch components,
   * shrinking components to 0 while fading affected sigils/emblems across the full 3 H-Beats.
   */
  proto.playBurnDespawnAnimation = function(targets, onComplete, durationSec = H3_SEC) {
    if (!Array.isArray(targets) || targets.length === 0) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    const dur = durationSec || H3_SEC, h1Sec = global.H_TIMING?.BEAT_SEC ?? (Math.pow(12, 8) / 1420405751.768);
    const rippleStartT = Math.max(0, 1 - h1Sec / dur);
    const burnKeys = new Set(targets.map(tgt => tgt.key || `${tgt.q},${tgt.r}`));
    const burnSigilIds = this._collectSigilIdsForKeys(burnKeys);
    this._setBurnSigilFades(burnSigilIds, 1.0);
    let doneCount = 0;

    targets.forEach((tgt, idx) => {
      const key = tgt.key || `${tgt.q},${tgt.r}`;
      const isLead = (idx === 0);
      this.activeTileAnims.set(key, { scale: 1.0, alpha: 1.0, enchantmentAlpha: 1.0 });
      let rippleFired = false;
      this.activeRipples.push({
        type: 'despawn', coords: [{ q: tgt.q, r: tgt.r }], color: '#ef4444',
        elapsed: 0, duration: dur, maxRadius: 50, thickness: 3, bands: 1, bandSpacing: 22, alpha0: 1.0, fillAlpha: 0.6,
        onTick: (t) => {
          const s = t <= 0.5 ? 1.0 : Math.max(0.0, 1.0 - (t - 0.5) / 0.5);
          this.activeTileAnims.set(key, { scale: s, alpha: 1.0, enchantmentAlpha: 1.0 });
          if (isLead) this._setBurnSigilFades(burnSigilIds, Math.max(0.0, 1.0 - t));
          if (!rippleFired && t >= rippleStartT) {
            rippleFired = true;
            this.triggerPlacementRipple([{ q: tgt.q, r: tgt.r }], '#ef4444', { profile: 'burn', bands: 1 });
          }
        },
        onComplete: () => {
          this.activeTileAnims.delete(key);
          if (++doneCount >= targets.length) {
            if (typeof onComplete === 'function') onComplete();
            this._setBurnSigilFades(burnSigilIds, null);
          }
        }
      });
    });
  };

  /**
   * Smoothly fades out dormant emblems connected to resonating sigils or Arch zones
   * right before the resonant detonations cascade begins.
   */
  proto.fadeConnectedDormantEmblems = function(resonantSigils, resonantArchZoneIds, onComplete, durationSec = H1_SEC) {
    const state = global.GameState, resolver = global.SigilResolver;
    if (!state || !resolver) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    const resonantTileSet = new Set();
    if (Array.isArray(resonantSigils)) resonantSigils.forEach(s => s.tiles?.forEach(tk => resonantTileSet.add(tk)));
    if (state.archZones && resonantArchZoneIds && resonantArchZoneIds.size > 0) {
      global.SpellArch?.syncArchZones?.(state.archZones);
      state.archZones.forEach(z => {
        if (resonantArchZoneIds.has(z.id) || resonantArchZoneIds.has(`${z.center?.q},${z.center?.r}`)) {
          (z.flowerTiles || []).forEach(tk => resonantTileSet.add(tk));
        }
      });
    }

    const connectedDormantIds = [];
    const dormantIds = resolver.dormantSigilIds || state.dormantSigilIds || new Set();
    (state.allCandidates || []).forEach(cand => {
      if (dormantIds.has(cand.id)) {
        if (cand.tiles && cand.tiles.some(tk => resonantTileSet.has(tk))) {
          connectedDormantIds.push(cand.id);
        }
      }
    });

    const shouldFadeCursor = !!state.inSigilStage;
    if (connectedDormantIds.length === 0 && !shouldFadeCursor) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    this.fadingDormantSigilIds = connectedDormantIds.length > 0 ? new Set(connectedDormantIds) : null;
    this.isFadingSigilCursor = shouldFadeCursor;
    this.fadingDormantProgress = 1.0;

    this.activeRipples.push({
      type: 'dormant_fade',
      coords: [],
      color: '#38bdf8',
      elapsed: 0,
      duration: durationSec || H1_SEC,
      maxRadius: 0, thickness: 0, bands: 0, alpha0: 0,
      onTick: (t) => {
        this.fadingDormantProgress = Math.max(0.0, 1.0 - t);
      },
      onComplete: () => {
        connectedDormantIds.forEach(id => {
          resolver.dormantSigilIds?.delete(id);
          state.dormantSigilIds?.delete(id);
        });
        if (shouldFadeCursor) state.inSigilStage = false;
        this.fadingDormantSigilIds = null;
        this.isFadingSigilCursor = false;
        this.fadingDormantProgress = 1.0;
        if (typeof onComplete === 'function') onComplete();
      }
    });
  };

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Board_Ripple_Renderer_1.1', global.BoardRippleRenderer);

})(typeof window !== 'undefined' ? window : this);

