/**
 * @fileoverview cells/Sigil_Engine_1.0.js - Triangular Cluster Recognition & Arch Graph
 * @description Scans the board for 2-of-A + 1-of-B / Ether wild sigil candidates, computes
 * pairwise overlap conflict graphs, and builds valid Arch alignment edges.
 */

(function(global) {
  'use strict';

  class SigilEngineClass {
    constructor() {
      // 6 potential triangular neighbor pairs sharing tile (q, r):
      this.triNeighbors = [
        [[1, 0], [1, -1]],  // NE, E
        [[1, 0], [0, 1]],   // NE, NW
        [[0, 1], [-1, 1]],  // NW, W
        [[-1, 1], [-1, 0]], // W, SW
        [[-1, 0], [0, -1]], // SW, SE
        [[0, -1], [1, -1]]  // SE, E
      ];
      this.lastAdjacentPairs = [];
      this.lastClusters = [];
    }

    /**
     * Scans the board map and identifies all valid 3-hex triangular sigil candidates.
     * @param {Map} board
     * @returns {Array<Object>}
     */
    findCandidates(board) {
      const checkedTriangles = new Set();
      const candidates = [];

      for (const [key, tile] of board.entries()) {
        if (!tile.color || tile.fortified || tile.color === 'disease') continue;
        const { q, r } = tile;

        for (const [n1, n2] of this.triNeighbors) {
          const k1 = `${q + n1[0]},${r + n1[1]}`;
          const k2 = `${q + n2[0]},${r + n2[1]}`;
          const t1 = board.get(k1);
          const t2 = board.get(k2);

          if (t1 && t1.color && !t1.fortified && t1.color !== 'disease' &&
              t2 && t2.color && !t2.fortified && t2.color !== 'disease') {
            const triKeys = [key, k1, k2].sort();
            const triId = triKeys.join('|');
            if (!checkedTriangles.has(triId)) {
              checkedTriangles.add(triId);

              const tileObjs = [tile, t1, t2];
              const hasEther = tileObjs.some(t => t.color === 'ether');

              if (hasEther && global.ComponentEther) {
                const wildCand = {
                  id: 'sigil_' + triId,
                  tiles: triKeys
                };
                global.ComponentEther.setupWildCandidate(wildCand, tileObjs);
                if (wildCand.validFormulas && wildCand.validFormulas.length > 0) {
                  candidates.push(wildCand);
                }
              } else {
                // Check 2-of-A + 1-of-B formula
                const colors = [tile.color, t1.color, t2.color];
                const counts = {};
                colors.forEach(c => counts[c] = (counts[c] || 0) + 1);

                const keysWithCount = Object.keys(counts);
                if (keysWithCount.length === 2) {
                  const colorA = keysWithCount.find(c => counts[c] === 2);
                  const colorB = keysWithCount.find(c => counts[c] === 1);
                  if (colorA && colorB && global.MaterialsData?.COLOR_MAP?.[colorA] && global.MaterialsData?.COLOR_MAP?.[colorB]) {
                    const formula = `${global.MaterialsData.COLOR_MAP[colorA].code}${global.MaterialsData.COLOR_MAP[colorA].code}${global.MaterialsData.COLOR_MAP[colorB].code}`;
                    const spellDef = global.MaterialsData.ELEMENTAL_SPELLS[formula];
                    if (spellDef) {
                      candidates.push({
                        id: 'sigil_' + triId,
                        formula: formula,
                        element: spellDef.element,
                        spell: spellDef.name,
                        tiles: triKeys
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
      return candidates;
    }

    /**
     * Computes pairwise tile overlap map between candidates.
     * @param {Array<Object>} candidates
     * @returns {Map<string, Set<string>>}
     */
    computeOverlaps(candidates) {
      const overlapsMap = new Map();
      candidates.forEach(c => overlapsMap.set(c.id, new Set()));

      for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          const c1 = candidates[i];
          const c2 = candidates[j];
          const sharedTiles = c1.tiles.filter(t => c2.tiles.includes(t));
          if (sharedTiles.length > 0) {
            overlapsMap.get(c1.id).add(c2.id);
            overlapsMap.get(c2.id).add(c1.id);
          }
        }
      }
      return overlapsMap;
    }

    /**
     * Computes valid inter-Arch edges and Sigil-to-Arch edges based on pseudo-sigil touching rules.
     * - Touching Arch flowers connect to each other.
     * - If Arch flowers touch (connected component > 1), each real sigil only connects to the single closest Arch flower (tile position tiebreaker).
     * - If Arch flowers do not touch, real sigils connect to all Arch flowers they touch.
     * @param {Array<Object>} sigils
     * @param {Array<Object>} archZones
     * @returns {{ interArchEdges: Array<Array<Object>>, sigilArchEdges: Array<{ sigil: Object, zone: Object }>, diseaseArchEdges: Array<{ zone: Object, tileKey: string }> }}
     */
    getValidArchConnections(sigils = [], archZones = []) {
      const interArchEdges = [];
      const sigilArchEdges = [];
      const diseaseArchEdges = [];
      if (!archZones || archZones.length === 0) {
        return { interArchEdges, sigilArchEdges, diseaseArchEdges };
      }

      global.SpellArch?.syncArchZones?.(archZones);

      const getZoneEnch = (z) => {
        if (z?.center && global.SpellArch?.getArchEnchantmentAt) {
          return global.SpellArch.getArchEnchantmentAt(z.center.q, z.center.r);
        }
        const tile = global.GameState?.board?.get(`${z.center?.q},${z.center?.r}`);
        if (!tile) return null;
        if (tile.fortified) return 'lock';
        if (tile.woven) return 'weave';
        if (tile.phased) return 'phase';
        if (tile.burned) return 'burn';
        return null;
      };
      const isZoneLocked = (z) => getZoneEnch(z) === 'lock';

      // 1. Build adjacency between touching Arch zones (excluding Burn Arch & isolating Lock Arch)
      const zoneAdj = new Map();
      archZones.forEach(z => zoneAdj.set(z.id || `${z.center?.q},${z.center?.r}`, new Set()));

      for (let i = 0; i < archZones.length; i++) {
        for (let j = i + 1; j < archZones.length; j++) {
          const zA = archZones[i];
          const zB = archZones[j];
          const enchA = getZoneEnch(zA), enchB = getZoneEnch(zB);
          if (enchA === 'burn' || enchB === 'burn') continue;
          if (isZoneLocked(zA) !== isZoneLocked(zB)) continue;

          const idA = zA.id || `${zA.center?.q},${zA.center?.r}`;
          const idB = zB.id || `${zB.center?.q},${zB.center?.r}`;
          const touch = global.SpellArch?.doArchZonesTouch
            ? global.SpellArch.doArchZonesTouch(zA, zB)
            : false;
          if (touch) {
            zoneAdj.get(idA)?.add(zB);
            zoneAdj.get(idB)?.add(zA);
            interArchEdges.push([zA, zB]);
          }
        }
      }

      // 2. Partition Arch zones into connected touching components
      const visitedZones = new Set();
      const archComponents = [];

      for (const zone of archZones) {
        const zId = zone.id || `${zone.center?.q},${zone.center?.r}`;
        if (visitedZones.has(zId)) continue;

        const comp = [];
        const queue = [zone];
        visitedZones.add(zId);

        while (queue.length > 0) {
          const curr = queue.shift();
          comp.push(curr);
          const currId = curr.id || `${curr.center?.q},${curr.center?.r}`;
          const neighbors = zoneAdj.get(currId) || new Set();
          for (const nZone of neighbors) {
            const nId = nZone.id || `${nZone.center?.q},${nZone.center?.r}`;
            if (!visitedZones.has(nId)) {
              visitedZones.add(nId);
              queue.push(nZone);
            }
          }
        }
        archComponents.push(comp);
      }

      // Helper: distance between sigil and zone center
      const math = global.HexMath;
      const getDist = (sigil, zone) => {
        if (!math || !zone.center || !sigil.tiles) return 999;
        let minDist = 999;
        for (const tk of sigil.tiles) {
          const [tq, tr] = tk.split(',').map(Number);
          const d = math.hexDistanceBetween ? math.hexDistanceBetween(tq, tr, zone.center.q, zone.center.r)
            : (math.hexDistance ? math.hexDistance(tq - zone.center.q, tr - zone.center.r) : 999);
          if (d < minDist) minDist = d;
        }
        return minDist;
      };

      // 3. Connect real sigils to arch zones (excluding Burn Arch, Burn-component sigils, and isolating Lock from non-Lock)
      const sigilLockZoneMap = new Map();
      for (const sigil of sigils) {
        if (sigil.tiles?.some(tk => global.GameState?.board?.get(tk)?.burned)) continue;
        for (const comp of archComponents) {
          const touchingInComp = comp.filter(z => this.sigilTouchesArchZone(sigil, z) && getZoneEnch(z) !== 'burn');
          if (touchingInComp.length === 0) continue;

          const validTouching = touchingInComp.filter(z => {
            const zLocked = isZoneLocked(z);
            if (!sigilLockZoneMap.has(sigil.id)) return true;
            return sigilLockZoneMap.get(sigil.id) === zLocked;
          });
          if (validTouching.length === 0) continue;

          if (comp.length === 1) {
            validTouching.forEach(z => {
              sigilArchEdges.push({ sigil, zone: z });
              sigilLockZoneMap.set(sigil.id, isZoneLocked(z));
            });
          } else {
            validTouching.sort((zA, zB) => {
              const dA = getDist(sigil, zA);
              const dB = getDist(sigil, zB);
              if (dA !== dB) return dA - dB;
              if (zA.center.r !== zB.center.r) return zA.center.r - zB.center.r;
              return zA.center.q - zB.center.q;
            });
            const chosen = validTouching[0];
            sigilArchEdges.push({ sigil, zone: chosen });
            sigilLockZoneMap.set(sigil.id, isZoneLocked(chosen));
          }
        }
      }

      // 4. Burn Arch: Connects directly to disease tokens within its area
      archZones.forEach(z => {
        if (getZoneEnch(z) === 'burn') {
          const tiles = z.flowerTiles || z.allZoneTiles || [];
          tiles.forEach(tk => {
            const tile = global.GameState?.board?.get(tk);
            if (tile && (tile.color === 'disease' || tile.plagueId)) {
              diseaseArchEdges.push({ zone: z, tileKey: tk });
            }
          });
        }
      });

      return { interArchEdges, sigilArchEdges, diseaseArchEdges };
    }
  }

  const sigilEngineInstance = new SigilEngineClass();

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Sigil_Engine_1.0', sigilEngineInstance);
  global.SigilEngineClass = SigilEngineClass;
  global.SigilEngine = sigilEngineInstance;
})(typeof window !== 'undefined' ? window : this);
