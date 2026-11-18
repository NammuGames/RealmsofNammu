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
    this.listTrait.layoutChildren();
  };

  // ── 1. ROOT COLUMN ("Game Menu") ─────────────────────────────────────────
  Proto.renderRootColumn = function() {
    const self = this;
    const list = this.config.presets || [];
    const activeIdx = Math.max(0, Math.min(list.length - 1, this.config.activePresetIndex || 0));
    const curPreset = list[activeIdx] || list[0] || { name: 'Meditate' };

    this.renderColumn('Game Menu', false, [
      {
        type: 'half_stepper', id: 'players', title: 'Number Of Players', color: '#10f000',
        valText: `${this.config.playerCount} Player${this.config.playerCount > 1 ? 's' : ''}`,
        onDelta: (d) => { self.config.playerCount = Math.max(1, Math.min(6, self.config.playerCount + d)); self.buildScene(); }
      },
      {
        type: 'base', id: 'menu-presets', title: 'Preset Selection', color: '#10f000',
        onClick: () => self.pushColumn('Presets', () => self.renderFusedPresetColumn())
      },
      {
        type: 'preset_name', id: 'begin-match', title: curPreset.name, categoryIndexText: 'Begin', color: '#10f000',
        onClick: () => self.launchMatch()
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
    copy.name = `${sourcePreset.name} (Copy)`;
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

    const items = list.map((item, idx) => {
      const isChosen = (idx === activeIdx);
      const numStr = item.tagNumber || String(idx + 1).padStart(3, '0');
      const tag = `Preset ${numStr}`;
      const isDef = !!item.isDefault;
      const baseColor = isDef ? '#10f000' : '#3d6eff';

      let itemColor = baseColor;
      let isDouble = false;
      if (isDeleteMode) {
        itemColor = isDef ? '#64748b' : '#ff3333';
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
            if (list.length <= 1) {
              global.GameState?.showToast?.('⚠️ Cannot delete the only remaining Preset!');
              return;
            }
            if (global.TurnConfirmPopup?.open) {
              global.TurnConfirmPopup.open(() => {
                list.splice(idx, 1);
                let newIdx = activeIdx;
                if (idx < activeIdx) newIdx = activeIdx - 1;
                else if (idx === activeIdx && newIdx >= list.length) newIdx = list.length - 1;
                if (newIdx < 0) newIdx = 0;
                self.config.activePresetIndex = newIdx;
                self.isPresetDeleteMode = false;
                self._presetDeleteCategory = null;
                global.GameState?.showToast?.(`✦ Deleted Preset: "${item.name}"`);
                self.buildScene();
              }, {
                title: 'Delete Preset — Are You Sure?',
                frameColor: '#ff3333'
              });
            }
          } else {
            self.isPresetDeleteMode = false;
            self._presetDeleteCategory = null;
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

    // Add New Button (Phase-Blue)
    items.push({
      type: 'base', id: 'preset-add-new-fused', title: 'Add New', color: '#3d6eff',
      onClick: () => {
        self.isPresetDeleteMode = false;
        self._presetDeleteCategory = null;
        const nextTag = self.getNextUniqueTag(list);
        const tagInt = parseInt(nextTag, 10) || (list.length + 1);
        const template = list[activeIdx] || list[0] || {};
        const newItem = JSON.parse(JSON.stringify(template));
        newItem.id = `preset_${Date.now()}`;
        newItem.name = `Preset ${tagInt}`;
        newItem.tagNumber = nextTag;
        newItem.isDefault = false;

        if (global.GameSettingsRenamePopup?.open) {
          global.GameSettingsRenamePopup.open(newItem, 'Preset', tagInt, () => {
            list.push(newItem);
            const newIdx = self.sortPresetList(list, newItem);
            self.config.activePresetIndex = newIdx;
            global.GameState?.showToast?.(`✦ Created Preset: "${newItem.name}"`);
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
          }, list, { isAddNew: true });
        }
      }
    });

    // Delete
    items.push({
      type: 'base', id: 'preset-delete-fused', title: isDeleteMode ? '✖ Cancel Delete' : 'Delete', color: '#ff3333',
      onClick: () => {
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
  Proto.renderPresetSettingsColumn = function(preset, idx) {
    const self = this;
    const cur = self.getActiveWorkingPreset ? self.getActiveWorkingPreset() : (preset || this.config.presets?.[0]);
    const isDef = !!cur.isDefault;

    this.renderColumn('Preset Settings', true, [
      {
        type: 'base', id: 'fused-preset-name-btn', title: cur.name, color: '#fff700', underline: true,
        onClick: () => {
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
        type: 'base', id: 'fused-match-settings-btn', title: 'Match Settings', color: '#ff3333',
        onClick: () => self.pushColumn('Match Settings', () => self.renderMatchSettingsColumn(cur))
      },
      {
        type: 'base', id: 'fused-luck-settings-btn', title: 'Luck Settings', color: '#3d6eff',
        onClick: () => self.pushColumn('Luck Settings', () => self.renderDualVectorColumn('luck', cur))
      },
      {
        type: 'base', id: 'fused-blight-settings-btn', title: 'Blight Settings', color: '#953ffd',
        onClick: () => self.pushColumn('Blight Settings', () => self.renderDualVectorColumn('blight', cur))
      }
    ]);
  };

})(window);
