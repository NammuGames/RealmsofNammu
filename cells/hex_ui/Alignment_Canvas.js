/**
 * @fileoverview cells/hex_ui/Alignment_Canvas.js - Alignment Animation Studio
 * @description Dedicated 3rd canvas showcasing animated line alignments between Emblems,
 * Disease Tokens, and Void. Features:
 * 1. Resonant Hum: Disease to Disease with Glowing Ball & Pulsing Ring Caps.
 * 2. Plasma Arc: Emblem to Void with 12Hz Staggered Arcs and Electric Spark Cap.
 * 3. Breathing Aurora: Light to Dark Emblems with Dual Intertwined Light/Dark Ribbons.
 */

(function(global) {
  'use strict';

  /**
   * AlignmentCanvasClass: Dedicated Canvas Orchestrator
   */
  class AlignmentCanvasClass {
    constructor() {
      this.engine = null;
      this.containerNode = null;
      this.active = false;
      this.selectedSample = null;
    }

    init(engine) {
      this.engine = engine;
      const HexNode = global.HexNode;
      if (!HexNode) return false;

      this.containerNode = new HexNode({
        id: 'alignment-canvas-frame',
        wBase: 900,
        hBase: 790,
        apex: 250,
        orientation: 'flat',
        style: {
          bgColor: 'rgba(5, 10, 20, 0.90)',
          bgOpacity: 0.90,
          innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#c084fc', spread: 14, intensity: 0.65 },
          outerHighlight: { enabled: true, color: '#0284c7', sharpEdgeColor: '#38bdf8', blur: 22, intensity: 0.50 }
        }
      });
      this.containerNode.visible = false;
      this.containerNode.onResize = () => { if (this.active) this.buildScene(); };
      return true;
    }

    isOpen() { return this.active; }

    open() {
      this.active = true;
      if (global.CanvasHub?.isOpen() && !global.CanvasHub.active) global.CanvasHub.close();
      if (global.SigilEmblemStudio?.isOpen()) global.SigilEmblemStudio.close();
      if (global.ComponentCanvas?.isOpen()) global.ComponentCanvas.close();

      if (this.engine?.setStudioOverlay) this.engine.setStudioOverlay(this.containerNode);
      this.containerNode.visible = true;
      this.buildScene();
      const audio = global.AudioSynth;
      if (audio?.playClick) audio.playClick();
    }

    close() {
      this.active = false;
      if (this.containerNode) {
        this.containerNode.visible = false;
        this.containerNode.children = [];
      }
      const audio = global.AudioSynth;
      if (audio?.playClick) audio.playClick();
    }

    buildScene() {
      if (!this.containerNode) return;
      this.containerNode.children = [];
      const HexNode = global.HexNode;
      const traits = global.HexTraits;
      if (!HexNode || !traits) return;

      const self = this;

      // 1. Return to Hub Button (Top Left)
      const hubBtn = new HexNode({
        id: 'btn-align-hub', position: { x: -330, y: -285 },
        wBase: 135, hBase: 38, apex: 12, orientation: 'flat',
        style: {
          bgColor: 'rgba(15, 23, 42, 0.90)', bgOpacity: 0.90,
          innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#bae6fd', fade: 0, spread: 0, intensity: 0.8, lineWidth: 1.5 },
          outerHighlight: { enabled: true, color: '#0284c7', blur: 14, intensity: 0.4 }
        }
      });
      hubBtn.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#38bdf8',
        onClick: () => {
          self.close();
          if (global.CanvasHub) global.CanvasHub.open();
        }
      }));
      hubBtn.addTrait(new traits.TextTrait({
        badge: 'ESC', title: '◄ HUB', subtitle: 'Canvas Menu',
        align: 'center', titleSize: 10, subtitleSize: 7.5, titleColor: '#38bdf8'
      }));
      this.containerNode.addChild(hubBtn);

      // 2. Title Header Banner (Top Center)
      const titleNode = new HexNode({
        id: 'align-title-node', position: { x: 50, y: -285 },
        wBase: 560, hBase: 38, apex: 12, orientation: 'flat',
        style: {
          bgColor: 'rgba(15, 23, 42, 0.92)', bgOpacity: 0.92,
          innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#c084fc', spread: 10, intensity: 0.75 }
        }
      });
      titleNode.addTrait(new traits.TextTrait({
        title: 'ALIGNMENT ANIMATION STUDIO',
        subtitle: 'Anchor Conduits & Line Motion • Token, Void & Dual-Emblem Weaves',
        align: 'center', titleSize: 12.5, subtitleSize: 8.5, titleColor: '#38bdf8'
      }));
      this.containerNode.addChild(titleNode);

      // 3. 3 Curated Sample Columns across Canvas
      const preview = global.AlignmentCanvasPreview;
      if (!preview) return;
      const colX = [-230, 0, 230], yTop = -115, yBottom = 115, anchorRadius = 36;

      preview.ALIGNMENT_SAMPLES.forEach((sample, idx) => {
        const xPos = colX[idx];
        const colNode = new HexNode({
          id: `align-col-${sample.id}`, position: { x: xPos, y: 0 },
          wBase: 170, hBase: 440, apex: 20, orientation: 'flat',
          style: {
            bgColor: 'rgba(15, 23, 42, 0.40)', bgOpacity: 0.40,
            innerHighlight: { enabled: true, color: sample.color, sharpEdgeColor: '#ffffff', spread: 10, intensity: 0.50, lineWidth: 1.2 },
            outerHighlight: { enabled: true, color: sample.glowColor, blur: 18, intensity: 0.35 }
          }
        });

        colNode.addTrait(new traits.ButtonTrait({
          hoverGlowColor: sample.color,
          onClick: () => {
            self.selectedSample = self.selectedSample === sample.id ? null : sample.id;
            const audio = global.AudioSynth;
            if (audio?.playClick) audio.playClick();
          }
        }));

        // Master Tri-Layer Render Trait
        colNode.addTrait({
          name: `render-${sample.id}`,
          render(ctx) {
            const time = (global.COSMOS_STATE?.time || performance.now() * 0.001);
            const isHovered = colNode.state?.isHovered || false;
            const isSelected = self.selectedSample === sample.id;

            // STEP 1: LAYER 1 (BOTTOM) - Disease Tokens (Layered UNDER the line & caps)
            if (sample.topType === 'disease') preview.drawDiseaseAnchor(ctx, 0, yTop, anchorRadius, time);
            if (sample.bottomType === 'disease') preview.drawDiseaseAnchor(ctx, 0, yBottom, anchorRadius, time);

            // STEP 2: LAYER 2 (MIDDLE) - Connecting Animated Line & Terminal Caps
            // Draws OVER Disease Tokens, into Void, or between Emblems
            preview.drawSampleLine(ctx, sample, 0, yTop, yBottom, time, isHovered, isSelected);

            // STEP 3: LAYER 3 (TOP) - Emblems (Drawn OVER line origins)
            if (sample.topType === 'emblem') preview.drawEmblemAnchor(ctx, sample.topElem || sample, 0, yTop, anchorRadius);
            if (sample.bottomType === 'emblem') preview.drawEmblemAnchor(ctx, sample.bottomElem, 0, yBottom, anchorRadius);

            // Labels: Anchors & Titles
            ctx.save();
            ctx.font = 'bold 10px "Outfit", sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(sample.topName, 0, yTop - anchorRadius - 16);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(sample.bottomName, 0, yBottom + anchorRadius + 16);
            ctx.font = 'bold 11px "Outfit", sans-serif'; ctx.fillStyle = '#ffffff';
            ctx.fillText(sample.title, 0, yBottom + anchorRadius + 32);
            ctx.font = '9px "Outfit", sans-serif'; ctx.fillStyle = '#ffffff';
            ctx.fillText(sample.subtitle, 0, yBottom + anchorRadius + 46);
            ctx.restore();
          }
        });

        this.containerNode.addChild(colNode);
      });
    }
  }

  const instance = new AlignmentCanvasClass();
  global.AlignmentCanvas = instance;
  if (global.ROLL_CALL?.set) global.ROLL_CALL.set('Alignment_Canvas', instance);
})(typeof window !== 'undefined' ? window : this);
