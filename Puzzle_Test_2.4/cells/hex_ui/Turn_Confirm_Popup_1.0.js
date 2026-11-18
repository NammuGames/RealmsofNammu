/**
 * @fileoverview cells/hex_ui/Turn_Confirm_Popup_1.0.js - End Turn Confirmation Modal Core
 * @description Manages popup config, open/close/confirm transitions, keyboard capture, and
 * end-of-turn summary metrics calculation.
 */

(function (global) {
  'use strict';

  const fontSciFae = '"Sci-Fae", "SciFaePseudoScript10", "SciFae Pseudo Script 1.0", sans-serif';

  class TurnConfirmPopupClass {
    constructor() {
      this.active = false;
      this.containerNode = null;
      this.onConfirmCallback = null;
      this.options = {};
      this.keyHandler = null;

      // Real-time Tuning Configuration
      this.config = {
        frameW: 690, frameH: 200, frameApex: 60, frameX: 0, frameY: 240,
        subPodW: 248, subPodH: 126, subPodApex: 40, subPodSpacing: 360, subPodY: 0,
        iconX: -52, iconSize: 32, textX: 58, textY: 5, textSize: 54,
        msgTextSize: 48, msgTextY: 4
      };
    }

    setConfig(newCfg) {
      if (!newCfg) return;
      Object.assign(this.config, newCfg);
      if (this.isOpen()) {
        this.buildScene();
        global.BoardRenderer?.render?.();
      }
    }

    isOpen() {
      return this.active || !!(this.frameNode && this.frameNode.animating);
    }

    open(onConfirm = null, options = {}, origin = 'self') {
      if (this.isOpen()) return;
      this.active = true;
      this.onConfirmCallback = onConfirm;
      this.options = options || {};
      this._originId = options.originNodeOrId || origin;
      this.bindKeyboard();
      if (global.GameSettingsCanvas?.isOpen?.()) {
        global.GameSettingsCanvas.buildScene();
      } else {
        this.buildScene();
        if (global.TweenOrchestrator?.expandFrame && this.frameNode) {
          global.TweenOrchestrator.expandFrame(this.frameNode, this._originId || 'self');
        }
      }
      global.AudioSynth?.playClick?.();
      global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
      global.BoardRenderer?.render?.();
    }

    close(onDone) {
      if ((!this.active && !this.containerNode?.visible) || this.frameNode?.animating) return;
      this.active = false;
      this.onConfirmCallback = null;
      this.options = {};
      this.unbindKeyboard();
      const doCloseCleanup = () => {
        if (this.containerNode) {
          this.containerNode.visible = false;
          this.containerNode.children = [];
          if (typeof this.containerNode.invalidateCache === 'function') this.containerNode.invalidateCache();
        }
        if (global.HexUIEngine?.studioOverlay === this.containerNode) {
          global.HexUIEngine.setStudioOverlay(null);
        }
        if (global.GameSettingsCanvas?.isOpen?.()) {
          global.GameSettingsCanvas.buildScene();
        }
        global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
        global.BoardRenderer?.render?.();
        if (typeof onDone === 'function') onDone();
      };
      if (global.AudioSynth?.playClick) global.AudioSynth.playClick();
      if (!global.GameSettingsCanvas?.isOpen?.() && global.TweenOrchestrator?.collapseFrame && this.frameNode && this.containerNode?.visible) {
        global.TweenOrchestrator.collapseFrame(this.frameNode, this._originId || 'self', {
          onComplete: doCloseCleanup
        });
      } else {
        doCloseCleanup();
      }
    }

    confirm() {
      if (!this.active || this.frameNode?.animating) return;
      const cb = this.onConfirmCallback;
      this.close();
      if (typeof cb === 'function') cb();
    }

    bindKeyboard() {
      this.unbindKeyboard();
      this.keyHandler = (e) => {
        if (!this.active) return;
        if (e.code === 'Space' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          this.confirm();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          this.close();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
        }
      };
      window.addEventListener('keydown', this.keyHandler, true);
    }

    unbindKeyboard() {
      if (this.keyHandler) {
        window.removeEventListener('keydown', this.keyHandler, true);
        this.keyHandler = null;
      }
    }

    getTurnSummaryMetrics(state) {
      if (!state) return { destroyedPts: 0, overflowPts: 0, diseaseDamage: 0 };
      const resolver = global.SigilResolver;
      const resonantSigilIds = resolver?.resonantSigils || new Set();
      const resonantArchZoneIds = resolver?.resonantArchZoneIds || global.SigilEngine?.lastResonantArchZoneIds || new Set();

      // 1. Identify all unique disease bodies (PlagueShape IDs) being destroyed this turn
      const destroyedPIds = new Set();

      // A. Resonant Sigil Detonations over Phased Disease
      if (resonantSigilIds.size > 0 && resolver?.activeSigils && state.board) {
        const resonantSigils = resolver.activeSigils.filter(s => resonantSigilIds.has(s.id));
        resonantSigils.forEach(sigil => {
          (sigil.tiles || []).forEach(tk => {
            const tile = state.board.get(tk);
            if (tile && tile.phased && tile.underneath) {
              const under = tile.underneath;
              const pId = under.plagueId || (global.ComponentDisease?.shapes ? Array.from(global.ComponentDisease.shapes.values()).find(s => s.components.some(c => c.key === tk))?.id : null);
              if (pId) destroyedPIds.add(pId);
            }
          });
        });
      }

      // B. Resonant Phase-Enhanced Arch zones
      if (state.archZones?.length > 0) global.SpellArch?.syncArchZones?.(state.archZones);
      if (resonantArchZoneIds.size > 0 && state.archZones && state.board) {
        state.archZones.forEach(z => {
          if (!resonantArchZoneIds.has(z.id) && !resonantArchZoneIds.has(`${z.center?.q},${z.center?.r}`)) return;
          if (z.enchantment === 'phase') {
            (z.flowerTiles || []).forEach(tk => {
              const t = state.board.get(tk);
              if (t && (t.color === 'disease' || t.plagueId)) {
                const pId = t.plagueId || (global.ComponentDisease?.shapes ? Array.from(global.ComponentDisease.shapes.values()).find(s => s.components.some(c => c.key === tk))?.id : null);
                if (pId) destroyedPIds.add(pId);
              }
            });
          }
        });
      }

      // C. Burn Destruction: Single-tile Burn & Burn Arch
      if (state.board) {
        if (state.archZones?.length > 0) {
          const burnZones = state.archZones.filter(z => z.enchantment === 'burn');
          burnZones.forEach(bz => {
            (bz.flowerTiles || []).forEach(tk => {
              const t = state.board.get(tk);
              if (t && (t.color === 'disease' || t.plagueId)) {
                const pId = t.plagueId || (global.ComponentDisease?.shapes ? Array.from(global.ComponentDisease.shapes.values()).find(s => s.components.some(c => c.key === tk))?.id : null);
                if (pId) destroyedPIds.add(pId);
              }
            });
          });
        }
        for (const [tk, tile] of state.board.entries()) {
          if (tile && tile.burned && tile.underneath) {
            const under = tile.underneath;
            if (under.color === 'disease' || under.plagueId) {
              const pId = under.plagueId || (global.ComponentDisease?.shapes ? Array.from(global.ComponentDisease.shapes.values()).find(s => s.components.some(c => c.key === tk))?.id : null);
              if (pId) destroyedPIds.add(pId);
            }
          }
        }
      }

      const destroyedPts = destroyedPIds.size;

      // 2. Impending Damage (used to predict Last Breath Heal holds before counting Overflow)
      let coveredDamage = 0;
      if (state.board) {
        for (const [tk, tile] of state.board.entries()) {
          if (tile && tile.coveredComponent) {
            const pId = tile.plagueId || (global.ComponentDisease?.shapes ? Array.from(global.ComponentDisease.shapes.values()).find(s => s.components.some(c => c.key === tk))?.id : null);
            if (!pId || !destroyedPIds.has(pId)) coveredDamage++;
          }
        }
      }

      let offBoardDiseaseDamage = 0;
      if (global.ComponentDisease?.shapes) {
        for (const shape of global.ComponentDisease.shapes.values()) {
          if (shape.offBoard && !destroyedPIds.has(shape.id)) offBoardDiseaseDamage++;
        }
      }

      const activeDmg = state.activeDamageTiles || [];
      const overhangDamage = activeDmg.filter(t => !t.plagueShapeId && !t.isPlacedPlague && t.color !== 'disease').length;
      const incomingDamage = coveredDamage + offBoardDiseaseDamage + overhangDamage;
      const netHp = state.hp + (state.pendingHeal || 0) - incomingDamage;
      let neededHealSpells = (incomingDamage > 0 && netHp <= 0) ? Math.ceil(Math.max(1, 1 - netHp) / 4) : 0;

      // 3. Spell Overflow Bonus Points (excluding Heal tokens held for Last Breath defense)
      let overflowPts = state.overflowSpells ? state.overflowSpells.length : 0;
      if (resonantSigilIds.size > 0 && resolver?.activeSigils) {
        const math = global.HexMath;
        const resonantSigils = resolver.activeSigils.filter(s => resonantSigilIds.has(s.id)).slice();
        resonantSigils.forEach(s => {
          if (!s.vertex && math?.findVertexForTiles) s.vertex = math.findVertexForTiles(s.tiles);
          s.vertexId = (s.vertex && math?.getVertexId) ? (math.getVertexId(s.vertex) || 999999) : (s.vertexId ?? 999999);
        });
        resonantSigils.sort((a, b) => a.vertexId - b.vertexId);

        const tempCharges = new Map();
        (state.spellbook || []).forEach(s => tempCharges.set(s.formula || s.name, s.charges ?? 0));
        let curBookLen = (state.spellbook || []).length;
        const maxCap = state.spellbookCapacity || 6;

        resonantSigils.forEach(sigil => {
          const isHeal = (sigil.formula === 'PPB' || sigil.spell?.toLowerCase() === 'heal' || sigil.element?.toLowerCase() === 'feral');
          if (isHeal && neededHealSpells > 0) {
            neededHealSpells--;
            return;
          }
          const key = sigil.formula;
          if (tempCharges.has(key)) {
            const curC = tempCharges.get(key);
            if (curC < 3) { tempCharges.set(key, curC + 1); sigil.targetDestination = 'spellbook'; }
            else { overflowPts++; sigil.targetDestination = 'score'; }
          } else if (curBookLen < maxCap) {
            tempCharges.set(key, 1);
            curBookLen++;
            sigil.targetDestination = 'spellbook';
          } else {
            overflowPts++;
            sigil.targetDestination = 'score';
          }
        });
      }

      return { destroyedPts, overflowPts, diseaseDamage: coveredDamage + offBoardDiseaseDamage };
    }
  }

  TurnConfirmPopupClass._fontSciFae = fontSciFae;

  const instance = new TurnConfirmPopupClass();
  global.TurnConfirmPopupClass = TurnConfirmPopupClass;
  global.TurnConfirmPopup = instance;
  if (global.ROLL_CALL) global.ROLL_CALL.set('Turn_Confirm_Popup_1.0', instance);
})(typeof window !== 'undefined' ? window : this);
