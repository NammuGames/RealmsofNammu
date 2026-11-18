/**
 * @fileoverview cells/Sigil_Engine.js - Multi-Part Cell Index Pointer
 * @description Points to the active multi-cell parts for Sigil_Engine (1.0 & 1.1).
 * Note: Sigil_Engine_1.0.js and Sigil_Engine_1.1.js are loaded directly in index.html.
 */

(function(global) {
  'use strict';

  // Index pointer confirming multi-part registration in ROLL_CALL
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Sigil_Engine', global.SigilEngine);
})(typeof window !== 'undefined' ? window : this);
