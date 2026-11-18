/**
 * @fileoverview Input_Controller_1.1.js - Keyboard & Quick-Action Event Controller
 * @description Coordinates keyboard controls (WASD, Arrows, Space, Enter, Z, Q, E, 1-6, Esc, R, M, B, N),
 * Foresight / Spell overflow intercepts, and instant action routing.
 * Part 2 of multi-part InputController cell (extends Input_Controller_1.0.js).
 */

(function(global) {
  'use strict';

  if (!global.InputControllerClass) {
    console.error('[Input_Controller_1.1] global.InputControllerClass not found. Load Input_Controller_1.0.js first.');
    return;
  }

  /**
   * Binds keyboard controls (WASD, Arrows, Space, Enter, Z, Q, E, 1-6, etc.).
   */
  global.InputControllerClass.prototype.bindKeyboardEvents = function() {
    window.addEventListener('keydown', (e) => {
      const state = global.GameState;
      const renderer = global.BoardRenderer;
      const audio = global.AudioSynth;
      if (!state) return;
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (global.GameSettingsRenamePopup?.isOpen?.() || global.TurnConfirmPopup?.isOpen?.()) return;

      // Prevent tab default navigation
      if (e.key === 'Tab') {
        e.preventDefault();
        return;
      }

      // Helper: Trigger button node click, respecting ghost and disabled parameters
      const clickButtonNode = (node) => {
        if (!node) return false;
        const trait = node.getTrait?.('button');
        if (!trait) return false;
        if ((node.ghost || trait.disabled) && !trait.allowGhostClick) return false;
        if (global.HexUIEngine) global.HexUIEngine.lastClickedNode = node;
        if (trait.soundClick && audio?.playClick) audio.playClick();
        trait.onClick?.(node);
        return true;
      };

      // M: Menu (tied to leftButtonNodes[5], ghosted when button is ghosted)
      if (['m', 'M'].includes(e.key)) {
        e.preventDefault();
        clickButtonNode(global.UISidebarDeck?.leftButtonNodes?.[5]);
        return;
      }

      // V: Lower Stat Pod / Stat Canvas toggle
      if (['v', 'V'].includes(e.key)) {
        e.preventDefault();
        if (global.StatCanvas?.isOpen?.()) {
          global.StatCanvas.close?.();
        } else if (!this.isAnyCanvasOpen() && global.StatCanvas?.toggle) {
          global.StatCanvas.toggle();
        }
        return;
      }

      // Studio / Canvas Overlay Active Guard: Do not move board pieces or trigger board actions
      if (this.isAnyCanvasOpen()) {
        if (e.key === 'Escape') {
          e.preventDefault();
          clickButtonNode(global.UISidebarDeck?.leftButtonNodes?.[0]);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          clickButtonNode(global.UISidebarDeck?.rightButtonNodes?.[5]);
        } else if (e.key === ' ' || e.code === 'Space') {
          if (global.SigilEmblemStudio?.isOpen?.() && global.SigilEmblemStudio.stage === 'variants') {
            e.preventDefault();
            global.SigilEmblemStudio.saveSelectedVariant?.();
          }
        } else if (['t', 'T'].includes(e.key)) {
          e.preventDefault();
          global.EmblemTunerHUD?.toggle?.();
        }
        return;
      }

      if (!state.matchStarted || state.isMatchStarting || state.isMatchEnding || state.isSequentialPlacing || global.TurnManager?.isEndingTurn) return;

      // Foresight Mode Intercept
      if (state.inForesightMode) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (state.foresightSwappedIndex !== null) state.finalizeForesightSwap();
          else {
            if (audio?.playCancel) audio.playCancel();
            state.showToast('Select an upcoming material (Slots 2–6) to swap into Slot 1!');
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          if (global.UISidebarDeck) global.UISidebarDeck.handleUndo();
          else state.cancelForesightSwap();
        } else if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
          e.preventDefault();
          state.selectForesightMaterial(parseInt(e.key, 10) - 1);
        }
        return;
      }

      // Spell Overflow Intercept
      if (state.inSpellOverflow) {
        if (e.key === 'Enter') {
          e.preventDefault();
          state.confirmSpellOverflow();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          state.inSpellOverflow = false;
        }
        return;
      }

      // 1. WASD & Arrow Keys: 4-Way Bilateral Cursor Movement (tied to leftButtonNodes[1..4])
      if (['ArrowUp', 'w', 'W'].includes(e.key)) {
        e.preventDefault();
        clickButtonNode(global.UISidebarDeck?.leftButtonNodes?.[1]);
      } else if (['ArrowDown', 's', 'S'].includes(e.key)) {
        e.preventDefault();
        clickButtonNode(global.UISidebarDeck?.leftButtonNodes?.[2]);
      } else if (['ArrowLeft', 'a', 'A'].includes(e.key)) {
        e.preventDefault();
        clickButtonNode(global.UISidebarDeck?.leftButtonNodes?.[3]);
      } else if (['ArrowRight', 'd', 'D'].includes(e.key)) {
        e.preventDefault();
        clickButtonNode(global.UISidebarDeck?.leftButtonNodes?.[4]);

      // 2. Q / E: 60° Piece Rotation (tied to rightButtonNodes[2..3])
      } else if (['q', 'Q'].includes(e.key)) {
        e.preventDefault();
        clickButtonNode(global.UISidebarDeck?.rightButtonNodes?.[2]);
      } else if (['e', 'E'].includes(e.key)) {
        e.preventDefault();
        clickButtonNode(global.UISidebarDeck?.rightButtonNodes?.[3]);

      // 3. Spacebar: Place Active Piece at Cursor / Pick-up / Place (tied to rightButtonNodes[4])
      } else if (e.code === 'Space') {
        e.preventDefault();
        clickButtonNode(global.UISidebarDeck?.rightButtonNodes?.[4]);

      // 4. Enter: Confirm Placement / Finalize Spell / End Turn (tied to rightButtonNodes[5] or btnCompAction in inventory col)
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (global.UISidebarDeck?.state?.rightSidebarActiveCol === 3) {
          clickButtonNode(global.UICardsDeck?.btnCompAction);
        } else {
          clickButtonNode(global.UISidebarDeck?.rightButtonNodes?.[5]);
        }

      // 5. Z: Undo Last Action (tied to leftButtonNodes[0] Return/Undo button)
      } else if (['z', 'Z'].includes(e.key)) {
        e.preventDefault();
        clickButtonNode(global.UISidebarDeck?.leftButtonNodes?.[0]);

      // 6. Right-Bar Inventory Column (12 slots: 1-9, 0, -, =)
      } else if (global.UISidebarDeck?.state?.rightSidebarActiveCol === 3 && '1234567890-='.includes(e.key)) {
        const compKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
        const slotIdx = compKeys.indexOf(e.key);
        if (slotIdx !== -1) {
          e.preventDefault();
          clickButtonNode(global.UICardsDeck?.componentButtonNodes?.[slotIdx]);
        }

      // 6b. 1–6: Quick Slot Material Select
      } else if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        const slot = parseInt(e.key, 10) - 1;
        if (state.inForesightMode) {
          e.preventDefault();
          state.selectForesightMaterial(slot);
        } else if (slot === 0 && !state.placedThisTurn) {
          state.selectedTrayIndex = 0;
          state.isMaterialSelected = true;
          if (audio) audio.playClick();
          state.syncUI();
        }

      // 7. Camera Controls: I (Zoom In), O (Zoom Out), P (Zoom Reset)
      } else if (['i', 'I'].includes(e.key)) {
        e.preventDefault();
        if (global.GameState?.cameraLocked) return;
        const curZoom = global.COSMOS_STATE?.targetZoom ?? renderer?.targetZoom ?? 1.0;
        const limits = renderer?.getZoomLimits ? renderer.getZoomLimits() : { minZoom: 0.15, maxZoom: 2.5 };
        const newZoom = Math.min(limits.maxZoom, curZoom * 1.15);
        if (renderer?.setZoom) renderer.setZoom(newZoom);
        else if (global.COSMOS_STATE) global.COSMOS_STATE.targetZoom = newZoom;
        if (audio?.playClick) audio.playClick();

      } else if (['o', 'O'].includes(e.key)) {
        e.preventDefault();
        if (global.GameState?.cameraLocked) return;
        const curZoom = global.COSMOS_STATE?.targetZoom ?? renderer?.targetZoom ?? 1.0;
        const limits = renderer?.getZoomLimits ? renderer.getZoomLimits() : { minZoom: 0.15, maxZoom: 2.5 };
        const newZoom = Math.max(limits.minZoom, curZoom / 1.15);
        if (renderer?.setZoom) renderer.setZoom(newZoom);
        else if (global.COSMOS_STATE) global.COSMOS_STATE.targetZoom = newZoom;
        if (audio?.playClick) audio.playClick();

      } else if (['p', 'P'].includes(e.key)) {
        e.preventDefault();
        if (global.GameState?.cameraLocked) return;
        if (renderer?.resetCamera) {
          renderer.resetCamera();
        } else if (global.COSMOS_STATE) {
          global.COSMOS_STATE.targetPanX = 0;
          global.COSMOS_STATE.targetPanY = 0;
          global.COSMOS_STATE.targetZoom = renderer?.getStandardZoom ? renderer.getStandardZoom() : 1.0;
        }
        if (audio?.playClick) audio.playClick();

      // 8. B: Spell Book Button (tied to rightButtonNodes[0], respecting ghost state)
      } else if (['b', 'B'].includes(e.key)) {
        e.preventDefault();
        clickButtonNode(global.UISidebarDeck?.rightButtonNodes?.[0]);

      // 8b. N: Toggle Sigil Nook Column / Materials (tied to rightButtonNodes[1], respecting ghost state)
      } else if (['n', 'N'].includes(e.key)) {
        e.preventDefault();
        clickButtonNode(global.UISidebarDeck?.rightButtonNodes?.[1]);

      // 9. Escape: Cancel active targeting spell or Return (tied to leftButtonNodes[0])
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clickButtonNode(global.UISidebarDeck?.leftButtonNodes?.[0]);
      }
    });
  };

  // Instantiate singleton once both parts 1.0 and 1.1 are loaded
  const inputControllerInstance = new global.InputControllerClass();

  // Register with global Roll Call & global namespace
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Input_Controller', inputControllerInstance);
  global.InputController = inputControllerInstance;

})(typeof window !== 'undefined' ? window : this);
