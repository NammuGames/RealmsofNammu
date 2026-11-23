/**
 * @fileoverview cells/Engine_Ticker.js - Deterministic 60Hz Physics & Decoupled Render Loop
 * @description Implements the decoupled accumulator-based fixed 60Hz code/simulation tick,
 * synchronized requestAnimationFrame Canvas 2D/WebGL rendering, and 4Hz silicon profiler telemetry.
 */

(function(global) {
  'use strict';

  class EngineTickerClass {
    constructor() {
      this.state = null;
      this.dom = null;
      this.warp = null;
      this.engine = null;
      this.polyRender = null;
      this.cameraCtrl = null;
      this.deck = null;
      this.deckSync = null;

      this.running = false;
      this.rafId = null;

      this.FIXED_DT = 1.0 / 60.0;
      this.lastTime = 0;
      this.accumulator = 0.0;
      this.lastRenderMs = 0;
      this.frameCount = 0;
      this.lastFpsUpdate = 0;
      this.cpuTimeAvg = 0.85;
      this.lastTelemetryUpdate = 0;
      this._lowFpsStreak = 0;
    }

    init(state, dom, warp, engine, polyRender, cameraCtrl, deck, deckSync) {
      this.state = state;
      this.dom = dom;
      this.warp = warp || global.CosmicDomainWarp;
      this.engine = engine || global.HexUIEngine;
      this.polyRender = polyRender || global.PolyhedronRenderer;
      this.cameraCtrl = cameraCtrl || global.BoardCameraController;
      this.deck = deck || global.UISidebarDeck;
      this.deckSync = deckSync || global.UIDeckSync;
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.lastTime = performance.now();
      this.lastFpsUpdate = this.lastTime;
      this.lastTelemetryUpdate = this.lastTime;
      this.accumulator = 0.0;
      this.frameCount = 0;

      const loop = (now) => {
        if (!this.running) return;
        this.tick(now);
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
    }

    stop() {
      this.running = false;
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }

    tick(now) {
      if (typeof document !== 'undefined' && document.hidden) {
        this.lastTime = now;
        return;
      }
      const state = this.state;
      const dom = this.dom;
      const warp = this.warp;
      const engine = this.engine;
      const polyRender = this.polyRender;
      const cameraCtrl = this.cameraCtrl;
      const deck = this.deck;
      const deckSync = this.deckSync;

      // Mobile / Low-Spec Power Saver: gate JS render to 30 FPS while simulation keeps 60 Hz FIXED_DT
      const isLiteRender = !!(global.DevicePerfProfile?.isLiteMode?.() || ((typeof window !== 'undefined') && (
        window.matchMedia?.('(pointer: coarse)')?.matches ||
        Math.min(window.innerWidth || 999, window.innerHeight || 999) <= 560
      )));
      if (isLiteRender && this.lastRenderMs && (now - this.lastRenderMs) < 32.0) {
        return;
      }

      // Safety clamp on delta time to prevent spiral of death if tab was unfocused
      const dt = Math.min((now - this.lastTime) * 0.001, 0.1);
      this.lastTime = now;
      this.accumulator += dt;

      // 1. Fixed 60Hz Code/Simulation Tick (Deterministic)
      const baseLayerActive = !engine || engine.baseLayerVisible !== false;
      let didTick = false;
      while (this.accumulator >= this.FIXED_DT - 0.0005) {
        state.time += this.FIXED_DT;
        if (baseLayerActive) {
          const spinSpeed = (state.polySpinSpeed !== undefined) ? state.polySpinSpeed : 0.1;
          if (polyRender && typeof polyRender.advanceTime === 'function') {
            polyRender.advanceTime(this.FIXED_DT * spinSpeed);
          }

          if (cameraCtrl) cameraCtrl.update();
          if (deck) deck.updateRightSidebarDeck();
        }
        if (global.TweenOrchestrator) global.TweenOrchestrator.update(this.FIXED_DT);

        this.accumulator = Math.max(0, this.accumulator - this.FIXED_DT);
        didTick = true;
      }

      if (!didTick) return;
      this.lastRenderMs = now;

      // 2. Render Pass
      const frameStart = performance.now();

      // Layer -1: WebGL Cosmic Domain Warp & Stars
      try {
        if (warp) warp.render(state);
      } catch (warpErr) {
        console.warn('CosmicDomainWarp render error:', warpErr);
      }

      // Layers 0 & 1: Canvas 2D Hex UI Scene Graph & Interlocking Frames
      if (dom.canvasBoard && engine) {
        const ctx = engine.ctx || this._ctx2d || (this._ctx2d = dom.canvasBoard.getContext('2d'));
        ctx.clearRect(0, 0, dom.canvasBoard.width, dom.canvasBoard.height);
        try {
          engine.render(ctx);
        } catch (engineErr) {
          console.error('[HexUIEngine render error]:', engineErr);
        }
      }

      const frameEnd = performance.now();
      const cpuFrameMs = frameEnd - frameStart;
      this.cpuTimeAvg = this.cpuTimeAvg * 0.85 + cpuFrameMs * 0.15;

      // FPS Meter (1Hz - only update DOM when dev drawers enabled)
      this.frameCount++;
      if (now - this.lastFpsUpdate >= 1000) {
        const elapsed = now - this.lastFpsUpdate;
        const fps = Math.round((this.frameCount * 1000) / elapsed);
        const avgFrameMs = elapsed / Math.max(1, this.frameCount);
        this.actualFps = fps;
        const perf = global.DevicePerfProfile;
        if (perf && !perf.isLiteMode() && fps > 0 && fps < 38) {
          if (++this._lowFpsStreak >= 3) perf.markRuntimeDowngrade();
        } else {
          this._lowFpsStreak = 0;
        }

        if (global.__NAMMU_DEV_DRAWERS__) {
          if (dom.valFps) dom.valFps.textContent = fps.toString();
          if (dom.lblActualFps) dom.lblActualFps.textContent = `${fps} FPS`;
          if (dom.barActualFps) dom.barActualFps.style.width = `${Math.min(100, Math.max(1, (fps / 120) * 100))}%`;
          if (dom.lblActualInterval) dom.lblActualInterval.textContent = `${avgFrameMs.toFixed(1)} ms`;
        }

        this.frameCount = 0;
        this.lastFpsUpdate = now;
      }

      // 4Hz State Sync + Optional Silicon Telemetry Update
      if (now - this.lastTelemetryUpdate >= 250) {
        this.lastTelemetryUpdate = now;
        if (deckSync && baseLayerActive) {
          deckSync.syncMaterialsTrayWithGameState();
          deckSync.syncNativeStatPodWithGameState();
        }
        if (!global.__NAMMU_DEV_DRAWERS__) return;

        // 1. CPU Telemetry
        const cpuLoadPct = Math.min(100, (this.cpuTimeAvg / 16.666) * 100);
        const cpuHeadroomPct = Math.max(0, 100 - cpuLoadPct);
        const cpuCapFps = Math.round(1000 / Math.max(this.cpuTimeAvg, 0.001));

        if (dom.valCpuHud) dom.valCpuHud.textContent = `${this.cpuTimeAvg.toFixed(1)}ms`;
        if (dom.lblCpuTime) dom.lblCpuTime.textContent = `${this.cpuTimeAvg.toFixed(3)} ms / 16.7 ms`;
        if (dom.lblCpuLoad) dom.lblCpuLoad.textContent = `${cpuLoadPct.toFixed(1)}% Used (${cpuHeadroomPct.toFixed(1)}% Free)`;
        if (dom.barCpuLoad) dom.barCpuLoad.style.width = `${Math.max(1, cpuLoadPct)}%`;
        if (dom.lblCpuFps) dom.lblCpuFps.textContent = `~${cpuCapFps.toLocaleString()} FPS`;

        // 2. GPU Telemetry
        const gpuTime = (warp && warp.gpuTimeMs) ? warp.gpuTimeMs : 0.85;
        const gpuLoadPct = Math.min(100, (gpuTime / 16.666) * 100);
        const gpuHeadroomPct = Math.max(0, 100 - gpuLoadPct);
        const gpuCapFps = Math.round(1000 / Math.max(gpuTime, 0.001));

        if (dom.valGpuHud) dom.valGpuHud.textContent = `${gpuTime.toFixed(1)}ms`;
        if (dom.lblGpuTime) dom.lblGpuTime.textContent = `~${gpuTime.toFixed(3)} ms / 16.7 ms`;
        if (dom.lblGpuLoad) dom.lblGpuLoad.textContent = `~${gpuLoadPct.toFixed(1)}% Used (${gpuHeadroomPct.toFixed(1)}% Free)`;
        if (dom.barGpuLoad) dom.barGpuLoad.style.width = `${Math.max(1, gpuLoadPct)}%`;
        if (dom.lblGpuFps) dom.lblGpuFps.textContent = `~${gpuCapFps.toLocaleString()} FPS`;
        if (dom.lblGpuMethod) dom.lblGpuMethod.textContent = (warp && warp.gpuTimerMode) ? warp.gpuTimerMode : 'Hardware Silicon Query';

        // 3. System RAM Heap Telemetry
        let ramUsedMB = 0;
        let ramTotalMB = 2048;
        let ramPct = 0;
        if (performance && performance.memory) {
          ramUsedMB = performance.memory.usedJSHeapSize / (1024 * 1024);
          ramTotalMB = Math.round(performance.memory.jsHeapSizeLimit / (1024 * 1024));
          ramPct = Math.min(100, Math.max(0, (ramUsedMB / ramTotalMB) * 100));
        } else {
          ramUsedMB = 48.5 + (state.sidebarBtnCount * 1.8);
          ramPct = (ramUsedMB / ramTotalMB) * 100;
        }
        if (dom.valRamHud) dom.valRamHud.textContent = `${Math.round(ramUsedMB)}MB`;
        if (dom.lblRamVal) dom.lblRamVal.textContent = `${ramUsedMB.toFixed(1)} MB / ${ramTotalMB} MB (${ramPct.toFixed(1)}%)`;
        if (dom.barRam) dom.barRam.style.width = `${Math.min(100, Math.max(1, ramPct))}%`;

        // 4. Dedicated VRAM Telemetry
        const warpVram = (warp && typeof warp.getVramAllocMB === 'function') ? warp.getVramAllocMB() : 12.0;
        const loopCacheVram = (polyRender?.loopCache && typeof polyRender.loopCache.getVramAllocMB === 'function')
          ? polyRender.loopCache.getVramAllocMB() : 0;
        const atlas = global.HexFrameAtlas;
        const atlasVram = (atlas && typeof atlas.getVramAllocMB === 'function') ? atlas.getVramAllocMB() : 0;
        const canvas2dVram = dom.canvasBoard ? (dom.canvasBoard.width * dom.canvasBoard.height * 4) / (1024 * 1024) : 0;
        const vramTotalAllocMB = warpVram + canvas2dVram + loopCacheVram + atlasVram;
        const vramBudgetMB = 2048;
        const vramPct = (vramTotalAllocMB / vramBudgetMB) * 100;

        if (dom.valVramHud) dom.valVramHud.textContent = `${vramTotalAllocMB.toFixed(1)}MB`;
        if (dom.lblVramVal) dom.lblVramVal.textContent = `${vramTotalAllocMB.toFixed(1)} MB / ${vramBudgetMB} MB (${vramPct.toFixed(1)}%)`;
        if (dom.barVram) dom.barVram.style.width = `${Math.min(100, Math.max(1, vramPct))}%`;
      }
    }
  }

  const instance = new EngineTickerClass();
  global.EngineTicker = instance;
  if (global.ROLL_CALL) global.ROLL_CALL.set('Engine_Ticker', instance);

})(typeof window !== 'undefined' ? window : this);
