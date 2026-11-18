/**
 * @fileoverview cells/Last_Breath_Manager.js - Multi-Part Cell Index Pointer
 * @description Points to the active multi-cell parts for Last_Breath_Manager (1.0 & 1.1).
 * Note: Last_Breath_Manager_1.0.js and Last_Breath_Manager_1.1.js are loaded directly in index.html.
 */

(function(global) {
  'use strict';

  // Index pointer confirming multi-part registration in ROLL_CALL
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Last_Breath_Manager', global.LastBreathManager);
})(typeof window !== 'undefined' ? window : this);
