/**
 * @fileoverview cells/Hex_Bilateral_Math_1.1.js - Multi-Part Cell: Part 1.1 of Hex_Bilateral_Math
 * @description Concentric CCW Topology Registries for Vertices and Tiles:
 * 1. Vertex Geometry & Screen Mapping (getVertexTiles, vertexToScreen, stepVertex, findClosestVertex).
 * 2. Concentric CCW Vertex Registry (VERTEX_REGISTRY, getVertexId, getVertexById, getRingVertices).
 * 3. Concentric CCW Tile Registry (TILE_REGISTRY, getTileId, getTileById, getRingTiles).
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const m = global.HexMath || global.HexBilateralMath;
  if (!m) {
    console.error('[Hex_Bilateral_Math_1.1] HexMath not found. Ensure Hex_Bilateral_Math_1.0.js is loaded first.');
    return;
  }

  const hexDistance = m.hexDistance;
  const hexToScreen = m.hexToScreen;
  const screenToHex = m.screenToHex;

  /**
   * Get the 3 constituent tile keys for a given vertex.
   */
  function getVertexTiles(v) {
    if (!v) return [];
    if (v.type === 'up') {
      return [`${v.q},${v.r}`, `${v.q + 1},${v.r}`, `${v.q},${v.r + 1}`];
    } else {
      return [`${v.q},${v.r}`, `${v.q},${v.r - 1}`, `${v.q - 1},${v.r}`];
    }
  }

  /**
   * Convert a vertex to screen pixel coordinates on canvas.
   */
  function vertexToScreen(v, originX, originY, hexRadius) {
    if (!v) return { x: originX, y: originY };
    const center = hexToScreen(v.q, v.r, originX, originY, hexRadius);
    if (v.type === 'up') {
      return { x: center.x, y: center.y - hexRadius };
    } else {
      return { x: center.x, y: center.y + hexRadius };
    }
  }

  /**
   * Step from one vertex to adjacent vertex along vertical lines (Up/Down) or X-axis zigzag seam (Left/Right).
   */
  function stepVertex(v, dir) {
    if (!v) return { type: 'up', q: 0, r: 0 };
    const { type, q, r } = v;
    if (type === 'up') {
      if (dir === 'up') return { type: 'down', q: q + 1, r: r + 1 };
      if (dir === 'down') return { type: 'down', q: q, r: r };
      if (dir === 'left') return { type: 'down', q: q, r: r + 1 };
      if (dir === 'right') return { type: 'down', q: q + 1, r: r };
    } else {
      if (dir === 'up') return { type: 'up', q: q, r: r };
      if (dir === 'down') return { type: 'up', q: q - 1, r: r - 1 };
      if (dir === 'left') return { type: 'up', q: q - 1, r: r };
      if (dir === 'right') return { type: 'up', q: q, r: r - 1 };
    }
    return v;
  }

  /**
   * Identify the mutual center vertex for any 3-hex triangular cluster.
   */
  function findVertexForTiles(tiles) {
    if (!tiles || tiles.length < 3) return null;
    const set = new Set(tiles);
    for (const tk of tiles) {
      const [q, r] = tk.split(',').map(Number);
      if (set.has(`${q + 1},${r}`) && set.has(`${q},${r + 1}`)) {
        return { type: 'up', q, r };
      }
      if (set.has(`${q},${r - 1}`) && set.has(`${q - 1},${r}`)) {
        return { type: 'down', q, r };
      }
    }
    return null;
  }

  /**
   * Identify the closest vertex to a given screen pixel coordinate.
   */
  function findClosestVertex(screenX, screenY, originX, originY, hexRadius) {
    const h = screenToHex(screenX, screenY, originX, originY, hexRadius);
    if (!h) return null;
    const candidateVertices = [
      { type: 'up', q: h.q, r: h.r },
      { type: 'down', q: h.q, r: h.r },
      { type: 'up', q: h.q, r: h.r - 1 },
      { type: 'down', q: h.q, r: h.r + 1 },
      { type: 'up', q: h.q - 1, r: h.r },
      { type: 'down', q: h.q + 1, r: h.r }
    ];
    let bestV = null, bestDist = Infinity;
    for (const v of candidateVertices) {
      const pos = vertexToScreen(v, originX, originY, hexRadius);
      const d = Math.hypot(screenX - pos.x, screenY - pos.y);
      if (d < bestDist) {
        bestDist = d;
        bestV = v;
      }
    }
    return bestV;
  }

  // ==========================================================================
  // CONCENTRIC CCW VERTEX REGISTRY
  // Ring 0 (6 vertices, IDs 1-6), Ring 1 (18 vertices, IDs 7-24), Ring 2 (30 vertices, IDs 25-54)...
  // Origin of each ring: Bottom-center vertex (first entry, angle = 0).
  // Traversal order: Strict Counter-Clockwise (CCW).
  // ==========================================================================
  const VERTEX_REGISTRY = new Map();
  const VERTEX_LOOKUP = new Map();
  const RING_REGISTRY = new Map();

  function initVertexRegistry(maxRings = 14) {
    const rawRings = Array.from({ length: maxRings + 1 }, () => []);
    const visited = new Set();
    const scanLimit = maxRings + 1;
    RING_REGISTRY.clear();
    VERTEX_REGISTRY.clear();
    VERTEX_LOOKUP.clear();

    for (let q = -scanLimit; q <= scanLimit; q++) {
      for (let r = -scanLimit; r <= scanLimit; r++) {
        if (hexDistance(q, r) > scanLimit) continue;
        for (const type of ['up', 'down']) {
          const key = `${type},${q},${r}`;
          if (visited.has(key)) continue;
          visited.add(key);

          const tiles = getVertexTiles({ type, q, r });
          let dMax = 0;
          for (const tk of tiles) {
            const [tq, tr] = tk.split(',').map(Number);
            const dist = hexDistance(tq, tr);
            if (dist > dMax) dMax = dist;
          }
          const ring = dMax - 1;
          if (ring >= 0 && ring <= maxRings) {
            const pos = vertexToScreen({ type, q, r }, 0, 0, 100);
            let angle = Math.atan2(pos.x, pos.y);
            if (angle < -1e-6) angle += Math.PI * 2;
            else if (Math.abs(angle) <= 1e-6) angle = 0;
            rawRings[ring].push({ type, q, r, angle, key });
          }
        }
      }
    }

    let nextId = 1;
    for (let ring = 0; ring <= maxRings; ring++) {
      rawRings[ring].sort((a, b) => a.angle - b.angle);
      RING_REGISTRY.set(ring, rawRings[ring].map(item => ({ type: item.type, q: item.q, r: item.r })));
      rawRings[ring].forEach((item, idx) => {
        const id = nextId++;
        const record = { id, ring, indexInRing: idx + 1, type: item.type, q: item.q, r: item.r };
        VERTEX_REGISTRY.set(id, record);
        VERTEX_LOOKUP.set(item.key, id);
      });
    }
  }

  initVertexRegistry(14);

  function getVertexId(v) {
    if (!v) return null;
    return VERTEX_LOOKUP.get(`${v.type},${v.q},${v.r}`) || null;
  }

  function getVertexById(id) {
    return VERTEX_REGISTRY.get(id) || null;
  }

  function getRingVertices(ring) {
    return RING_REGISTRY.get(ring) || null;
  }

  // ==========================================================================
  // CONCENTRIC CCW TILE REGISTRY
  // Ring 0 (1 tile, ID 1), Ring 1 (6 tiles, IDs 2-7), Ring 2 (12 tiles, IDs 8-19)...
  // Origin: Even rings start bottom-center (x=0); Odd rings start right of center (x>0).
  // Traversal order: Strict Counter-Clockwise (CCW).
  // ==========================================================================
  const TILE_REGISTRY = new Map();
  const TILE_LOOKUP = new Map();
  const TILE_RING_REGISTRY = new Map();

  function initTileRegistry(maxRings = 14) {
    const rawRings = Array.from({ length: maxRings + 1 }, () => []);
    TILE_RING_REGISTRY.clear();
    TILE_REGISTRY.clear();
    TILE_LOOKUP.clear();

    for (let q = -maxRings; q <= maxRings; q++) {
      for (let r = -maxRings; r <= maxRings; r++) {
        const ring = hexDistance(q, r);
        if (ring <= maxRings) {
          const pos = hexToScreen(q, r, 0, 0, 100);
          let angle = Math.atan2(pos.x, pos.y);
          if (angle < -1e-6) angle += Math.PI * 2;
          else if (Math.abs(angle) <= 1e-6) angle = 0;
          rawRings[ring].push({ q, r, angle, key: `${q},${r}` });
        }
      }
    }

    let nextId = 1;
    for (let ring = 0; ring <= maxRings; ring++) {
      rawRings[ring].sort((a, b) => a.angle - b.angle);
      TILE_RING_REGISTRY.set(ring, rawRings[ring].map(item => ({ q: item.q, r: item.r })));
      rawRings[ring].forEach((item, idx) => {
        const id = nextId++;
        const record = { id, ring, indexInRing: idx + 1, q: item.q, r: item.r, key: item.key };
        TILE_REGISTRY.set(id, record);
        TILE_LOOKUP.set(item.key, id);
      });
    }
  }

  initTileRegistry(14);

  function getTileId(q, r) {
    if (typeof q === 'object' && q !== null) return TILE_LOOKUP.get(`${q.q},${q.r}`) || null;
    return TILE_LOOKUP.get(`${q},${r}`) || null;
  }

  function getTileById(id) {
    return TILE_REGISTRY.get(id) || null;
  }

  function getRingTiles(ring) {
    return TILE_RING_REGISTRY.get(ring) || null;
  }

  // Extend the HexMath instance
  Object.assign(m, {
    getVertexTiles,
    vertexToScreen,
    stepVertex,
    findVertexForTiles,
    findClosestVertex,
    getVertexId,
    getVertexById,
    getRingVertices,
    VERTEX_REGISTRY,
    VERTEX_LOOKUP,
    RING_REGISTRY,
    initVertexRegistry,
    getTileId,
    getTileById,
    getRingTiles,
    TILE_REGISTRY,
    TILE_LOOKUP,
    TILE_RING_REGISTRY,
    initTileRegistry
  });

})(typeof window !== 'undefined' ? window : this);

