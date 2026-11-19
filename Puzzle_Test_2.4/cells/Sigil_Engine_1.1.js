/**
 * @fileoverview cells/Sigil_Engine_1.1.js - Resonance Alignments, Adjacency & Cluster Scoring
 * @description Computes resonant clusters across locked sigils and Arch pseudo-sigils, adjacency
 * predicates, combo text formatting, and triangular progression scoring.
 */

(function(global) {
  'use strict';

  const SigilEngineClass = global.SigilEngineClass;
  if (!SigilEngineClass) return;

  const proto = SigilEngineClass.prototype;

  /**
   * Finds active resonant alignments between locked sigils and active Arch pseudo-sigils.
   * Two sigils resonate if their center tiles are adjacent, share a common vertex edge,
   * or are bridged via active Arch pseudo-sigil alignment conduits.
   * @param {Array<Object>} lockedSigils
   * @param {Array<Object>} archZones
   * @returns {{ resonantSigils: Set<string>, resonantArchZoneIds: Set<string>, resonantPairs: Array<Array<Object>>, clusters: Array<Object> }}
   */
  proto.findResonances = function(lockedSigils, archZones = []) {
    const resonantSigils = new Set();
    const resonantArchZoneIds = new Set();
    const resonantPairs = [];

    // Compute valid Arch connections (inter-arch and sigil-to-arch)
    const { interArchEdges, sigilArchEdges } = this.getValidArchConnections(lockedSigils, archZones);

    // Track sigils inhibited from resonance (Lock Arch connected OR containing a Burn component)
    const inhibitedSigilIds = new Set();
    sigilArchEdges.forEach(({ sigil, zone }) => {
      const tile = global.GameState?.board?.get(`${zone.center?.q},${zone.center?.r}`);
      if (tile?.fortified) inhibitedSigilIds.add(sigil.id);
    });
    lockedSigils.forEach(s => {
      if (s.tiles?.some(tk => global.GameState?.board?.get(tk)?.burned)) inhibitedSigilIds.add(s.id);
    });

    // Unified adjacency graph: nodes can be sigils or arch zones
    const adjGraph = new Map();
    const sigilMap = new Map();
    const zoneMap = new Map();

    lockedSigils.forEach(s => { adjGraph.set(s.id, new Set()); sigilMap.set(s.id, s); });
    archZones.forEach(z => { const zId = z.id || `${z.center?.q},${z.center?.r}`; adjGraph.set(zId, new Set()); zoneMap.set(zId, z); });

    // 1. Direct triangle edge or vertex adjacency check between real sigils
    for (let i = 0; i < lockedSigils.length; i++) {
      for (let j = i + 1; j < lockedSigils.length; j++) {
        const s1 = lockedSigils[i];
        const s2 = lockedSigils[j];
        if (inhibitedSigilIds.has(s1.id) || inhibitedSigilIds.has(s2.id)) continue;

        if (this.areSigilsAdjacent(s1, s2)) {
          adjGraph.get(s1.id)?.add(s2.id);
          adjGraph.get(s2.id)?.add(s1.id);
          resonantPairs.push([s1, s2]);
        }
      }
    }

    // 2. Inter-Arch connections (touching Arch pseudo-sigils)
    interArchEdges.forEach(([zA, zB]) => {
      const idA = zA.id || `${zA.center?.q},${zA.center?.r}`;
      const idB = zB.id || `${zB.center?.q},${zB.center?.r}`;
      adjGraph.get(idA)?.add(idB);
      adjGraph.get(idB)?.add(idA);
    });

    // 3. Sigil-to-Arch connections (Lock Arch and inhibited sigils cannot bridge resonance)
    sigilArchEdges.forEach(({ sigil, zone }) => {
      const tile = global.GameState?.board?.get(`${zone.center?.q},${zone.center?.r}`);
      if (tile?.fortified || inhibitedSigilIds.has(sigil.id)) return;

      const zId = zone.id || `${zone.center?.q},${zone.center?.r}`;
      adjGraph.get(sigil.id)?.add(zId);
      adjGraph.get(zId)?.add(sigil.id);
    });

    // 4. Partition into connected component clusters
    const clusters = [];
    const visited = new Set();
    const allNodeIds = Array.from(adjGraph.keys());

    for (const startId of allNodeIds) {
      if (visited.has(startId)) continue;

      const clusterSigils = [];
      const clusterZones = [];
      const queue = [startId];
      visited.add(startId);

      while (queue.length > 0) {
        const currId = queue.shift();
        if (sigilMap.has(currId)) {
          clusterSigils.push(sigilMap.get(currId));
        } else if (zoneMap.has(currId)) {
          clusterZones.push(zoneMap.get(currId));
        }

        const neighbors = adjGraph.get(currId) || new Set();
        for (const nId of neighbors) {
          if (!visited.has(nId)) {
            visited.add(nId);
            queue.push(nId);
          }
        }
      }

      const totalNodes = clusterSigils.length + clusterZones.length;
      // Lock Stasis: check if any Arch zone in this cluster is Lock-inhibited
      const isClusterLocked = clusterZones.some(z => {
        const tile = global.GameState?.board?.get(`${z.center?.q},${z.center?.r}`);
        return !!(tile?.fortified);
      });

      // Resonates if total connected nodes >= 2 AND at least 1 real sigil is present AND NOT locked
      if (totalNodes >= 2 && clusterSigils.length >= 1 && !isClusterLocked) {
        clusterSigils.forEach(s => resonantSigils.add(s.id));
        clusterZones.forEach(z => resonantArchZoneIds.add(z.id || `${z.center?.q},${z.center?.r}`));
        clusters.push({
          sigils: clusterSigils,
          archZones: clusterZones,
          length: clusterSigils.length
        });
      }
    }

    // Only retain pairs whose sigils both actually resonated (filters out locked clusters)
    const validResonantPairs = resonantPairs.filter(([s1, s2]) => resonantSigils.has(s1.id) && resonantSigils.has(s2.id));

    this.lastAdjacentPairs = validResonantPairs;
    this.lastClusters = clusters;
    this.lastResonantArchZoneIds = resonantArchZoneIds;

    return {
      resonantSigils,
      resonantArchZoneIds,
      resonantPairs: validResonantPairs,
      clusters
    };
  };

  /**
   * Checks if two triangular sigils are adjacent (share a boundary vertex or edge).
   */
  proto.areSigilsAdjacent = function(s1, s2) {
    if (!s1 || !s2 || !global.HexMath) return false;
    const math = global.HexMath;

    // Check distance between constituent tiles
    for (const t1 of s1.tiles) {
      const [q1, r1] = t1.split(',').map(Number);
      for (const t2 of s2.tiles) {
        const [q2, r2] = t2.split(',').map(Number);
        if (math.hexDistanceBetween(q1, r1, q2, r2) <= 1) {
          return true;
        }
      }
    }
    return false;
  };

  /**
   * Checks if a sigil is within or adjacent to an Arch flower zone.
   * Matches the visual overlay alignment condition exactly.
   */
  proto.sigilTouchesArchZone = function(sigil, zone) {
    if (!sigil || !sigil.tiles || !zone) return false;
    if (global.SpellArch?.isSigilInOrAdjacentToArch) {
      return global.SpellArch.isSigilInOrAdjacentToArch(sigil, zone);
    }
    const zoneSet = new Set(zone.flowerTiles || zone.allZoneTiles || []);
    for (const tk of sigil.tiles) {
      if (zoneSet.has(tk)) return true;
      const [q, r] = tk.split(',').map(Number);
      if (global.HexMath) {
        const neighbors = global.HexMath.getNeighbors(q, r).map(([nq, nr]) => `${nq},${nr}`);
        if (neighbors.some(nk => zoneSet.has(nk))) return true;
      }
    }
    return false;
  };

  proto.getAdjacentPairs = function() { return this.lastAdjacentPairs || []; };
  proto.getClusters = function() { return this.lastClusters || []; };
  proto.getClusterSizes = function() { return (this.lastClusters || []).map(c => (c.sigils ? c.sigils.length : c.length)); };

  /**
   * Formats the combo indicator string:
   * e.g. "0" when no alignments exist, "(1)" for single sigil with arch, "(2)" for a pair, "(2,2)" etc.
   */
  proto.getComboText = function() {
    const sizes = this.getClusterSizes();
    if (!sizes || sizes.length === 0) return '0';
    return `(${sizes.join(',')})`;
  };

  /**
   * Calculates triangular progression score for a single connected cluster:
   * N=1 (single sigil + Arch flower) -> 1 pt
   * N=2 -> 3 pts
   * N=3 -> 6 pts
   * N=4 -> 10 pts
   */
  proto.calculateClusterPoints = function(size) {
    if (size < 1) return 0;
    return (size * (size + 1)) / 2;
  };

  /**
   * Calculates total points across all distinct connected clusters.
   */
  proto.calculateTotalPoints = function() {
    const sizes = this.getClusterSizes();
    if (!sizes || sizes.length === 0) return 0;
    return sizes.reduce((sum, sz) => sum + this.calculateClusterPoints(sz), 0);
  };

  proto.calculateTriangularPoints = function(resonantCount) {
    return this.calculateTotalPoints();
  };

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Sigil_Engine_1.1', global.SigilEngine);
})(typeof window !== 'undefined' ? window : this);
