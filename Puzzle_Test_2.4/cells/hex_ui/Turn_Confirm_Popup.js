/**
 * @fileoverview cells/hex_ui/Turn_Confirm_Popup.js - Multi-Part Cell Index Pointer
 * @description Points to the active multi-cell parts for Turn_Confirm_Popup (1.0 & 1.1).
 * Note: Turn_Confirm_Popup_1.0.js and Turn_Confirm_Popup_1.1.js are loaded directly in index.html.
 */

(function (global) {
  'use strict';

  // Index pointer confirming multi-part registration in ROLL_CALL
  if (global.ROLL_CALL) global.ROLL_CALL.set('Turn_Confirm_Popup', global.TurnConfirmPopup);
})(typeof window !== 'undefined' ? window : this);
