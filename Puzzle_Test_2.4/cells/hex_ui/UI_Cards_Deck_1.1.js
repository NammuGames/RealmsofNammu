/**
 * @fileoverview cells/hex_ui/UI_Cards_Deck_1.1.js - Multi-Part Cell: Part 1.1 of UI_Cards_Deck
 * @description Materials queue cards, components bag cards, and action handlers.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const Proto = (global.UICardsDeckClass && global.UICardsDeckClass.prototype) ||
                (global.UICardsDeck && Object.getPrototypeOf(global.UICardsDeck));

  if (!Proto) {
    console.error('[UI_Cards_Deck_1.1] UICardsDeckClass prototype not found. Ensure UI_Cards_Deck_1.0.js is loaded first.');
    return;
  }

  Proto.buildMaterialCards = function() {
    const state = this.state;
    const traits = global.HexTraits;
    const HexNode = global.HexNode;
    const audio = global.AudioSynth;
    this.materialsButtonNodes = [];

    for (let i = 0; i < 6; i++) {
      const btnNode = new HexNode({
        id: `btn-mat-slot-${i}`,
        wBase: state.btnW1,
        hBase: state.btnHeight,
        apex: Math.max(0, (state.btnW2 - state.btnW1) * 0.5),
        orientation: 'flat',
        atlasKey: 'cyan',
        style: {
          bgColor: '#000000',
          bgOpacity: 0.80,
          innerHighlight: { enabled: true, color: '#10f000', sharpEdgeColor: '#10f000', spread: 8, intensity: 0.80, steps: 3 },
          outerHighlight: { enabled: false, color: '#c084fc', sharpEdgeColor: '#c084fc', blur: 12, intensity: 0.80, steps: 3 }
        }
      });

      // Deterministic pseudo-random seeds for individual polyhedra spins
      btnNode.slotSeeds = [
        { phase: (i * 0.31 + 0.12) % 1.0, tilt: (i * 0.19 + 0.44) % 1.0 },
        { phase: (i * 0.47 + 0.55) % 1.0, tilt: (i * 0.23 + 0.18) % 1.0 },
        { phase: (i * 0.63 + 0.88) % 1.0, tilt: (i * 0.71 + 0.62) % 1.0 },
        { phase: (i * 0.82 + 0.37) % 1.0, tilt: (i * 0.59 + 0.91) % 1.0 }
      ];

      btnNode.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#10f000',
        soundClick: false,
        onClick: () => {
          this.onMaterialSlotClicked(i);
        }
      }));

      // Render queue materials as centered 3D polyhedra components with no text
      btnNode.addTrait({
        name: 'mat-queue-preview',
        render(ctx, node) {
          const mat = node.matData;
          if (!mat || !mat.coords || !mat.colors) return;
          const polyRenderer = global.PolyhedronRenderer;
          const time = (global.EngineTicker && global.EngineTicker.elapsedTime !== undefined)
            ? global.EngineTicker.elapsedTime
            : (polyRenderer ? polyRenderer.animTime : (Date.now() * 0.001));

          // Pre-calculate centered piece layout once per material assignment (zero per-frame math)
          const colorKey = mat.colors.join(',');
          if (node._cachedMat !== mat || node._cachedColorsKey !== colorKey) {
            node._cachedMat = mat;
            node._cachedColorsKey = colorKey;
            const rComp = 11.0;
            const step = rComp * Math.sqrt(3);
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            const projected = mat.coords.map(([q, rCoord]) => {
              const x = step * (q - rCoord) * 0.5;
              const y = -step * (q + rCoord) * (Math.sqrt(3) / 2);
              minX = Math.min(minX, x); maxX = Math.max(maxX, x);
              minY = Math.min(minY, y); maxY = Math.max(maxY, y);
              return { x, y };
            });
            const midX = (minX + maxX) * 0.5;
            const midY = (minY + maxY) * 0.5;
            node._cachedBatch = mat.colors.map((cKey, idx) => {
              const seed = node.slotSeeds?.[idx] || { phase: idx * 0.25, tilt: idx * 0.15 };
              return {
                cx: projected[idx].x - midX,
                cy: projected[idx].y - midY,
                radius: rComp,
                colorName: cKey,
                seedPhase: seed.phase,
                seedTilt: seed.tilt,
                customAlpha: 1.0
              };
            });
          }

          // High-speed zero-allocation render pass with live reactive scaling
          const scale = global.UICardsDeck?.config?.matQueueScale || 1.0;
          ctx.save();
          if (scale !== 1.0) ctx.scale(scale, scale);
          if (polyRenderer?.drawBatch) {
            polyRenderer.drawBatch(ctx, node._cachedBatch, time);
          } else if (polyRenderer?.drawComponent) {
            const b = node._cachedBatch;
            for (let k = 0; k < b.length; k++) {
              const it = b[k];
              polyRenderer.drawComponent(ctx, it.cx, it.cy, it.radius, it.colorName, time, false, false, 1.0, it.seedPhase, it.seedTilt);
            }
          }
          ctx.restore();
        }
      });

      this.materialsButtonNodes.push(btnNode);
      this.colMaterials.addChild(btnNode);
    }
  };

  Proto.syncMaterialsQueueColumn = function() {
    if (!this.colMaterials || !this.materialsButtonNodes) return;
    const g = global.GameState;
    if (!g) return;
    const { isSpectating, povPlayer } = this._getSpectatorContext ? this._getSpectatorContext() : { isSpectating: false, povPlayer: null };
    const tray = isSpectating ? (povPlayer?.materialsTray || []) : (g.materialsTray || g.materialTray || []);
    const inForesight = !isSpectating && !!g.inForesightMode;
    const swappedIdx = g.foresightSwappedIndex;
    const hasSwapped = inForesight && swappedIdx !== null && swappedIdx !== undefined;

    for (let i = 0; i < 6; i++) {
      const btn = this.materialsButtonNodes[i];
      if (!btn) continue;
      const mat = tray[i];
      btn.matData = mat || null;

      if (inForesight && (i === swappedIdx || (hasSwapped && i === 0))) {
        btn.atlasKey = (global.UISidebarDeck?.rightButtonNodes?.[0]?.atlasKey === null) ? null : 'yellow';
        btn.style.bgColor = '#000000'; btn.style.bgOpacity = 0.80;
        btn.style.innerHighlight.color = '#ff9214'; btn.style.innerHighlight.sharpEdgeColor = '#ff9214';
        btn.style.innerHighlight.spread = 8; btn.style.innerHighlight.intensity = 0.80; btn.style.innerHighlight.steps = 3;
        btn.style.outerHighlight.color = '#ff9214'; btn.style.outerHighlight.sharpEdgeColor = '#ff9214';
        btn.style.outerHighlight.blur = 8; btn.style.outerHighlight.intensity = 0.80; btn.style.outerHighlight.steps = 3;
        btn.style.outerHighlight.enabled = true;
      } else {
        btn.atlasKey = (global.UISidebarDeck?.rightButtonNodes?.[0]?.atlasKey === null) ? null : 'cyan';
        btn.style.bgColor = '#000000';
        btn.style.bgOpacity = 0.80;
        btn.style.innerHighlight.color = '#10f000';
        btn.style.innerHighlight.sharpEdgeColor = '#10f000';
        btn.style.innerHighlight.spread = 8;
        btn.style.innerHighlight.intensity = 0.80;
        btn.style.innerHighlight.steps = 3;
        btn.style.outerHighlight.enabled = false;
      }
    }
    if (this.materialsList) this.materialsList.layoutChildren();
  };

  Proto.onMaterialSlotClicked = function(slotIndex) {
    const g = global.GameState;
    if (!g) return;
    const { isSpectating, povPlayer } = this._getSpectatorContext ? this._getSpectatorContext() : { isSpectating: false, povPlayer: null };
    if (isSpectating || this.spectatorSeekPeek) {
      const tray = povPlayer?.materialsTray || [];
      const mat = tray[slotIndex] || null;
      global.AudioSynth?.playCancel?.();
      g.showToast?.(mat ? `👀 Material #${slotIndex + 1}: ${mat.name} (View Only while spectating)` : `👀 Slot #${slotIndex + 1} is empty.`);
      return;
    }
    if (g.inForesightMode) {
      const willFinalize = (g.foresightSwappedIndex !== null && g.foresightSwappedIndex !== undefined && slotIndex === 0);
      if (!willFinalize) global.AudioSynth?.playClick?.();
      g.selectForesightMaterial(slotIndex);
      this.syncMaterialsQueueColumn();
      if (global.UIDeckSync) global.UIDeckSync.syncMaterialsTrayWithGameState();
      if (!g.inForesightMode) global.UISidebarDeck?.closeMaterialsColumn(true);
    } else {
      global.AudioSynth?.playClick?.();
      if (slotIndex === 0) {
        if (!g.placedThisTurn && g.materialsTray?.[0]) {
          g.selectedTrayIndex = 0; g.isMaterialSelected = true;
          global.UISidebarDeck?.closeMaterialsColumn();
          if (global.UIDeckSync) global.UIDeckSync.syncMaterialsTrayWithGameState();
        } else if (g.placedThisTurn && global.UISidebars) {
          global.UISidebars.showToast(g.materialsTray?.[0] ? 'Piece queued in Slot 1 for next turn.' : 'Slot 1 piece placed this turn.');
        }
      } else {
        const tray = g.materialsTray || g.materialTray || [], mat = tray[slotIndex] || null;
        if (mat && global.UISidebars) global.UISidebars.showToast(`Upcoming Piece #${slotIndex + 1}: ${mat.name}. Use Foresight to replace Slot 1!`);
        else if (!mat && global.UISidebars) global.UISidebars.showToast(`Slot #${slotIndex + 1} is empty (consumed by Foresight).`);
      }
    }
  };

  Proto.buildComponentCards = function() {
    const state = this.state;
    const traits = global.HexTraits;
    const HexNode = global.HexNode;
    const audio = global.AudioSynth;
    this.componentButtonNodes = [];

    // Dynamic Action Header button for Store (Ritual) and Form (Manifest)
    this.btnCompAction = new HexNode({
      id: 'btn-comp-action-header',
      wBase: state.btnW1,
      hBase: state.btnHeight,
      apex: Math.max(0, (state.btnW2 - state.btnW1) * 0.5),
      orientation: 'flat',
      atlasKey: (global.UISidebarDeck?.rightButtonNodes?.[0]?.atlasKey === null) ? null : 'cyan',
      style: {
        bgColor: '#000000',
        bgOpacity: 0.80,
        innerHighlight: { enabled: true, color: '#10f000', sharpEdgeColor: '#10f000', spread: 8, intensity: 0.80, steps: 3 },
        outerHighlight: { enabled: false, color: '#c084fc', sharpEdgeColor: '#c084fc', blur: 12, intensity: 0.80, steps: 3 }
      }
    });
    this.btnCompAction.isSidebarButton = true;
    if (global.BorderTuningLab?.applyGroupStyle) global.BorderTuningLab.applyGroupStyle(this.btnCompAction, 'group-buttons');

    this.btnCompAction.addTrait(new traits.ButtonTrait({
      hoverGlowColor: '#ff9214',
      soundClick: false,
      allowGhostClick: true,
      onClick: () => {
        this.onCompActionClicked();
      }
    }));

    this.btnCompAction.addTrait(new traits.TextTrait({
      title: 'Confirm',
      hotkey: 'ENT',
      align: 'center',
      isSidebarButton: true,
      isRightSidebar: true,
      titleColor: '#64748b'
    }));

    if (this.colComponents) this.colComponents.addChild(this.btnCompAction);

    const COMP_HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
    for (let i = 0; i < 12; i++) {
      const btnNode = new HexNode({
        id: `btn-comp-slot-${i}`,
        wBase: state.btnW1,
        hBase: state.btnHeight,
        apex: Math.max(0, (state.btnW2 - state.btnW1) * 0.5),
        orientation: 'flat',
        atlasKey: 'cyan',
        style: {
          bgColor: '#000000',
          bgOpacity: 0.80,
          innerHighlight: { enabled: true, color: '#10f000', sharpEdgeColor: '#10f000', spread: 8, intensity: 0.80, steps: 3 },
          outerHighlight: { enabled: false, color: '#c084fc', sharpEdgeColor: '#c084fc', blur: 12, intensity: 0.80, steps: 3 }
        }
      });

      btnNode.slotSeed = {
        phase: (i * 0.37 + 0.15) % 1.0,
        tilt: (i * 0.23 + 0.42) % 1.0
      };

      btnNode.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#10f000',
        soundClick: false,
        allowGhostClick: true,
        onClick: () => {
          this.onComponentSlotClicked(i);
        }
      }));

      // 12 empty slots with no text; renders 3D rotating component if slot filled
      btnNode.addTrait({
        name: 'comp-slot-preview',
        render(ctx, node) {
          const g = global.GameState;
          const bag = g?.componentsBag || [];
          const comp = (i < bag.length) ? bag[i] : null;
          const compColor = (typeof comp === 'object' && comp) ? comp.color : comp;
          const polyRenderer = global.PolyhedronRenderer;
          const time = (global.EngineTicker?.elapsedTime !== undefined)
            ? global.EngineTicker.elapsedTime
            : (Date.now() * 0.001);

          const scale = global.UICardsDeck?.config?.compBagScale || 1.0;
          ctx.save();
          if (scale !== 1.0) ctx.scale(scale, scale);
          if (compColor && polyRenderer?.drawComponent) {
            const seed = node.slotSeed || { phase: 0.1, tilt: 0.2 };
            polyRenderer.drawComponent(ctx, 0, 0, 15.0, compColor, time, false, false, node.ghost ? 0.35 : 1.0, seed.phase, seed.tilt);
          } else {
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
              const rad = (k * 60 - 90) * Math.PI / 180;
              const px = 14 * Math.cos(rad);
              const py = 14 * Math.sin(rad);
              if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.25)';
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
          ctx.restore();
        }
      });

      btnNode.addTrait(new traits.TextTrait({
        hotkey: COMP_HOTKEYS[i],
        isSidebarButton: true,
        isRightSidebar: true
      }));

      this.componentButtonNodes.push(btnNode);
      if (this.colComponents) this.colComponents.addChild(btnNode);
    }
  };

  Proto.syncComponentsColumn = function() {
    if (!this.colComponents || !this.componentButtonNodes) return;
    const g = global.GameState;
    const inRitual = !!(g?.inRitualMode || global.SpellRitual?.inRitualMode);
    const inManifest = !!(g?.inManifestMode || global.SpellManifest?.inManifestMode);
    const isFormInRing2 = !!(inManifest && global.SpellManifest?.isCursorInRing2?.());

    if (this.btnCompAction) {
      if (inRitual || inManifest) {
        this.btnCompAction.visible = true;
        const textTrait = this.btnCompAction.getTrait('text');

        let count = 0;
        if (inRitual) {
          count = global.SpellRitual?.stagedExtractions?.size || 0;
        } else if (inManifest) {
          count = global.SpellManifest?.stagedPlacements?.size || 0;
        }

        const canConfirm = count >= 1;
        if (textTrait) {
          textTrait.title = 'Confirm';
          textTrait.hotkey = 'ENT';
          textTrait.titleColor = canConfirm ? '#ff9214' : '#64748b';
        }
        this.btnCompAction.setGhost(!canConfirm);
        this.btnCompAction.setHighlight(canConfirm);
      } else {
        this.btnCompAction.visible = false;
      }
    }

    for (let i = 0; i < 12; i++) {
      const btn = this.componentButtonNodes[i];
      if (!btn) continue;
      const isNewlyCopied = !!(global.SpellRitual?.inRitualMode && global.SpellRitual?.stagedExtractions?.has(i));
      const bag = g?.componentsBag || [];
      const comp = (i < bag.length) ? bag[i] : null;
      const isWeave = typeof comp === 'object' && comp && (comp.woven || comp.enchantment === 'weave');
      btn.setGhost(isFormInRing2 && !isWeave);

      if (isNewlyCopied) {
        btn.atlasKey = 'cyan';
        btn.setHighlight(true, 'cyan');
        btn.style.bgColor = '#000000';
        btn.style.bgOpacity = 0.80;
        btn.style.innerHighlight.color = '#38bdf8';
        btn.style.innerHighlight.sharpEdgeColor = '#38bdf8';
        btn.style.innerHighlight.spread = 8;
        btn.style.innerHighlight.intensity = 0.85;
        btn.style.innerHighlight.steps = 3;
        btn.style.outerHighlight.enabled = true;
        btn.style.outerHighlight.color = '#38bdf8';
        btn.style.outerHighlight.sharpEdgeColor = '#38bdf8';
        btn.style.outerHighlight.blur = 8;
        btn.style.outerHighlight.intensity = 0.85;
        btn.style.outerHighlight.steps = 3;
        const bt = btn.getTrait('button');
        if (bt) bt.hoverGlowColor = '#38bdf8';
      } else {
        btn.setHighlight(false);
        btn.style.bgColor = '#000000';
        btn.style.bgOpacity = 0.80;

        const bag = g?.componentsBag || [];
        const comp = (i < bag.length) ? bag[i] : null;
        let enchColor = null;
        if (typeof comp === 'object' && comp) {
          if (comp.burned || comp.enchantment === 'burn') enchColor = 'red';
          else if (comp.phased || comp.enchantment === 'phase') enchColor = 'blue';
          else if (comp.woven || comp.enchantment === 'weave') enchColor = 'yellow';
          else if (comp.fortified || comp.enchantment === 'fortify') enchColor = 'purple';
        }

        if (enchColor) {
          btn.atlasKey = null;
          const enchHex = enchColor === 'red' ? '#ef4444'
                        : enchColor === 'blue' ? '#38bdf8'
                        : enchColor === 'yellow' ? '#fde047'
                        : '#c084fc';
          btn.style.innerHighlight.enabled = true;
          btn.style.innerHighlight.color = enchHex;
          btn.style.innerHighlight.sharpEdgeColor = enchHex;
          btn.style.innerHighlight.spread = 8;
          btn.style.innerHighlight.intensity = 0.90;
          btn.style.innerHighlight.steps = 3;
          btn.style.outerHighlight.enabled = false;
          const bt = btn.getTrait('button');
          if (bt) bt.hoverGlowColor = enchHex;
        } else {
          btn.atlasKey = (global.UISidebarDeck?.rightButtonNodes?.[0]?.atlasKey === null) ? null : 'cyan';
          btn.style.innerHighlight.enabled = true;
          btn.style.innerHighlight.color = '#10f000';
          btn.style.innerHighlight.sharpEdgeColor = '#10f000';
          btn.style.innerHighlight.spread = 8;
          btn.style.innerHighlight.intensity = 0.80;
          btn.style.innerHighlight.steps = 3;
          btn.style.outerHighlight.enabled = false;
          const bt = btn.getTrait('button');
          if (bt) bt.hoverGlowColor = '#10f000';
        }
      }
    }
    if (this.componentsList) this.componentsList.layoutChildren();
  };

  Proto.onCompActionClicked = function() {
    const g = global.GameState;
    if (!g) return;
    const inRitual = !!(g.inRitualMode || global.SpellRitual?.inRitualMode);
    const inManifest = !!(g.inManifestMode || global.SpellManifest?.inManifestMode);

    if (inRitual && global.SpellRitual) {
      global.SpellRitual.finalizeRitual();
    } else if (inManifest && global.SpellManifest) {
      global.SpellManifest.finalizeManifest();
    }

    this.syncComponentsColumn();
    if (global.UIDeckSync) global.UIDeckSync.syncMaterialsTrayWithGameState();
    if (global.BoardRenderer) global.BoardRenderer.render();
  };

  Proto.onComponentSlotClicked = function(slotIndex) {
    const g = global.GameState;
    if (!g) return;
    if (g.inRitualMode) {
      global.SpellRitual?.handleSlotClick?.(slotIndex);
    } else if (g.inManifestMode) {
      global.SpellManifest?.handleSlotClick?.(slotIndex);
    } else {
      global.AudioSynth?.playClick?.();
    }
    this.syncComponentsColumn();
    if (global.BoardRenderer) global.BoardRenderer.render();
  };

})(typeof window !== 'undefined' ? window : this);
