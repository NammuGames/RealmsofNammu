/**
 * @fileoverview cells/hex_ui/Game_Settings_Memory_Matches.js - Memory Card & Saved Matches Columns
 * @description Phase 1 Canvas 2D sub-pages for GameSettingsCanvas:
 * 1. Memory Card sub-page (Status badge + Save .nammu + Load .nammu Basic pods).
 * 2. Saved Matches list (unchangeable "New Match" top slot, auto-saved "<Name> | Host/Player" slots,
 *    and "Quit Match" delete toggle — zero Add New button).
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const Proto = global.GameSettingsCanvasClass
    ? global.GameSettingsCanvasClass.prototype
    : (global.GameSettingsCanvas ? Object.getPrototypeOf(global.GameSettingsCanvas) : null);
  if (!Proto) return;

  // Reset match-delete mode cleanly whenever columns pop or menu closes
  const origPop = Proto.popColumn;
  if (typeof origPop === 'function') {
    Proto.popColumn = function(options = {}) {
      this._isMatchDeleteMode = false;
      return origPop.call(this, options);
    };
  }
  const origClose = Proto.close;
  if (typeof origClose === 'function') {
    Proto.close = function(onDone) {
      this._isMatchDeleteMode = false;
      return origClose.call(this, onDone);
    };
  }

  Proto.getArmedSavedMatch = function() {
    if (!this.selectedSavedMatchId || !global.MemoryCardManager?.getSaveById) return null;
    const found = global.MemoryCardManager.getSaveById(this.selectedSavedMatchId);
    if (!found) this.selectedSavedMatchId = null;
    return found || null;
  };

  Proto.isSavedMatchArmed = function() {
    return !!this.getArmedSavedMatch();
  };

  // ── 1. MEMORY CARD SUB-PAGE (STATUS + SAVE + LOAD) ────────────────────────
  Proto.renderMemoryCardColumn = function() {
    const self = this;
    const mc = global.MemoryCardManager;
    const isSaved = mc?.isSaved ? mc.isSaved() : true;

    this.renderColumn('Memory Card', true, [
      {
        type: 'preset_name',
        id: 'mc-status-badge',
        title: 'Memory Card',
        categoryIndexText: isSaved ? 'Saved' : 'Unsaved',
        color: isSaved ? '#10f000' : '#ff8800',
        isDoubleBorder: !isSaved,
        onClick: () => {}
      },
      {
        type: 'base',
        id: 'mc-save-btn',
        title: 'Save',
        color: '#10f000',
        onClick: () => {
          if (!mc?.downloadMemoryCard) {
            global.GameState?.showToast?.('⚠️ Memory Card only available inside Nammu Hub.');
            return;
          }
          mc.downloadMemoryCard();
          self.rebuildTopFrame();
        }
      },
      {
        type: 'base',
        id: 'mc-load-btn',
        title: 'Load',
        color: '#3d6eff',
        onClick: () => {
          if (!mc?.promptImport) {
            global.GameState?.showToast?.('⚠️ Memory Card only available inside Nammu Hub.');
            return;
          }
          mc.promptImport().then(() => self.rebuildTopFrame());
        }
      }
    ]);
  };

  // ── 2. SAVED MATCHES COLUMN (NEW MATCH TOP + AUTO-SAVES + QUIT MATCH) ─────
  Proto.renderSavedMatchesColumn = function() {
    const self = this;
    const mc = global.MemoryCardManager;
    const saves = mc?.listSaves ? mc.listSaves() : [];
    const pendingDel = self._pendingDeleteIds || (self._pendingDeleteIds = new Set());
    const visibleSaves = saves.filter(s => !pendingDel.has(s.id));
    const isDelete = !!this._isMatchDeleteMode;
    const armedId = this.selectedSavedMatchId || null;

    const items = [];

    // Fixed unchangeable top slot: "New Match" | "Matches"
    items.push({
      type: 'preset_name',
      id: 'match-slot-new',
      title: 'New Match',
      categoryIndexText: 'Matches',
      color: (!armedId && !isDelete) ? '#ff8800' : '#10f000',
      isDoubleBorder: !armedId && !isDelete,
      onClick: () => {
        if (isDelete) {
          global.GameState?.showToast?.('⚠️ "New Match" slot cannot be removed.');
          return;
        }
        self.selectedSavedMatchId = null;
        if (self.history?.length > 1) self.popColumn();
        else self.buildScene();
      }
    });

    // Auto-saved in-progress / paused matches (excluding temporarily hidden staged deletions)
    visibleSaves.forEach((save, idx) => {
      const isSelected = armedId === save.id;
      const roleLabel = save.roleBadge === 'Host' ? 'Host' : 'Player';
      const titleText = save.matchName || `Match ${save.roomCode || idx + 1}`;

      let itemColor = '#3d6eff';
      let isDouble = false;
      if (isDelete) {
        itemColor = '#ff3333';
      } else if (isSelected) {
        itemColor = '#ff8800';
        isDouble = true;
      }

      items.push({
        type: 'preset_name',
        id: `match-slot-save-${idx}`,
        title: titleText,
        categoryIndexText: roleLabel,
        color: itemColor,
        isDoubleBorder: isDouble,
        onClick: () => {
          if (isDelete) {
            pendingDel.add(save.id);
            self._pendingDeleteCommit = (ids) => {
              let count = 0;
              ids.forEach(id => {
                mc?.deleteSavedMatch?.(id);
                if (self.selectedSavedMatchId === id) self.selectedSavedMatchId = null;
                count++;
              });
              if (count > 0) global.GameState?.showToast?.(`🗑 Removed ${count} Saved Match${count > 1 ? 'es' : ''}`);
            };
            global.GameState?.showToast?.(`⏳ Staged "${titleText}" for removal — press Confirm to finalize or Return to cancel`);
            if (visibleSaves.length <= 1) self._isMatchDeleteMode = false;
            self.rebuildTopFrame();
            return;
          }
          self.selectedSavedMatchId = save.id;
          global.GameState?.showToast?.(`✦ Armed Saved Match "${titleText}"`);
          if (self.history?.length > 1) self.popColumn();
          else self.buildScene();
        }
      });
    });

    // Bottom Delete-mode equivalent: "Quit Match" (no Add New button)
    if (visibleSaves.length > 0 || isDelete) {
      items.push({
        type: 'base',
        id: 'match-quit-delete-toggle',
        title: isDelete ? '✖ Cancel Quit Match' : 'Quit Match',
        color: '#ff3333',
        onClick: () => {
          self._isMatchDeleteMode = !self._isMatchDeleteMode;
          self.buildScene();
        }
      });
    }

    this.renderColumn('Saved Matches', true, items);
  };
})(typeof window !== 'undefined' ? window : this);
