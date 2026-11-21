/**
 * @fileoverview cells/Hub_Launch_Staging.js - Staged 4-Step Hidden-Loading Transition Orchestrator
 * @description Coordinates the sequential Hub -> Puzzle launch experience:
 * 1. Opens a Hub Description Pop-Up (with "Enter" button) while preloading Puzzle scripts in background.
 * 2. Fades out Hub/Pop-Up and expands lightweight empty Puzzle frame shells into position.
 * 3. Mounts real Puzzle UI with contents hidden and cross-fades live UI over the open shells.
 * 4. Automatically expands the Game Menu (GameSettingsCanvas) as the final step.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const WRAP_LINES = [
    'Draft crystalline tetrahexes onto a mirrored cosmos,',
    'fuse sacred triangular Sigils, unleash elemental spells,',
    'and hold back the spreading Blight across solo or online arenas.'
  ];

  class HubLaunchStagingClass {
    constructor() {
      this.isRunning = false;
      this.scrimNode = null;
      this.popupNode = null;
      this.enterBtn = null;
      this.preloadState = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'
      this.preloadPct = 0;
      this.enterQueued = false;
      this._preloadPromise = null;
      this._hubCore = null;
      this._originNode = null;
      this._shellTop = null;
      this._shellBot = null;
    }

    startPuzzleSequence(hubCore, originNode) {
      if (this.isRunning || (this.popupNode && this.popupNode.parent)) return;
      const engine = hubCore?.ctx?.engine || global.HexUIEngine;
      const loader = hubCore?.ctx?.loader || global.HubGameLoader;
      if (!engine || !loader || !global.HexNode || !global.HexTraits) return;

      this._hubCore = hubCore;
      this._originNode = originNode || hubCore.branchNodes?.[1];
      this.enterQueued = false;
      this.preloadState = 'loading';
      this.preloadPct = 0;

      this._lockHubButtons(hubCore, true);
      this._beginBackgroundPreload(loader);
      this._openDescriptionPopup(hubCore, engine);
    }

    _lockHubButtons(hubCore, locked) {
      const setLocked = (n) => { const b = n?.getTrait?.('button'); if (b) b.disabled = locked; };
      setLocked(hubCore?.rootNode);
      hubCore?.branchNodes?.forEach(setLocked);
    }

    _beginBackgroundPreload(loader) {
      this.preloadState = 'loading';
      this.preloadPct = 0;
      this._preloadPromise = loader.preloadGame('puzzle', (done, total) => {
        this.preloadPct = Math.round((done / Math.max(1, total)) * 100);
        this._syncEnterButtonLabel();
      }).then((ok) => {
        this.preloadState = ok ? 'ready' : 'error';
        if (ok) this.preloadPct = 100;
        this._syncEnterButtonLabel();
        return ok;
      }).catch(() => {
        this.preloadState = 'error';
        this._syncEnterButtonLabel();
        return false;
      });
    }

    _syncEnterButtonLabel() {
      const txt = this.enterBtn?.getTrait?.('text');
      if (!txt) return;
      if (this.preloadState === 'error') {
        txt.title = 'Retry';
        txt.subtitle = '';
      } else if (this.enterQueued) {
        txt.title = 'Entering...';
        txt.subtitle = this.preloadState === 'loading' ? `${this.preloadPct}%` : '';
      } else {
        txt.title = 'Enter';
        txt.subtitle = '';
      }
    }

    _openDescriptionPopup(hubCore, engine) {
      const HexNode = global.HexNode;
      const { ButtonTrait, TextTrait } = global.HexTraits;
      const stageNode = hubCore.stageNode;
      if (!stageNode) return;

      const scrim = new HexNode({
        id: 'hub-preview-scrim',
        position: { x: 0, y: 0 },
        wBase: 3200, hBase: 2000, apex: 0, orientation: 'flat',
        style: { bgColor: '#000000', bgOpacity: 0.52, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
      });
      scrim.addTrait(new ButtonTrait({
        hoverOutline: false, soundClick: false,
        onClick: () => { if (!this.isRunning && !this.enterQueued) this._closePreviewPopup(); }
      }));

      const popup = new HexNode({
        id: 'hub-preview-popup',
        position: { x: 0, y: 0 },
        wBase: 760, hBase: 460, apex: 140, orientation: 'flat', clipContent: true,
        style: {
          bgColor: 'rgba(5, 10, 20, 1.0)', bgOpacity: 1.0,
          innerHighlight: { enabled: true, color: '#10f000', sharpEdgeColor: '#10f000', spread: 8, intensity: 0.80, steps: 3 },
          outerHighlight: { enabled: false }
        }
      });
      popup.isCustomSized = true;
      popup.addTrait(new ButtonTrait({ hoverOutline: false, soundClick: false }));

      const self = this;
      popup.addTrait({
        name: 'hub-preview-content',
        render(ctx) {
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          ctx.font = '700 30px "Orbitron", "Inter", sans-serif';
          ctx.fillStyle = '#f8fafc';
          ctx.fillText('HEX FLOWER PUZZLE', 0, -148);

          ctx.font = '500 18px "Inter", "Orbitron", sans-serif';
          ctx.fillStyle = '#cbd5e1';
          WRAP_LINES.forEach((line, i) => ctx.fillText(line, 0, -68 + i * 32));

          ctx.font = '600 13px "Orbitron", "Inter", sans-serif';
          if (self.preloadState === 'error') {
            ctx.fillStyle = '#f87171';
            ctx.fillText('Failed to load game modules — tap Retry', 0, 52);
          } else if (self.preloadState === 'ready') {
            ctx.fillStyle = '#4ade80';
            ctx.fillText('Arena Ready', 0, 52);
          } else {
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(`Preparing Arena... ${self.preloadPct}%`, 0, 52);
          }
          ctx.restore();
        }
      });

      const enterBtn = new HexNode({
        id: 'hub-preview-enter-btn',
        position: { x: 0, y: 132 },
        wBase: 220, hBase: 76, apex: 26, orientation: 'flat',
        style: {
          bgColor: 'rgba(8, 22, 20, 1.0)', bgOpacity: 1.0,
          innerHighlight: { enabled: true, color: '#10f000', sharpEdgeColor: '#10f000', spread: 8, intensity: 0.80, steps: 3 },
          outerHighlight: { enabled: false }
        }
      });
      enterBtn.isSidebarButton = true;
      enterBtn.addTrait(new TextTrait({
        title: 'Enter', titleSize: 22, titleColor: '#f8fafc', fontFamily: '"Orbitron", "Inter", sans-serif'
      }));
      enterBtn.addTrait(new ButtonTrait({
        hoverGlowColor: '#ff9214',
        onClick: () => self._onEnterClicked()
      }));

      popup.addChild(enterBtn);
      stageNode.addChild(scrim);
      stageNode.addChild(popup);
      stageNode.updateTransforms();

      this.scrimNode = scrim;
      this.popupNode = popup;
      this.enterBtn = enterBtn;
      this._syncEnterButtonLabel();

      if (global.TweenOrchestrator?.expandFrame) {
        global.TweenOrchestrator.expandFrame(popup, this._originNode || 'hub-branch-puzzle');
      } else {
        popup.visible = true;
      }
      engine.root?.updateTransforms();
    }

    _closePreviewPopup() {
      const hubCore = this._hubCore;
      const stageNode = hubCore?.stageNode;
      const popup = this.popupNode;
      const scrim = this.scrimNode;
      if (!popup || popup.animating) return;

      const finishClose = () => {
        if (scrim && scrim.parent === stageNode) stageNode.removeChild(scrim);
        if (popup && popup.parent === stageNode) stageNode.removeChild(popup);
        this.scrimNode = null;
        this.popupNode = null;
        this.enterBtn = null;
        if (hubCore) {
          hubCore.stage = 'idle_crown';
          this._lockHubButtons(hubCore, false);
        }
      };

      if (global.TweenOrchestrator?.collapseFrame && popup.visible) {
        global.TweenOrchestrator.collapseFrame(popup, this._originNode || 'hub-branch-puzzle', { onComplete: finishClose });
      } else {
        finishClose();
      }
    }

    _onEnterClicked() {
      if (this.isRunning) return;
      const loader = this._hubCore?.ctx?.loader || global.HubGameLoader;
      if (this.preloadState === 'error' && loader) {
        this._beginBackgroundPreload(loader);
        this._syncEnterButtonLabel();
        return;
      }
      if (this.enterQueued) return;
      this.enterQueued = true;
      this._syncEnterButtonLabel();
      this._executeStagedSequence();
    }

    async _executeStagedSequence() {
      if (this.isRunning) return;
      this.isRunning = true;

      const hubCore = this._hubCore;
      const ctx = hubCore?.ctx || {};
      const engine = ctx.engine || global.HexUIEngine;
      const loader = ctx.loader || global.HubGameLoader;
      const meta = loader?.games?.get('puzzle');

      try {
        await this._fadeOutHubAndPopup(hubCore);
        const shellExpandPromise = this._expandSimpleShellFrames(engine);
        const [loadOk] = await Promise.all([this._preloadPromise, shellExpandPromise]);

        if (!loadOk || !meta) {
          this._teardownShellFrames(engine);
          this._recoverToHub(hubCore);
          return;
        }

        const ok = await loader.launchGame('puzzle', {
          skipAutoMenu: true,
          onBeforeMount: () => {}
        });
        if (!ok) {
          this._teardownShellFrames(engine);
          this._recoverToHub(hubCore);
          return;
        }

        this._shellTop = null;
        this._shellBot = null;
        await this._fadeInRealPuzzleUI(engine);

        this.isRunning = false;
        this.enterQueued = false;
        global.GameSettingsCanvas?.openSetupMenu?.('btn-nav-menu', { silent: true });
      } catch (err) {
        console.error('[Hub_Launch_Staging] Staged launch failed:', err);
        this._teardownShellFrames(engine);
        this._recoverToHub(hubCore);
      }
    }

    _fadeOutHubAndPopup(hubCore) {
      const tweens = global.TweenOrchestrator;
      const cleanup = () => {
        const stageNode = hubCore?.stageNode;
        if (this.scrimNode && this.scrimNode.parent === stageNode) stageNode.removeChild(this.scrimNode);
        if (this.popupNode && this.popupNode.parent === stageNode) stageNode.removeChild(this.popupNode);
        this.scrimNode = null;
        this.popupNode = null;
        this.enterBtn = null;
        if (hubCore) {
          hubCore.uiAlpha = 0.0;
          hubCore.unmount();
        }
      };

      if (!tweens?.add || !hubCore) {
        cleanup();
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        const beatMs = (global.H_TIMING?.BEAT_SEC || 0.302718) * 1000;
        tweens.add({
          id: 'hub_stage_fade_out',
          from: 1.0,
          to: 0.0,
          duration: Math.round(beatMs * 1.1),
          easing: 'easeInOutQuad',
          onUpdate: (val) => {
            hubCore.uiAlpha = val;
            if (hubCore.rootNode) hubCore.rootNode.alpha = val;
            hubCore.branchNodes?.forEach((b) => { b.alpha = val; });
            if (this.scrimNode) this.scrimNode.alpha = val;
            if (this.popupNode) this.popupNode.alpha = val;
          },
          onComplete: () => {
            cleanup();
            resolve();
          }
        });
      });
    }

    _expandSimpleShellFrames(engine) {
      const HexNode = global.HexNode;
      if (!engine || !HexNode) return Promise.resolve();

      engine.boardRenderDelegate = null;
      engine.boardContentAlpha = 0.0;
      if (engine.leftSidebar) { engine.leftSidebar.visible = true; engine.leftSidebar.contentAlpha = 0.0; }
      if (engine.rightSidebar) { engine.rightSidebar.visible = true; engine.rightSidebar.contentAlpha = 0.0; }
      if (engine.boardFrame) { engine.boardFrame.visible = true; }

      const makeShellPod = (id, wBase) => new HexNode({
        id, wBase, hBase: 72, apex: 22, orientation: 'flat', clipContent: false,
        style: {
          bgColor: 'rgba(7, 12, 24, 0.93)', bgOpacity: 1.0,
          innerHighlight: { enabled: true, color: '#10f000', sharpEdgeColor: '#10f000', spread: 8, intensity: 0.80, lineWidth: 1.4, steps: 3 },
          outerHighlight: { enabled: false }
        }
      });

      this._shellTop = makeShellPod('shell-top-stat-pod', 1354);
      this._shellBot = makeShellPod('shell-bot-stat-pod', 872);
      engine.setTopPod(this._shellTop);
      engine.setBottomPod(this._shellBot);

      const vw = engine.viewWidth || 1920;
      const vh = engine.viewHeight || 880;
      engine.resize(vw, vh);

      const targetLeftX = engine.leftSidebar ? engine.leftSidebar.position.x : 120;
      const targetRightX = engine.rightSidebar ? engine.rightSidebar.position.x : (vw - 120);
      this._shellTop.position.x = vw * 0.5;
      this._shellTop.position.y = 42;
      this._shellBot.position.x = vw * 0.5;
      this._shellBot.position.y = vh - 42;

      const tweens = global.TweenOrchestrator;
      if (!tweens?.add) {
        engine.root?.updateTransforms();
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        const beatMs = (global.H_TIMING?.BEAT_SEC || 0.302718) * 1000;
        tweens.add({
          id: 'puzzle_shell_expand',
          from: 0.0,
          to: 1.0,
          duration: Math.round(beatMs * 1.5),
          easing: 'easeOutCubic',
          onUpdate: (t) => {
            if (engine.boardFrame) {
              engine.boardFrame.scale = 0.14 + 0.86 * t;
              engine.boardFrame.alpha = Math.min(1.0, t * 1.6);
            }
            if (engine.leftSidebar) {
              engine.leftSidebar.position.x = -160 + (targetLeftX + 160) * t;
              engine.leftSidebar.alpha = t;
            }
            if (engine.rightSidebar) {
              engine.rightSidebar.position.x = (vw + 160) + (targetRightX - (vw + 160)) * t;
              engine.rightSidebar.alpha = t;
            }
            if (this._shellTop) {
              this._shellTop.position.y = -72 + (42 + 72) * t;
              this._shellTop.alpha = t;
            }
            if (this._shellBot) {
              this._shellBot.position.y = (vh + 72) + ((vh - 42) - (vh + 72)) * t;
              this._shellBot.alpha = t;
            }
            engine.root?.updateTransforms();
          },
          onComplete: () => {
            if (engine.boardFrame) { engine.boardFrame.scale = 1.0; engine.boardFrame.alpha = 1.0; }
            if (engine.leftSidebar) { engine.leftSidebar.position.x = targetLeftX; engine.leftSidebar.alpha = 1.0; }
            if (engine.rightSidebar) { engine.rightSidebar.position.x = targetRightX; engine.rightSidebar.alpha = 1.0; }
            if (this._shellTop) { this._shellTop.position.y = 42; this._shellTop.alpha = 1.0; }
            if (this._shellBot) { this._shellBot.position.y = vh - 42; this._shellBot.alpha = 1.0; }
            engine.root?.updateTransforms();
            resolve();
          }
        });
      });
    }

    _fadeInRealPuzzleUI(engine) {
      const setContentAlpha = (a) => {
        if (!engine) return;
        engine.boardContentAlpha = a;
        if (engine.leftSidebar) engine.leftSidebar.contentAlpha = a;
        if (engine.rightSidebar) engine.rightSidebar.contentAlpha = a;
        if (engine.topPod) engine.topPod.contentAlpha = a;
        if (engine.bottomPod) engine.bottomPod.contentAlpha = a;
      };
      setContentAlpha(0.0);

      const tweens = global.TweenOrchestrator;
      if (!tweens?.add) {
        setContentAlpha(1.0);
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        const beatMs = (global.H_TIMING?.BEAT_SEC || 0.302718) * 1000;
        tweens.add({
          id: 'puzzle_ui_content_fade_in',
          from: 0.0,
          to: 1.0,
          duration: Math.round(beatMs * 1.15),
          easing: 'easeOutCubic',
          onUpdate: (val) => setContentAlpha(val),
          onComplete: () => {
            setContentAlpha(1.0);
            resolve();
          }
        });
      });
    }

    _teardownShellFrames(engine) {
      if (!engine) return;
      if (engine.boardFrame) { engine.boardFrame.visible = false; engine.boardFrame.scale = 1.0; engine.boardFrame.alpha = 1.0; }
      if (engine.leftSidebar) { engine.leftSidebar.visible = false; engine.leftSidebar.alpha = 1.0; engine.leftSidebar.contentAlpha = 1.0; }
      if (engine.rightSidebar) { engine.rightSidebar.visible = false; engine.rightSidebar.alpha = 1.0; engine.rightSidebar.contentAlpha = 1.0; }
      if (this._shellTop && engine.topPod === this._shellTop) engine.setTopPod(null);
      if (this._shellBot && engine.bottomPod === this._shellBot) engine.setBottomPod(null);
      engine.boardContentAlpha = 1.0;
      this._shellTop = null;
      this._shellBot = null;
    }

    _recoverToHub(hubCore) {
      this.isRunning = false;
      this.enterQueued = false;
      if (!hubCore) return;
      hubCore.mount(hubCore.ctx, { skipIntro: true });
      const txt = hubCore.branchNodes?.[1]?.getTrait?.('text');
      if (txt) txt.subtitle = 'Tap To Retry';
      this._lockHubButtons(hubCore, false);
    }
  }

  const instance = new HubLaunchStagingClass();
  global.HubLaunchStaging = instance;
  global.ROLL_CALL = global.ROLL_CALL || new Map();
  global.ROLL_CALL.set('Hub_Launch_Staging', instance);
})(typeof window !== 'undefined' ? window : this);
