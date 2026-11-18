/**
 * @fileoverview cells/hex_ui/Sigil_Emblem_Studio_1.0.js - Sigil Emblem Studio Core & Dial Stage
 * @description Palette & elemental definitions, variant motif metadata, SigilEmblemStudioClass
 * modal lifecycle, and Stage 1 12-element radial dial scene builder.
 */

(function(global) {
  'use strict';

  const DEFAULT_PALETTE = {
    red: '#ff3333', blue: '#3d6eff', yellow: '#fff700', purple: '#953ffd', orange: '#ff9214', green: '#0abd0d',
    black: '#000000', white: '#ffffff', grey: '#b8d1f4', brown: '#a66a26', magenta: '#eb66ff', cyan: '#06b6d4'
  };
  global.COSMOS_PALETTE = Object.assign({}, DEFAULT_PALETTE);

  // 12 Elemental Definitions with Dynamic Palette Getters
  const ELEM_CONFIGS = [
    ['cyber','Cyber','12:30',15,'grey','orange'], ['storm','Storm','1:30',45,'orange','yellow'], ['air','Air','2:30',75,'yellow','grey'],
    ['water','Water','3:30',105,'blue','black'], ['ice','Ice','4:30',135,'cyan','blue'], ['dark','Dark','5:30',165,'black','cyan'],
    ['feral','Feral','6:30',195,'brown','green'], ['wood','Wood','7:30',225,'green','purple'], ['stone','Stone','8:30',255,'purple','brown'],
    ['fire','Fire','9:30',285,'red','white'], ['heat','Heat','10:30',315,'magenta','red'], ['light','Light','11:30',345,'white','magenta']
  ];
  const ELEMENTS = ELEM_CONFIGS.map(([key, name, pos, angleDeg, prim, sec]) => ({
    key, name, pos, angleDeg, primKey: prim, secKey: sec,
    get color() { return (global.COSMOS_PALETTE && global.COSMOS_PALETTE[prim]) || DEFAULT_PALETTE[prim]; },
    get secondary() { return (global.COSMOS_PALETTE && global.COSMOS_PALETTE[sec]) || DEFAULT_PALETTE[sec]; },
    get basinBg() { return (global.COSMOS_PALETTE && global.COSMOS_PALETTE[sec]) || DEFAULT_PALETTE[sec]; }
  }));

  // Procedural Emblem Variant Motifs (6 Suggestions per Element)
  const VARIANT_TITLES = {
    cyber: ['Grand Balanced (Squared)', 'Max Basin Grand', 'Long Stem Reach', 'Tuned Seeker (#4 Winner)', 'Stepped Cyber Collar', 'Radial Cut Grand'],
    storm: ['Moderate Thick (28°)', 'Athletic Muscular (30°)', 'Bold Monolith (32°)', 'Heavy Power Slash (35°)', 'Wide-Shelf Core (27°)', 'High-Elbow Dynamic (29°)'],
    air:   ['Centered Lean (1.02x)', 'Substantial Air (1.07x)', 'Grand Wind (1.12x)', 'Bold Basin Air (1.17x)', 'Majestic Wind (1.22x)', 'Max Basin Grand (1.27x)'],
    water: ['Petite Water #1 (72%)', 'Compact Water #1 (80%)', 'Medium Water #1 (88%)', 'Substantial #1 (96%)', 'Grand Water #1 (104%)', 'Max Basin #1 (112%)'],
    ice:   ['Petite Frost #2 (68%)', 'Compact Frost #2 (76%)', 'Medium Frost #2 (84%)', 'Substantial #2 (92%)', 'Grand Frost #2 (100%)', 'Max Basin #2 (108%)'],
    dark:  ['Galactic Vortex', 'Hooked Scythe Arms', 'Slotted Void Streams', 'Deep Orbit Tendrils', 'Barred Spiral Wings', 'Nested Halo Singularity'],
    feral: ['Grand Tall Paw', 'Apex Crest Stride', 'Broad Base Stride', 'Plump Tall Ovals', 'Heart Canine Paw', 'Flared Motion Stride'], wood: ['Elongated Slot Sprout', 'Tilted Long Stem', 'Deep Bodhi Trunk', 'Lancet Needle Trunk', 'Wind-Swept Stem', 'Bold Grounded Wedge'],
    stone: ['Centered Megalith', 'Compact Butte', 'Table Mesa', 'Elevated Crag', 'Chiseled Brow', 'Hex Megalith'], fire: ['Petite Flame #2 (72%)', 'Compact Flame #2 (80%)', 'Medium Flame #2 (88%)', 'Substantial #2 (96%)', 'Grand Flame #2 (104%)', 'Max Basin #2 (112%)'],
    heat:  ['Solid Medium-Thick', 'Compact Stout', 'Extra-Compressed', 'Ultra-Stout Monolith', 'Wide Architectural', 'Rounded Heavy Caps'], light: ['Variant #1', 'Variant #2', 'Variant #3', 'Variant #4', 'Variant #5', 'Variant #6']
  };

  class SigilEmblemStudioClass {
    constructor() {
      this.engine = null; this.containerNode = null;
      this.stage = 'closed'; this.selectedElement = null;
      this.selectedVariantIndex = 0; this.selectedVariantId = '';
      this.toastTimer = null; this.toastMessage = '';
      this.renderMode = 'wireframe';
      this.chosenVariants = { cyber: 3, storm: 0, air: 3, water: 5, ice: 5, dark: 1, feral: 1, wood: 2, stone: 0, fire: 4, heat: 5, light: 1 };
    }

    init(engine) {
      this.engine = engine;
      const HexNode = global.HexNode;
      if (!HexNode) { console.error('SigilEmblemStudio: HexNode not available.'); return false; }
      this.containerNode = new HexNode({
        id: 'studio-overlay-frame', wBase: 900, hBase: 790, apex: 250, orientation: 'flat',
        style: {
          bgColor: 'rgba(0, 0, 0, 0.70)', bgOpacity: 0.70,
          innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#7dd3fc', spread: 14, intensity: 0.45 },
          outerHighlight: { enabled: true, color: '#0284c7', sharpEdgeColor: '#38bdf8', blur: 16, intensity: 0.35 }
        }
      });
      this.containerNode.visible = false;
      if (engine?.setStudioOverlay) engine.setStudioOverlay(this.containerNode);
      this.containerNode.onResize = () => { (this.stage === 'dial') ? this.buildDialStage() : (this.stage === 'variants' && this.buildVariantsStage()); };
      return true;
    }

    isOpen() { return this.stage !== 'closed'; }
    toggle() { if (this.isOpen()) this.close(); else this.openDial(); }

    openDial() {
      this.stage = 'dial'; this.containerNode.visible = true; this.buildDialStage();
      const audio = global.AudioSynth; if (audio?.playClick) audio.playClick();
    }

    openVariants(elem) {
      this.selectedElement = elem;
      this.selectedVariantIndex = (this.chosenVariants && this.chosenVariants[elem.key] !== undefined) ? this.chosenVariants[elem.key] : 0;
      this.selectedVariantId = `${elem.key.toUpperCase()}_EMBLEM_0${this.selectedVariantIndex + 1}`;
      this.stage = 'variants'; this.buildVariantsStage();
      const audio = global.AudioSynth; if (audio?.playClick) audio.playClick();
    }

    goBack() {
      if (this.stage === 'variants') { this.openDial(); return true; }
      else if (this.stage === 'dial') { this.close(); if (global.CanvasHub) global.CanvasHub.open(); return true; }
      return false;
    }

    updateFrameGeometry(wBase, hBase, apex, orientation) {
      if (!this.containerNode) return;
      this.containerNode.setDimensions(wBase, hBase, apex, orientation);
      if (this.stage === 'dial') this.buildDialStage();
      else if (this.stage === 'variants') this.buildVariantsStage();
    }

    close() {
      this.stage = 'closed';
      this.containerNode.visible = false;
      this.containerNode.children = [];
      const audio = global.AudioSynth;
      if (audio && typeof audio.playClick === 'function') audio.playClick();
    }

    // ========================================================================
    // STAGE 1: 12-ELEMENT RADIAL DIAL (15° OFF NORTH / 12:30 CLOCKWISE)
    // ========================================================================
    buildDialStage() {
      if (!this.containerNode) return;
      this.containerNode.children = [];
      const HexNode = global.HexNode;
      const traits = global.HexTraits;
      if (!HexNode || !traits) return;

      const w = this.containerNode.dimensions.wBase || 900;
      const h = this.containerNode.dimensions.hBase || 790;
      const radius = Math.min(w * 0.38, h * 0.38);

      // Title & Instruction Node
      const titleNode = new HexNode({
        id: 'dial-title-node', position: { x: 0, y: -radius - 42 },
        wBase: Math.min(440, w * 0.8), hBase: 34, apex: 12, orientation: 'flat',
        style: { bgColor: 'rgba(15, 23, 42, 0.90)', bgOpacity: 0.90, innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#bae6fd', fade: 0, spread: 0, intensity: 0.8 } }
      });
      titleNode.addTrait(new traits.TextTrait({
        title: 'SIGIL EMBLEM STUDIO', subtitle: 'Select an Element to Inspect Variations • Center to Copy Defaults',
        align: 'center', titleSize: 12, subtitleSize: 9, titleColor: '#38bdf8'
      }));
      this.containerNode.addChild(titleNode);

      // Center Pointy-Top Button (Copies All 12 Chosen Defaults to Clipboard)
      const centerCopyBtn = new HexNode({
        id: 'btn-dial-copy-defaults', position: { x: 0, y: 0 },
        wBase: 110, hBase: 80, apex: 24, orientation: 'pointy',
        style: {
          bgColor: 'rgba(15, 23, 42, 0.92)', bgOpacity: 0.92,
          innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#bae6fd', fade: 0, spread: 0, intensity: 0.9, lineWidth: 1.8 },
          outerHighlight: { enabled: true, color: '#0284c7', sharpEdgeColor: '#38bdf8', blur: 24, intensity: 0.7 }
        }
      });
      centerCopyBtn.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#38bdf8',
        onClick: () => this.copyAllDefaults()
      }));
      centerCopyBtn.addTrait(new traits.TextTrait({
        badge: '📋 CLIPBOARD', title: 'COPY DEFAULTS', subtitle: '12 Chosen Emblems',
        align: 'center', titleSize: 10.5, subtitleSize: 8, titleColor: '#38bdf8'
      }));
      this.containerNode.addChild(centerCopyBtn);
      this.buildHubReturnButton();

      // 12 Radial Pointy-Top Emblem Medallions (Outer Master Ring & Inner Dormant Mini Ring)
      const dialBtnR = 40, dialW = Math.round(Math.sqrt(3) * dialBtnR), dialH = dialBtnR, dialApex = Math.round(dialBtnR * 0.5);
      const miniR = 21, miniOrbit = radius * 0.56, miniW = Math.round(Math.sqrt(3) * miniR), miniH = miniR, miniApex = Math.round(miniR * 0.5);
      const self = this, isWire = (this.renderMode === 'wireframe');

      for (let i = 0; i < ELEMENTS.length; i++) {
        const elem = ELEMENTS[i], rad = (elem.angleDeg * Math.PI) / 180.0;
        const bx = radius * Math.sin(rad), by = -radius * Math.cos(rad);
        const mx = miniOrbit * Math.sin(rad), my = -miniOrbit * Math.cos(rad);

        // 1. Inner Dormant Mini Emblem (3D Pyramid + Basin, Clean Corners, Zero Symbol)
        const mini = new HexNode({
          id: `btn-dial-mini-${elem.key}`, position: { x: mx, y: my },
          wBase: miniW, hBase: miniH, apex: miniApex, orientation: 'pointy',
          style: { bgColor: 'rgba(15, 23, 42, 0.40)', bgOpacity: 0.40, outerHighlight: { enabled: true, color: elem.color, blur: 10, intensity: 0.40 } }
        });
        mini.addTrait(new traits.ButtonTrait({ hoverGlowColor: '#ffffff', onClick: () => self.openVariants(elem) }));
        mini.addTrait({
          name: 'dormant-emblem',
          render(ctx) {
            const renderer = global.SigilEmblemRenderer;
            if (renderer && typeof renderer.renderEmblem === 'function') renderer.renderEmblem(ctx, elem, 0, false, miniR, 'dormant');
          }
        });
        this.containerNode.addChild(mini);

        // 2. Outer Active Master Emblem
        const btn = new HexNode({
          id: `btn-dial-${elem.key}`, position: { x: bx, y: by },
          wBase: dialW, hBase: dialH, apex: dialApex, orientation: 'pointy',
          style: {
            bgColor: isWire ? 'rgba(15, 23, 42, 0.40)' : elem.color, bgOpacity: isWire ? 0.40 : 1.0,
            innerHighlight: { enabled: !isWire, color: elem.secondary, sharpEdgeColor: elem.secondary, fade: 0, spread: 0, intensity: 1.0, lineWidth: 1.6 },
            outerHighlight: { enabled: true, color: elem.color, sharpEdgeColor: elem.secondary, blur: 16, intensity: 0.55 }
          }
        });

        btn.addTrait(new traits.ButtonTrait({ hoverGlowColor: '#ffffff', onClick: () => self.openVariants(elem) }));
        btn.addTrait({
          name: 'emblem',
          render(ctx, node) {
            const renderer = global.SigilEmblemRenderer;
            const variantIdx = (self.chosenVariants && self.chosenVariants[elem.key] !== undefined) ? self.chosenVariants[elem.key] : 0;
            if (renderer && typeof renderer.renderEmblem === 'function') renderer.renderEmblem(ctx, elem, variantIdx, false, dialBtnR, self.renderMode);

            ctx.save();
            const tagY = dialBtnR + 15, badgeText = `${elem.name.toUpperCase()} • ${elem.pos}`;
            ctx.font = '700 9px "Orbitron", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const textWidth = ctx.measureText(badgeText).width + 12;
            ctx.beginPath(); ctx.roundRect(-textWidth / 2, tagY - 8, textWidth, 16, 4);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.90)'; ctx.fill();
            ctx.strokeStyle = elem.secondary; ctx.lineWidth = 1.0; ctx.stroke();
            ctx.fillStyle = '#ffffff'; ctx.fillText(badgeText, 0, tagY);
            ctx.restore();
          }
        });
        this.containerNode.addChild(btn);
      }
    }
  }

  SigilEmblemStudioClass._data = { ELEMENTS, VARIANT_TITLES };

  const instance = new SigilEmblemStudioClass();
  global.SigilEmblemStudioClass = SigilEmblemStudioClass;
  global.SigilEmblemStudio = instance;
  if (global.ROLL_CALL?.set) global.ROLL_CALL.set('Sigil_Emblem_Studio_1.0', instance);
})(typeof window !== 'undefined' ? window : this);
