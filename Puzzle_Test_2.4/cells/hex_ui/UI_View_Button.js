/**
 * @fileoverview cells/hex_ui/UI_View_Button.js - Sidebar Slot 1 Reactive View Button Engine
 * @description Preview trait for the 2nd button in the right sidebar (btn-ctrl-1):
 *  1. Base Mode: Clean "Sigil Nook" button.
 *  2. Emblem Mode: 3D vector Emblem with secondary outer border and title-case name bar.
 */

(function(global) {
  'use strict';

  class UIViewButtonClass {
    constructor() {
      this.isDynamicActive = false;
      this.forceSigilPreview = false;
      this.sigilConfig = {
        emblemY: -5,
        emblemSize: 42,
        barY: 37,
        barWBase: 92,
        barHBase: 24,
        barApex: 8,
        textY: 1,
        textSize: 16
      };
      this.activeSigilSpell = null;
    }

    setSigilConfig(updates = {}) {
      Object.assign(this.sigilConfig, updates);
    }

    /**
     * Returns the currently previewed sigil spell object if in sigil mode.
     */
    getActiveSigilSpell() {
      return (this.getDynamicState() === 'sigil') ? this.activeSigilSpell : null;
    }

    /**
     * Determines if an emblem preview is currently active on the board.
     * @returns {'sigil'|false}
     */
    getDynamicState() {
      if (this.forceSigilPreview) return 'sigil';
      const g = global.GameState;
      if (!g) return false;

      // Sigil Cursor over an actual candidate sigil
      const isSigilCursor = (g.inSigilStage || g.inTeleportMode || g.inChargeMode) && g.sigilCursorVertex;
      if (isSigilCursor) {
        let cand = null;
        if (g.selectedSigilId) {
          cand = (g.allCandidates || []).find(c => c.id === g.selectedSigilId);
        }
        if (!cand && g.sigilCursorVertex && global.HexMath) {
          const vTiles = global.HexMath.getVertexTiles(g.sigilCursorVertex).sort().join('|');
          cand = (g.allCandidates || []).find(c => {
            if (c.id === 'sigil_' + vTiles) return true;
            if (Array.isArray(c.tiles) && c.tiles.slice().sort().join('|') === vTiles) return true;
            return false;
          });
        }
        if (cand) return 'sigil';
      }

      return false;
    }

    /**
     * Factory that creates the reactive render trait attached to rightButtonNodes[1].
     */
    createTrait() {
      const self = this;
      return {
        name: 'view-button-preview',
        render(ctx, node) {
          self.renderViewButton(ctx, node);
        }
      };
    }

    /**
     * Master dispatcher: switches between Base "Sigil Nook" mode and Emblem mode.
     */
    renderViewButton(ctx, node) {
      const g = global.GameState;
      if (!ctx || !g) return;

      const emblemRenderer = global.SigilEmblemRenderer;
      const math = global.HexMath;

      const dynamicMode = this.getDynamicState();
      this.isDynamicActive = !!dynamicMode;

      // ----------------------------------------------------------------------
      // EMBLEM MODE: Candidate sigil active
      // ----------------------------------------------------------------------
      if (dynamicMode === 'sigil') {
        let cand = null;
        if (g?.selectedSigilId) {
          cand = (g.allCandidates || []).find(c => c.id === g.selectedSigilId);
        }
        if (!cand && g?.sigilCursorVertex && math) {
          const vTiles = math.getVertexTiles(g.sigilCursorVertex).sort().join('|');
          cand = (g.allCandidates || []).find(c => {
            if (c.id === 'sigil_' + vTiles) return true;
            if (Array.isArray(c.tiles) && c.tiles.slice().sort().join('|') === vTiles) return true;
            return false;
          });
        }
        if (!cand && this.forceSigilPreview) {
          cand = { element: 'fire', spell: 'Burn', isWild: false };
        }

        if (cand && emblemRenderer?.renderEmblem) {
          const cfg = this.sigilConfig;
          const elemKey = (cand.element || '').toLowerCase();
          const spellNameLower = (cand.spell || '').toLowerCase();
          const nookSpells = global.SigilNookCanvas?.getSpells?.() || [];
          const spellObj = nookSpells.find(s =>
            (s.spell && s.spell.toLowerCase() === spellNameLower) ||
            (s.key && s.key.toLowerCase() === elemKey) ||
            (s.elem && s.elem.toLowerCase() === elemKey)
          );

          const elemInfo = global.BoardOverlayRenderer?._getElemInfo?.(cand.element) || { key: elemKey || 'fire', color: '#ff3333', sec: '#ffffff' };
          const primColor = spellObj?.prim || elemInfo.color || '#38bdf8';
          const secColor = spellObj?.sec || elemInfo.sec || elemInfo.secondary || '#ffffff';
          this.activeSigilSpell = spellObj || null;

          ctx.save();
          ctx.translate(0, cfg.emblemY);
          emblemRenderer.renderEmblem(ctx, { key: spellObj?.key || elemInfo.key, color: primColor, sec: secColor }, null, false, cfg.emblemSize, 'wireframe');
          ctx.restore();

          const rawName = cand.spell || cand.element || 'Sigil';
          const spellName = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
          if (node) {
            const bt = node.getTrait('button');
            if (bt) bt.hoverGlowColor = primColor;

            const currentKey = `${spellObj?.key || elemKey}_${primColor}_${secColor}`;
            if (node._appliedSigilKey !== currentKey) {
              node._appliedSigilKey = currentKey;
              if (!node.style.innerHighlight) node.style.innerHighlight = { enabled: true };
              if (!node.style.outerHighlight) node.style.outerHighlight = { enabled: true };
              node.style.innerHighlight.color = primColor;
              node.style.innerHighlight.sharpEdgeColor = primColor;
              node.style.outerHighlight.enabled = true;
              node.style.outerHighlight.color = secColor;
              node.style.outerHighlight.sharpEdgeColor = secColor;
              node.style.outerHighlight.blur = 8;
              node.style.outerHighlight.intensity = 0.80;
              node.style.outerHighlight.lineWidth = 1.5;
              node.style.outerHighlight.steps = 3;
              node.invalidateCache();
              node._customSigilStyleApplied = true;
            }
          }
          this.drawBottomHexBar(ctx, spellName, primColor, secColor, cfg);
          return;
        }
      }

      // ----------------------------------------------------------------------
      // BASE MODE: Clean Sigil Nook button
      // ----------------------------------------------------------------------
      this.activeSigilSpell = null;
      if (node && node._customSigilStyleApplied) {
        const refNode = global.UISidebarDeck?.rightButtonNodes?.[0];
        if (refNode?.style) {
          node.style = JSON.parse(JSON.stringify(refNode.style));
        }
        if (node.style?.outerHighlight) node.style.outerHighlight.enabled = false;
        node.atlasKey = refNode?.atlasKey ?? null;
        const bt = node.getTrait('button');
        if (bt) bt.hoverGlowColor = node.style?.innerHighlight?.color || '#38bdf8';
        node.invalidateCache();
        node._customSigilStyleApplied = false;
        node._appliedSigilKey = null;
      }

      if (node) {
        const bt = node.getTrait('button');
        if (bt) bt.hoverGlowColor = node.style?.innerHighlight?.color || '#38bdf8';
      }
    }

    /**
     * Renders a flat-top hex frame bar along the bottom containing the item label.
     */
    drawBottomHexBar(ctx, label, primColor = '#38bdf8', secColor = '#ffffff', cfg = this.sigilConfig) {
      const geom = global.HexFrameGeometry;
      const bezel = global.HexBezelRenderer;
      const wBase = cfg?.barWBase ?? 92;
      const hBase = cfg?.barHBase ?? 24;
      const apex = cfg?.barApex ?? 8;
      const barY = cfg?.barY ?? 37;
      const textY = cfg?.textY ?? 1;
      const textSize = cfg?.textSize ?? 16;
      const verts = geom
        ? geom.getVertices(wBase, hBase, apex, 'flat')
        : [
            { x: -wBase * 0.5, y: -hBase * 0.5 }, { x: wBase * 0.5, y: -hBase * 0.5 },
            { x: wBase * 0.5 + apex, y: 0 },
            { x: wBase * 0.5, y: hBase * 0.5 }, { x: -wBase * 0.5, y: hBase * 0.5 },
            { x: -(wBase * 0.5 + apex), y: 0 }
          ];

      ctx.save();
      ctx.translate(0, barY);

      if (bezel) {
        bezel.renderFrameBezel(ctx, verts, {
          bgColor: '#000000',
          bgOpacity: 0.95,
          strokeColor: secColor || '#ffffff',
          strokeOpacity: 0.80,
          innerHighlight: { enabled: true, color: primColor, sharpEdgeColor: primColor, spread: 4, intensity: 0.80, lineWidth: 1.0 },
          outerHighlight: { enabled: true, color: secColor, sharpEdgeColor: secColor, blur: 6, intensity: 0.60, lineWidth: 1.5 }
        });
      } else {
        ctx.beginPath();
        ctx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
        ctx.fill();
        ctx.strokeStyle = secColor || '#ffffff';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${textSize}px "Sci-Fae", "SciFaePseudoScript10", "SciFae Pseudo Script 1.0", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, textY);
      ctx.restore();
    }
  }

  const instance = new UIViewButtonClass();
  global.UIViewButton = instance;
  if (global.ROLL_CALL) global.ROLL_CALL.set('UI_View_Button', instance);

})(typeof window !== 'undefined' ? window : this);
