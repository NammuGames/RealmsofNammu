/**
 * @fileoverview Polyhedron_Models.js - Static 3D Geometric Mesh & Polyhedral Solid Models
 * @description Provides normalized vertices, face topologies, and outward normal orientations
 * for the 6 primary polyhedral solids used in Puzzle Test 2.2:
 * - Dodecahedron (Fire / Red) - 12 Pentagons
 * - Icosahedron (Water / Blue) - 20 Triangles
 * - Octahedron (Air / Yellow) - 8 Triangles
 * - Hexahedron / Cube (Earth / Purple) - 6 Squares
 * - Cuboctahedron (Green) - 12 Vertices, 14 Faces (6 Squares, 8 Triangles)
 * - Stellated Octahedron (Orange) - Stella Octangula with 24 Equilateral Regular Triangles
 */

(function(global) {
  'use strict';

  // Golden ratio constants
  const PHI = (1 + Math.sqrt(5)) / 2;
  const INV_PHI = 1 / PHI;

  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

  /**
   * Orients all faces so their geometric normal points outward from the origin.
   */
  function orientModel(model) {
    const { vertices, faces } = model;
    const orientedFaces = faces.map(face => {
      const v0 = vertices[face[0]];
      const v1 = vertices[face[1]];
      const v2 = vertices[face[2]];

      const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
      const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
      const normal = cross3(edge1, edge2);

      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < face.length; i++) {
        cx += vertices[face[i]][0];
        cy += vertices[face[i]][1];
        cz += vertices[face[i]][2];
      }

      if (dot3(normal, [cx, cy, cz]) < 0) {
        return face.slice().reverse();
      }
      return face;
    });

    return { vertices, faces: orientedFaces };
  }

  function createModels() {
    const models = {};

    // 1. DODECAHEDRON (Fire / Red) - 12 Pentagons
    const dScale = 1 / Math.sqrt(3);
    const dVerts = [
      [ 1, 1, 1], [ 1, 1, -1], [ 1, -1, 1], [ 1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
      [0, PHI, INV_PHI], [0, PHI, -INV_PHI], [0, -PHI, INV_PHI], [0, -PHI, -INV_PHI],
      [INV_PHI, 0, PHI], [INV_PHI, 0, -PHI], [-INV_PHI, 0, PHI], [-INV_PHI, 0, -PHI],
      [PHI, INV_PHI, 0], [PHI, -INV_PHI, 0], [-PHI, INV_PHI, 0], [-PHI, -INV_PHI, 0]
    ].map(v => [v[0] * dScale, v[1] * dScale, v[2] * dScale]);
    const dFaces = [
      [8, 9, 1, 16, 0], [8, 0, 12, 14, 4], [8, 4, 18, 5, 9], [10, 11, 7, 19, 6],
      [10, 6, 14, 12, 2], [10, 2, 17, 3, 11], [0, 16, 17, 2, 12], [1, 9, 5, 15, 13],
      [1, 13, 3, 17, 16], [4, 14, 6, 19, 18], [5, 18, 19, 7, 15], [3, 13, 15, 7, 11]
    ];
    models.dodecahedron = orientModel({ vertices: dVerts, faces: dFaces });

    // 2. ICOSAHEDRON (Water / Blue) - 20 Triangles
    const iScale = 1 / Math.sqrt(1 + PHI * PHI);
    const iVerts = [
      [0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI],
      [1, PHI, 0], [1, -PHI, 0], [-1, PHI, 0], [-1, -PHI, 0],
      [PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, 1], [-PHI, 0, -1]
    ].map(v => [v[0] * iScale, v[1] * iScale, v[2] * iScale]);
    const iFaces = [
      [0, 8, 4], [0, 4, 6], [0, 6, 10], [0, 10, 2], [0, 2, 8],
      [1, 4, 9], [1, 9, 3], [1, 3, 11], [1, 11, 6], [1, 6, 4],
      [2, 5, 8], [2, 7, 5], [2, 10, 7], [3, 9, 5], [3, 5, 7], [3, 7, 11],
      [8, 5, 9], [8, 9, 4], [10, 6, 11], [10, 11, 7]
    ];
    models.icosahedron = orientModel({ vertices: iVerts, faces: iFaces });

    // 3. OCTAHEDRON (Air / Yellow) - 8 Triangles
    const oVerts = [[ 1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const oFaces = [
      [0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2],
      [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5]
    ];
    models.octahedron = orientModel({ vertices: oVerts, faces: oFaces });

    // 4. HEXAHEDRON / CUBE (Earth / Purple) - 6 Squares
    const cScale = 1 / Math.sqrt(3);
    const cubeVerts = [
      [ 1, 1, 1], [ 1, 1, -1], [ 1, -1, 1], [ 1, -1, -1],
      [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]
    ].map(v => [v[0] * cScale, v[1] * cScale, v[2] * cScale]);
    const cubeFaces = [
      [0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]
    ];
    models.cube = orientModel({ vertices: cubeVerts, faces: cubeFaces });

    // 5. CUBOCTAHEDRON (Green) - 12 Verts, 14 Faces (6 Squares, 8 Triangles)
    const coScale = 1 / Math.SQRT2;
    const cuboctaVerts = [
      [ 1, 1, 0], [ 1, -1, 0], [-1, -1, 0], [-1, 1, 0],
      [ 1, 0, 1], [ 1, 0, -1], [-1, 0, -1], [-1, 0, 1],
      [ 0, 1, 1], [ 0, 1, -1], [ 0, -1, -1], [ 0, -1, 1]
    ].map(v => [v[0] * coScale, v[1] * coScale, v[2] * coScale]);
    const rawCuboctaFaces = [
      [0, 4, 1, 5], [3, 6, 2, 7], [0, 8, 3, 9], [1, 10, 2, 11], [4, 8, 7, 11], [5, 10, 6, 9],
      [0, 8, 4], [0, 5, 9], [1, 4, 11], [1, 10, 5], [3, 7, 8], [3, 9, 6], [2, 11, 7], [2, 6, 10]
    ];
    models.cuboctahedron = orientModel({ vertices: cuboctaVerts, faces: rawCuboctaFaces });

    // 6. STELLATED OCTAHEDRON (Orange) - Stella Octangula with Equilateral Regular Triangles
    const tipScale = 1 / Math.sqrt(3);
    const vVal = 1 / Math.sqrt(3);
    const stellatedVerts = [
      [ 1, 1, 1], [ 1, 1, -1], [ 1, -1, 1], [ 1, -1, -1],
      [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]
    ].map(v => [v[0] * tipScale, v[1] * tipScale, v[2] * tipScale]);
    stellatedVerts.push([vVal, 0, 0], [-vVal, 0, 0], [0, vVal, 0], [0, -vVal, 0], [0, 0, vVal], [0, 0, -vVal]);
    const rawStellatedFaces = [
      [0, 8, 10], [0, 10, 12], [0, 12, 8], [1, 8, 10], [1, 10, 13], [1, 13, 8],
      [2, 8, 11], [2, 11, 12], [2, 12, 8], [3, 8, 11], [3, 11, 13], [3, 13, 8],
      [4, 9, 10], [4, 10, 12], [4, 12, 9], [5, 9, 10], [5, 10, 13], [5, 13, 9],
      [6, 9, 11], [6, 11, 12], [6, 12, 9], [7, 9, 11], [7, 11, 13], [7, 13, 9]
    ];
    models.stellated_octahedron = orientModel({ vertices: stellatedVerts, faces: rawStellatedFaces });

    // 7. TETRAHEDRON (Ether) - 4 Equilateral Triangles, 4 Vertices
    const tScale = 1 / Math.sqrt(3);
    const tVerts = [
      [ 1,  1,  1],
      [ 1, -1, -1],
      [-1,  1, -1],
      [-1, -1,  1]
    ].map(v => [v[0] * tScale, v[1] * tScale, v[2] * tScale]);
    const tFaces = [
      [0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]
    ];
    models.tetrahedron = orientModel({ vertices: tVerts, faces: tFaces });

    return models;
  }

  let _cachedModels = null;
  const PolyhedronModels = {
    getModels() {
      if (!_cachedModels) _cachedModels = createModels();
      return _cachedModels;
    },
    orientModel
  };

  global.PolyhedronModels = PolyhedronModels;
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Polyhedron_Models', PolyhedronModels);
  }

})(typeof window !== 'undefined' ? window : this);
