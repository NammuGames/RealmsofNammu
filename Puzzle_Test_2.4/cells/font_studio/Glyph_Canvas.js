/**
 * @fileoverview cells/font_studio/Glyph_Canvas.js - Glyph Designer Canvas
 * @description Dedicated letter-crafting workspace: features a large 2x3 center grid,
 * 4-button left column (Dot & Overlap +/-), 4-button right column (Line Start/End +/- in 1/12 fractions),
 * and a single Delete Stroke button at bottom center. Zero top header frames.
 */

(function(global) {
  'use strict';

  class GlyphCanvasClass {
    constructor() {
      this.engine = null;
      this.containerNode = null;
      this.active = false;
      this.keyHandler = null;

      this.colLeft = null;
      this.colRight = null;
      this.listLeft = null;
      this.listRight = null;
    }

    init(engine) {
      this.engine = engine;
      const HexNode = global.HexNode;
      if (!HexNode) return false;

      // Exact same size as Canvas Hub Frame
      this.containerNode = new HexNode({
        id: 'glyph-canvas-frame',
        wBase: 900,
        hBase: 790,
        apex: 250,
        orientation: 'flat',
        style: {
          bgColor: 'rgba(5, 10, 20, 0.92)',
          bgOpacity: 0.92,
          innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#bae6fd', spread: 14, intensity: 0.65 },
          outerHighlight: { enabled: true, color: '#0284c7', sharpEdgeColor: '#38bdf8', blur: 24, intensity: 0.50 }
        }
      });
      this.containerNode.visible = false;
      this.containerNode.onResize = () => { if (this.active) this.buildScene(); };

      if (global.FontStudioData?.onChange) {
        global.FontStudioData.onChange(() => { if (this.active) this.buildScene(); });
      }
      return true;
    }

    isOpen() { return this.active; }

    open(charKey) {
      this.active = true;
      if (global.CanvasHub?.isOpen() && !global.CanvasHub.active) global.CanvasHub.close();
      if (global.FontCanvas?.isOpen()) global.FontCanvas.close();

      if (charKey && global.FontStudioData) {
        global.FontStudioData.selectGlyph(charKey);
      }

      if (this.engine?.setStudioOverlay) this.engine.setStudioOverlay(this.containerNode);
      this.containerNode.visible = true;

      // Mount the streamlined Stroke Column directly into the right sidebar
      if (global.FontStudioDeck?.mount) {
        global.FontStudioDeck.mount(this.engine?.rightSidebar);
      }

      this.buildScene();
      this.bindKeyboard();

      const audio = global.AudioSynth;
      if (audio?.playClick) audio.playClick();
    }

    close() {
      this.active = false;
      this.unbindKeyboard();

      if (global.FontStudioDeck?.unmount) {
        global.FontStudioDeck.unmount();
      }

      if (this.containerNode) {
        this.containerNode.visible = false;
        this.containerNode.children = [];
      }
    }

    bindKeyboard() {
      if (this.keyHandler) return;
      const data = global.FontStudioData;
      this.keyHandler = (e) => {
        if (!this.active || !data) return;
        const key = e.key.toLowerCase();
        let handled = true;

        if (key === 'w' || e.key === 'ArrowUp') data.moveActiveStroke(0, -1);
        else if (key === 's' || e.key === 'ArrowDown') data.moveActiveStroke(0, 1);
        else if (key === 'a' || e.key === 'ArrowLeft') data.moveActiveStroke(-1, 0);
        else if (key === 'd' || e.key === 'ArrowRight') data.moveActiveStroke(1, 0);
        else if (key === 'q') data.rotateActiveStroke(-1);
        else if (key === 'e') data.rotateActiveStroke(1);
        else if (e.key === 'Escape') {
          this.close();
          if (global.FontCanvas) global.FontCanvas.open();
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
          data.copyToClipboard();
        } else handled = false;

        if (handled) {
          e.preventDefault();
          const audio = global.AudioSynth;
          if (audio?.playClick) audio.playClick();
        }
      };
      window.addEventListener('keydown', this.keyHandler);
    }

    unbindKeyboard() {
      if (this.keyHandler) {
        window.removeEventListener('keydown', this.keyHandler);
        this.keyHandler = null;
      }
    }

    createStandardHexButton(id, color, isAct = false) {
      return new global.HexNode({
        id, wBase: 124, hBase: 124, apex: 38,
        orientation: 'flat', atlasKey: 'cyan',
        style: {
          bgColor: isAct ? 'rgba(56, 189, 248, 0.25)' : 'rgba(15, 23, 42, 0.70)',
          bgOpacity: 0.70,
          innerHighlight: { enabled: true, color, sharpEdgeColor: '#e0f2fe', spread: 10, intensity: isAct ? 0.95 : 0.55 },
          outerHighlight: { enabled: true, color, sharpEdgeColor: color, blur: 14, intensity: 0.45 }
        }
      });
    }

    addColumnButton(col, id, badge, title, subtitle, color, onClick, isAct = false) {
      const traits = global.HexTraits;
      const btn = this.createStandardHexButton(id, color, isAct);
      if (onClick) btn.addTrait(new traits.ButtonTrait({ hoverGlowColor: color, onClick }));
      btn.addTrait(new traits.TextTrait({ badge, title, subtitle, align: 'center', titleSize: 11, subtitleSize: 8.5, titleColor: color }));
      col.addChild(btn);
      return btn;
    }

    buildScene() {
      if (!this.containerNode) return;
      this.containerNode.children = [];

      const HexNode = global.HexNode;
      const traits = global.HexTraits;
      const data = global.FontStudioData;
      const renderer = global.FontStudioRenderer;
      if (!HexNode || !traits || !data || !renderer) return;

      const colX = 390;

      // ======================================================================
      // 1. LEFT COLUMN: EXACTLY 4 BUTTONS (Dot & Overlap +/-)
      // ======================================================================
      this.colLeft = new HexNode({
        id: 'glyph-col-left', position: { x: -colX, y: 0 }, clipContent: false,
        style: { bgOpacity: 0 }
      });
      // Capacity 4 centers the 4 buttons symmetrically around local y = 0
      this.listLeft = new traits.ListTrait({ slotHeight: 124, spacing: 12, capacity: 4 });
      this.colLeft.addTrait(this.listLeft);
      this.containerNode.addChild(this.colLeft);

      // Button 1: Dot Bigger
      this.addColumnButton(this.colLeft, 'btn-dot-inc', '+2 PX', 'DOT BIGGER ►', `${data.config.dotDiameter}px`, '#f59e0b', () => {
        data.stepDotDiameter(1);
      });
      // Button 2: Dot Smaller
      this.addColumnButton(this.colLeft, 'btn-dot-dec', '-2 PX', '◄ DOT SMALLER', `${data.config.dotDiameter}px`, '#f59e0b', () => {
        data.stepDotDiameter(-1);
      });
      // Button 3: Overlap / Squares Bigger (1/24 lattice unit)
      this.addColumnButton(this.colLeft, 'btn-overlap-inc', '+1/24', 'OVERLAP PLUS ►', `O = ${data.config.squareOverlap}/24 Stem`, '#38bdf8', () => {
        data.stepSquareOverlap(1);
      });
      // Button 4: Overlap / Squares Smaller (1/24 lattice unit)
      this.addColumnButton(this.colLeft, 'btn-overlap-dec', '-1/24', '◄ OVERLAP MINUS', `O = ${data.config.squareOverlap}/24 Stem`, '#38bdf8', () => {
        data.stepSquareOverlap(-1);
      });
      this.listLeft.layoutChildren();

      // ======================================================================
      // 2. RIGHT COLUMN: EXACTLY 4 BUTTONS (Line Start/End +/- in 1/24 Units)
      // ======================================================================
      this.colRight = new HexNode({
        id: 'glyph-col-right', position: { x: colX, y: 0 }, clipContent: false,
        style: { bgOpacity: 0 }
      });
      this.listRight = new traits.ListTrait({ slotHeight: 124, spacing: 12, capacity: 4 });
      this.colRight.addTrait(this.listRight);
      this.containerNode.addChild(this.colRight);

      const activeStroke = data.getActiveStroke();
      const isLine = (activeStroke && activeStroke.part === 'line');

      if (isLine) {
        data.normalizeStrokeProps(activeStroke);
        const maxT = data.getMaxLatticeUnits(activeStroke.axis);
        // Button 1: Line Start Plus (+1/24)
        this.addColumnButton(this.colRight, 'btn-start-inc', '+1/24', 'START PLUS ►', `T = ${Math.round(activeStroke.tStart)}/${maxT}`, '#38bdf8', () => {
          data.stepLineStart(1);
        });
        // Button 2: Line Start Minus (-1/24)
        this.addColumnButton(this.colRight, 'btn-start-dec', '-1/24', '◄ START MINUS', `T = ${Math.round(activeStroke.tStart)}/${maxT}`, '#38bdf8', () => {
          data.stepLineStart(-1);
        });
        // Button 3: Line End Plus (+1/24)
        this.addColumnButton(this.colRight, 'btn-end-inc', '+1/24', 'END PLUS ►', `T = ${Math.round(activeStroke.tEnd)}/${maxT}`, '#38bdf8', () => {
          data.stepLineEnd(1);
        });
        // Button 4: Line End Minus (-1/24)
        this.addColumnButton(this.colRight, 'btn-end-dec', '-1/24', '◄ END MINUS', `T = ${Math.round(activeStroke.tEnd)}/${maxT}`, '#38bdf8', () => {
          data.stepLineEnd(-1);
        });
      } else if (activeStroke && (activeStroke.part === 'half_arc' || activeStroke.part === 'quarter_arc' || activeStroke.part === 'quarter_circle')) {
        // Arcs: Rotation & Shift
        this.addColumnButton(this.colRight, 'btn-arc-rot-cw', '+90°', 'ROTATE CW ►', `${activeStroke.rotation || 0}°`, '#38bdf8', () => data.rotateActiveStroke(1));
        this.addColumnButton(this.colRight, 'btn-arc-rot-ccw', '-90°', '◄ ROTATE CCW', `${activeStroke.rotation || 0}°`, '#38bdf8', () => data.rotateActiveStroke(-1));
        this.addColumnButton(this.colRight, 'btn-arc-cell-up', 'KEY: W', '▲ CELL UP', `Row ${activeStroke.row}`, '#a855f7', () => data.moveActiveStroke(0, -1));
        this.addColumnButton(this.colRight, 'btn-arc-cell-dn', 'KEY: S', '▼ CELL DOWN', `Row ${activeStroke.row}`, '#a855f7', () => data.moveActiveStroke(0, 1));
      } else if (activeStroke) {
        // Dot / Circle: Cell Shift
        this.addColumnButton(this.colRight, 'btn-part-up', 'KEY: W', '▲ CELL UP', `Row ${activeStroke.row}`, '#38bdf8', () => data.moveActiveStroke(0, -1));
        this.addColumnButton(this.colRight, 'btn-part-dn', 'KEY: S', '▼ CELL DOWN', `Row ${activeStroke.row}`, '#38bdf8', () => data.moveActiveStroke(0, 1));
        this.addColumnButton(this.colRight, 'btn-part-l', 'KEY: A', '◄ CELL LEFT', `Col ${activeStroke.col}`, '#38bdf8', () => data.moveActiveStroke(-1, 0));
        this.addColumnButton(this.colRight, 'btn-part-r', 'KEY: D', 'CELL RIGHT ►', `Col ${activeStroke.col}`, '#38bdf8', () => data.moveActiveStroke(1, 0));
      } else {
        // Empty slot
        this.addColumnButton(this.colRight, 'btn-no-stroke', 'EMPTY', 'NO STROKE', 'Select from Sidebar', '#94a3b8', null);
        this.addColumnButton(this.colRight, 'btn-add-line-quick', 'CREATE', '+ ADD LINE', 'Straight Stem', '#38bdf8', () => data.setActivePart('line'));
        this.addColumnButton(this.colRight, 'btn-add-circle-quick', 'CREATE', '+ ADD CIRCLE', 'Square Ring', '#38bdf8', () => data.setActivePart('circle'));
        this.addColumnButton(this.colRight, 'btn-add-dot-quick', 'CREATE', '+ ADD DOT', 'Center Disc', '#f59e0b', () => data.setActivePart('dot'));
      }
      this.listRight.layoutChildren();

      // ======================================================================
      // 3. TOP CENTER: MIRRORED REFERENCE CHAR FRAME (MIRRORS DELETE BUTTON)
      // ======================================================================
      const refNode = new HexNode({
        id: 'ref-glyph-frame', position: { x: 0, y: -250 },
        wBase: 160, hBase: 44, apex: 16, orientation: 'pointy',
        style: {
          bgColor: 'rgba(15, 23, 42, 0.85)', bgOpacity: 0.90,
          innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#bae6fd', spread: 6, intensity: 0.75 },
          outerHighlight: { enabled: true, color: '#0284c7', blur: 12, intensity: 0.45 }
        }
      });
      refNode.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#38bdf8',
        onClick: () => {
          self.close();
          if (global.FontCanvas) global.FontCanvas.open();
        }
      }));
      refNode.addTrait({
        name: 'render-ref-char',
        render(ctx) {
          const charKey = data.activeGlyphKey || 'A';
          ctx.save();
          ctx.font = '700 24px Orbitron, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillStyle = '#f8fafc';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(charKey, 0, 0);
          ctx.restore();
        }
      });
      this.containerNode.addChild(refNode);

      // ======================================================================
      // 4. CENTER STAGE: BIG 2x3 GLYPH GRID (FRONT AND CENTER)
      // ======================================================================
      const stageY = -10;
      // Big square size: 94px
      const metrics = renderer.getGridMetrics(94, data.config.squareOverlap);

      const stageNode = new HexNode({
        id: 'glyph-grid-stage', position: { x: 0, y: stageY },
        wBase: 280, hBase: 360, apex: 60, orientation: 'flat',
        style: {
          bgColor: 'rgba(10, 15, 30, 0.75)', bgOpacity: 0.75,
          innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#bae6fd', spread: 12, intensity: 0.55 },
          outerHighlight: { enabled: true, color: '#0369a1', blur: 18, intensity: 0.45 }
        }
      });
      stageNode.addTrait({
        name: 'render-font-grid',
        render(ctx) {
          const glyph = data.getActiveGlyph();
          const actStroke = data.getActiveStroke();
          const actCell = (actStroke && actStroke.part !== 'line') ? { col: actStroke.col, row: actStroke.row } : null;
          renderer.renderGridGuides(ctx, 0, 0, metrics, actCell);
          renderer.renderGlyphSilhouette(ctx, 0, 0, glyph.strokes, metrics, data.config.dotDiameter, data.activeStrokeIndex);
        }
      });
      this.containerNode.addChild(stageNode);

      // ======================================================================
      // 5. BOTTOM CENTER: SINGLE DELETE STROKE BUTTON
      // ======================================================================
      const delBtn = new HexNode({
        id: 'btn-delete-stroke', position: { x: 0, y: 250 },
        wBase: 160, hBase: 44, apex: 16, orientation: 'pointy',
        style: {
          bgColor: 'rgba(239, 68, 68, 0.18)', bgOpacity: 0.90,
          innerHighlight: { enabled: true, color: '#ef4444', sharpEdgeColor: '#fca5a5', spread: 6, intensity: 0.85 },
          outerHighlight: { enabled: true, color: '#dc2626', blur: 12, intensity: 0.50 }
        }
      });
      delBtn.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#ef4444',
        onClick: () => data.removeActiveStroke()
      }));
      delBtn.addTrait(new traits.TextTrait({
        badge: 'REMOVE',
        title: '✖ DELETE STROKE',
        subtitle: 'Clear Active Stroke',
        align: 'center',
        titleSize: 10.5,
        subtitleSize: 8,
        titleColor: '#ef4444'
      }));
      this.containerNode.addChild(delBtn);
    }
  }

  const instance = new GlyphCanvasClass();
  global.GlyphCanvas = instance;
  if (global.ROLL_CALL?.set) global.ROLL_CALL.set('Glyph_Canvas', instance);
})(typeof window !== 'undefined' ? window : this);
