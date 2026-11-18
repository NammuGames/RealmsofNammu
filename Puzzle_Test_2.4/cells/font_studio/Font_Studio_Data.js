/**
 * @fileoverview cells/font_studio/Font_Studio_Data.js - State Store & Glyph Model
 * @description Isolated data repository for Font Studio: holds geometric configurations,
 * active selections, glyph stroke collections, presets, 1/12 stepping, and JSON clipboard export.
 */

(function(global) {
  'use strict';

  const STORAGE_KEY = 'font_studio_save_v16';
  const LATTICE_SQUARE_UNITS = 24;

  class FontStudioDataStore {
    constructor() {
      this.config = {
        name: 'SciFae Pseudo Script 1.0',
        squareOverlap: 4,  // 2 to 8 units in 1/24 system (default 4/24)
        dotDiameter: 18,   // 8 to 40 px
        gridScale: 1.0
      };

      this.activeGlyphKey = 'A';
      this.activeStrokeIndex = 0;
      this.currentDeckLevel = 0; // 0: Strokes Column, 1: Parts Column

      this.glyphs = {};
      this.listeners = [];

      this.initDefaultPresets();
      this.loadFromLocalStorage();
    }

    getMaxLatticeUnits(axis) {
      const kO = this.config.squareOverlap || 2;
      return axis === 'vert' ? (72 - 2 * kO) : (48 - kO);
    }

    initDefaultPresets() { this.importShorthand(global.FONT_STUDIO_DEFAULT_SHORTHAND || ''); }
    onChange(fn) { if (typeof fn === 'function') this.listeners.push(fn); }
    notify() {
      for (let i = 0; i < this.listeners.length; i++) {
        try { this.listeners[i](this); } catch (e) { console.error(e); }
      }
      this.saveToLocalStorage();
    }

    getGlyph(key) {
      const k = key || this.activeGlyphKey;
      if (!this.glyphs[k]) this.glyphs[k] = { strokes: [] };
      return this.glyphs[k];
    }

    getActiveGlyph() { return this.getGlyph(this.activeGlyphKey); }
    getActiveStroke() { return this.getActiveGlyph().strokes[this.activeStrokeIndex] || null; }

    selectGlyph(key) {
      this.activeGlyphKey = key; this.activeStrokeIndex = 0; this.currentDeckLevel = 0; this.notify();
    }

    selectStroke(idx) {
      this.activeStrokeIndex = Math.max(0, Math.min(5, idx)); this.notify();
    }

    setActivePart(partType) {
      const g = this.getActiveGlyph();
      let stroke = g.strokes[this.activeStrokeIndex];
      if (!stroke) {
        stroke = this.createDefaultStroke(partType);
        g.strokes[this.activeStrokeIndex] = stroke;
      } else {
        stroke.part = partType;
        this.normalizeStrokeProps(stroke);
      }
      this.notify();
    }

    createDefaultStroke(partType) {
      const maxV = this.getMaxLatticeUnits('vert');
      switch (partType) {
        case 'circle': return { part: 'circle', col: 0, row: 0 };
        case 'half_arc': return { part: 'half_arc', col: 0, row: 0, rotation: 0 };
        case 'quarter_circle': return { part: 'quarter_circle', col: 0, row: 0, rotation: 0 };
        case 'quarter_arc': return { part: 'quarter_arc', col: 0, row: 0, rotation: 0 };
        case 'dot': return { part: 'dot', col: 0, row: 1 };
        default: return { part: 'line', axis: 'vert', laneIndex: 0, tStart: 0, tEnd: maxV };
      }
    }

    normalizeStrokeProps(stroke) {
      if (stroke.part === 'line') {
        if (!stroke.axis) stroke.axis = 'vert';
        if (stroke.laneIndex === undefined) stroke.laneIndex = 0;
        const maxT = this.getMaxLatticeUnits(stroke.axis);
        if (stroke.tStart !== undefined && stroke.tEnd !== undefined && stroke.tStart <= 3.0 && stroke.tEnd <= 3.0) {
          const baseSpan = stroke.axis === 'vert' ? 3.0 : 2.0;
          stroke.tStart = Math.round((stroke.tStart / baseSpan) * maxT);
          stroke.tEnd = Math.round((stroke.tEnd / baseSpan) * maxT);
        }
        stroke.tStart = Math.max(0, Math.min(maxT, Math.round(stroke.tStart || 0)));
        stroke.tEnd = Math.max(0, Math.min(maxT, Math.round(stroke.tEnd !== undefined ? stroke.tEnd : maxT)));
      } else {
        if (stroke.col === undefined) stroke.col = 0;
        if (stroke.row === undefined) stroke.row = 0;
        if ((stroke.part === 'half_arc' || stroke.part === 'quarter_arc' || stroke.part === 'quarter_circle') && stroke.rotation === undefined) stroke.rotation = 0;
      }
    }

    removeActiveStroke() {
      const g = this.getActiveGlyph();
      if (g.strokes[this.activeStrokeIndex]) {
        g.strokes.splice(this.activeStrokeIndex, 1);
        if (this.activeStrokeIndex >= g.strokes.length && this.activeStrokeIndex > 0) this.activeStrokeIndex = g.strokes.length - 1;
        this.notify();
      }
    }

    clearActiveGlyph() {
      this.getActiveGlyph().strokes = []; this.activeStrokeIndex = 0; this.notify();
    }

    // --- 1/24 Lattice Discrete Steppers ---

    stepLineStart(dir) {
      const s = this.getActiveStroke();
      if (!s || s.part !== 'line') return;
      this.normalizeStrokeProps(s);
      s.tStart = Math.max(0, Math.min(s.tEnd - 1, s.tStart + dir));
      this.notify();
    }

    stepLineEnd(dir) {
      const s = this.getActiveStroke();
      if (!s || s.part !== 'line') return;
      this.normalizeStrokeProps(s);
      s.tEnd = Math.max(s.tStart + 1, Math.min(this.getMaxLatticeUnits(s.axis), s.tEnd + dir));
      this.notify();
    }

    stepSquareOverlap(dir) {
      this.config.squareOverlap = Math.max(2, Math.min(8, (this.config.squareOverlap || 4) + dir));
      this.notify();
    }

    stepDotDiameter(dir) {
      this.config.dotDiameter = Math.max(8, Math.min(40, this.config.dotDiameter + dir * 2));
      this.notify();
    }

    // --- Spatial Manipulation (WASD & QE) ---

    moveActiveStroke(dx, dy) {
      const s = this.getActiveStroke();
      if (!s) return;
      if (s.part === 'line') {
        this.normalizeStrokeProps(s);
        const maxT = this.getMaxLatticeUnits(s.axis);
        if (s.axis === 'vert') {
          s.laneIndex = Math.max(0, Math.min(4, s.laneIndex + dx));
          if (dy !== 0) {
            const span = s.tEnd - s.tStart, nStart = Math.max(0, Math.min(maxT - span, s.tStart + dy));
            s.tStart = nStart; s.tEnd = nStart + span;
          }
        } else {
          s.laneIndex = Math.max(0, Math.min(3, s.laneIndex + dy));
          if (dx !== 0) {
            const span = s.tEnd - s.tStart, nStart = Math.max(0, Math.min(maxT - span, s.tStart + dx));
            s.tStart = nStart; s.tEnd = nStart + span;
          }
        }
      } else {
        s.col = Math.max(0, Math.min(1, Math.round(((s.col !== undefined ? s.col : 0) + dx * 0.5) * 10) / 10));
        s.row = Math.max(0, Math.min(2, Math.round(((s.row !== undefined ? s.row : 0) + dy * 0.5) * 10) / 10));
      }
      this.notify();
    }

    rotateActiveStroke(dir) {
      const s = this.getActiveStroke();
      if (!s) return;
      if (s.part === 'line') {
        s.axis = s.axis === 'vert' ? 'horiz' : 'vert';
        s.laneIndex = s.axis === 'vert' ? Math.min(4, s.laneIndex) : Math.min(3, s.laneIndex);
        s.tStart = 0;
        s.tEnd = this.getMaxLatticeUnits(s.axis);
      } else if (s.part === 'half_arc' || s.part === 'quarter_arc' || s.part === 'quarter_circle') {
        const delta = dir > 0 ? 90 : -90;
        s.rotation = (s.rotation + delta + 360) % 360;
      }
      this.notify();
    }

    // --- Typography & Metrics Analysis ---

    isWideGlyph(glyph) {
      if (!glyph?.strokes?.length) return false;
      return glyph.strokes.some(s => s.part === 'line' ? (s.axis === 'vert' ? s.laneIndex > 2 : s.tEnd > 24) : s.col > 0);
    }

    hasDescender(glyph) {
      if (!glyph?.strokes?.length) return false;
      const bU = 48 - (this.config.squareOverlap || 2);
      return glyph.strokes.some(s => s.part === 'line' ? (s.axis === 'vert' ? s.tEnd > bU : s.laneIndex === 3) : s.row > 1);
    }

    getGlyphTypoMetrics(keyOrGlyph) {
      const g = (typeof keyOrGlyph === 'string') ? this.getGlyph(keyOrGlyph) : keyOrGlyph;
      const kO = this.config.squareOverlap || 2, isWide = this.isWideGlyph(g), hasDesc = this.hasDescender(g);
      return {
        colSpan: isWide ? 2 : 1,
        isWide,
        hasDescender: hasDesc,
        advanceWidthUnits: isWide ? (48 - kO) : 24,
        baselineUnit: 48 - kO,
        capHeightUnits: 48 - kO,
        descenderUnits: 24 - kO
      };
    }

    // --- Persistence & Shorthand Codec ---

    serializeStroke(s) {
      if (!s) return '';
      switch (s.part) {
        case 'line': return `${s.axis === 'horiz' ? 'h' : 'v'}${s.laneIndex || 0}:${s.tStart || 0}-${s.tEnd || 0}`;
        case 'quarter_arc': return `q${s.col !== undefined ? s.col : 0},${s.row !== undefined ? s.row : 0}@${s.rotation || 0}`;
        case 'quarter_circle': return `s${s.col !== undefined ? s.col : 0},${s.row !== undefined ? s.row : 0}@${s.rotation || 0}`;
        case 'half_arc': return `a${s.col !== undefined ? s.col : 0},${s.row !== undefined ? s.row : 0}@${s.rotation || 0}`;
        case 'circle': return `c${s.col !== undefined ? s.col : 0},${s.row !== undefined ? s.row : 0}`;
        case 'dot': return `d${s.col !== undefined ? s.col : 0},${s.row !== undefined ? s.row : 0}`;
        default: return '';
      }
    }

    parseStroke(str) {
      const t = str ? str.trim() : '';
      if (!t) return null;
      const type = t[0], rest = t.slice(1);
      if (type === 'v' || type === 'h') {
        const [laneStr, spanStr] = rest.split(':');
        const [tStart, tEnd] = (spanStr || '').split('-').map(Number);
        return { part: 'line', axis: type === 'h' ? 'horiz' : 'vert', laneIndex: parseInt(laneStr, 10) || 0, tStart: tStart || 0, tEnd: tEnd || 0 };
      }
      if (type === 'q' || type === 'a' || type === 's') {
        const [pos, rot] = rest.split('@');
        const [c, r] = (pos || '').split(',').map(Number);
        const pType = type === 'q' ? 'quarter_arc' : (type === 's' ? 'quarter_circle' : 'half_arc');
        return { part: pType, col: isNaN(c) ? 0 : c, row: isNaN(r) ? 0 : r, rotation: parseInt(rot, 10) || 0 };
      }
      if (type === 'c' || type === 'd') {
        const [c, r] = rest.split(',').map(Number);
        return { part: type === 'c' ? 'circle' : 'dot', col: isNaN(c) ? 0 : c, row: isNaN(r) ? 0 : r };
      }
      return null;
    }

    exportShorthand() {
      const name = this.config.name || 'SciFae Pseudo Script 1.0';
      const lines = [`@config name="${name}" overlap=${this.config.squareOverlap || 2} dot=${this.config.dotDiameter || 24}`];
      Object.keys(this.glyphs).sort().forEach(k => {
        const g = this.glyphs[k];
        if (g?.strokes?.length > 0) {
          const tokens = g.strokes.map(s => this.serializeStroke(s)).filter(Boolean);
          if (tokens.length) lines.push(`${k}: ${tokens.join(' | ')}`);
        }
      });
      return lines.join('\n');
    }

    importShorthand(text) {
      if (!text || typeof text !== 'string') return false;
      const lines = text.split('\n');
      lines.forEach(line => {
        const l = line.trim();
        if (!l || (l.startsWith('#') && !l.startsWith('#:')) || l.startsWith('//')) return;
        if (l.startsWith('@config')) {
          const mN = l.match(/name="([^"]+)"/) || l.match(/name=([^\s]+)/);
          if (mN) this.config.name = mN[1].trim();
          const mO = l.match(/overlap=(\d+)/), mD = l.match(/dot=(\d+)/);
          if (mO) this.config.squareOverlap = parseInt(mO[1], 10);
          if (mD) this.config.dotDiameter = parseInt(mD[1], 10);
          return;
        }
        const cIdx = l.startsWith('::') ? 1 : l.indexOf(':');
        if (cIdx === -1) return;
        const key = l.startsWith('::') ? ':' : l.slice(0, cIdx).trim();
        const strokes = l.slice(cIdx + 1).split('|').map(s => this.parseStroke(s)).filter(Boolean);
        if (key && strokes.length > 0) this.glyphs[key] = { strokes };
      });
      this.notify();
      return true;
    }

    exportJSON() {
      const kO = this.config.squareOverlap || 2, exportGlyphs = {};
      Object.keys(this.glyphs).forEach(k => {
        const g = this.glyphs[k];
        if (g?.strokes?.length) {
          const m = this.getGlyphTypoMetrics(g);
          exportGlyphs[k] = { strokes: g.strokes, advanceWidth: m.advanceWidthUnits, colSpan: m.colSpan, hasDescender: m.hasDescender };
        }
      });
      return JSON.stringify({ version: 2, meta: { name: this.config.name || 'SciFae Pseudo Script 1.0', gridSystem: '1/24' }, config: Object.assign({}, this.config), glyphs: exportGlyphs }, null, 2);
    }

    importJSON(input) {
      if (!input || typeof input !== 'string') return false;
      const trimmed = input.trim();
      if (!trimmed.startsWith('{')) return this.importShorthand(trimmed);
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed?.glyphs) {
          if (parsed.config) Object.assign(this.config, parsed.config);
          const restored = {};
          Object.keys(parsed.glyphs).forEach(k => {
            const g = parsed.glyphs[k];
            restored[k] = { strokes: Array.isArray(g.strokes) ? g.strokes : (Array.isArray(g) ? g : []) };
          });
          this.glyphs = restored;
          this.notify();
          return true;
        }
      } catch (err) { console.warn('FontStudio: Import JSON failed', err); }
      return false;
    }

    saveToLocalStorage() {
      try { if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, this.exportShorthand()); } catch (e) {}
    }

    loadFromLocalStorage() {
      try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        if (raw) this.importJSON(raw);
      } catch (e) {}
    }

    copyToClipboard() {
      const text = this.exportShorthand();
      console.log('📋 [FONT STUDIO SHORTHAND]:\n', text);
      let copied = false;
      try {
        const ta = Object.assign(document.createElement('textarea'), { value: text });
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
        document.body.appendChild(ta);
        ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e) { copied = false; }

      if (copied) return this.showToast('📋 Copied Font Shorthand to Clipboard!');
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => this.showToast('📋 Copied Font Shorthand to Clipboard!')).catch(() => this.showExportModal(text));
      } else {
        this.showExportModal(text);
      }
    }

    showToast(msg) {
      if (global.SigilEmblemStudio?.showToast) return global.SigilEmblemStudio.showToast(msg);
      let el = document.getElementById('studio-toast');
      if (!el && typeof document !== 'undefined') {
        el = Object.assign(document.createElement('div'), { id: 'studio-toast' });
        el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.94);border:1px solid #4ade80;color:#4ade80;font-family:"Fira Code",monospace;font-size:13px;font-weight:700;padding:10px 22px;border-radius:9999px;box-shadow:0 4px 20px rgba(74,222,128,0.35);z-index:99999;pointer-events:none;transition:opacity 0.25s;';
        document.body.appendChild(el);
      }
      if (el) { el.textContent = msg; el.style.opacity = '1'; setTimeout(() => { if (el) el.style.opacity = '0'; }, 2400); }
    }

    showExportModal(text) {
      if (typeof document === 'undefined') return;
      document.getElementById('font-export-modal')?.remove();
      const modal = document.createElement('div');
      modal.id = 'font-export-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(5,10,20,0.85);backdrop-filter:blur(8px);z-index:999999;display:flex;align-items:center;justify-content:center;';
      modal.innerHTML = `<div style="background:#0f172a;border:2px solid #4ade80;box-shadow:0 0 35px rgba(74,222,128,0.4);border-radius:12px;padding:24px;width:560px;max-width:90vw;display:flex;flex-direction:column;gap:14px;color:#f8fafc;font-family:Orbitron,sans-serif;"><div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-weight:700;font-size:16px;color:#4ade80;">📋 FONT STUDIO SHORTHAND</span><button id="btn-close-font-export" style="background:transparent;border:none;color:#94a3b8;font-size:18px;cursor:pointer;">✕</button></div><div style="font-size:11px;color:#94a3b8;font-family:sans-serif;">Press Ctrl+C to copy configuration, or click below:</div><textarea id="ta-font-export-val" readonly style="width:100%;height:220px;background:#020617;border:1px solid #334155;border-radius:6px;color:#4ade80;font-family:monospace;font-size:11px;padding:10px;box-sizing:border-box;resize:none;"></textarea><button id="btn-copy-font-export" style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:10px;font-weight:700;cursor:pointer;font-family:Orbitron,sans-serif;">COPY & CLOSE</button></div>`;
      document.body.appendChild(modal);
      const ta = document.getElementById('ta-font-export-val');
      if (ta) { ta.value = text; ta.focus(); ta.select(); }
      const close = () => modal.remove();
      document.getElementById('btn-close-font-export')?.addEventListener('click', close);
      document.getElementById('btn-copy-font-export')?.addEventListener('click', () => {
        if (ta) { ta.focus(); ta.select(); document.execCommand('copy'); }
        close(); this.showToast('📋 Copied Font Shorthand to Clipboard!');
      });
    }
  }

  const instance = new FontStudioDataStore();
  global.FontStudioData = instance;
  if (global.ROLL_CALL?.set) global.ROLL_CALL.set('Font_Studio_Data', instance);
})(typeof window !== 'undefined' ? window : this);
