/**
 * @fileoverview cells/hex_ui/Sigil_Nook_Canvas_1.0.js - Sigil Nook 12-Emblem Hex Grid & Frame
 * @description Part 1.0 of the multi-part Sigil Nook Canvas system.
 * Contains the 12 canonical sigil spells dataset, container node setup, lifecycle,
 * and the 4-5-4 pointy-top hex button grid layout with centered "Sigil Nook" anchor.
 */

(function(global) {
  'use strict';

  const SIGIL_SPELLS = [
    // Row 0 (Top: 4 tiles)
    { key: 'cyber', elem: 'Cyber', spell: 'Seek', formula: 'YYR', prim: '#b8d1f4', sec: '#ff9214', atlas: 'cyan',
      instructions: 'See upcoming Materials, then select one to replace your current Material.',
      summary: 'Inspect the upcoming conveyor queue and swap pieces.', rules: '• Consumes spell charge.\n• Only upcoming pieces can be swapped with active piece.\n• Useful for preparing complex cascading combos.' },
    { key: 'storm', elem: 'Storm', spell: 'Arch', formula: 'YYP', prim: '#ff9214', sec: '#fff700', atlas: 'yellow',
      instructions: 'Uses a zone of energy as a conduit to bridge distant Sigils for extended Alignments.',
      summary: 'Extend alignment range across the 9 adjacent tiles.', rules: '• Covers all 9 tiles adjacent to the sigil.\n• Conducts mutual alignment vectors across gaps.\n• Persists until current turn placement completes.' },
    { key: 'air', elem: 'Air', spell: 'Weave', formula: 'YYB', prim: '#fff700', sec: '#b8d1f4', atlas: 'yellow',
      instructions: 'Place Components one at a time up to 2 spaces apart, cycling through them with Rotation.',
      summary: 'Break material and place components individually.', rules: '• Each component must touch a previously placed tile.\n• Press Space or B5 to commit each placement step.\n• Rotate (B3/B4) permutes component placement order.' },
    { key: 'water', elem: 'Water', spell: 'Phase', formula: 'BBY', prim: '#3d6eff', sec: '#000000', atlas: 'blue',
      instructions: 'Allows Materials to be placed over other Components, cleansing any Disease covered by resonated Sigils.',
      summary: 'Overlap existing components and reveal unaligned layers.', rules: '• Can overlap non-locked placed tiles.\n• Underlying components are preserved beneath.\n• Does not destroy buried tiles.' },

    // Row 1 (Middle: 5 tiles)
    { key: 'light', elem: 'Light', spell: 'Charge', formula: 'RRY', prim: '#ffffff', sec: '#eb66ff', atlas: 'white',
      instructions: "Select any Active or Dormant Sigil on the field to empower it and use its Spell's effects.",
      summary: 'Recharge spent dormant sigils into brand new spells.', rules: '• Targets dormant (grayed out) sigils on the board.\n• Restores 1 castable spell slot.\n• Max capacity 12 spells.' },
    { key: 'heat', elem: 'Heat', spell: 'Form', formula: 'RRB', prim: '#eb66ff', sec: '#ff3333', atlas: 'red',
      instructions: 'Place Components from your Inventory onto the Field to create new Sigils.',
      summary: 'Place components from inventory into adjacent tiles.', rules: '• Requires at least 1 component in bag.\n• Targets the 9 tiles around the sigil.\n• Useful for completing new triangular sigil clusters.' },
    { key: 'ice', elem: 'Ice', spell: 'Store', formula: 'BBR', prim: '#06b6d4', sec: '#3d6eff', atlas: 'blue',
      instructions: 'Collect Components from the Field and store them in your Inventory for later use.',
      summary: 'Harvest adjacent tiles into your component inventory.', rules: '• Targets any placed tile in the 9-tile radius.\n• Harvested components are saved for Form or Weave.\n• Max component bag capacity is 6.' },
    { key: 'dark', elem: 'Dark', spell: 'Warp', formula: 'BBP', prim: '#000000', sec: '#06b6d4', atlas: 'purple',
      instructions: 'Select any Active or Dormant Sigil on the Field and transport it to any other available location.',
      summary: 'Pick up and relocate any sigil across the board.', rules: '• Can rotate the 3-tile orientation during transport.\n• Target vertex must be vacant or compatible.\n• Preserves active status.' },

    // Row 2 (Bottom: 4 tiles)
    { key: 'fire', elem: 'Fire', spell: 'Burn', formula: 'RRP', prim: '#ff3333', sec: '#ffffff', atlas: 'red',
      instructions: 'Allows Materials to be placed over other Components, destroying the Material and everything under it.',
      summary: 'Demolish target board tiles in blazing fury.', rules: '• Immediately destroys target tiles and itself.\n• Clears corrupted or obstructive tiles.\n• Yields zero points on destruction.' },
    { key: 'stone', elem: 'Stone', spell: 'Lock', formula: 'PPR', prim: '#953ffd', sec: '#a66a26', atlas: 'purple',
      instructions: 'Prevents the Components of a Material from forming any Sigils until the next turn.',
      summary: 'Armors material and prevents sigil formation for 1 turn.', rules: '• Prevents premature triangular sigil activation.\n• Protects tiles from enemy burn or disruption for 1 turn.\n• Dissolves at next turn start.' },
    { key: 'wood', elem: 'Wood', spell: 'Shift', formula: 'PPY', prim: '#0abd0d', sec: '#953ffd', atlas: 'green',
      instructions: 'Rearrange the placement of Components within the Shape Shift zone to form new Sigils.',
      summary: 'Rearrange and swap the 9 tiles adjacent to the sigil.', rules: '• Targets any 2 tiles within the 9-hex radius.\n• Ideal for correcting imperfect formulas.\n• Can trigger multiple cascades.' },
    { key: 'feral', elem: 'Feral', spell: 'Heal', formula: 'PPB', prim: '#a66a26', sec: '#0abd0d', atlas: 'orange',
      instructions: 'Recovers up to 4 HP, and will auto-cast if Damage exceeds your HP at the End of Turn.',
      summary: 'Restore vitality and mend hull damage up to +4 HP.', rules: '• Instantly restores +4 HP.\n• Capped at maximum 12 HP.\n• Cannot exceed max health pool.' }
  ];

  class SigilNookCanvasClass {
    constructor() {
      this.engine = null;
      this.containerNode = null;
      this.stage = 'closed'; // 'closed' | 'grid' | 'detail'
      this.selectedSpell = null;
      this.config = {
        spacing: 224, size: 90, textSize: 72, textSpacing: 72, textX: 6, textY: 6
      };
      this.detailConfig = {
        titleGroupY: -242, titleTextY: 3, compY: -131, instructFrameY: 133, instructTextY: -2,
        titleWBase: 338, titleHBase: 83, titleApex: 24, instructWBase: 733, instructHBase: 380, instructApex: 116,
        titleTextSize: 54, instructTextSize: 45, instructLineHeight: 60, instructTextWidth: 800,
        emblemSpacing: 640, compSpacing: 124, emblemSize: 80, compSize: 50
      };
    }

    setConfig(updates = {}) {
      Object.assign(this.config, updates);
      if (this.stage === 'grid') this.buildGridStage();
    }

    setDetailConfig(updates = {}) {
      Object.assign(this.detailConfig, updates);
      if (this.stage === 'detail') this.buildDetailStage();
    }

    setSpellInstructions(text) {
      if (!this.selectedSpell) this.selectedSpell = SIGIL_SPELLS[0];
      this.selectedSpell.instructions = text;
      if (this.stage === 'detail') this.buildDetailStage();
    }

    init(engine) {
      this.engine = engine;
      const HexNode = global.HexNode;
      if (!HexNode) return false;

      this.containerNode = new HexNode({
        id: 'sigil-nook-root', position: { x: 0, y: 0 },
        wBase: 960, hBase: 800, apex: 220, orientation: 'flat', clipContent: false,
        style: { bgOpacity: 0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
      });
      this.containerNode.visible = false;
      this.gridFrame = null;
      this.detailFrame = null;
      this.lastEmblemOrigin = null;
      this.containerNode.onResize = () => {
        if (this.stage === 'grid' && this.gridFrame) this.buildGridStage(this.gridFrame);
        else if (this.stage === 'detail' && this.detailFrame) this.buildDetailStage(this.detailFrame);
      };
      return true;
    }

    createNookFrame(id, spell = null) {
      const HexNode = global.HexNode;
      const secColor = spell?.sec || '#ffffff';
      const frame = new HexNode({
        id: id || 'sigil-nook-frame', position: { x: 0, y: 0 },
        wBase: 960, hBase: 800, apex: 220, orientation: 'flat', clipContent: true,
        style: {
          bgColor: 'rgba(5, 10, 20, 1.0)', bgOpacity: 1.00,
          innerHighlight: { enabled: true, color: (spell?.prim || '#10f000'), sharpEdgeColor: (spell?.prim || '#10f000'), spread: 8, intensity: 0.80, steps: 3 },
          outerHighlight: spell ? { enabled: true, color: secColor, sharpEdgeColor: secColor, blur: 8, intensity: 0.80, lineWidth: 1.5, steps: 3 } : { enabled: false, color: '#0284c7', blur: 24, intensity: 0.50 }
        }
      });
      if (global.BorderTuningLab?.applyGroupStyle) {
        global.BorderTuningLab.applyGroupStyle(frame, spell ? 'group-sigil-detail' : 'group-canvases');
      }
      return frame;
    }

    isAnimating() {
      return !!(this.gridFrame?.animating || this.detailFrame?.animating
        || this.containerNode?.children?.some(c => c.animating));
    }

    _hasOtherOverlayOpen() {
      return !!(global.StatCanvas?.isOpen?.() || global.GameSettingsCanvas?.isOpen?.() || global.SigilEmblemStudio?.isOpen?.() || global.TurnConfirmPopup?.isOpen?.());
    }

    isOpen() { return this.stage !== 'closed' || this.isAnimating(); }

    open(origin = 'btn-ctrl-1') {
      if (this.stage !== 'closed' || this.isAnimating() || this._hasOtherOverlayOpen()) return;
      this.stage = 'grid';
      this.selectedSpell = null;
      this._originId = origin;
      if (this.engine?.setStudioOverlay) this.engine.setStudioOverlay(this.containerNode);
      this.containerNode.style = { bgOpacity: 0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } };
      this.containerNode.visible = true;
      this.containerNode.children = [];
      this.gridFrame = this.createNookFrame('sigil-nook-grid-frame');
      this.containerNode.addChild(this.gridFrame);
      this.buildGridStage(this.gridFrame);
      if (global.TweenOrchestrator?.expandFrame) {
        global.TweenOrchestrator.expandFrame(this.gridFrame, origin);
      } else {
        this.gridFrame.visible = true;
      }
      if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
      global.BoardRenderer?.render();
    }

    close(onDone) {
      if ((this.stage === 'closed' && !this.containerNode?.visible) || this.isAnimating()) return;
      this.stage = 'closed';
      this.selectedSpell = null;
      const activeFrame = (this.detailFrame && this.detailFrame.visible) ? this.detailFrame : (this.gridFrame || this.containerNode);
      const doCloseCleanup = () => {
        if (this.containerNode) {
          this.containerNode.visible = false;
          this.containerNode.children = [];
        }
        this.gridFrame = null;
        this.detailFrame = null;
        if (this.engine?.studioOverlay === this.containerNode && typeof this.engine.setStudioOverlay === 'function') {
          this.engine.setStudioOverlay(null);
        }
        global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
        global.BoardRenderer?.render();
        if (typeof onDone === 'function') onDone();
      };
      if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
      if (global.TweenOrchestrator?.collapseFrame && activeFrame?.visible) {
        global.TweenOrchestrator.collapseFrame(activeFrame, this._originId || 'btn-ctrl-1', {
          onComplete: doCloseCleanup
        });
      } else {
        doCloseCleanup();
      }
    }

    goBack() {
      if (this.isAnimating()) return true;
      if (this.stage === 'detail') {
        this.stage = 'grid';
        this.selectedSpell = null;
        if (!this.gridFrame && this.containerNode) {
          this.gridFrame = this.createNookFrame('sigil-nook-grid-frame');
          this.containerNode.addChild(this.gridFrame);
          this.buildGridStage(this.gridFrame);
        }
        if (this.gridFrame) {
          this.gridFrame.visible = true;
          this.gridFrame.scale = 1.0;
          this.gridFrame.contentAlpha = 1.0;
          this.gridFrame.position.x = 0;
          this.gridFrame.position.y = 0;
        }
        if (global.TweenOrchestrator?.collapseFrame && this.detailFrame?.visible) {
          global.TweenOrchestrator.collapseFrame(this.detailFrame, this.lastEmblemOrigin, {
            onComplete: () => {
              if (this.detailFrame) {
                this.detailFrame.visible = false;
                this.containerNode.removeChild(this.detailFrame);
                this.detailFrame = null;
              }
            }
          });
        } else if (this.detailFrame) {
          this.detailFrame.visible = false;
          this.containerNode.removeChild(this.detailFrame);
          this.detailFrame = null;
        }
        if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
        return true;
      }
      if (this.stage === 'grid') { this.close(); return true; }
      return false;
    }

    openDetail(spell, originNode = null) {
      if (this.stage === 'detail' || this.isAnimating() || this._hasOtherOverlayOpen()) return;
      const hasHub = !!this.gridFrame;
      if (this.engine?.setStudioOverlay) this.engine.setStudioOverlay(this.containerNode);
      this.containerNode.style = { bgOpacity: 0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } };
      this.containerNode.visible = true;

      // Option B: Ensure the Nook hub frame exists behind direct detail opens so backing out reveals the hub
      if (!hasHub) {
        this.containerNode.children = [];
        this._originId = (typeof originNode === 'string' && originNode) ? originNode : 'btn-ctrl-1';
        this.gridFrame = this.createNookFrame('sigil-nook-grid-frame');
        this.gridFrame.visible = false;
        this.containerNode.addChild(this.gridFrame);
        this.buildGridStage(this.gridFrame);
      }

      if (this.detailFrame) {
        this.detailFrame.visible = false;
        this.containerNode.removeChild(this.detailFrame);
        this.detailFrame = null;
      }

      this.stage = 'detail';
      this.selectedSpell = spell;

      const expandOrigin = originNode || (hasHub ? (global.HexUIEngine?.lastClickedNode || `nook-btn-${spell.key}`) : this._originId);
      const expandPos = global.TweenOrchestrator?.getOriginPoint(expandOrigin, this.gridFrame?.position?.x || 0, this.gridFrame?.position?.y || 0);
      this.lastEmblemOrigin = hasHub
        ? expandPos
        : (global.TweenOrchestrator?.getOriginPoint(`nook-btn-${spell.key}`, expandPos?.x || 0, expandPos?.y || 0) || expandPos);

      this.detailFrame = this.createNookFrame('sigil-nook-detail-frame', spell);
      this.buildDetailStage(this.detailFrame);
      this.containerNode.addChild(this.detailFrame);

      if (hasHub && this.gridFrame) this.gridFrame.visible = true;

      if (global.TweenOrchestrator?.expandFrame) {
        global.TweenOrchestrator.expandFrame(this.detailFrame, expandPos, {
          onComplete: () => {
            if (this.gridFrame) this.gridFrame.visible = false;
          }
        });
      } else {
        this.detailFrame.visible = true;
        if (this.gridFrame) this.gridFrame.visible = false;
      }
      if (global.TuningDrawerLab?.syncDetailSpell) global.TuningDrawerLab.syncDetailSpell(spell);
      if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
      global.BoardRenderer?.render();
    }

    buildGridStage(targetFrame = null) {
      const frame = targetFrame || this.gridFrame || this.containerNode;
      if (!frame) return;
      frame.children = [];
      const HexNode = global.HexNode, traits = global.HexTraits;
      if (!HexNode || !traits) return;

      const cfg = this.config, spacing = cfg.spacing || 224, emblemSize = cfg.size || 90;
      const textSize = cfg.textSize || 60, textSpacing = cfg.textSpacing || 60;
      const dx = spacing, dy = spacing * (Math.sqrt(3) * 0.5);

      const spellMap = {};
      SIGIL_SPELLS.forEach(s => {
        const name = (s.spell || s.elem || '').toLowerCase();
        if (name) spellMap[name] = s;
        if (s.key) spellMap[s.key] = s;
        if (s.elem) spellMap[s.elem.toLowerCase()] = s;
      });
      spellMap['manifest'] = spellMap['form'];
      spellMap['foresight'] = spellMap['seek'];
      spellMap['fortify'] = spellMap['lock'];
      spellMap['teleport'] = spellMap['warp'];
      spellMap['ritual'] = spellMap['store'];

      // Row 0: 4 tiles
      ['form', 'charge', 'seek', 'arch'].map(name => spellMap[name]).forEach((sp, idx) => {
        if (sp) this.addEmblemHexButton((-1.5 + idx) * dx, -dy, emblemSize, sp, frame);
      });

      // Row 1: 5 tiles (burn, lock, CENTER TEXT, weave, phase)
      const xIndices = [-2, -1, 0, 1, 2];
      if (spellMap['burn']) this.addEmblemHexButton(xIndices[0] * dx, 0, emblemSize, spellMap['burn'], frame);
      if (spellMap['lock'] || spellMap['fortify']) this.addEmblemHexButton(xIndices[1] * dx, 0, emblemSize, spellMap['lock'] || spellMap['fortify'], frame);

      // Center Anchor ("Sigil Nook")
      const textX = (cfg.textX !== undefined) ? cfg.textX : 0, textY = (cfg.textY !== undefined) ? cfg.textY : 0;
      const centerNode = new HexNode({
        id: 'nook-center-anchor', position: { x: textX, y: textY },
        wBase: emblemSize * 2.2, hBase: emblemSize * 2.2, apex: 0, orientation: 'flat',
        style: { bgColor: 'rgba(0,0,0,0)', bgOpacity: 0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
      });
      centerNode.addTrait({
        name: 'nook-center-text',
        render(ctx) {
          ctx.save();
          ctx.font = `400 ${textSize}px "Sci-Fae", "SciFaePseudoScript10", "SciFae Pseudo Script 1.0", sans-serif`;
          ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(255, 255, 255, 0.45)'; ctx.shadowBlur = 10;
          ctx.fillText('Sigil', 0, -textSpacing * 0.5);
          ctx.fillText('Nook', 0, textSpacing * 0.5);
          ctx.restore();
        }
      });
      frame.addChild(centerNode);

      if (spellMap['weave']) this.addEmblemHexButton(xIndices[3] * dx, 0, emblemSize, spellMap['weave'], frame);
      if (spellMap['phase']) this.addEmblemHexButton(xIndices[4] * dx, 0, emblemSize, spellMap['phase'], frame);

      // Row 2: 4 tiles
      ['shift', 'heal', 'warp', 'store'].map(name => spellMap[name]).forEach((sp, idx) => {
        if (sp) this.addEmblemHexButton((-1.5 + idx) * dx, dy, emblemSize, sp, frame);
      });
    }

    addEmblemHexButton(x, y, emblemSize, spell, targetFrame = null) {
      const HexNode = global.HexNode, traits = global.HexTraits, self = this;
      if (!HexNode || !traits) return;
      const frame = targetFrame || this.gridFrame || this.containerNode;
      const hitRadius = Math.max(emblemSize * 1.15, 24);
      const btn = new HexNode({
        id: `nook-btn-${spell.key}`, position: { x, y }, wBase: hitRadius * 2, hBase: hitRadius * 2, apex: 0, orientation: 'flat',
        style: { bgColor: 'rgba(0,0,0,0)', bgOpacity: 0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
      });
      btn.addTrait(new traits.ButtonTrait({ hoverGlowColor: spell.prim, hoverOutline: false, onClick: () => self.openDetail(spell, btn) }));
      btn.addTrait({
        name: 'nook-emblem-render',
        render(ctx, node) {
          const renderer = global.SigilEmblemRenderer;
          const btnTrait = node.getTrait('button');
          const isHovered = btnTrait ? (btnTrait.state === 'hovered' || btnTrait.state === 'pressed') : false;
          if (renderer?.renderEmblem) {
            ctx.save();
            renderer.renderEmblem(ctx, { key: spell.key, color: spell.prim, sec: spell.sec }, null, isHovered, emblemSize, 'wireframe');
            ctx.restore();
          }
        }
      });
      frame.addChild(btn);
    }
  }

  const instance = new SigilNookCanvasClass();
  global.SigilNookCanvasClass = SigilNookCanvasClass;
  global.SigilNookCanvas = instance;
  global.SIGIL_SPELLS = SIGIL_SPELLS;
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Sigil_Nook_Canvas', instance);
})(window);
