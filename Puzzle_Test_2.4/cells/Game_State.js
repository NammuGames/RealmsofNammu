/**
 * @fileoverview Game_State.js - Core Board State, Vitality & Placement Cursor
 * @description Manages the concentric bilateral hex board, 24 HP vitality pool, materials
 * conveyor queue, piece movement & rotation, and coordinates with SigilResolver,
 * TurnManager, UndoManager, and SpellManager.
 */

(function(global) {
  'use strict';

  class GameStateManager {
    constructor() {
      // Board Object Properties (Concentric Flower on Bilateral Grid)
      this.boardRadius = 6; // Default: 6 rings = 127 hexes (selectable: 4, 5, 6, 7)
      this.board = new Map(); // key "q,r" -> { q, r, color: null, sigilId: null, fortified: false }

      // Vitality / Hull Properties (12 HP)
      this.maxHp = 12; this.hp = 12; this.gameOver = false;
      this.activeDamageTiles = []; // Off-board segments placed during current turn
      this.pendingHeal = 0; // Staged healing points (+4 per Feral Heal)

      // Materials, Spells & Components
      this.materialsTray = []; this.totalMaterialsSpawned = 0; this.selectedTrayIndex = 0;
      this.isMaterialSelected = false; this.selectedRotation = 0; this.placementCursor = { q: 0, r: 0 };
      this.upDownAxisState = 0; this.spellbookCapacity = 12; this.componentsBagCapacity = 6;
      this.spellbook = []; this.componentsBag = []; this.ritualSlots = new Set(); this.overflowSpells = [];
      this.roundBonusPoints = 0; this.archZones = []; this.activeMaterialMod = null;
      this.fortifiedTiles = new Set(); this.weaveStep = 0; this.weavePlacedTiles = [];
      this.placedThisTurn = false; this.round = 1; this.level = 1; this.score = 0; this.hoveredHex = null; this.activeRightPanel = 'materials';
      this.matchConfig = null; this.playerCount = 1; this.activePlayerIndex = 0; this.players = [];
      this.matchStarted = false; this.isMatchStarting = false; this.isMatchEnding = false;
      this.turnPhase = 'MID_TURN'; // 'START_TURN' | 'MID_TURN' | 'END_TURN'
    }

    get pendingDamage() { return typeof this.getPendingDamage === 'function' ? this.getPendingDamage() : (this.activeDamageTiles?.length || 0); }
    get netPending() { return (this.pendingHeal || 0) - this.pendingDamage; }
    get isLastBreath() {
      const netDmg = Math.max(0, this.pendingDamage - (this.pendingHeal || 0));
      return netDmg > 0 && (this.hp - netDmg <= 0);
    }

    showToast(msg) {
      const fn = global.UISidebars?.showToast || global.SigilEmblemStudio?.showToast;
      if (typeof fn === 'function') fn(msg);
    }

    syncUI() {
      global.UISidebars?.renderTrayUI?.();
      global.UISidebars?.renderSpellbookUI?.();
      global.UISidebars?.syncNavState?.();
      global.UISidebars?.updateHpBar?.();
      global.NativeStatPod?.markDirty?.();
    }

    initSpellbook(forTesting = true, startingCharges = null) {
      this.spellbook = global.MaterialsData?.createDefaultSpellbook?.(forTesting, startingCharges) || [];
      this.enablePermanentSpellbook();
    }

    enablePermanentSpellbook() {
      if (!this.spellbook) return;
      const seen = new Set();
      for (let i = this.spellbook.length - 1; i >= 0; i--) {
        const s = this.spellbook[i];
        if (s && s.permanent) {
          const id = s.formula || s.name || s.key;
          if (seen.has(id)) Array.prototype.splice.call(this.spellbook, i, 1);
          else seen.add(id);
        }
      }
      if (this.spellbook._permanentWrapped) return;
      this.spellbook._permanentWrapped = true;
      const origSplice = this.spellbook.splice.bind(this.spellbook);
      this.spellbook.splice = (start, deleteCount, ...items) => {
        // Consumption (casting): consume 1 charge instead of deleting from array
        if (deleteCount > 0 && start >= 0 && start < this.spellbook.length && items.length === 0) {
          const target = this.spellbook[start];
          if (target && target.permanent) {
            if (typeof target.charges === 'number') target.charges = Math.max(0, target.charges - 1);
            return [{ ...target }];
          }
        }
        // Restoration (undo): refill 1 charge on existing permanent spell instead of duplicating
        if (deleteCount === 0 && items.length === 1 && items[0]) {
          const ret = items[0];
          const exist = (start >= 0 && start < this.spellbook.length && (
            (ret.key && this.spellbook[start].key === ret.key) ||
            (ret.formula && this.spellbook[start].formula === ret.formula) ||
            (ret.name && this.spellbook[start].name === ret.name)
          )) ? this.spellbook[start] : this.spellbook.find(s => s && (
            (ret.key && s.key === ret.key) ||
            (ret.formula && s.formula === ret.formula) ||
            (ret.name && s.name === ret.name)
          ));
          if (exist && exist.permanent) {
            if (typeof exist.charges === 'number') {
              exist.charges = Math.min(exist.maxCharges || 3, (exist.charges || 0) + 1);
            }
            return [];
          }
        }
        return origSplice(start, deleteCount, ...items);
      };
    }

    // ======================================================================
    // SIGIL RESOLVER PROXIES & GETTERS
    // ======================================================================
    get inSigilStage() { return global.SigilResolver?.inSigilStage ?? false; } set inSigilStage(v) { if (global.SigilResolver) global.SigilResolver.inSigilStage = v; } get showSigilAlignments() { return global.SigilResolver?.showSigilAlignments ?? false; } set showSigilAlignments(v) { if (global.SigilResolver) global.SigilResolver.showSigilAlignments = v; }
    get sigilCursorVertex() { return global.SigilResolver?.sigilCursorVertex ?? { type: 'up', q: 0, r: 0 }; } set sigilCursorVertex(v) { if (global.SigilResolver) global.SigilResolver.sigilCursorVertex = v; } get allCandidates() { return global.SigilResolver?.allCandidates ?? []; } set allCandidates(v) { if (global.SigilResolver) global.SigilResolver.allCandidates = v; }
    get overlapsMap() { return global.SigilResolver?.overlapsMap ?? new Map(); } set overlapsMap(v) { if (global.SigilResolver) global.SigilResolver.overlapsMap = v; } get lockedSigilIds() { return global.SigilResolver?.lockedSigilIds ?? new Set(); } set lockedSigilIds(v) { if (global.SigilResolver) global.SigilResolver.lockedSigilIds = v; }
    get activeSigilIds() { return this.lockedSigilIds; } set activeSigilIds(v) { this.lockedSigilIds = v; }
    get dormantSigilIds() { return global.SigilResolver?.dormantSigilIds ?? new Set(); } set dormantSigilIds(v) { if (global.SigilResolver) global.SigilResolver.dormantSigilIds = v; } get selectedSigilId() { return global.SigilResolver?.selectedSigilId ?? null; } set selectedSigilId(v) { if (global.SigilResolver) global.SigilResolver.selectedSigilId = v; }
    get activeSigils() { return global.SigilResolver?.activeSigils ?? []; } set activeSigils(v) { if (global.SigilResolver) global.SigilResolver.activeSigils = v; } get resonantSigils() { return global.SigilResolver?.resonantSigils ?? new Set(); } set resonantSigils(v) { if (global.SigilResolver) global.SigilResolver.resonantSigils = v; }
    get resonantPairs() { return global.SigilResolver?.resonantPairs ?? []; } set resonantPairs(v) { if (global.SigilResolver) global.SigilResolver.resonantPairs = v; }

    evaluateSigils() { global.SigilResolver?.evaluateSigils(this.board); } resolveInitialSigils(options) { global.SigilResolver?.resolveInitialSigils(this.board, options); }
    cascadeLockResolutions() { global.SigilResolver?.cascadeLockResolutions(); } placeDormantSigil(id) { return global.SigilResolver?.placeDormantSigil(id, this.board) ?? false; }
    cycleWildSpell(id) { return global.SigilResolver?.cycleWildSpell(id, this.board) ?? false; } permuteWildColors(id, dir) { return global.SigilResolver?.permuteWildColors(id, dir, this.board) ?? false; }
    syncBoardSigilTiles() { global.SigilResolver?.syncBoardSigilTiles(this.board); } moveSigilVertex(dir) { return global.SigilResolver?.moveSigilVertex(dir, this.boardRadius) ?? false; }
    focusSigil(id) { global.SigilResolver?.focusSigil(id); } getEstimatedPoints() { return global.SigilResolver?.getEstimatedPoints() ?? 0; }
    getComboText() { return global.SigilResolver?.getComboText() ?? '0'; } getLockedSigilAtCursor() { return global.SigilResolver?.getLockedSigilAtCursor() ?? null; }
    getActiveSigilAtCursor() { return this.getLockedSigilAtCursor(); }
    getDormantSigilAtCursor() { return global.SigilResolver?.getDormantSigilAtCursor() ?? null; } getTargetableSigilAtCursor() { return global.SigilResolver?.getTargetableSigilAtCursor() ?? null; }
    isTeleportLocationVacant(v) { return global.SigilResolver?.isTeleportLocationVacant(v, this.board, this.boardRadius) ?? false; }

    // ======================================================================
    // TURN & UNDO MANAGER DELEGATIONS
    // ======================================================================
    resolveLastBreathAndDamage(spells = []) { return global.TurnManager?.resolveLastBreathAndDamage(spells) ?? true; } endTurn() { return global.TurnManager?.endTurn?.() ?? false; } completeRoundAdvancement() { global.TurnManager?.completeRoundAdvancement(); }

    get undoStack() { return global.UndoManager?.undoStack ?? []; } set undoStack(v) { if (global.UndoManager) global.UndoManager.undoStack = v; }
    get redoStack() { return global.UndoManager?.redoStack ?? []; } set redoStack(v) { if (global.UndoManager) global.UndoManager.redoStack = v; }
    get spellsCastThisRound() { return global.UndoManager?.spellsCastThisRound ?? []; } set spellsCastThisRound(v) { if (global.UndoManager) global.UndoManager.spellsCastThisRound = v; }
    undoPlacement() { return global.UndoManager?.undoPlacement() ?? false; }
    recordSpellCast(entry) { global.UndoManager?.recordSpellCast(entry); }
    undoLastSpell() { return global.UndoManager?.undoLastSpell() ?? false; }

    // ======================================================================
    // SPELL MANAGER PROXIES
    // ======================================================================
    get inForesightMode() { return global.SpellManager?.inForesightMode ?? false; } set inForesightMode(v) { if (global.SpellManager) global.SpellManager.inForesightMode = v; } get inSpellOverflow() { return global.SpellManager?.inSpellOverflow ?? false; } set inSpellOverflow(v) { if (global.SpellManager) global.SpellManager.inSpellOverflow = v; }
    get overflowCandidates() { return global.SpellManager?.overflowCandidates ?? []; } set overflowCandidates(v) { if (global.SpellManager) global.SpellManager.overflowCandidates = v; } get selectedOverflowIndices() { return global.SpellManager?.selectedOverflowIndices ?? new Set(); } set selectedOverflowIndices(v) { if (global.SpellManager) global.SpellManager.selectedOverflowIndices = v; }
    get foresightSwappedIndex() { return global.SpellManager?.foresightSwappedIndex ?? null; } set foresightSwappedIndex(v) { if (global.SpellManager) global.SpellManager.foresightSwappedIndex = v; } get foresightOriginalTray() { return global.SpellManager?.foresightOriginalTray ?? null; } set foresightOriginalTray(v) { if (global.SpellManager) global.SpellManager.foresightOriginalTray = v; }
    get foresightSpellIndex() { return global.SpellManager?.foresightSpellIndex ?? null; } set foresightSpellIndex(v) { if (global.SpellManager) global.SpellManager.foresightSpellIndex = v; } get inTeleportMode() { return global.SpellManager?.inTeleportMode ?? false; } set inTeleportMode(v) { if (global.SpellManager) global.SpellManager.inTeleportMode = v; }
    get teleportSpellIndex() { return global.SpellManager?.teleportSpellIndex ?? null; } set teleportSpellIndex(v) { if (global.SpellManager) global.SpellManager.teleportSpellIndex = v; } get teleportHeldSigil() { return global.SpellManager?.teleportHeldSigil ?? null; } set teleportHeldSigil(v) { if (global.SpellManager) global.SpellManager.teleportHeldSigil = v; }
    get teleportRotation() { return global.SpellManager?.teleportRotation ?? 0; } set teleportRotation(v) { if (global.SpellManager) global.SpellManager.teleportRotation = v; } get inChargeMode() { return global.SpellManager?.inChargeMode ?? false; } set inChargeMode(v) { if (global.SpellManager) global.SpellManager.inChargeMode = v; }
    get chargeSpellIndex() { return global.SpellManager?.chargeSpellIndex ?? null; } set chargeSpellIndex(v) { if (global.SpellManager) global.SpellManager.chargeSpellIndex = v; } get inShiftMode() { return global.SpellManager?.inShiftMode ?? false; } set inShiftMode(v) { if (global.SpellManager) global.SpellManager.inShiftMode = v; }
    get shiftSpellIndex() { return global.SpellManager?.shiftSpellIndex ?? null; } set shiftSpellIndex(v) { if (global.SpellManager) global.SpellManager.shiftSpellIndex = v; } get inArchMode() { return global.SpellManager?.inArchMode ?? false; } set inArchMode(v) { if (global.SpellManager) global.SpellManager.inArchMode = v; }
    get archSpellIndex() { return global.SpellManager?.archSpellIndex ?? null; } set archSpellIndex(v) { if (global.SpellManager) global.SpellManager.archSpellIndex = v; } get inRitualMode() { return global.SpellManager?.inRitualMode ?? false; } set inRitualMode(v) { if (global.SpellManager) global.SpellManager.inRitualMode = v; }
    get ritualSpellIndex() { return global.SpellManager?.ritualSpellIndex ?? null; } set ritualSpellIndex(v) { if (global.SpellManager) global.SpellManager.ritualSpellIndex = v; } get inManifestMode() { return global.SpellManager?.inManifestMode ?? false; } set inManifestMode(v) { if (global.SpellManager) global.SpellManager.inManifestMode = v; }
    get manifestSpellIndex() { return global.SpellManager?.manifestSpellIndex ?? null; } set manifestSpellIndex(v) { if (global.SpellManager) global.SpellManager.manifestSpellIndex = v; }

    castSpell(idx) { return global.SpellManager?.castSpell(idx) ?? false; } startForesight(idx) { return global.SpellManager?.startForesight(idx) ?? false; } selectForesightMaterial(tIdx) { global.SpellManager?.selectForesightMaterial(tIdx); }
    finalizeForesightSwap() { global.SpellManager?.finalizeForesightSwap(); } cancelForesightSwap() { global.SpellManager?.cancelForesightSwap(); } toggleOverflowSpell(idx) { global.SpellManager?.toggleOverflowSpell(idx); }
    confirmSpellOverflow() { global.SpellManager?.confirmSpellOverflow(); } startTeleport(idx) { return global.SpellManager?.startTeleport(idx) ?? false; } pickUpSigil() { return global.SpellManager?.pickUpSigil() ?? false; }
    placeTeleportSigil() { return global.SpellManager?.placeTeleportSigil() ?? false; } cancelTeleport() { return global.SpellManager?.cancelTeleport() ?? false; } triggerTeleportAction() { return global.SpellManager?.triggerTeleportAction() ?? false; }
    startCharge(idx) { return global.SpellManager?.startCharge(idx) ?? false; } mimicSelectedSigil() { return global.SpellManager?.mimicSelectedSigil() ?? false; } cancelCharge() { return global.SpellManager?.cancelCharge() ?? false; }
    startShift(idx) { return global.SpellManager?.startShift(idx) ?? false; } selectShiftSigil() { return global.SpellManager?.selectShiftSigil() ?? false; } triggerShiftAction() { return global.SpellManager?.triggerShiftAction() ?? false; }
    finalizeShift() { return global.SpellManager?.finalizeShift() ?? false; } cancelShift() { return global.SpellManager?.cancelShift() ?? false; } toggleArchSigilSelect() { return global.SpellManager?.toggleArchSigilSelect() ?? false; }
    finalizeArch() { return global.SpellManager?.finalizeArch() ?? false; } cancelArch() { return global.SpellManager?.cancelArch() ?? false; }

    // ======================================================================
    // BOARD & PIECE PLACEMENT METHODS
    // ======================================================================
    initBoard() {
      this.board.clear();
      for (let q = -this.boardRadius; q <= this.boardRadius; q++) {
        for (let r = -this.boardRadius; r <= this.boardRadius; r++) {
          if (global.HexMath && global.HexMath.hexDistance(q, r) <= this.boardRadius) {
            this.board.set(`${q},${r}`, { q, r, color: null, sigilId: null, fortified: false });
          }
        }
      }
    }

    setBoardRadius(newRadius) {
      if (newRadius < 3 || newRadius > 12) return;
      this.boardRadius = newRadius;
      this.initBoard();
      this.activeDamageTiles = [];
      this.evaluateSigils();
      global.BoardRenderer?.resetCamera?.();
      this.showToast(`Board resized to Radius-${newRadius} (${this.board.size} Tiles)`);
      this.syncUI();
    }

    isInsideBoard(q, r) {
      return global.HexMath ? global.HexMath.hexDistance(q, r) <= this.boardRadius : false;
    }

    getPendingDamage() {
      if (this.gameOver) return 0;
      let dmg = 0;
      if (this.activeDamageTiles) dmg += this.activeDamageTiles.filter(t => !t.plagueShapeId && !t.isPlacedPlague && t.color !== 'disease').length;
      if (this.board) {
        for (const tile of this.board.values()) {
          if (tile?.coveredComponent) dmg++;
        }
      }
      if (global.ComponentDisease?.getOffBoardPlagueDamage) dmg += global.ComponentDisease.getOffBoardPlagueDamage();
      return dmg;
    }

    getNetPending() {
      return (this.pendingHeal || 0) - this.getPendingDamage();
    }

    cleanseMaterialPlague() {
      const activeMat = this.materialsTray?.[0];
      if (!activeMat?.colors?.includes('disease')) return null;
      const prev = [...activeMat.colors], pool = ['blue', 'red', 'purple', 'yellow'];
      activeMat.colors = activeMat.colors.map((c, idx) => {
        if (c === 'disease') {
          if (activeMat.originalColors?.[idx] && activeMat.originalColors[idx] !== 'disease') return activeMat.originalColors[idx];
          return pool.find(col => !activeMat.colors.includes(col)) || 'blue';
        }
        return c;
      });
      return prev;
    }

    revertMaterialPlague(prevColors) {
      const activeMat = this.materialsTray?.[0];
      if (activeMat && Array.isArray(prevColors)) activeMat.colors = [...prevColors];
    }

    refillTray() {
      if (global.MatchOrchestrator?.refillPlayerTray) {
        global.MatchOrchestrator.refillPlayerTray(this);
        return;
      }
      if (!global.MaterialsData) return;
      while (this.materialsTray.length < 6) {
        const currentShapes = this.materialsTray.map(m => m.id);
        const allowSpecials = (this.totalMaterialsSpawned >= 6);
        const newMat = global.MaterialsData.createRandomMaterialExcluding(currentShapes, allowSpecials);
        this.materialsTray.push(newMat);
        this.totalMaterialsSpawned++;
      }
      this.selectedTrayIndex = 0;
    }

    getActiveMaterial() {
      const mat = this.materialsTray?.[0]; if (!mat?.coords) return null;
      let rotated = JSON.parse(JSON.stringify(mat.coords));
      for (let i = 0; i < this.selectedRotation; i++) rotated = global.HexMath.rotateCoordsCW(rotated);
      return { ...mat, activeCoords: rotated };
    }

    canPlaceMaterialAt(anchorQ, anchorR) {
      return global.PiecePlacement?.canPlaceMaterialAt(this, anchorQ, anchorR) ?? false;
    }

    moveDirection(dir) {
      if (this.inSpellOverflow || this.inForesightMode) return false;
      if (this.inShiftMode) return global.SpellShift?.moveDirection(dir) ?? false;
      if (this.inArchMode) return global.SpellArch?.moveDirection(dir) ?? false;
      if (this.inRitualMode) return global.SpellRitual?.moveDirection(dir) ?? false;
      if (this.inManifestMode) return global.SpellManifest?.moveDirection(dir) ?? false;
      if (this.inSigilStage || this.inTeleportMode || this.inChargeMode) return this.moveSigilVertex(dir);
      if (this.activeMaterialMod === 'weave' && (global.SpellWeave?.placedTiles?.length >= 4 || this.weavePlacedTiles?.length >= 4)) return false;
      if (!this.isMaterialSelected || this.placedThisTurn || this.gameOver) return false;

      let nq = this.placementCursor.q, nr = this.placementCursor.r;
      if (dir === 'left') { nq -= 1; nr += 1; }
      else if (dir === 'right') { nq += 1; nr -= 1; }
      else if (dir === 'up') {
        if (this.upDownAxisState === 0) nr += 1; else nq += 1;
        this.upDownAxisState = 1 - this.upDownAxisState;
      } else if (dir === 'down') {
        if (this.upDownAxisState === 0) nq -= 1; else nr -= 1;
        this.upDownAxisState = 1 - this.upDownAxisState;
      }

      if (global.HexMath && global.HexMath.hexDistance(nq, nr) <= this.boardRadius + 3) {
        this.placementCursor.q = nq; this.placementCursor.r = nr;
        if (global.AudioSynth) global.AudioSynth.playClick();
        this.syncUI();
        return true;
      }
      return false;
    }

    rotatePiece(dir) {
      if (this.inSpellOverflow || this.inForesightMode || this.gameOver) return false;
      if (this.inTeleportMode && this.teleportHeldSigil) {
        this.teleportRotation = (this.teleportRotation + (dir === 'ccw' || dir === -1 ? 2 : 1)) % 3;
        if (global.AudioSynth) global.AudioSynth.playRotate();
        this.syncUI();
        return true;
      }
      if (this.inSigilStage) {
        let candId = this.selectedSigilId;
        if (!candId && this.sigilCursorVertex) {
          const locked = global.SigilResolver?.getLockedSigilAtCursor?.();
          if (locked) candId = locked.id;
          else if (global.HexMath) {
            const tiles = global.HexMath.getVertexTiles(this.sigilCursorVertex).sort();
            const cand = this.allCandidates.find(c => c.id === 'sigil_' + tiles.join('|'));
            if (cand) candId = cand.id;
          }
        }
        if (candId && this.lockedSigilIds.has(candId)) {
          const cand = this.allCandidates.find(c => c.id === candId);
          if (cand?.isWild) {
            const changed = this.permuteWildColors(candId, dir === 'ccw' || dir === -1 ? -1 : 1);
            if (changed && global.BoardRenderer) global.BoardRenderer.render();
            return changed;
          }
        }
        return false;
      }
      if (!this.isMaterialSelected || this.placedThisTurn) return false;
      if (this.activeMaterialMod === 'weave' && global.SpellWeave?.inWeaveMode) return global.SpellWeave.cycleComponent(dir);
      this.selectedRotation = (this.selectedRotation + (dir === 'ccw' || dir === -1 ? 5 : 1)) % 6;
      if (global.AudioSynth) global.AudioSynth.playRotate();
      this.syncUI(); return true;
    }

    placeActiveMaterial() {
      if (this.inSpellOverflow || this.inForesightMode) return false;
      if (this.inTeleportMode) return this.triggerTeleportAction();
      if (this.inChargeMode) return this.mimicSelectedSigil();
      if (this.inShiftMode) return global.SpellShift?.triggerAction() ?? false;
      if (this.inArchMode) return global.SpellArch?.triggerAction() ?? false;
      if (this.inRitualMode) return global.SpellRitual?.triggerAction() ?? false;
      if (this.inManifestMode) return global.SpellManifest?.triggerAction() ?? false;

      if (this.inSigilStage) {
        let candId = this.selectedSigilId;
        if (!candId && this.sigilCursorVertex) {
          const dorm = global.SigilResolver?.getDormantSigilAtCursor?.();
          if (dorm) candId = dorm.id;
          else {
            const locked = global.SigilResolver?.getLockedSigilAtCursor?.();
            if (locked) candId = locked.id;
            else if (global.HexMath) {
              const tiles = global.HexMath.getVertexTiles(this.sigilCursorVertex).sort();
              const cand = this.allCandidates.find(c => c.id === 'sigil_' + tiles.join('|'));
              if (cand) candId = cand.id;
            }
          }
        }
        if (candId && this.dormantSigilIds.has(candId)) return this.placeDormantSigil(candId);
        if (candId && this.lockedSigilIds.has(candId)) {
          const cand = this.allCandidates.find(c => c.id === candId);
          if (cand?.isWild) {
            const cycled = this.cycleWildSpell(candId);
            if (cycled && global.BoardRenderer) global.BoardRenderer.render();
            return cycled;
          }
        }
        global.AudioSynth?.playCancel?.();
        this.showToast('⚠️ Aim cursor over a Dormant or Wild Sigil first!');
        return false;
      }

      return global.PiecePlacement?.placeMaterial(this) ?? false;
    }

    confirmPlacementAndExit() {
      if (!this.placedThisTurn) return false;
      this.inSigilStage = false;
      this.syncBoardSigilTiles();
      global.AudioSynth?.playClick?.();
      this.showToast('✔ Placement Confirmed');
      this.syncUI();
      return true;
    }

    endTurn() {
      return global.TurnManager?.endTurn?.() ?? false;
    }

    setMatchConfig(config) {
      if (global.MatchOrchestrator?.initMatch) {
        global.MatchOrchestrator.initMatch(this, config);
        return;
      }
      this.matchConfig = Object.freeze({ ...config });
      if (config.boardRadius) this.setBoardRadius(config.boardRadius);
      this.resetGame();
    }

    getActivePlayer() {
      if (this.players && this.players.length > 0) {
        return this.players[this.activePlayerIndex % this.players.length];
      }
      return { id: 1, name: 'Player 1', color: '#00f0ff', accent: '#38bdf8', hp: this.hp, score: this.score };
    }

    clearToPreMatch() {
      global.BoardRenderer?.cancelMatchStartAnim?.();
      this.matchConfig = null;
      this.matchStarted = false;
      this.isMatchStarting = false;
      this.isMatchEnding = false;
      this.players = [];
      this.activePlayerIndex = 0;
      this.currentPlayerId = 1;
      this.hp = 12;
      this.maxHp = 12;
      this.pendingHeal = 0;
      this.score = 0;
      this.round = 1;
      this.level = 1;
      this.gameOver = false;
      this.activeDamageTiles = [];
      this.archZones = [];
      this.fortifiedTiles?.clear?.();
      this.placedThisTurn = false;
      this.isMaterialSelected = false;
      this.materialsTray = [];
      this.spellbook = [];
      this.componentsBag = Array(12).fill(null);
      this.overflowSpells = [];
      this.inSigilStage = false;
      this.activeMaterialMod = null;
      this.inForesightMode = false;
      this.inTeleportMode = false;
      this.inChargeMode = false;
      this.inShiftMode = false;
      this.inArchMode = false;
      this.inRitualMode = false;
      this.inManifestMode = false;
      this.inSpellOverflow = false;
      this.board.clear();
      global.ComponentDisease?.reset?.();
      global.UndoManager?.clearTurnHistory?.();
      this.evaluateSigils();
      global.UISidebarDeck?.closeMaterialsColumn?.(true);
      this.syncUI();
      global.UICardsDeck?.syncMaterialsQueueColumn?.();
      global.UICardsDeck?.syncSpellbookColumn?.();
      global.BoardRenderer?.render?.();
    }

    resetGame() {
      if (this.matchConfig && global.MatchOrchestrator?.initMatch) {
        global.MatchOrchestrator.initMatch(this, this.matchConfig);
        return;
      }
      this.hp = 12;
      this.score = 0;
      this.round = 1;
      this.level = 1;
      this.gameOver = false;
      this.activeDamageTiles = [];
      this.placedThisTurn = false;
      this.initBoard();
      this.initSpellbook(true);
      this.refillTray();
      this.syncUI();
      if (global.BoardRenderer?.render) {
        global.BoardRenderer.render();
      }
    }
  }

  const gameStateInstance = new GameStateManager();

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Game_State', gameStateInstance);
  global.GameState = gameStateInstance;

})(window);
