/**
 * @fileoverview cells/font_studio/Font_Studio_Deck_1.0.js - Sidebar Deck Core & Export Column
 * @description Manages FontStudioDeck lifecycle, column creation, standard hex buttons,
 * and the 3-slot Export Deck column for Font Canvas.
 */

(function(global) {
  'use strict';

  class FontStudioDeckClass {
    constructor() {
      this.engine = null;
      this.canvas = null;
      this.rightSidebar = null;
      this.previousSidebarChildren = null;

      this.colStrokes = null;
      this.colParts = null;
      this.listStrokes = null;
      this.listParts = null;

      // Export Column
      this.colExport = null;
      this.listExport = null;
      this.selectedExportSlot = 1; // 1: .OTF, 2: Apply to Game, 3: Shorthand

      this.currentLevel = 0; // 0: Strokes Column, 1: Parts Column
    }

    init(engine, canvas) {
      this.engine = engine;
      this.canvas = canvas || global.GlyphCanvas;
      return true;
    }

    mount(rightSidebar) {
      this.rightSidebar = rightSidebar || this.engine?.rightSidebar;
      if (!this.rightSidebar) return;

      if (!this.previousSidebarChildren) {
        this.previousSidebarChildren = [...this.rightSidebar.children];
      }
      this.rightSidebar.children = [];

      this.createDeckColumns();
      this.setLevel(0, false);
    }

    unmount() {
      if (!this.rightSidebar) return;
      this.rightSidebar.children = [];
      if (this.previousSidebarChildren && this.previousSidebarChildren.length > 0) {
        this.rightSidebar.children = this.previousSidebarChildren;
        this.previousSidebarChildren = null;
      } else if (global.UISidebarDeck?.createSidebarButtons) {
        global.UISidebarDeck.createSidebarButtons();
      }
    }

    createDeckColumns() {
      const HexNode = global.HexNode;
      const traits = global.HexTraits;
      if (!HexNode || !traits || !this.rightSidebar) return;

      const slideDist = 280;
      const colProps = {
        position: { x: 0, y: 0 }, clipContent: false,
        style: { bgOpacity: 0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
      };

      // Column 0: Strokes
      this.colStrokes = new HexNode(Object.assign({ id: 'font-deck-col-strokes' }, colProps));
      this.listStrokes = new traits.ListTrait({ slotHeight: 124, spacing: 12, capacity: 6 });
      this.colStrokes.addTrait(this.listStrokes);

      // Column 1: Parts
      this.colParts = new HexNode(Object.assign({ id: 'font-deck-col-parts', position: { x: slideDist, y: 0 } }, colProps));
      this.listParts = new traits.ListTrait({ slotHeight: 124, spacing: 12, capacity: 6 });
      this.colParts.addTrait(this.listParts);

      this.rightSidebar.addChild(this.colStrokes);
      this.rightSidebar.addChild(this.colParts);
    }

    createStandardHexButton(id, color, isAct = false) {
      return new global.HexNode({
        id, wBase: 124, hBase: 124, apex: 38,
        orientation: 'flat', atlasKey: 'cyan',
        style: {
          bgColor: isAct ? 'rgba(56, 189, 248, 0.25)' : 'rgba(15, 23, 42, 0.70)',
          bgOpacity: 0.70,
          innerHighlight: { enabled: true, color, sharpEdgeColor: '#e0f2fe', spread: 10, intensity: isAct ? 0.95 : 0.55 },
          outerHighlight: { enabled: true, color, sharpEdgeColor: color, blur: 14, intensity: 0.45 }
        }
      });
    }

    // ========================================================================
    // 3-SLOT EXPORT DECK (Shown When Font Canvas Overview Is Open)
    // ========================================================================
    mountExportDeck(rightSidebar) {
      this.rightSidebar = rightSidebar || this.engine?.rightSidebar;
      if (!this.rightSidebar) return;

      if (!this.previousSidebarChildren) {
        this.previousSidebarChildren = [...this.rightSidebar.children];
      }
      this.rightSidebar.children = [];
      this.buildExportColumn();
    }

    selectExportSlot(slot) {
      this.selectedExportSlot = Math.max(1, Math.min(3, slot));
      this.buildExportColumn();
      const audio = global.AudioSynth;
      if (audio?.playClick) audio.playClick();
    }

    executeExportSlot(slot) {
      const audio = global.AudioSynth;
      if (audio?.playSelect) audio.playSelect();

      if (slot === 1) {
        if (global.FontBuilder) global.FontBuilder.downloadOTF();
      } else if (slot === 2) {
        if (global.FontBuilder) global.FontBuilder.applyLiveToGame();
      } else if (slot === 3) {
        if (global.FontStudioData) global.FontStudioData.copyToClipboard();
      }
    }

    buildExportColumn() {
      if (!this.rightSidebar) return;
      this.rightSidebar.children = [];

      const HexNode = global.HexNode;
      const traits = global.HexTraits;
      if (!HexNode || !traits) return;

      const self = this;
      this.colExport = new HexNode({
        id: 'font-deck-col-export',
        position: { x: 0, y: 0 },
        clipContent: false,
        style: { bgOpacity: 0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
      });
      this.listExport = new traits.ListTrait({ slotHeight: 124, spacing: 12, capacity: 6 });
      this.colExport.addTrait(this.listExport);

      const data = global.FontStudioData;
      const fontName = data?.config?.name || 'SciFae Pseudo Script 1.0';

      // Button 0: Top Action Execution Button
      let actionTitle = '💾 DOWNLOAD .OTF';
      let actionSub = `Save "${fontName}"`;
      let actionColor = '#38bdf8';
      let actionBadge = 'EXECUTE';

      if (this.selectedExportSlot === 2) {
        actionTitle = '🎮 APPLY TO GAME';
        actionSub = `Live "${fontName}"`;
        actionColor = '#c084fc';
      } else if (this.selectedExportSlot === 3) {
        actionTitle = '📋 COPY CIPHER';
        actionSub = '96-Line Shorthand Code';
        actionColor = '#4ade80';
      }

      const actionBtn = this.createStandardHexButton('btn-export-execute', actionColor, true);
      actionBtn.addTrait(new traits.ButtonTrait({
        hoverGlowColor: actionColor,
        onClick: () => self.executeExportSlot(self.selectedExportSlot)
      }));
      actionBtn.addTrait(new traits.TextTrait({
        badge: actionBadge, title: actionTitle, subtitle: actionSub,
        align: 'center', titleSize: 11, subtitleSize: 8, titleColor: actionColor
      }));
      this.colExport.addChild(actionBtn);

      // Button 1: Slot 1 - .OTF Font File (Click to select, click again to rename)
      const isSlot1 = (this.selectedExportSlot === 1);
      const slot1Btn = this.createStandardHexButton('btn-slot-1-otf', '#38bdf8', isSlot1);
      slot1Btn.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#38bdf8',
        onClick: () => {
          if (!isSlot1) {
            self.selectExportSlot(1);
          } else {
            const newName = prompt('Enter Font Name:', fontName);
            if (newName && newName.trim() && newName.trim() !== fontName) {
              if (data) {
                data.config.name = newName.trim();
                data.notify();
              }
              self.buildExportColumn();
            }
          }
        }
      }));
      slot1Btn.addTrait(new traits.TextTrait({
        badge: isSlot1 ? 'CLICK: RENAME' : 'SLOT 1',
        title: '🅰 .OTF FONT',
        subtitle: fontName,
        align: 'center', titleSize: 11, subtitleSize: 8,
        titleColor: isSlot1 ? '#38bdf8' : 'rgba(56, 189, 248, 0.60)'
      }));
      this.colExport.addChild(slot1Btn);

      // Button 2: Slot 2 - Live Apply to Game
      const isSlot2 = (this.selectedExportSlot === 2);
      const slot2Btn = this.createStandardHexButton('btn-slot-2-game', '#c084fc', isSlot2);
      slot2Btn.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#c084fc',
        onClick: () => self.selectExportSlot(2)
      }));
      slot2Btn.addTrait(new traits.TextTrait({
        badge: isSlot2 ? 'ACTIVE' : 'SLOT 2',
        title: '🎮 IN-GAME FONT',
        subtitle: 'Apply @font-face',
        align: 'center', titleSize: 11, subtitleSize: 8.5,
        titleColor: isSlot2 ? '#c084fc' : 'rgba(192, 132, 252, 0.60)'
      }));
      this.colExport.addChild(slot2Btn);

      // Button 3: Slot 3 - Copy Shorthand
      const isSlot3 = (this.selectedExportSlot === 3);
      const slot3Btn = this.createStandardHexButton('btn-slot-3-shorthand', '#4ade80', isSlot3);
      slot3Btn.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#4ade80',
        onClick: () => self.selectExportSlot(3)
      }));
      slot3Btn.addTrait(new traits.TextTrait({
        badge: isSlot3 ? 'ACTIVE' : 'SLOT 3',
        title: '📋 SHORTHAND',
        subtitle: '96-Line Cipher',
        align: 'center', titleSize: 11, subtitleSize: 8.5,
        titleColor: isSlot3 ? '#4ade80' : 'rgba(74, 222, 128, 0.60)'
      }));
      this.colExport.addChild(slot3Btn);

      // Button 4: Return to Canvas Hub
      const returnBtn = this.createStandardHexButton('btn-font-exit-hub', '#f43f5e');
      returnBtn.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#f43f5e',
        onClick: () => {
          if (global.FontCanvas) global.FontCanvas.close();
          if (global.CanvasHub) global.CanvasHub.open();
        }
      }));
      returnBtn.addTrait(new traits.TextTrait({
        badge: 'HUB', title: '✕ EXIT / HUB', subtitle: 'Return to Hub',
        align: 'center', titleSize: 11, subtitleSize: 8.5, titleColor: '#f43f5e'
      }));
      this.colExport.addChild(returnBtn);

      this.listExport.layoutChildren();
      this.rightSidebar.addChild(this.colExport);
    }
  }

  const instance = new FontStudioDeckClass();
  global.FontStudioDeckClass = FontStudioDeckClass;
  global.FontStudioDeck = instance;
  if (global.ROLL_CALL?.set) global.ROLL_CALL.set('Font_Studio_Deck_1.0', instance);
})(typeof window !== 'undefined' ? window : this);
