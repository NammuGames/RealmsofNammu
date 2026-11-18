/**
 * @fileoverview cells/hex_ui/Sigil_Emblem_Studio.js - Multi-Part Cell Index Pointer
 * @description Points to the active multi-cell parts for Sigil_Emblem_Studio (1.0 & 1.1).
 * Note: Sigil_Emblem_Studio_1.0.js and Sigil_Emblem_Studio_1.1.js are loaded directly in index.html.
 */

(function(global) {
  'use strict';

  // Index pointer confirming multi-part registration in ROLL_CALL
  if (global.ROLL_CALL?.set) global.ROLL_CALL.set('Sigil_Emblem_Studio', global.SigilEmblemStudio);
})(typeof window !== 'undefined' ? window : this);
