/**
 * @fileoverview cells/hex_ui/UI_Sidebar_Deck_1.1.js - Multi-Part Cell: Part 1.1 of UI_Sidebar_Deck
 * @description Sliding columns transitions, ticker updates, button counting, and dimension synchronization.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const Proto = (global.UISidebarDeckClass && global.UISidebarDeckClass.prototype) ||
                (global.UISidebarDeck && Object.getPrototypeOf(global.UISidebarDeck));

  if (!Proto) {
    console.error('[UI_Sidebar_Deck_1.1] UISidebarDeckClass prototype not found. Ensure UI_Sidebar_Deck_1.0.js is loaded first.');
    return;
  }

  Proto.syncSpellbookColumnWithGameState = function() {
    global.UICardsDeck?.syncSpellbookColumnWithGameState();
  };

  Proto.syncMaterialsQueueColumn = function() {
    global.UICardsDeck?.syncMaterialsQueueColumn();
  };

  Proto.syncComponentsColumn = function() {
    global.UICardsDeck?.syncComponentsColumn();
  };

  Proto.openComponentsColumn = function() {
    this.syncComponentsColumn();
    this.state.rightSidebarActiveCol = 3;
    const slideDist = Math.max(280, this.state.btnW2 + 60);
    this.state.rightSidebarTargetSlideX = -slideDist * 3;
    if (this.colComponents) {
      this.colComponents.visible = true;
      this.componentsList.scrollOffset = 0;
      this.componentsList.targetScrollOffset = 0;
      this.componentsList.layoutChildren();
    }
    const t0 = this.leftButtonNodes[0]?.getTrait('text');
    if (t0) {
      t0.title = 'Return';
      t0.hotkey = 'ESC';
      t0.subtitle = '';
      t0.badge = '';
      t0.isSidebarButton = true;
      t0.titleColor = '#c084fc';
    }
  };

  Proto.closeComponentsColumn = function(silent = false) {
    this.closeSpellbookColumn(silent);
  };

  Proto.openMaterialsColumn = function(isForesight = false) {
    this.materialsOpenedFromCol = (isForesight || this.state.rightSidebarActiveCol === 1) ? 1 : 0;
    this.syncMaterialsQueueColumn();
    this.state.rightSidebarActiveCol = 2;
    const slideDist = Math.max(280, this.state.btnW2 + 60);
    this.state.rightSidebarTargetSlideX = -slideDist * 2;
    if (this.colMaterials) {
      this.colMaterials.visible = true;
      this.materialsList.scrollOffset = 0;
      this.materialsList.targetScrollOffset = 0;
      this.materialsList.layoutChildren();
    }
    const t0 = this.leftButtonNodes[0]?.getTrait('text');
    if (t0) {
      t0.title = 'Return';
      t0.hotkey = 'ESC';
      t0.subtitle = '';
      t0.badge = '';
      t0.isSidebarButton = true;
      t0.titleColor = isForesight ? '#ff9214' : '#38bdf8';
    }
  };

  Proto.closeMaterialsColumn = function(silent = false) {
    this.materialsOpenedFromCol = 0;
    this.state.rightSidebarActiveCol = 0;
    this.state.rightSidebarTargetSlideX = 0;
    if (this.colControls) {
      this.colControls.visible = true;
      this.ctrlList.scrollOffset = 0;
      this.ctrlList.targetScrollOffset = 0;
      this.ctrlList.layoutChildren();
    }
    const t0 = this.leftButtonNodes[0]?.getTrait('text');
    if (t0) {
      t0.title = 'Return';
      t0.hotkey = 'ESC';
      t0.subtitle = '';
      t0.badge = '';
      t0.isSidebarButton = true;
      t0.titleColor = '#38bdf8';
    }
    if (!silent && this.audio) this.audio.playClick();
    global.UIDeckSync?.syncMaterialsTrayWithGameState();
    global.BoardRenderer?.render();
  };

  Proto.toggleMaterialsColumn = function(isForesight = false) {
    if (this.state.rightSidebarActiveCol === 2) this.closeMaterialsColumn();
    else this.openMaterialsColumn(isForesight);
  };

  Proto.openSpellbookColumn = function() {
    const g = global.GameState;
    if (global.SpellManager?.isTurnTransitionBusy?.()) {
      g?.showToast?.('⏳ Wait for Start/End Turn animations to finish!');
      return;
    }
    const isSpellActive = !!(
      g?.inArchMode || global.SpellArch?.inArchMode ||
      g?.inShiftMode || global.SpellShift?.inShiftMode ||
      g?.inRitualMode || global.SpellRitual?.inRitualMode ||
      g?.inManifestMode || global.SpellManifest?.inManifestMode ||
      g?.inTeleportMode || global.SpellTeleport?.inTeleportMode ||
      g?.inChargeMode || global.SpellCharge?.inChargeMode || global.SpellCharge?.isMimicking ||
      g?.inForesightMode || global.SpellForesight?.inForesightMode ||
      g?.inSpellOverflow ||
      (g?.activeMaterialMod === 'weave' && (g?.weaveStep || 0) > 0) || global.SpellWeave?.inWeaveMode
    );
    if (isSpellActive) {
      if (typeof g?.showToast === 'function') {
        g.showToast('⚠️ A spell is already active! Finish or cancel it first.');
      }
      return;
    }

    this.syncSpellbookColumnWithGameState();
    this.state.rightSidebarActiveCol = 1;
    const slideDist = Math.max(280, this.state.btnW2 + 60);
    this.state.rightSidebarTargetSlideX = -slideDist;
    if (this.colSpellbook) {
      this.colSpellbook.visible = true;
      this.spellList.scrollOffset = 0;
      this.spellList.targetScrollOffset = 0;
      this.spellList.layoutChildren();
    }
    const t0 = this.leftButtonNodes[0]?.getTrait('text');
    if (t0) {
      t0.title = 'Return';
      t0.hotkey = 'ESC';
      t0.subtitle = '';
      t0.badge = '';
      t0.isSidebarButton = true;
      t0.titleColor = '#c084fc';
    }
  };

  Proto.closeSpellbookColumn = function(silent = false) {
    this.state.rightSidebarActiveCol = 0;
    this.state.rightSidebarTargetSlideX = 0;
    if (this.colControls) {
      this.colControls.visible = true;
      this.ctrlList.scrollOffset = 0;
      this.ctrlList.targetScrollOffset = 0;
      this.ctrlList.layoutChildren();
    }
    const t0 = this.leftButtonNodes[0]?.getTrait('text');
    if (t0) {
      t0.title = 'Return';
      t0.hotkey = 'ESC';
      t0.subtitle = '';
      t0.badge = '';
      t0.isSidebarButton = true;
      t0.titleColor = '#38bdf8';
    }
    if (!silent && this.audio) this.audio.playClick();
    global.UIDeckSync?.syncMaterialsTrayWithGameState();
    global.BoardRenderer?.render();
  };

  Proto.toggleSpellbookColumn = function() {
    if (this.state.rightSidebarActiveCol === 1) {
      this.closeSpellbookColumn();
    } else {
      if (this.rightButtonNodes?.[0]?.ghost) return;
      this.openSpellbookColumn();
    }
  };

  Proto.updateRightSidebarDeck = function() {
    if (!this.colControls || !this.colSpellbook) return;
    const slideDist = Math.max(280, (this.state.btnW2 || 200) + 60);
    const dx = this.state.rightSidebarTargetSlideX - this.state.rightSidebarSlideX;
    this.state.rightSidebarSlideX += Math.abs(dx) > 0.3 ? dx * 0.18 : dx;

    this.colControls.position.x = this.state.rightSidebarSlideX;
    this.colSpellbook.position.x = this.state.rightSidebarSlideX + slideDist;
    if (this.colMaterials) this.colMaterials.position.x = this.state.rightSidebarSlideX + slideDist * 2;
    if (this.colComponents) this.colComponents.position.x = this.state.rightSidebarSlideX + slideDist * 3;

    const cull = slideDist * 1.8;
    [this.colControls, this.colSpellbook, this.colMaterials, this.colComponents].forEach((c, idx) => {
      if (c) c.visible = (idx === this.state.rightSidebarActiveCol) || (Math.abs(c.position.x) < cull);
    });
  };

  Proto.updateVisibleButtonCount = function(count) {
    this.state.sidebarBtnCount = count;
    this.engine.leftSidebar.children = [];
    if (this.colControls) this.colControls.children = [];

    for (let i = 0; i < count; i++) {
      this.engine.leftSidebar.addChild(this.leftButtonNodes[i]);
      if (this.colControls && this.rightButtonNodes[i]) this.colControls.addChild(this.rightButtonNodes[i]);
    }

    [this.leftList, this.ctrlList, this.spellList, this.materialsList, this.componentsList].forEach(l => l?.layoutChildren?.());

    const valBtnCount = document.getElementById('val-btn-count');
    const valBalance = document.getElementById('val-balance');
    const valNodes = document.getElementById('val-nodes');
    if (valBtnCount) valBtnCount.textContent = `${count} ${count === 1 ? 'Item' : 'Items'}`;
    if (valBalance) {
      valBalance.textContent = count < 6 ? `N = ${count} (Centered y=0)` : 'N = 6 (Full Stack)';
      valBalance.style.color = count < 6 ? '#c084fc' : '#38bdf8';
    }
    if (valNodes) valNodes.textContent = (3 + count * 2).toString();
  };

  Proto.syncSidebarButtonDimensions = function() {
    const h = this.state.btnHeight, w1 = this.state.btnW1, w2 = Math.max(w1, this.state.btnW2);
    this.state.btnW2 = w2;
    const apex = Math.max(0, (w2 - w1) * 0.5), spacing = this.state.btnSpacing;

    this.leftButtonNodes.forEach(btn => {
      btn.setDimensions(w1, h, apex, 'flat');
      const vp = btn.getTrait('viewport'), txt = btn.getTrait('text');
      if (vp) vp.offsetX = -Math.round(w1 * 0.28);
      if (txt && txt.align === 'left') txt.offsetX = Math.round(w1 * 0.11);
    });

    this.rightButtonNodes.forEach(btn => btn.setDimensions(w1, h, apex, 'flat'));
    global.UICardsDeck?.spellButtonNodes?.forEach(btn => btn.setDimensions(w1, h, apex, 'flat'));
    global.UICardsDeck?.materialsButtonNodes?.forEach(btn => btn.setDimensions(w1, h, apex, 'flat'));
    global.UICardsDeck?.componentButtonNodes?.forEach(btn => btn.setDimensions(w1, h, apex, 'flat'));

    [this.leftList, this.ctrlList, this.spellList, this.materialsList, this.componentsList].forEach(l => {
      if (l) { l.slotHeight = h; l.spacing = spacing; l.layoutChildren(); }
    });

    if (global.HexFrameAtlas) global.HexFrameAtlas.bakeButtonStamps(w1, h, apex);
  };

})(typeof window !== 'undefined' ? window : this);
