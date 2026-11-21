/**
 * @fileoverview cells/hex_ui/Native_Stat_Pod.js - Multi-Part Cell Index Pointer
 *
 * In accordance with the 500-line hard cap and modular multi-part architecture:
 * This cell has been split into:
 *   - Native_Stat_Pod_1.0.js (Top pod core class, HexNode construction, button bindings & vitality delegation)
 *   - Native_Stat_Pod_1.1.js (Dynamic layout, resize, Player/Turn double-orange highlight & stat cross-fades)
 *
 * All parts are loaded sequentially in index.html and game_entry.js.
 */

(function(global) {
  'use strict';

  if (global.NativeStatPod && global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Native_Stat_Pod', global.NativeStatPod);
  }
})(typeof window !== 'undefined' ? window : this);
