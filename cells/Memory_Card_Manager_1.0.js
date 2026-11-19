/**
 * @fileoverview cells/Memory_Card_Manager_1.0.js - Profile, Presets & Dirty-Flag Cache (Part 1/2)
 * @description Manages unified same-origin localStorage keys, Saved/Unsaved dirty state tracking,
 * shorthand preset compression, permanent Room Code generation, and preset menu persistence.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const KEYS = {
    PROFILE: 'nammu_mc_v1_profile',
    PRESETS: 'nammu_mc_v1_puzzle_presets',
    SAVES: 'nammu_mc_v1_saves',
    DIRTY: 'nammu_mc_v1_dirty'
  };
  const MAX_SAVES = 12;
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function safeParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function makeCode(len = 4) {
    let out = '';
    for (let i = 0; i < len; i++) {
      out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return out;
  }

  function shortenVectorItem(it) {
    return {
      id: it.id, n: it.name, tg: it.tagNumber || '001',
      ts: it.turnStart, ti: it.turnInterval, te: it.turnEnd,
      sc: it.spawnCount ?? 1, ch: it.chance, dp: it.dupInterval ?? 0,
      eom: it.isEndOfMatch ? 1 : 0
    };
  }

  function expandVectorItem(s) {
    return {
      id: s.id || `vec_${Date.now()}`, name: s.n || 'Vector', tagNumber: s.tg || '001',
      turnStart: s.ts ?? 1, turnInterval: s.ti ?? 1, turnEnd: s.te ?? 24,
      spawnCount: s.sc ?? 1, chance: s.ch ?? 0, dupInterval: s.dp ?? 0,
      isEndOfMatch: !!s.eom
    };
  }

  function shortenPreset(p) {
    const m = p.match || {};
    const lk = p.luck || {};
    const bl = p.blight || {};
    return {
      id: p.id, n: p.name, tg: p.tagNumber || '001',
      m: {
        mc: m.materialComposition || 'Random', lc: m.luckComposition || 'Random',
        ss: m.startingSpells ?? 0, r: m.rounds ?? 144, br: m.boardRadius ?? 6, ie: m.isEndless ? 1 : 0
      },
      lk: {
        ap: lk.activePlayfieldIndex || 0, am: lk.activeMaterialIndex || 0,
        pf: (lk.playfieldItems || []).map(shortenVectorItem),
        mt: (lk.materialItems || []).map(shortenVectorItem)
      },
      bl: {
        ap: bl.activePlayfieldIndex || 0, am: bl.activeMaterialIndex || 0,
        pf: (bl.playfieldItems || []).map(shortenVectorItem),
        mt: (bl.materialItems || []).map(shortenVectorItem)
      }
    };
  }

  function expandPreset(s) {
    const m = s.m || {};
    const lk = s.lk || {};
    const bl = s.bl || {};
    return {
      id: s.id || `preset_${Date.now()}`,
      name: s.n || 'Custom Preset',
      tagNumber: s.tg || '004',
      isDefault: false,
      match: {
        materialComposition: m.mc || 'Random', luckComposition: m.lc || 'Random',
        startingSpells: m.ss ?? 0, rounds: m.r ?? 144, boardRadius: m.br ?? 6, isEndless: !!m.ie
      },
      luck: {
        activePlayfieldIndex: lk.ap || 0, activeMaterialIndex: lk.am || 0,
        playfieldItems: (lk.pf || []).map(expandVectorItem),
        materialItems: (lk.mt || []).map(expandVectorItem)
      },
      blight: {
        activePlayfieldIndex: bl.ap || 0, activeMaterialIndex: bl.am || 0,
        playfieldItems: (bl.pf || []).map(expandVectorItem),
        materialItems: (bl.mt || []).map(expandVectorItem)
      }
    };
  }

  class MemoryCardManagerClass {
    constructor() {
      this._puzzleHooked = false;
      this._presetSaveTimer = null;
      this.activeMatchId = null;
      this.onDirtyChange = null;
    }

    init(dom = {}) {
      this._wireDrawerButtons?.(dom);
      return true;
    }

    // ── SAVED / UNSAVED DIRTY STATE TRACKING ────────────────────────────────
    isSaved() {
      return localStorage.getItem(KEYS.DIRTY) !== '1';
    }

    getSavedStatusLabel() {
      return this.isSaved() ? 'Saved' : 'Unsaved';
    }

    markUnsaved() {
      localStorage.setItem(KEYS.DIRTY, '1');
      this._notifyDirtyState();
    }

    markSaved() {
      localStorage.setItem(KEYS.DIRTY, '0');
      this._notifyDirtyState();
    }

    _notifyDirtyState() {
      if (typeof this.onDirtyChange === 'function') this.onDirtyChange(this.isSaved());
      const gsc = global.GameSettingsCanvas;
      const topTitle = gsc?.history?.length ? gsc.history[gsc.history.length - 1]?.title : '';
      if (gsc?.active && (gsc.history.length <= 1 || topTitle === 'Memory Card' || topTitle === 'Root')) {
        gsc.rebuildTopFrame?.();
      }
    }

    /** Generates a unique 4-char Room Code not yet used in Saved Matches. */
    generateUniqueRoomCode() {
      const saves = this.getSavesMap();
      const used = new Set(Object.values(saves).map(s => s?.roomCode).filter(Boolean));
      for (let i = 0; i < 64; i++) {
        const candidate = makeCode(4);
        if (!used.has(candidate)) return candidate;
      }
      return makeCode(6);
    }

    // ── PROFILE & PRESETS CACHE ─────────────────────────────────────────────
    getProfile() {
      return safeParse(localStorage.getItem(KEYS.PROFILE), { v: 1, name: 'Player 1', tag: '001', updatedAt: 0 });
    }

    setProfile(updates = {}) {
      const next = Object.assign(this.getProfile(), updates, { v: 1, updatedAt: Date.now() });
      localStorage.setItem(KEYS.PROFILE, JSON.stringify(next));
      this.markUnsaved();
      return next;
    }

    savePresetsFromMenu(settings = global.GameSettingsCanvas, opts = {}) {
      const cfg = settings?.config;
      if (!cfg) return false;
      const presets = Array.isArray(cfg.presets) ? cfg.presets : [];
      const active = presets[cfg.activePresetIndex || 0];
      const payload = {
        v: 1,
        playerCount: cfg.playerCount || 1,
        activePresetId: active?.id || null,
        activePresetIndex: cfg.activePresetIndex || 0,
        customPresets: presets.filter(p => p && !p.isDefault).map(shortenPreset),
        updatedAt: Date.now()
      };
      const prevRaw = localStorage.getItem(KEYS.PRESETS);
      const prevComparable = safeParse(prevRaw, {});
      const prevCustomJson = JSON.stringify(prevComparable.customPresets || []);
      const nextCustomJson = JSON.stringify(payload.customPresets || []);
      localStorage.setItem(KEYS.PRESETS, JSON.stringify(payload));
      if (!opts.silent && prevRaw !== null && prevCustomJson !== nextCustomJson) {
        this.markUnsaved();
      }
      return true;
    }

    applyPresetsToMenu(settings = global.GameSettingsCanvas) {
      const cfg = settings?.config;
      if (!cfg) return false;
      const cached = safeParse(localStorage.getItem(KEYS.PRESETS), null);
      if (!cached) return false;

      if (cached.playerCount >= 1 && cached.playerCount <= 6) {
        cfg.playerCount = cached.playerCount;
      }

      const defaults = (cfg.presets || []).filter(p => p && p.isDefault);
      const custom = Array.isArray(cached.customPresets) ? cached.customPresets.map(expandPreset) : [];
      cfg.presets = [...defaults, ...custom];
      if (typeof settings.sortPresetList === 'function') {
        settings.sortPresetList(cfg.presets);
      }

      if (cached.activePresetId) {
        const idx = cfg.presets.findIndex(p => p.id === cached.activePresetId);
        if (idx !== -1) cfg.activePresetIndex = idx;
      } else if (typeof cached.activePresetIndex === 'number') {
        cfg.activePresetIndex = Math.max(0, Math.min(cfg.presets.length - 1, cached.activePresetIndex));
      }
      if (settings.active) settings.rebuildTopFrame?.();
      return true;
    }
  }

  MemoryCardManagerClass._helpers = { KEYS, MAX_SAVES, safeParse, deepClone };
  global.MemoryCardManagerClass = MemoryCardManagerClass;
})(typeof window !== 'undefined' ? window : this);
