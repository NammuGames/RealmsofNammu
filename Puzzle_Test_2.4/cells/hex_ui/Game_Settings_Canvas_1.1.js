/**
 * @fileoverview cells/hex_ui/Game_Settings_Canvas_1.1.js - Tree Column Renderers & Modals
 * @description Part 1.1 of the multi-part Game Settings Canvas system.
 * Attaches root column, preset list column, copy/rename, and Preset Settings column onto
 * GameSettingsCanvasClass prototype (paired with Game_Settings_Vector_Columns.js).
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const Proto = global.GameSettingsCanvasClass
    ? global.GameSettingsCanvasClass.prototype
    : (global.GameSettingsCanvas ? Object.getPrototypeOf(global.GameSettingsCanvas) : null);
  if (!Proto) return;

  Proto.renderColumn = function(title, canGoBack, items) {
    this.setupListContainer();
    this.listContainer.addChild(this.createHeaderPod(title, canGoBack));
    items.forEach(it => {
      let pod = null;
      if (it.type === 'preview') pod = this.createPreviewPod(it);
      else if (it.type === 'preset_name') pod = this.createPresetNamePod(it);
      else if (it.type === 'half_stepper') pod = this.createHalfStepperPod(it);
      else if (it.type === 'full_stepper') pod = this.createFullStepperPod(it, false);
      else if (it.type === 'full_stepper_double') pod = this.createFullStepperPod(it, true);
      else pod = this.createBaseButtonPod(it);
      if (pod) this.listContainer.addChild(pod);
    });
    this.listTrait.clampScroll?.();
    this.listTrait.layoutChildren();
  };

  // ── 1. ROOT COLUMN ("Game Menu") ─────────────────────────────────────────
  Proto.renderRootColumn = function() {
    const self = this;
    const list = this.config.presets || [];
    const activeIdx = Math.max(0, Math.min(list.length - 1, this.config.activePresetIndex || 0));
    const curPreset = this.getActiveWorkingPreset ? (this.getActiveWorkingPreset() || list[activeIdx] || list[0] || { name: 'Meditate' }) : (list[activeIdx] || list[0] || { name: 'Meditate' });
    const armedDraft = this.getArmedDraft ? this.getArmedDraft() : null;
    const armedSave = this.getArmedSavedMatch ? this.getArmedSavedMatch() : null;
    const isStartedSave = !!(armedSave && armedSave.matchType !== 'Draft');
    const mc = global.MemoryCardManager;
    const net = global.NetworkP2PManager;
    const isGuestWaiting = !isStartedSave && !!(net?.role === 'guest' && net?.isConnected?.());
    const guestCanEnter = !(isStartedSave && armedSave?.matchType === 'Guest' && (!net || net.role !== 'guest' || !net.isHostOnline?.()));

    const levelTitle = isStartedSave
      ? (armedSave.presetName || armedSave.matchConfig?.presetName || curPreset.name)
      : (isGuestWaiting ? (net.hostPresetName || curPreset.name) : (armedDraft ? (this.armedDraftPreset?.name || armedDraft.presetName || curPreset.name) : curPreset.name));
    const isOnline = !!(net?.isConnected?.() || (isStartedSave && armedSave.lobbyMode === 'Online'));
    const armedCard = armedDraft || (isStartedSave ? armedSave : null);
    const pendingMatchName = String(this.config.pendingMatchName || (net?.isConnected?.() ? net.matchName : '') || '').trim();
    const lobbyLeft = armedCard ? (armedCard.matchName || armedCard.name || 'Select Match') : (pendingMatchName || 'Select Match');
    const mcStatus = mc?.getSavedStatusLabel ? mc.getSavedStatusLabel() : 'Saved';

    this.renderColumn('Game Menu', false, [
      isGuestWaiting
        ? {
            type: 'base', id: 'begin-match-waiting',
            title: 'Waiting for Host',
            color: '#10f000',
            isReadOnly: true
          }
        : {
            type: 'base', id: 'begin-match',
            title: isStartedSave ? 'Enter Match' : 'Begin Match',
            color: '#10f000',
            ghost: isStartedSave && !guestCanEnter,
            onClick: () => self.launchMatch()
          },
      {
        type: 'preset_name', id: 'menu-presets',
        title: levelTitle,
        categoryIndexText: 'Level',
        color: (isStartedSave || isGuestWaiting) ? '#953ffd' : '#10f000',
        onClick: () => {
          if (isStartedSave || isGuestWaiting) {
            const roPreset = self.getReadOnlyLevelPreset?.() || curPreset;
            self.pushColumn('Preset Settings', () => self.renderPresetSettingsColumn(roPreset, 0, true));
          } else {
            self.pushColumn('Presets', () => self.renderFusedPresetColumn());
          }
        }
      },
      {
        type: 'preset_name', id: 'single-multiplayer',
        title: lobbyLeft,
        categoryIndexText: 'Lobby',
        color: '#10f000',
        isDoubleBorder: false,
        onClick: () => {
          if (isGuestWaiting && global.RoomStatCanvas?.open) {
            global.RoomStatCanvas.open({ origin: 'pod-preset-single-multiplayer' });
            return;
          }
          self.pushColumn('Lobby', () => self.renderMultiplayerColumn());
        }
      },
      {
        type: 'preset_name', id: 'memory-card-btn',
        title: 'Memory Card',
        categoryIndexText: mcStatus,
        color: '#10f000',
        isDoubleBorder: false,
        isRightSubDoubleOrange: (mcStatus === 'Unsaved'),
        onClick: () => self.pushColumn('Memory Card', () => self.renderMemoryCardColumn())
      }
    ]);
  };

  Proto.createPresetCopyAndRename = function(sourcePreset, onComplete) {
    const self = this;
    const list = this.config.presets;
    const nextTag = this.getNextUniqueTag(list);
    const tagInt = parseInt(nextTag, 10) || (list.length + 1);
    const copy = JSON.parse(JSON.stringify(sourcePreset));
    copy.id = `preset_${Date.now()}`;
    copy.name = this.formatCopyName ? this.formatCopyName(sourcePreset.name) : `${sourcePreset.name} (Copy)`;
    copy.tagNumber = nextTag;
    copy.isDefault = false;

    if (global.GameSettingsRenamePopup?.open) {
      global.GameSettingsRenamePopup.open(copy, 'Preset', tagInt, () => {
        list.push(copy);
        const newIdx = self.sortPresetList(list, copy);
        self.config.activePresetIndex = newIdx;
        global.GameState?.showToast?.(`✦ Created Custom Preset: "${copy.name}"`);
        if (typeof onComplete === 'function') {
          onComplete(copy, newIdx);
        } else {
          self.buildScene();
        }
      }, list, { isAddNew: true, originNode: 'pod-base-fused-preset-name-btn' });
    }
  };

  // ── 1B. FUSED PRESET LIST COLUMN ──────────────────────────────────────────
  Proto.renderFusedPresetColumn = function() {
    const self = this;
    const list = this.config.presets || [];
    self.sortPresetList(list);
    let activeIdx = Math.max(0, Math.min(list.length - 1, this.config.activePresetIndex || 0));
    const isDeleteMode = !!self.isPresetDeleteMode && (self._presetDeleteCategory === 'Preset');
    const isCopyMode = !isDeleteMode && !!self.isPresetCopyMode && (self._presetCopyCategory === 'Preset');
    const pendingDel = self._pendingDeleteIds || (self._pendingDeleteIds = new Set());
    const visibleEntries = list.map((item, idx) => ({ item, idx })).filter(e => !pendingDel.has(e.item.id));

    const items = visibleEntries.map(({ item, idx }) => {
      const isChosen = (idx === activeIdx);
      const numStr = item.tagNumber || String(idx + 1).padStart(3, '0');
      const tag = `Preset ${numStr}`;
      const isDef = !!item.isDefault;
      const baseColor = isDef ? '#10f000' : '#3d6eff';

      let itemColor = baseColor;
      let isDouble = false;
      if (isDeleteMode) {
        itemColor = isDef ? '#64748b' : '#ff3333';
      } else if (isCopyMode) {
        itemColor = '#fff700';
      } else if (isChosen) {
        itemColor = '#ff9214';
        isDouble = true;
      }

      return {
        type: 'preset_name', id: `fused-preset-opt-${idx}`, title: item.name, categoryIndexText: tag,
        color: itemColor,
        isDoubleBorder: isDouble,
        onClick: () => {
          if (isDeleteMode) {
            if (isDef) {
              global.GameState?.showToast?.('⚠️ Default presets cannot be deleted!');
              return;
            }
            if (visibleEntries.length <= 1) {
              global.GameState?.showToast?.('⚠️ Cannot delete the only remaining Preset!');
              return;
            }
            pendingDel.add(item.id);
            self._pendingDeleteCommit = (ids) => {
              const activeItem = list[self.config.activePresetIndex || 0];
              let count = 0;
              for (let k = list.length - 1; k >= 0; k--) {
                if (ids.has(list[k]?.id) && !list[k]?.isDefault && list.length > 1) {
                  list.splice(k, 1);
                  count++;
                }
              }
              const nextIdx = activeItem ? list.indexOf(activeItem) : -1;
              self.config.activePresetIndex = nextIdx >= 0 ? nextIdx : Math.max(0, Math.min(list.length - 1, self.config.activePresetIndex || 0));
              if (count > 0) global.GameState?.showToast?.(`✦ Deleted ${count} Preset${count > 1 ? 's' : ''}`);
            };
            global.GameState?.showToast?.(`⏳ Staged "${item.name}" for deletion — press Confirm to finalize or Return to cancel`);
            self.buildScene();
          } else if (isCopyMode) {
            const nextTag = self.getNextUniqueTag(list);
            const tagInt = parseInt(nextTag, 10) || (list.length + 1);
            const newItem = JSON.parse(JSON.stringify(item));
            newItem.id = `preset_${Date.now()}`;
            newItem.name = self.formatCopyName ? self.formatCopyName(item.name) : `${item.name} (Copy)`;
            newItem.tagNumber = nextTag;
            newItem.isDefault = false;

            if (global.GameSettingsRenamePopup?.open) {
              global.GameSettingsRenamePopup.open(newItem, 'Preset', tagInt, () => {
                self.isPresetCopyMode = false;
                self._presetCopyCategory = null;
                list.push(newItem);
                const newIdx = self.sortPresetList(list, newItem);
                self.config.activePresetIndex = newIdx;
                global.GameState?.showToast?.(`✦ Copied Preset: "${newItem.name}"`);
                self.buildScene();
                self.activePresetDraft = {
                  targetPreset: newItem,
                  index: newIdx,
                  draftItem: JSON.parse(JSON.stringify(newItem)),
                  originalSnapshot: JSON.stringify(newItem),
                  isDefault: false,
                  previousActiveIndex: newIdx
                };
                self.pushColumn('Preset Settings', () => self.renderPresetSettingsColumn(newItem, newIdx));
              }, list, { isAddNew: true, originNode: `pod-preset-fused-preset-opt-${idx}` });
            }
          } else {
            self.isPresetDeleteMode = false;
            self._presetDeleteCategory = null;
            self.isPresetCopyMode = false;
            self._presetCopyCategory = null;
            self.activePresetDraft = {
              targetPreset: item,
              index: idx,
              draftItem: JSON.parse(JSON.stringify(item)),
              originalSnapshot: JSON.stringify(item),
              isDefault: !!item.isDefault,
              previousActiveIndex: self.config.activePresetIndex
            };
            self.pushColumn('Preset Settings', () => self.renderPresetSettingsColumn(item, idx));
          }
        }
      };
    });

    // Copy Button (Yellow toggle, turns selectable presets yellow)
    items.push({
      type: 'base', id: 'preset-copy-fused', title: isCopyMode ? '✖ Cancel Copy' : 'Copy', color: '#fff700',
      onClick: () => {
        self.isPresetDeleteMode = false;
        self._presetDeleteCategory = null;
        if (isCopyMode) {
          self.isPresetCopyMode = false;
          self._presetCopyCategory = null;
        } else {
          self.isPresetCopyMode = true;
          self._presetCopyCategory = 'Preset';
        }
        self.buildScene();
      }
    });

    // Delete
    items.push({
      type: 'base', id: 'preset-delete-fused', title: isDeleteMode ? '✖ Cancel Delete' : 'Delete', color: '#ff3333',
      onClick: () => {
        self.isPresetCopyMode = false;
        self._presetCopyCategory = null;
        if (isDeleteMode) {
          self.isPresetDeleteMode = false;
          self._presetDeleteCategory = null;
        } else {
          self.isPresetDeleteMode = true;
          self._presetDeleteCategory = 'Preset';
        }
        self.buildScene();
      }
    });

    this.renderColumn('Presets', true, items);
  };

  // ── 1C. PRESET SETTINGS COLUMN (NAME, MATCH, LUCK, BLIGHT) ───────────────
  Proto.renderPresetSettingsColumn = function(preset, idx, forceReadOnly = false) {
    const self = this;
    const ro = !!(forceReadOnly || this.isMatchReadOnly?.());
    const cur = ro
      ? (this.getReadOnlyLevelPreset?.() || preset || this.config.presets?.[0])
      : (self.getActiveWorkingPreset ? self.getActiveWorkingPreset() : (preset || this.config.presets?.[0]));
    const isDef = !!cur.isDefault;

    this.renderColumn('Preset Settings', true, [
      {
        type: 'base', id: 'fused-preset-name-btn', title: cur.name, color: ro ? '#953ffd' : '#fff700', underline: true,
        isReadOnly: ro,
        onClick: () => {
          if (ro) return;
          if (isDef) {
            const draft = self.activePresetDraft;
            const source = draft?.draftItem || cur;
            self.createPresetCopyAndRename(source, (newCopy, newIdx) => {
              self.activePresetDraft = null;
              self.popColumn();
              self.pushColumn('Preset Settings', () => self.renderPresetSettingsColumn(newCopy, newIdx), null, null, { skipAnimation: true });
            });
          } else if (global.GameSettingsRenamePopup?.open) {
            const draft = self.activePresetDraft;
            const itemToRename = draft?.draftItem || cur;
            global.GameSettingsRenamePopup.open(itemToRename, 'Preset', parseInt(itemToRename.tagNumber, 10) || 1, () => {
              if (draft?.targetPreset) {
                draft.targetPreset.name = itemToRename.name;
                draft.targetPreset.tagNumber = itemToRename.tagNumber;
              }
              self.buildScene();
            }, self.config.presets);
          }
        }
      },
      {
        type: 'base', id: 'fused-match-settings-btn', title: 'Match Settings', color: ro ? '#953ffd' : '#ff3333',
        onClick: () => self.pushColumn('Match Settings', () => self.renderMatchSettingsColumn(cur, ro))
      },
      {
        type: 'base', id: 'fused-luck-settings-btn', title: 'Luck Settings', color: ro ? '#953ffd' : '#3d6eff',
        onClick: () => self.pushColumn('Luck Settings', () => self.renderDualVectorColumn('luck', cur, ro))
      },
      {
        type: 'base', id: 'fused-blight-settings-btn', title: 'Blight Settings', color: '#953ffd',
        onClick: () => self.pushColumn('Blight Settings', () => self.renderDualVectorColumn('blight', cur, ro))
      }
    ]);
  };

})(window);
