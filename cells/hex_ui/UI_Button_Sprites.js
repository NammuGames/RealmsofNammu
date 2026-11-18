/**
 * @fileoverview cells/hex_ui/UI_Button_Sprites.js - Cyber Sprite Icons for Sidebar Buttons
 * @description Procedural vector renderer for directional arrow sprites (chevron head + rhombus shaft)
 * and hex rotation sprites (point-top hex crescent with long triangle points and attached arrow chevron),
 * with board-facing corner hotkey badges and live reactive tuning config.
 */

(function(global) {
  'use strict';

  class UIButtonSpritesClass {
    constructor() {
      this.baseArrowW = 34;
      this.baseArrowH = 46;
      this.baseRotR = 21;

      // Live Reactive Tuning Parameters (Tuned via Tuning Drawer "Sprites" tab)
      this.config = {
        tipTL_X: -15,          // Top-Left Horn Tip X (left/right)
        tipBL_X: -18,          // Bottom-Left Horn Tip X (left/right)
        chevronOffsetX: 1,     // Fine X-offset of rotation chevron relative to horn tip
        chevronOffsetY: 0,     // Fine Y-offset of rotation chevron relative to horn tip
        chevronScale: 0.8,     // Size / scale multiplier of rotation chevron by itself
        rotSize: 80,           // Rotation button icon scale
        arrowSize: 90,         // Directional arrow icon scale
        rotOffsetY: 2,         // Rotation icon Y position offset (both parts together)
        hotkeyX: 42,           // Hotkey badge X position (inverted for L/R)
        hotkeyY: 48,           // Hotkey badge Y position
        hotkeyScale: 1.5       // Hotkey badge size / scale multiplier
      };
    }

    /**
     * Unified cyber chevron head (apex at 0, -12; wings at +-16, 8; inner notch at 0, 0).
     * @param {CanvasRenderingContext2D} ctx
     * @param {Object} opts - Styling options (color, sharpColor, isHovered)
     */
    drawChevronHead(ctx, opts = {}) {
      const color = opts.color || '#38bdf8';
      const sharpColor = opts.sharpColor || '#ffffff';
      const isHovered = !!opts.isHovered;

      ctx.beginPath();
      ctx.moveTo(0, -12);       // Forward sharp apex tip
      ctx.lineTo(16, 8);        // Right wing pointy tip
      ctx.lineTo(0, 0);         // Inner notch
      ctx.lineTo(-16, 8);       // Left wing pointy tip
      ctx.closePath();

      // Pass 1: Solid Black Fill (100% Opacity)
      ctx.fillStyle = '#000000';
      ctx.fill();

      // Pass 2: Razor Core Stroke (matches sidebar text color & intensity)
      ctx.strokeStyle = sharpColor;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    /**
     * Draws the directional arrow sprite (chevron head layered ON TOP of thin rhombus shaft).
     * Base sprite points UP (0 radians). Rotated to any angle.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} cx - Center X
     * @param {number} cy - Center Y
     * @param {number|null} size - Scaling factor or height (falls back to this.config.arrowSize)
     * @param {number} angle - Rotation angle in radians
     * @param {Object} opts - Styling options (color, sharpColor, isHovered, isPressed)
     */
    drawArrow(ctx, cx, cy, size = null, angle = 0, opts = {}) {
      const color = opts.color || '#38bdf8';
      const sharpColor = opts.sharpColor || '#ffffff';
      const isHovered = !!opts.isHovered;
      const isPressed = !!opts.isPressed;
      const finalSize = size !== null ? size : (this.config.arrowSize || 90);

      ctx.save();
      ctx.translate(cx, cy);
      if (angle !== 0) ctx.rotate(angle);

      const scale = finalSize / this.baseArrowH;
      ctx.scale(scale, scale);

      if (isPressed) ctx.scale(0.92, 0.92);

      // 1. THIN RHOMBUS SHAFT (RENDERED FIRST so chevron layers on top)
      ctx.beginPath();
      ctx.moveTo(0, -10);       // Connects into chevron notch
      ctx.lineTo(5, 4);         // Right lateral vertex
      ctx.lineTo(0, 20);        // Bottom sharp needle point
      ctx.lineTo(-5, 4);        // Left lateral vertex
      ctx.closePath();

      // Pass 1: Solid Black Fill (100% Opacity)
      ctx.fillStyle = '#000000';
      ctx.fill();

      // Pass 2: Razor Core Stroke (matches sidebar text color & intensity)
      ctx.strokeStyle = sharpColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 2. CHEVRON HEAD (RENDERED ON TOP of shaft)
      ctx.save();
      ctx.translate(0, -10);
      this.drawChevronHead(ctx, opts);
      ctx.restore();

      ctx.restore();
    }

    /**
     * Draws the hex rotation sprite:
     * - Point-top hex crescent body with long triangle points at Top-Left and Bottom-Left.
     * - Chevron head copied from arrow layered ON TOP of the end of the top-left horn.
     * - Bottom-left horn tapers into a long sharp needle point.
     * Base sprite is CCW. Flipped horizontally (scale(-1, 1)) for Clockwise (CW).
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} cx - Center X
     * @param {number} cy - Center Y
     * @param {number|null} size - Outer diameter (falls back to this.config.rotSize)
     * @param {boolean} flipH - If true, mirrors horizontally for Clockwise (CW)
     * @param {Object} opts - Styling options
     */
    drawRotation(ctx, cx, cy, size = null, flipH = false, opts = {}) {
      const color = opts.color || '#38bdf8';
      const sharpColor = opts.sharpColor || '#ffffff';
      const isHovered = !!opts.isHovered;
      const isPressed = !!opts.isPressed;
      const finalSize = size !== null ? size : (this.config.rotSize || 80);
      const offsetY = (this.config.rotOffsetY || 0);

      ctx.save();
      ctx.translate(cx, cy + offsetY);
      if (flipH) ctx.scale(-1, 1);

      const scale = finalSize / (this.baseRotR * 2);
      ctx.scale(scale, scale);

      if (isPressed) ctx.scale(0.92, 0.92);

      // 1. HEX CRESCENT BODY (RENDERED FIRST so chevron layers on top)
      const Rout = 21.0, Rin = 13.5;
      const sqrt3_2 = Math.sqrt(3) * 0.5;

      // Outer Spine Vertices
      const oV0 = { x: 0, y: -Rout };                     // Top
      const oV1 = { x: Rout * sqrt3_2, y: -Rout * 0.5 };  // Top-Right (18.2, -10.5)
      const oV2 = { x: Rout * sqrt3_2, y: Rout * 0.5 };   // Bottom-Right (18.2, 10.5)
      const oV3 = { x: 0, y: Rout };                      // Bottom

      // Inner Spine Vertices
      const iV0 = { x: 0, y: -Rin };                      // Inner Top
      const iV1 = { x: Rin * sqrt3_2, y: -Rin * 0.5 };   // Inner Top-Right (11.7, -6.75)
      const iV2 = { x: Rin * sqrt3_2, y: Rin * 0.5 };    // Inner Bottom-Right (11.7, 6.75)
      const iV3 = { x: 0, y: Rin };                       // Inner Bottom

      // Long Triangle Horn Tips (dynamically reactive from config)
      const tipTL_X = (this.config.tipTL_X !== undefined) ? this.config.tipTL_X : -18.5;
      const tipBL_X = (this.config.tipBL_X !== undefined) ? this.config.tipBL_X : -20.0;
      const tipTL = { x: tipTL_X, y: -9.5 };              // Top-Left Horn Tip (seats chevron)
      const tipBL = { x: tipBL_X, y: 8.5 };               // Bottom-Left Horn Tip (needle point)

      // Crescent Path
      ctx.beginPath();
      // Start at Bottom-Left needle point
      ctx.moveTo(tipBL.x, tipBL.y);
      // Outer spine
      ctx.lineTo(oV3.x, oV3.y);
      ctx.lineTo(oV2.x, oV2.y);
      ctx.lineTo(oV1.x, oV1.y);
      ctx.lineTo(oV0.x, oV0.y);
      // Top-Left long triangle outer edge to tip
      ctx.lineTo(tipTL.x, tipTL.y);
      // Inner spine back down
      ctx.lineTo(iV0.x, iV0.y);
      ctx.lineTo(iV1.x, iV1.y);
      ctx.lineTo(iV2.x, iV2.y);
      ctx.lineTo(iV3.x, iV3.y);
      // Bottom-Left long triangle inner edge to needle tip
      ctx.lineTo(tipBL.x, tipBL.y);
      ctx.closePath();

      // Pass 1: Solid Black Fill (100% Opacity)
      ctx.fillStyle = '#000000';
      ctx.fill();

      // Pass 2: Razor Core Stroke (matches sidebar text color & intensity)
      ctx.strokeStyle = sharpColor;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // 2. CHEVRON HEAD AT END OF CRESCENT (RENDERED ON TOP of crescent horn)
      // Slapped onto tipTL + chevronOffset, pointing tangent along CCW rotation flow
      const flowAngle = Math.atan2(tipTL.y - oV0.y, tipTL.x - oV0.x); // ~148 deg (down-left)
      const chevX = tipTL.x + (this.config.chevronOffsetX || 0);
      const chevY = tipTL.y + (this.config.chevronOffsetY || 0);
      const chevScale = (this.config.chevronScale !== undefined) ? this.config.chevronScale : 0.8;

      ctx.save();
      ctx.translate(chevX, chevY);
      ctx.rotate(flowAngle + Math.PI * 0.5); // Align chevron apex with flow vector
      ctx.scale(chevScale, chevScale);       // Proportional fit to the crescent horn
      this.drawChevronHead(ctx, opts);
      ctx.restore();

      ctx.restore();
    }

    /**
     * Draws the small hotkey badge in the lower inner corner closest to the board.
     * Left Sidebar buttons: Bottom-Right corner (+X, +Y).
     * Right Sidebar buttons: Bottom-Left corner (-X, +Y).
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} hotkey
     * @param {boolean} isRightSidebar - If true, places in lower-left corner; else in lower-right corner
     * @param {string} color
     * @param {boolean} isHovered
     * @param {HexNode} [node]
     */
    drawCornerHotkey(ctx, hotkey, isRightSidebar, color = '#38bdf8', isHovered = false, node = null, customX = null, customY = null) {
      if (!hotkey) return;
      const keyStr = typeof hotkey === 'string' ? hotkey.replace(/^KEY:\s*/i, '').trim() : String(hotkey);
      if (!keyStr) return;
      ctx.save();

      // Lower inner corner inside the flat hexframe:
      // Left Sidebar faces board to the right (+X) -> Bottom-Right corner (+kx, +ky)
      // Right Sidebar faces board to the left (-X) -> Bottom-Left corner (-kx, +ky)
      const state = window.COSMOS_STATE || {};
      const posX = (state.hotkeyX !== undefined)
        ? state.hotkeyX
        : (this.config.hotkeyX !== undefined ? this.config.hotkeyX : 42);
      const posY = (state.hotkeyY !== undefined)
        ? state.hotkeyY
        : (this.config.hotkeyY !== undefined ? this.config.hotkeyY : 48);
      const scale = this.config.hotkeyScale !== undefined ? this.config.hotkeyScale : 1.5;

      const kx = customX !== null ? customX : (isRightSidebar ? -posX : posX);
      const ky = customY !== null ? customY : posY;

      ctx.translate(kx, ky);
      if (scale !== 1.0) {
        ctx.scale(scale, scale);
      }

      const baseAlpha = (node && node.ghost) ? 0.35 : (ctx.globalAlpha || 1.0);

      // Badge pill background
      const bw = Math.max(18, keyStr.length * 8 + 6), bh = 13, rx = 3;
      ctx.beginPath();
      ctx.roundRect(-bw * 0.5, -bh * 0.5, bw, bh, rx);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fill();
      ctx.strokeStyle = isHovered ? '#ffffff' : color;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = (isHovered ? 0.90 : 0.50) * baseAlpha;
      ctx.stroke();

      // Key character text
      ctx.font = '700 8.5px "Orbitron", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = baseAlpha;
      ctx.fillText(keyStr, 0, 0.5);

      ctx.restore();
    }

    /**
     * Creates an Entity-Component-Trait for a button that renders a large sprite icon
     * and a small hotkey in the board-facing corner.
     * @param {Object} config
     * @returns {Object} Trait object compatible with HexNode
     */
    createNavSpriteTrait(config = {}) {
      const self = this;
      const type = config.type || 'arrow';         // 'arrow' | 'rotation'
      const dir = config.dir || 'up';              // 'up' | 'down' | 'left' | 'right' | 'ccw' | 'cw'
      const hotkey = config.hotkey || '';
      const isRightSidebar = !!config.isRightSidebar;
      const spriteSize = config.size || null;

      return {
        name: 'text', // Uses 'text' trait slot so UI_Deck_Sync proxies update color/subtitle transparently
        title: config.title || '',
        subtitle: config.subtitle || '',
        badge: hotkey,
        titleColor: config.titleColor || '#38bdf8',
        align: 'center',

        render(ctx, node) {
          const btnTrait = node.getTrait('button');
          const isHovered = btnTrait ? (btnTrait.state === 'hovered' || btnTrait.active) : false;
          const isPressed = btnTrait ? (btnTrait.state === 'pressed') : false;

          const baseColor = this.titleColor || '#38bdf8';
          const sharpColor = '#ffffff';

          const opts = {
            color: baseColor,
            sharpColor,
            isHovered,
            isPressed
          };

          // 1. Draw Large Centerpiece Sprite Icon (reads dynamic config scale if size is null)
          if (type === 'arrow') {
            let angle = 0;
            if (dir === 'up') angle = 0;
            else if (dir === 'right') angle = Math.PI * 0.5;
            else if (dir === 'down') angle = Math.PI;
            else if (dir === 'left') angle = -Math.PI * 0.5;

            self.drawArrow(ctx, 0, 0, spriteSize, angle, opts);
          } else if (type === 'rotation') {
            const flipH = (dir === 'cw');
            self.drawRotation(ctx, 0, 0, spriteSize, flipH, opts);
          }

          // 2. Draw Small Hotkey in Lower Inner Corner Closest to Board
          const hk = this.badge || hotkey;
          self.drawCornerHotkey(ctx, hk, isRightSidebar, baseColor, isHovered, node);
        }
      };
    }
  }

  const uiButtonSpritesInstance = new UIButtonSpritesClass();
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('UI_Button_Sprites', uiButtonSpritesInstance);
  global.UIButtonSprites = uiButtonSpritesInstance;

})(typeof window !== 'undefined' ? window : this);
