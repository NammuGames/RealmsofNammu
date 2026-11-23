/**
 * @fileoverview cells/Tween_Orchestrator_1.1.js - Holographic Frame Transitions & Cross-Fades
 * @description Implements 2-stage expandFrame, collapseFrame, and crossFadeContent animations
 * on TweenOrchestratorClass.prototype.
 */

(function(global) {
  'use strict';

  const TweenOrchestratorClass = global.TweenOrchestratorClass;
  if (!TweenOrchestratorClass) return;

  const proto = TweenOrchestratorClass.prototype;

  /**
   * 2-Stage Holographic Deployment: Empty Bezel Chassis expands first, then inner contents fade in.
   */
  proto.expandFrame = function(containerNode, origin, options = {}) {
    if (!containerNode) return;
    const tuning = global.AnimationTuningLab?.config || {};
    const viewW = global.HexUIEngine?.viewWidth || (typeof window !== 'undefined' ? window.innerWidth : 1920);
    const viewH = global.HexUIEngine?.viewHeight || (typeof window !== 'undefined' ? window.innerHeight : 911);
    const isSubFrame = containerNode.parent && containerNode.parent !== global.HexUIEngine?.root;
    const targetX = options.targetX ?? (isSubFrame ? 0 : (viewW * 0.5 + (containerNode.offsetX || 0)));
    const targetY = options.targetY ?? (isSubFrame ? 0 : (viewH * 0.5 + (containerNode.offsetY || 0)));
    const inPlace = origin === 'self' || options.inPlace;
    const pm = containerNode.parent?.worldMatrix;
    const defScreenX = pm ? (pm[0] * targetX + pm[2] * targetY + pm[4]) : targetX;
    const defScreenY = pm ? (pm[1] * targetX + pm[3] * targetY + pm[5]) : targetY;
    const screenOrigin = inPlace ? { x: targetX, y: targetY } : this.getOriginPoint(origin, defScreenX, defScreenY);

    let localOrigin = screenOrigin;
    if (!inPlace && containerNode.parent && typeof containerNode.parent.screenToLocal === 'function') {
      localOrigin = containerNode.parent.screenToLocal(screenOrigin.x, screenOrigin.y);
    }

    const startScale = options.startScale ?? 0.005;
    const targetScale = options.targetScale ?? 1.0;
    const duration = options.duration ?? tuning.menuDuration ?? 360;
    const steps = (options.steps !== undefined) ? options.steps : ((tuning.menuSteps > 0) ? tuning.menuSteps : this.defaultSteps);

    // Shared deceleration curve: cushions smoothly into center on expand (default 2 = Quad Ease-Out)
    const decelPower = (tuning.shrinkDecel !== undefined && tuning.shrinkDecel > 0) ? tuning.shrinkDecel : 2;
    const decelEasing = (t) => 1 - Math.pow(1 - t, decelPower);
    const easing = options.easing || (tuning.menuEasing && tuning.menuEasing !== 'easeOutCubic' && tuning.menuEasing !== 'easeInQuad' ? this.getEasing(tuning.menuEasing) : decelEasing);
    const contentFadeDur = options.contentFadeDuration ?? 100;

    this.cancel(`frame_trans_${containerNode.id}`);

    containerNode.visible = true;
    containerNode.animating = true;
    containerNode.position.x = localOrigin.x;
    containerNode.position.y = localOrigin.y;
    containerNode.scale = startScale;
    containerNode.alpha = 1.0;
    containerNode.contentAlpha = 0.0;
    if (typeof containerNode.invalidateCache === 'function') containerNode.invalidateCache();
    containerNode.updateTransforms?.();

    // Stage 1: Empty Bezel Chassis Expansion (with concurrent parent fade if options.concurrentFade)
    this.add({
      id: `frame_trans_${containerNode.id}`,
      from: { x: localOrigin.x, y: localOrigin.y, scale: startScale, alpha: 0.0 },
      to: { x: targetX, y: targetY, scale: targetScale, alpha: 1.0 },
      duration,
      easing,
      steps,
      onUpdate: (val) => {
        containerNode.position.x = val.x;
        containerNode.position.y = val.y;
        containerNode.scale = val.scale;
        if (options.concurrentFade || options.syncParentFade) {
          containerNode.contentAlpha = val.alpha;
          const pf = options.parentFrame || (typeof options.getParentFrame === 'function' ? options.getParentFrame() : null);
          if (pf) pf.contentAlpha = 1.0 - val.alpha;
        }
      },
      onComplete: () => {
        containerNode.position.x = targetX;
        containerNode.position.y = targetY;
        containerNode.scale = targetScale;
        containerNode.alpha = 1.0;
        if (options.concurrentFade || options.syncParentFade) {
          containerNode.contentAlpha = 1.0;
          const pf = options.parentFrame || (typeof options.getParentFrame === 'function' ? options.getParentFrame() : null);
          if (pf) pf.contentAlpha = 0.0;
          containerNode.animating = false;
          if (typeof options.onComplete === 'function') options.onComplete();
          return;
        }

        // Stage 2: Inner Contents Fade In (and Parent Contents Fade Out)
        this.add({
          id: `frame_trans_${containerNode.id}`,
          from: 0.0,
          to: 1.0,
          duration: contentFadeDur,
          easing: 'linear',
          steps,
          onUpdate: (val) => {
            containerNode.contentAlpha = val;
            const pf = options.parentFrame || (typeof options.getParentFrame === 'function' ? options.getParentFrame() : null);
            if (pf) pf.contentAlpha = 1.0 - val;
          },
          onComplete: () => {
            containerNode.contentAlpha = 1.0;
            const pf = options.parentFrame || (typeof options.getParentFrame === 'function' ? options.getParentFrame() : null);
            if (pf) pf.contentAlpha = 0.0;
            containerNode.animating = false;
            if (typeof options.onComplete === 'function') options.onComplete();
          }
        });
      }
    });
  };

  /**
   * 2-Stage Holographic Collapse: Inner contents fade out first, then outer frame shrinks.
   */
  proto.collapseFrame = function(containerNode, origin, options = {}) {
    if (!containerNode) {
      if (typeof options.onComplete === 'function') options.onComplete();
      return;
    }
    if (typeof options.beforeFade === 'function') options.beforeFade();
    const tuning = global.AnimationTuningLab?.config || {};
    const viewW = global.HexUIEngine?.viewWidth || (typeof window !== 'undefined' ? window.innerWidth : 1920);
    const viewH = global.HexUIEngine?.viewHeight || (typeof window !== 'undefined' ? window.innerHeight : 911);
    const isSubFrame = containerNode.parent && containerNode.parent !== global.HexUIEngine?.root;
    const targetX = options.targetX ?? (isSubFrame ? 0 : (viewW * 0.5 + (containerNode.offsetX || 0)));
    const targetY = options.targetY ?? (isSubFrame ? 0 : (viewH * 0.5 + (containerNode.offsetY || 0)));
    const effectiveOrigin = (typeof options.getOrigin === 'function') ? options.getOrigin() : origin;
    const inPlace = effectiveOrigin === 'self' || options.inPlace;
    const pm = containerNode.parent?.worldMatrix;
    const defScreenX = pm ? (pm[0] * targetX + pm[2] * targetY + pm[4]) : targetX;
    const defScreenY = pm ? (pm[1] * targetX + pm[3] * targetY + pm[5]) : targetY;
    const screenOrigin = inPlace ? { x: targetX, y: targetY } : this.getOriginPoint(effectiveOrigin, defScreenX, defScreenY);

    let localOrigin = screenOrigin;
    if (!inPlace && containerNode.parent && typeof containerNode.parent.screenToLocal === 'function') {
      localOrigin = containerNode.parent.screenToLocal(screenOrigin.x, screenOrigin.y);
    }

    const endScale = options.endScale ?? 0.005;
    const duration = options.duration ?? tuning.menuDuration ?? 360;
    const steps = (options.steps !== undefined) ? options.steps : ((tuning.menuSteps > 0) ? tuning.menuSteps : this.defaultSteps);

    // Deceleration curve for shrink speed drop-off (default 2 = Quad Ease-Out)
    const decelPower = (tuning.shrinkDecel !== undefined && tuning.shrinkDecel > 0) ? tuning.shrinkDecel : 2;
    const decelEasing = (t) => 1 - Math.pow(1 - t, decelPower);
    const easing = options.easing || decelEasing;

    const contentFadeDur = options.contentFadeDuration ?? 80;

    this.cancel(`frame_trans_${containerNode.id}`);
    containerNode.animating = true;
    containerNode.alpha = 1.0;

    const runShrink = (startAlpha = 0.0) => {
      const curX = containerNode.position.x, curY = containerNode.position.y, curScale = containerNode.scale;
      this.add({
        id: `frame_trans_${containerNode.id}`,
        from: { x: curX, y: curY, scale: curScale, alpha: startAlpha },
        to: { x: localOrigin.x, y: localOrigin.y, scale: endScale, alpha: 0.0 },
        duration,
        easing,
        steps,
        onUpdate: (val) => {
          containerNode.position.x = val.x;
          containerNode.position.y = val.y;
          containerNode.scale = val.scale;
          if (options.concurrentFade || options.syncParentFade) {
            containerNode.contentAlpha = val.alpha;
            const pf = options.parentFrame || (typeof options.getParentFrame === 'function' ? options.getParentFrame() : null);
            if (pf) pf.contentAlpha = 1.0 - val.alpha;
          }
        },
        onComplete: () => {
          containerNode.visible = false;
          containerNode.scale = 1.0;
          containerNode.alpha = 1.0;
          containerNode.position.x = targetX;
          containerNode.position.y = targetY;
          containerNode.contentAlpha = 1.0;
          containerNode.animating = false;
          const pf = options.parentFrame || (typeof options.getParentFrame === 'function' ? options.getParentFrame() : null);
          if (pf) pf.contentAlpha = 1.0;
          if (typeof options.onComplete === 'function') options.onComplete();
        }
      });
    };

    if (options.concurrentFade || options.syncParentFade) {
      const pf = options.parentFrame || (typeof options.getParentFrame === 'function' ? options.getParentFrame() : null);
      if (pf) pf.contentAlpha = 0.0;
      runShrink(containerNode.contentAlpha !== undefined ? containerNode.contentAlpha : 1.0);
      return;
    }

    // Stage 1: Inner Contents Fade Out (and Parent Contents Fade In)
    const startAlpha = containerNode.contentAlpha !== undefined ? containerNode.contentAlpha : 1.0;
    this.add({
      id: `frame_trans_${containerNode.id}`,
      from: startAlpha,
      to: 0.0,
      duration: contentFadeDur,
      easing: 'linear',
      steps,
      onUpdate: (val) => {
        containerNode.contentAlpha = val;
        const pf = options.parentFrame || (typeof options.getParentFrame === 'function' ? options.getParentFrame() : null);
        if (pf) pf.contentAlpha = 1.0 - val;
      },
      onComplete: () => {
        containerNode.contentAlpha = 0.0;
        const pf = options.parentFrame || (typeof options.getParentFrame === 'function' ? options.getParentFrame() : null);
        if (pf) pf.contentAlpha = 1.0;
        runShrink(0.0);
      }
    });
  };

  /**
   * Inner Content Cross-Fade (used when navigating between sub-pages inside the frame).
   */
  proto.crossFadeContent = function(containerNode, swapCallback, options = {}) {
    if (!containerNode) {
      if (typeof swapCallback === 'function') swapCallback();
      if (typeof options.onComplete === 'function') options.onComplete();
      return;
    }
    const tuning = global.AnimationTuningLab?.config || {};
    const fadeOutDur = options.fadeOutDuration ?? 75;
    const fadeInDur = options.fadeInDuration ?? 95;
    const steps = (options.steps !== undefined) ? options.steps : ((tuning.menuSteps > 0) ? tuning.menuSteps : this.defaultSteps);

    this.cancel(`fade_${containerNode.id}`);
    containerNode.animating = true;

    this.add({
      id: `fade_${containerNode.id}`,
      from: containerNode.contentAlpha !== undefined ? containerNode.contentAlpha : 1.0,
      to: 0.0,
      duration: fadeOutDur,
      easing: 'linear',
      steps,
      onUpdate: (val) => {
        containerNode.contentAlpha = val;
      },
      onComplete: () => {
        containerNode.contentAlpha = 0.0;
        if (typeof swapCallback === 'function') {
          try {
            swapCallback();
          } catch (err) {
            console.error('crossFadeContent swap error:', err);
          }
        }
        this.add({
          id: `fade_${containerNode.id}`,
          from: 0.0,
          to: 1.0,
          duration: fadeInDur,
          easing: 'linear',
          steps,
          onUpdate: (val) => {
            containerNode.contentAlpha = val;
          },
          onComplete: () => {
            containerNode.contentAlpha = 1.0;
            containerNode.animating = false;
            if (typeof options.onComplete === 'function') options.onComplete();
          }
        });
      }
    });
  };

  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Tween_Orchestrator_1.1', global.TweenOrchestrator);
  }

})(typeof window !== 'undefined' ? window : this);
