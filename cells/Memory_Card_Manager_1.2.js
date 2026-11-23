/**
 * @fileoverview cells/Memory_Card_Manager_1.2.js - .nammu Export/Import, Lifecycle Hooks & Singleton (Part 3/3)
 * @description Attaches shorthand .nammu file export/import, automatic Puzzle preset/save hooks,
 * Tuning Drawer Memory Card button wiring, and global MemoryCardManager singleton instantiation.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const MCM = global.MemoryCardManagerClass;
  const proto = MCM?.prototype;
  if (!proto || !MCM._helpers) {
    console.error('[Memory_Card_Manager_1.2] Load Memory_Card_Manager_1.0.js first.');
    return;
  }

  const { KEYS, safeParse } = MCM._helpers;

  // ── SHORTHAND MEMORY CARD FILE (.nammu) EXPORT & IMPORT ───────────────────
  proto.encodeMemoryCard = function() {
    if (global.GameSettingsCanvas?.config) this.savePresetsFromMenu(global.GameSettingsCanvas, { silent: true });
    const profile = this.getProfile();
    const devicePeerId = global.NetworkP2PManager?.getDevicePeerId?.() || profile.devicePeerId || null;
    const presets = safeParse(localStorage.getItem(KEYS.PRESETS), { v: 1, playerCount: 1, customPresets: [] });
    const saves = this.getSavesMap();

    return [
      '@NAMMU_MC v1',
      `@P ${JSON.stringify({ n: profile.name, t: profile.tag, dp: devicePeerId, u: profile.updatedAt })}`,
      `@CFG ${JSON.stringify({ pc: presets.playerCount || 1, ap: presets.activePresetId || null, ai: presets.activePresetIndex || 0, ps: presets.customPresets || [] })}`,
      `@SAV ${JSON.stringify(saves)}`
    ].join('\n');
  };

  proto.downloadMemoryCard = function() {
    const profile = this.getProfile();
    const clean = (profile.name || 'player').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const filename = `nammu_${clean}_${profile.tag || '001'}.nammu`;
    const blob = new Blob([this.encodeMemoryCard()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.markSaved();
    global.GameState?.showToast?.(`💾 Saved Memory Card: ${filename}`);
    return filename;
  };

  proto.importMemoryCardText = function(rawText) {
    if (typeof rawText !== 'string' || !rawText.trim().startsWith('@NAMMU_MC v1')) {
      throw new Error('Invalid Memory Card format (expected @NAMMU_MC v1 header).');
    }

    let importedPresets = 0;
    let importedSaves = 0;
    const lines = rawText.split(/\r?\n/);

    for (const line of lines) {
      if (line.startsWith('@P ')) {
        const p = safeParse(line.slice(3), null);
        if (p) {
          const profPayload = { v: 1, name: p.n || 'Player 1', tag: p.t || '001', devicePeerId: p.dp || null, updatedAt: Date.now() };
          localStorage.setItem(KEYS.PROFILE, JSON.stringify(profPayload));
          if (p.dp) global.NetworkP2PManager?.setDevicePeerId?.(p.dp);
        }
      } else if (line.startsWith('@CFG ')) {
        const c = safeParse(line.slice(5), null);
        if (c) {
          const payload = {
            v: 1, playerCount: c.pc || 1, activePresetId: c.ap || null,
            activePresetIndex: c.ai || 0, customPresets: Array.isArray(c.ps) ? c.ps : [],
            updatedAt: Date.now()
          };
          importedPresets = payload.customPresets.length;
          localStorage.setItem(KEYS.PRESETS, JSON.stringify(payload));
        }
      } else if (line.startsWith('@SAV ')) {
        const incoming = safeParse(line.slice(5), null);
        if (incoming && typeof incoming === 'object') {
          const merged = Object.assign(this.getSavesMap(), incoming);
          importedSaves = Object.keys(incoming).length;
          this.normalizeSavesMap(merged, true);
          localStorage.setItem(KEYS.SAVES, JSON.stringify(merged));
        }
      }
    }

    this.markSaved();
    if (global.GameSettingsCanvas?.config) this.applyPresetsToMenu(global.GameSettingsCanvas);
    global.GameState?.showToast?.(`📂 Memory Card Loaded (${importedPresets} presets, ${importedSaves} saves)`);
    return { ok: true, countPresets: importedPresets, countSaves: importedSaves };
  };

  proto.promptImport = function() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.nammu,.txt,.json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) { resolve({ ok: false, canceled: true }); return; }
        try {
          const text = await file.text();
          resolve(this.importMemoryCardText(text));
        } catch (err) {
          global.GameState?.showToast?.(`⚠️ Memory Card Error: ${err.message}`);
          resolve({ ok: false, error: err.message });
        }
      };
      input.click();
    });
  };

  // ── AUTOMATIC PUZZLE LIFECYCLE HOOKS ──────────────────────────────────────
  proto.hookPuzzleLifecycle = function() {
    const settings = global.GameSettingsCanvas;
    if (settings) this.applyPresetsToMenu(settings);
    if (this._puzzleHooked) return;
    this._puzzleHooked = true;

    const self = this;
    const schedulePresetSave = () => {
      clearTimeout(self._presetSaveTimer);
      self._presetSaveTimer = setTimeout(() => self.savePresetsFromMenu(), 120);
    };

    if (settings) {
      ['launchMatch', 'popColumn', 'confirmPresetEdit'].forEach((fnName) => {
        if (typeof settings[fnName] === 'function') {
          const orig = settings[fnName].bind(settings);
          settings[fnName] = (...args) => {
            const res = orig(...args);
            schedulePresetSave();
            return res;
          };
        }
      });
    }

    if (global.TurnManager && typeof global.TurnManager.completeRoundAdvancement === 'function') {
      const origAdvance = global.TurnManager.completeRoundAdvancement.bind(global.TurnManager);
      global.TurnManager.completeRoundAdvancement = (...args) => {
        const res = origAdvance(...args);
        if (global.GameState?.matchStarted && !global.GameState?.gameOver) {
          self.saveActivePuzzleMatch();
        }
        return res;
      };
    }
  };

  proto._wireDrawerButtons = function(dom) {
    const btnSave = dom?.btnExportMemoryCard || document.getElementById('btn-export-memory-card');
    const btnLoad = dom?.btnImportMemoryCard || document.getElementById('btn-import-memory-card');
    btnSave?.addEventListener('click', () => { this.downloadMemoryCard(); global.AudioSynth?.playClick?.(); });
    btnLoad?.addEventListener('click', () => { this.promptImport(); global.AudioSynth?.playClick?.(); });
  };

  const instance = new MCM();
  global.MemoryCardManager = instance;
  global.ROLL_CALL = global.ROLL_CALL || new Map();
  global.ROLL_CALL.set('Memory_Card_Manager', instance);
})(typeof window !== 'undefined' ? window : this);
