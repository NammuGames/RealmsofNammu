/**
 * @fileoverview cells/hex_ui/Hex_Node_1.0.js - Retained-Mode Scene Graph Node & Transform Hierarchy (Part 1/2)
 * @description Manages scene graph node state, 2D affine transformation matrices, hierarchy lifecycle,
 * modular ECT trait attachment, polygon vertex caching, and inverse hit testing.
 * Strictly adheres to the 500-line hard cap and modular multi-part architecture.
 */

(function(global) {
  'use strict';

  class HexNode {
    /**
     * @param {Object} options - Node initialization configuration.
     */
    constructor(options = {}) {
      this.id = options.id || `hex-node-${Math.random().toString(36).substring(2, 9)}`;
      this.position = options.position ? { x: options.position.x || 0, y: options.position.y || 0 } : { x: (options.x !== undefined ? options.x : 0), y: (options.y !== undefined ? options.y : 0) };
      this.scale = options.scale !== undefined ? options.scale : 1.0;
      this.rotation = options.rotation || 0.0;
      this.visible = options.visible !== undefined ? options.visible : true;
      this.clipContent = options.clipContent !== undefined ? options.clipContent : true;
      this.alpha = options.alpha !== undefined ? options.alpha : 1.0;
      this.contentAlpha = options.contentAlpha !== undefined ? options.contentAlpha : 1.0;
      this.animating = options.animating || false;

      // 3D Prismatic Hex Dimensions (Foundation + Apex)
      this.dimensions = {
        wBase: options.wBase || 80,
        hBase: options.hBase || 80,
        apex: options.apex !== undefined ? options.apex : 20,
        orientation: options.orientation || 'pointy' // 'pointy' | 'flat'
      };

      // Visual Styling
      this.style = Object.assign({
        bgColor: '#0f172a',
        bgOpacity: 0.45,
        innerHighlight: { enabled: false },
        outerHighlight: { enabled: false }
      }, options.style || {});

      // Inactive Ghost Mode, Standard Double Orange Auto-Highlight Mode & Inert Sub-Pod Flag
      this.ghost = options.ghost !== undefined ? options.ghost : false;
      this.highlight = options.highlight !== undefined ? options.highlight : false;
      this.inert = options.inert !== undefined ? options.inert : false;

      // Hierarchy
      this.parent = null;
      this.children = [];          // Mode A: Internally nested (clipped by aperture)
      this.tetheredChildren = [];  // Mode B: Externally anchored satellites

      // Modular ECT Traits (Only active traits exist)
      this.traits = new Map();

      // Transform Matrices (2D Affine: [a, b, c, d, e, f])
      this.localMatrix = [1, 0, 0, 1, 0, 0];
      this.worldMatrix = [1, 0, 0, 1, 0, 0];
      this.invWorldMatrix = [1, 0, 0, 1, 0, 0];

      // Cached Polygon Vertices
      this._cachedVertices = null;
      this._dirtyGeometry = true;

      // Shared Atlas Stamp Key (e.g. 'cyan', 'red', 'blue')
      this.atlasKey = options.atlasKey || null;

      // Offscreen Cached Bezel Bitmap (zero redundant path & clip rebuilds)
      this.cacheBezel = false;
      this._cachedBezel = null;
      this._bezelHalfW = 0;
      this._bezelHalfH = 0;
      this._dirtyBezel = true;
    }

    /**
     * Returns the 6 local vertices for this node's dimensions.
     */
    getVertices() {
      if (this._dirtyGeometry || !this._cachedVertices) {
        const geom = global.HexFrameGeometry;
        if (geom) {
          this._cachedVertices = geom.getVertices(
            this.dimensions.wBase,
            this.dimensions.hBase,
            this.dimensions.apex,
            this.dimensions.orientation
          );
          this._dirtyGeometry = false;
        } else {
          return [];
        }
      }
      return this._cachedVertices;
    }

    setDimensions(wBase, hBase, apex, orientation) {
      if (wBase !== undefined) this.dimensions.wBase = wBase;
      if (hBase !== undefined) this.dimensions.hBase = hBase;
      if (apex !== undefined) this.dimensions.apex = apex;
      if (orientation !== undefined) this.dimensions.orientation = orientation;
      this._dirtyGeometry = true;
      this._dirtyBezel = true;
    }

    setGhost(ghost = true) {
      this.ghost = !!ghost;
      if (this.ghost) {
        this.highlight = false;
        this.highlightColor = null;
      }
      const btn = this.getTrait('button');
      if (btn) btn.disabled = this.ghost;
    }

    setHighlight(highlight = true, color = null) {
      this.highlight = !!highlight;
      this.highlightColor = highlight ? color : null;
      if (this.highlight) {
        this.ghost = false;
        const btn = this.getTrait('button');
        if (btn) btn.disabled = false;
      }
    }

    invalidateCache() {
      this._dirtyGeometry = true;
      this._dirtyBezel = true;
    }

    // --- Trait Lifecycle (ECT) ---
    addTrait(trait) {
      if (!trait) return this;
      const name = trait.name || (typeof trait.render === 'function' ? 'viewport' : `trait-${Math.random().toString(36).substring(2, 8)}`);
      trait.name = name;
      this.traits.set(name, trait);
      if (typeof trait.onAttach === 'function') {
        trait.onAttach(this);
      }
      return this;
    }

    getTrait(name) {
      return this.traits.get(name) || null;
    }

    removeTrait(name) {
      const trait = this.traits.get(name);
      if (trait) {
        if (typeof trait.onDetach === 'function') {
          trait.onDetach(this);
        }
        this.traits.delete(name);
      }
      return this;
    }

    // --- Hierarchy Lifecycle ---
    addChild(child) {
      if (!child || child === this) return this;
      if (child.parent) child.parent.removeChild(child);
      child.parent = this;
      this.children.push(child);
      return this;
    }

    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        child.parent = null;
        this.children.splice(idx, 1);
      }
      return this;
    }

    addTetheredChild(child) {
      if (!child || child === this) return this;
      if (child.parent) child.parent.removeChild(child);
      child.parent = this;
      this.tetheredChildren.push(child);
      return this;
    }

    removeTetheredChild(child) {
      const idx = this.tetheredChildren.indexOf(child);
      if (idx !== -1) {
        child.parent = null;
        this.tetheredChildren.splice(idx, 1);
      }
      return this;
    }

    // --- Matrix Math & Transform Cascades ---
    updateTransforms(parentWorldMatrix = null) {
      const cos = Math.cos(this.rotation) * this.scale;
      const sin = Math.sin(this.rotation) * this.scale;
      const x = this.position.x;
      const y = this.position.y;

      // Local 2D affine matrix
      this.localMatrix = [cos, sin, -sin, cos, x, y];

      if (parentWorldMatrix) {
        // Concatenate: world = parent * local
        const p = parentWorldMatrix;
        const l = this.localMatrix;
        this.worldMatrix = [
          p[0] * l[0] + p[2] * l[1],
          p[1] * l[0] + p[3] * l[1],
          p[0] * l[2] + p[2] * l[3],
          p[1] * l[2] + p[3] * l[3],
          p[0] * l[4] + p[2] * l[5] + p[4],
          p[1] * l[4] + p[3] * l[5] + p[5]
        ];
      } else {
        this.worldMatrix = this.localMatrix.slice();
      }

      // Compute inverse world matrix for hit testing
      const w = this.worldMatrix;
      const det = w[0] * w[3] - w[1] * w[2];
      if (Math.abs(det) > 1e-8) {
        const invDet = 1.0 / det;
        this.invWorldMatrix = [
          w[3] * invDet,
          -w[1] * invDet,
          -w[2] * invDet,
          w[0] * invDet,
          (w[2] * w[5] - w[3] * w[4]) * invDet,
          (w[1] * w[4] - w[0] * w[5]) * invDet
        ];
      }

      // Update traits
      this.traits.forEach(trait => {
        if (typeof trait.update === 'function') {
          trait.update(this);
        }
      });

      // Cascade to children
      for (let i = 0; i < this.children.length; i++) {
        this.children[i].updateTransforms(this.worldMatrix);
      }
      for (let i = 0; i < this.tetheredChildren.length; i++) {
        this.tetheredChildren[i].updateTransforms(this.worldMatrix);
      }
    }

    /**
     * Transforms screen pixel coordinates into this node's local coordinate space.
     */
    screenToLocal(screenX, screenY) {
      const inv = this.invWorldMatrix;
      return {
        x: inv[0] * screenX + inv[2] * screenY + inv[4],
        y: inv[1] * screenX + inv[3] * screenY + inv[5]
      };
    }

    /**
     * Hit tests query screen coordinates against this node's polygon boundary.
     */
    containsScreenPoint(screenX, screenY) {
      if (!this.visible || this.animating) return false;
      const local = this.screenToLocal(screenX, screenY);
      const geom = global.HexFrameGeometry;
      return geom ? geom.containsPoint(local.x, local.y, this.getVertices()) : false;
    }
  }

  global.HexNode = HexNode;
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Hex_Node', HexNode);
  }
})(typeof window !== 'undefined' ? window : this);

