/**
 * @fileoverview cells/hex_ui/UI_Deck_Sync_1.0.js - GameState to Hex UI Synchronization Bridge (Part 1)
 * @description Manages bi-directional synchronization between GameState and the Canvas 2D
 * scene graph: Native Stat Pod telemetry, left sidebar controls (Return/Undo, Menu),
 * Right Sidebar Column 0 slots 0-3 (Spell Book, Sigil Nook, CCW/CW rotation),
 * canvas-open ghosting, and component tray sync.
 * (Part 1 of multi-part UIDeckSync cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const PRE_PLACEMENT_FORMULAS = new Set(['RRP', 'BBY', 'YYB', 'PPR']);

  const UIDeckSync = global.UIDeckSync || {};
  UIDeckSync.PRE_PLACEMENT_FORMULAS = PRE_PLACEMENT_FORMULAS;

  /**
   * Synchronizes NativeStatPod with current GameState vitality and score metrics.
   */
  UIDeckSync.syncNativeStatPodWithGameState = function() {
    if (!global.NativeStatPod || !global.GameState) return;
    const g = global.GameState;
    const net = global.NetworkP2PManager;
    const curIdx = g.activePlayerIndex || 0;
    const pm = global.POVManager;
    if (g.matchStarted && net && net.isSeatLocal?.(curIdx) && !pm?.isPeekingTurnStart?.()) {
      net.lastLocalActivePlayerIndex = curIdx;
    }
    const povIdx = pm
      ? pm.getPOVIndex()
      : ((net?.isConnected?.() && net.getDefaultPausedPlayerIndex) ? net.getDefaultPausedPlayerIndex() : curIdx);
    const povPlayerId = g.players?.[povIdx]?.id || (povIdx + 1);

    // Preserve the Log-Show snapshot's Turn/Score/Vitality while Player stays locked to this device's POV player
    if (global.TurnLogPlayer?.active || global.TurnLogPlayer?._showingSnapshot) {
      global.NativeStatPod.setStat('player', povPlayerId.toString());
      return;
    }

    const povData = pm?.getPOVPlayer?.();
    const isMismatched = (povIdx !== curIdx) || !!pm?.isPeekingTurnStart?.();
    const dispHp = isMismatched && povData ? povData.hp : g.hp;
    const dispPendingDmg = isMismatched ? 0 : ((typeof g.getPendingDamage === 'function')
      ? g.getPendingDamage()
      : (g.pendingDamage !== undefined ? g.pendingDamage : 0));
    const dispPendingHl = isMismatched && povData ? (povData.pendingHeal || 0) : (g.pendingHeal || 0);
    const dispBag = isMismatched && povData ? povData.componentsBag : g.componentsBag;
    const dispScore = isMismatched && povData ? (povData.score || 0) : (g.score || 0);
    const dispPts = isMismatched ? 0 : (g.getEstimatedPoints ? g.getEstimatedPoints() : (g.roundBonusPoints || 0));

    global.NativeStatPod.setHp(dispHp, dispPendingDmg, dispPendingHl);
    if (dispBag) global.NativeStatPod.setComponents(dispBag);

    const rawAve = (g.round > 0) ? (dispScore / g.round) : 0;
    const ave = rawAve >= 100 ? Math.round(rawAve) : Number(rawAve.toFixed(rawAve >= 10 ? 1 : 2));

    const turnPid = g.currentPlayerId || 1;
    global.NativeStatPod.setStats({
      player: povPlayerId.toString(),
      turn: `P${turnPid}`,
      round: (g.round || 1).toString(),
      points: dispPts.toString(),
      score: dispScore.toString(),
      ave: ave.toString()
    });
  };

  /**
   * Synchronizes Right Sidebar Column 0 buttons (Material Tray Deck) with active gameplay state.
   */
  UIDeckSync.syncMaterialsTrayWithGameState = function() {
    const deck = global.UISidebarDeck;
    if (!deck?.colControls || !deck?.rightButtonNodes || deck.rightButtonNodes.length < 6) return;
    if (global.RoomStatCanvas?.isOpen?.()) {
      global.RoomStatCanvas.syncSidebars(deck);
      return;
    }
    const g = global.GameState;
    if (!g) return;

    const isPlaced = !!g.placedThisTurn;
    const rightButtonNodes = deck.rightButtonNodes;

    const isCanvasOpen = !!(
      global.StatCanvas?.isOpen?.() || global.GameSettingsCanvas?.isOpen?.() ||
      global.CanvasHub?.isOpen?.() || global.SigilNookCanvas?.isOpen?.() ||
      global.SigilEmblemStudio?.isOpen?.() || (global.HexUIEngine?.studioOverlay && global.HexUIEngine.studioOverlay.visible)
    );
    const spellCursorsActive = !!(
      g.inTeleportMode || g.inChargeMode || g.inShiftMode || g.inArchMode || g.inRitualMode ||
      g.inManifestMode || g.inSpellOverflow || g.inForesightMode ||
      (global.SpellShift?.inShiftMode) || (global.SpellTeleport?.inTeleportMode) || isCanvasOpen
    );
    const cursorsEngaged = !!(g.inSigilStage || spellCursorsActive);
    const isPreRound1 = !g.matchStarted || g.isMatchStarting || g.isMatchEnding;
    const net = global.NetworkP2PManager;
    const isSpectating = global.POVManager
      ? global.POVManager.isSpectatingOrMismatched()
      : !!(net?.isConnected?.() && !net.isLocalPlayersTurn());
    if (!isPlaced && !cursorsEngaged && !g.isMaterialSelected && !isPreRound1 && !isSpectating) {
      g.isMaterialSelected = true;
      g.selectedTrayIndex = 0;
    }

    // 0. Left Button 0: RETURN & Left Button 5: MENU
    if (deck.leftButtonNodes?.[0]) {
      const btnReturn = deck.leftButtonNodes[0];
      const uText = btnReturn.getTrait('text');
      if (uText) {
        uText.title = 'Return';
        uText.hotkey = (uText.title === 'Return') ? 'ESC' : '';
        uText.isRightSidebar = false;
        uText.subtitle = '';
        uText.badge = '';
        uText.isSidebarButton = true;
        const uState = global.UndoManager?.getUndoNavState ? global.UndoManager.getUndoNavState() : null;
        const canUndo = isCanvasOpen || deck.state?.rightSidebarActiveCol > 0 || (!isSpectating && uState && uState.active);
        uText.titleColor = canUndo ? '#38bdf8' : '#64748b';
        btnReturn.setGhost(!canUndo);
        btnReturn.setHighlight(false);
      }
    }
    if (isCanvasOpen) {
      for (let i = 1; i < (deck.leftButtonNodes?.length || 0); i++) {
        const btn = deck.leftButtonNodes[i];
        if (btn) { btn.setGhost(true); btn.setHighlight(false); const t = btn.getTrait('text'); if (t) t.titleColor = '#64748b'; }
      }
    } else {
      for (let i = 1; i < Math.min(5, deck.leftButtonNodes?.length || 0); i++) {
        const btn = deck.leftButtonNodes[i];
        if (btn) {
          btn.setGhost(isSpectating);
          const t = btn.getTrait('text');
          if (t) t.titleColor = isSpectating ? '#64748b' : '#38bdf8';
        }
      }
      if (deck.leftButtonNodes?.[5]) {
        const btnMenu = deck.leftButtonNodes[5], mText = btnMenu.getTrait('text');
        if (mText) { mText.title = 'Menu'; mText.hotkey = 'M'; mText.titleColor = '#c084fc'; btnMenu.setGhost(false); btnMenu.setHighlight(false); }
      }
    }

    // 1. Slot 0: SPELL BOOK button (stacked)
    const btnSpells = rightButtonNodes[0];
    const isSpellActiveOrUnfinalized = !!(
      g.inArchMode || global.SpellArch?.inArchMode ||
      g.inShiftMode || global.SpellShift?.inShiftMode ||
      g.inRitualMode || global.SpellRitual?.inRitualMode ||
      g.inManifestMode || global.SpellManifest?.inManifestMode ||
      g.inTeleportMode || global.SpellTeleport?.inTeleportMode ||
      g.inChargeMode || global.SpellCharge?.inChargeMode || global.SpellCharge?.isMimicking ||
      g.inForesightMode || global.SpellForesight?.inForesightMode ||
      g.inSpellOverflow ||
      (g.activeMaterialMod === 'weave' && (g.weaveStep || 0) > 0) || global.SpellWeave?.inWeaveMode
    );
    const povIdx = global.POVManager
      ? global.POVManager.getPOVIndex()
      : ((net?.isConnected?.() && net.getDefaultPausedPlayerIndex) ? net.getDefaultPausedPlayerIndex() : (g.activePlayerIndex || 0));
    const activeBook = (isSpectating && g.players?.[povIdx]?.spellbook)
      ? g.players[povIdx].spellbook
      : (g.spellbook || []);
    const readySpells = activeBook.filter(s => {
      if (typeof s.charges === 'number' && s.charges <= 0) return false;
      if (s.usableRound > g.round) return false;
      if (isPlaced && PRE_PLACEMENT_FORMULAS.has(s.formula)) return false;
      return true;
    }).length;
    const canOpenSpellbook = isSpectating
      ? (activeBook.length > 0 && !isCanvasOpen && !isPreRound1)
      : (!isSpellActiveOrUnfinalized && !global.SpellManager?.isTurnTransitionBusy?.() && (readySpells > 0 || activeBook.length > 0));
    const text0 = btnSpells?.getTrait('text');
    if (text0) {
      text0.title = ['Spell', 'Book'];
      text0.hotkey = (Array.isArray(text0.title) && text0.title[0] === 'Spell') ? 'B' : '';
      text0.isRightSidebar = true;
      text0.subtitle = '';
      text0.badge = '';
      text0.isSidebarButton = true;
      text0.titleColor = canOpenSpellbook ? '#c084fc' : '#64748b';
    }
    if (btnSpells) {
      btnSpells.setGhost(!canOpenSpellbook);
      btnSpells.setHighlight(false);
    }

    // 2. Slot 1: Default "Sigil Nook" (stacked)
    const btnNook = rightButtonNodes[1];
    const text1 = btnNook?.getTrait('text');
    if (text1) {
      text1.isSidebarButton = true;
      text1.isRightSidebar = true;
      text1.subtitle = '';
      text1.badge = '';
      if (global.UIViewButton?.getDynamicState?.()) {
        text1.title = '';
        text1.hotkey = '';
      } else {
        text1.title = ['Sigil', 'Nook'];
        text1.titleColor = '#38bdf8';
        text1.hotkey = 'N';
      }
    }
    if (btnNook) {
      btnNook.setGhost(false);
      btnNook.setHighlight(false);
    }

    // 3. Slot 2 & Slot 3: Rotation & Wild Color Swaps
    let activeCand = null;
    if (g.inSigilStage) {
      if (g.selectedSigilId) activeCand = (g.allCandidates || []).find(c => c.id === g.selectedSigilId);
      else if (g.sigilCursorVertex && global.HexMath) {
        const tiles = global.HexMath.getVertexTiles(g.sigilCursorVertex).sort();
        activeCand = (g.allCandidates || []).find(c => c.id === 'sigil_' + tiles.join('|'));
      }
    }
    const isLockedWild = activeCand && activeCand.isWild && g.lockedSigilIds?.has(activeCand.id);
    const canPermuteWild = isLockedWild && activeCand.distinctAssignments?.length > 1;
    const canRotateTeleport = g.inTeleportMode && !!g.teleportHeldSigil;
    const isWeaving = (g.activeMaterialMod === 'weave' || global.SpellWeave?.inWeaveMode) && !isPlaced;
    const allPosWeave = isWeaving && ((g.weaveStep || 0) >= 4 || (global.SpellWeave?.placedTiles?.length || 0) >= 4);
    const canRotate = (!isPlaced && g.isMaterialSelected && !g.inSigilStage && !allPosWeave) || canPermuteWild || canRotateTeleport;

    const text2 = rightButtonNodes[2]?.getTrait('text');
    if (text2) {
      text2.title = '↺ CCW';
      text2.badge = 'KEY: Q';
      if (canRotateTeleport) {
        text2.subtitle = 'Rotate Sigil 60°';
        text2.titleColor = '#06b6d4';
      } else if (canPermuteWild) {
        text2.subtitle = 'Swap Wild Colors';
        text2.titleColor = '#c084fc';
      } else if (isWeaving) {
        text2.subtitle = '';
        text2.titleColor = canRotate ? '#38bdf8' : '#64748b';
      } else {
        text2.subtitle = 'Rotate Counter';
        text2.titleColor = canRotate ? '#38bdf8' : '#64748b';
      }
    }
    if (rightButtonNodes[2]) {
      if (isWeaving && canRotate) {
        rightButtonNodes[2].setGhost(false);
        rightButtonNodes[2].setHighlight(true, 'yellow');
      } else {
        rightButtonNodes[2].setGhost(!canRotate);
        rightButtonNodes[2].setHighlight(false);
      }
    }

    const text3 = rightButtonNodes[3]?.getTrait('text');
    if (text3) {
      text3.title = 'CW ↻';
      text3.badge = 'KEY: E';
      if (canRotateTeleport) {
        text3.subtitle = 'Rotate Sigil 60°';
        text3.titleColor = '#06b6d4';
      } else if (canPermuteWild) {
        text3.subtitle = 'Swap Wild Colors';
        text3.titleColor = '#c084fc';
      } else if (isWeaving) {
        text3.subtitle = '';
        text3.titleColor = canRotate ? '#38bdf8' : '#64748b';
      } else {
        text3.subtitle = 'Rotate Clockwise';
        text3.titleColor = canRotate ? '#38bdf8' : '#64748b';
      }
    }
    if (rightButtonNodes[3]) {
      if (isWeaving && canRotate) {
        rightButtonNodes[3].setGhost(false);
        rightButtonNodes[3].setHighlight(true, 'yellow');
      } else {
        rightButtonNodes[3].setGhost(!canRotate);
        rightButtonNodes[3].setHighlight(false);
      }
    }

    // Context bundle for Slot 4 & Slot 5 synchronization
    const ctx = {
      deck, g, isPlaced, rightButtonNodes, isCanvasOpen, spellCursorsActive, cursorsEngaged
    };

    let slot4Result = null;
    if (typeof this.syncSlot4 === 'function') {
      slot4Result = this.syncSlot4(ctx);
    }

    let slot5Result = null;
    if (typeof this.syncSlot5 === 'function') {
      slot5Result = this.syncSlot5(ctx, slot4Result);
    }

    if (deck.colComponents?.visible) {
      global.UICardsDeck?.syncComponentsColumn?.();
    }

    if (isCanvasOpen) {
      const isConfirmMode = !!slot5Result?.isConfirmMode;
      const isTurnPopupOpen = !!slot4Result?.isTurnPopupOpen;
      const btnEndTurn = rightButtonNodes[5];
      const btnPlace = rightButtonNodes[4];
      for (let i = 0; i < rightButtonNodes.length; i++) {
        const btn = rightButtonNodes[i];
        if (isConfirmMode && btn === btnEndTurn) continue;
        if (isTurnPopupOpen && btn === btnPlace) continue;
        if (btn) {
          btn.setGhost(true);
          btn.setHighlight(false);
          const t = btn.getTrait('text');
          if (t) t.titleColor = '#64748b';
        }
      }
    } else if (isPreRound1) {
      for (let i = 1; i < Math.min(5, deck.leftButtonNodes?.length || 0); i++) {
        const btn = deck.leftButtonNodes[i];
        if (btn) { btn.setGhost(true); btn.setHighlight(false); const t = btn.getTrait('text'); if (t) t.titleColor = '#64748b'; }
      }
      if (deck.leftButtonNodes?.[5] && (g.isMatchStarting || g.isMatchEnding)) {
        const btnMenu = deck.leftButtonNodes[5];
        btnMenu.setGhost(true); btnMenu.setHighlight(false);
        const t = btnMenu.getTrait('text'); if (t) t.titleColor = '#64748b';
      }
      for (let i = 0; i < rightButtonNodes.length; i++) {
        const btn = rightButtonNodes[i];
        if (btn) {
          btn.setGhost(true); btn.setHighlight(false);
          const t = btn.getTrait('text'); if (t) t.titleColor = '#64748b';
        }
      }
    } else if (isSpectating) {
      const hasLogNext = !!(global.TurnLogManager?.hasPendingEntries?.() || global.TurnLogPlayer?.active);
      [2, 3, 4].forEach(i => {
        const btn = rightButtonNodes[i];
        if (btn) {
          btn.setGhost(true); btn.setHighlight(false);
          const t = btn.getTrait('text'); if (t) t.titleColor = '#64748b';
        }
      });
      const btnEnd = rightButtonNodes[5];
      if (btnEnd && !hasLogNext) {
        btnEnd.setGhost(true); btnEnd.setHighlight(false);
        const t = btnEnd.getTrait('text'); if (t) t.titleColor = '#64748b';
      }
    }

    if (global.HexUIEngine?.forceGhostSidebars) {
      const t5 = rightButtonNodes[5]?.getTrait?.('text');
      if (t5) { t5.title = 'Confirm'; t5.hotkey = 'ENT'; t5.subtitle = ''; t5.badge = ''; }
      [...(deck.leftButtonNodes || []), ...rightButtonNodes].forEach(btn => {
        if (!btn) return;
        btn.setGhost(true); btn.setHighlight(false);
        const t = btn.getTrait?.('text'); if (t) t.titleColor = '#64748b';
      });
    }
  };

  /**
   * Initializes the global UISidebars bridge compatibility layer for modular mechanics cells.
   */
  UIDeckSync.initBridge = function() {
    if (global.UIBridgeLegacy?.initBridge) {
      global.UIBridgeLegacy.initBridge();
    }
  };

  global.UIDeckSync = UIDeckSync;

})(typeof window !== 'undefined' ? window : this);

