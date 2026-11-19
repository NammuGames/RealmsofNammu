/**
 * @fileoverview cells/hex_ui/Sigil_Emblem_Studio_1.1.js - Variant Inspector, Clipboard & Toasts
 * @description Implements Stage 2 variant ring inspection, Hub return button, clipboard export,
 * toast banner, and color cache refresh on SigilEmblemStudioClass.prototype.
 */

(function(global) {
  'use strict';

  const SigilEmblemStudioClass = global.SigilEmblemStudioClass;
  if (!SigilEmblemStudioClass) return;

  const { ELEMENTS, VARIANT_TITLES } = SigilEmblemStudioClass._data;
  const proto = SigilEmblemStudioClass.prototype;

  // ========================================================================
  // STAGE 2: ELEMENT VARIANT INSPECTOR & CENTRAL POINTY-TOP COMMIT BUTTON
  // ========================================================================
  proto.buildVariantsStage = function() {
    if (!this.containerNode || !this.selectedElement) return;
    this.containerNode.children = [];
    const HexNode = global.HexNode;
    const traits = global.HexTraits;
    if (!HexNode || !traits) return;

    const elem = this.selectedElement, self = this;
    const w = this.containerNode.dimensions.wBase || 900;
    const h = this.containerNode.dimensions.hBase || 790;
    const radius = Math.min(w * 0.35, h * 0.35);
    // Regular Pointy-Top Hexagon dimensions for circumradius btnR = 58px
    const btnR = 58;
    const varW = Math.round(btnR * Math.sqrt(3)); // 100px width
    const varH = btnR;                             // 58px base height
    const varApex = Math.round(btnR * 0.5);        // 29px apex (total height 116px)

    // Header Banner
    const headerNode = new HexNode({
      id: 'var-header-node',
      position: { x: 0, y: -radius - 45 },
      wBase: Math.min(460, w * 0.85),
      hBase: 36,
      apex: 14,
      orientation: 'flat',
      style: {
        bgColor: 'rgba(15, 23, 42, 0.90)',
        bgOpacity: 0.90,
        innerHighlight: { enabled: true, color: elem.color, sharpEdgeColor: '#ffffff', spread: 10, intensity: 0.7 }
      }
    });
    headerNode.addTrait(new traits.TextTrait({
      badge: 'STAGE 2 • VECTOR GLYPH INSPECTOR',
      title: `${elem.name.toUpperCase()} EMBLEM MOTIFS`,
      subtitle: 'Click a Numbered Emblem to Select • Press Center Button or SPACE to Save ID',
      align: 'center',
      titleSize: 12,
      subtitleSize: 9.5,
      titleColor: elem.color
    }));
    this.containerNode.addChild(headerNode);

    // 1. Center Pointy-Top Button (Saves Selection to Clipboard)
    const centerBtn = new HexNode({
      id: 'btn-center-save-id',
      position: { x: 0, y: 0 },
      wBase: 96,
      hBase: 70,
      apex: 22,
      orientation: 'pointy',
      style: {
        bgColor: 'rgba(15, 23, 42, 0.85)',
        bgOpacity: 0.85,
        innerHighlight: { enabled: true, color: elem.color, sharpEdgeColor: '#ffffff', spread: 12, intensity: 0.75 },
        outerHighlight: { enabled: true, color: elem.color, sharpEdgeColor: elem.accent, blur: 18, intensity: 0.55 }
      }
    });

    centerBtn.addTrait(new traits.ButtonTrait({
      hoverGlowColor: elem.color,
      onClick: () => this.saveSelectedVariant()
    }));

    centerBtn.addTrait(new traits.TextTrait({
      badge: 'SPACE',
      title: 'SAVE ID',
      subtitle: 'Copy Clipboard',
      align: 'center',
      titleSize: 11,
      subtitleSize: 8.5,
      titleColor: '#ffffff'
    }));

    this.containerNode.addChild(centerBtn);

    // 2. Six Large Regular Pointy-Top Hex Buttons in a Clockwise Hexagonal Ring
    const isWire = (this.renderMode === 'wireframe');
    for (let i = 0; i < 6; i++) {
      // Clockwise from 12:00 (Top): 12:00, 2:00, 4:00, 6:00, 8:00, 10:00
      const angleRad = (i * 60 - 90) * Math.PI / 180.0;
      const vx = radius * Math.cos(angleRad);
      const vy = radius * Math.sin(angleRad);
      const varId = `${elem.key.toUpperCase()}_EMBLEM_0${i + 1}`;
      const isSelected = (this.selectedVariantIndex === i);

      const varBtn = new HexNode({
        id: `btn-variant-${i}`,
        position: { x: vx, y: vy },
        wBase: varW,
        hBase: varH,
        apex: varApex,
        orientation: 'pointy', // Regular pointy-top hex
        style: {
          bgColor: isWire ? 'rgba(15, 23, 42, 0.40)' : elem.color,
          bgOpacity: isWire ? 0.40 : 1.0,
          innerHighlight: {
            enabled: !isWire,
            color: elem.secondary,
            sharpEdgeColor: elem.secondary,
            fade: 0,
            spread: 0,
            intensity: 1.0,
            lineWidth: 1.8
          },
          outerHighlight: {
            enabled: isSelected,
            color: elem.secondary,
            sharpEdgeColor: elem.secondary,
            blur: 32,
            intensity: 1.0,
            lineWidth: 2.2
          }
        }
      });

      varBtn.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#ffffff',
        onClick: () => {
          this.selectedVariantIndex = i;
          this.selectedVariantId = varId;
          if (this.chosenVariants && elem) {
            this.chosenVariants[elem.key] = i;
          }
          if (global.SigilEmblemRenderer?.DEFAULT_INDICES && elem) {
            global.SigilEmblemRenderer.DEFAULT_INDICES[elem.key] = i;
            if (typeof global.SigilEmblemRenderer.clearCache === 'function') {
              global.SigilEmblemRenderer.clearCache();
            }
          }
          this.buildVariantsStage();
          const audio = global.AudioSynth;
          if (audio && typeof audio.playClick === 'function') audio.playClick();
        }
      }));

      // Render Vector Emblem inside the regular hex + External Numeral Badge outside
      varBtn.addTrait({
        name: 'emblem',
        render(ctx, node) {
          const renderer = global.SigilEmblemRenderer;
          if (renderer && typeof renderer.renderEmblem === 'function') {
            renderer.renderEmblem(ctx, elem, i, isSelected, btnR, self.renderMode);
          }

          // Draw External Numeral Tag (Floating directly above the top apex)
          ctx.save();
          const tagY = -(btnR + 18);
          const numStr = (i + 1).toString();

          // Badge Background Pill
          ctx.beginPath();
          ctx.arc(0, tagY, 11, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.90)';
          ctx.fill();
          ctx.strokeStyle = isSelected ? '#ffffff' : elem.secondary;
          ctx.globalAlpha = 0.30; ctx.lineWidth = isSelected ? 4.5 : 2.8; ctx.stroke();
          ctx.globalAlpha = 1.0; ctx.lineWidth = isSelected ? 2.0 : 1.2; ctx.stroke();

          // Numeral Text
          ctx.font = '700 11px "Orbitron", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(numStr, 0, tagY + 0.5);

          ctx.restore();
        }
      });

      this.containerNode.addChild(varBtn);
    }
  };

  // ========================================================================
  // CLIPBOARD COMMIT & HUB RETURN CONTROLS
  // ========================================================================

  proto.buildHubReturnButton = function() {
    const traits = global.HexTraits; if (!traits) return;
    const btn = new global.HexNode({
      id: 'btn-hub-return', position: { x: 375, y: 0 },
      wBase: 96, hBase: 70, apex: 22, orientation: 'pointy',
      style: {
        bgColor: 'rgba(15, 23, 42, 0.90)', bgOpacity: 0.92,
        innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#bae6fd', spread: 0, intensity: 0.9, lineWidth: 1.6 },
        outerHighlight: { enabled: true, color: '#0284c7', blur: 20, intensity: 0.8 }
      }
    });
    btn.addTrait(new traits.ButtonTrait({ hoverGlowColor: '#38bdf8', onClick: () => { this.close(); if (global.CanvasHub) global.CanvasHub.open(); } }));
    btn.addTrait(new traits.TextTrait({ badge: 'ESC', title: '◄ HUB', subtitle: 'Canvas Menu', align: 'center', titleSize: 10, subtitleSize: 8, titleColor: '#38bdf8' }));
    this.containerNode.addChild(btn);
  };

  proto.copyAllDefaults = function() {
    const lines = ['=== 12 ELEMENTAL EMBLEM DEFAULTS ==='];
    ELEMENTS.forEach(elem => {
      const idx = (this.chosenVariants && this.chosenVariants[elem.key] !== undefined) ? this.chosenVariants[elem.key] : 0;
      const title = (VARIANT_TITLES[elem.key] && VARIANT_TITLES[elem.key][idx]) ? VARIANT_TITLES[elem.key][idx] : `Variant #${idx + 1}`;
      lines.push(`• ${elem.name.padEnd(6, ' ')}: #${idx + 1} "${title}" (${elem.key.toUpperCase()}_EMBLEM_0${idx + 1})`);
    });
    lines.push('\nJSON Configuration:\n' + JSON.stringify(this.chosenVariants, null, 2));
    const fullText = lines.join('\n');
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(fullText).then(() => this.showToast('✔ Copied All 12 Chosen Defaults to Clipboard!')).catch(() => this.fallbackCopy(fullText));
    } else { this.fallbackCopy(fullText); }
    const audio = global.AudioSynth;
    if (audio?.playClick) audio.playClick();
  };

  proto.saveSelectedVariant = function() {
    if (!this.selectedVariantId) return;
    const idToCopy = this.selectedVariantId;
    if (this.selectedElement && this.chosenVariants) {
      this.chosenVariants[this.selectedElement.key] = this.selectedVariantIndex;
      if (global.SigilEmblemRenderer?.DEFAULT_INDICES) {
        global.SigilEmblemRenderer.DEFAULT_INDICES[this.selectedElement.key] = this.selectedVariantIndex;
        if (typeof global.SigilEmblemRenderer.clearCache === 'function') {
          global.SigilEmblemRenderer.clearCache();
        }
      }
    }
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(idToCopy).then(() => this.showToast(`✔ Saved ${idToCopy} to Clipboard!`)).catch(() => this.fallbackCopy(idToCopy));
    } else { this.fallbackCopy(idToCopy); }
    const audio = global.AudioSynth;
    if (audio?.playClick) audio.playClick();
  };

  proto.fallbackCopy = function(text) {
    try {
      const ta = Object.assign(document.createElement('textarea'), { value: text, style: 'position:fixed;opacity:0;' });
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      this.showToast(`✔ Saved ${text} to Clipboard!`);
    } catch (err) { this.showToast(`Selected: ${text}`); }
  };

  proto.showToast = function(msg) {
    this.toastMessage = msg;
    let toastEl = document.getElementById('studio-toast');
    if (!toastEl) {
      toastEl = Object.assign(document.createElement('div'), { id: 'studio-toast' });
      toastEl.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.92);border:1px solid #38bdf8;color:#38bdf8;font-family:"Fira Code",monospace;font-size:13px;font-weight:700;padding:10px 22px;border-radius:9999px;box-shadow:0 4px 20px rgba(56,189,248,0.35);z-index:1000;pointer-events:none;transition:opacity 0.25s ease;';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg; toastEl.style.opacity = '1';
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { if (toastEl) toastEl.style.opacity = '0'; }, 2400);
  };

  proto.refreshColors = function() {
    if (global.SigilEmblemRenderer?.clearCache) global.SigilEmblemRenderer.clearCache();
    (this.stage === 'dial') ? this.buildDialStage() : (this.stage === 'variants' && this.buildVariantsStage());
  };

  if (global.ROLL_CALL?.set) global.ROLL_CALL.set('Sigil_Emblem_Studio_1.1', global.SigilEmblemStudio);
})(typeof window !== 'undefined' ? window : this);
