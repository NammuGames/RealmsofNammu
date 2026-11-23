/**
 * @file Game_Settings_Canvas_1.2.js
 * @description Universal Hex UI - Game Settings Menu Canvas (Part 3)
 * Reusable Preset List Column, Save/Rename/Delete Action Modals, In-Game Pause Scene,
 * and Preset Tag Sorting & Management Utilities.
 */
(function(global) {
  'use strict';

  const Proto = global.GameSettingsCanvasClass
    ? global.GameSettingsCanvasClass.prototype
    : (global.GameSettingsCanvas ? Object.getPrototypeOf(global.GameSettingsCanvas) : null);
  if (!Proto) return;

  // ── PRESET HELPER UTILITIES ──────────────────────────────────────────────
  Proto.getNextUniqueTag = function(list) {
    if (!Array.isArray(list) || list.length === 0) return '001';
    const used = new Set();
    list.forEach((p, idx) => {
      const n = parseInt(p.tagNumber != null ? p.tagNumber : (idx + 1), 10);
      if (!isNaN(n)) used.add(n);
    });
    let next = 1;
    while (used.has(next)) next++;
    return String(next).padStart(3, '0');
  };

  Proto.sortPresetList = function(list, targetItem) {
    if (!Array.isArray(list)) return 0;
    list.forEach((p, idx) => {
      if (!p.tagNumber) {
        p.tagNumber = String(idx + 1).padStart(3, '0');
      }
    });
    list.sort((a, b) => (parseInt(a.tagNumber, 10) || 0) - (parseInt(b.tagNumber, 10) || 0));
    return targetItem ? Math.max(0, list.indexOf(targetItem)) : 0;
  };

  // ── PRESET DRAFT & CONFIRM ENGINE ────────────────────────────────────────
  Proto.pushPresetColumn = function(title, categoryLabel, list, index, onSelect, renderFn) {
    if (!Array.isArray(list) || !list[index]) return;
    const targetItem = list[index];
    const draftItem = JSON.parse(JSON.stringify(targetItem));
    const draft = {
      categoryLabel,
      list,
      index,
      targetItem,
      draftItem,
      onSelect
    };
    this.pushColumn(title, renderFn, { presetDraft: draft });
    global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
  };

  Proto.getCurrentDraft = function() {
    if (!this.history || this.history.length === 0) return null;
    return this.history[this.history.length - 1]?.presetDraft || null;
  };

  Proto.isPresetColumnOpen = function() {
    return !!(this.active && this.getCurrentDraft());
  };

  Proto.confirmPresetEdit = function() {
    const draft = this.getCurrentDraft();
    if (!draft) return;
    if (this.isMatchReadOnly?.()) {
      if (this.history.length > 0) {
        delete this.history[this.history.length - 1].presetDraft;
      }
      this.popColumn();
      return;
    }
    Object.assign(draft.targetItem, draft.draftItem);

    if (typeof draft.onSelect === 'function') {
      const newIdx = this.sortPresetList(draft.list, draft.targetItem);
      draft.onSelect(newIdx);
      global.GameState?.showToast?.(`✦ Equipped ${draft.categoryLabel}: "${draft.targetItem.name}"`);
    } else {
      this.sortPresetList(draft.list, draft.targetItem);
      global.GameState?.showToast?.(`✦ Saved ${draft.categoryLabel}: "${draft.targetItem.name}"`);
    }

    if (this.history.length > 0) {
      delete this.history[this.history.length - 1].presetDraft;
    }
    this.popColumn();
  };

  // ── 5. REUSABLE "PRESET" COLUMN ──────────────────────────────────────────
  Proto.renderPresetColumn = function(categoryLabel, list, activeIdx, onSelect, onOpen, forceReadOnly = false) {
    const self = this;
    const ro = !!(forceReadOnly || self.isMatchReadOnly?.());
    if (Array.isArray(list)) {
      const targetItem = list[activeIdx];
      self.sortPresetList(list);
      if (targetItem) activeIdx = Math.max(0, list.indexOf(targetItem));
    }
    const isExclusiveList = (categoryLabel === 'Match' || categoryLabel === 'Luck' || categoryLabel === 'Blight');
    const isDeleteMode = !ro && !!self.isPresetDeleteMode && (self._presetDeleteCategory === categoryLabel);
    const isCopyMode = !ro && !isDeleteMode && !!self.isPresetCopyMode && (self._presetCopyCategory === categoryLabel);
    const isVectorCategory = (categoryLabel === 'String' || categoryLabel === 'Strain');
    const pendingDel = self._pendingDeleteIds || (self._pendingDeleteIds = new Set());
    const keyOf = (it, i) => it?.id || `${categoryLabel}_${i}`;
    const visibleEntries = list.map((item, idx) => ({ item, idx, key: keyOf(item, idx) })).filter(e => !pendingDel.has(e.key));

    const items = visibleEntries.map(({ item, idx, key }) => {
      const isChosen = isExclusiveList && (idx === activeIdx);
      const numStr = item.tagNumber || String(idx + 1).padStart(3, '0');
      const tag = `${categoryLabel} ${numStr}`;

      let itemColor = ro ? '#953ffd' : (isVectorCategory ? '#3d6eff' : '#c084fc');
      let isDouble = false;
      if (ro) {
        itemColor = '#953ffd';
        isDouble = false;
      } else if (isDeleteMode) {
        itemColor = '#ff3333';
      } else if (isCopyMode) {
        itemColor = '#fff700';
      } else if (isChosen) {
        itemColor = isVectorCategory ? '#3d6eff' : '#ff8800';
        isDouble = true;
      }

      return {
        type: 'preset_name', id: `preset-opt-${idx}`, title: item.name, categoryIndexText: tag,
        color: itemColor,
        isDoubleBorder: isDouble,
        isLockedPurple: ro,
        onClick: () => {
          if (ro) {
            if (typeof onOpen === 'function') onOpen(idx);
            return;
          }
          if (isDeleteMode) {
            if (visibleEntries.length <= 1) {
              global.GameState?.showToast?.(`⚠️ Cannot delete the only remaining ${categoryLabel}!`);
              return;
            }
            pendingDel.add(key);
            self._pendingDeleteCommit = (ids) => {
              const activeItem = list[activeIdx];
              let count = 0;
              for (let k = list.length - 1; k >= 0; k--) {
                if (ids.has(keyOf(list[k], k)) && list.length > 1) {
                  list.splice(k, 1);
                  count++;
                }
              }
              const foundIdx = activeItem ? list.indexOf(activeItem) : -1;
              const newIdx = foundIdx >= 0 ? foundIdx : Math.max(0, Math.min(list.length - 1, activeIdx));
              if (typeof onSelect === 'function') onSelect(newIdx);
              if (count > 0) global.GameState?.showToast?.(`✦ Deleted ${count} ${categoryLabel}${count > 1 ? 's' : ''}`);
            };
            global.GameState?.showToast?.(`⏳ Staged "${item.name}" for deletion — press Confirm to finalize or Return to cancel`);
            self.buildScene();
          } else if (isCopyMode) {
            const nextTag = self.getNextUniqueTag(list);
            const tagInt = parseInt(nextTag, 10) || (list.length + 1);
            const newItem = JSON.parse(JSON.stringify(item));
            newItem.id = `${categoryLabel.toLowerCase().slice(0, 3)}_${Date.now()}`;
            newItem.name = self.formatCopyName ? self.formatCopyName(item.name) : `${item.name} (Copy)`;
            newItem.tagNumber = nextTag;
            if (isVectorCategory && newItem.spawnCount === undefined) newItem.spawnCount = 1;
            if (newItem.activePlayfieldIndex !== undefined) newItem.activePlayfieldIndex = 0;
            if (newItem.activeMaterialIndex !== undefined) newItem.activeMaterialIndex = 0;

            if (global.GameSettingsRenamePopup?.open) {
              global.GameSettingsRenamePopup.open(newItem, categoryLabel, tagInt, () => {
                self.isPresetCopyMode = false;
                self._presetCopyCategory = null;
                list.push(newItem);
                const newIdx = self.sortPresetList(list, newItem);
                global.GameState?.showToast?.(`✦ Copied ${categoryLabel}: "${newItem.name}"`);
                if (typeof onOpen !== 'function' && typeof onSelect === 'function') onSelect(newIdx);
                self.buildScene();
                if (typeof onOpen === 'function') onOpen(newIdx);
              }, list, { isAddNew: true, originNode: `pod-preset-preset-opt-${idx}` });
            }
          } else {
            self.isPresetDeleteMode = false;
            self._presetDeleteCategory = null;
            self.isPresetCopyMode = false;
            self._presetCopyCategory = null;
            if (typeof onOpen === 'function') {
              onOpen(idx);
            } else {
              if (typeof onSelect === 'function') onSelect(idx);
              global.GameState?.showToast?.(`✦ Selected: ${item.name}`);
              self.popColumn();
            }
          }
        }
      };
    });

    // Bottom Base Button: "Copy" (Yellow toggle, turns selectable cards yellow)
    items.push({
      type: 'base',
      id: `preset-copy-${categoryLabel.toLowerCase()}`,
      title: isCopyMode ? '✖ Cancel Copy' : 'Copy',
      color: ro ? '#953ffd' : '#fff700',
      ghost: ro,
      isReadOnly: ro,
      onClick: () => {
        if (ro) return;
        self.isPresetDeleteMode = false;
        self._presetDeleteCategory = null;
        if (isCopyMode) {
          self.isPresetCopyMode = false;
          self._presetCopyCategory = null;
        } else {
          self.isPresetCopyMode = true;
          self._presetCopyCategory = categoryLabel;
        }
        self.buildScene();
      }
    });

    // Bottom Base Button: "Delete"
    items.push({
      type: 'base',
      id: `preset-delete-${categoryLabel.toLowerCase()}`,
      title: isDeleteMode ? '✖ Cancel Delete' : 'Delete',
      color: ro ? '#953ffd' : '#ff3333',
      ghost: ro,
      isReadOnly: ro,
      onClick: () => {
        if (ro) return;
        self.isPresetCopyMode = false;
        self._presetCopyCategory = null;
        if (isDeleteMode) {
          self.isPresetDeleteMode = false;
          self._presetDeleteCategory = null;
        } else {
          self.isPresetDeleteMode = true;
          self._presetDeleteCategory = categoryLabel;
        }
        self.buildScene();
      }
    });

    this.renderColumn(`${categoryLabel} Presets`, true, items);
  };

  // ── 6. REUSABLE "SAVE" COLUMN (RENAME, DELETE, COPY, UPDATE) ─────────────
  Proto.popToParentOfSaved = function() {
    if (this.history.length > 0) this.history.pop();
    this.popColumn();
  };

  Proto.popToTopOfModifiedColumn = function() {
    if (this.history.length > 0) {
      this.history.pop();
      const prev = this.history[this.history.length - 1];
      if (prev) {
        prev.scroll = 0;
        prev.targetScroll = 0;
      }
    }
    this._nextScroll = 0;
    this._nextTargetScroll = 0;
    if (this.listTrait) {
      this.listTrait.scrollOffset = 0;
      this.listTrait.targetScrollOffset = 0;
    }
    this.buildScene();
  };

  Proto.finalizeRenameAndPopToTop = function(item, presetList, onIndexChange) {
    if (presetList && item) {
      const dup = presetList.find(p => p !== item && p.tagNumber === item.tagNumber);
      if (dup) {
        item.tagNumber = this.getNextUniqueTag(presetList);
        global.GameState?.showToast?.(`✦ Tag conflict resolved to #${item.tagNumber}`);
      }
      const newIdx = this.sortPresetList(presetList, item);
      if (onIndexChange) onIndexChange(newIdx);
    }
    this.popToTopOfModifiedColumn();
  };

  Proto.renderSaveColumn = function(itemType, targetItem, onSaveCurrent, onSaveNew, onRenameCurrent, onDeleteCurrent, categoryLabel, defaultNum, presetList, onIndexChange) {
    const self = this;
    const currentName = (typeof targetItem === 'object' && targetItem) ? (targetItem.name || 'Preset 1') : (targetItem || 'Preset 1');
    this.renderColumn(`Save ${itemType}`, true, [
      {
        type: 'action', id: 'save-rename', title: 'Rename', color: '#fff700',
        onClick: () => {
          if (global.GameSettingsRenamePopup) {
            global.GameSettingsRenamePopup.open(targetItem, categoryLabel || 'Preset', defaultNum || 1, () => {
              self.finalizeRenameAndPopToTop(targetItem, presetList, onIndexChange);
            }, presetList);
          }
        }
      },
      {
        type: 'action', id: 'save-delete', title: 'Delete', color: '#ff3333',
        onClick: () => {
          if (presetList && presetList.length <= 1) {
            global.GameState?.showToast?.(`⚠️ Cannot delete the only remaining ${itemType}!`);
            return;
          }
          const executeDelete = () => {
            const ok = onDeleteCurrent();
            if (ok) {
              global.GameState?.showToast?.(`✦ Deleted ${itemType}: "${currentName}"`);
              self.popToParentOfSaved();
            } else {
              global.GameState?.showToast?.(`⚠️ Cannot delete the only remaining ${itemType}!`);
            }
          };
          if (global.TurnConfirmPopup?.open) {
            global.TurnConfirmPopup.open(executeDelete, {
              title: `Delete ${itemType} — Are You Sure?`,
              subtitle: `"${currentName}" will be permanently removed`,
              topColor: '#ff3333',
              frameColor: '#ff3333'
            });
          } else {
            executeDelete();
          }
        }
      },
      {
        type: 'action', id: 'save-copy', title: 'Copy', color: '#3d6eff',
        onClick: () => {
          const copied = onSaveNew();
          const newItem = (typeof copied === 'object' && copied) ? copied : targetItem;
          const newDefNum = parseInt(newItem?.tagNumber, 10) || defaultNum || 1;
          if (global.GameSettingsRenamePopup) {
            global.GameSettingsRenamePopup.open(newItem, categoryLabel || 'Preset', newDefNum, () => {
              self.finalizeRenameAndPopToTop(newItem, presetList, onIndexChange);
              global.GameState?.showToast?.(`✦ Copied as new ${itemType}: ${newItem?.name || currentName}`);
            }, presetList, { isAddNew: true });
          } else {
            self.popToTopOfModifiedColumn();
          }
        }
      },
      {
        type: 'action', id: 'save-update', title: 'Update', color: '#953ffd',
        onClick: () => {
          onSaveCurrent();
          global.GameState?.showToast?.(`✦ Updated ${itemType}: ${targetItem?.name || currentName}`);
          self.popToParentOfSaved();
        }
      }
    ]);
  };

  // ── 7. IN-GAME PAUSE SCENE & MATCH LIFECYCLE ────────────────────────────
  Proto.getTileCountForRadius = function(r) { return 1 + 3 * r * (r + 1); };

  Proto.createDuplicate = function(item, turn) {
    return { ...item, id: `${item.id}_dup_${turn}`, name: `${item.name} (T${turn})`, turnStart: (item.turnStart || 0) + turn };
  };

  Proto.launchMatch = function() {
    if (typeof this.launchMatchWithNamingGate === 'function') {
      return this.launchMatchWithNamingGate();
    }
    const name = String(this.config.pendingMatchName || '').trim() || 'Match';
    return this._executeNewMatchLaunch(name, null);
  };

  Proto._executeNewMatchLaunch = function(resolvedMatchName, armedDraft = null) {
    const net = global.NetworkP2PManager;
    const mc = global.MemoryCardManager;
    if (net?.role === 'guest' && net?.isConnected?.()) {
      global.GameState?.showToast?.('⏳ Waiting for Host to start the match...');
      return;
    }

    const list = this.config.presets;
    const activeIdx = Math.max(0, Math.min((list?.length || 1) - 1, this.config.activePresetIndex || 0));
    const curPreset = (armedDraft && this.armedDraftPreset) || (list && list[activeIdx]) || list?.[0] || {};
    const m = curPreset.match || (this.config.matchPresets ? (this.config.matchPresets[this.config.activeMatchPresetIndex] || this.config.matchPresets[0]) : {});
    const l = curPreset.luck || (this.config.luckPresets ? (this.config.luckPresets[this.config.activeLuckPresetIndex] || this.config.luckPresets[0]) : {});
    const b = curPreset.blight || (this.config.blightPresets ? (this.config.blightPresets[this.config.activeBlightPresetIndex] || this.config.blightPresets[0]) : {});

    const seats = (net?.role === 'host' && net.getRoomSeats) ? net.getRoomSeats() : [];
    if (net?.role === 'host' && seats.length > 6) {
      global.AudioSynth?.playCancel?.();
      global.GameState?.showToast?.('⚠️ Max 6 players allowed! Reduce local player count in Players.');
      return;
    }

    const isOnline = !!(net?.isConnected?.() || this.config.lobbyMode === 'Online');
    const totalPlayers = (net?.role === 'host' && seats.length > 0) ? seats.length : this.config.playerCount;
    const roomCode = isOnline ? (net?.roomCode || (this.getPendingRoomCode ? this.getPendingRoomCode() : (mc?.generateUniqueRoomCode?.() || '4K9P'))) : '';
    const matchName = String(resolvedMatchName || '').trim();
    const matchType = isOnline ? 'Host' : 'Local';
    const roleBadge = isOnline ? 'Host' : 'Player';
    const lobbyMode = isOnline ? 'Online' : 'Local';

    const matchConfig = {
      playerCount: totalPlayers,
      presetName: curPreset.name || 'Meditate',
      matchName,
      roomCode,
      roleBadge,
      lobbyMode,
      boardRadius: m.boardRadius ?? 6,
      materialComposition: m.materialComposition || 'Even',
      luckComposition: m.luckComposition || 'Ether',
      startingSpells: Number(m.startingSpells ?? 0),
      rounds: m.isEndless ? '∞' : (m.rounds ?? 144),
      isEndless: !!m.isEndless,
      luckPreset: l,
      blightPreset: b
    };

    const promoteDraftId = armedDraft?.id || null;
    if (mc) mc.activeMatchId = promoteDraftId || `puzzle_${Date.now()}`;
    this.config.pendingRoomCode = null;
    this.config.pendingMatchName = null;
    this.selectedSavedMatchId = null;
    this.clearArmedDraft?.();
    this.isMatchActive = true;

    this.close(async () => {
      if (isOnline && net) {
        net.matchName = matchName;
        if (net.role !== 'host') {
          try { await net.hostRoom(roomCode, { matchName, localPlayerCount: this.config.playerCount }); } catch {}
        } else {
          net._broadcastRoster?.();
        }
      }
      if (global.GameState) {
        global.GameState.matchName = matchName;
        global.GameState.matchType = matchType;
        global.GameState.roomCode = roomCode;
        global.GameState.roleBadge = roleBadge;
        global.GameState.lobbyMode = lobbyMode;
        if (global.GameState.setMatchConfig) global.GameState.setMatchConfig(matchConfig);
      }
      // Promote armed Draft in place (or save fresh Local/Host match) once startup settles
      setTimeout(() => {
        if (global.GameState?.matchStarted) {
          if (promoteDraftId && mc?.promoteDraftToStarted) {
            mc.promoteDraftToStarted(promoteDraftId, { matchName, matchType, roomCode, roleBadge, lobbyMode });
          } else {
            mc?.saveActivePuzzleMatch?.(mc.activeMatchId, { matchName, matchType, roomCode, roleBadge, lobbyMode });
          }
        }
      }, 1700);
      global.GameState?.showToast?.(`✦ ${matchName} • ${totalPlayers} Player(s) • Radius-${m.boardRadius ?? 6}`);
    });
  };
})(window);
