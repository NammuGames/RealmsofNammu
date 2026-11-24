/**
 * @fileoverview cells/Hub_Game_Loader.js - On-Demand Dynamic Game Loader & Lifecycle Manager (Group E)
 * @description Loads individual game modules from their respective subfolders via sequential
 * <script> injection on demand (zero iframes, zero upfront loading of unused games), and passes
 * shared Hub systems (CosmicDomainWarp, EngineTicker, HexUIEngine, AudioSynth) into each game's mount().
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  class HubGameLoaderClass {
    constructor() {
      this.hubContext = null;
      this.games = new Map();
      this.loadedScripts = new Map();
      this._preloadPromises = new Map();
      this._preparePromises = new Map();
      this.preparedGames = new Set();
      this._progressSubs = new Map();
      this.activeGameId = null;
      this.isLoading = false;
      this.onReturnToHub = null;
      this.onGameMounted = null;
    }

    /**
     * Binds the shared root Hub runtime context passed to games on mount.
     * @param {Object} ctx
     */
    init(ctx = {}) {
      this.hubContext = ctx;
      this.registerDefaults();
      return true;
    }

    /** Registers built-in Nammu Games entries. */
    registerDefaults() {
      this.registerGame('puzzle', {
        id: 'puzzle',
        title: 'Hex Flower Puzzle',
        basePath: 'Puzzle_Test_2.4/',
        entryScript: 'Puzzle_Test_2.4/game_entry.js'
      });
    }

    /**
     * Registers or updates a game entry in the Hub manifest.
     * @param {string} id
     * @param {Object} meta
     */
    registerGame(id, meta) {
      if (!id || !meta) return;
      this.games.set(id, Object.assign({ id }, meta));
    }

    /**
     * Loads a single script once and caches the resolved Promise.
     * @param {string} src
     * @returns {Promise<string>}
     */
    loadScript(src, optional = false) {
      if (!src) return Promise.reject(new Error('HubGameLoader: Empty script path.'));
      if (this.loadedScripts.has(src)) return this.loadedScripts.get(src);

      const attemptLoad = (retriesLeft) => new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.async = false;
        el.onload = () => resolve(src);
        el.onerror = () => {
          el.remove();
          if (retriesLeft > 0) {
            setTimeout(() => attemptLoad(retriesLeft - 1).then(resolve, reject), 150);
            return;
          }
          if (optional) {
            console.warn(`[Hub_Game_Loader] Optional script unavailable: "${src}"`);
            resolve(null);
            return;
          }
          this.loadedScripts.delete(src);
          reject(new Error(`HubGameLoader: Failed to load script "${src}"`));
        };
        document.body.appendChild(el);
      });

      const promise = attemptLoad(1);
      this.loadedScripts.set(src, promise);
      return promise;
    }

    /**
     * Resolves relative paths against a game's base folder (leaving URLs untouched).
     * @param {string} basePath
     * @param {string} relPath
     * @returns {string}
     */
    resolvePath(basePath, relPath) {
      if (!relPath) return '';
      if (/^https?:\/\//i.test(relPath) || relPath.startsWith('/')) return relPath;
      const base = (basePath || '').replace(/\/+$/, '');
      const clean = relPath.replace(/^\/+/, '');
      return base ? `${base}/${clean}` : clean;
    }

    /**
     * Downloads and executes scripts in frame-budgeted chunks so the 60Hz render loop
     * never stalls during Step 0 while preserving strict in-order execution.
     * @param {Array<string>} urls
     * @param {Function} [onProgress]
     * @param {Object} [opts]
     */
    async loadScriptSequence(urls, onProgress = null, opts = {}) {
      const total = urls.length;
      if (total === 0) {
        if (typeof onProgress === 'function') onProgress(1, 1);
        return;
      }
      const chunkSize = Math.max(1, Number(opts.chunkSize) || 4);
      const timeSliced = opts.timeSliced !== false;
      const yieldFrame = () => (typeof requestAnimationFrame === 'function'
        ? new Promise((r) => requestAnimationFrame(r))
        : Promise.resolve());

      let done = 0;
      for (let i = 0; i < total; i += chunkSize) {
        const batch = urls.slice(i, i + chunkSize);
        const batchPromises = batch.map((u) => {
          const isCdn = /^https?:\/\//i.test(u);
          return this.loadScript(u, isCdn).then((res) => {
            done++;
            if (typeof onProgress === 'function') onProgress(done, total);
            return res;
          });
        });
        await Promise.all(batchPromises);
        if (timeSliced && i + chunkSize < total) {
          await yieldFrame();
        }
      }
    }

    /**
     * Preloads a game's entry script and ordered module list without mounting it yet.
     * Shares an in-flight promise so background loading cleanly joins with launchGame().
     * @param {string} id
     * @param {Function} [onProgress]
     * @returns {Promise<boolean>}
     */
    preloadGame(id, onProgress = null) {
      const meta = this.games.get(id);
      if (!meta) return Promise.resolve(false);
      if (onProgress) {
        const subs = this._progressSubs.get(id) || [];
        subs.push(onProgress);
        this._progressSubs.set(id, subs);
      }
      if (this._preloadPromises.has(id)) return this._preloadPromises.get(id);

      const emit = (done, total) => {
        (this._progressSubs.get(id) || []).forEach((fn) => {
          try { fn(done, total); } catch (_) {}
        });
      };

      const p = (async () => {
        await this.loadScript(meta.entryScript);
        const entry = global.GAME_ENTRIES?.[id];
        if (!entry || typeof entry.mount !== 'function') {
          throw new Error(`Game entry "${id}" did not register window.GAME_ENTRIES["${id}"].mount()`);
        }
        if (Array.isArray(entry.scripts) && entry.scripts.length > 0 && !entry._scriptsLoaded) {
          const resolved = entry.scripts.map((s) => this.resolvePath(meta.basePath, s));
          await this.loadScriptSequence(resolved, emit);
          entry._scriptsLoaded = true;
        } else {
          emit(1, 1);
        }
        return true;
      })().catch((err) => {
        this._preloadPromises.delete(id);
        console.error(`[Hub_Game_Loader] Preload failed for "${id}":`, err);
        return false;
      }).finally(() => {
        this._progressSubs.delete(id);
      });

      this._preloadPromises.set(id, p);
      return p;
    }

    /**
     * Preloads and silently mounts a game into the hidden Base Macro-Layer without activating it.
     * Reports unified real-time progress (0-80% scripts, 80-100% yielded mount phases) via opts.onPercent.
     * @param {string} id
     * @param {Object} [opts]
     * @returns {Promise<boolean>}
     */
    prepareGame(id, opts = {}) {
      const meta = this.games.get(id);
      if (!meta) return Promise.resolve(false);
      if (this.preparedGames.has(id) || this.activeGameId === id) {
        opts.onPercent?.(100);
        opts.onProgress?.(1, 1);
        return Promise.resolve(true);
      }
      const emitPct = (pct) => {
        const clamped = Math.max(0, Math.min(100, Math.round(pct)));
        if (typeof opts.onPercent === 'function') opts.onPercent(clamped);
      };
      if (opts.onProgress) {
        const subs = this._progressSubs.get(id) || [];
        subs.push(opts.onProgress);
        this._progressSubs.set(id, subs);
      }
      if (this._preparePromises.has(id)) return this._preparePromises.get(id);

      const p = (async () => {
        const loaded = await this.preloadGame(id, (done, total) => {
          emitPct((done / Math.max(1, total)) * 50);
        });
        const entry = global.GAME_ENTRIES?.[id];
        if (!loaded || !entry || typeof entry.mount !== 'function') {
          throw new Error(`Game entry "${id}" unavailable after preload.`);
        }
        const engine = this.hubContext?.engine || global.HexUIEngine;
        if (engine) {
          engine.baseLayerVisible = false;
          engine.baseLayerInteractive = false;
          engine.hudFrameAlpha = 0.0;
          engine.forceGhostSidebars = true;
        }
        await entry.mount(this.hubContext, meta, Object.assign({
          skipAutoMenu: true,
          invisibleMount: true,
          preserveOverlay: true,
          timeSliced: true,
          onMountProgress: (step, totalSteps) => {
            emitPct(50 + (step / Math.max(1, totalSteps)) * 50);
          }
        }, opts));
        emitPct(100);
        this.preparedGames.add(id);
        return true;
      })().catch((err) => {
        console.error(`[Hub_Game_Loader] Background prepare failed for "${id}":`, err);
        return false;
      }).finally(() => {
        this._preparePromises.delete(id);
      });

      this._preparePromises.set(id, p);
      return p;
    }

    /** Marks a silently prepared game as the active game when the user commits launch. */
    activatePreparedGame(id) {
      const meta = this.games.get(id);
      if (!meta) return false;
      this.activeGameId = id;
      if (typeof this.onGameMounted === 'function') {
        this.onGameMounted(id, meta);
      }
      return true;
    }

    /**
     * Loads and mounts a registered game on demand over the running Hub runtime.
     * @param {string} id
     * @param {Object} [opts]
     * @returns {Promise<boolean>}
     */
    async launchGame(id, opts = {}) {
      if (this.isLoading) return false;
      const meta = this.games.get(id);
      if (!meta) {
        console.error(`[Hub_Game_Loader] Unknown game id: "${id}"`);
        return false;
      }
      if (this.activeGameId === id) return true;

      this.isLoading = true;
      try {
        if (this.activeGameId) {
          await this.unloadCurrentGame({ silentReturn: true });
        }

        const engine = this.hubContext?.engine || global.HexUIEngine;
        const alreadyPrepared = this.preparedGames.has(id);
        if (!alreadyPrepared) {
          const loaded = await this.preloadGame(id, opts.onProgress);
          const entry = global.GAME_ENTRIES?.[id];
          if (!loaded || !entry || typeof entry.mount !== 'function') {
            throw new Error(`Game entry "${id}" unavailable after preload.`);
          }
          if (typeof opts.onBeforeMount === 'function') {
            await opts.onBeforeMount();
          }
          await entry.mount(this.hubContext, meta, opts);
        } else if (!opts.invisibleMount && !opts.skipAutoMenu) {
          global.GameSettingsCanvas?.openSetupMenu?.('btn-nav-menu', { silent: true });
        }

        if (engine && !opts.invisibleMount) {
          engine.setForegroundOverlay?.(null);
          engine.baseLayerVisible = true;
          engine.baseLayerAlpha = 1.0;
          engine.hudFrameAlpha = 1.0;
          engine.baseLayerInteractive = true;
          engine.forceGhostSidebars = false;
        }
        this.activeGameId = id;
        if (typeof this.onGameMounted === 'function') {
          this.onGameMounted(id, meta);
        }
        return true;
      } catch (err) {
        console.error(`[Hub_Game_Loader] Failed launching "${id}":`, err);
        return false;
      } finally {
        this.isLoading = false;
      }
    }

    /**
     * Unmounts the active game (keeping Cosmic_Domain_Warp & EngineTicker alive) and returns to Hub.
     * @param {Object} [opts]
     */
    async unloadCurrentGame(opts = {}) {
      const id = this.activeGameId;
      if (!id) return;
      const entry = global.GAME_ENTRIES?.[id];
      if (entry && typeof entry.unmount === 'function') {
        await entry.unmount(this.hubContext);
      }

      const engine = this.hubContext?.engine || global.HexUIEngine;
      if (engine) {
        engine.baseLayerVisible = false;
        engine.baseLayerInteractive = false;
        engine.forceGhostSidebars = false;
        engine.boardRenderDelegate = null;
      }

      const ticker = this.hubContext?.ticker || global.EngineTicker;
      if (ticker) {
        ticker.polyRender = null;
        ticker.deck = null;
        ticker.deckSync = null;
      }

      this.preparedGames.delete(id);
      this.activeGameId = null;
      if (!opts.silentReturn && typeof this.onReturnToHub === 'function') {
        this.onReturnToHub();
      }
    }
  }

  const instance = new HubGameLoaderClass();
  global.HubGameLoader = instance;
  global.ROLL_CALL = global.ROLL_CALL || new Map();
  global.ROLL_CALL.set('Hub_Game_Loader', instance);
})(typeof window !== 'undefined' ? window : this);
