/**
 * @fileoverview cells/hex_ui/UI_Deck_Sync_1.1.js - Slot 4 & Slot 5 Action & Confirmation Dispatch
 * @description Manages bi-directional synchronization of Slot 4 (Place, Pick-up, Confirm across
 * all spell types and weave mode) and Slot 5 (End Turn, Resonate, Spell Confirm, Turn Confirm Modal)
 * on the Right Sidebar Column 0 Material Tray Deck (Part 2 of multi-part UIDeckSync cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const UIDeckSync = global.UIDeckSync || {};

  /**
   * Synchronizes Slot 4 (PLACE / PICK-UP / CONFIRM) across active spell & material modes.
   * @param {Object} ctx Evaluation context bundle from UI_Deck_Sync_1.0.js
   * @returns {Object} Slot 4 evaluation result state
   */
  UIDeckSync.syncSlot4 = function(ctx) {
    const { g, isPlaced, rightButtonNodes, cursorsEngaged } = ctx;
    const btnPlace = rightButtonNodes[4];
    const text4 = btnPlace?.getTrait('text');

    let canPlace = false;
    let placeTitle = 'Place';

    const inShift = !!(g.inShiftMode || global.SpellShift?.inShiftMode);
    const inTeleport = !!(g.inTeleportMode || global.SpellTeleport?.inTeleportMode);
    const inArch = !!(g.inArchMode || global.SpellArch?.inArchMode);
    const inRitual = !!(g.inRitualMode || global.SpellRitual?.inRitualMode);
    const inManifest = !!(g.inManifestMode || global.SpellManifest?.inManifestMode);
    const inCharge = !!(g.inChargeMode || global.SpellCharge?.inChargeMode) && !global.SpellCharge?.isMimicking;
    const inSigil = !!g.inSigilStage;
    const isWeavingMat = !isPlaced && (g.activeMaterialMod === 'weave' || global.SpellWeave?.inWeaveMode);
    let isWeaveReadyToConfirm = false;
    const isTurnPopupOpen = !!(global.TurnConfirmPopup?.isOpen?.());
    let isOrangeConfirm = false;

    if (isTurnPopupOpen) {
      placeTitle = 'Confirm';
      canPlace = true;
      isOrangeConfirm = true;
    } else if (inTeleport) {
      const held = !!(g.teleportHeldSigil || global.SpellTeleport?.teleportHeldSigil);
      if (!held) {
        const target = g.getTargetableSigilAtCursor ? g.getTargetableSigilAtCursor() : g.getLockedSigilAtCursor?.();
        canPlace = !!target;
        placeTitle = 'Pick-up';
      } else {
        canPlace = !!(global.SpellTeleport?.canPlaceSigilAt?.(g.sigilCursorVertex, global.SpellTeleport?.teleportRotation || 0));
        placeTitle = 'Place';
      }
      isOrangeConfirm = canPlace;
    } else if (inCharge) {
      const target = g.getTargetableSigilAtCursor ? g.getTargetableSigilAtCursor() : g.getLockedSigilAtCursor?.();
      canPlace = !!(target && target.formula !== 'RRY' && target.spell !== 'Charge');
      placeTitle = 'Confirm';
      isOrangeConfirm = canPlace;
    } else if (inShift) {
      const shiftStage = global.SpellShift?.stage || 'zone';
      if (shiftStage === 'zone') {
        placeTitle = 'Place';
        const zCur = global.SpellShift?.zoneCursor;
        canPlace = !!(zCur && global.SpellShift?.isZoneValidAt?.(zCur.q, zCur.r));
        isOrangeConfirm = canPlace;
      } else {
        const held = global.SpellShift?.heldComponent;
        const cCur = global.SpellShift?.componentCursor;
        const cKey = cCur ? `${cCur.q},${cCur.r}` : '';
        const isAllowed = !!(global.SpellShift?.allowedTiles?.has(cKey));

        if (!held) {
          placeTitle = 'Pick-up';
          const tile = isAllowed ? g.board?.get(cKey) : null;
          canPlace = !!(tile && tile.color && tile.color !== 'disease' && !tile.plagueId);
          isOrangeConfirm = canPlace;
        } else {
          placeTitle = 'Place';
          const targetTile = isAllowed ? g.board?.get(cKey) : null;
          const cannotPhaseOnPhase = !!(held.phased && targetTile?.phased);
          canPlace = isAllowed && !cannotPhaseOnPhase;
          isOrangeConfirm = canPlace;
        }
      }
    } else if (inArch) {
      placeTitle = 'Place';
      const archPlaced = !!global.SpellArch?.isPlaced;
      const zCur = global.SpellArch?.zoneCursor;
      const validAt = zCur ? (global.SpellArch?.isZoneValidAt ? global.SpellArch.isZoneValidAt(zCur.q, zCur.r) : global.SpellArch?.isPlacementValid?.()) : false;
      canPlace = !archPlaced && !!validAt;
      isOrangeConfirm = canPlace;
    } else if (inRitual) {
      const inZone = (global.SpellRitual?.stage || 'zone') === 'zone';
      placeTitle = inZone ? 'Place' : 'Pick-up';
      const zCur = global.SpellRitual?.zoneCursor;
      canPlace = inZone ? !!(zCur && global.SpellRitual?.isZoneValidAt?.(zCur.q, zCur.r)) : !!global.SpellRitual?.canPickUpAtCursor?.(g);
      isOrangeConfirm = canPlace;
    } else if (inManifest) {
      const inZone = (global.SpellManifest?.stage || 'zone') === 'zone';
      placeTitle = 'Place';
      const zCur = global.SpellManifest?.zoneCursor;
      canPlace = inZone ? !!(zCur && global.SpellManifest?.isZoneValidAt?.(zCur.q, zCur.r)) : !!global.SpellManifest?.canPlaceAtCursor?.(g);
      isOrangeConfirm = canPlace;
    } else if (inSigil) {
      const isSigilValid = !!(g.getDormantSigilAtCursor?.() || (g.getLockedSigilAtCursor?.()?.isWild));
      placeTitle = isSigilValid ? 'Confirm' : 'Place';
      canPlace = isSigilValid;
      isOrangeConfirm = isSigilValid;
    } else if (isWeavingMat) {
      isWeaveReadyToConfirm = ((g.weaveStep || 0) >= 4 || (global.SpellWeave?.placedTiles?.length || 0) >= 4);
      if (isWeaveReadyToConfirm) {
        placeTitle = 'Confirm';
        canPlace = true;
        isOrangeConfirm = true;
      } else {
        placeTitle = 'Place';
        canPlace = !!(g.canPlaceMaterialAt && g.canPlaceMaterialAt(g.placementCursor.q, g.placementCursor.r));
      }
    } else if (!isPlaced && g.isMaterialSelected && !cursorsEngaged) {
      placeTitle = 'Place';
      canPlace = !!(g.canPlaceMaterialAt && g.canPlaceMaterialAt(g.placementCursor.q, g.placementCursor.r));
    }

    if (text4) {
      text4.title = placeTitle;
      text4.hotkey = (placeTitle === 'Place' || placeTitle === 'Pick-up' || placeTitle === 'Pick-Up' || placeTitle === 'Confirm') ? 'SPC' : '';
      text4.isRightSidebar = true;
      text4.subtitle = '';
      text4.badge = '';
      text4.isSidebarButton = true;
      text4.titleColor = isOrangeConfirm ? '#ff9214' : (canPlace ? '#38bdf8' : '#64748b');
    }
    if (btnPlace) {
      if (isOrangeConfirm) {
        btnPlace.setGhost(false);
        btnPlace.setHighlight(true);
      } else if (isWeavingMat) {
        if (canPlace) {
          btnPlace.setGhost(false);
          btnPlace.setHighlight(true, 'yellow');
        } else {
          btnPlace.setGhost(true);
          btnPlace.setHighlight(false);
        }
      } else {
        btnPlace.setGhost(!canPlace);
        btnPlace.setHighlight(canPlace);
      }
    }

    return {
      isTurnPopupOpen,
      isOrangeConfirm,
      canPlace,
      inShift,
      inArch,
      inRitual,
      inManifest
    };
  };

  /**
   * Synchronizes Slot 5 (END TURN / RESONATE / CONFIRM) across active modes.
   * @param {Object} ctx Evaluation context bundle from UI_Deck_Sync_1.0.js
   * @param {Object} slot4Result State returned from syncSlot4
   * @returns {Object} Slot 5 evaluation result state
   */
  UIDeckSync.syncSlot5 = function(ctx, slot4Result) {
    const { deck, g, isPlaced, rightButtonNodes, spellCursorsActive } = ctx;
    const btnEndTurn = rightButtonNodes[5];
    const text5 = btnEndTurn?.getTrait('text');

    const resSigils = g.resonantSigils || global.SigilResolver?.resonantSigils;
    const resSigilsCount = resSigils ? (resSigils.size !== undefined ? resSigils.size : (resSigils.length || 0)) : 0;
    const resPairs = global.SigilResolver?.resonantPairs;
    const resPairsCount = resPairs ? (resPairs.length || 0) : 0;
    const adjacentPairsCount = global.SigilEngine?.getAdjacentPairs?.()?.length || 0;

    const hasResonance = (resSigilsCount > 0) || (resPairsCount > 0) || (adjacentPairsCount > 0);

    const isRenamePopup = !!(global.GameSettingsRenamePopup?.isOpen?.());
    const isPresetEdit = !!(global.GameSettingsCanvas?.isPresetColumnOpen?.());
    const isSettingsOpen = !!(global.GameSettingsCanvas?.isOpen?.());
    const isSpellbookOpen = deck.state?.rightSidebarActiveCol === 1;
    const isEndMatchStats = !!(global.StatCanvas?.isOpen?.() && g.gameOver);
    const isConfirmMode = isRenamePopup || isPresetEdit || isSettingsOpen || isSpellbookOpen || isEndMatchStats;

    let isSpellConfirm = false;
    let canConfirmSpell = false;

    const inArch = slot4Result?.inArch ?? !!(g.inArchMode || global.SpellArch?.inArchMode);
    const inShift = slot4Result?.inShift ?? !!(g.inShiftMode || global.SpellShift?.inShiftMode);
    const inRitual = slot4Result?.inRitual ?? !!(g.inRitualMode || global.SpellRitual?.inRitualMode);
    const inManifest = slot4Result?.inManifest ?? !!(g.inManifestMode || global.SpellManifest?.inManifestMode);

    if (inArch) {
      isSpellConfirm = true;
      canConfirmSpell = !!global.SpellArch?.isPlaced;
    } else if (inShift) {
      const shiftStage = global.SpellShift?.stage || 'zone';
      if (shiftStage === 'component') {
        isSpellConfirm = true;
        canConfirmSpell = (global.SpellShift?.heldComponent === null);
      }
    } else if (inRitual) {
      const ritualStage = global.SpellRitual?.stage || 'zone';
      if (ritualStage === 'component') {
        isSpellConfirm = true;
        canConfirmSpell = (global.SpellRitual?.stagedExtractions?.size || 0) >= 1;
      }
    } else if (inManifest) {
      const manifestStage = global.SpellManifest?.stage || 'zone';
      if (manifestStage === 'component') {
        isSpellConfirm = true;
        canConfirmSpell = (global.SpellManifest?.stagedPlacements?.size || 0) >= 1;
      }
    }

    const isWeaving = !isPlaced && (g.activeMaterialMod === 'weave' || global.SpellWeave?.inWeaveMode);
    const canEndTurn = !spellCursorsActive && !isWeaving;
    const isTurnPopupOpen = !!slot4Result?.isTurnPopupOpen;

    if (text5) {
      text5.isSidebarButton = true;
      text5.isRightSidebar = true;
      text5.subtitle = '';
      text5.badge = '';

      if (isTurnPopupOpen) {
        text5.title = 'Confirm';
        text5.titleColor = '#64748b';
        text5.hotkey = '';
      } else if (isConfirmMode) {
        text5.title = 'Confirm';
        text5.titleColor = '#38bdf8';
        text5.hotkey = 'ENT';
      } else if (isSpellConfirm) {
        text5.title = 'Confirm';
        text5.titleColor = canConfirmSpell ? '#38bdf8' : '#64748b';
        text5.hotkey = 'ENT';
      } else if (canEndTurn && hasResonance) {
        text5.title = 'Resonate';
        text5.titleColor = '#38bdf8';
        text5.hotkey = '';
      } else if (canEndTurn) {
        text5.title = ['End', 'Turn'];
        text5.titleColor = '#4ade80';
        text5.hotkey = 'ENT';
      } else {
        text5.title = hasResonance ? 'Resonate' : ['End', 'Turn'];
        text5.titleColor = '#64748b';
        text5.hotkey = hasResonance ? '' : 'ENT';
      }
    }

    if (btnEndTurn) {
      if (isTurnPopupOpen) {
        btnEndTurn.setGhost(true);
        btnEndTurn.setHighlight(false);
      } else if (isConfirmMode) {
        btnEndTurn.setGhost(false);
        btnEndTurn.setHighlight(true);
      } else if (isSpellConfirm) {
        btnEndTurn.setGhost(!canConfirmSpell);
        btnEndTurn.setHighlight(canConfirmSpell);
      } else if (canEndTurn) {
        btnEndTurn.setGhost(false);
        btnEndTurn.setHighlight(isPlaced);
      } else {
        btnEndTurn.setGhost(true);
        btnEndTurn.setHighlight(false);
      }
    }

    return {
      isConfirmMode,
      isSpellConfirm,
      canConfirmSpell
    };
  };

  global.UIDeckSync = UIDeckSync;

})(typeof window !== 'undefined' ? window : this);

