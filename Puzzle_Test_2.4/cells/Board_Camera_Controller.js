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

      canvasBoard.addEventListener('mousedown', (e) => {
        if (state.cameraLocked) return;
        const rect = canvasBoard.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        const hit = engine.hitTestNode(engine.root, sx, sy);
        if (hit === engine.boardFrame || hit === engine.root) {
          state.isDraggingBoard = true;
          state.lastMouseX = sx;
          state.lastMouseY = sy;
          viewport.style.cursor = 'grabbing';
        }
      });

      window.addEventListener('mousemove', (e) => {
        if (!state.isDraggingBoard || state.cameraLocked) return;
        const rect = canvasBoard.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const dx = sx - state.lastMouseX;
        const dy = sy - state.lastMouseY;
        state.targetPanX += dx;
        state.targetPanY += dy;
        state.lastMouseX = sx;
        state.lastMouseY = sy;
      });

      window.addEventListener('mouseup', () => {
        if (state.isDraggingBoard) {
          state.isDraggingBoard = false;
          viewport.style.cursor = 'default';
        }
      });
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
