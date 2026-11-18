/**
 * @fileoverview Spell_Teleport.js - Multi-Part Cell Index Pointer
 * @description Points to the active multi-cell parts for Spell_Teleport (1.0 & 1.1).
 * Note: Spell_Teleport_1.0.js and Spell_Teleport_1.1.js are loaded directly in index.html.
 */

(function(global) {
  'use strict';

  // Index pointer confirming multi-part registration in ROLL_CALL
  global.ROLL_CALL = global.ROLL_CALL || new Map();
  global.ROLL_CALL.set('Spell_Teleport', global.SpellTeleport);
})(window);
