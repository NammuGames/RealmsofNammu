/**
 * @fileoverview UI_Bridge_Legacy.js - Backward Compatibility Bridge Adapter
 * @description Provides the legacy `UISidebars` interface for older mechanics cells,
 * mapping legacy drawer/face rotations and sidebars notifications directly to
 * HexUIEngine columns (UICardsDeck / UISidebarDeck) and GameState.
 */

(function(global) {
  'use strict';

  const UIBridgeLegacy = {
    /**
     * Initializes the global UISidebars bridge compatibility layer.
     */
    initBridge() {
      global.UISidebars = {
        showToast(msg) {
          if (global.SigilEmblemStudio?.showToast) global.SigilEmblemStudio.showToast(msg);
          else console.log('[TOAST]', msg);
        },

        renderSpellbookUI() {
          global.UICardsDeck?.syncSpellbookColumnWithGameState();
        },

        renderTrayUI() {
          global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
          global.UICardsDeck?.syncMaterialsQueueColumn();
          if (global.BoardRenderer) global.BoardRenderer.render();
        },

        syncNavState() {
          global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
          global.UICardsDeck?.syncMaterialsQueueColumn();
          if (global.BoardRenderer) global.BoardRenderer.render();
        },

        renderForesightUI() {
          global.UICardsDeck?.syncMaterialsQueueColumn();
          global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
        },

        updateTelemetry() {
          global.UIDeckSync?.syncNativeStatPodWithGameState?.();
        },

        updateHpBar() {
          global.UIDeckSync?.syncNativeStatPodWithGameState?.();
        },

        updateComponentsBar() {
          global.UIDeckSync?.syncNativeStatPodWithGameState?.();
          global.UICardsDeck?.syncComponentsColumn();
        },

        resetToFace(face = 'materials') {
          if (face === 'components') {
            global.UISidebarDeck?.openComponentsColumn();
          } else if (face === 'spells' || face === 'spellbook') {
            global.UISidebarDeck?.openSpellbookColumn();
          } else {
            global.UISidebarDeck?.closeComponentsColumn?.(true);
            global.UISidebarDeck?.closeMaterialsColumn?.(true);
            global.UISidebarDeck?.closeSpellbookColumn?.(true);
          }
        },

        navigateTo(face) {
          if (!global.UISidebarDeck) return;
          if (face === 'spells' || face === 'spellbook') {
            global.UISidebarDeck.openSpellbookColumn();
          } else if (face === 'foresight') {
            global.UISidebarDeck.openMaterialsColumn(true);
          } else if (face === 'materials') {
            global.UISidebarDeck.openMaterialsColumn(false);
          } else if (face === 'ritual' || face === 'manifest' || face === 'components') {
            global.UISidebarDeck.openComponentsColumn();
          }
        },

        rotateToFace(face) {
          this.navigateTo(face);
        },

        finishRotationInstantly() {},

        navStack: ['materials']
      };
    }
  };

  global.UIBridgeLegacy = UIBridgeLegacy;
  if (global.ROLL_CALL) global.ROLL_CALL.set('UI_Bridge_Legacy', UIBridgeLegacy);

})(typeof window !== 'undefined' ? window : this);
