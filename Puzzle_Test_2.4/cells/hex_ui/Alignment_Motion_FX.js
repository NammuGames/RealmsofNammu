/**
 * @fileoverview cells/hex_ui/Alignment_Motion_FX.js - Multi-Part Cell Index Pointer
 * 
 * In accordance with the 500-line hard cap and modular multi-part architecture:
 * This cell has been split into:
 *   - Alignment_Motion_FX_1.0.js (Disease resonant hum topology caching, offscreen sprites, double-buffered hum rendering)
 *   - Alignment_Motion_FX_1.1.js (Breathing Aurora ribbons and 12Hz Orange Plasma arcs for Arch spell conduits)
 *
 * Both parts are loaded sequentially in index.html.
 */

(function(global) {
  'use strict';

  if (global.AlignmentMotionFX && global.ROLL_CALL) {
    global.ROLL_CALL.set('Alignment_Motion_FX', global.AlignmentMotionFX);
  }
})(typeof window !== 'undefined' ? window : this);
