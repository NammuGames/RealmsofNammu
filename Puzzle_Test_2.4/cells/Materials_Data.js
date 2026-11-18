/**
 * @fileoverview Materials_Data.js - Tetrahex Materials, 4-Color Parity & Elemental Spells
 * @description Master catalog of the 10 one-sided tetrahex shapes, 1:1:1:1 color parity generator, and 12 elemental formulas.
 */

(function(global) {
  'use strict';

  // 12 Elemental Spells Reference Table
  const ELEMENTAL_SPELLS = {
    'PPR': { element: 'Stone', name: 'Lock', desc: 'Outlines the Material in purple and prevents its components from forming sigils for that turn.' },
    'YYB': { element: 'Air', name: 'Weave', desc: 'Outlines the Material in yellow and allows placing one component at a time adjacent to the previous component.' },
    'BBY': { element: 'Water', name: 'Phase', desc: 'Outlines the Material in blue, allows placing on top of existing components, and reveals underlying components if unaligned.' },
    'RRP': { element: 'Fire', name: 'Burn', desc: 'Outlines the Material in red, allows placing over other components, and immediately destroys target tiles and itself without points.' },
    'PPY': { element: 'Wood', name: 'Shift', desc: 'Allows you to rearrange the 9 tiles adjacent to the sigil.' },
    'YYP': { element: 'Storm', name: 'Arch', desc: 'Allows you to extend the range of alignments to the 9 adjacent tiles.' },
    'BBR': { element: 'Ice', name: 'Store', desc: 'Allows you to move any of the 9 adjacent tiles into your components inventory.' },
    'RRB': { element: 'Heat', name: 'Form', desc: 'Allows you to place any components from your inventory into the 9 adjacent tiles.' },
    'PPB': { element: 'Feral', name: 'Heal', desc: 'Restores up to +4 HP (capped at max 12 HP).' },
    'YYR': { element: 'Cyber', name: 'Seek', desc: 'View the material line and swap any upcoming piece with the active 1st piece.' },
    'BBP': { element: 'Dark', name: 'Warp', desc: 'Allows you to pick up and move a sigil to any other available space.' },
    'RRY': { element: 'Light', name: 'Charge', desc: 'Reactivate a spent Dormant sigil to make a brand new spell.' }
  };

  // Color Definitions & Screen Palettes
  const COLOR_MAP = {
    'blue':    { code: 'B', name: 'Blue',    hex: '#38bdf8', glow: 'rgba(56, 189, 248, 0.6)' },
    'red':     { code: 'R', name: 'Red',     hex: '#f87171', glow: 'rgba(248, 113, 113, 0.6)' },
    'purple':  { code: 'P', name: 'Purple',  hex: '#c084fc', glow: 'rgba(192, 132, 252, 0.6)' },
    'yellow':  { code: 'Y', name: 'Yellow',  hex: '#fbbf24', glow: 'rgba(251, 191, 36, 0.6)' },
    'ether':   { code: 'W', name: 'Ether',   hex: '#090d16', glow: 'rgba(255, 255, 255, 0.85)' },
    'disease': { code: 'D', name: 'Disease', hex: '#f8fafc', glow: 'rgba(255, 255, 255, 0.95)' }
  };

  // 10 One-Sided Tetrahex Shape Configurations (axial q, r)
  // Neighbors in point-up bilateral system:
  // E: (1,-1), NE: (1,0), NW: (0,1), W: (-1,1), SW: (-1,0), SE: (0,-1)
  const TETRAHEX_SHAPES = [
    { id: 'I',  name: 'I-Bar',     coords: [[0,0], [1,-1], [2,-2], [3,-3]] },
    { id: 'O',  name: 'O-Diamond', coords: [[0,0], [1,-1], [1,0], [2,-1]] },
    { id: 'C',  name: 'C-Arch',    coords: [[-1,1], [0,1], [1,0], [1,-1]] },
    { id: 'Y',  name: 'Y-Tripod',  coords: [[0,0], [1,0], [-1,1], [0,-1]] },
    { id: 'PL', name: 'P-Left',    coords: [[0,0], [1,-1], [2,-2], [1,0]] },
    { id: 'PR', name: 'P-Right',   coords: [[0,0], [1,-1], [2,-2], [0,-1]] },
    { id: 'WL', name: 'W-Left',    coords: [[0,0], [1,-1], [2,-1], [3,-2]] },
    { id: 'WR', name: 'W-Right',   coords: [[0,0], [1,-1], [1,-2], [2,-3]] },
    { id: 'LL', name: 'L-Left',    coords: [[0,0], [1,-1], [2,-2], [3,-2]] },
    { id: 'LR', name: 'L-Right',   coords: [[0,0], [1,-1], [2,-2], [2,-3]] }
  ];

  /**
   * Generates a single random Material.
   * If allowSpecials is true, evaluates 25% chance for Ether and 25% chance for Disease.
   * @param {boolean} allowSpecials
   */
  function createRandomMaterial(allowSpecials = false) {
    return createRandomMaterialExcluding([], allowSpecials);
  }

  function createRandomMaterialExcluding(excludedShapeIds = [], allowSpecials = false) {
    const available = TETRAHEX_SHAPES.filter(s => !excludedShapeIds.includes(s.id));
    const pool = available.length > 0 ? available : TETRAHEX_SHAPES;
    const shapeDef = pool[Math.floor(Math.random() * pool.length)];
    const baseColors = ['blue', 'red', 'purple', 'yellow'].sort(() => Math.random() - 0.5);
    const colors = [...baseColors];

    if (allowSpecials) {
      let etherIndex = null;
      // 25% chance for Ether Wild component
      if (Math.random() < 0.25) {
        etherIndex = Math.floor(Math.random() * 4);
        colors[etherIndex] = 'ether';
      }

      // 25% chance for Disease Hazard component (chooses from remaining components if Ether landed)
      if (Math.random() < 0.25) {
        let availableIndices = [0, 1, 2, 3];
        if (etherIndex !== null) {
          availableIndices = availableIndices.filter(i => i !== etherIndex);
        }
        const diseaseIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
        colors[diseaseIndex] = 'disease';
      }
    }

    return {
      id: shapeDef.id,
      name: shapeDef.name,
      coords: JSON.parse(JSON.stringify(shapeDef.coords)),
      colors: colors,
      originalColors: [...baseColors]
    };
  }

  // 12 Canonical Elemental Spells in User-Requested Order
  const ORDERED_SPELLS = [
    { key: 'cyber', element: 'Cyber', formula: 'YYR', name: 'Seek', desc: 'View upcoming piece line and swap with active 1st piece.', color: '#b8d1f4', sec: '#ff9214' },
    { key: 'light', element: 'Light', formula: 'RRY', name: 'Charge', desc: 'Reactivate spent Dormant sigils into brand new spells.', color: '#ffffff', sec: '#eb66ff' },
    { key: 'dark', element: 'Dark', formula: 'BBP', name: 'Warp', desc: 'Pick up and relocate any sigil on the board.', color: '#000000', sec: '#06b6d4' },
    { key: 'feral', element: 'Feral', formula: 'PPB', name: 'Heal', desc: 'Restores up to +4 Vitality (capped at max 12 HP).', color: '#a66a26', sec: '#0abd0d' },
    { key: 'storm', element: 'Storm', formula: 'YYP', name: 'Arch', desc: 'Extend range of alignments to 9 adjacent tiles.', color: '#ff9214', sec: '#fff700' },
    { key: 'heat', element: 'Heat', formula: 'RRB', name: 'Form', desc: 'Place components from inventory into 9 adjacent tiles.', color: '#eb66ff', sec: '#ff3333' },
    { key: 'ice', element: 'Ice', formula: 'BBR', name: 'Store', desc: 'Pull any of 9 adjacent board tiles into inventory.', color: '#06b6d4', sec: '#3d6eff' },
    { key: 'wood', element: 'Wood', formula: 'PPY', name: 'Shift', desc: 'Rearrange the 9 tiles adjacent to the sigil.', color: '#0abd0d', sec: '#953ffd' },
    { key: 'air', element: 'Air', formula: 'YYB', name: 'Weave', desc: 'Place one component at a time adjacent to previous.', color: '#fff700', sec: '#b8d1f4' },
    { key: 'fire', element: 'Fire', formula: 'RRP', name: 'Burn', desc: 'Destructive placement destroying target tiles without points.', color: '#ff3333', sec: '#ffffff' },
    { key: 'water', element: 'Water', formula: 'BBY', name: 'Phase', desc: 'Place over components and reveal underlying unaligned tiles.', color: '#3d6eff', sec: '#000000' },
    { key: 'stone', element: 'Stone', formula: 'PPR', name: 'Lock', desc: 'Shield Material from forming sigils for that turn.', color: '#953ffd', sec: '#a66a26' }
  ];

  function createDefaultSpellbook(forTesting = false, startingCharges = null) {
    const initCharges = (startingCharges !== null && startingCharges !== undefined)
      ? Math.max(0, Math.min(3, Number(startingCharges) || 0))
      : (forTesting ? 3 : 0);
    return ORDERED_SPELLS.map((s, idx) => ({
      id: `spell_${s.key}_${idx}`,
      key: s.key,
      element: s.element,
      formula: s.formula,
      name: s.name,
      desc: s.desc,
      color: s.color,
      sec: s.sec,
      secondary: s.sec,
      basinBg: s.sec,
      charges: initCharges,
      maxCharges: 3,
      usableRound: 1,
      permanent: true
    }));
  }

  const materialsDataInstance = {
    ELEMENTAL_SPELLS,
    ORDERED_SPELLS,
    COLOR_MAP,
    TETRAHEX_SHAPES,
    createRandomMaterial,
    createRandomMaterialExcluding,
    createDefaultSpellbook
  };

  // Register with global Roll Call
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Materials_Data', materialsDataInstance);
  global.MaterialsData = materialsDataInstance;

})(window);
