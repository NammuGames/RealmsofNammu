/**
 * @fileoverview cells/hex_ui/Game_Settings_Vector_Columns.js - Match, Dual-Vector & Sub-Pod Tuning
 * @description Unique-cell companion to Game_Settings_Canvas_1.1.js providing Match Settings,
 * Luck/Blight Dual-Vector columns, String/Strain parameter sub-columns, and Sub-Pod tuning defaults.
 */

(function(global) {
  'use strict';

  const Proto = global.GameSettingsCanvasClass
    ? global.GameSettingsCanvasClass.prototype
    : (global.GameSettingsCanvas ? Object.getPrototypeOf(global.GameSettingsCanvas) : null);
  if (!Proto) return;

  // ── 2. MATCH SETTINGS COLUMN ─────────────────────────────────────────────
  Proto.renderMatchSettingsColumn = function(preset) {
    const self = this;
    const curPreset = self.getActiveWorkingPreset ? self.getActiveWorkingPreset() : (preset || this.config.presets?.[0]);
    if (!curPreset.match) curPreset.match = {};
    const cur = curPreset.match;
    if (!cur.materialComposition) cur.materialComposition = 'Even';
    if (!cur.luckComposition) cur.luckComposition = 'Ether';
    if (cur.startingSpells === undefined || cur.startingSpells === null) cur.startingSpells = 0;
    if (cur.rounds === undefined || cur.rounds === null) cur.rounds = 144;
    if (cur.boardRadius === undefined || cur.boardRadius === null) cur.boardRadius = 6;

    this.renderColumn('Match Settings', true, [
      {
        type: 'preset_name', id: 'material-composition', title: 'Material Composition', categoryIndexText: cur.materialComposition, color: '#10f000',
        onClick: () => { cur.materialComposition = (cur.materialComposition === 'Random') ? 'Even' : 'Random'; self.buildScene(); }
      },
      {
        type: 'preset_name', id: 'luck-composition', title: 'Luck Composition', categoryIndexText: cur.luckComposition, color: '#10f000',
        onClick: () => { cur.luckComposition = (cur.luckComposition === 'Random') ? 'Ether' : 'Random'; self.buildScene(); }
      },
      {
        type: 'half_stepper', id: 'starting-spells', title: 'Starting Spells',
        valText: `Pre-Spells: ${cur.startingSpells}`,
        onDelta: (d) => { cur.startingSpells = Math.max(0, Math.min(3, (cur.startingSpells || 0) + d)); self.buildScene(); }
      },
      {
        type: 'full_stepper', id: 'rounds', title: 'Rounds',
        valText: cur.isEndless ? '∞ Endless ∞' : `${cur.rounds} Rounds`,
        isCenterClickable: true, isLocked: !!cur.isEndless,
        onCenterClick: () => { cur.isEndless = !cur.isEndless; self.buildScene(); },
        onDelta: (d) => { cur.isEndless = false; cur.rounds = Math.max(12, Math.min(432, cur.rounds + d)); self.buildScene(); }
      },
      {
        type: 'half_stepper', id: 'board-size', title: 'Board Size',
        valText: `Board Size: ${cur.boardRadius}`,
        onDelta: (d) => { cur.boardRadius = Math.max(3, Math.min(12, cur.boardRadius + d)); self.buildScene(); }
      }
    ]);
  };

  // ── 3. DUAL-VECTOR COLUMN (LUCK & BLIGHT SETTINGS) ────────────────────────
  Proto.renderDualVectorColumn = function(groupKey, preset) {
    const self = this;
    const isLuck = groupKey === 'luck';
    const title = isLuck ? 'Luck Settings' : 'Blight Settings';
    const colTheme = isLuck ? '#fbbf24' : '#f87171';
    const vecAName = isLuck ? 'Play Field Luck' : 'Play Field Blight';
    const vecBName = isLuck ? 'Component Luck' : 'Component Blight';
    const itemTypeLabel = isLuck ? 'String' : 'Strain';

    const curPreset = self.getActiveWorkingPreset ? self.getActiveWorkingPreset() : (preset || this.config.presets?.[0]);
    if (!curPreset[groupKey]) curPreset[groupKey] = {};
    const cur = curPreset[groupKey];
    if (!Array.isArray(cur.playfieldItems)) cur.playfieldItems = [];
    if (!Array.isArray(cur.materialItems)) cur.materialItems = [];

    const playfieldBadges = cur.playfieldItems.map(b => `${b.chance}%-${b.turnInterval}R`);
    const materialBadges = cur.materialItems.map(b => `${b.chance}%-${b.turnInterval}R`);

    this.renderColumn(title, true, [
      {
        type: 'preview', id: `${groupKey}-vec-a`, title: vecAName, badges: playfieldBadges, color: colTheme,
        onClick: () => self.pushColumn(`${itemTypeLabel} Presets`, () => {
          self.renderPresetColumn(
            itemTypeLabel, cur.playfieldItems, cur.activePlayfieldIndex || 0,
            (newIdx) => { cur.activePlayfieldIndex = newIdx; },
            (clickedIdx) => self.pushPresetColumn(vecAName, itemTypeLabel, cur.playfieldItems, clickedIdx, null, () => self.renderVectorSubColumn(groupKey, 'playfield', curPreset))
          );
        })
      },
      {
        type: 'preview', id: `${groupKey}-vec-b`, title: vecBName, badges: materialBadges, color: colTheme,
        onClick: () => self.pushColumn(`${itemTypeLabel} Presets`, () => {
          self.renderPresetColumn(
            itemTypeLabel, cur.materialItems, cur.activeMaterialIndex || 0,
            (newIdx) => { cur.activeMaterialIndex = newIdx; },
            (clickedIdx) => self.pushPresetColumn(vecBName, itemTypeLabel, cur.materialItems, clickedIdx, null, () => self.renderVectorSubColumn(groupKey, 'material', curPreset))
          );
        })
      }
    ]);
  };

  // ── 4. VECTOR SUB-COLUMN (PARAMETERS: START, INTERVAL, END, CHANCE, DUP) ─
  Proto.renderVectorSubColumn = function(groupKey, vecType, preset) {
    const self = this;
    const isLuck = groupKey === 'luck';
    const isPlayfield = vecType === 'playfield';
    const title = isPlayfield ? (isLuck ? 'Play Field Luck' : 'Play Field Blight') : (isLuck ? 'Component Luck' : 'Component Blight');
    const itemTypeLabel = isLuck ? 'String' : 'Strain';

    const curDraft = self.getCurrentDraft ? self.getCurrentDraft() : null;
    let item = curDraft ? curDraft.draftItem : null;
    let itemList = curDraft ? curDraft.list : null;
    if (!item) {
      const curPreset = self.getActiveWorkingPreset ? self.getActiveWorkingPreset() : (preset || this.config.presets?.[0]);
      const curGroup = curPreset?.[groupKey] || {};
      itemList = isPlayfield ? curGroup.playfieldItems : curGroup.materialItems;
      if (Array.isArray(itemList)) {
        self.sortPresetList(itemList);
        let activeItemIdx = isPlayfield ? (curGroup.activePlayfieldIndex || 0) : (curGroup.activeMaterialIndex || 0);
        if (activeItemIdx >= itemList.length) activeItemIdx = 0;
        item = itemList[activeItemIdx] || itemList[0];
      }
    }
    if (!item) return;

    const isZeroChance = (item.chance || 0) === 0;

    const items = [
      {
        type: 'base', id: `${groupKey}-${vecType}-name`, title: item.name, color: '#10f000',
        onClick: () => {
          if (global.GameSettingsRenamePopup?.open) {
            global.GameSettingsRenamePopup.open(item, itemTypeLabel, parseInt(item.tagNumber, 10) || 1, () => {
              self.buildScene();
            }, curDraft?.list || itemList);
          }
        }
      },
      {
        type: 'full_stepper', id: 'turn-start', title: 'R Start', valText: `Start: R ${item.turnStart}`,
        isCenterGhost: isZeroChance,
        onDelta: (d) => { item.turnStart = Math.max(0, Math.min(432, (item.turnStart || 0) + d)); self.buildScene(); }
      },
      {
        type: 'full_stepper', id: 'turn-interval', title: 'R Interval', valText: `Every ${item.turnInterval} R`,
        isCenterGhost: isZeroChance,
        onDelta: (d) => { item.turnInterval = Math.max(1, Math.min(144, (item.turnInterval || 1) + d)); self.buildScene(); }
      },
      {
        type: 'full_stepper', id: 'turn-end', title: 'Lasts',
        valText: item.isEndOfMatch ? 'End of Match' : `Lasts: ${Math.max(1, item.turnEnd ?? 1)} R`,
        isCenterClickable: true, isLocked: !!item.isEndOfMatch, isCenterGhost: isZeroChance,
        onCenterClick: () => { item.isEndOfMatch = !item.isEndOfMatch; self.buildScene(); },
        onDelta: (d) => { item.isEndOfMatch = false; item.turnEnd = Math.max(1, Math.min(432, (item.turnEnd || 1) + d)); self.buildScene(); }
      },
      {
        type: 'full_stepper', id: 'spawn-count', title: 'Spawns',
        valText: (() => {
          const maxSpawns = isPlayfield ? 24 : 4;
          const cnt = Math.max(1, Math.min(maxSpawns, item.spawnCount ?? 1));
          return `${cnt} ${cnt === 1 ? 'Spawn' : 'Spawns'}`;
        })(),
        isCenterGhost: isZeroChance,
        onDelta: (d) => {
          const maxSpawns = isPlayfield ? 24 : 4;
          item.spawnCount = Math.max(1, Math.min(maxSpawns, (item.spawnCount ?? 1) + d));
          self.buildScene();
        }
      },
      {
        type: 'full_stepper', id: 'chance', title: isLuck ? 'Luck Chance' : 'Infection Chance', valText: `${item.chance}% ${isLuck ? 'Spawn' : 'Contagion'}`,
        isCenterGhost: isZeroChance,
        onDelta: (d) => { item.chance = Math.max(0, Math.min(100, (item.chance || 0) + d)); self.buildScene(); }
      },
      {
        type: 'full_stepper_double', id: 'dup-interval', title: 'Duplicate',
        valText: !item.dupInterval ? 'Off' : `Every ${item.dupInterval} R`,
        isCenterGhost: isZeroChance,
        onDelta: (d) => { item.dupInterval = Math.max(0, Math.min(144, (item.dupInterval || 0) + d)); self.buildScene(); }
      }
    ];

    this.renderColumn(title, true, items);
  };

  // ── 5. SUB-POD TUNING CONFIGURATION & LIVE UPDATE CONTROLLER ──────────────
  const DEFAULT_SUB_POD_CONFIG = {
    // Header & Base Column Buttons
    headerTextSize: 42,
    headerTextY: 2,
    baseBtnTextSize: 44,
    baseBtnTextY: 3,
    presetNameBtnTextSize: 52,

    // Group 1: Preview Pod
    prevRow1Y: -24,
    prevTitleW: 720,
    prevTitleH: 60,
    prevTitleApex: 18,
    prevTitleTextSize: 32,
    prevTitleTextY: 2,

    prevRow2Y: 39,
    prevBadgeW: 148,
    prevBadgeH: 42,
    prevBadgeApex: 12,
    prevBadgeSpacing: 54,
    prevBadgeTextSize: 24,
    prevBadgeTextY: 2,

    // Group 2: Preset Name Pod
    presetRowY: 0,
    presetHeight: 72,
    presetApex: 20,
    presetNameW: 530,
    presetTagW: 230,
    presetSpacing: 54,
    presetNameTextSize: 32,
    presetNameTextY: 2,
    presetTagTextSize: 32,
    presetTagTextY: 2,

    // Group 3: Stepper Pods (Flanking Step Buttons - Linked)
    stepBtnRowY: 0,
    stepBtnW: 72,
    stepBtnH: 72,
    stepBtnApex: 21,
    stepInnerX: 250,
    stepOuterX: 380,
    stepBtnTextSize: 32,
    stepBtnTextY: 2,

    // Group 3: Stepper Pods (Center Readout - Linked Base)
    stepCenterRowY: 0,
    stepCenterW: 300,
    stepCenterApex: 21,
    stepCenterH: 72,
    stepCenterTextSize: 32,
    stepCenterTextY: 2,

    // Group 3: Stepper Pods (Double-Line Center Overrides)
    stepDoubleH: 90,
    stepDoubleTitleTextSize: 32,
    stepDoubleValTextSize: 32,
    stepDoubleLineSpacing: 32
  };

  Proto.subPodConfig = Object.assign({}, DEFAULT_SUB_POD_CONFIG);
  Proto.setSubPodConfig = function(cfg) {
    if (!this.subPodConfig) this.subPodConfig = Object.assign({}, DEFAULT_SUB_POD_CONFIG);
    Object.assign(this.subPodConfig, cfg);
    if (this.isOpen()) this.buildScene();
  };

  if (global.GameSettingsCanvasClass) {
    global.GameSettingsCanvasClass.DEFAULT_SUB_POD_CONFIG = DEFAULT_SUB_POD_CONFIG;
  }
  if (global.GameSettingsCanvas) {
    global.GameSettingsCanvas.subPodConfig = Object.assign({}, DEFAULT_SUB_POD_CONFIG);
    global.GameSettingsCanvas.setSubPodConfig = Proto.setSubPodConfig;
  }

  if (global.ROLL_CALL) global.ROLL_CALL.set('Game_Settings_Vector_Columns', global.GameSettingsCanvas);
})(window);
