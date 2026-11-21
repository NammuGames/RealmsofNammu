/**
 * @fileoverview cells/hex_ui/Border_Tuning_Lab_1.0.js - Border & Bezel Controller Core
 * @description Color/object helpers, group target node lookup, style snapshotting, and
 * node style application for BorderTuningLab.
 */

(function(global) {
  'use strict';

  function toHexColor(col, fallback = '#38bdf8') {
    if (!col) return fallback;
    if (typeof col !== 'string') return fallback;
    const trimmed = col.trim();
    if (trimmed.startsWith('#')) {
      if (trimmed.length === 7) return trimmed;
      if (trimmed.length === 4) {
        return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
      }
      return trimmed.slice(0, 7);
    }
    const match = trimmed.match(/\d+/g);
    if (match && match.length >= 3) {
      const r = Math.min(255, parseInt(match[0], 10)).toString(16).padStart(2, '0');
      const g = Math.min(255, parseInt(match[1], 10)).toString(16).padStart(2, '0');
      const b = Math.min(255, parseInt(match[2], 10)).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
    return fallback;
  }

  function deepClone(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      return { ...obj };
    }
  }

  class BorderTuningLabClass {
    constructor() {
      this.dom = null;
      this.audio = null;
      this.currentTarget = 'group-buttons';
      this.originalStyles = {};
      this.groupConfigs = {};
    }

    init(dom, audio) {
      this.dom = dom;
      this.audio = audio || global.AudioSynth;
      this.bindControls();
      ['group-buttons', 'group-enclosures', 'group-canvases', 'group-stat-pods', 'group-sigil-detail'].forEach(g => {
        const cfg = this.getGroupConfig(g);
        const nodes = this.getTargetNodes(g);
        if (nodes && nodes.length > 0) {
          nodes.forEach(n => this.applyConfigToNode(n, cfg, g));
        }
      });
      global.NativeStatPod?.updatePlayerTurnHighlight?.();
      this.syncUIFromTarget(this.currentTarget);
    }

    isColorPreserved(key) {
      return key === 'group-canvases' || key === 'group-sigil-detail' || key === 'group-stat-pods';
    }

    getTargetNodes(key) {
      switch (key) {
        case 'group-buttons': {
          const list = [];
          const addAll = (arr) => {
            if (arr && Array.isArray(arr)) {
              arr.forEach(n => { if (n && !list.includes(n)) list.push(n); });
            }
          };
          addAll(global.UISidebarDeck?.rightButtonNodes);
          addAll(global.UISidebarDeck?.leftButtonNodes);
          addAll(global.UICardsDeck?.spellButtonNodes);
          addAll(global.UICardsDeck?.materialsButtonNodes);
          addAll(global.UICardsDeck?.componentButtonNodes);
          if (global.UICardsDeck?.btnCompAction) list.push(global.UICardsDeck.btnCompAction);
          return list;
        }

        case 'group-enclosures': {
          return [
            global.HexUIEngine?.leftSidebar,
            global.HexUIEngine?.rightSidebar,
            global.HexUIEngine?.boardFrame
          ].filter(Boolean);
        }

        case 'group-canvases': {
          return [
            global.CanvasHub?.containerNode,
            (global.SigilNookCanvas?.stage !== 'detail' ? global.SigilNookCanvas?.gridFrame : null),
            global.SigilEmblemStudio?.containerNode,
            global.ComponentCanvas?.containerNode,
            global.AlignmentCanvas?.containerNode,
            global.FontCanvas?.containerNode,
            global.GlyphCanvas?.containerNode,
            global.StatCanvas?.containerNode
          ].filter(Boolean);
        }

        case 'group-sigil-detail': {
          const list = [];
          const detail = global.SigilNookCanvas?.detailFrame;
          if (detail) {
            list.push(detail);
            if (detail.children) {
              const title = detail.children.find(c => c.id === 'nook-detail-title-bar');
              const inst = detail.children.find(c => c.id === 'nook-detail-instructions');
              if (title) list.push(title);
              if (inst) list.push(inst);
            }
          }
          return list;
        }

        case 'group-stat-pods': {
          const list = [];
          const sp = global.NativeStatPod;
          if (sp) {
            if (sp.topPodNode) list.push(sp.topPodNode);
            if (sp.botPodNode) list.push(sp.botPodNode);
            if (sp.hpNode) list.push(sp.hpNode);
            if (sp.compNode) list.push(sp.compNode);
            if (sp.statDefs && sp.topPodNode?.children) {
              sp.statDefs.forEach(def => {
                const t = sp.topPodNode.children.find(c => c.id === `stat-type-${def.key}`);
                const v = sp.topPodNode.children.find(c => c.id === `stat-val-${def.key}`);
                if (t && !list.includes(t)) list.push(t);
                if (v && !list.includes(v)) list.push(v);
              });
            }
          }
          const vp = global.NativeVitalityPod;
          if (vp) {
            if (vp.botPodNode && !list.includes(vp.botPodNode)) list.push(vp.botPodNode);
            if (vp.hpNode && !list.includes(vp.hpNode)) list.push(vp.hpNode);
            if (vp.compNode && !list.includes(vp.compNode)) list.push(vp.compNode);
          }
          const sc = global.StatCanvas;
          if (sc && sc.containerNode) {
            const addTree = (node) => {
              if (!node || node === sc.containerNode || node.id === 'stat-canvas-list-container') return;
              if (!list.includes(node)) list.push(node);
              if (node.children) node.children.forEach(addTree);
            };
            if (sc.containerNode.children) sc.containerNode.children.forEach(addTree);
          }
          return list;
        }

        default:
          return [];
      }
    }

    snapshotOriginalStyle(key, nodes) {
      if (this.originalStyles[key] || !nodes || nodes.length === 0) return;
      this.originalStyles[key] = nodes.map(n => ({ node: n, style: deepClone(n.style), atlasKey: n.atlasKey }));
    }

    getGroupConfig(key) {
      if (this.groupConfigs[key]) return this.groupConfigs[key];
      const nodes = this.getTargetNodes(key);
      const first = nodes && nodes[0];
      const style = first?.style || {};
      const inner = style.innerHighlight || {};
      const outer = style.outerHighlight || {};
      const preserved = this.isColorPreserved(key);
      const isButtons = (key === 'group-buttons');
      const isEnclosures = (key === 'group-enclosures');
      const isCanvases = (key === 'group-canvases');
      const isStatPods = (key === 'group-stat-pods');
      const isSigilDetail = (key === 'group-sigil-detail');

      this.groupConfigs[key] = {
        spread: 8,
        innerIntensity: 0.80,
        innerSteps: inner.steps !== undefined ? inner.steps : 3,
        innerColor: preserved ? null : (isButtons || isEnclosures ? '#10f000' : (inner.color || '#38bdf8')),
        outerEnabled: isSigilDetail ? true : (isButtons || isEnclosures || isCanvases || isStatPods ? false : (outer.enabled !== undefined ? !!outer.enabled : false)),
        blur: isSigilDetail ? 8 : (isButtons ? 12 : (isEnclosures ? 16 : (isCanvases ? 24 : (isStatPods ? 18 : 16)))),
        outerIntensity: isSigilDetail ? 0.80 : (isButtons ? 0.80 : (isEnclosures || isCanvases ? 0.50 : (isStatPods ? 0.35 : 0.50))),
        outerSteps: outer.steps !== undefined ? outer.steps : 3,
        outerColor: preserved ? null : (isEnclosures ? '#a855f7' : (isButtons ? '#c084fc' : (outer.color || '#0284c7'))),
        bgOpacity: isEnclosures ? 0.12 : (isButtons ? 0.80 : (isCanvases || isSigilDetail ? 1.00 : (isStatPods ? 1.00 : 0.85))),
        bgColor: preserved ? (isSigilDetail ? '#000000' : null) : (isButtons || isEnclosures ? '#000000' : (style.bgColor || '#0f172a'))
      };
      return this.groupConfigs[key];
    }

    applyConfigToNode(node, cfg, key) {
      if (!node) return;
      if (node.atlasKey) node.atlasKey = null;

      if (!node.style) node.style = {};
      if (!node.style.innerHighlight) node.style.innerHighlight = { enabled: true };
      if (!node.style.outerHighlight) node.style.outerHighlight = { enabled: false };

      const preserved = this.isColorPreserved(key);

      node.style.innerHighlight.enabled = true;
      node.style.innerHighlight.spread = cfg.spread;
      node.style.innerHighlight.intensity = cfg.innerIntensity;
      node.style.innerHighlight.steps = cfg.innerSteps;
      if (!preserved && cfg.innerColor) {
        node.style.innerHighlight.color = cfg.innerColor;
        node.style.innerHighlight.sharpEdgeColor = cfg.innerColor;
      }

      node.style.outerHighlight.enabled = cfg.outerEnabled;
      node.style.outerHighlight.blur = cfg.blur;
      node.style.outerHighlight.intensity = cfg.outerIntensity;
      node.style.outerHighlight.steps = cfg.outerSteps;
      if (!preserved && cfg.outerColor) {
        node.style.outerHighlight.color = cfg.outerColor;
        node.style.outerHighlight.sharpEdgeColor = cfg.outerColor;
      }

      node.style.bgOpacity = cfg.bgOpacity;
      if (!preserved && cfg.bgColor) {
        node.style.bgColor = cfg.bgColor;
      }

      if (typeof node.invalidateCache === 'function') {
        node.invalidateCache();
      }
    }

    applyGroupStyle(node, key = this.currentTarget) {
      if (!node) return;
      const cfg = this.getGroupConfig(key);
      if (cfg) {
        this.applyConfigToNode(node, cfg, key);
      }
    }
  }

  BorderTuningLabClass._util = { toHexColor, deepClone };

  const instance = new BorderTuningLabClass();
  global.BorderTuningLabClass = BorderTuningLabClass;
  global.BorderTuningLab = instance;
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Border_Tuning_Lab_1.0', instance);
  }
})(typeof window !== 'undefined' ? window : this);
