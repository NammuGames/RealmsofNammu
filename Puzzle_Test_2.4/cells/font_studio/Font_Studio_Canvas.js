/**
 * @fileoverview cells/font_studio/Font_Studio_Canvas.js - Compatibility Bridge
 * @description Forwarding proxy to FontCanvas and GlyphCanvas for backward compatibility.
 */

(function(global) {
  'use strict';

  global.FontStudioCanvas = {
    isOpen() {
      return (global.FontCanvas?.isOpen()) || (global.GlyphCanvas?.isOpen());
    },
    open() {
      if (global.FontCanvas) global.FontCanvas.open();
    },
    close() {
      if (global.FontCanvas) global.FontCanvas.close();
      if (global.GlyphCanvas) global.GlyphCanvas.close();
    }
  };
})(typeof window !== 'undefined' ? window : this);
