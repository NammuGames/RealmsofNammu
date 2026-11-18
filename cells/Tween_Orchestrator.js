/**
 * @fileoverview cells/Tween_Orchestrator.js - Multi-Part Cell Index Pointer
 * @description Points to the active multi-cell parts for Tween_Orchestrator (1.0 & 1.1).
 * Note: Tween_Orchestrator_1.0.js and Tween_Orchestrator_1.1.js are loaded directly in index.html.
 */

(function(global) {
  'use strict';

  // Index pointer confirming multi-part registration in ROLL_CALL
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Tween_Orchestrator', global.TweenOrchestrator);
  }
})(typeof window !== 'undefined' ? window : this);
