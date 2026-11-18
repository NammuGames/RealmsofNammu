/**
 * @fileoverview cells/hex_ui/UI_Deck_Sync.js - Multi-Part Cell Index Pointer & Registration
 * 
 * In accordance with the 500-line hard cap and modular multi-part architecture:
 * This cell has been split into:
 *   - UI_Deck_Sync_1.0.js (NativeStatPod synchronization, Left Sidebar controls, Slots 0-3 tray controls)
 *   - UI_Deck_Sync_1.1.js (Slot 4 Place/Pick-up/Confirm dispatch, Slot 5 End Turn/Resonate/Confirm dispatch)
 *
 * Both parts are loaded sequentially in index.html.
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  if (global.UIDeckSync && global.ROLL_CALL) {
    global.ROLL_CALL.set('UI_Deck_Sync', global.UIDeckSync);
  }
})(typeof window !== 'undefined' ? window : this);
