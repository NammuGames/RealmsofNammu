/**
 * @fileoverview cells/Board_Overlay_Renderer.js - Multi-Part Cell Index Pointer
 * @description Points to the active multi-cell parts for Board_Overlay_Renderer (1.0 & 1.1).
 * Note: Board_Overlay_Renderer_1.0.js and Board_Overlay_Renderer_1.1.js are loaded directly in index.html.
 */

(function(global) {
  'use strict';

  // Index pointer confirming multi-part registration in ROLL_CALL
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Board_Overlay_Renderer', global.BoardOverlayRenderer);
})(typeof window !== 'undefined' ? window : this);
