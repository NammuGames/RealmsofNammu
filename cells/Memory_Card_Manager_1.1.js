/**
 * @fileoverview cells/Memory_Card_Manager_1.1.js - Saved Matches, Drafts, Tags & Restore (Part 2/3)
 * @description Attaches match snapshot capture/restore, Draft CRUD & cloning, unique ### tag
 * preservation, full roster metadata persistence, and Saved Matches CRUD.
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

  const { KEYS, MAX_SAVES, safeParse, deepClone, inferMatchType } = MCM._helpers;

  function persistTrimmedSaves(saves) {
    const ordered = Object.values(saves).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const trimmed = {};
    ordered.slice(0, MAX_SAVES).forEach(s => { if (s?.id) trimmed[s.id] = s; });
    localStorage.setItem(KEYS.SAVES, JSON.stringify(trimmed));
    return trimmed;
  }

  function buildPresetSnapshotFromMatch(source) {
    if (source?.presetSnapshot) return deepClone(source.presetSnapshot);
    const mc = source?.matchConfig || {};
    return {
      id: `draft_preset_${Date.now()}`,
      name: mc.presetName || source?.presetName || 'Custom',
      isDefault: false,
      match: {
        materialComposition: mc.materialComposition || 'Random',
        luckComposition: mc.luckComposition || 'Random',
        startingSpells: mc.startingSpells ?? 0,
        rounds: mc.rounds ?? source?.maxRounds ?? 144,
        boardRadius: mc.boardRadius ?? source?.boardRadius ?? 6,
        isEndless: !!(mc.isEndless ?? source?.isEndless)
      },
      luck: mc.luck ? deepClone(mc.luck) : null,
      blight: mc.blight ? deepClone(mc.blight) : null
    };
  }

  proto.getMatchTagLabel = function(entry) {
    if (!entry) return 'Local 001';
    const type = inferMatchType(entry);
    const tag = entry.tagNumber || '001';
    return `${type} ${tag}`;
  };

  // ── MATCH SNAPSHOT SAVE / DRAFT CRUD / LIST / DELETE / RESTORE ────────────
  proto.capturePuzzleState = function(matchId = null, opts = {}) {
    const g = global.GameState;
    if (!g || !g.matchStarted) return null;
    if (global.POVManager?.isPeekingTurnStart?.()) {
      return global.POVManager.withLiveTurnState(() => this.capturePuzzleState(matchId, opts));
    }

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

    const net = global.NetworkP2PManager;
    const isOnlineNet = !!(net && net.role !== 'offline');
    const saves = this.getSavesMap();
    let existing = matchId ? saves[matchId] : (this.activeMatchId ? saves[this.activeMatchId] : null);

    const candidateCode = String(opts.roomCode || g.roomCode || existing?.roomCode || (isOnlineNet ? net.roomCode : '') || '').toUpperCase();
    if (!existing && candidateCode) {
      existing = Object.values(saves).find(s => !s?.isDraft && String(s?.roomCode || '').toUpperCase() === candidateCode) || null;
    }

    const id = existing?.id || matchId || this.activeMatchId || `puzzle_${Date.now()}`;
    this.activeMatchId = id;

    let matchType = opts.matchType;
    if (!matchType) {
      if (net?.role === 'host') matchType = 'Host';
      else if (net?.role === 'guest') matchType = 'Guest';
      else if (g.lobbyMode === 'Online' && (existing?.matchType === 'Host' || existing?.matchType === 'Guest')) {
        matchType = existing.matchType;
      } else {
        matchType = 'Local';
      }
    }

    const lobbyMode = (matchType === 'Host' || matchType === 'Guest') ? 'Online' : 'Local';
    const roleBadge = (matchType === 'Host') ? 'Host' : 'Player';
    const roomCode = candidateCode || (lobbyMode === 'Online' ? this.generateUniqueRoomCode() : '');
    const matchName = opts.matchName || g.matchName || existing?.matchName || (roomCode ? `Match ${roomCode}` : 'Saved Match');
    const tagNumber = existing?.tagNumber || this.allocateMatchTagNumber(saves);

    let rosterMeta = existing?.rosterMeta ? deepClone(existing.rosterMeta) : null;
    if (isOnlineNet && typeof net.getRosterMetadata === 'function') {
      const liveRoster = net.getRosterMetadata();
      if (liveRoster && (liveRoster.seatOwners?.length || liveRoster.roomSeats?.length)) {
        rosterMeta = liveRoster;
      }
    }

    const workingPreset = global.GameSettingsCanvas?.getActiveWorkingPreset?.();
    const presetSnapshot = existing?.presetSnapshot
      ? deepClone(existing.presetSnapshot)
      : (workingPreset ? deepClone(workingPreset) : null);

    g.roomCode = roomCode;
    g.matchName = matchName;
    g.matchType = matchType;
    g.tagNumber = tagNumber;
    g.roleBadge = roleBadge;
    g.lobbyMode = lobbyMode;

    return {
      id, game: 'puzzle', name: matchName, matchName, matchType, tagNumber,
      isDraft: false, matchStarted: true, isLobbyPlaceholder: false,
      roomCode, roleBadge, lobbyMode,
      createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now(),
      round: g.round, maxRounds: g.maxRounds, isEndless: !!g.isEndless,
      level: g.level, boardRadius: g.boardRadius, playerCount: g.playerCount,
      activePlayerIndex: g.activePlayerIndex, currentPlayerId: g.currentPlayerId,
      score: g.score, hp: g.hp, maxHp: g.maxHp, pendingHeal: g.pendingHeal || 0,
      gameOver: !!g.gameOver, turnPhase: g.turnPhase || 'MID_TURN',
      placedThisTurn: !!g.placedThisTurn, isMaterialSelected: !!g.isMaterialSelected,
      selectedTrayIndex: g.selectedTrayIndex || 0, selectedRotation: g.selectedRotation || 0,
      upDownAxisState: g.upDownAxisState || 0,
      placementCursor: deepClone(g.placementCursor || { q: 0, r: 0 }),
      activeMaterialMod: deepClone(g.activeMaterialMod || null),
      roundBonusPoints: g.roundBonusPoints || 0, archZones: deepClone(g.archZones || []),
      fortifiedTiles: Array.from(g.fortifiedTiles || []),
      matchConfig: deepClone(g.matchConfig || existing?.matchConfig || null),
      presetSnapshot, presetName: g.matchConfig?.presetName || existing?.presetName || 'Meditate',
      rosterMeta, boardTiles, players: deepClone(g.players || []),
      disease: diseaseData, turnLog: global.TurnLogManager?.exportState?.() || null
    };
  };

  proto.findSaveByRoomCode = function(roomCode) {
    const code = String(roomCode || '').trim().toUpperCase();
    if (!code) return null;
    return this.listSaves().find(s => !s?.isDraft && String(s?.roomCode || '').toUpperCase() === code) || null;
  };

  /** Creates a new editable Draft card with this device's next unique ### tag. */
  proto.createDraft = function(opts = {}) {
    const cleanName = String(opts.name || opts.matchName || '').trim();
    if (!cleanName) return null;
    const saves = this.getSavesMap();
    const id = opts.id || `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const tagNumber = this.allocateMatchTagNumber(saves);
    const presetSnap = opts.presetSnapshot ? deepClone(opts.presetSnapshot) : buildPresetSnapshotFromMatch(opts);
    const mc = opts.matchConfig ? deepClone(opts.matchConfig) : (presetSnap?.match ? deepClone({ ...presetSnap.match, presetName: presetSnap.name }) : null);
    const now = Date.now();

    const draft = {
      id,
      game: 'puzzle',
      name: cleanName,
      matchName: cleanName,
      matchType: 'Draft',
      tagNumber,
      isDraft: true,
      matchStarted: false,
      isLobbyPlaceholder: false,
      roomCode: '',
      roleBadge: 'Player',
      lobbyMode: 'Local',
      createdAt: now,
      updatedAt: now,
      round: 1,
      maxRounds: mc?.rounds ?? presetSnap?.match?.rounds ?? 144,
      isEndless: !!(mc?.isEndless ?? presetSnap?.match?.isEndless),
      boardRadius: mc?.boardRadius ?? presetSnap?.match?.boardRadius ?? 6,
      playerCount: Math.max(1, Math.min(6, Number(opts.playerCount) || 1)),
      presetName: opts.presetName || mc?.presetName || presetSnap?.name || 'Meditate',
      matchConfig: mc,
      presetSnapshot: presetSnap,
      rosterMeta: null,
      boardTiles: []
    };

    saves[id] = draft;
    persistTrimmedSaves(saves);
    this.markUnsaved();
    return draft;
  };

  /** Updates an existing Draft card's editable settings while preserving its id and ### tag. */
  proto.updateDraft = function(draftId, patch = {}) {
    if (!draftId) return null;
    const saves = this.getSavesMap();
    const existing = saves[draftId];
    if (!existing || existing.matchType !== 'Draft') return null;

    const nextName = patch.name !== undefined || patch.matchName !== undefined
      ? String(patch.name ?? patch.matchName ?? '').trim() || existing.matchName
      : existing.matchName;

    const updated = Object.assign({}, existing, {
      name: nextName,
      matchName: nextName,
      playerCount: patch.playerCount !== undefined ? Math.max(1, Math.min(6, Number(patch.playerCount) || 1)) : existing.playerCount,
      presetName: patch.presetName !== undefined ? patch.presetName : existing.presetName,
      matchConfig: patch.matchConfig !== undefined ? deepClone(patch.matchConfig) : existing.matchConfig,
      presetSnapshot: patch.presetSnapshot !== undefined ? deepClone(patch.presetSnapshot) : existing.presetSnapshot,
      maxRounds: patch.matchConfig?.rounds ?? patch.presetSnapshot?.match?.rounds ?? existing.maxRounds,
      isEndless: !!(patch.matchConfig?.isEndless ?? patch.presetSnapshot?.match?.isEndless ?? existing.isEndless),
      boardRadius: patch.matchConfig?.boardRadius ?? patch.presetSnapshot?.match?.boardRadius ?? existing.boardRadius,
      updatedAt: Date.now()
    });

    saves[draftId] = updated;
    persistTrimmedSaves(saves);
    this.markUnsaved();
    return updated;
  };

  /** Clones any Draft/Local/Host/Guest match's settings into a brand-new editable Draft card. */
  proto.cloneMatchToDraft = function(sourceId, newName) {
    const source = this.getSaveById(sourceId);
    if (!source) return null;
    const cleanName = String(newName || `${source.matchName || source.name || 'Match'} (Copy)`).trim();
    const presetSnapshot = buildPresetSnapshotFromMatch(source);
    const matchConfig = source.matchConfig ? deepClone(source.matchConfig) : deepClone({ ...presetSnapshot.match, presetName: presetSnapshot.name });
    return this.createDraft({
      name: cleanName,
      playerCount: source.playerCount || 1,
      presetName: source.presetName || presetSnapshot.name || 'Custom',
      matchConfig,
      presetSnapshot
    });
  };

  /** Promotes an armed Draft card in place to a started Local/Host match, preserving its ### tag. */
  proto.promoteDraftToStarted = function(draftId, opts = {}) {
    if (!draftId) return this.saveActivePuzzleMatch(null, opts);
    this.activeMatchId = draftId;
    return this.saveActivePuzzleMatch(draftId, opts);
  };

  /** Guests no longer persist premature lobby cards before match start; only started matches save. */
  proto.saveJoinedLobbyMatch = function(info = {}) {
    if (!info || !info.matchStarted) return null;
    const code = String(info.roomCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (!code) return null;
    const saves = this.getSavesMap();
    const existing = Object.values(saves).find(s => !s?.isDraft && String(s?.roomCode || '').toUpperCase() === code) || null;
    const id = existing?.id || `match_${code}`;
    const tagNumber = existing?.tagNumber || this.allocateMatchTagNumber(saves);
    const matchName = info.matchName || existing?.matchName || `Match ${code}`;
    const snap = Object.assign({}, existing || {}, {
      id,
      game: 'puzzle',
      name: matchName,
      matchName,
      matchType: 'Guest',
      tagNumber,
      isDraft: false,
      matchStarted: true,
      isLobbyPlaceholder: false,
      roomCode: code,
      roleBadge: 'Player',
      lobbyMode: 'Online',
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
      round: existing?.round || 1,
      maxRounds: info.matchConfig?.rounds ?? existing?.maxRounds ?? 144,
      isEndless: !!(info.matchConfig?.isEndless ?? existing?.isEndless),
      boardRadius: info.matchConfig?.boardRadius || existing?.boardRadius || 6,
      playerCount: info.playerCount || existing?.playerCount || 2,
      presetName: info.presetName || existing?.presetName || 'Meditate',
      matchConfig: info.matchConfig ? deepClone(info.matchConfig) : (existing?.matchConfig || null),
      rosterMeta: info.rosterMeta ? deepClone(info.rosterMeta) : (existing?.rosterMeta || null),
      boardTiles: existing?.boardTiles || []
    });

    saves[id] = snap;
    persistTrimmedSaves(saves);
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
        const entry = saves[k];
        if (k !== snap.id && !entry?.isDraft && String(entry?.roomCode || '').toUpperCase() === code) {
          if (!snap.tagNumber && entry?.tagNumber) snap.tagNumber = entry.tagNumber;
          delete saves[k];
        }
      });
    }
    saves[snap.id] = snap;
    persistTrimmedSaves(saves);
    this.markUnsaved();
    return snap;
  };

  proto.getSavesMap = function() {
    const raw = safeParse(localStorage.getItem(KEYS.SAVES), {});
    return this.normalizeSavesMap(raw, true);
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
    if (gsc && gsc.armedDraftId === matchId) gsc.armedDraftId = null;
    this.markUnsaved();
    return true;
  };
  proto.deleteMatch = proto.deleteSavedMatch;

  proto.restorePuzzleState = function(snap, opts = {}) {
    const g = global.GameState;
    if (!snap || !g || snap.isDraft || snap.matchType === 'Draft') return false;
    const wasMatchStarted = !!g.matchStarted;
    const animateSpawn = (opts.animateSpawn !== undefined) ? !!opts.animateSpawn : !wasMatchStarted;

    if (global.GameSettingsCanvas?.isOpen?.()) global.GameSettingsCanvas.close();
    global.BoardRenderer?.cancelMatchStartAnim?.();

    g.matchConfig = snap.matchConfig ? deepClone(snap.matchConfig) : null;
    g.matchName = snap.matchName || snap.name || 'Saved Match';
    g.matchType = inferMatchType(snap);
    g.tagNumber = snap.tagNumber || '';
    g.roomCode = snap.roomCode || '';
    g.roleBadge = (global.NetworkP2PManager?.role === 'guest') ? 'Player' : (snap.roleBadge || (g.matchType === 'Host' ? 'Host' : 'Player'));
    g.lobbyMode = (g.matchType === 'Host' || g.matchType === 'Guest') ? 'Online' : (snap.lobbyMode || 'Local');
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
    global.POVManager?.onMatchRestored?.(g.activePlayerIndex || 0);
    const refreshBoardUI = () => {
      g.syncUI();
      global.UICardsDeck?.syncMaterialsQueueColumn?.();
      global.UICardsDeck?.syncSpellbookColumn?.();
      global.BoardRenderer?.render?.();
    };
    const finishRestoredTurn = () => {
      const logPending = !!(global.TurnLogManager?.hasPendingEntries?.() || global.TurnLogPlayer?.active);
      g.isMaterialSelected = !!(isMyTurn && !g.placedThisTurn && !g.gameOver && g.turnPhase !== 'START_TURN' && !logPending);
      if (g.isMaterialSelected) {
        global.MatchOrchestrator?.triggerActiveMaterialSpawnPulse?.(g);
      }
      refreshBoardUI();
      if (isMyTurn && g.turnPhase === 'START_TURN' && !g.gameOver && !logPending && global.TurnManager?.startPlayerTurn) {
        setTimeout(() => global.TurnManager.startPlayerTurn(), 60);
      }
    };
    if (animateSpawn && global.MatchOrchestrator?.spawnBoardSilently) {
      global.MatchOrchestrator.spawnBoardSilently(g, { onReady: finishRestoredTurn });
    }
    refreshBoardUI();
    if ((!animateSpawn || !global.MatchOrchestrator?.spawnBoardSilently) && isMyTurn && g.turnPhase === 'START_TURN' && !g.gameOver && global.TurnManager?.startPlayerTurn) {
      setTimeout(() => global.TurnManager.startPlayerTurn(), 60);
    }
    return true;
  };
})(typeof window !== 'undefined' ? window : this);
