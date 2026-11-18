/**
 * @fileoverview cells/hex_ui/Stat_Canvas.js - Multi-Part Cell Index Pointer
 * @description Points to the active multi-cell parts for Stat_Canvas (1.0 & 1.1).
 * Note: Stat_Canvas_1.0.js and Stat_Canvas_1.1.js are loaded directly in index.html.
 */

(function(global) {
  'use strict';

  // Index pointer confirming multi-part registration in ROLL_CALL
  global.ROLL_CALL?.set?.('Stat_Canvas', global.StatCanvas);
})(typeof window !== 'undefined' ? window : this);
