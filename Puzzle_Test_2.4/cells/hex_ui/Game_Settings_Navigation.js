/**
 * @fileoverview cells/hex_ui/Game_Settings_Navigation.js - Column Stack, Scene Mount & Scroll Container
 * @description Attaches hierarchical column stack navigation (pushColumn, popColumn, popToRoot),
 * scene building (buildScene), and scrollable ListTrait container setup (setupListContainer) onto
 * GameSettingsCanvasClass. Loads immediately after Game_Settings_Canvas_1.0.js.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const Proto = global.GameSettingsCanvasClass
    ? global.GameSettingsCanvasClass.prototype
    : (global.GameSettingsCanvas ? Object.getPrototypeOf(global.GameSettingsCanvas) : null);
  if (!Proto) return;

  Proto.pushColumn = function(title, renderFn, metadata, originNode = null, options = {}) {
    if (!this.active || this.isAnimating()) return;
    this.clearPendingDeletions?.();
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
  };

  Proto.popColumn = function(options = {}) {
    if (!this.active || this.isAnimating()) return;
    this.clearPendingDeletions?.();
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
      this._nextScroll = parentEntry?.scroll || 0;
      this._nextTargetScroll = parentEntry?.targetScroll || 0;
      if (parentEntry?.frame) {
        parentEntry.frame.visible = true;
        parentEntry.frame.scale = 1.0;
        parentEntry.frame.contentAlpha = shouldSkip ? 0.0 : 1.0;
        parentEntry.frame.position.x = 0;
        parentEntry.frame.position.y = 0;
        this.buildScene(parentEntry.frame);
      }

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
  };

  Proto.popToRoot = function(options = {}) {
    if (!this.active || this.isAnimating() || this.history.length <= 1) return;
    while (this.history.length > 2) {
      const mid = this.history.splice(1, 1)[0];
      if (mid?.frame) {
        mid.frame.visible = false;
        this.containerNode.removeChild(mid.frame);
      }
    }
    this.popColumn(options);
    if (this.history[0]?.frame) {
      this.history[0].frame.contentAlpha = 1.0;
      this.buildScene(this.history[0].frame);
    }
  };

  Proto.buildScene = function(targetFrame = null) {
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
  };

  Proto.setupListContainer = function(targetFrame = null) {
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
      this.clampScroll?.();
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
  };

  (window.ROLL_CALL = window.ROLL_CALL || new Map()).set('Game_Settings_Navigation', global.GameSettingsCanvas);
})(typeof window !== 'undefined' ? window : this);
