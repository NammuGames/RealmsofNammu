/**
 * @fileoverview cells/Tween_Orchestrator_1.0.js - Universal Canvas 2D Tween Clock & Easing
 * @description Coordinates normalized time progress, parametric easing curves, step-quantization,
 * tween registration/cancellation, master update tick, and node origin resolution.
 */

(function(global) {
  'use strict';

  // Standard parametric easing dictionary
  const EASING = {
    linear: t => t,
    easeInQuad: t => t * t,
    easeOutQuad: t => t * (2 - t),
    easeInOutQuad: t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    easeInCubic: t => t * t * t,
    easeOutCubic: t => (--t) * t * t + 1,
    easeInOutCubic: t => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
    easeOutBack: t => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    easeOutElastic: t => {
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
    }
  };

  class TweenOrchestratorClass {
    constructor() {
      this.tweens = [];
      this.idCounter = 0;
      this.defaultSteps = null; // null = continuous 60 FPS, number = discrete steps
    }

    /**
     * Quantizes normalized progress t into discrete step-frames if steps > 0.
     */
    quantize(t, steps) {
      if (!steps || steps <= 0) return t;
      return Math.min(1.0, Math.floor(t * steps) / steps);
    }

    /**
     * Resolves an easing function by name or reference.
     */
    getEasing(name) {
      if (typeof name === 'function') return name;
      return EASING[name] || EASING.easeOutCubic;
    }

    /**
     * Creates and starts a new tween.
     * @param {Object} options Configuration options:
     *   - from: starting value or object { x, y, scale, ... }
     *   - to: ending value or object
     *   - duration: duration in milliseconds (default: 300)
     *   - easing: easing name string or function
     *   - steps: null for 60 FPS smooth, integer > 0 for discrete stop-motion steps
     *   - onUpdate: callback function(val, rawT, easedT)
     *   - onComplete: callback function()
     *   - id: optional custom identifier
     */
    add(options = {}) {
      const id = options.id || `tw_${++this.idCounter}`;
      this.cancel(id); // Cancel any previous tween with same ID

      const duration = Math.max(16, options.duration || 300);
      const easingFn = this.getEasing(options.easing);
      const steps = (options.steps !== undefined) ? options.steps : this.defaultSteps;

      const isObject = typeof options.from === 'object' && options.from !== null;
      const from = isObject ? { ...options.from } : (options.from ?? 0);
      const to = isObject ? { ...options.to } : (options.to ?? 1);

      const tween = {
        id,
        from,
        to,
        isObject,
        duration,
        elapsed: 0,
        easingFn,
        steps,
        onUpdate: options.onUpdate || null,
        onComplete: options.onComplete || null,
        finished: false
      };

      this.tweens.push(tween);
      return id;
    }

    /**
     * Convenience helper to tween an existing target object's numeric properties.
     */
    to(target, duration, props, options = {}) {
      if (!target) return null;
      const from = {};
      const to = {};
      for (const k in props) {
        if (target[k] !== undefined) {
          from[k] = target[k];
          to[k] = props[k];
        }
      }
      const opt = { ...options, from, to, duration };
      const userOnUpdate = opt.onUpdate;
      opt.onUpdate = (curr, rawT, easedT) => {
        for (const k in curr) target[k] = curr[k];
        if (userOnUpdate) userOnUpdate(curr, rawT, easedT);
      };
      return this.add(opt);
    }

    /**
     * Cancels an active tween by its ID.
     */
    cancel(id) {
      if (!id) return;
      const idx = this.tweens.findIndex(tw => tw.id === id);
      if (idx !== -1) {
        this.tweens.splice(idx, 1);
      }
    }

    /**
     * Cancels all currently running tweens.
     */
    cancelAll() {
      this.tweens = [];
    }

    /**
     * Master tick method called by Engine_Ticker (or requestAnimationFrame).
     * @param {number} dt Delta time in seconds (e.g. 0.0166)
     */
    update(dt) {
      if (this.tweens.length === 0) return;
      const dtMs = dt * 1000;

      for (let i = this.tweens.length - 1; i >= 0; i--) {
        const tw = this.tweens[i];
        tw.elapsed += dtMs;
        const rawT = Math.min(1.0, tw.elapsed / tw.duration);
        const steppedT = this.quantize(rawT, tw.steps);
        const easedT = tw.easingFn(steppedT);

        let currVal;
        if (tw.isObject) {
          currVal = {};
          for (const k in tw.to) {
            const f = tw.from[k] ?? 0;
            const t = tw.to[k];
            currVal[k] = f + (t - f) * easedT;
          }
        } else {
          currVal = tw.from + (tw.to - tw.from) * easedT;
        }

        if (typeof tw.onUpdate === 'function') {
          try {
            tw.onUpdate(currVal, rawT, easedT);
          } catch (err) {
            console.error(`TweenOrchestrator [${tw.id}] onUpdate error:`, err);
          }
        }

        if (rawT >= 1.0) {
          tw.finished = true;
          this.tweens.splice(i, 1);
          if (typeof tw.onComplete === 'function') {
            try {
              tw.onComplete();
            } catch (err) {
              console.error(`TweenOrchestrator [${tw.id}] onComplete error:`, err);
            }
          }
        }
      }
    }

    getActiveCount() {
      return this.tweens.length;
    }

    /**
     * Resolves the screen coordinate center of a button node or ID.
     */
    getOriginPoint(nodeOrId, defaultX = 0, defaultY = 0) {
      if (!nodeOrId) nodeOrId = global.HexUIEngine?.lastClickedNode;
      if (!nodeOrId) return { x: defaultX, y: defaultY };
      if (typeof nodeOrId.x === 'number' && typeof nodeOrId.y === 'number') {
        return { x: nodeOrId.x, y: nodeOrId.y };
      }
      let node = null;
      if (typeof nodeOrId === 'string') {
        node = global.HexUIEngine?.findNodeById?.(nodeOrId);
      } else if (typeof nodeOrId === 'object' && nodeOrId.worldMatrix) {
        node = nodeOrId;
      }
      if (node) {
        if (!node.worldMatrix || (node.worldMatrix[4] === 0 && node.worldMatrix[5] === 0 && node.parent)) {
          if (global.HexUIEngine?.root?.updateTransforms) global.HexUIEngine.root.updateTransforms();
        }
        if (node.worldMatrix) {
          return { x: node.worldMatrix[4], y: node.worldMatrix[5] };
        }
      }
      return { x: defaultX, y: defaultY };
    }
  }

  const instance = new TweenOrchestratorClass();
  global.TweenOrchestratorClass = TweenOrchestratorClass;
  global.TweenOrchestrator = instance;
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Tween_Orchestrator_1.0', instance);
  }

})(typeof window !== 'undefined' ? window : this);
