/**
 * @fileoverview cells/font_studio/Font_Studio_Deck_1.1.js - Glyph Canvas Strokes & Parts Navigation
 * @description Implements setLevel, rebuildLevel, buildStrokesColumn, buildPartsColumn, and
 * getPartIcon on FontStudioDeckClass.prototype.
 */

(function(global) {
  'use strict';

  const FontStudioDeckClass = global.FontStudioDeckClass;
  if (!FontStudioDeckClass) return;

  const proto = FontStudioDeckClass.prototype;

  // ========================================================================
  // GLYPH CANVAS COLUMN DECK (Strokes & Parts Navigation)
  // ========================================================================
  proto.setLevel = function(lvl, animate = true) {
    this.currentLevel = Math.max(0, Math.min(1, lvl));
    const data = global.FontStudioData;
    if (data) data.currentDeckLevel = this.currentLevel;

    const slideDist = 280;
    const targetXs = [
      -this.currentLevel * slideDist,
      (1 - this.currentLevel) * slideDist
    ];

    const cols = [this.colStrokes, this.colParts];
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      if (!col) continue;
      col.position.x = targetXs[i];
      col.visible = true;
    }

    this.rebuildLevel(this.currentLevel);

    const audio = global.AudioSynth;
    if (animate && audio?.playClick) audio.playClick();
  };

  proto.rebuildLevel = function(lvl) {
    if (lvl === 0) this.buildStrokesColumn();
    else this.buildPartsColumn();
  };

  proto.buildStrokesColumn = function() {
    if (!this.colStrokes) return;
    this.colStrokes.children = [];

    const traits = global.HexTraits;
    const data = global.FontStudioData;
    const self = this;

    const activeGlyph = data?.getActiveGlyph();
    const strokes = activeGlyph?.strokes || [];

    // 6 Stroke Slots (Slots 0..5)
    for (let i = 0; i < 6; i++) {
      const stroke = strokes[i];
      const isAct = (data?.activeStrokeIndex === i);
      const hasStroke = !!stroke;
      const color = isAct ? '#f59e0b' : (hasStroke ? '#38bdf8' : 'rgba(56, 189, 248, 0.40)');

      const strokeBtn = this.createStandardHexButton(`btn-stroke-slot-${i}`, color, isAct);

      strokeBtn.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#f59e0b',
        onClick: () => {
          if (data) {
            data.selectStroke(i);
            if (!hasStroke) data.setActivePart('line');
          }
          self.setLevel(1);
        }
      }));

      const partIcon = hasStroke ? this.getPartIcon(stroke.part) : '+';
      const titleText = hasStroke ? stroke.part.toUpperCase() : '+ ADD STROKE';
      const subText = hasStroke ? (stroke.axis ? `${stroke.axis.toUpperCase()} Axis` : `Cell [${stroke.col},${stroke.row}]`) : 'Click to Configure';

      strokeBtn.addTrait({
        name: 'stroke-icon-stamp',
        render(ctx) {
          ctx.save();
          ctx.font = '700 24px Orbitron, sans-serif';
          ctx.fillStyle = isAct ? '#f59e0b' : (hasStroke ? '#38bdf8' : 'rgba(255, 255, 255, 0.35)');
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(partIcon, -35, 0);
          ctx.restore();
        }
      });

      strokeBtn.addTrait(new traits.TextTrait({
        badge: `SLOT ${i + 1}`,
        title: titleText,
        subtitle: subText,
        align: 'left',
        offsetX: 10,
        titleSize: 11,
        subtitleSize: 8,
        titleColor: isAct ? '#f59e0b' : (hasStroke ? '#38bdf8' : 'rgba(255, 255, 255, 0.45)')
      }));

      this.colStrokes.addChild(strokeBtn);
    }

    // Slot 6: Return to Font Board Button
    const backBtn = this.createStandardHexButton('btn-font-board-return', '#4ade80');
    backBtn.addTrait(new traits.ButtonTrait({
      hoverGlowColor: '#4ade80',
      onClick: () => {
        if (global.GlyphCanvas) global.GlyphCanvas.close();
        if (global.FontCanvas) global.FontCanvas.open();
      }
    }));
    backBtn.addTrait(new traits.TextTrait({
      badge: 'FONT BOARD', title: '✔ DONE / BACK', subtitle: 'Return to Font Canvas',
      align: 'center', titleSize: 11, subtitleSize: 8.5, titleColor: '#4ade80'
    }));
    this.colStrokes.addChild(backBtn);

    this.listStrokes.layoutChildren();
  };

  proto.buildPartsColumn = function() {
    if (!this.colParts) return;
    this.colParts.children = [];

    const traits = global.HexTraits;
    const data = global.FontStudioData;
    const self = this;

    const activeStroke = data?.getActiveStroke();
    const currentPart = activeStroke?.part || 'line';

    const parts = [
      { type: 'line', icon: '━', title: 'STRAIGHT LINE', sub: 'Width = Stem Overlap' },
      { type: 'circle', icon: '◯', title: 'FULL CIRCLE', sub: 'Inscribed in 1 Square' },
      { type: 'half_arc', icon: '◗', title: 'HALF CIRCLE', sub: 'R = Square / 2 Arc' },
      { type: 'quarter_circle', icon: '◔', title: 'QUARTER CIRCLE', sub: 'R = Square / 2 Arc' },
      { type: 'quarter_arc', icon: '◜', title: 'QUARTER ARC', sub: 'Corner to Corner' },
      { type: 'dot', icon: '●', title: 'SOLID DOT', sub: 'Square Center Disc' }
    ];

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const isAct = (currentPart === p.type);
      const partBtn = this.createStandardHexButton(`btn-part-choice-${p.type}`, '#38bdf8', isAct);

      partBtn.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#38bdf8',
        onClick: () => {
          if (data) data.setActivePart(p.type);
          self.rebuildLevel(1);
        }
      }));

      partBtn.addTrait({
        name: 'part-choice-icon',
        render(ctx) {
          ctx.save();
          ctx.font = '700 24px Orbitron, sans-serif';
          ctx.fillStyle = isAct ? '#38bdf8' : '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.icon, -35, 0);
          ctx.restore();
        }
      });

      partBtn.addTrait(new traits.TextTrait({
        badge: isAct ? 'ACTIVE' : 'PRIMITIVE',
        title: p.title,
        subtitle: p.sub,
        align: 'left',
        offsetX: 10,
        titleSize: 10.5,
        subtitleSize: 8,
        titleColor: isAct ? '#38bdf8' : '#f8fafc'
      }));

      this.colParts.addChild(partBtn);
    }

    // Slot 5: Confirm Part Button (Returns to Strokes Column)
    const confirmPartBtn = this.createStandardHexButton('btn-confirm-part', '#4ade80');
    confirmPartBtn.addTrait(new traits.ButtonTrait({
      hoverGlowColor: '#4ade80',
      onClick: () => self.setLevel(0)
    }));
    confirmPartBtn.addTrait(new traits.TextTrait({
      badge: 'LOCK', title: '✔ CONFIRM PART', subtitle: 'Lock Stroke & Return',
      align: 'center', titleSize: 11, subtitleSize: 8.5, titleColor: '#4ade80'
    }));
    this.colParts.addChild(confirmPartBtn);

    this.listParts.layoutChildren();
  };

  proto.getPartIcon = function(partType) {
    switch (partType) {
      case 'line': return '━';
      case 'circle': return '◯';
      case 'half_arc': return '◗';
      case 'quarter_circle': return '◔';
      case 'quarter_arc': return '◜';
      case 'dot': return '●';
      default: return '✦';
    }
  };

  if (global.ROLL_CALL?.set) global.ROLL_CALL.set('Font_Studio_Deck_1.1', global.FontStudioDeck);
})(typeof window !== 'undefined' ? window : this);
