/**
 * @fileoverview cells/hex_ui/Border_Tuning_Lab.js - Multi-Part Cell Index Pointer
 * @description Points to the active multi-cell parts for Border_Tuning_Lab (1.0 & 1.1).
 * Note: Border_Tuning_Lab_1.0.js and Border_Tuning_Lab_1.1.js are loaded directly in index.html.
 */

(function(global) {
  'use strict';

  // Index pointer confirming multi-part registration in ROLL_CALL
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Border_Tuning_Lab', global.BorderTuningLab);
  }
})(typeof window !== 'undefined' ? window : this);
