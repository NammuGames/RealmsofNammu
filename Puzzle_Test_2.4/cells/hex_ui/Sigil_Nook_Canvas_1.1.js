/**
 * Sigil_Nook_Canvas_1.1.js
 * Multi-Part Cell: Part 1.1 of Sigil_Nook_Canvas
 * Implements detail card stage (buildDetailStage), text wrapping (wrapText), and spell accessors.
 * Strictly adheres to the 500-line limit and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const Proto = (global.SigilNookCanvasClass && global.SigilNookCanvasClass.prototype) ||
                (global.SigilNookCanvas && Object.getPrototypeOf(global.SigilNookCanvas));

  if (!Proto) {
    console.error('[Sigil_Nook_Canvas_1.1] SigilNookCanvasClass prototype not found. Ensure Sigil_Nook_Canvas_1.0.js is loaded first.');
    return;
  }

  const SIGIL_SPELLS = global.SIGIL_SPELLS || [];

  /**
   * Constructs the full interactive instruction card for the selected spell.
   */
  Proto.buildDetailStage = function(targetFrame = null) {
    const frame = targetFrame || this.detailFrame || this.containerNode;
    if (!frame) return;
    if (!this.selectedSpell) this.selectedSpell = SIGIL_SPELLS[0];
    frame.children = [];
    const HexNode = global.HexNode;
    const traits = global.HexTraits;
    if (!HexNode || !traits) return;

    const self = this;
    const sp = this.selectedSpell;
    const cfg = this.detailConfig;
    const fontSciFae = '"Sci-Fae", "SciFaePseudoScript10", "SciFae Pseudo Script 1.0", sans-serif';
    const secColor = sp?.sec || '#ffffff';

    if (frame.style) {
      if (frame.style.innerHighlight && sp?.prim) {
        frame.style.innerHighlight.color = sp.prim;
        frame.style.innerHighlight.sharpEdgeColor = sp.prim;
      }
      frame.style.outerHighlight = {
        enabled: true, color: secColor, sharpEdgeColor: secColor, blur: 8, intensity: 0.80, lineWidth: 1.5, steps: 3
      };
      if (global.BorderTuningLab?.applyGroupStyle) global.BorderTuningLab.applyGroupStyle(frame, 'group-sigil-detail');
      if (typeof frame.invalidateCache === 'function') frame.invalidateCache();
    }

    // 1. Resolve XYX formula colors (majority, minority, majority)
    const colorLookup = { R: { key: 'red', hex: '#f87171' }, B: { key: 'blue', hex: '#38bdf8' }, Y: { key: 'yellow', hex: '#fbbf24' }, P: { key: 'purple', hex: '#c084fc' } };
    const counts = {};
    for (const ch of (sp.formula || '')) counts[ch] = (counts[ch] || 0) + 1;
    let maj = 'R', min = 'B';
    for (const ch in counts) { if (counts[ch] >= 2) maj = ch; else min = ch; }
    const xyxList = [maj, min, maj].map(c => colorLookup[c] || { key: 'blue', hex: '#38bdf8' });

    // 2. Component Combination Placed Between Title Bar and Instructions (Horizontal XYX at compY)
    const compNode = new HexNode({
      id: 'nook-detail-xyx-group', position: { x: 0, y: cfg.compY }, wBase: cfg.compSpacing * 3, hBase: cfg.compSize * 2.2, apex: 0, orientation: 'flat',
      style: { bgColor: 'rgba(0,0,0,0)', bgOpacity: 0 }
    });
    compNode.addTrait({
      name: 'detail-xyx-render',
      render(ctx) {
        const poly = global.PolyhedronRenderer;
        const offsets = [-cfg.compSpacing, 0, cfg.compSpacing];
        xyxList.forEach((col, idx) => {
          const cx = offsets[idx];
          ctx.save();
          const glow = ctx.createRadialGradient(cx, 0, 4, cx, 0, cfg.compSize * 1.15);
          glow.addColorStop(0, col.hex);
          glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(cx, 0, cfg.compSize * 1.15, 0, Math.PI * 2);
          ctx.fill();
          if (poly?.drawComponent) poly.drawComponent(ctx, cx, 0, cfg.compSize, col.key, 0, false, false, 0.95);
          ctx.restore();
        });
      }
    });
    frame.addChild(compNode);

    // 3. Centered Large Flat-Top Hex Frame Title Bar (Equal size for all spells, Unified Black Glass)
    const titleBar = new HexNode({
      id: 'nook-detail-title-bar', position: { x: 0, y: cfg.titleGroupY }, wBase: cfg.titleWBase, hBase: cfg.titleHBase, apex: cfg.titleApex, orientation: 'flat',
      style: {
        bgColor: '#000000', bgOpacity: 0.90, strokeColor: secColor, strokeOpacity: 0.80,
        innerHighlight: { enabled: true, color: sp.prim, sharpEdgeColor: sp.prim, spread: 8, intensity: 0.80, steps: 3 },
        outerHighlight: { enabled: true, color: secColor, sharpEdgeColor: secColor, blur: 8, intensity: 0.80, lineWidth: 1.5, steps: 3 }
      }
    });
    if (global.BorderTuningLab?.applyGroupStyle) global.BorderTuningLab.applyGroupStyle(titleBar, 'group-sigil-detail');
    titleBar.addTrait({
      name: 'detail-title-render',
      render(ctx) {
        ctx.save();
        ctx.font = `400 ${cfg.titleTextSize}px ${fontSciFae}`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = sp.prim;
        ctx.shadowBlur = 8;
        const title = sp.spell ? (sp.spell.charAt(0).toUpperCase() + sp.spell.slice(1).toLowerCase()) : '';
        ctx.fillText(title, 0, cfg.titleTextY);
        ctx.restore();
      }
    });
    frame.addChild(titleBar);

    // 4. Flanking Emblems (Left and Right of the Title Bar, moving with titleGroupY)
    const halfEmblem = cfg.emblemSpacing * 0.5;
    [-halfEmblem, halfEmblem].forEach((posX, i) => {
      const emblemNode = new HexNode({
        id: `nook-detail-flank-${i === 0 ? 'left' : 'right'}`, position: { x: posX, y: cfg.titleGroupY }, wBase: cfg.emblemSize * 2, hBase: cfg.emblemSize * 2, apex: 0, orientation: 'flat',
        style: { bgColor: 'rgba(0,0,0,0)', bgOpacity: 0 }
      });
      emblemNode.addTrait({
        name: 'flank-emblem-render',
        render(ctx) {
          const renderer = global.SigilEmblemRenderer;
          if (renderer?.renderEmblem) {
            ctx.save();
            renderer.renderEmblem(ctx, { key: sp.key, color: sp.prim, sec: sp.sec }, null, false, cfg.emblemSize, 'wireframe');
            ctx.restore();
          }
        }
      });
      frame.addChild(emblemNode);
    });

    // 5. Spacious Centered Flat-Top Hex Frame for Instructions (Unified Black Glass)
    const instructFrame = new HexNode({
      id: 'nook-detail-instructions', position: { x: 0, y: cfg.instructFrameY }, wBase: cfg.instructWBase, hBase: cfg.instructHBase, apex: cfg.instructApex, orientation: 'flat',
      style: {
        bgColor: '#000000', bgOpacity: 0.90, strokeColor: secColor, strokeOpacity: 0.80,
        innerHighlight: { enabled: true, color: sp.prim, sharpEdgeColor: sp.prim, spread: 8, intensity: 0.80, steps: 3 },
        outerHighlight: { enabled: true, color: secColor, sharpEdgeColor: secColor, blur: 8, intensity: 0.80, lineWidth: 1.5, steps: 3 }
      }
    });
    if (global.BorderTuningLab?.applyGroupStyle) global.BorderTuningLab.applyGroupStyle(instructFrame, 'group-sigil-detail');
    instructFrame.addTrait({
      name: 'detail-text-render',
      render(ctx) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `400 ${cfg.instructTextSize}px ${fontSciFae}`;
        ctx.fillStyle = '#ffffff';
        const text = sp.instructions || '';
        self.wrapText(ctx, text, 0, cfg.instructTextY, cfg.instructTextWidth, cfg.instructLineHeight);
        ctx.restore();
      }
    });
    frame.addChild(instructFrame);
  };

  /**
   * Helper to wrap canvas text nicely, vertically centered by line count.
   */
  Proto.wrapText = function(ctx, text, x, yOffset, maxWidth, lineHeight) {
    if (!text) return;
    const paragraphs = String(text).split('\n');
    const lines = [];
    for (let p = 0; p < paragraphs.length; p++) {
      const words = paragraphs[p].split(' ').filter(w => w.length > 0);
      let cur = '';
      for (let n = 0; n < words.length; n++) {
        const test = cur ? `${cur} ${words[n]}` : words[n];
        if (ctx.measureText(test).width > maxWidth && n > 0) {
          lines.push(cur);
          cur = words[n];
        } else {
          cur = test;
        }
      }
      if (cur) lines.push(cur);
    }
    if (lines.length === 0) return;

    const startY = yOffset - ((lines.length - 1) * lineHeight * 0.5);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, startY + (i * lineHeight));
    }
  };

  Proto.getSpells = function() {
    return SIGIL_SPELLS;
  };

})(typeof window !== 'undefined' ? window : this);
