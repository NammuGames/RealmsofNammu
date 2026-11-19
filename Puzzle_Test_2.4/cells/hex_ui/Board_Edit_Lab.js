/**
 * @fileoverview cells/hex_ui/Board_Edit_Lab.js - Isolated Sandbox Board Editor Controller (Part 1)
 * @description State, Tuning Drawer tab bindings, cursor navigation, and non-invasive input/HUD hooks.
 * Companion modules: Board_Edit_Ops.js (mutations) and Board_Edit_Renderer.js (overlays).
 * Safe to remove without touching core gameplay cells.
 */

(function(global) {
  'use strict';

  const COMPONENTS = ['blue', 'red', 'purple', 'yellow', 'ether', 'disease'];
  const COMP_LABELS = {
    blue: 'Blue (Water)', red: 'Red (Fire)', purple: 'Purple (Stone)',
    yellow: 'Yellow (Air)', ether: 'Ether (Wild)', disease: 'Disease (Blight)'
  };
  const ENCH_LABELS = {
    burn: '🔥 Burn', phase: '💧 Phase', fortify: '🔒 Lock', weave: '🌾 Weave'
  };

  class BoardEditLabClass {
    constructor() {
      this.active = false;
      this.tool = 'component';      // 'component' | 'erase' | 'arch' | 'sigil'
      this.enchantment = null;      // null | 'burn' | 'phase' | 'fortify' | 'weave'
      this.componentIndex = 0;      // 0..5 index into COMPONENTS
      this.cursor = { q: 0, r: 0 };
      this.upDownAxisState = 0;
      this._hooksInstalled = false;
    }

    getCurrentComponent() {
      return COMPONENTS[this.componentIndex] || 'blue';
    }

    init() {
      this.installHooks();
      this.bindUI();
      this.syncUI();
    }

    bindUI() {
      const toggleBtn = document.getElementById('btn-edit-toggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          this.toggleActive();
          global.AudioSynth?.playClick?.();
        });
      }

      const enchMap = [
        ['btn-edit-ench-burn', 'burn'],
        ['btn-edit-ench-phase', 'phase'],
        ['btn-edit-ench-lock', 'fortify'],
        ['btn-edit-ench-weave', 'weave']
      ];
      enchMap.forEach(([id, key]) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('click', () => {
          if (!this.active) this.setActive(true);
          this.enchantment = (this.enchantment === key) ? null : key;
          this.tool = 'component'; // Automatically switch back to component cursor
          global.AudioSynth?.playClick?.();
          this.syncUI();
          global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
          global.BoardRenderer?.render?.();
        });
      });

      const toolMap = [
        ['btn-edit-tool-arch', 'arch'],
        ['btn-edit-tool-erase', 'erase'],
        ['btn-edit-tool-sigil', 'sigil']
      ];
      toolMap.forEach(([id, mode]) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('click', () => {
          if (!this.active) this.setActive(true);
          if (mode === 'erase') {
            this.tool = 'erase';
            this.enchantment = null; // Remove hovering pre-placed component & enchantment from cursor
          } else {
            this.tool = (this.tool === mode) ? 'component' : mode;
          }
          global.AudioSynth?.playClick?.();
          this.syncUI();
          global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
          global.BoardRenderer?.render?.();
        });
      });
    }

    toggleActive() {
      this.setActive(!this.active);
    }

    setActive(on) {
      const state = global.GameState;
      const next = !!on;
      if (next === this.active) return;

      if (next && state) {
        const busy = !!(
          state.inArchMode || state.inShiftMode || state.inRitualMode ||
          state.inManifestMode || state.inTeleportMode || state.inChargeMode ||
          state.inForesightMode || state.inSpellOverflow || global.SpellWeave?.inWeaveMode
        );
        if (busy) {
          state.showToast?.('⚠️ Finish or cancel the active spell before entering Edit Mode.');
          global.AudioSynth?.playCancel?.();
          return;
        }
        this.cursor = { ...(state.placementCursor || { q: 0, r: 0 }) };
      }

      this.active = next;
      this.tool = 'component';
      state?.showToast?.(next ? '🛠️ Edit Mode ON: WASD move, Q/E cycle, Space place.' : '🛠️ Edit Mode OFF');

      this.syncUI();
      global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
      global.BoardRenderer?.render?.();
    }

    cycleComponent(dir = 1) {
      const step = (dir === 'ccw' || dir === -1) ? -1 : 1;
      this.componentIndex = (this.componentIndex + step + COMPONENTS.length) % COMPONENTS.length;
      if (this.tool === 'erase' || this.tool === 'arch') {
        this.tool = 'component';
      }
      global.AudioSynth?.playRotate?.();
      this.syncUI();
      global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
      global.BoardRenderer?.render?.();
      return true;
    }

    moveCursor(dir) {
      const state = global.GameState;
      const math = global.HexMath;
      if (!state || !math || !this.active) return false;

      if (this.tool === 'sigil') {
        const res = global.SigilResolver;
        if (!res) return false;
        const ok = res.moveSigilVertex(dir, (state.boardRadius || 6) + 2);
        if (ok) {
          state.selectedSigilId = res.getTargetableSigilAtCursor()?.id || null;
          this.syncUI();
          global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
          global.BoardRenderer?.render?.();
        }
        return ok;
      }

      let nq = this.cursor.q;
      let nr = this.cursor.r;
      if (dir === 'left') { nq -= 1; nr += 1; }
      else if (dir === 'right') { nq += 1; nr -= 1; }
      else if (dir === 'up') {
        if (this.upDownAxisState === 0) nr += 1; else nq += 1;
        this.upDownAxisState = 1 - this.upDownAxisState;
      } else if (dir === 'down') {
        if (this.upDownAxisState === 0) nq -= 1; else nr -= 1;
        this.upDownAxisState = 1 - this.upDownAxisState;
      }

      const maxDist = (state.boardRadius || 6) + 3;
      if (math.hexDistance(nq, nr) <= maxDist) {
        this.cursor = { q: nq, r: nr };
        global.AudioSynth?.playClick?.();
        this.syncUI();
        global.BoardRenderer?.render?.();
        return true;
      }
      return false;
    }

    handleBoardClick(hex) {
      const state = global.GameState;
      const math = global.HexMath;
      if (!state || !math || !hex || !this.active) return false;

      if (this.tool === 'sigil') {
        const key = `${hex.q},${hex.r}`;
        const cand = (state.allCandidates || []).find(c => c.tiles && c.tiles.includes(key));
        const v = (cand && math.findVertexForTiles)
          ? math.findVertexForTiles(cand.tiles)
          : { type: 'up', q: hex.q, r: hex.r };
        const curV = state.sigilCursorVertex;
        const isSame = curV && v && curV.type === v.type && curV.q === v.q && curV.r === v.r;
        state.sigilCursorVertex = v;
        state.selectedSigilId = cand ? cand.id : null;
        if (isSame) return this.executePrimaryAction();
        global.AudioSynth?.playClick?.();
        this.syncUI();
        global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
        global.BoardRenderer?.render?.();
        return true;
      }

      if (this.cursor.q === hex.q && this.cursor.r === hex.r) {
        return this.executePrimaryAction();
      }

      this.cursor = { q: hex.q, r: hex.r };
      global.AudioSynth?.playClick?.();
      this.syncUI();
      global.BoardRenderer?.render?.();
      return true;
    }

    executePrimaryAction() {
      if (!this.active || !global.GameState) return false;
      if (this.tool === 'erase') return this.eraseAt(this.cursor.q, this.cursor.r);
      if (this.tool === 'arch') return this.toggleArchAt(this.cursor.q, this.cursor.r);
      if (this.tool === 'sigil') return this.activateSigilAtCursor();
      return this.placeComponentAt(this.cursor.q, this.cursor.r);
    }

    syncUI() {
      const setBtn = (id, isOn) => document.getElementById(id)?.classList.toggle('active', !!isOn);
      setBtn('btn-edit-toggle', this.active);
      setBtn('btn-edit-ench-burn', this.active && this.enchantment === 'burn');
      setBtn('btn-edit-ench-phase', this.active && this.enchantment === 'phase');
      setBtn('btn-edit-ench-lock', this.active && this.enchantment === 'fortify');
      setBtn('btn-edit-ench-weave', this.active && this.enchantment === 'weave');
      setBtn('btn-edit-tool-arch', this.active && this.tool === 'arch');
      setBtn('btn-edit-tool-erase', this.active && this.tool === 'erase');
      setBtn('btn-edit-tool-sigil', this.active && this.tool === 'sigil');

      const box = document.getElementById('board-edit-status-box');
      if (!box) return;
      if (!this.active) {
        box.textContent = '[BOARD EDIT MODE: OFF]\nClick "Activate Edit Mode" to place components freely.';
        return;
      }

      const comp = this.getCurrentComponent();
      const enchStr = this.enchantment ? ENCH_LABELS[this.enchantment] : 'None';
      const note = (comp === 'disease' && this.enchantment) ? ' (ignored on Disease)' : '';
      const v = global.GameState?.sigilCursorVertex;
      const coordStr = this.tool === 'sigil'
        ? (v ? `${v.type} (${v.q}, ${v.r})` : '—')
        : `(${this.cursor.q}, ${this.cursor.r})`;

      box.textContent =
`[BOARD EDIT MODE: ON]
  Tool        : ${this.tool.toUpperCase()}
  Component   : ${COMP_LABELS[comp] || comp}
  Enchantment : ${enchStr}${note}
  Cursor      : ${coordStr}
  Controls    : WASD/2-Click | Q/E Cycle | SPACE Act | ESC Exit`;
    }

    installHooks() {
      if (this._hooksInstalled) return;
      this._hooksInstalled = true;
      const lab = this;

      const wrapMethod = (obj, name, wrapper) => {
        if (!obj || typeof obj[name] !== 'function') return;
        const orig = obj[name];
        obj[name] = function(...args) { return wrapper.call(this, orig, ...args); };
      };

      wrapMethod(global.InputControllerClass?.prototype, 'handleBoardClick', function(orig, sx, sy) {
        if (lab.active && !this.isAnyCanvasOpen?.()) {
          const state = global.GameState, renderer = global.BoardRenderer, engine = global.HexUIEngine, math = global.HexMath;
          if (!state || !renderer || !math) return;
          if (engine) {
            const hit = engine.hitTestNode(engine.root, sx, sy);
            if (hit && hit !== engine.boardFrame && hit !== engine.root) return;
          }
          const hex = renderer.screenToAxial(sx, sy);
          if (hex && math.hexDistance(hex.q, hex.r) <= (state.boardRadius || 6) + 3) {
            lab.handleBoardClick(hex);
          }
          return;
        }
        return orig.call(this, sx, sy);
      });

      const deck = global.UISidebarDeck;
      if (deck) {
        wrapMethod(deck, 'handleNav', (orig, dir) => (lab.active ? lab.moveCursor(dir) : orig.call(deck, dir)));
        wrapMethod(deck, 'handlePlace', (orig) => {
          if (global.InputController?.isAnyCanvasOpen?.() || global.TurnConfirmPopup?.isOpen?.()) return orig.call(deck);
          return lab.active ? lab.executePrimaryAction() : orig.call(deck);
        });
        wrapMethod(deck, 'handleRotate', (orig, dir) => {
          if (!lab.active) return orig.call(deck, dir);
          if (lab.tool === 'sigil') {
            const g = global.GameState, res = global.SigilResolver;
            const locked = res?.getLockedSigilAtCursor?.();
            if (locked?.isWild) {
              const ok = res.permuteWildColors(locked.id, (dir === 'ccw' || dir === -1) ? -1 : 1, g?.board);
              lab.syncUI();
              global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
              global.BoardRenderer?.render?.();
              return ok;
            }
            return false;
          }
          return lab.cycleComponent(dir);
        });
        wrapMethod(deck, 'handleUndo', (orig) => {
          if (lab.active && !global.InputController?.isAnyCanvasOpen?.() && !global.TurnConfirmPopup?.isOpen?.() && (deck.state?.rightSidebarActiveCol || 0) === 0) {
            if (lab.tool !== 'component') {
              lab.tool = 'component';
              global.AudioSynth?.playClick?.();
              lab.syncUI();
              global.UIDeckSync?.syncMaterialsTrayWithGameState?.();
              global.BoardRenderer?.render?.();
            } else {
              lab.setActive(false);
              global.AudioSynth?.playClick?.();
            }
            return;
          }
          return orig.call(deck);
        });
      }

      if (global.UIDeckSync) {
        wrapMethod(global.UIDeckSync, 'syncMaterialsTrayWithGameState', function(orig, ...args) {
          const out = orig.apply(this, args);
          if (!lab.active || global.InputController?.isAnyCanvasOpen?.()) return out;
          const nodes = global.UISidebarDeck;
          if (!nodes) return out;
          const btnRet = nodes.leftButtonNodes?.[0];
          if (btnRet) {
            btnRet.setGhost(false); btnRet.setHighlight?.(false);
            const t = btnRet.getTrait('text');
            if (t) { t.title = lab.tool === 'component' ? 'Exit Edit' : 'Back'; t.hotkey = 'ESC'; t.titleColor = '#38bdf8'; }
          }
          const bQ = nodes.rightButtonNodes?.[2], bE = nodes.rightButtonNodes?.[3], bSp = nodes.rightButtonNodes?.[4];
          if (bQ) {
            bQ.setGhost(false); bQ.setHighlight?.(false);
            const t = bQ.getTrait('text');
            if (t) { t.title = lab.tool === 'sigil' ? '↺ Wild' : '↺ Comp'; t.subtitle = lab.tool === 'sigil' ? 'Swap Wild' : 'Prev Comp'; t.badge = 'KEY: Q'; t.titleColor = '#38bdf8'; }
          }
          if (bE) {
            bE.setGhost(false); bE.setHighlight?.(false);
            const t = bE.getTrait('text');
            if (t) { t.title = lab.tool === 'sigil' ? 'Wild ↻' : 'Comp ↻'; t.subtitle = lab.tool === 'sigil' ? 'Swap Wild' : 'Next Comp'; t.badge = 'KEY: E'; t.titleColor = '#38bdf8'; }
          }
          if (bSp) {
            bSp.setGhost(false); bSp.setHighlight?.(false);
            const t = bSp.getTrait('text');
            if (t) {
              const titleMap = { component: 'Place Comp', erase: 'Erase Tile', arch: 'Toggle Arch', sigil: 'Toggle Sigil' };
              t.title = titleMap[lab.tool] || 'Apply';
              t.subtitle = 'Edit Mode';
              t.badge = 'KEY: SPACE';
              t.titleColor = lab.tool === 'erase' ? '#f43f5e' : (lab.tool === 'arch' ? '#f97316' : '#38bdf8');
            }
          }
          return out;
        });
      }
    }
  }

  const instance = new BoardEditLabClass();
  global.BoardEditLabClass = BoardEditLabClass;
  global.BoardEditLab = instance;
  global.ROLL_CALL = global.ROLL_CALL || new Map();
  global.ROLL_CALL.set('Board_Edit_Lab', instance);

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => instance.init());
  }

})(typeof window !== 'undefined' ? window : this);
