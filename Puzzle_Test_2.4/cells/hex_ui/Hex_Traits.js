/**
 * @fileoverview cells/hex_ui/Hex_Traits.js - Modular ECT (Entity-Component-Trait) Behavioral Components (Modular Showcase 5 Cell)
 * @description Provides ButtonTrait, ViewportTrait, TextTrait, ListTrait (with N < 6 auto-middle balancing),
 * and TetherTrait (laser filaments & spring kinematics).
 */

(function(global) {
  'use strict';

  // ==========================================================================
  // 1. BUTTON TRAIT (Interactivity, Hover/Press States, Audio, Hotkeys)
  // ==========================================================================
  class ButtonTrait {
    constructor(config = {}) {
      this.name = 'button';
      this.state = 'idle'; // 'idle' | 'hovered' | 'pressed' | 'disabled'
      this.active = config.active || false; // Toggle state
      this.disabled = config.disabled || false;
      this.hotkey = config.hotkey || null;
      this.onClick = config.onClick || null;
      this.onHover = config.onHover || null;
      this.soundClick = config.soundClick !== undefined ? config.soundClick : true;
      this.hoverGlowColor = config.hoverGlowColor || '#38bdf8';
      this.hoverOutline = config.hoverOutline !== undefined ? config.hoverOutline : true;
      this.pressScale = config.pressScale || 0.94;
      this.allowGhostClick = !!config.allowGhostClick;
    }

    onAttach(node) {
      this.node = node;
    }

    onDetach(node) {
      this.node = null;
    }

    handlePointerEnter() {
      if ((this.disabled || this.node?.ghost) && !this.allowGhostClick) return;
      this.state = 'hovered';
      if (typeof this.onHover === 'function') this.onHover(true);
    }

    handlePointerLeave() {
      if ((this.disabled || this.node?.ghost) && !this.allowGhostClick) return;
      this.state = 'idle';
      if (typeof this.onHover === 'function') this.onHover(false);
    }

    handlePointerDown() {
      if ((this.disabled || this.node?.ghost) && !this.allowGhostClick) return;
      this.state = 'pressed';
    }

    handlePointerUp(wasInside = true, isTouch = false) {
      if ((this.disabled || this.node?.ghost) && !this.allowGhostClick) return;
      if (this.state === 'pressed' && wasInside) {
        if (this.soundClick && global.AudioSynth && typeof global.AudioSynth.playClick === 'function') {
          global.AudioSynth.playClick();
        }
        if (typeof this.onClick === 'function') {
          this.onClick(this.node);
        }
      }
      this.state = (wasInside && !isTouch) ? 'hovered' : 'idle';
    }

    render(ctx, node) {
      if (this.disabled || node?.ghost || !this.hoverOutline) return;

      // Skip ad-hoc stroke aura for sidebar buttons (their hover/pressed state is rendered via bezel inner/outer borders)
      const isSidebarBtn = node.isSidebarButton || (typeof node.id === 'string' && (
        node.id.startsWith('btn-nav-') ||
        node.id.startsWith('btn-ctrl-') ||
        node.id.startsWith('btn-spell-slot-') ||
        node.id.startsWith('btn-mat-slot-') ||
        node.id.startsWith('btn-comp-')
      ));
      if (isSidebarBtn) return;

      const geom = global.HexFrameGeometry;
      const vertices = node.getVertices();
      if (!geom || vertices.length < 3) return;

      // Render Hover Outline Aura (Dual-Pass Concentric Alpha Glows)
      if (this.state === 'hovered' || this.state === 'pressed' || this.active) {
        ctx.save();
        ctx.strokeStyle = this.hoverGlowColor;
        // Pass 1: Broad soft outer radiant aura
        ctx.lineWidth = (this.state === 'pressed' ? 2.5 : 1.8) + 6.0;
        ctx.globalAlpha = this.state === 'pressed' ? 0.32 : 0.20;
        geom.buildPath(ctx, vertices);
        ctx.stroke();
        // Pass 2: Razor-sharp core boundary
        ctx.lineWidth = this.state === 'pressed' ? 2.5 : 1.8;
        ctx.globalAlpha = this.state === 'pressed' ? 0.95 : 0.75;
        geom.buildPath(ctx, vertices);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ==========================================================================
  // 2. VIEWPORT TRAIT (Embedded 3D Polyhedra or Canvas Sub-Scenes)
  // ==========================================================================
  class ViewportTrait {
    constructor(config = {}) {
      this.name = 'viewport';
      this.renderDelegate = config.renderDelegate || null;
      this.polyModel = config.polyModel || null;   // e.g. 'dodecahedron', 'cube'
      this.polyColor = config.polyColor || 'red';
      this.polyScale = config.polyScale || 0.75;
      this.offsetX = config.offsetX || 0;
      this.offsetY = config.offsetY || 0;
      this.autoRotate = config.autoRotate !== undefined ? config.autoRotate : true;
      this.seedPhase = config.seedPhase !== undefined ? config.seedPhase : Math.random();
      this.seedTilt = config.seedTilt !== undefined ? config.seedTilt : Math.random();
    }

    render(ctx, node) {
      ctx.save();
      const geom = global.HexFrameGeometry;
      const vertices = node.getVertices();
      const bbox = geom ? geom.getBoundingBox(vertices) : { width: 60, height: 60 };
      const radius = Math.min(bbox.width, bbox.height) * 0.45 * this.polyScale;

      const px = this.offsetX;
      const py = this.offsetY;

      if (typeof this.renderDelegate === 'function') {
        this.renderDelegate(ctx, px, py, radius);
      } else if (this.polyColor && global.PolyhedronRenderer) {
        const time = (performance.now() || 0) * 0.001;
        global.PolyhedronRenderer.drawComponent(
          ctx, px, py, radius, this.polyColor, time, false, false, 1.0, this.seedPhase, this.seedTilt
        );
      }
      ctx.restore();
    }
  }

  // ==========================================================================
  // 3. TEXT TRAIT (Typography, Labels, Subtitles, Orbitron Badges)
  // ==========================================================================
  class TextTrait {
    constructor(config = {}) {
      this.name = 'text';
      this.title = config.title || '';
      this.subtitle = config.subtitle || '';
      this.badge = config.badge || '';
      this.fontFamily = config.fontFamily || '"Orbitron", "Inter", sans-serif';
      this.titleSize = config.titleSize || 13;
      this.subtitleSize = config.subtitleSize || 9.5;
      this.titleColor = config.titleColor || '#f8fafc';
      this.subtitleColor = config.subtitleColor || 'rgba(255, 255, 255, 0.55)';
      this.badgeColor = config.badgeColor || '#38bdf8';
      this.offsetX = config.offsetX || 0;
      this.offsetY = config.offsetY || 0;
      this.align = config.align || 'center'; // 'center' | 'left' | 'right'
      this.isSidebarButton = config.isSidebarButton || false;
      this.isRightSidebar = config.isRightSidebar || false;
      this.hotkey = config.hotkey || '';
      this.lineSpacing = config.lineSpacing || 36;
    }

    render(ctx, node) {
      if (!this.title && !this.subtitle && !this.badge && !this.hotkey) return;

      ctx.save();
      ctx.textAlign = this.align;
      ctx.textBaseline = 'middle';

      const xPos = this.offsetX;
      let yPos = this.offsetY;
      const fam = global.ACTIVE_FONT_FAMILY || this.fontFamily;
      const state = window.COSMOS_STATE || {};

      // Dynamic sizing for universal sidebar buttons
      const titleSize = (this.isSidebarButton && state.sidebarBtnFontSize)
        ? state.sidebarBtnFontSize
        : this.titleSize;
      const lineSpacing = (this.isSidebarButton && state.sidebarBtnLineSpacing)
        ? state.sidebarBtnLineSpacing
        : (this.lineSpacing || 36);

      // Check for multi-line / stacked title
      const lines = Array.isArray(this.title)
        ? this.title
        : (typeof this.title === 'string' && this.title.includes('\n') ? this.title.split('\n') : null);

      if (lines && lines.length > 1) {
        ctx.font = `700 ${titleSize}px ${fam}`;
        const totalSpan = (lines.length - 1) * lineSpacing;
        const startY = yPos - totalSpan * 0.5;

        for (let i = 0; i < lines.length; i++) {
          const lineY = startY + i * lineSpacing;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.fillText(lines[i], xPos + 1, lineY + 1);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(lines[i], xPos, lineY);
        }
      } else {
        // 1. Badge (Top Accent, e.g. 'RRP' or 'LVL 1')
        if (this.badge) {
          ctx.font = `700 8.5px ${fam}`;
          ctx.fillStyle = '#ffffff';
          ctx.fillText(this.badge, xPos, yPos - 13);
        }

        // 2. Primary Title
        if (this.title) {
          ctx.font = `700 ${titleSize}px ${fam}`;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.fillText(this.title, xPos + 1, yPos + 1);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(this.title, xPos, yPos);
        }

        // 3. Subtitle / Value Readout
        if (this.subtitle) {
          ctx.font = `500 ${this.subtitleSize}px ${fam}`;
          ctx.fillStyle = '#ffffff';
          ctx.fillText(this.subtitle, xPos, yPos + 13);
        }
      }

      // 4. Board-Facing Corner Hotkey Badge (nested in lower inner corner)
      if (this.hotkey && global.UIButtonSprites?.drawCornerHotkey) {
        const btnTrait = node?.getTrait('button');
        const isHovered = btnTrait ? (btnTrait.state === 'hovered' || btnTrait.state === 'pressed') : false;
        global.UIButtonSprites.drawCornerHotkey(ctx, this.hotkey, this.isRightSidebar, '#ffffff', isHovered, node);
      }

      ctx.restore();
    }
  }

  // ==========================================================================
  // 4. LIST TRAIT (Vertical Stack with Auto-Middle Balancing for N < 6)
  // ==========================================================================
  class ListTrait {
    constructor(config = {}) {
      this.name = 'list';
      this.slotHeight = config.slotHeight || 52;
      this.spacing = config.spacing || 8;
      this.capacity = config.capacity || 6;
      this.scrollOffset = 0;
      this.targetScrollOffset = 0;
      this.allowManualScroll = config.allowManualScroll !== undefined ? config.allowManualScroll : true;
    }

    onAttach(node) {
      this.node = node;
      this.layoutChildren();
    }

    /**
     * Balances child hex buttons symmetrically around the drum's vertical midpoint
     * if N < 6, or stacks them vertically from top if N >= 6.
     */
    layoutChildren() {
      if (!this.node) return;
      const items = this.node.children.filter(c => c.visible !== false);
      const count = items.length;
      if (count === 0) return;

      const step = this.slotHeight + this.spacing;

      if (count < this.capacity) {
        // --- DYNAMIC MIDDLE-BALANCING ALGORITHM (N < 6) ---
        // Symmetrically clusters all N items around local y = 0
        const totalStackHeight = count * this.slotHeight + (count - 1) * this.spacing;
        const startY = -(totalStackHeight - this.slotHeight) * 0.5;

        for (let i = 0; i < count; i++) {
          items[i].position.x = 0;
          items[i].position.y = startY + i * step;
        }
        this.scrollOffset = 0;
        this.targetScrollOffset = 0;
      } else {
        // --- FULL STACK & SCROLLABLE MODE (N >= 6) ---
        const totalHeight = count * step - this.spacing;
        const startY = -(this.capacity * step - this.spacing) * 0.5 + this.slotHeight * 0.5;

        for (let i = 0; i < count; i++) {
          items[i].position.x = 0;
          items[i].position.y = startY + i * step + this.scrollOffset;
        }
      }
      this.node._dirtyGeometry = true;
    }

    getMaxScroll() {
      if (!this.node) return 0;
      const count = this.node.children.filter(c => c.visible !== false).length;
      if (count <= this.capacity) return 0;
      const step = this.slotHeight + this.spacing;
      return Math.max(0, (count - this.capacity) * step);
    }

    clampScroll() {
      if (!this.node) return;
      const maxScroll = (typeof this.getMaxScroll === 'function') ? this.getMaxScroll() : 0;
      this.scrollOffset = Math.max(-maxScroll, Math.min(0, this.scrollOffset || 0));
      this.targetScrollOffset = Math.max(-maxScroll, Math.min(0, this.targetScrollOffset || 0));
    }

    scrollBy(deltaLocalY, immediate = false) {
      if (!this.allowManualScroll || !this.node) return false;
      this.clampScroll();
      const maxScroll = (typeof this.getMaxScroll === 'function') ? this.getMaxScroll() : 0;
      if (maxScroll <= 0) return false;
      const next = Math.max(-maxScroll, Math.min(0, this.targetScrollOffset + deltaLocalY));
      this.targetScrollOffset = next;
      if (immediate) {
        this.scrollOffset = next;
        this.layoutChildren();
      }
      return true;
    }

    handleWheel(deltaY) {
      this.scrollBy(-deltaY * 0.6, false);
    }

    update() {
      if (Math.abs(this.targetScrollOffset - this.scrollOffset) > 0.5) {
        this.scrollOffset += (this.targetScrollOffset - this.scrollOffset) * 0.25;
        this.layoutChildren();
      }
    }
  }

  // ==========================================================================
  // 5. TETHER TRAIT (Exterior Laser Filament Connectors & Orbital Springs)
  // ==========================================================================
  class TetherTrait {
    constructor(config = {}) {
      this.name = 'tether';
      this.targetNode = config.targetNode || null;
      this.length = config.length || 90;
      this.angle = config.angle || 0; // Degrees
      this.color = config.color || '#38bdf8';
      this.glowBlur = config.glowBlur || 10;
      this.lineWidth = config.lineWidth || 1.4;
      this.style = config.style || 'laser'; // 'laser' | 'filament' | 'spine'
      this.unfolded = config.unfolded !== undefined ? config.unfolded : true;
    }

    renderConnector(ctx, parentNode, childNode) {
      if (!childNode.visible) return;

      const pW = parentNode.worldMatrix;
      const cW = childNode.worldMatrix;

      const pCenter = { x: pW[4], y: pW[5] };
      const cCenter = { x: cW[4], y: cW[5] };

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pCenter.x, pCenter.y);
      ctx.lineTo(cCenter.x, cCenter.y);

      // Glowing Neon Laser Beam (Dual-Pass Alpha Glow)
      ctx.strokeStyle = this.color;
      // Pass 1: Outer glowing bloom
      ctx.lineWidth = this.lineWidth + 4.5;
      ctx.globalAlpha = 0.25;
      ctx.stroke();
      // Pass 2: Mid beam
      ctx.lineWidth = this.lineWidth;
      ctx.globalAlpha = 0.75;
      ctx.stroke();
      // Pass 3: Sharp crisp core filament
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(0.6, this.lineWidth * 0.4);
      ctx.globalAlpha = 0.92;
      ctx.stroke();

      ctx.restore();
    }
  }

  const traits = {
    ButtonTrait,
    ViewportTrait,
    TextTrait,
    ListTrait,
    TetherTrait
  };

  global.HexTraits = traits;
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Hex_Traits', traits);
  }
})(typeof window !== 'undefined' ? window : this);
