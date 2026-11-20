/**
 * @fileoverview cells/Board_Camera_Controller.js - Board Camera Pan, Zoom & Viewport Controller
 * @description Manages camera dragging, wheel zooming, pan/zoom exponential smoothing,
 * camera reset actions, and responsive canvas resizing with WebGL warp render scaling.
 */

(function(global) {
  'use strict';

  class BoardCameraControllerClass {
    constructor() {
      this.state = null;
      this.dom = null;
      this.engine = null;
      this.audio = null;
    }

    init(state, dom, engine, audio) {
      this.state = state;
      this.dom = dom;
      this.engine = engine;
      this.audio = audio || global.AudioSynth;

      this.initDragAndZoom();
      this.initResetButton();
      this.initResizeListener();
    }

    initDragAndZoom() {
      const { canvasBoard, viewport } = this.dom;
      const state = this.state;
      const engine = this.engine;

      if (!canvasBoard || !viewport) return;

      const toBackingPos = (clientX, clientY) => {
        const rect = canvasBoard.getBoundingClientRect();
        const sx = rect.width > 0 ? (canvasBoard.width / rect.width) : 1;
        const sy = rect.height > 0 ? (canvasBoard.height / rect.height) : 1;
        return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
      };

      const getStageScale = () => global.ResponsiveViewportAdapter?.stageScale || engine?.stageScale || 1.0;
      const isSyntheticMouse = (e) => !!e?.sourceCapabilities?.firesTouchEvents || (performance.now() - (global.__LAST_CANVAS_TOUCH_MS || -9999) < 700);

      canvasBoard.addEventListener('mousedown', (e) => {
        if (isSyntheticMouse(e) || state.cameraLocked) return;
        const pos = toBackingPos(e.clientX, e.clientY);
        const hit = engine.hitTestNode(engine.root, pos.x, pos.y);
        if (hit === engine.boardFrame || hit === engine.root) {
          state.isDraggingBoard = true;
          state.lastMouseX = e.clientX;
          state.lastMouseY = e.clientY;
          viewport.style.cursor = 'grabbing';
        }
      });

      window.addEventListener('mousemove', (e) => {
        if (isSyntheticMouse(e) || !state.isDraggingBoard || state.cameraLocked) return;
        const sc = getStageScale();
        const dx = (e.clientX - state.lastMouseX) / sc;
        const dy = (e.clientY - state.lastMouseY) / sc;
        state.targetPanX += dx;
        state.targetPanY += dy;
        state.lastMouseX = e.clientX;
        state.lastMouseY = e.clientY;
      });

      window.addEventListener('mouseup', (e) => {
        if (isSyntheticMouse(e)) return;
        if (state.isDraggingBoard) {
          state.isDraggingBoard = false;
          viewport.style.cursor = 'default';
        }
      });

      let touchPanActive = false;
      let touchLastX = 0;
      let touchLastY = 0;
      let pinchActive = false;
      let pinchStartDist = 0;
      let pinchStartZoom = 1.0;
      let pinchMidX = 0;
      let pinchMidY = 0;

      const isBoardHit = (t) => {
        const pos = toBackingPos(t.clientX, t.clientY);
        const hit = engine.hitTestNode(engine.root, pos.x, pos.y);
        return hit === engine.boardFrame || hit === engine.root;
      };

      canvasBoard.addEventListener('touchstart', (e) => {
        if (state.cameraLocked || global.InputController?.isAnyCanvasOpen?.()) return;
        if (e.touches.length === 2) {
          const t0 = e.touches[0], t1 = e.touches[1];
          if (!isBoardHit(t0) && !isBoardHit(t1)) return;
          touchPanActive = false;
          pinchActive = true;
          pinchStartDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
          pinchStartZoom = global.BoardRenderer?.targetZoom ?? state.targetZoom ?? 1.0;
          pinchMidX = (t0.clientX + t1.clientX) * 0.5;
          pinchMidY = (t0.clientY + t1.clientY) * 0.5;
          global.__LAST_CANVAS_TOUCH_MS = performance.now();
          global.__LAST_BOARD_PINCH_MS = performance.now();
          if (engine) engine.pressedNode = null;
          if (e.cancelable) e.preventDefault();
          return;
        }
        if (e.touches.length !== 1) { touchPanActive = false; return; }
        const t = e.touches[0];
        if (isBoardHit(t)) {
          touchPanActive = true;
          touchLastX = t.clientX;
          touchLastY = t.clientY;
        }
      }, { passive: false });

      window.addEventListener('touchmove', (e) => {
        if (state.cameraLocked) return;
        if (pinchActive && e.touches.length === 2) {
          if (e.cancelable) e.preventDefault();
          const t0 = e.touches[0], t1 = e.touches[1];
          const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
          const midX = (t0.clientX + t1.clientX) * 0.5;
          const midY = (t0.clientY + t1.clientY) * 0.5;
          const sc = getStageScale();
          if (pinchStartDist > 10 && dist > 10) {
            const nextZoom = pinchStartZoom * (dist / pinchStartDist);
            if (global.BoardRenderer?.setZoom) global.BoardRenderer.setZoom(nextZoom, 0, 0);
            else state.targetZoom = Math.max(0.4, Math.min(2.5, nextZoom));
          }
          state.targetPanX += (midX - pinchMidX) / sc;
          state.targetPanY += (midY - pinchMidY) / sc;
          pinchMidX = midX;
          pinchMidY = midY;
          global.__LAST_BOARD_PINCH_MS = performance.now();
          return;
        }
        if (!touchPanActive || e.touches.length !== 1) return;
        const t = e.touches[0];
        const sc = getStageScale();
        state.targetPanX += (t.clientX - touchLastX) / sc;
        state.targetPanY += (t.clientY - touchLastY) / sc;
        touchLastX = t.clientX;
        touchLastY = t.clientY;
      }, { passive: false });

      const endTouchGestures = (e) => {
        const count = e?.touches ? e.touches.length : 0;
        if (count < 2) pinchActive = false;
        if (count === 0) touchPanActive = false;
        else if (count === 1) {
          // Avoid sudden jump when lifting one finger out of a pinch
          touchPanActive = false;
        }
      };
      window.addEventListener('touchend', endTouchGestures, { passive: true });
      window.addEventListener('touchcancel', endTouchGestures, { passive: true });
    }

    initResetButton() {
      const { btnResetCam } = this.dom;
      const state = this.state;

      if (btnResetCam) {
        btnResetCam.addEventListener('click', () => {
          if (global.BoardRenderer) {
            global.BoardRenderer.resetCamera();
          } else {
            state.targetPanX = 0;
            state.targetPanY = 0;
            state.targetZoom = 1.0;
          }
          if (this.audio) this.audio.playClick();
        });
      }
    }

    initResizeListener() {
      const { canvasWarp, canvasBoard, sliderFrameW, sliderFrameH, sliderFrameApex, valFrameW, valFrameH, valFrameApex, lblFrameFootprint } = this.dom;
      const state = this.state;
      const engine = this.engine;

      const resize = () => {
        if (global.ResponsiveViewportAdapter?._initialized) {
          global.ResponsiveViewportAdapter.syncViewport();
        } else {
          const w = window.innerWidth;
          const h = window.innerHeight;
          const isPortrait = h > w;

          const warpScale = state.warpRenderScale || 0.75;
          if (canvasWarp) {
            canvasWarp.width = Math.round(w * warpScale);
            canvasWarp.height = Math.round(h * warpScale);
          }

          const gameW = isPortrait ? h : w;
          const gameH = isPortrait ? w : h;

          if (canvasBoard) {
            canvasBoard.width = gameW;
            canvasBoard.height = gameH;
            if (isPortrait) canvasBoard.classList.add('portrait-mode');
            else canvasBoard.classList.remove('portrait-mode');
          }

          if (engine) {
            engine.isPortrait = isPortrait;
            engine.resize(gameW, gameH);
          }
          if (global.NativeStatPod?.resize) global.NativeStatPod.resize(gameW, gameH);
        }

        const studio = global.SigilEmblemStudio;
        if (studio && (!studio.containerNode || !studio.containerNode.isCustomSized)) {
          state.frameW = 900;
          state.frameH = 790;
          state.frameApex = 250;
          state.frameOrientation = 'flat';
          if (sliderFrameW) sliderFrameW.value = state.frameW;
          if (sliderFrameH) sliderFrameH.value = state.frameH;
          if (sliderFrameApex) sliderFrameApex.value = state.frameApex;
          if (valFrameW) valFrameW.textContent = `${state.frameW} px`;
          if (valFrameH) valFrameH.textContent = `${state.frameH} px`;
          if (valFrameApex) valFrameApex.textContent = `+${state.frameApex} px`;
          if (lblFrameFootprint) lblFrameFootprint.textContent = `1400 × 790 px`;
        }
      };

      window.addEventListener('resize', resize);
      resize();
    }

    /**
     * Camera lerp interpolation is unified inside Board_Renderer.renderInsideFrame.
     */
    update() {}
  }

  const instance = new BoardCameraControllerClass();
  global.BoardCameraController = instance;
  if (global.ROLL_CALL) global.ROLL_CALL.set('Board_Camera_Controller', instance);

})(typeof window !== 'undefined' ? window : this);
