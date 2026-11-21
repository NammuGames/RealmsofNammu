/**
 * @fileoverview cells/hex_ui/UI_Sidebar_Deck_1.0.js - Multi-Part Cell: Part 1.0 of UI_Sidebar_Deck
 * @description Constructs the Left Navigation Spool, Right Sidebar 3-Column Deck, and core click handlers.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  class UISidebarDeckClass {
    constructor() {
      this.engine = null;
      this.state = null;
      this.audio = null;

      this.leftButtonNodes = [];
      this.rightButtonNodes = [];

      this.colControls = null;
      this.colSpellbook = null;
      this.colMaterials = null;
      this.colComponents = null;
      this.materialsOpenedFromCol = 0;

      this.leftList = null;
      this.ctrlList = null;
      this.rightList = null;
      this.spellList = null;
      this.materialsList = null;
      this.componentsList = null;
    }

    get spellButtonNodes() { return global.UICardsDeck?.spellButtonNodes || []; }
    get materialsButtonNodes() { return global.UICardsDeck?.materialsButtonNodes || []; }

    init(engine, state, audio) {
      this.engine = engine;
      this.state = state;
      this.audio = audio || global.AudioSynth;
      this.createSidebarButtons();
    }

    createSidebarButtons() {
      const engine = this.engine;
      const state = this.state;
      const traits = global.HexTraits;
      const HexNode = global.HexNode;
      const audio = this.audio;

      engine.leftSidebar.children = [];
      engine.rightSidebar.children = [];
      this.leftButtonNodes = [];
      this.rightButtonNodes = [];

      this.leftList = new traits.ListTrait({ slotHeight: state.btnHeight, spacing: state.btnSpacing, capacity: 6 });
      engine.leftSidebar.addTrait(this.leftList);

      // Column Containers
      this.colControls = new HexNode({
        id: 'col-controls', position: { x: 0, y: 0 }, clipContent: false,
        style: { bgOpacity: 0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
      });
      this.ctrlList = new traits.ListTrait({ slotHeight: state.btnHeight, spacing: state.btnSpacing, capacity: 6 });
      this.rightList = this.ctrlList;
      this.colControls.addTrait(this.ctrlList);

      const initialSlideDist = Math.max(280, state.btnW2 + 60);
      this.colSpellbook = new HexNode({
        id: 'col-spellbook', position: { x: initialSlideDist, y: 0 }, clipContent: false,
        style: { bgOpacity: 0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
      });
      this.colSpellbook.visible = false;
      this.spellList = new traits.ListTrait({ slotHeight: state.btnHeight, spacing: state.btnSpacing, capacity: 6 });
      this.colSpellbook.addTrait(this.spellList);

      this.colMaterials = new HexNode({
        id: 'col-materials', position: { x: initialSlideDist * 2, y: 0 }, clipContent: false,
        style: { bgOpacity: 0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
      });
      this.colMaterials.visible = false;
      this.materialsList = new traits.ListTrait({ slotHeight: state.btnHeight, spacing: state.btnSpacing, capacity: 6 });
      this.colMaterials.addTrait(this.materialsList);

      this.colComponents = new HexNode({
        id: 'col-components', position: { x: initialSlideDist * 3, y: 0 }, clipContent: false,
        style: { bgOpacity: 0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
      });
      this.colComponents.visible = false;
      this.componentsList = new traits.ListTrait({ slotHeight: state.btnHeight, spacing: state.btnSpacing, capacity: 6 });
      this.colComponents.addTrait(this.componentsList);

      engine.rightSidebar.addChild(this.colControls);
      engine.rightSidebar.addChild(this.colSpellbook);
      engine.rightSidebar.addChild(this.colMaterials);
      engine.rightSidebar.addChild(this.colComponents);

      // 6 Left Buttons
      const navData = [
        { key: 'undo', title: 'Return', hotkey: 'ESC', color: '#38bdf8', isSidebarButton: true, action: () => this.handleUndo() },
        { key: 'nav-up', dir: 'up', hotkey: 'W', title: '▲ UP', sub: '+R (Northwest)', badge: 'KEY: W', color: '#38bdf8', action: () => this.handleNav('up') },
        { key: 'nav-down', dir: 'down', hotkey: 'S', title: '▼ DOWN', sub: '-Q (Southwest)', badge: 'KEY: S', color: '#38bdf8', action: () => this.handleNav('down') },
        { key: 'nav-left', dir: 'left', hotkey: 'A', title: '◄ LEFT', sub: 'Pure West (-X)', badge: 'KEY: A', color: '#38bdf8', action: () => this.handleNav('left') },
        { key: 'nav-right', dir: 'right', hotkey: 'D', title: 'RIGHT ►', sub: 'Pure East (+X)', badge: 'KEY: D', color: '#38bdf8', action: () => this.handleNav('right') },
        { key: 'menu', title: 'Menu', hotkey: 'M', color: '#c084fc', isSidebarButton: true, action: () => {
          if (global.RoomStatCanvas?.isOpen?.()) { global.RoomStatCanvas.onLeavePressed(); return; }
          global.CanvasHub?.toggle();
        } }
      ];

      navData.forEach(d => {
        const btnNode = this.createBaseButtonNode(`btn-nav-${d.key}`, d.color);
        btnNode.addTrait(new traits.ButtonTrait({ hoverGlowColor: d.color, soundClick: !d.dir, onClick: () => d.action() }));
        if (d.dir && global.UIButtonSprites) {
          btnNode.addTrait(global.UIButtonSprites.createNavSpriteTrait({ type: 'arrow', dir: d.dir, hotkey: d.hotkey, isRightSidebar: false, titleColor: d.color, subtitle: d.sub }));
        } else {
          btnNode.addTrait(new traits.TextTrait({ badge: d.badge || '', title: d.title, subtitle: d.sub || '', align: 'center', isSidebarButton: !!d.isSidebarButton, isRightSidebar: false, hotkey: d.hotkey || '', titleColor: d.color }));
        }
        this.leftButtonNodes.push(btnNode);
      });

      // 6 Right Buttons
      const ctrlData = [
        { key: 'spellbook', title: ['Spell', 'Book'], hotkey: 'B', color: '#c084fc', isSidebarButton: true, action: () => (typeof this.toggleSpellbookColumn === 'function' ? this.toggleSpellbookColumn() : this.openSpellbookColumn()) },
        { key: 'piece', title: ['Sigil', 'Nook'], hotkey: 'N', color: '#38bdf8', isSidebarButton: true, action: () => this.handlePieceClick() },
        { key: 'rot-ccw', dir: 'ccw', hotkey: 'Q', title: '↺ CCW', sub: 'Rotate Counter', badge: 'KEY: Q', color: '#38bdf8', action: () => this.handleRotate('ccw') },
        { key: 'rot-cw', dir: 'cw', hotkey: 'E', title: 'CW ↻', sub: 'Rotate Clockwise', badge: 'KEY: E', color: '#38bdf8', action: () => this.handleRotate('cw') },
        { key: 'place', title: 'Place', hotkey: 'SPC', color: '#38bdf8', isSidebarButton: true, action: () => this.handlePlace() },
        { key: 'end-turn', title: ['End', 'Turn'], hotkey: 'ENT', color: '#4ade80', isSidebarButton: true, action: () => this.handleEndTurn() }
      ];

      ctrlData.forEach((d, i) => {
        const btnNode = this.createBaseButtonNode(`btn-ctrl-${i}`, d.color);
        btnNode.addTrait(new traits.ButtonTrait({ hoverGlowColor: d.color, soundClick: !d.dir && d.key !== 'place' && d.key !== 'end-turn', allowGhostClick: d.key === 'place', onClick: () => d.action() }));
        if (d.dir && global.UIButtonSprites) {
          btnNode.addTrait(global.UIButtonSprites.createNavSpriteTrait({ type: 'rotation', dir: d.dir, hotkey: d.hotkey, isRightSidebar: true, titleColor: d.color, subtitle: d.sub }));
        } else if (d.key === 'piece' && global.UIViewButton) {
          btnNode.addTrait(global.UIViewButton.createTrait());
          btnNode.addTrait(new traits.TextTrait({ badge: d.badge || '', title: d.title, subtitle: d.sub || '', align: 'center', isSidebarButton: !!d.isSidebarButton, isRightSidebar: true, hotkey: d.hotkey || '', titleColor: d.color }));
        } else {
          btnNode.addTrait(new traits.TextTrait({ badge: d.badge || '', title: d.title, subtitle: d.sub || '', align: 'center', isSidebarButton: !!d.isSidebarButton, isRightSidebar: true, hotkey: d.hotkey || '', titleColor: d.color }));
        }
        this.rightButtonNodes.push(btnNode);
      });

      // Delegate column 1, 2, and 3 to UICardsDeck
      if (global.UICardsDeck) {
        global.UICardsDeck.init(state, this.colSpellbook, this.colMaterials, this.spellList, this.materialsList, this.colComponents, this.componentsList);
        global.UICardsDeck.syncSpellbookColumnWithGameState();
        global.UICardsDeck.syncMaterialsQueueColumn();
        global.UICardsDeck.syncComponentsColumn();
      }

      if (global.UIDeckSync) global.UIDeckSync.syncMaterialsTrayWithGameState();
      if (typeof this.updateVisibleButtonCount === 'function') {
        this.updateVisibleButtonCount(state.sidebarBtnCount);
      }
    }

    createBaseButtonNode(id, color) {
      const state = this.state;
      return new global.HexNode({
        id, wBase: state.btnW1, hBase: state.btnHeight,
        apex: Math.max(0, (state.btnW2 - state.btnW1) * 0.5), orientation: 'flat', atlasKey: 'cyan',
        style: {
          bgColor: '#000000', bgOpacity: 0.80,
          innerHighlight: { enabled: true, color: '#10f000', sharpEdgeColor: '#10f000', spread: 8, intensity: 0.80, steps: 3 },
          outerHighlight: { enabled: false, color: '#c084fc', sharpEdgeColor: '#c084fc', blur: 12, intensity: 0.80, steps: 3 }
        }
      });
    }

    handleUndo() {
      if (global.TurnConfirmPopup?.isOpen?.()) {
        global.TurnConfirmPopup.close();
        return;
      } else if (global.RoomStatCanvas?.isOpen?.()) {
        global.RoomStatCanvas.onReturnPressed();
        return;
      } else if (global.GameSettingsCanvas?.isOpen()) {
        global.GameSettingsCanvas.goBack();
        return;
      } else if (global.StatCanvas?.isOpen()) {
        global.StatCanvas.close();
        global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
        global.BoardRenderer?.render?.();
        return;
      } else if (global.SigilNookCanvas?.isOpen()) {
        global.SigilNookCanvas.goBack();
        return;
      } else if (global.CanvasHub?.isOpen()) {
        global.CanvasHub.goBack();
        return;
      } else if (global.SigilEmblemStudio?.isOpen()) {
        global.SigilEmblemStudio.goBack();
        return;
      }

      const g = global.GameState;
      if (global.SpellCharge?.isMimicking) {
        global.SpellCharge.handleUndo();
        global.UIDeckSync?.syncMaterialsTrayWithGameState();
        global.BoardRenderer?.render();
        return;
      }
      if (this.state.rightSidebarActiveCol === 3) {
        if (g?.inRitualMode) global.SpellRitual?.handleUndo?.();
        else if (g?.inManifestMode) global.SpellManifest?.handleUndo?.();
        else if (typeof this.closeComponentsColumn === 'function') this.closeComponentsColumn();
      } else if (this.state.rightSidebarActiveCol === 2) {
        if (global.UICardsDeck?.spectatorSeekPeek) {
          global.UICardsDeck.spectatorSeekPeek = false;
          if (typeof this.openSpellbookColumn === 'function') this.openSpellbookColumn(false);
        } else if (g?.inForesightMode) {
          if (global.SpellForesight?.handleUndo) global.SpellForesight.handleUndo();
          else g.cancelForesightSwap();
        } else if (this.materialsOpenedFromCol === 1) {
          if (typeof this.openSpellbookColumn === 'function') this.openSpellbookColumn(false);
        } else {
          if (typeof this.closeMaterialsColumn === 'function') this.closeMaterialsColumn();
        }
      } else if (this.state.rightSidebarActiveCol === 1) {
        if (typeof this.closeSpellbookColumn === 'function') this.closeSpellbookColumn();
      } else if (g?.inArchMode) { global.SpellArch?.handleUndo?.();
      } else if (g?.inShiftMode) { global.SpellShift?.handleUndo?.();
      } else if (g?.inRitualMode) { global.SpellRitual?.handleUndo?.();
      } else if (g?.inManifestMode) { global.SpellManifest?.handleUndo?.();
      } else if (g?.inTeleportMode) { global.SpellTeleport?.handleUndo ? global.SpellTeleport.handleUndo() : (g.cancelTeleport ? g.cancelTeleport() : global.SpellTeleport?.cancel?.());
      } else if (g?.inChargeMode) { global.SpellCharge?.handleUndo ? global.SpellCharge.handleUndo() : (global.SpellCharge?.cancel ? global.SpellCharge.cancel() : g.cancelCharge?.());
      } else if (global.UndoManager) {
        global.UndoManager.undoLastAction();
      }
      global.UIDeckSync?.syncMaterialsTrayWithGameState();
      global.BoardRenderer?.render();
    }

    handleNav(dir) {
      if (global.GameState) {
        global.GameState.moveDirection(dir);
        global.UIDeckSync?.syncMaterialsTrayWithGameState();
      }
    }

    handlePieceClick() {
      const g = global.GameState;
      if (!g || global.TurnManager?.isEndingTurn || global.TurnManager?.isStartingTurn || g.turnPhase === 'START_TURN' || g.turnPhase === 'END_TURN') return;
      if (g.inForesightMode) {
        if (typeof this.openMaterialsColumn === 'function') this.openMaterialsColumn(true);
        return;
      }

      const activeSpell = global.UIViewButton?.getActiveSigilSpell?.();
      if (activeSpell && global.SigilNookCanvas) {
        global.SigilNookCanvas.openDetail(activeSpell, 'btn-ctrl-1');
        return;
      }

      // Exclusive Sigil Nook Grimoire Canvas (Queue path fully removed)
      if (global.SigilNookCanvas) {
        global.SigilNookCanvas.open();
      }
    }

    handleRotate(dir) {
      const g = global.GameState;
      if (!g || global.TurnManager?.isEndingTurn || global.TurnManager?.isStartingTurn || g.turnPhase === 'START_TURN' || g.turnPhase === 'END_TURN') return;
      if (g.inTeleportMode && g.teleportHeldSigil) {
        g.rotatePiece(dir);
        global.UIDeckSync?.syncMaterialsTrayWithGameState();
      } else if (g.inSigilStage) {
        let cand = null;
        if (g.selectedSigilId) cand = (g.allCandidates || []).find(c => c.id === g.selectedSigilId);
        else if (g.sigilCursorVertex && global.HexMath) {
          const tiles = global.HexMath.getVertexTiles(g.sigilCursorVertex).sort();
          cand = (g.allCandidates || []).find(c => c.id === 'sigil_' + tiles.join('|'));
        }
        if (cand && cand.isWild && g.lockedSigilIds?.has(cand.id)) {
          if (typeof g.permuteWildSigil === 'function') g.permuteWildSigil(cand.id, dir === 'ccw' ? -1 : 1);
          global.UIDeckSync?.syncMaterialsTrayWithGameState();
          global.BoardRenderer?.render();
        }
      } else if (!g.placedThisTurn && g.isMaterialSelected) {
        g.rotatePiece(dir);
        global.UIDeckSync?.syncMaterialsTrayWithGameState();
      }
    }

    handlePlace() {
      if (global.TurnConfirmPopup?.isOpen?.()) {
        global.AudioSynth?.playClick?.();
        global.TurnConfirmPopup.confirm();
        return;
      }
      if (global.InputController?.isAnyCanvasOpen?.() || global.TurnManager?.isEndingTurn) return;
      const g = global.GameState;
      if (!g) return;
      const cursorsEngaged = !!(
        g.inSigilStage || g.inTeleportMode || g.inChargeMode ||
        g.inShiftMode || g.inArchMode || g.inRitualMode ||
        g.inManifestMode || g.inSpellOverflow
      );
      if (g.placedThisTurn && !cursorsEngaged) {
        global.AudioSynth?.playCancel?.();
        return;
      }
      g.placeActiveMaterial();
      global.UIDeckSync?.syncMaterialsTrayWithGameState();
      global.BoardRenderer?.render();
    }

    handleEndTurn() {
      if (global.TurnConfirmPopup?.isOpen?.()) {
        global.TurnConfirmPopup.confirm();
        return;
      }
      if (global.GameSettingsRenamePopup?.isOpen?.()) {
        global.AudioSynth?.playClick?.();
        global.GameSettingsRenamePopup.confirm();
        return;
      }
      if (global.RoomStatCanvas?.isOpen?.()) {
        global.AudioSynth?.playClick?.();
        global.RoomStatCanvas.onConfirmPressed();
        return;
      }
      if (global.StatCanvas?.isOpen?.() && global.GameState?.gameOver) {
        global.AudioSynth?.playClick?.();
        global.StatCanvas.close(false, () => {
          global.GameState?.clearToPreMatch?.();
          if (global.GameSettingsCanvas) {
            global.GameSettingsCanvas.isMatchActive = false;
            global.GameSettingsCanvas.openSetupMenu('btn-nav-menu');
          }
        });
        return;
      }
      if (global.GameSettingsCanvas?.isOpen?.()) {
        global.AudioSynth?.playClick?.();
        if (global.GameSettingsCanvas.mode === 'pause') {
          global.GameSettingsCanvas.close();
          return;
        }
        if (global.GameSettingsCanvas.isPresetColumnOpen?.()) {
          global.GameSettingsCanvas.confirmPresetEdit();
          return;
        }
        if (!global.GameSettingsCanvas.history || global.GameSettingsCanvas.history.length <= 1) {
          global.GameSettingsCanvas.launchMatch();
          return;
        }
        // If on Preset Settings, save draft or create copy for default
        const history = global.GameSettingsCanvas.history;
        const curCol = history[history.length - 1];
        if (curCol?.title === 'Preset Settings') {
          const draft = global.GameSettingsCanvas.activePresetDraft;
          if (draft) {
            const isModified = JSON.stringify(draft.draftItem) !== (draft.originalSnapshot || JSON.stringify(draft.targetPreset));
            if (!isModified) {
              global.GameSettingsCanvas.config.activePresetIndex = draft.index;
              global.GameSettingsCanvas.activePresetDraft = null;
              global.GameSettingsCanvas.popColumn();
              global.GameSettingsCanvas.buildScene();
              return;
            }
            if (draft.isDefault) {
              global.GameSettingsCanvas.createPresetCopyAndRename(draft.draftItem, (newCopy, newIdx) => {
                global.GameSettingsCanvas.config.activePresetIndex = newIdx;
                global.GameSettingsCanvas.activePresetDraft = null;
                global.GameSettingsCanvas.popColumn();
                global.GameSettingsCanvas.buildScene();
              });
              return;
            } else {
              Object.assign(draft.targetPreset, draft.draftItem);
              const newIdx = global.GameSettingsCanvas.sortPresetList(global.GameSettingsCanvas.config.presets, draft.targetPreset);
              global.GameSettingsCanvas.config.activePresetIndex = newIdx;
              global.GameState?.showToast?.(`✦ Saved Preset: "${draft.targetPreset.name}"`);
              global.GameSettingsCanvas.activePresetDraft = null;
              global.GameSettingsCanvas.popColumn();
              global.GameSettingsCanvas.buildScene();
              return;
            }
          }
        }
        const committed = global.GameSettingsCanvas.commitPendingDeletions?.();
        global.GameSettingsCanvas.popColumn();
        if (committed) global.GameSettingsCanvas.buildScene?.();
        return;
      }
      if (this.state.rightSidebarActiveCol === 1) {
        if (typeof this.closeSpellbookColumn === 'function') this.closeSpellbookColumn();
        return;
      }
      if (this.state.rightSidebarActiveCol === 2 && global.UICardsDeck?.spectatorSeekPeek) {
        global.UICardsDeck.spectatorSeekPeek = false;
        if (typeof this.closeMaterialsColumn === 'function') this.closeMaterialsColumn();
        return;
      }
      if (global.TurnLogManager?.hasPendingEntries?.() || global.TurnLogPlayer?.active) {
        global.AudioSynth?.playClick?.();
        global.TurnLogPlayer?.advanceOrSkip?.();
        global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
        global.BoardRenderer?.render?.();
        return;
      }
      const g = global.GameState;
      if (!g || global.TurnManager?.isEndingTurn || global.TurnManager?.isStartingTurn || g.turnPhase === 'START_TURN' || g.turnPhase === 'END_TURN') return;
      if (g.inArchMode) {
        if (global.SpellArch?.isPlaced) {
          global.SpellArch.finalizeArch();
        } else {
          global.SpellArch?.cancel();
        }
      } else if (g.inShiftMode) {
        global.SpellShift?.stage === 'component' ? global.SpellShift.finalizeShift() : global.SpellShift?.cancel();
      } else if (g.inRitualMode) {
        global.SpellRitual?.stage === 'component' ? global.SpellRitual.finalizeRitual() : global.SpellRitual?.cancel();
      } else if (g.inManifestMode) {
        global.SpellManifest?.stage === 'component' ? global.SpellManifest.finalizeManifest() : global.SpellManifest?.cancel();
      } else if (!g.placedThisTurn && (g.activeMaterialMod === 'weave' || global.SpellWeave?.inWeaveMode)) {
        return;
      } else if (g.inTeleportMode) {
        g.cancelTeleport ? g.cancelTeleport() : global.SpellTeleport?.cancel?.();
      } else if (g.inChargeMode) {
        global.SpellCharge?.cancel ? global.SpellCharge.cancel() : g.cancelCharge?.();
      } else if (g.inForesightMode) {
        if (g.foresightSwappedIndex !== null) g.finalizeForesightSwap?.();
        else { global.AudioSynth?.playCancel?.(); g.showToast?.('Select an upcoming material (Slots 2–6) to swap into Slot 1!'); }
      } else {
        global.AudioSynth?.playClick?.();
        const executeEndTurn = () => {
          if (typeof g.endTurn === 'function') g.endTurn();
          else global.TurnManager?.endTurn();
          global.UIDeckSync?.syncMaterialsTrayWithGameState();
          global.BoardRenderer?.render();
        };
        if (global.TurnConfirmPopup?.open) {
          global.TurnConfirmPopup.open(executeEndTurn);
          return;
        }
        executeEndTurn();
        return;
      }

      global.UIDeckSync?.syncMaterialsTrayWithGameState();
      global.BoardRenderer?.render();
    }
  }

  const instance = new UISidebarDeckClass();
  global.UISidebarDeckClass = UISidebarDeckClass;
  global.UISidebarDeck = instance;
  if (global.ROLL_CALL) global.ROLL_CALL.set('UI_Sidebar_Deck', instance);

})(typeof window !== 'undefined' ? window : this);
