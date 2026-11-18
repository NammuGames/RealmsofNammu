/**
 * @fileoverview cells/hex_ui/Hex_Frame_Geometry.js - 3D Parameterized Prismatic Hex Geometry Math (Modular Showcase 5 Cell)
 * @description Computes local vertices, Canvas 2D paths, bounding boxes, and ray-casting hit-testing
 * for Pointy-Top and Flat-Top 3-dimension hex frames (Foundation Rectangle + Apex Extrusions).
 */

(function(global) {
  'use strict';

  class HexFrameGeometryClass {
    constructor() {}

    /**
     * Calculates the 6 local polygon vertices centered at (0, 0).
     * @param {number} wBase - Width of central rectangular foundation.
     * @param {number} hBase - Height of central rectangular foundation.
     * @param {number} apex - Apex extrusion (height for pointy-top, width for flat-top).
     * @param {string} orientation - 'pointy' (vertical apex) | 'flat' (horizontal apex).
     * @returns {Array<{x: number, y: number}>} Array of 6 polygon vertices.
     */
    getVertices(wBase, hBase, apex = 0, orientation = 'pointy') {
      const hw = Math.max(0, wBase) * 0.5;
      const hh = Math.max(0, hBase) * 0.5;
      const ap = Math.max(0, apex);

      if (orientation === 'flat') {
        // Flat-Top Prismatic Hex (Horizontal Apex Caps)
        return [
          { x: -hw,       y: -hh }, // V0: Top-Left
          { x:  hw,       y: -hh }, // V1: Top-Right
          { x:  hw + ap,  y:   0 }, // V2: Right Apex
          { x:  hw,       y:  hh }, // V3: Bottom-Right
          { x: -hw,       y:  hh }, // V4: Bottom-Left
          { x: -(hw + ap),y:   0 }  // V5: Left Apex
        ];
      } else {
        // Pointy-Top Prismatic Hex (Vertical Apex Caps)
        return [
          { x:   0, y: -(hh + ap) }, // V0: Top Apex
          { x:  hw, y: -hh },        // V1: Top-Right
          { x:  hw, y:  hh },        // V2: Bottom-Right
          { x:   0, y:  hh + ap },   // V3: Bottom Apex
          { x: -hw, y:  hh },        // V4: Bottom-Left
          { x: -hw, y: -hh }         // V5: Top-Left
        ];
      }
    }

    /**
     * Constructs a closed Canvas 2D path from an array of vertices.
     */
    buildPath(ctx, vertices) {
      if (!ctx || !vertices || vertices.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i].x, vertices[i].y);
      }
      ctx.closePath();
    }

    /**
     * Pixel-perfect point-in-polygon ray-casting test.
     * @param {number} px - Query point X in local coordinate space.
     * @param {number} py - Query point Y in local coordinate space.
     * @param {Array<{x: number, y: number}>} vertices - Array of local vertices.
     * @returns {boolean} True if point lies inside the hex frame.
     */
    containsPoint(px, py, vertices) {
      if (!vertices || vertices.length < 3) return false;
      let inside = false;
      for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i].x, yi = vertices[i].y;
        const xj = vertices[j].x, yj = vertices[j].y;
        const intersect = ((yi > py) !== (yj > py)) &&
                          (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }

    /**
     * Computes the axis-aligned bounding box for an array of vertices.
     */
    getBoundingBox(vertices) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      }
      return {
        minX, maxX, minY, maxY,
        width: maxX - minX,
        height: maxY - minY
      };
    }

    /**
     * Helper to compute parameters for a standard regular hexagon from radius R.
     */
    createRegular(radius, orientation = 'pointy') {
      if (orientation === 'flat') {
        return {
          wBase: radius,
          hBase: radius * Math.sqrt(3),
          apex: radius * 0.5,
          orientation: 'flat'
        };
      } else {
        return {
          wBase: radius * Math.sqrt(3),
          hBase: radius,
          apex: radius * 0.5,
          orientation: 'pointy'
        };
      }
    }
  }

  const instance = new HexFrameGeometryClass();
  global.HexFrameGeometry = instance;
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Hex_Frame_Geometry', instance);
  }
})(typeof window !== 'undefined' ? window : this);
