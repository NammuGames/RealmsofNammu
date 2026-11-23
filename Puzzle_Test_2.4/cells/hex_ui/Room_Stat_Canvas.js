/**
 * @fileoverview cells/hex_ui/Room_Stat_Canvas.js - Multi-Part Cell Index Pointer
 * @description Points to the active multi-cell parts for Room_Stat_Canvas (1.0 & 1.1).
 * Note: Room_Stat_Canvas_1.0.js and Room_Stat_Canvas_1.1.js are loaded directly in game_entry.js / index.html.
 */

(function(global) {
  'use strict';

  global.ROLL_CALL?.set?.('Room_Stat_Canvas', global.RoomStatCanvas);
})(typeof window !== 'undefined' ? window : this);
