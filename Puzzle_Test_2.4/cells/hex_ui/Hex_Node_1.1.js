/**
 * @fileoverview cells/hex_ui/Hex_Node_1.1.js - Retained-Mode Scene Graph Node Rendering & Aperture Pipeline (Part 2/2)
 * @description Manages Canvas 2D rasterization, offscreen bezel caching, viewport frustum culling,
 * auto-highlight borders, aperture clipping, and recursive rendering of traits, nested children, and tethered satellites.
 * Strictly adheres to the 500-line hard cap and modular multi-part architecture.
 */

(function(global) {
  'use strict';

  const HexNode = global.HexNode;
  if (!HexNode) {
    console.error('Hex_Node_1.0 must be loaded before Hex_Node_1.1');
    return;
  }

  const Proto = HexNode.prototype;

  /**
   * Offscreen rasterization cache for static button bezels.
   */
  Proto._rasterizeBezelCache = function(bezel, vertices) {
    if (typeof document === 'undefined') return;
    const pad = (this.style.outerHighlight?.blur || 18) + 12;
    const hw = (this.dimensions.wBase * 0.5 + this.dimensions.apex) + pad;
    const hh = (this.dimensions.hBase * 0.5 + this.dimensions.apex) + pad;
    const cw = Math.max(1, Math.ceil(hw * 2));
    const ch = Math.max(1, Math.ceil(hh * 2));

    if (!this._cachedBezel) {
      this._cachedBezel = document.createElement('canvas');
    }
    this._cachedBezel.width = cw;
    this._cachedBezel.height = ch;
    const bCtx = this._cachedBezel.getContext('2d');
    bCtx.translate(cw * 0.5, ch * 0.5);
    bezel.renderFrameBezel(bCtx, vertices, this.style);

    this._bezelHalfW = cw * 0.5;
    this._bezelHalfH = ch * 0.5;
    this._dirtyBezel = false;
  };

  /**
   * Primary retained-mode Canvas 2D render pipeline for this node and its children.
   * @param {CanvasRenderingContext2D} ctx - Target 2D rendering context.
   */
  Proto.render = function(ctx) {
    if (!this.visible) return;

    // Fast Viewport Frustum Culling for leaf nodes (skips off-screen rendered items)
    if (this.parent && this.children.length === 0 && !this.clipContent) {
      const wx = this.worldMatrix[4];
      const wy = this.worldMatrix[5];
      const maxExtent = (this.dimensions.wBase * 0.5 + this.dimensions.apex + 40);
      const cw = ctx.canvas?.width || 2500;
      const ch = ctx.canvas?.height || 2500;
      if (wx + maxExtent < 0 || wx - maxExtent > cw || wy + maxExtent < 0 || wy - maxExtent > ch) {
        return;
      }
    }

    ctx.save();
    try {
      if (this.alpha !== undefined && this.alpha < 1.0) {
        ctx.globalAlpha *= Math.max(0, this.alpha);
      }
      if (this.ghost) {
        ctx.globalAlpha *= 0.35;
      }

      // Apply world transform
      const w = this.worldMatrix;
      ctx.setTransform(w[0], w[1], w[2], w[3], w[4], w[5]);

      const vertices = this.getVertices();

      // 1. Render Frame Bezel (Shared Atlas Stamp, Cached Bitmap, or Direct Vector Path)
      const atlas = global.HexFrameAtlas;
      const btnTrait = this.getTrait('button');
      const isHovered = (!this.ghost && btnTrait) ? (btnTrait.state === 'hovered' || btnTrait.state === 'pressed' || btnTrait.active) : false;
      const isSidebarBtn = this.isSidebarButton || (typeof this.id === 'string' && (
        this.id.startsWith('btn-nav-') ||
        this.id.startsWith('btn-ctrl-') ||
        this.id.startsWith('btn-spell-slot-') ||
        this.id.startsWith('btn-mat-slot-') ||
        this.id.startsWith('btn-comp-') ||
        this.id === 'native-top-stat-pod' ||
        this.id === 'native-bot-stat-pod'
      ));
      const hasChildren = this.children.length > 0;
      const bezel = global.HexBezelRenderer;
      let activeStyle = this.style;

      // Auto-Highlight Mode: Standard Double Wireframe Borders (Orange #ff9214 by default, or Yellow #fde047 with orange on hover/click)
      if (this.highlight && bezel && this.style && !this.ghost) {
        const isYellow = this.highlightColor === 'yellow' || this.highlightColor === '#fde047';
        const isCyan = this.highlightColor === 'cyan' || this.highlightColor === '#38bdf8' || this.highlightColor === '#06b6d4';
        const hlColor = isCyan ? '#38bdf8' : ((isYellow && isHovered) ? '#ff9214' : (isYellow ? '#fde047' : (this.highlightColor || '#ff9214')));
        activeStyle = {
          ...this.style,
          innerHighlight: {
            ...(this.style.innerHighlight || {}),
            enabled: true,
            color: hlColor,
            sharpEdgeColor: hlColor,
            spread: 8,
            intensity: 0.85,
            steps: 3
          },
          outerHighlight: {
            ...(this.style.outerHighlight || {}),
            enabled: true,
            color: hlColor,
            sharpEdgeColor: hlColor,
            blur: 8,
            intensity: 0.85,
            steps: 3
          }
        };
      } else if (bezel && isHovered && isSidebarBtn && this.style && !this.ghost) {
        const isSpellBtn = typeof this.id === 'string' && this.id.startsWith('btn-spell-slot-');
        const prim = isSpellBtn ? (this.elemInfo?.color || this.spellData?.prim || '#ff9214') : '#ff9214';
        const sec = isSpellBtn ? (this.elemInfo?.sec || this.spellData?.sec || '#ffffff') : '#ff9214';
        const innerThickness = this.style.innerHighlight?.stepThickness !== undefined
          ? (this.style.innerHighlight.stepThickness * (this.style.innerHighlight?.steps || 3))
          : (this.style.innerHighlight?.spread !== undefined
              ? this.style.innerHighlight.spread
              : (this.style.innerHighlight?.fade !== undefined ? this.style.innerHighlight.fade : 8));
        const innerSteps = this.style.innerHighlight?.steps !== undefined ? this.style.innerHighlight.steps : 3;

        activeStyle = {
          ...this.style,
          innerHighlight: {
            ...(this.style.innerHighlight || {}),
            enabled: true,
            color: prim,
            sharpEdgeColor: prim
          },
          outerHighlight: {
            ...(this.style.outerHighlight || {}),
            enabled: true,
            color: sec,
            sharpEdgeColor: sec,
            blur: innerThickness,
            intensity: 0.80,
            steps: innerSteps
          }
        };
      }

      if (!hasChildren && !isSidebarBtn && this.atlasKey && atlas && atlas.enabled && !this.highlight) {
        const stamp = atlas.getButtonStamp(this.atlasKey, isHovered);
        if (stamp) {
          ctx.drawImage(stamp.canvas, -stamp.halfW, -stamp.halfH);
        }
      } else if (bezel) {
        if (hasChildren) {
          // Container background renders as base layer underneath traits and children
          bezel.renderFrameBackground(ctx, vertices, activeStyle);
        } else if (this.cacheBezel && !isHovered && !this.highlight) {
          if (!this._cachedBezel || this._dirtyGeometry || this._dirtyBezel) {
            this._rasterizeBezelCache(bezel, vertices);
          }
          if (this._cachedBezel) {
            ctx.drawImage(this._cachedBezel, -this._bezelHalfW, -this._bezelHalfH);
          }
        } else {
          bezel.renderFrameBezel(ctx, vertices, activeStyle);
        }
      }

      const cAlpha = (this.contentAlpha !== undefined) ? Math.max(0, Math.min(1, this.contentAlpha)) : 1.0;

      // 2. Render Node Traits & 3. Internally Nested Children (Clipped to Aperture)
      if (cAlpha > 0.001) {
        ctx.save();
        if (cAlpha < 0.999) ctx.globalAlpha *= cAlpha;
        this.traits.forEach(trait => {
          if (typeof trait.render === 'function') {
            try {
              trait.render(ctx, this);
            } catch (err) {
              console.warn(`Error rendering trait ${trait.name || ''} on node ${this.id}:`, err);
            }
          }
        });

        if (hasChildren) {
          ctx.save();
          try {
            if (this.clipContent) {
              const geom = global.HexFrameGeometry;
              if (geom) {
                geom.buildPath(ctx, vertices);
                ctx.clip();
              }
            }
            for (let i = 0; i < this.children.length; i++) {
              this.children[i].render(ctx);
            }
          } finally {
            ctx.restore();
          }
        }
        ctx.restore();
      }

      // 4. Render Frame Borders ON TOP of Children (contents layer under borders, over background)
      if (hasChildren && bezel) {
        bezel.renderFrameBorders(ctx, vertices, activeStyle);
      }

      // Ghost Mode: Grounded dark translucent veil over button surface
      if (this.ghost) {
        const geom = global.HexFrameGeometry;
        if (geom) {
          ctx.save();
          geom.buildPath(ctx, vertices);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
          ctx.fill();
          ctx.restore();
        }
      }
    } finally {
      ctx.restore();
    }

    // 5. Render Tethered Satellite Children & Filaments (Outside Frame)
    if (this.tetheredChildren.length > 0 && cAlpha > 0.001) {
      ctx.save();
      if (cAlpha < 0.999) ctx.globalAlpha *= cAlpha;
      for (let i = 0; i < this.tetheredChildren.length; i++) {
        const child = this.tetheredChildren[i];
        const tetherTrait = child.getTrait('tether');
        if (tetherTrait && typeof tetherTrait.renderConnector === 'function') {
          tetherTrait.renderConnector(ctx, this, child);
        }
        child.render(ctx);
      }
      ctx.restore();
    }
  };

})(typeof window !== 'undefined' ? window : this);

