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

  // Reset match-delete & match-copy modes cleanly whenever columns pop or menu closes
  const origPop = Proto.popColumn;
  if (typeof origPop === 'function') {
    Proto.popColumn = function(options = {}) {
      this._isMatchDeleteMode = false;
      this._isMatchCopyMode = false;
      this.syncArmedDraftSettings?.();
      return origPop.call(this, options);
    };
  }
  const origClose = Proto.close;
  if (typeof origClose === 'function') {
    Proto.close = function(onDone) {
      this._isMatchDeleteMode = false;
      this._isMatchCopyMode = false;
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
        color: isSaved ? '#10f000' : '#953ffd',
        isDoubleBorder: false,
        isRightSubDoubleOrange: !isSaved,
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

  // ── 2. MATCHES COLUMN (NEW MATCH TOP + DRAFT/LOCAL/HOST/GUEST + COPY + QUIT) ──
  Proto.renderSavedMatchesColumn = function() {
    const self = this;
    const mc = global.MemoryCardManager;
    const saves = mc?.listSaves ? mc.listSaves() : [];
    const pendingDel = self._pendingDeleteIds || (self._pendingDeleteIds = new Set());
    const visibleSaves = saves.filter(s => !pendingDel.has(s.id));
    const isDelete = !!this._isMatchDeleteMode;
    const isCopy = !!this._isMatchCopyMode && !isDelete;
    const armedDraftId = this.armedDraftId || null;
    const armedSaveId = this.selectedSavedMatchId || null;

    const items = [];

    // Top creator slot: "New Match" | "Create" (always green unless ghosted during Copy or Quit mode)
    items.push({
      type: 'preset_name',
      id: 'match-slot-new',
      title: 'New Match',
      categoryIndexText: 'Create',
      color: (isDelete || isCopy) ? '#64748b' : '#10f000',
      isDoubleBorder: false,
      isReadOnly: isDelete || isCopy,
      onClick: () => {
        if (isDelete) {
          global.GameState?.showToast?.('⚠️ "New Match" slot cannot be removed.');
          return;
        }
        if (isCopy) {
          global.GameState?.showToast?.('⚠️ Select an existing match card to copy into a new Draft.');
          return;
        }
        self.promptCreateNewDraft?.('pod-preset-match-slot-new');
      }
    });

    // Persisted Draft / Local / Host / Guest match cards
    visibleSaves.forEach((save, idx) => {
      const type = save.matchType || (save.isDraft ? 'Draft' : (save.lobbyMode === 'Online' ? (save.roleBadge === 'Host' ? 'Host' : 'Guest') : 'Local'));
      const isArmed = (type === 'Draft') ? (armedDraftId === save.id) : (armedSaveId === save.id);
      const tagLabel = mc?.getMatchTagLabel ? mc.getMatchTagLabel(save) : `${type} ${save.tagNumber || '001'}`;
      const titleText = save.matchName || save.name || `Match ${save.roomCode || idx + 1}`;
      const podOriginId = `pod-preset-match-slot-save-${idx}`;

      let itemColor = '#3d6eff';
      let isDouble = false;
      if (isDelete) {
        itemColor = '#ff3333';
      } else if (isCopy) {
        itemColor = '#fff700';
      } else if (isArmed) {
        itemColor = '#ff8800';
        isDouble = true;
      }

      items.push({
        type: 'preset_name',
        id: `match-slot-save-${idx}`,
        title: titleText,
        categoryIndexText: tagLabel,
        color: itemColor,
        isDoubleBorder: isDouble,
        onClick: () => {
          if (isDelete) {
            pendingDel.add(save.id);
            self._pendingDeleteCommit = (ids) => {
              const prevDraftId = self.armedDraftId || null;
              const prevSaveId = self.selectedSavedMatchId || null;
              const deletedCodes = new Set();
              let deletedArmed = false;
              let count = 0;

              ids.forEach(id => {
                const entry = mc?.getSaveById?.(id);
                if (entry?.roomCode) deletedCodes.add(String(entry.roomCode).toUpperCase());
                if (id === prevDraftId || id === prevSaveId) deletedArmed = true;
                mc?.deleteSavedMatch?.(id);
                count++;
              });

              const noSavesLeft = !(mc?.listSaves?.()?.length);
              if (deletedArmed || noSavesLeft) {
                self.selectedSavedMatchId = null;
                self.clearArmedDraft?.();
                if (self.config) {
                  self.config.pendingMatchName = null;
                  self.config.pendingRoomCode = null;
                  self.config.lobbyMode = 'Local';
                }
              }

              const net = global.NetworkP2PManager;
              const liveCode = String(net?.roomCode || '').toUpperCase();
              if (net && net.role !== 'offline' && (deletedCodes.has(liveCode) || deletedArmed || noSavesLeft)) {
                net.matchName = '';
                if (net.role === 'host') net.closeRoomAndSave?.();
                else net.leaveRoom?.();
              }

              if (count > 0) global.GameState?.showToast?.(`🗑 Removed ${count} Match${count > 1 ? 'es' : ''}`);
            };
            global.GameState?.showToast?.(`⏳ Staged "${titleText}" for removal — press Confirm to finalize or Return to cancel`);
            if (visibleSaves.length <= 1) self._isMatchDeleteMode = false;
            self.rebuildTopFrame();
            return;
          }
          if (isCopy) {
            self.promptCopyMatchToDraft?.(save, podOriginId);
            return;
          }
          self.handleMatchCardSelect?.(save, podOriginId);
        }
      });
    });

    // Bottom Yellow "Copy" button (mutually exclusive with Quit Match)
    if (visibleSaves.length > 0 || isCopy) {
      items.push({
        type: 'base',
        id: 'match-copy-toggle',
        title: isCopy ? '✖ Cancel Copy' : 'Copy',
        color: '#fff700',
        onClick: () => {
          self._isMatchDeleteMode = false;
          self._isMatchCopyMode = !self._isMatchCopyMode;
          self.buildScene();
        }
      });
    }

    // Bottom Red "Quit Match" button (mutually exclusive with Copy)
    if (visibleSaves.length > 0 || isDelete) {
      items.push({
        type: 'base',
        id: 'match-quit-delete-toggle',
        title: isDelete ? '✖ Cancel Quit Match' : 'Quit Match',
        color: '#ff3333',
        onClick: () => {
          self._isMatchCopyMode = false;
          self._isMatchDeleteMode = !self._isMatchDeleteMode;
          self.buildScene();
        }
      });
    }

    this.renderColumn('Matches', true, items);
  };
})(typeof window !== 'undefined' ? window : this);
