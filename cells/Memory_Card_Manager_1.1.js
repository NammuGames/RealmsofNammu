/**
 * @fileoverview cells/Memory_Card_Manager_1.1.js - Saved Matches, Room Codes & .nammu I/O (Part 2/2)
 * @description Attaches match snapshot persistence (matchName, permanent roomCode, Host/Player
 * roleBadge), Saved Matches deletion, shorthand .nammu export/import, and Puzzle lifecycle hooks.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const MCM = global.MemoryCardManagerClass;
  const proto = MCM?.prototype;
  if (!proto || !MCM._helpers) {
    console.error('[Memory_Card_Manager_1.1] Load Memory_Card_Manager_1.0.js first.');
    return;
  }

  const { KEYS, MAX_SAVES, safeParse, deepClone } = MCM._helpers;

  // ── MATCH SNAPSHOT SAVE / LIST / DELETE / RESTORE ─────────────────────────
  proto.capturePuzzleState = function(matchId = null, opts = {}) {
    const g = global.GameState;
    if (!g || !g.matchStarted) return null;

    if (global.MatchOrchestrator?.saveActivePlayerFromState) {
      global.MatchOrchestrator.saveActivePlayerFromState(g);
    }

    const boardTiles = [];
    if (g.board) {
      for (const [k, t] of g.board.entries()) {
        if (t && (t.color || t.sigilId || t.fortified || t.burned || t.phased || t.woven || t.plagueId || t.underneath)) {
          boardTiles.push([k, deepClone(t)]);
        }
      }
    }

    const cd = global.ComponentDisease;
    const diseaseData = cd ? {
      nextId: cd.nextId || 0,
      shapes: Array.from(cd.shapes?.values?.() || []).map(s => deepClone(s))
    } : null;

    const existing = matchId ? this.getSaveById(matchId) : (this.activeMatchId ? this.getSaveById(this.activeMatchId) : null);
    const id = matchId || this.activeMatchId || `puzzle_${Date.now()}`;
    this.activeMatchId = id;

    const net = global.NetworkP2PManager;
    const roomCode = opts.roomCode || g.roomCode || existing?.roomCode || net?.roomCode || this.generateUniqueRoomCode();
    const matchName = opts.matchName || g.matchName || existing?.matchName || `Match ${roomCode}`;
    const roleBadge = opts.roleBadge || g.roleBadge || (net?.role === 'host' ? 'Host' : (existing?.roleBadge || 'Player'));
    const lobbyMode = opts.lobbyMode || g.lobbyMode || (net?.isConnected?.() ? 'Online' : (existing?.lobbyMode || 'Local'));

    g.roomCode = roomCode;
    g.matchName = matchName;
    g.roleBadge = roleBadge;
    g.lobbyMode = lobbyMode;

    return {
      id,
      game: 'puzzle',
      matchName,
      roomCode,
      roleBadge,
      lobbyMode,
      updatedAt: Date.now(),
      round: g.round,
      maxRounds: g.maxRounds,
      isEndless: !!g.isEndless,
      level: g.level,
      boardRadius: g.boardRadius,
      playerCount: g.playerCount,
      activePlayerIndex: g.activePlayerIndex,
      currentPlayerId: g.currentPlayerId,
      score: g.score,
      hp: g.hp,
      maxHp: g.maxHp,
      pendingHeal: g.pendingHeal || 0,
      gameOver: !!g.gameOver,
      placedThisTurn: !!g.placedThisTurn,
      isMaterialSelected: !!g.isMaterialSelected,
      selectedTrayIndex: g.selectedTrayIndex || 0,
      selectedRotation: g.selectedRotation || 0,
      upDownAxisState: g.upDownAxisState || 0,
      placementCursor: deepClone(g.placementCursor || { q: 0, r: 0 }),
      activeMaterialMod: deepClone(g.activeMaterialMod || null),
      roundBonusPoints: g.roundBonusPoints || 0,
      archZones: deepClone(g.archZones || []),
      fortifiedTiles: Array.from(g.fortifiedTiles || []),
      matchConfig: deepClone(g.matchConfig || null),
      presetName: g.matchConfig?.presetName || existing?.presetName || 'Meditate',
      boardTiles,
      players: deepClone(g.players || []),
      disease: diseaseData
    };
  };

  proto.findSaveByRoomCode = function(roomCode) {
    const code = String(roomCode || '').trim().toUpperCase();
    if (!code) return null;
    return this.listSaves().find(s => String(s?.roomCode || '').toUpperCase() === code) || null;
  };

  proto.saveJoinedLobbyMatch = function(info = {}) {
    const code = String(info.roomCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (!code) return null;
    const saves = this.getSavesMap();
    const existing = Object.values(saves).find(s => String(s?.roomCode || '').toUpperCase() === code) || null;
    const id = existing?.id || `match_${code}`;
    const snap = Object.assign({}, existing || {}, {
      id,
      game: 'puzzle',
      matchName: info.matchName || existing?.matchName || `Match ${code}`,
      roomCode: code,
      roleBadge: 'Player',
      lobbyMode: 'Online',
      updatedAt: Date.now(),
      round: existing?.round || 1,
      maxRounds: info.matchConfig?.rounds ?? existing?.maxRounds ?? 144,
      isEndless: !!(info.matchConfig?.isEndless ?? existing?.isEndless),
      boardRadius: info.matchConfig?.boardRadius || existing?.boardRadius || 6,
      playerCount: info.playerCount || existing?.playerCount || 2,
      presetName: info.presetName || existing?.presetName || 'Meditate',
      matchConfig: info.matchConfig ? deepClone(info.matchConfig) : (existing?.matchConfig || null),
      boardTiles: existing?.boardTiles || [],
      isLobbyPlaceholder: !existing?.boardTiles?.length
    });

    saves[id] = snap;
    const ordered = Object.values(saves).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const trimmed = {};
    ordered.slice(0, MAX_SAVES).forEach(s => { trimmed[s.id] = s; });
    localStorage.setItem(KEYS.SAVES, JSON.stringify(trimmed));
    this.markUnsaved();
    return snap;
  };

  proto.saveActivePuzzleMatch = function(matchId = null, opts = {}) {
    const snap = this.capturePuzzleState(matchId, opts);
    if (!snap) return null;
    const saves = this.getSavesMap();
    const code = String(snap.roomCode || '').toUpperCase();
    if (code) {
      Object.keys(saves).forEach((k) => {
        if (k !== snap.id && String(saves[k]?.roomCode || '').toUpperCase() === code) {
          delete saves[k];
        }
      });
    }
    saves[snap.id] = snap;

    const ordered = Object.values(saves).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const trimmed = {};
    ordered.slice(0, MAX_SAVES).forEach(s => { trimmed[s.id] = s; });
    localStorage.setItem(KEYS.SAVES, JSON.stringify(trimmed));
    this.markUnsaved();
    return snap;
  };

  proto.getSavesMap = function() {
    return safeParse(localStorage.getItem(KEYS.SAVES), {});
  };

  proto.getSaveById = function(id) {
    if (!id) return null;
    return this.getSavesMap()[id] || null;
  };

  proto.listSaves = function() {
    return Object.values(this.getSavesMap()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  };

  proto.deleteSavedMatch = function(matchId) {
    if (!matchId) return false;
    const saves = this.getSavesMap();
    if (!saves[matchId]) return false;
    delete saves[matchId];
    localStorage.setItem(KEYS.SAVES, JSON.stringify(saves));
    if (this.activeMatchId === matchId) this.activeMatchId = null;
    const gsc = global.GameSettingsCanvas;
    if (gsc && gsc.selectedSavedMatchId === matchId) gsc.selectedSavedMatchId = null;
    this.markUnsaved();
    return true;
  };

  proto.restorePuzzleState = function(snap) {
    const g = global.GameState;
    if (!snap || !g) return false;

    if (global.GameSettingsCanvas?.isOpen?.()) global.GameSettingsCanvas.close();
    global.BoardRenderer?.cancelMatchStartAnim?.();

    g.matchConfig = snap.matchConfig ? deepClone(snap.matchConfig) : null;
    g.matchName = snap.matchName || 'Saved Match';
    g.roomCode = snap.roomCode || '';
    g.roleBadge = snap.roleBadge || 'Player';
    g.lobbyMode = snap.lobbyMode || 'Local';
    g.isEndless = !!snap.isEndless;
    g.maxRounds = snap.maxRounds ?? 144;
    g.totalRounds = g.maxRounds;
    g.boardRadius = snap.boardRadius || 6;
    g.initBoard();
    (snap.boardTiles || []).forEach(([key, tData]) => {
      const tile = g.board.get(key);
      if (tile) Object.assign(tile, deepClone(tData));
    });

    g.round = snap.round || 1;
    g.level = snap.level || 1;
    g.playerCount = snap.playerCount || 1;
    g.activePlayerIndex = snap.activePlayerIndex || 0;
    g.currentPlayerId = snap.currentPlayerId || 1;
    g.players = deepClone(snap.players || []);
    g.archZones = deepClone(snap.archZones || []);
    g.fortifiedTiles = new Set(snap.fortifiedTiles || []);
    g.activeDamageTiles = [];
    g.roundBonusPoints = snap.roundBonusPoints || 0;
    g.activeMaterialMod = deepClone(snap.activeMaterialMod || null);
    g.placedThisTurn = !!snap.placedThisTurn;
    g.isMaterialSelected = !!snap.isMaterialSelected;
    g.selectedTrayIndex = snap.selectedTrayIndex || 0;
    g.selectedRotation = snap.selectedRotation || 0;
    g.upDownAxisState = snap.upDownAxisState || 0;
    g.placementCursor = deepClone(snap.placementCursor || { q: 0, r: 0 });
    g.gameOver = !!snap.gameOver;
    g.matchStarted = true;
    g.isMatchStarting = false;
    g.isMatchEnding = false;
    g.isSequentialPlacing = false;
    if (global.TurnManager) global.TurnManager.isEndingTurn = false;

    if (global.ComponentDisease) {
      global.ComponentDisease.reset();
      if (snap.disease) {
        global.ComponentDisease.nextId = snap.disease.nextId || 0;
        (snap.disease.shapes || []).forEach(s => {
          if (s?.id) global.ComponentDisease.shapes.set(s.id, deepClone(s));
        });
      }
    }

    if (g.matchConfig && global.MatchOrchestrator?.buildRoundSchedule) {
      global.MatchOrchestrator.buildRoundSchedule(g.matchConfig);
    }
    if (global.MatchOrchestrator?.loadPlayerIntoState && g.players.length > 0) {
      global.MatchOrchestrator.loadPlayerIntoState(g, g.activePlayerIndex);
    } else {
      g.score = snap.score || 0;
      g.hp = snap.hp ?? 12;
      g.maxHp = snap.maxHp || 12;
      g.pendingHeal = snap.pendingHeal || 0;
    }

    const net = global.NetworkP2PManager;
    const isOnline = !!net?.isConnected?.();
    const isMyTurn = !isOnline || net.isLocalPlayersTurn();
    if (!g.placedThisTurn && !g.gameOver) {
      if (isMyTurn) {
        if ((!g.tray || !g.tray.length || !g.getActiveMaterial?.()) && typeof g.refillTray === 'function') {
          g.refillTray();
        }
        g.isMaterialSelected = true;
      } else {
        g.isMaterialSelected = false;
      }
    }

    if (global.BoardRenderer) {
      global.BoardRenderer.currentBoardRadius = g.boardRadius;
      global.BoardRenderer.resetCamera?.();
    }
    this.activeMatchId = snap.id || this.activeMatchId;
    g.evaluateSigils?.();
    g.syncUI();
    global.UICardsDeck?.syncMaterialsQueueColumn?.();
    global.UICardsDeck?.syncSpellbookColumn?.();
    global.BoardRenderer?.render?.();
    return true;
  };

  // ── SHORTHAND MEMORY CARD FILE (.nammu) EXPORT & IMPORT ───────────────────
  proto.encodeMemoryCard = function() {
    if (global.GameSettingsCanvas?.config) this.savePresetsFromMenu(global.GameSettingsCanvas, { silent: true });
    const profile = this.getProfile();
    const presets = safeParse(localStorage.getItem(KEYS.PRESETS), { v: 1, playerCount: 1, customPresets: [] });
    const saves = this.getSavesMap();

    return [
      '@NAMMU_MC v1',
      `@P ${JSON.stringify({ n: profile.name, t: profile.tag, u: profile.updatedAt })}`,
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
        if (p) localStorage.setItem(KEYS.PROFILE, JSON.stringify({ v: 1, name: p.n || 'Player 1', tag: p.t || '001', updatedAt: Date.now() }));
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
