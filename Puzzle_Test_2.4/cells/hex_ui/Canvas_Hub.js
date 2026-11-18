/**
 * @fileoverview cells/hex_ui/Canvas_Hub.js - Canvas Hub & Navigation Orchestrator
 * @description Central menu canvas overlay providing high-level navigation between
 * visual workspaces: Emblem Canvas (Sigil Studio), Component Canvas (Polyhedra Lab),
 * Alignment Canvas (Line Motion Studio), and Font Studio (Geometric Typeface Engine).
 */

(function(global) {
  'use strict';

  class CanvasHubClass {
    constructor() {
      this.engine = null;
      this.containerNode = null;
      this.active = false;
      this.activeSubCanvas = null; // 'emblem' | 'component' | 'alignment' | 'font' | null
    }

    init(engine) {
      this.engine = engine;
      const HexNode = global.HexNode;
      if (!HexNode) return false;

      this.containerNode = new HexNode({
        id: 'canvas-hub-frame',
        wBase: 900,
        hBase: 790,
        apex: 250,
        orientation: 'flat',
        style: {
          bgColor: 'rgba(5, 10, 20, 0.90)',
          bgOpacity: 0.90,
          innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#c084fc', spread: 16, intensity: 0.65 },
          outerHighlight: { enabled: true, color: '#0284c7', sharpEdgeColor: '#38bdf8', blur: 24, intensity: 0.50 }
        }
      });
      this.containerNode.visible = false;
      this.containerNode.onResize = () => { if (this.active) this.buildHubScene(); };
      return true;
    }

    isOpen() {
      return this.active ||
        (global.StatCanvas?.isOpen()) ||
        (global.SigilNookCanvas?.isOpen()) ||
        (global.SigilEmblemStudio?.isOpen()) ||
        (global.ComponentCanvas?.isOpen()) ||
        (global.AlignmentCanvas?.isOpen()) ||
        (global.FontCanvas?.isOpen()) ||
        (global.GlyphCanvas?.isOpen());
    }

    toggle() {
      if (global.StatCanvas?.isOpen()) {
        global.StatCanvas.close();
      } else if (global.SigilNookCanvas?.isOpen()) {
        global.SigilNookCanvas.close();
      } else if (global.GlyphCanvas?.isOpen()) {
        global.GlyphCanvas.close();
        if (global.FontCanvas) global.FontCanvas.open();
      } else if (global.FontCanvas?.isOpen()) {
        global.FontCanvas.close();
        this.open();
      } else if (global.AlignmentCanvas?.isOpen()) {
        global.AlignmentCanvas.close();
        this.open();
      } else if (global.ComponentCanvas?.isOpen()) {
        global.ComponentCanvas.close();
        this.open();
      } else if (global.SigilEmblemStudio?.isOpen()) {
        global.SigilEmblemStudio.close();
        this.open();
      } else if (this.active) {
        this.close();
      } else {
        this.open();
      }
    }

    open() {
      this.active = true;
      this.activeSubCanvas = null;
      if (global.SigilNookCanvas?.isOpen()) global.SigilNookCanvas.close();
      if (global.SigilEmblemStudio?.isOpen()) global.SigilEmblemStudio.close();
      if (global.ComponentCanvas?.isOpen()) global.ComponentCanvas.close();
      if (global.AlignmentCanvas?.isOpen()) global.AlignmentCanvas.close();
      if (global.FontCanvas?.isOpen()) global.FontCanvas.close();
      if (global.GlyphCanvas?.isOpen()) global.GlyphCanvas.close();

      if (this.engine?.setStudioOverlay) this.engine.setStudioOverlay(this.containerNode);
      this.containerNode.visible = true;
      this.buildHubScene();
      const audio = global.AudioSynth;
      if (audio?.playClick) audio.playClick();
    }

    close() {
      this.active = false;
      this.activeSubCanvas = null;
      if (this.containerNode) {
        this.containerNode.visible = false;
        this.containerNode.children = [];
      }
      const audio = global.AudioSynth;
      if (audio?.playClick) audio.playClick();
    }

    goBack() {
      if (global.StatCanvas?.isOpen()) {
        global.StatCanvas.close();
        return true;
      }
      if (global.SigilNookCanvas?.isOpen()) {
        return global.SigilNookCanvas.goBack();
      }
      if (global.GlyphCanvas?.isOpen()) {
        global.GlyphCanvas.close();
        if (global.FontCanvas) global.FontCanvas.open();
        return true;
      }
      if (global.FontCanvas?.isOpen()) {
        global.FontCanvas.close();
        this.open();
        return true;
      }
      if (global.AlignmentCanvas?.isOpen()) {
        global.AlignmentCanvas.close();
        this.open();
        return true;
      }
      if (global.ComponentCanvas?.isOpen()) {
        global.ComponentCanvas.close();
        this.open();
        return true;
      }
      if (global.SigilEmblemStudio?.isOpen()) {
        if (global.SigilEmblemStudio.stage === 'variants') {
          global.SigilEmblemStudio.goBack();
          return true;
        } else {
          global.SigilEmblemStudio.close();
          this.open();
          return true;
        }
      }
      if (this.active) {
        this.close();
        return true;
      }
      return false;
    }

    openEmblemCanvas() {
      this.active = false;
      this.activeSubCanvas = 'emblem';
      if (this.containerNode) this.containerNode.visible = false;
      const studio = global.SigilEmblemStudio;
      if (studio) {
        if (this.engine?.setStudioOverlay) this.engine.setStudioOverlay(studio.containerNode);
        studio.openDial();
      }
    }

    openComponentCanvas() {
      this.active = false;
      this.activeSubCanvas = 'component';
      if (this.containerNode) this.containerNode.visible = false;
      const compCanvas = global.ComponentCanvas;
      if (compCanvas) {
        if (this.engine?.setStudioOverlay) this.engine.setStudioOverlay(compCanvas.containerNode);
        compCanvas.open();
      }
    }

    openAlignmentCanvas() {
      this.active = false;
      this.activeSubCanvas = 'alignment';
      if (this.containerNode) this.containerNode.visible = false;
      const alignCanvas = global.AlignmentCanvas;
      if (alignCanvas) {
        if (this.engine?.setStudioOverlay) this.engine.setStudioOverlay(alignCanvas.containerNode);
        alignCanvas.open();
      }
    }

    openFontCanvas() {
      this.active = false;
      this.activeSubCanvas = 'font';
      if (this.containerNode) this.containerNode.visible = false;
      const fontCanvas = global.FontCanvas;
      if (fontCanvas) {
        if (this.engine?.setStudioOverlay) this.engine.setStudioOverlay(fontCanvas.containerNode);
        fontCanvas.open();
      }
    }

    buildHubScene() {
      if (!this.containerNode) return;
      this.containerNode.children = [];
      const HexNode = global.HexNode;
      const traits = global.HexTraits;
      if (!HexNode || !traits) return;

      const self = this;

      // 1. Hub Header Node
      const titleNode = new HexNode({
        id: 'hub-title-node', position: { x: 0, y: -220 },
        wBase: 680, hBase: 42, apex: 14, orientation: 'flat',
        style: {
          bgColor: 'rgba(15, 23, 42, 0.92)', bgOpacity: 0.92,
          innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#c084fc', spread: 12, intensity: 0.8 }
        }
      });
      titleNode.addTrait(new traits.TextTrait({
        title: 'CANVAS SELECTION HUB',
        subtitle: 'Select an Interactive Laboratory • Press ESC or M to Return',
        align: 'center', titleSize: 13, subtitleSize: 9, titleColor: '#38bdf8'
      }));
      this.containerNode.addChild(titleNode);

      // Card Dimensions (Normalized to match sidebar button footprint)
      const cardW = 124, cardH = 124, cardApex = 38;

      // 2. Hub Destination Card #1: EMBLEM CANVAS (Left, X = -270, Y = -15)
      const emblemCard = new HexNode({
        id: 'hub-card-emblem', position: { x: -270, y: -15 },
        wBase: cardW, hBase: cardH, apex: cardApex, orientation: 'flat',
        style: {
          bgColor: 'rgba(15, 23, 42, 0.85)', bgOpacity: 0.85,
          innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#bae6fd', spread: 10, intensity: 0.75, lineWidth: 1.8 },
          outerHighlight: { enabled: true, color: '#0284c7', sharpEdgeColor: '#38bdf8', blur: 20, intensity: 0.50 }
        }
      });
      emblemCard.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#38bdf8',
        onClick: () => self.openEmblemCanvas()
      }));
      emblemCard.addTrait(new traits.TextTrait({
        badge: '12 SIGILS',
        title: 'EMBLEM CANVAS',
        subtitle: 'Sigil Studio & Pyramids',
        align: 'center', titleSize: 11, subtitleSize: 7.5, titleColor: '#38bdf8'
      }));
      emblemCard.addTrait({
        name: 'emblem-preview',
        render(ctx) {
          const renderer = global.SigilEmblemRenderer;
          if (renderer?.renderEmblem) {
            ctx.save();
            ctx.translate(0, -22);
            renderer.renderEmblem(ctx, { key: 'fire', color: '#ff3333', secondary: '#ffffff' }, 4, false, 20, 'wireframe');
            ctx.restore();
          }
        }
      });
      this.containerNode.addChild(emblemCard);

      // 3. Hub Destination Card #2: COMPONENT CANVAS (Center-Left, X = -90, Y = -15)
      const compCard = new HexNode({
        id: 'hub-card-component', position: { x: -90, y: -15 },
        wBase: cardW, hBase: cardH, apex: cardApex, orientation: 'flat',
        style: {
          bgColor: 'rgba(15, 23, 42, 0.85)', bgOpacity: 0.85,
          innerHighlight: { enabled: true, color: '#c084fc', sharpEdgeColor: '#e9d5ff', spread: 10, intensity: 0.75, lineWidth: 1.8 },
          outerHighlight: { enabled: true, color: '#9333ea', sharpEdgeColor: '#c084fc', blur: 20, intensity: 0.50 }
        }
      });
      compCard.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#c084fc',
        onClick: () => self.openComponentCanvas()
      }));
      compCard.addTrait(new traits.TextTrait({
        badge: '8 MODELS',
        title: 'COMPONENT CANVAS',
        subtitle: 'Polyhedral Laboratory',
        align: 'center', titleSize: 11, subtitleSize: 7.5, titleColor: '#c084fc'
      }));
      compCard.addTrait({
        name: 'poly-preview',
        render(ctx) {
          const polyRender = global.PolyhedronRenderer;
          if (polyRender?.drawComponent) {
            ctx.save();
            ctx.translate(0, -22);
            const t = (global.COSMOS_STATE?.time || performance.now() * 0.001);
            polyRender.drawComponent(ctx, 0, 0, 18, 'blue', t, false, false, 1.0, 0.42, 0.18);
            ctx.restore();
          }
        }
      });
      this.containerNode.addChild(compCard);

      // 4. Hub Destination Card #3: ALIGNMENT CANVAS (Center-Right, X = 90, Y = -15)
      const alignCard = new HexNode({
        id: 'hub-card-alignment', position: { x: 90, y: -15 },
        wBase: cardW, hBase: cardH, apex: cardApex, orientation: 'flat',
        style: {
          bgColor: 'rgba(15, 23, 42, 0.85)', bgOpacity: 0.85,
          innerHighlight: { enabled: true, color: '#06b6d4', sharpEdgeColor: '#a5f3fc', spread: 10, intensity: 0.75, lineWidth: 1.8 },
          outerHighlight: { enabled: true, color: '#0891b2', sharpEdgeColor: '#22d3ee', blur: 20, intensity: 0.50 }
        }
      });
      alignCard.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#22d3ee',
        onClick: () => self.openAlignmentCanvas()
      }));
      alignCard.addTrait(new traits.TextTrait({
        badge: '3 STYLES',
        title: 'ALIGNMENT CANVAS',
        subtitle: 'Line Motion & Conduits',
        align: 'center', titleSize: 11, subtitleSize: 7.5, titleColor: '#22d3ee'
      }));
      alignCard.addTrait({
        name: 'alignment-preview',
        render(ctx) {
          const t = (global.COSMOS_STATE?.time || performance.now() * 0.001);
          ctx.save();
          const yTop = -32, yBot = -12;
          ctx.beginPath();
          ctx.moveTo(0, yTop); ctx.lineTo(0, yBot);
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)'; ctx.lineWidth = 4.0; ctx.stroke();
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.95)'; ctx.lineWidth = 1.5; ctx.stroke();

          const u = ((t * 0.9) % 1.0);
          const py = yTop + u * (yBot - yTop);
          ctx.beginPath(); ctx.arc(0, py, 4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(6, 182, 212, 0.40)'; ctx.fill();
          ctx.beginPath(); ctx.arc(0, py, 2, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff'; ctx.fill();

          const pr = global.PolyhedronRenderer;
          if (pr?.drawDiseaseToken) {
            pr.drawDiseaseToken(ctx, 0, yBot, 9, t, 'gem', false, false, 1.0);
          }
          const renderer = global.SigilEmblemRenderer;
          if (renderer?.renderEmblem) {
            ctx.save(); ctx.translate(0, yTop);
            renderer.renderEmblem(ctx, { key: 'water', color: '#3d6eff', secondary: '#000000' }, 2, false, 9, 'wireframe');
            ctx.restore();
          }
          ctx.restore();
        }
      });
      this.containerNode.addChild(alignCard);

      // 5. Hub Destination Card #4: FONT STUDIO (Right, X = 270, Y = -15)
      const fontCard = new HexNode({
        id: 'hub-card-font', position: { x: 270, y: -15 },
        wBase: cardW, hBase: cardH, apex: cardApex, orientation: 'flat',
        style: {
          bgColor: 'rgba(15, 23, 42, 0.85)', bgOpacity: 0.85,
          innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#bae6fd', spread: 10, intensity: 0.75, lineWidth: 1.8 },
          outerHighlight: { enabled: true, color: '#0284c7', sharpEdgeColor: '#38bdf8', blur: 20, intensity: 0.50 }
        }
      });
      fontCard.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#38bdf8',
        onClick: () => self.openFontCanvas()
      }));
      fontCard.addTrait(new traits.TextTrait({
        badge: 'PHASE 1',
        title: 'FONT STUDIO',
        subtitle: 'Geometric Typography\n2×3 Snapping Grid',
        align: 'center', titleSize: 11, subtitleSize: 7.5, titleColor: '#38bdf8'
      }));
      fontCard.addTrait({
        name: 'font-preview',
        render(ctx) {
          const renderer = global.FontStudioRenderer;
          const data = global.FontStudioData;
          if (renderer?.renderGlyphMini && data) {
            ctx.save();
            ctx.translate(0, -22);
            const glyph = data.getGlyph('A');
            renderer.renderGlyphMini(ctx, glyph, 0, 0, 28, '#38bdf8');
            ctx.restore();
          }
        }
      });
      this.containerNode.addChild(fontCard);

      // 6. Return to Board Center Button (Bottom, Y = 195)
      const resumeBtn = new HexNode({
        id: 'btn-hub-resume', position: { x: 0, y: 195 },
        wBase: 170, hBase: 50, apex: 16, orientation: 'pointy',
        style: {
          bgColor: 'rgba(15, 23, 42, 0.90)', bgOpacity: 0.90,
          innerHighlight: { enabled: true, color: '#4ade80', sharpEdgeColor: '#bbf7d0', fade: 0, spread: 0, intensity: 0.9, lineWidth: 1.8 },
          outerHighlight: { enabled: true, color: '#16a34a', blur: 18, intensity: 0.5 }
        }
      });
      resumeBtn.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#4ade80',
        onClick: () => self.close()
      }));
      resumeBtn.addTrait(new traits.TextTrait({
        badge: 'ESC', title: '◄ RESUME BOARD', subtitle: 'Return to Cosmos Grid',
        align: 'center', titleSize: 10.5, subtitleSize: 8, titleColor: '#4ade80'
      }));
      this.containerNode.addChild(resumeBtn);
    }
  }

  const instance = new CanvasHubClass();
  global.CanvasHub = instance;
  if (global.ROLL_CALL?.set) global.ROLL_CALL.set('Canvas_Hub', instance);
})(typeof window !== 'undefined' ? window : this);
