/**
 * @fileoverview cells/hex_ui/UI_Cards_Deck_1.0.js - Multi-Part Cell: Part 1.0 of UI_Cards_Deck
 * @description Constructor, spell cards building, spell casting logic, and spellbook sync.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  // Canonical elemental palette lookup
  const ELEMENT_INFO_MAP = {
    feral: { key: 'feral', color: '#a66a26', sec: '#0abd0d' },
    cyber: { key: 'cyber', color: '#b8d1f4', sec: '#ff9214' },
    dark: { key: 'dark', color: '#000000', sec: '#06b6d4' },
    light: { key: 'light', color: '#ffffff', sec: '#eb66ff' },
    wood: { key: 'wood', color: '#0abd0d', sec: '#953ffd' },
    storm: { key: 'storm', color: '#ff9214', sec: '#fff700' },
    ice: { key: 'ice', color: '#06b6d4', sec: '#3d6eff' },
    heat: { key: 'heat', color: '#eb66ff', sec: '#ff3333' },
    stone: { key: 'stone', color: '#953ffd', sec: '#a66a26' },
    air: { key: 'air', color: '#fff700', sec: '#b8d1f4' },
    water: { key: 'water', color: '#3d6eff', sec: '#000000' },
    fire: { key: 'fire', color: '#ff3333', sec: '#ffffff' }
  };

  const COMP_HIGHLIGHT_MAP = {
    ether: { key: 'white', inner: '#ffffff', outer: '#e2e8f0' },
    white: { key: 'white', inner: '#ffffff', outer: '#e2e8f0' },
    red: { key: 'red', inner: '#f87171', outer: '#ec0e0e' },
    blue: { key: 'blue', inner: '#38bdf8', outer: '#0040ff' },
    yellow: { key: 'yellow', inner: '#fde047', outer: '#ffdd57' },
    purple: { key: 'purple', inner: '#c084fc', outer: '#a855f7' },
    orange: { key: 'orange', inner: '#fb923c', outer: '#ff7614' },
    green: { key: 'green', inner: '#4ade80', outer: '#008a02' },
    disease: { key: 'cyan', inner: '#94a3b8', outer: '#64748b' }
  };

  class UICardsDeckClass {
    constructor() {
      this.state = null;
      this.spellButtonNodes = [];
      this.materialsButtonNodes = [];
      this.colSpellbook = null;
      this.colMaterials = null;
      this.spellList = null;
      this.materialsList = null;
      this.colComponents = null;
      this.componentsList = null;
      this.componentButtonNodes = [];
      this.btnCompAction = null;

      // Live Reactive Display Tuning
      this.config = {
        matQueueScale: 1.7,    // Materials queue display scale (1.7 = 170%)
        compBagScale: 3.0,     // Component bag display scale (3.0 = 300%)
        fontGridScale: 1.5     // Font Overview grid scale (1.5 = 150%)
      };
    }

    init(state, colSpellbook, colMaterials, spellList, materialsList, colComponents, componentsList) {
      this.state = state;
      this.colSpellbook = colSpellbook;
      this.colMaterials = colMaterials;
      this.spellList = spellList;
      this.materialsList = materialsList;
      this.colComponents = colComponents;
      this.componentsList = componentsList;
      this.buildSpellCards();
      if (typeof this.buildMaterialCards === 'function') this.buildMaterialCards();
      if (typeof this.buildComponentCards === 'function') this.buildComponentCards();
      if (typeof this.syncComponentsColumn === 'function') this.syncComponentsColumn();
    }

    buildSpellCards() {
      const state = this.state;
      const traits = global.HexTraits;
      const HexNode = global.HexNode;
      this.spellButtonNodes = [];

      for (let i = 0; i < 12; i++) {
        const btnNode = new HexNode({
          id: `btn-spell-slot-${i}`,
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

        btnNode.slotSeeds = [{ phase: Math.random(), tilt: Math.random() }, { phase: Math.random(), tilt: Math.random() }, { phase: Math.random(), tilt: Math.random() }];

        btnNode.addTrait(new traits.ButtonTrait({
          hoverGlowColor: '#10f000',
          soundClick: false,
          allowGhostClick: true,
          onClick: () => this.castSpellSlot(i)
        }));

        btnNode.addTrait({
          name: 'spell-card',
          render(ctx, node) {
            const sState = global.COSMOS_STATE || state;
            const spell = node.spellData;
            if (!spell) return;
            const elemInfo = node.elemInfo || { key: 'fire', color: '#ff3333', sec: '#ffffff' };
            const emblemR = sState?.spellEmblemSize ?? 44;
            const rSlot = sState?.spellSlotSize ?? 18;
            const spacing = sState?.spellSpacing ?? 77;
            const groupX = sState?.spellGroupX ?? 12;

            // 1. LEFT ZONE: 3D Projecting Wireframe Pyramid
            const xEmblem = groupX - (spacing * 0.5);
            const renderer = global.SigilEmblemRenderer;
            if (renderer?.renderEmblem) {
              ctx.save();
              ctx.translate(xEmblem, 0);
              renderer.renderEmblem(ctx, elemInfo, null, false, emblemR, 'wireframe');
              ctx.restore();
            }

            // 2. RIGHT ZONE: 3 Charge Chevron Hex Sockets (>)
            const dx = (Math.sqrt(3) * 0.5) * rSlot;
            const dy = 1.5 * rSlot;
            const xRight = (groupX + (spacing * 0.5)) - (dx * 0.5);
            const slots = [{ x: xRight, y: -dy }, { x: xRight + dx, y: 0 }, { x: xRight, y: dy }];

            const charges = (typeof spell.charges === 'number') ? spell.charges : 3;
            const isFilled = [charges >= 3, charges >= 2, charges >= 1];
            const polyRenderer = global.PolyhedronRenderer;
            const time = global.COSMOS_STATE?.time || 0;
            const seeds = node.slotSeeds || [{ phase: 0.1, tilt: 0.2 }, { phase: 0.3, tilt: 0.4 }, { phase: 0.5, tilt: 0.6 }];

            // 2.1. Shared 1-step outer highlight border in secondary color (layered under all 3 slots)
            const secColor = elemInfo.sec || elemInfo.color || '#38bdf8';
            ctx.save();
            ctx.strokeStyle = secColor;
            ctx.lineWidth = 3.6;
            ctx.globalAlpha = 0.80;
            for (let sIdx = 0; sIdx < 3; sIdx++) {
              const s = slots[sIdx];
              ctx.beginPath();
              for (let k = 0; k < 6; k++) {
                const rad = (k * 60 - 90) * Math.PI / 180;
                const px = s.x + rSlot * Math.cos(rad);
                const py = s.y + rSlot * Math.sin(rad);
                if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
              }
              ctx.closePath();
              ctx.stroke();
            }
            ctx.restore();

            for (let sIdx = 0; sIdx < 3; sIdx++) {
              const s = slots[sIdx];
              const filled = isFilled[sIdx];
              const seed = seeds[sIdx];

              ctx.save();
              ctx.translate(s.x, s.y);
              ctx.beginPath();
              for (let k = 0; k < 6; k++) {
                const rad = (k * 60 - 90) * Math.PI / 180;
                const px = rSlot * Math.cos(rad);
                const py = rSlot * Math.sin(rad);
                if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
              }
              ctx.closePath();
              ctx.fillStyle = filled ? 'rgba(24, 18, 38, 0.95)' : 'rgba(11, 17, 32, 0.90)';
              ctx.fill();

              if (filled) {
                ctx.strokeStyle = elemInfo.color;
                ctx.lineWidth = 1.4;
                ctx.globalAlpha = 0.90;
                ctx.stroke();
                ctx.lineWidth = 3.0;
                ctx.globalAlpha = 0.28;
                ctx.stroke();
              } else {
                ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
                ctx.lineWidth = 1.1;
                ctx.globalAlpha = 0.70;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(0, 0, rSlot * 0.22, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.50)';
                ctx.fill();
              }
              ctx.restore();

              if (filled && polyRenderer?.drawComponent) {
                const polyR = rSlot * 0.68;
                polyRenderer.drawComponent(ctx, s.x, s.y, polyR, 'orange', time, false, false, 1.0, seed.phase, seed.tilt);
              }
            }
          }
        });

        this.spellButtonNodes.push(btnNode);
        this.colSpellbook.addChild(btnNode);
      }
    }

    _getSpectatorContext() {
      const g = global.GameState, net = global.NetworkP2PManager;
      const isSpectating = !!(net?.isConnected?.() && !net.isLocalPlayersTurn());
      if (!isSpectating) return { isSpectating: false, povPlayer: null };
      const povIdx = net.getDefaultPausedPlayerIndex ? net.getDefaultPausedPlayerIndex() : (g?.activePlayerIndex || 0);
      return { isSpectating: true, povPlayer: g?.players?.[povIdx] || null };
    }

    syncSpellbookColumnWithGameState() {
      if (!this.colSpellbook || !this.spellButtonNodes) return;
      const g = global.GameState;
      const { isSpectating, povPlayer } = this._getSpectatorContext();
      const book = isSpectating ? (povPlayer?.spellbook || []) : (g?.spellbook || []);
      const isSpellActive = !!(
        g?.inArchMode || global.SpellArch?.inArchMode ||
        g?.inShiftMode || global.SpellShift?.inShiftMode ||
        g?.inRitualMode || global.SpellRitual?.inRitualMode ||
        g?.inManifestMode || global.SpellManifest?.inManifestMode ||
        g?.inTeleportMode || global.SpellTeleport?.inTeleportMode ||
        g?.inChargeMode || global.SpellCharge?.inChargeMode || global.SpellCharge?.isMimicking ||
        g?.inForesightMode || global.SpellForesight?.inForesightMode ||
        g?.inSpellOverflow ||
        (g?.activeMaterialMod === 'weave' && (g?.weaveStep || 0) > 0) || global.SpellWeave?.inWeaveMode ||
        global.SpellManager?.isTurnTransitionBusy?.()
      );

      for (let i = 0; i < 12; i++) {
        const btnNode = this.spellButtonNodes[i];
        if (!btnNode) continue;
        if (i < book.length) {
          const spell = book[i];
          const elemKey = (spell.element || 'fire').toLowerCase();
          const elemInfo = ELEMENT_INFO_MAP[elemKey] || { key: 'fire', color: '#ff3333', sec: '#ffffff' };
          const isSeek = (spell.formula === 'YYR' || String(spell.name || '').toLowerCase() === 'seek');

          btnNode.visible = true;
          btnNode.spellData = spell;
          btnNode.elemInfo = elemInfo;
          btnNode.atlasKey = (global.UISidebarDeck?.rightButtonNodes?.[0]?.atlasKey === null) ? null : 'cyan';
          btnNode.style.bgColor = '#000000';
          btnNode.style.bgOpacity = 0.80;
          btnNode.style.innerHighlight.color = '#10f000';
          btnNode.style.innerHighlight.sharpEdgeColor = '#10f000';
          btnNode.style.outerHighlight.enabled = false;
          btnNode.setGhost(isSpectating ? !isSeek : isSpellActive);
          if (global.BorderTuningLab?.applyGroupStyle) global.BorderTuningLab.applyGroupStyle(btnNode, 'group-buttons');
          if (typeof btnNode.invalidateCache === 'function') btnNode.invalidateCache();
        } else {
          btnNode.visible = false;
          btnNode.spellData = null;
        }
      }
      if (this.spellList) this.spellList.layoutChildren();
    }

    castSpellSlot(slotIndex) {
      const g = global.GameState;
      const { isSpectating, povPlayer } = this._getSpectatorContext();
      if (isSpectating) {
        const targetSpell = povPlayer?.spellbook?.[slotIndex];
        const isSeek = !!(targetSpell && (targetSpell.formula === 'YYR' || String(targetSpell.name || '').toLowerCase() === 'seek'));
        if (isSeek) {
          this.spectatorSeekPeek = true;
          global.AudioSynth?.playConfirm?.(targetSpell.formula || 'YYR');
          global.UISidebarDeck?.openMaterialsColumn?.(true);
          g?.showToast?.('🔮 CYBER SEEK (View Only): Previewing your upcoming Material Tray.');
          this.syncMaterialsQueueColumn?.();
          global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
          global.BoardRenderer?.render?.();
          return true;
        }
        global.AudioSynth?.playCancel?.();
        g?.showToast?.('👀 Spectating — spells can only be cast on your turn.');
        return false;
      }
      if (global.SpellManager?.isTurnTransitionBusy?.()) {
        global.AudioSynth?.playCancel?.();
        g?.showToast?.('⏳ Wait for Start/End Turn animations to finish before casting spells!');
        return false;
      }
      const isSpellActive = !!(
        g?.inArchMode || global.SpellArch?.inArchMode ||
        g?.inShiftMode || global.SpellShift?.inShiftMode ||
        g?.inRitualMode || global.SpellRitual?.inRitualMode ||
        g?.inManifestMode || global.SpellManifest?.inManifestMode ||
        g?.inTeleportMode || global.SpellTeleport?.inTeleportMode ||
        g?.inChargeMode || global.SpellCharge?.inChargeMode || global.SpellCharge?.isMimicking ||
        g?.inForesightMode || global.SpellForesight?.inForesightMode ||
        g?.inSpellOverflow ||
        (g?.activeMaterialMod === 'weave' && (g?.weaveStep || 0) > 0) || global.SpellWeave?.inWeaveMode ||
        global.SpellManager?.isTurnTransitionBusy?.()
      );
      if (isSpellActive) {
        global.AudioSynth?.playCancel?.();
        if (typeof g?.showToast === 'function') g.showToast('⚠️ A spell is already active! Finish or cancel it first.');
        return false;
      }

      if (global.SpellManager && typeof global.SpellManager.castSpell === 'function') {
        const targetSpell = g?.spellbook?.[slotIndex];
        const success = global.SpellManager.castSpell(slotIndex);
        if (success) {
          const sKey = targetSpell?.formula || targetSpell?.name;
          if (sKey !== undefined) global.AudioSynth?.playConfirm?.(sKey);
          const isTargeting = !!(
            global.GameState?.inArchMode || global.SpellArch?.inArchMode ||
            global.GameState?.inShiftMode || global.SpellShift?.inShiftMode ||
            global.GameState?.inRitualMode || global.SpellRitual?.inRitualMode ||
            global.GameState?.inManifestMode || global.SpellManifest?.inManifestMode ||
            global.GameState?.inTeleportMode || global.SpellTeleport?.inTeleportMode ||
            global.GameState?.inChargeMode || global.SpellCharge?.inChargeMode ||
            global.GameState?.activeMaterialMod || global.SpellWeave?.inWeaveMode
          );
          if (global.GameState?.inForesightMode) global.UISidebarDeck?.openMaterialsColumn(true);
          else if (isTargeting) global.UISidebarDeck?.closeSpellbookColumn(true);
          else global.UISidebarDeck?.openSpellbookColumn(true);
        } else {
          global.AudioSynth?.playCancel?.();
        }
        this.syncSpellbookColumnWithGameState();
        if (global.UIDeckSync) global.UIDeckSync.syncMaterialsTrayWithGameState();
        if (typeof this.syncMaterialsQueueColumn === 'function') this.syncMaterialsQueueColumn();
        if (global.BoardRenderer) global.BoardRenderer.render();
        return success;
      }
    }
  }

  const instance = new UICardsDeckClass();
  global.UICardsDeckClass = UICardsDeckClass;
  global.UICardsDeck = instance;
  global.ELEMENT_INFO_MAP = ELEMENT_INFO_MAP;
  global.COMP_HIGHLIGHT_MAP = COMP_HIGHLIGHT_MAP;
  if (global.ROLL_CALL) global.ROLL_CALL.set('UI_Cards_Deck', instance);

})(typeof window !== 'undefined' ? window : this);
