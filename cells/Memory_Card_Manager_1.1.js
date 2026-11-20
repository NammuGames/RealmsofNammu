/**
 * @fileoverview cells/Memory_Card_Manager_1.1.js - Saved Matches, Room Codes & Snapshot Restore (Part 2/3)
 * @description Attaches match snapshot capture/restore, Room Code lobby persistence, and Saved Matches CRUD.
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
      turnPhase: g.turnPhase || 'MID_TURN',
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
      disease: diseaseData,
      turnLog: global.TurnLogManager?.exportState?.() || null
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
    g.roleBadge = (global.NetworkP2PManager?.role === 'guest') ? 'Player' : (snap.roleBadge || 'Player');
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
    g.turnPhase = snap.turnPhase || 'MID_TURN';
    g.matchStarted = true;
    g.isMatchStarting = false;
    g.isMatchEnding = false;
    g.isSequentialPlacing = false;
    if (global.TurnManager) {
      global.TurnManager.isEndingTurn = false;
      global.TurnManager.isStartingTurn = false;
    }

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
    if (g.turnPhase === 'START_TURN') {
      g.isMaterialSelected = false;
    } else if (!g.placedThisTurn && !g.gameOver) {
      if (isMyTurn) {
        if ((!g.materialsTray || !g.materialsTray.length || !g.getActiveMaterial?.()) && typeof g.refillTray === 'function') {
          g.refillTray();
        }
        g.isMaterialSelected = true;
      } else {
        g.isMaterialSelected = false;
      }
    }

    const needCamReset = !this._lastRestoredMatchId || this._lastRestoredMatchId !== snap.id || global.BoardRenderer?.currentBoardRadius !== g.boardRadius;
    this._lastRestoredMatchId = snap.id || null;
    if (global.BoardRenderer) {
      global.BoardRenderer.currentBoardRadius = g.boardRadius;
      if (needCamReset) global.BoardRenderer.resetCamera?.();
    }
    this.activeMatchId = snap.id || this.activeMatchId;
    if (snap.turnLog && global.TurnLogManager?.importState) {
      global.TurnLogManager.importState(snap.turnLog);
    }
    g.evaluateSigils?.();
    g.syncUI();
    global.UICardsDeck?.syncMaterialsQueueColumn?.();
    global.UICardsDeck?.syncSpellbookColumn?.();
    global.BoardRenderer?.render?.();
    if (isMyTurn && g.turnPhase === 'START_TURN' && !g.gameOver && global.TurnManager?.startPlayerTurn) {
      setTimeout(() => global.TurnManager.startPlayerTurn(), 60);
    }
    return true;
  };
})(typeof window !== 'undefined' ? window : this);
