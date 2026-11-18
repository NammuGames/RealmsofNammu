/**
 * @fileoverview Spell_Charge.js - Multi-Part Cell Index Pointer
 * @description Points to the active multi-cell parts for Spell_Charge (1.0 & 1.1).
 * Note: Spell_Charge_1.0.js and Spell_Charge_1.1.js are loaded directly in index.html.
 */

(function(global) {
  'use strict';

  // Index pointer confirming multi-part registration in ROLL_CALL
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Spell_Charge', global.SpellCharge);
})(window);
