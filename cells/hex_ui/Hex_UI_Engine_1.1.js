/**
 * @fileoverview cells/hex_ui/Hex_UI_Engine_1.1.js - Multi-Part Cell: Part 1.1 of Hex_UI_Engine
 * @description Hit-Testing, input coordinate mapping, pointer & wheel event routing into Hex UI scene graph.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const Proto = (global.HexUIEngineClass && global.HexUIEngineClass.prototype) ||
                (global.HexUIEngine && Object.getPrototypeOf(global.HexUIEngine));

  if (!Proto) {
    console.error('[Hex_UI_Engine_1.1] HexUIEngineClass prototype not found. Ensure Hex_UI_Engine_1.0.js is loaded first.');
    return;
  }

  // --- Input Routing & Inverse Hit Testing ---
  Proto.hitTestNode = function(node, sx, sy) {
    if (!node || !node.visible || node.animating) return null;

    const isInside = node.containsScreenPoint(sx, sy);

    // If node clips content, normal children can only be hit if point is inside this node
    if (!node.clipContent || isInside) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        const hit = this.hitTestNode(node.children[i], sx, sy);
        if (hit) return hit;
      }
    }

    // Tethered children are outside the clipping boundary
    for (let i = node.tetheredChildren.length - 1; i >= 0; i--) {
      const hit = this.hitTestNode(node.tetheredChildren[i], sx, sy);
      if (hit) return hit;
    }

    if (isInside && !node.inert && node.pointerEvents !== 'none') {
      return node;
    }
    return null;
  };

  Proto.bindEvents = function() {
    if (!this.canvas) return;

    const getPos = (e) => {
      const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : (e.clientX ?? 0);
      const clientY = (e.touches && e.touches[0]) ? e.touches[0].clientY : (e.clientY ?? 0);
      if (this.isPortrait) {
        return { x: clientY, y: window.innerWidth - clientX };
      }
      const r = this.canvas.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    };

    this.canvas.addEventListener('mousemove', (e) => {
      const pos = getPos(e);
      let hit = null;
      if (global.GameSettingsRenamePopup?.isOpen?.() && global.GameSettingsRenamePopup.frameNode) {
        hit = this.hitTestNode(global.GameSettingsRenamePopup.frameNode, pos.x, pos.y);
      } else if (global.TurnConfirmPopup?.isOpen?.() && global.TurnConfirmPopup.frameNode) {
        hit = this.hitTestNode(global.TurnConfirmPopup.frameNode, pos.x, pos.y);
      } else {
        hit = this.hitTestNode(this.root, pos.x, pos.y);
      }

      if (hit !== this.hoveredNode) {
        if (this.hoveredNode) {
          const btn = this.hoveredNode.getTrait('button');
          if (btn) btn.handlePointerLeave();
        }
        this.hoveredNode = hit;
        if (this.hoveredNode) {
          const btn = this.hoveredNode.getTrait('button');
          if (btn) btn.handlePointerEnter();
        }
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      const pos = getPos(e);
      if (global.GameSettingsRenamePopup?.isOpen?.() && global.GameSettingsRenamePopup.frameNode) {
        const frame = global.GameSettingsRenamePopup.frameNode;
        const hitPopup = this.hitTestNode(frame, pos.x, pos.y);
        if (!hitPopup) {
          if (!frame.animating) global.GameSettingsRenamePopup.cancel();
          return;
        }
      } else if (global.TurnConfirmPopup?.isOpen?.() && global.TurnConfirmPopup.frameNode) {
        const frame = global.TurnConfirmPopup.frameNode;
        const hitPopup = this.hitTestNode(frame, pos.x, pos.y);
        if (!hitPopup) {
          if (!frame.animating) global.TurnConfirmPopup.close();
          return;
        }
      }
      const hit = this.hitTestNode(this.root, pos.x, pos.y);
      this.pressedNode = hit;
      if (hit) {
        this.lastClickedNode = hit;
        const btn = hit.getTrait('button');
        if (btn) btn.handlePointerDown();
      }
    });

    this.canvas.addEventListener('touchstart', (e) => {
      const pos = getPos(e);
      if (global.GameSettingsRenamePopup?.isOpen?.() && global.GameSettingsRenamePopup.frameNode) {
        const frame = global.GameSettingsRenamePopup.frameNode;
        const hitPopup = this.hitTestNode(frame, pos.x, pos.y);
        if (!hitPopup) {
          if (!frame.animating) global.GameSettingsRenamePopup.cancel();
          return;
        }
      } else if (global.TurnConfirmPopup?.isOpen?.() && global.TurnConfirmPopup.frameNode) {
        const frame = global.TurnConfirmPopup.frameNode;
        const hitPopup = this.hitTestNode(frame, pos.x, pos.y);
        if (!hitPopup) {
          if (!frame.animating) global.TurnConfirmPopup.close();
          return;
        }
      }
      const hit = this.hitTestNode(this.root, pos.x, pos.y);
      this.pressedNode = hit;
      if (hit) {
        this.lastClickedNode = hit;
        if (hit.getTrait('button')) hit.getTrait('button').handlePointerDown();
      }
    }, { passive: true });

    window.addEventListener('mouseup', (e) => {
      if (this.pressedNode) {
        const pos = getPos(e);
        const wasInside = this.pressedNode.containsScreenPoint(pos.x, pos.y);
        const btn = this.pressedNode.getTrait('button');
        if (btn) btn.handlePointerUp(wasInside);
        this.pressedNode = null;
      }
    });

    window.addEventListener('touchend', (e) => {
      if (this.pressedNode) {
        const t = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e;
        const pos = getPos(t);
        const wasInside = this.pressedNode.containsScreenPoint(pos.x, pos.y);
        const btn = this.pressedNode.getTrait('button');
        if (btn) btn.handlePointerUp(wasInside);
        this.pressedNode = null;
      }
    }, { passive: true });

    this.canvas.addEventListener('wheel', (e) => {
      if (global.TurnConfirmPopup?.isOpen?.() || global.GameSettingsRenamePopup?.isOpen?.()) return;
      const pos = getPos(e);
      const hit = this.hitTestNode(this.root, pos.x, pos.y);
      if (hit) {
        // Check if hit node or any ancestor has ListTrait
        let curr = hit;
        while (curr) {
          const list = curr.getTrait('list');
          if (list) {
            list.handleWheel(e.deltaY);
            e.preventDefault();
            break;
          }
          if (curr === this.rightSidebar && curr.children) {
            const activeCol = (curr.children[window.COSMOS_STATE?.rightSidebarActiveCol || 0]) || curr.children.find(c => c.visible && c.getTrait('list'));
            if (activeCol && activeCol.getTrait('list')) {
              activeCol.getTrait('list').handleWheel(e.deltaY);
              e.preventDefault();
              break;
            }
          }
          if (curr === this.boardFrame && global.BoardRenderer?.setZoom) {
            const factor = e.deltaY < 0 ? 1.08 : 0.92;
            global.BoardRenderer.setZoom(global.BoardRenderer.targetZoom * factor, 0, 0);
            e.preventDefault();
            break;
          }
          curr = curr.parent;
        }
      }
    }, { passive: false });
  };

  // If engine instance already initialized canvas before 1.1 loaded, bind immediately
  if (global.HexUIEngine && global.HexUIEngine.canvas && !global.HexUIEngine._eventsBound) {
    global.HexUIEngine.bindEvents();
    global.HexUIEngine._eventsBound = true;
  }
})(typeof window !== 'undefined' ? window : this);

