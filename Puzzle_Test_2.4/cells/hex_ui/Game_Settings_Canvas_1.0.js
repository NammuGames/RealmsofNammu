/**
 * @fileoverview cells/hex_ui/Game_Settings_Canvas_1.0.js - Match Setup Frame & Core State Engine
 * @description Part 1.0 of the multi-part Game Settings Canvas system.
 * Holds hierarchical match parameters (Match, Luck, Blight presets), ListTrait scroll container setup,
 * audio/modal lifecycle, match launch coordinator, history stack navigation, and scene graph mount.
 * (Pod factories are modularly defined in Part 1.3).
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  class GameSettingsCanvasClass {
    constructor() {
      this.engine = null;
      this.containerNode = null;
      this.listContainer = null;
      this.listTrait = null;
      this.active = false;
      this.isMatchActive = false;
      this.mode = 'setup'; // 'setup' | 'pause'
      this.history = [];   // Stack of { title, renderFn }
      this.activePresetDraft = null; // Working isolated draft for preset editing

      // Standard Menu Layout Dimensions (Mirrors Stat Canvas Pods)
      this.dims = { headerW: 640, headerH: 72, headerApex: 22, headerSpacing: 20, podW: 870, podH: 154, podApex: 42, podSpacing: 12 };

      // Hierarchical Match Parameters (Unified Game Mode Defaults)
      this.config = {
        playerCount: 1,
        activePresetIndex: 0,
        presets: [
          {
            id: 'p1',
            name: 'Meditate',
            tagNumber: '001',
            isDefault: true,
            match: { materialComposition: 'Even', luckComposition: 'Ether', startingSpells: 3, rounds: 144, boardRadius: 6, isEndless: false },
            luck: {
              activePlayfieldIndex: 0, activeMaterialIndex: 0,
              playfieldItems: [{ id: 'pl1', name: 'Boon', turnStart: 0, turnInterval: 3, turnEnd: 24, spawnCount: 1, chance: 100, dupInterval: 0, tagNumber: '001', isEndOfMatch: true }],
              materialItems: [{ id: 'ml1', name: 'Gifts', turnStart: 1, turnInterval: 1, turnEnd: 24, spawnCount: 1, chance: 4, dupInterval: 0, tagNumber: '001', isEndOfMatch: true }]
            },
            blight: {
              activePlayfieldIndex: 0, activeMaterialIndex: 0,
              playfieldItems: [{ id: 'ps1', name: 'Enemies', turnStart: 3, turnInterval: 1, turnEnd: 24, spawnCount: 1, chance: 0, dupInterval: 0, tagNumber: '001', isEndOfMatch: true }],
              materialItems: [{ id: 'ms1', name: 'Contamination', turnStart: 1, turnInterval: 1, turnEnd: 24, spawnCount: 1, chance: 0, dupInterval: 0, tagNumber: '001', isEndOfMatch: true }]
            }
          },
          {
            id: 'mat_1793327702025',
            name: 'Adventure',
            tagNumber: '002',
            isDefault: true,
            match: { materialComposition: 'Random', luckComposition: 'Random', startingSpells: 1, rounds: 144, boardRadius: 7, isEndless: false },
            luck: {
              activePlayfieldIndex: 0, activeMaterialIndex: 0,
              playfieldItems: [{ id: 'pl1', name: 'Boon', turnStart: 0, turnInterval: 3, turnEnd: 24, spawnCount: 1, chance: 100, dupInterval: 0, tagNumber: '001', isEndOfMatch: true }],
              materialItems: [{ id: 'ml1', name: 'Gifts', turnStart: 1, turnInterval: 1, turnEnd: 24, spawnCount: 1, chance: 4, dupInterval: 0, tagNumber: '001', isEndOfMatch: true }]
            },
            blight: {
              activePlayfieldIndex: 0, activeMaterialIndex: 0,
              playfieldItems: [{ id: 'ps1', name: 'Enemies', turnStart: 3, turnInterval: 1, turnEnd: 24, spawnCount: 1, chance: 18, dupInterval: 0, tagNumber: '001', isEndOfMatch: true }],
              materialItems: [{ id: 'ms1', name: 'Contamination', turnStart: 1, turnInterval: 1, turnEnd: 24, spawnCount: 1, chance: 4, dupInterval: 0, tagNumber: '001', isEndOfMatch: true }]
            }
          },
          {
            id: 'mat_1793370175588',
            name: 'Survival',
            tagNumber: '003',
            isDefault: true,
            match: { materialComposition: 'Random', luckComposition: 'Random', startingSpells: 0, rounds: 144, boardRadius: 8, isEndless: true },
            luck: {
              activePlayfieldIndex: 0, activeMaterialIndex: 0,
              playfieldItems: [{ id: 'pl1', name: 'Boon', turnStart: 0, turnInterval: 3, turnEnd: 24, spawnCount: 1, chance: 0, dupInterval: 0, tagNumber: '001', isEndOfMatch: true }],
              materialItems: [{ id: 'ml1', name: 'Gifts', turnStart: 1, turnInterval: 1, turnEnd: 24, spawnCount: 1, chance: 0, dupInterval: 0, tagNumber: '001', isEndOfMatch: true }]
            },
            blight: {
              activePlayfieldIndex: 0, activeMaterialIndex: 0,
              playfieldItems: [{ id: 'ps1', name: 'Enemies', turnStart: 3, turnInterval: 1, turnEnd: 24, spawnCount: 1, chance: 6, dupInterval: 12, tagNumber: '001', isEndOfMatch: true }],
              materialItems: [{ id: 'ms1', name: 'Contamination', turnStart: 1, turnInterval: 1, turnEnd: 24, spawnCount: 1, chance: 4, dupInterval: 0, tagNumber: '001', isEndOfMatch: true }]
            }
          }
        ]
      };

      // Legacy fallback getters for backward compatibility
      Object.defineProperties(this.config, {
        matchPresets: { get: () => (this.config.presets || []).map(p => ({ ...p.match, name: p.name, tagNumber: p.tagNumber, id: p.id })) },
        luckPresets: { get: () => (this.config.presets || []).map(p => ({ ...p.luck, name: p.name, tagNumber: p.tagNumber, id: p.id })) },
        blightPresets: { get: () => (this.config.presets || []).map(p => ({ ...p.blight, name: p.name, tagNumber: p.tagNumber, id: p.id })) },
        activeMatchPresetIndex: { get: () => this.config.activePresetIndex, set: (v) => { this.config.activePresetIndex = v; } },
        activeLuckPresetIndex: { get: () => this.config.activePresetIndex, set: (v) => { this.config.activePresetIndex = v; } },
        activeBlightPresetIndex: { get: () => this.config.activePresetIndex, set: (v) => { this.config.activePresetIndex = v; } }
      });
    }

    init(engine) {
      this.engine = engine;
      const HexNode = global.HexNode;
      if (!HexNode) return false;

      this.containerNode = new HexNode({
        id: 'game-settings-canvas-root', position: { x: 0, y: 0 },
        wBase: 960, hBase: 800, apex: 220, orientation: 'flat', clipContent: false,
        style: { bgOpacity: 0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
      });
      this.containerNode.visible = false;
      this.containerNode.onResize = () => { if (this.active) this.rebuildTopFrame(); };
      return true;
    }

    createPageFrame(id = null) {
      const HexNode = global.HexNode;
      const frame = new HexNode({
        id: id || `settings-frame-${Math.random().toString(36).substring(2, 7)}`, position: { x: 0, y: 0 },
        wBase: 960, hBase: 800, apex: 220, orientation: 'flat', clipContent: true,
        style: {
          bgColor: 'rgba(5, 10, 20, 1.0)', bgOpacity: 1.00,
          innerHighlight: { enabled: true, color: '#10f000', sharpEdgeColor: '#10f000', spread: 8, intensity: 0.80, steps: 3 },
          outerHighlight: { enabled: false, color: '#0284c7', blur: 24, intensity: 0.50 }
        }
      });
      if (global.BorderTuningLab?.applyGroupStyle) {
        global.BorderTuningLab.applyGroupStyle(frame, 'group-canvases');
      }
      return frame;
    }

    getActiveFrame() {
      if (this.history && this.history.length > 0) {
        return this.history[this.history.length - 1].frame || this.containerNode;
      }
      return this.containerNode;
    }

    rebuildTopFrame() {
      const top = this.getActiveFrame();
      if (top) this.buildScene(top);
    }

    isAnimating() {
      return !!(this.history?.some(e => e.frame?.animating)
        || this.containerNode?.children?.some(c => typeof c.id === 'string' && c.id.startsWith('settings-frame-') && c.animating));
    }

    _hasOtherOverlayOpen() {
      return !!(global.StatCanvas?.isOpen?.() || global.SigilNookCanvas?.isOpen?.() || global.SigilEmblemStudio?.isOpen?.() || global.TurnConfirmPopup?.isOpen?.());
    }

    isOpen() { return this.active || this.isAnimating(); }

    toggle() {
      if (this.isAnimating()) return;
      if (this.active) { this.close(); }
      else { if (this.isMatchActive || global.GameState?.matchStarted) this.openInGamePause(); else this.openSetupMenu(); }
    }

    openSetupMenu(origin = 'btn-nav-menu', options = {}) {
      if (this.isOpen() || this._hasOtherOverlayOpen()) return;
      this.mode = 'setup'; this.history = []; this.open(origin, options);
    }
    openInGamePause(origin = 'btn-nav-menu', options = {}) {
      if (this.isOpen() || this._hasOtherOverlayOpen()) return;
      this.mode = 'pause'; this.open(origin, options);
    }

    open(origin = 'btn-nav-menu', options = {}) {
      if (this.active || this.isAnimating() || this._hasOtherOverlayOpen()) return;
      this.active = true;
      this._originId = origin;
      this._nextScroll = 0; this._nextTargetScroll = 0;
      if (this.engine?.setStudioOverlay) this.engine.setStudioOverlay(this.containerNode);
      this.containerNode.visible = true;
      this.containerNode.children = [];
      this.history = [];

      const rootFrame = this.createPageFrame('settings-frame-root');
      this.containerNode.addChild(rootFrame);
      const rootEntry = {
        title: (this.mode === 'pause' ? 'Pause' : 'Root'),
        renderFn: () => (this.mode === 'pause' ? this.buildPauseScene(rootFrame) : this.renderRootColumn(rootFrame)),
        frame: rootFrame,
        originPos: origin
      };
      this.history.push(rootEntry);
      this.buildScene(rootFrame);

      if (global.TweenOrchestrator?.expandFrame) {
        global.TweenOrchestrator.expandFrame(rootFrame, origin);
      } else {
        rootFrame.visible = true;
      }
      if (!options?.silent && global.AudioSynth?.playClick) global.AudioSynth.playClick();
      global.BoardRenderer?.render?.();
    }

    close(onDone) {
      if ((!this.active && !this.containerNode?.visible) || this.isAnimating()) return;
      this.active = false;
      this.activePresetDraft = null;
      this.isPresetDeleteMode = false;
      this._presetDeleteCategory = null;
      if (global.GameSettingsRenamePopup?.isOpen?.()) global.GameSettingsRenamePopup.close(true);

      const topEntry = this.history[this.history.length - 1];
      const activeFrame = topEntry?.frame || this.containerNode;
      const doCloseCleanup = () => {
        if (this.containerNode) {
          this.containerNode.visible = false;
          this.containerNode.children = [];
        }
        this.history = [];
        global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
        global.BoardRenderer?.render?.();
        if (typeof onDone === 'function') onDone();
      };
      if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
      if (global.TweenOrchestrator?.collapseFrame && activeFrame?.visible) {
        global.TweenOrchestrator.collapseFrame(activeFrame, this._originId || 'btn-nav-menu', {
          onComplete: doCloseCleanup
        });
      } else {
        doCloseCleanup();
      }
    }

    goBack() {
      if (!this.active) return false;
      if (this.isAnimating()) return true;
      if (global.TurnConfirmPopup?.isOpen?.()) { global.TurnConfirmPopup.close(); return true; }
      if (global.GameSettingsRenamePopup?.isOpen?.()) {
        if (typeof global.GameSettingsRenamePopup.cancel === 'function') global.GameSettingsRenamePopup.cancel();
        else global.GameSettingsRenamePopup.close();
        return true;
      }
      if (this.mode === 'pause') { this.close(); return true; }
      if (this.history.length > 1) { this.popColumn(); return true; }
      this.close();
      return true;
    }

    getActiveWorkingPreset() {
      if (this.activePresetDraft?.draftItem) {
        return this.activePresetDraft.draftItem;
      }
      const list = this.config.presets || [];
      const idx = Math.max(0, Math.min(list.length - 1, this.config.activePresetIndex || 0));
      return list[idx] || list[0] || null;
    }

    pushColumn(title, renderFn, metadata, originNode = null, options = {}) {
      if (!this.active || this.isAnimating()) return;
      if (this.history.length > 0 && this.listTrait) {
        this.history[this.history.length - 1].scroll = this.listTrait.scrollOffset;
        this.history[this.history.length - 1].targetScroll = this.listTrait.targetScrollOffset;
      }
      const curEntry = this.history[this.history.length - 1];
      const origin = originNode || global.HexUIEngine?.lastClickedNode || curEntry?.originPos || 'btn-nav-menu';
      const originPos = global.TweenOrchestrator?.getOriginPoint(origin, curEntry?.frame?.position?.x || 0, curEntry?.frame?.position?.y || 0);

      const newFrame = this.createPageFrame('settings-frame-' + title);
      this.containerNode.addChild(newFrame);

      const entry = { title, renderFn, frame: newFrame, originPos };
      if (metadata) Object.assign(entry, metadata);
      this.history.push(entry);

      this._nextScroll = 0;
      this._nextTargetScroll = 0;
      this.buildScene(newFrame);

      const shouldSkip = !!(options?.skipAnimation || metadata?.skipAnimation || this._skipColumnAnimation);
      this._skipColumnAnimation = false;

      if (shouldSkip) {
        newFrame.visible = true;
        newFrame.scale = 1.0;
        newFrame.position.x = 0;
        newFrame.position.y = 0;
        newFrame.contentAlpha = 0.0;
        if (curEntry?.frame) curEntry.frame.visible = false;
      } else if (global.TweenOrchestrator?.expandFrame) {
        if (curEntry?.frame) curEntry.frame.visible = true;
        global.TweenOrchestrator.expandFrame(newFrame, originPos, {
          onComplete: () => {
            if (curEntry?.frame) curEntry.frame.visible = false;
          }
        });
      } else {
        newFrame.visible = true;
        if (curEntry?.frame) curEntry.frame.visible = false;
      }
      if (!options?.silent && global.AudioSynth?.playClick) global.AudioSynth.playClick();
      global.BoardRenderer?.render?.();
    }

    popColumn(options = {}) {
      if (!this.active || this.isAnimating()) return;
      this.isPresetDeleteMode = false;
      this._presetDeleteCategory = null;
      const shouldSkip = !!(options?.skipAnimation || this._skipColumnAnimation);
      this._skipColumnAnimation = false;
      if (this.history.length > 1) {
        const closingEntry = this.history.pop();
        if (closingEntry?.title === 'Preset Settings') {
          if (this.activePresetDraft?.previousActiveIndex !== undefined) {
            this.config.activePresetIndex = this.activePresetDraft.previousActiveIndex;
          }
          this.activePresetDraft = null;
        }
        const parentEntry = this.history[this.history.length - 1];
        if (parentEntry?.frame) {
          parentEntry.frame.visible = true;
          parentEntry.frame.scale = 1.0;
          parentEntry.frame.contentAlpha = shouldSkip ? 0.0 : 1.0;
          parentEntry.frame.position.x = 0;
          parentEntry.frame.position.y = 0;
        }
        this._nextScroll = parentEntry?.scroll || 0;
        this._nextTargetScroll = parentEntry?.targetScroll || 0;

        if (!shouldSkip && global.TweenOrchestrator?.collapseFrame && closingEntry?.frame?.visible) {
          global.TweenOrchestrator.collapseFrame(closingEntry.frame, closingEntry.originPos, {
            onComplete: () => {
              if (closingEntry?.frame) {
                closingEntry.frame.visible = false;
                this.containerNode.removeChild(closingEntry.frame);
              }
            }
          });
        } else if (closingEntry?.frame) {
          closingEntry.frame.visible = false;
          this.containerNode.removeChild(closingEntry.frame);
        }
        if (!shouldSkip && !options?.silent && global.AudioSynth?.playClick) global.AudioSynth.playClick();
      }
      global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
      global.BoardRenderer?.render?.();
    }

    buildScene(targetFrame = null) {
      const frame = targetFrame || this.getActiveFrame();
      if (!frame) return;
      frame.children = [];
      if (this.containerNode?.children) {
        this.containerNode.children = this.containerNode.children.filter(
          c => c.id !== 'rename-popup-scrim' && (c.id !== 'rename-popup-frame' || global.GameSettingsRenamePopup?.frameNode?.animating) &&
               c.id !== 'turn-confirm-scrim' && (c.id !== 'turn-confirm-frame' || global.TurnConfirmPopup?.frameNode?.animating)
        );
      }
      if (this.mode === 'pause') {
        if (typeof this.buildPauseScene === 'function') this.buildPauseScene(frame);
      } else if (this.history.length <= 1) {
        if (typeof this.renderRootColumn === 'function') this.renderRootColumn(frame);
      } else {
        this.history[this.history.length - 1].renderFn(frame);
      }
      if (global.GameSettingsRenamePopup?.isOpen?.() || global.GameSettingsRenamePopup?.frameNode?.animating) {
        const pNode = global.GameSettingsRenamePopup.buildNode();
        if (pNode) {
          const idx = this.containerNode.children.indexOf(pNode);
          if (idx !== -1) this.containerNode.children.splice(idx, 1);
          this.containerNode.addChild(pNode);
        }
      }
      if (global.TurnConfirmPopup?.isOpen?.() || global.TurnConfirmPopup?.frameNode?.animating) {
        const cNode = global.TurnConfirmPopup.buildNode();
        if (cNode) {
          const idx = this.containerNode.children.indexOf(cNode);
          if (idx !== -1) this.containerNode.children.splice(idx, 1);
          this.containerNode.addChild(cNode);
        }
      }
      global.BoardRenderer?.render?.();
    }

    setupListContainer(targetFrame = null) {
      const HexNode = global.HexNode, traits = global.HexTraits, self = this, d = this.dims;
      const prevScroll = (this._nextScroll !== undefined) ? this._nextScroll : (this.listTrait ? this.listTrait.scrollOffset : 0);
      const prevTarget = (this._nextTargetScroll !== undefined) ? this._nextTargetScroll : (this.listTrait ? this.listTrait.targetScrollOffset : 0);
      this._nextScroll = undefined;
      this._nextTargetScroll = undefined;

      const frame = targetFrame || this.getActiveFrame();

      this.listContainer = new HexNode({
        id: 'menu-list-container', position: { x: 0, y: 0 },
        wBase: 960, hBase: 800, apex: 220, orientation: 'flat', clipContent: false,
        style: { bgOpacity: 0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
      });

      this.listTrait = new traits.ListTrait({ slotHeight: d.podH, spacing: d.podSpacing, capacity: 4, allowManualScroll: true });
      this.listTrait.scrollOffset = Math.min(0, prevScroll);
      this.listTrait.targetScrollOffset = Math.min(0, prevTarget);
      this.listTrait.layoutChildren = function() {
        if (!this.node || this.node.children.length === 0) return;
        const canvasH = frame?.dimensions?.hBase || 800;
        let curY = -canvasH * 0.5 + 40 + this.scrollOffset;
        for (let i = 0; i < this.node.children.length; i++) {
          const item = this.node.children[i], h = item.dimensions?.hBase || d.podH;
          item.position.x = 0; item.position.y = curY + h * 0.5;
          curY += h + ((i === 0) ? (d.headerSpacing || 20) : d.podSpacing);
        }
        this.node._dirtyGeometry = true;
      };

      this.listTrait.getMaxScroll = function() {
        if (!this.node) return 0;
        const items = this.node.children;
        let totalH = 0;
        for (let i = 0; i < items.length; i++) totalH += (items[i].dimensions?.hBase || d.podH) + ((i === 0) ? (d.headerSpacing || 20) : d.podSpacing);
        totalH -= d.podSpacing;
        const canvasH = frame?.dimensions?.hBase || 800;
        return Math.max(0, totalH - canvasH + 80);
      };

      this.listTrait.handleWheel = function(deltaY) {
        this.scrollBy(-deltaY * 0.6, false);
      };

      this.listContainer.addTrait(this.listTrait);
      this.listContainer.addTrait({
        name: 'scroll-anim',
        render: () => {
          if (self.listTrait && Math.abs(self.listTrait.targetScrollOffset - self.listTrait.scrollOffset) > 0.5) {
            self.listTrait.scrollOffset += (self.listTrait.targetScrollOffset - self.listTrait.scrollOffset) * 0.25;
            self.listTrait.layoutChildren();
            global.BoardRenderer?.render?.();
          }
        }
      });
      frame.addChild(this.listContainer);
    }
  }

  const instance = new GameSettingsCanvasClass();
  global.GameSettingsCanvasClass = GameSettingsCanvasClass;
  global.GameSettingsCanvas = global.CanvasHub = instance;
  (window.ROLL_CALL = window.ROLL_CALL || new Map()).set('Game_Settings_Canvas', instance);
})(window);
