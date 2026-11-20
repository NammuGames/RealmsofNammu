/**
 * @fileoverview Component_Ether.js - Ether Component (Wild Card) Module
 * @description Encapsulates all Ether (Wild) component rules, formula candidate matching,
 * spell cycling, spatial color permutations, and canvas rendering.
 */

(function(global) {
  'use strict';

  // Master 12 Elemental Spells Formula Catalog
  const ELEMENTAL_SPELLS = {
    'PPR': { element: 'Stone', name: 'Lock', desc: 'Outlines the Material in purple and prevents its components from forming sigils for that turn.' },
    'YYB': { element: 'Air', name: 'Weave', desc: 'Outlines the Material in yellow and allows placing one component at a time adjacent to the previous component.' },
    'BBY': { element: 'Water', name: 'Phase', desc: 'Outlines the Material in blue, allows placing on top of existing components, and reveals underlying components if unaligned.' },
    'RRP': { element: 'Fire', name: 'Burn', desc: 'Outlines the Material in red, allows placing over other components, and immediately destroys target tiles and itself without points.' },
    'PPY': { element: 'Wood', name: 'Shift', desc: 'Allows you to rearrange the 9 tiles adjacent to the sigil.' },
    'YYP': { element: 'Storm', name: 'Arch', desc: 'Allows you to extend the range of alignments to the 9 adjacent tiles.' },
    'BBR': { element: 'Ice', name: 'Store', desc: 'Allows you to move any of the 9 adjacent tiles into your components inventory.' },
    'RRB': { element: 'Heat', name: 'Form', desc: 'Allows you to place any components from your inventory into the 9 adjacent tiles.' },
    'PPB': { element: 'Feral', name: 'Heal', desc: 'Restores up to +4 HP (capped at max 24 HP).' },
    'YYR': { element: 'Cyber', name: 'Seek', desc: 'View the material line and swap any upcoming piece with the active 1st piece.' },
    'BBP': { element: 'Dark', name: 'Warp', desc: 'Allows you to pick up and move a sigil to any other available space.' },
    'RRY': { element: 'Light', name: 'Charge', desc: 'Reactivate a spent Dormant sigil to make a brand new spell.' }
  };

  const COLOR_CODE_MAP = {
    'blue': 'B',
    'red': 'R',
    'purple': 'P',
    'yellow': 'Y'
  };

  const CODE_TO_COLOR = {
    'B': 'blue',
    'R': 'red',
    'P': 'purple',
    'Y': 'yellow'
  };

  class ComponentEtherClass {
    constructor() {
      this.name = 'Ether';
      this.type = 'wild';
    }

    /**
     * Checks if a tile is an Ether wild component.
     * @param {Object} tile
     * @returns {boolean}
     */
    isEther(tile) {
      return !!tile && (tile.color === 'ether' || tile.isEther === true);
    }

    /**
     * Filters the 12 elemental formulas to all that can be completed
     * given the present normal (non-wild) colors.
     * @param {Array<string>} normalColors - Array of color names present (0, 1, or 2)
     * @returns {Array<{ formula: string, spell: string, element: string, neededWildCodes: Array<string> }>}
     */
    getValidFormulas(normalColors = []) {
      const normalCodes = normalColors.map(c => COLOR_CODE_MAP[c]).filter(Boolean);
      const results = [];

      for (const [formula, spellDef] of Object.entries(ELEMENTAL_SPELLS)) {
        // Count letters in this formula
        const formulaLetterCounts = {};
        for (const ch of formula) {
          formulaLetterCounts[ch] = (formulaLetterCounts[ch] || 0) + 1;
        }

        // Check if all normalCodes can be consumed from formulaLetterCounts
        let canForm = true;
        const remainingCounts = { ...formulaLetterCounts };
        for (const code of normalCodes) {
          if (!remainingCounts[code] || remainingCounts[code] <= 0) {
            canForm = false;
            break;
          }
          remainingCounts[code]--;
        }

        if (canForm) {
          // Reconstruct the remaining letters needed to complete the formula
          const neededWildCodes = [];
          for (const [code, count] of Object.entries(remainingCounts)) {
            for (let i = 0; i < count; i++) {
              neededWildCodes.push(code);
            }
          }

          results.push({
            formula,
            name: spellDef.name,
            element: spellDef.element,
            desc: spellDef.desc,
            neededWildCodes
          });
        }
      }

      return results;
    }

    /**
     * Enriches a detected triangle candidate containing 1, 2, or 3 Ether components.
     * @param {Object} candidate - Triangle candidate object with { id, tiles, colors }
     * @param {Array<Object>} tileObjs - Array of 3 tile objects
     */
    setupWildCandidate(candidate, tileObjs) {
      const wildTiles = [];
      const normalColors = [];

      for (const t of tileObjs) {
        if (this.isEther(t)) {
          wildTiles.push(t);
        } else if (t.color && COLOR_CODE_MAP[t.color]) {
          normalColors.push(t.color);
        }
      }

      if (wildTiles.length === 0) return candidate;

      const validList = this.getValidFormulas(normalColors);
      if (validList.length === 0) return candidate;

      candidate.isWild = true;
      candidate.wildTileKeys = wildTiles.map(t => `${t.q},${t.r}`);
      candidate.validFormulas = validList;
      candidate.formulaIndex = 0;

      // Select default formula
      const activeDef = validList[0];
      candidate.formula = activeDef.formula;
      candidate.spell = activeDef.name;
      candidate.element = activeDef.element;

      // Setup default color assignment for wild tiles
      this.applyWildAssignment(candidate, 0);

      return candidate;
    }

    /**
     * Computes distinct permutations of assigning needed wild colors to the wild tiles.
     * @param {Array<string>} wildTileKeys
     * @param {Array<string>} neededCodes
     * @returns {Array<Object>} Array of assignment maps: [{ [key]: colorName }]
     */
    computeDistinctAssignments(wildTileKeys, neededCodes) {
      if (wildTileKeys.length === 0 || neededCodes.length === 0) return [{}];

      const neededColors = neededCodes.map(c => CODE_TO_COLOR[c]);

      // Generate all permutations of neededColors
      const perms = [];
      const permute = (arr, m = []) => {
        if (arr.length === 0) {
          perms.push(m);
        } else {
          for (let i = 0; i < arr.length; i++) {
            const curr = arr.slice();
            const next = curr.splice(i, 1);
            permute(curr.slice(), m.concat(next));
          }
        }
      };
      permute(neededColors);

      // Deduplicate assignment maps
      const uniqueMaps = [];
      const seenSignatures = new Set();

      for (const p of perms) {
        const map = {};
        for (let i = 0; i < wildTileKeys.length; i++) {
          map[wildTileKeys[i]] = p[i];
        }
        const sig = wildTileKeys.map(k => `${k}:${map[k]}`).join('|');
        if (!seenSignatures.has(sig)) {
          seenSignatures.add(sig);
          uniqueMaps.push(map);
        }
      }

      return uniqueMaps;
    }

    /**
     * Applies a specific spatial permutation of wild colors to the candidate.
     * @param {Object} candidate
     * @param {number} permIndex
     */
    applyWildAssignment(candidate, permIndex = 0) {
      if (!candidate.isWild || !candidate.validFormulas) return;
      const currentFormulaDef = candidate.validFormulas[candidate.formulaIndex || 0];
      if (!currentFormulaDef) return;

      const distinctAssignments = this.computeDistinctAssignments(
        candidate.wildTileKeys,
        currentFormulaDef.neededWildCodes
      );

      candidate.distinctAssignments = distinctAssignments;
      candidate.wildPermutationIndex = ((permIndex % distinctAssignments.length) + distinctAssignments.length) % distinctAssignments.length;
      candidate.wildColorAssignments = distinctAssignments[candidate.wildPermutationIndex] || {};
    }

    /**
     * Cycles to the next valid elemental spell formula for this wild candidate.
     * @param {Object} candidate
     * @returns {Object} Updated candidate
     */
    cycleNextSpell(candidate) {
      if (!candidate || !candidate.isWild || !candidate.validFormulas || candidate.validFormulas.length <= 1) {
        return candidate;
      }

      candidate.formulaIndex = (candidate.formulaIndex + 1) % candidate.validFormulas.length;
      const newDef = candidate.validFormulas[candidate.formulaIndex];
      candidate.formula = newDef.formula;
      candidate.spell = newDef.name;
      candidate.element = newDef.element;

      // Reset permutation to 0 for new formula
      this.applyWildAssignment(candidate, 0);
      return candidate;
    }

    /**
     * Permutes wild colors among the wild tiles for the current formula (via Q/E or CCW/CW).
     * @param {Object} candidate
     * @param {number} dir - +1 for CW, -1 for CCW
     * @returns {boolean} True if permutation changed
     */
    permuteWildColors(candidate, dir = 1) {
      if (!candidate || !candidate.isWild || !candidate.distinctAssignments || candidate.distinctAssignments.length <= 1) {
        return false;
      }

      const nextIndex = candidate.wildPermutationIndex + dir;
      this.applyWildAssignment(candidate, nextIndex);
      return true;
    }

    /**
     * Synchronizes active wild colors onto board tiles based on currently locked sigils.
     * @param {Map} board
     * @param {Array<Object>} candidates
     * @param {Set<string>} lockedSigilIds
     */
    syncBoardEtherActiveColors(board, candidates, lockedSigilIds) {
      if (!board) return;

      // 1. Reset all ether tiles on board
      for (const tile of board.values()) {
        if (tile.color === 'ether') {
          tile.etherActiveColor = null;
        }
      }

      // 2. Apply active assignments from locked sigils
      if (!candidates || !lockedSigilIds) return;
      for (const cand of candidates) {
        if (cand.isWild && lockedSigilIds.has(cand.id) && cand.wildColorAssignments) {
          for (const [key, assignedColor] of Object.entries(cand.wildColorAssignments)) {
            const tile = board.get(key);
            if (tile && tile.color === 'ether') {
              tile.etherActiveColor = assignedColor;
            }
          }
        }
      }
    }

    /**
     * Renders the Ether component canvas visual:
     * - Dark obsidian hexagon base
     * - 4 symmetrical nested elemental sub-hexagons (Red, Yellow, Blue, Purple)
     * - If locked in a sigil, the active color sub-hexagon enlarges and radiates
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x - Center X
     * @param {number} y - Center Y
     * @param {number} radius - Hexagon radius
     * @param {string|null} activeColor - 'red' | 'blue' | 'yellow' | 'purple' | null
     * @param {Object} math - HexMath instance
     */
    draw(ctx, x, y, radius, activeColor = null, math = null) {
      const hexMath = math || global.HexMath;
      if (!hexMath) return;

      ctx.save();

      // 1. Base Dark Void Hexagon
      const baseFill = '#090d16';
      const baseStroke = activeColor ? 'rgba(255, 255, 255, 0.75)' : 'rgba(148, 163, 184, 0.45)';
      const baseStrokeWidth = activeColor ? 2.5 : 1.5;

      if (activeColor) {
        hexMath.drawHexagon(ctx, x, y, radius - 1.5, null, 'rgba(255, 255, 255, 0.22)', baseStrokeWidth + 5);
      }
      hexMath.drawHexagon(ctx, x, y, radius - 1.5, baseFill, baseStroke, baseStrokeWidth);
      ctx.restore();

      // 2. Four Elemental Sub-Hexagon Layout
      // Positions arranged symmetrically around center:
      // Top-Left (NW), Top-Right (NE), Bottom-Left (SW), Bottom-Right (SE)
      const subRadius = radius * 0.30;
      const offsetDist = radius * 0.44;

      const subHexes = [
        { color: 'red',    hex: '#f87171', glow: '#ef4444', dx: -offsetDist * 0.75, dy: -offsetDist * 0.65 },
        { color: 'yellow', hex: '#fbbf24', glow: '#f59e0b', dx:  offsetDist * 0.75, dy: -offsetDist * 0.65 },
        { color: 'blue',   hex: '#38bdf8', glow: '#0284c7', dx: -offsetDist * 0.75, dy:  offsetDist * 0.65 },
        { color: 'purple', hex: '#c084fc', glow: '#9333ea', dx:  offsetDist * 0.75, dy:  offsetDist * 0.65 }
      ];

      // Draw non-active sub-hexagons first
      for (const sub of subHexes) {
        if (activeColor && sub.color === activeColor) continue; // Draw active on top enlarged
        ctx.save();
        ctx.globalAlpha = activeColor ? 0.35 : 0.9;
        hexMath.drawHexagon(ctx, x + sub.dx, y + sub.dy, subRadius, sub.hex, 'rgba(0, 0, 0, 0.5)', 1);
        ctx.restore();
      }

      // Draw active sub-hexagon enlarged on top if activeColor is set
      if (activeColor) {
        const activeSub = subHexes.find(s => s.color === activeColor);
        if (activeSub) {
          ctx.save();
          const enlargedRadius = radius * 0.58;
          // Positioned slightly pulled toward center (Dual-Pass Alpha Halo, Zero Gaussian shadowBlur)
          const activeX = x + activeSub.dx * 0.35;
          const activeY = y + activeSub.dy * 0.35;
          ctx.globalAlpha = 0.28;
          hexMath.drawHexagon(ctx, activeX, activeY, enlargedRadius + 2.5, null, activeSub.glow, 6);
          ctx.globalAlpha = 1.0;
          hexMath.drawHexagon(ctx, activeX, activeY, enlargedRadius, activeSub.hex, '#ffffff', 2.5);

          // Star / Wild glyph in center of dominant element
          ctx.font = `bold ${Math.round(enlargedRadius * 0.8)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
          ctx.fillText('✦', activeX + 0.8, activeY + 0.8);
          ctx.fillStyle = '#ffffff';
          ctx.fillText('✦', activeX, activeY);
          ctx.restore();
        }
      } else {
        // Faint central celestial spark when dormant
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.font = `bold ${Math.round(radius * 0.32)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✦', x, y);
        ctx.restore();
      }
    }
  }

  const componentEtherInstance = new ComponentEtherClass();

  // Register with global Roll Call
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Component_Ether', componentEtherInstance);
  global.ComponentEther = componentEtherInstance;

})(window);
