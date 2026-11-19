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

  Proto._findScrollableList = function(hit) {
    if (!hit) return null;
    const isScrollable = (l) => !!(l && l.allowManualScroll && (typeof l.getMaxScroll !== 'function' || l.getMaxScroll() > 0));
    let curr = hit;
    while (curr) {
      const list = curr.getTrait('list');
      if (isScrollable(list)) return list;
      if (curr === this.rightSidebar && curr.children) {
        const activeCol = (curr.children[window.COSMOS_STATE?.rightSidebarActiveCol || 0]) || curr.children.find(c => c.visible && c.getTrait('list'));
        const colList = activeCol?.getTrait?.('list');
        if (isScrollable(colList)) return colList;
      }
      curr = curr.parent;
    }
    const scanOverlay = (node) => {
      if (!node || !node.visible) return null;
      const list = node.getTrait('list');
      if (isScrollable(list)) return list;
      for (let i = 0; i < (node.children?.length || 0); i++) {
        const found = scanOverlay(node.children[i]);
        if (found) return found;
      }
      return null;
    };
    if (this.studioOverlay && this.studioOverlay.visible) {
      let p = hit;
      while (p && p !== this.studioOverlay) p = p.parent;
      if (p === this.studioOverlay) return scanOverlay(this.studioOverlay);
    }
    return null;
  };

  Proto.bindEvents = function() {
    if (!this.canvas) return;

    const touchState = { id: null, startX: 0, startY: 0, lastY: 0, lastTime: 0, vy: 0, list: null, scrolling: false };
    const clearTouchScroll = () => {
      touchState.id = null; touchState.list = null; touchState.scrolling = false; touchState.vy = 0;
    };
    const findTouch = (list, id) => {
      for (let i = 0; i < (list?.length || 0); i++) {
        if (list[i].identifier === id) return list[i];
      }
      return null;
    };

    const getPos = (e) => {
      const t = (e.touches && e.touches[0]) ? e.touches[0] : ((e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e);
      const clientX = t.clientX ?? 0;
      const clientY = t.clientY ?? 0;
      if (this.isPortrait) {
        return { x: clientY, y: window.innerWidth - clientX };
      }
      const r = this.canvas.getBoundingClientRect();
      const sx = r.width > 0 ? (this.canvas.width / r.width) : 1;
      const sy = r.height > 0 ? (this.canvas.height / r.height) : 1;
      return { x: (clientX - r.left) * sx, y: (clientY - r.top) * sy };
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
      const t = e.touches && e.touches[0];
      if (!t || e.touches.length !== 1) { clearTouchScroll(); return; }
      const pos = getPos(t);
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
      const scrollList = this._findScrollableList(hit);
      if (scrollList) {
        touchState.id = t.identifier;
        touchState.startX = t.clientX;
        touchState.startY = t.clientY;
        touchState.lastY = t.clientY;
        touchState.lastTime = performance.now();
        touchState.vy = 0;
        touchState.list = scrollList;
        touchState.scrolling = false;
      } else {
        clearTouchScroll();
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (touchState.id === null || !touchState.list) return;
      const t = findTouch(e.touches, touchState.id);
      if (!t) return;
      if (!touchState.scrolling) {
        if (Math.hypot(t.clientX - touchState.startX, t.clientY - touchState.startY) <= 8) return;
        touchState.scrolling = true;
        if (this.pressedNode) {
          const btn = this.pressedNode.getTrait('button');
          if (btn) btn.state = 'idle';
          this.pressedNode = null;
        }
      }
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      const dy = t.clientY - touchState.lastY;
      const r = this.canvas.getBoundingClientRect();
      const backScaleY = r.height > 0 ? (this.canvas.height / r.height) : 1;
      const wm = touchState.list.node?.worldMatrix;
      const nodeScaleY = wm ? Math.max(0.1, Math.hypot(wm[2], wm[3])) : 1;
      const dyLocal = (dy * backScaleY) / nodeScaleY;
      touchState.list.scrollBy(dyLocal, true);
      const dt = Math.max(0.008, (now - touchState.lastTime) * 0.001);
      touchState.vy = touchState.vy * 0.35 + (dyLocal / dt) * 0.65;
      touchState.lastY = t.clientY;
      touchState.lastTime = now;
      global.BoardRenderer?.render?.();
    }, { passive: false });

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
      const t = (touchState.id !== null) ? findTouch(e.changedTouches, touchState.id) : ((e.changedTouches && e.changedTouches[0]) || e);
      if (touchState.scrolling && t) {
        if (Math.abs(touchState.vy) > 60) {
          const flick = Math.max(-420, Math.min(420, touchState.vy * 0.14));
          touchState.list?.scrollBy?.(flick, false);
        }
        this.pressedNode = null;
        clearTouchScroll();
        return;
      }
      if (t) clearTouchScroll();
      if (this.pressedNode) {
        const pos = getPos(t || e);
        const wasInside = this.pressedNode.containsScreenPoint(pos.x, pos.y);
        const btn = this.pressedNode.getTrait('button');
        if (btn) btn.handlePointerUp(wasInside);
        this.pressedNode = null;
      }
    }, { passive: true });

    window.addEventListener('touchcancel', () => {
      clearTouchScroll();
      if (this.pressedNode) {
        const btn = this.pressedNode.getTrait('button');
        if (btn) btn.handlePointerUp(false);
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

