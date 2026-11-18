/**
 * @fileoverview cells/font_studio/Font_Studio_Deck.js - Multi-Part Cell Index Pointer
 * @description Points to the active multi-cell parts for Font_Studio_Deck (1.0 & 1.1).
 * Note: Font_Studio_Deck_1.0.js and Font_Studio_Deck_1.1.js are loaded directly in index.html.
 */

(function(global) {
  'use strict';

  // Index pointer confirming multi-part registration in ROLL_CALL
  if (global.ROLL_CALL?.set) global.ROLL_CALL.set('Font_Studio_Deck', global.FontStudioDeck);
})(typeof window !== 'undefined' ? window : this);
