/**
 * @fileoverview cells/hex_ui/Hex_Frame_Atlas.js - Centralized Pre-Baked Hex Frame Stamp Atlas (Showcase 6 Cell)
 * @description Pre-renders standard hex-frames (Board Tiles, Sidebar Buttons, Sockets) into reusable
 * offscreen bitmaps for single-line GPU-accelerated ctx.drawImage() stamping.
 */

(function(global) {
  'use strict';

  class HexFrameAtlasClass {
    constructor() {
      this.geom = null;
      this.bezelRenderer = null;
      this.tileStamps = {};     // 'normal', 'spine', 'active' -> { canvas, halfW, halfH }
      this.buttonStamps = {};   // `${colorKey}_idle`, `${colorKey}_hover` -> { canvas, halfW, halfH }
      this.tileRadius = 24;
      this.btnParams = { wBase: 124, hBase: 124, apex: 38, orientation: 'flat' };
      this.dirty = true;
      this.enabled = true;

      this.COLOR_MAP = {
        red:     { prim: '#ec0e0e', edge: '#fca5a5' },
        blue:    { prim: '#0040ff', edge: '#93c5fd' },
        yellow:  { prim: '#ffdd57', edge: '#fef08a' },
        purple:  { prim: '#5900b3', edge: '#d8b4fe' },
        orange:  { prim: '#ff7614', edge: '#fdba74' },
        green:   { prim: '#008a02', edge: '#86efac' },
        cyan:    { prim: '#38bdf8', edge: '#e0f2fe' },
        white:   { prim: '#ffffff', edge: '#ffffff' }
      };
    }

    init(geom, bezelRenderer) {
      this.geom = geom || global.HexFrameGeometry;
      this.bezelRenderer = bezelRenderer || global.HexBezelRenderer;
      this.bakeAll();
      return this;
    }

    invalidate() {
      this.dirty = true;
    }

    // ========================================================================
    // 1. BOARD TILE STAMPS (91 Yard Regular Pointy Hexagons)
    // ========================================================================
    bakeTileStamps(radius = 24) {
      if (!this.geom || !this.bezelRenderer) return;
      this.tileRadius = radius;

      // Regular pointy-top hex parameters
      const wBase = radius * Math.sqrt(3);
      const hBase = radius;
      const apex = radius * 0.5;
      const vertices = this.geom.getVertices(wBase, hBase, apex, 'pointy');

      const pad = 16;
      const cw = 64;
      const ch = 64;
      const halfW = cw * 0.5;
      const halfH = ch * 0.5;

      const styles = {
        normal: {
          bgColor: 'rgba(15, 23, 42, 0.62)',
          bgOpacity: 0.62,
          outerHighlight: { enabled: true, color: 'rgba(56, 189, 248, 0.35)', sharpEdgeColor: '#38bdf8', blur: 6, intensity: 0.45, lineWidth: 1.1 },
          innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#7dd3fc', spread: 5, intensity: 0.40, lineWidth: 1.0 }
        },
        active: {
          bgColor: 'rgba(20, 30, 55, 0.80)',
          bgOpacity: 0.80,
          outerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#ffffff', blur: 12, intensity: 0.80, lineWidth: 1.6 },
          innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#ffffff', spread: 8, intensity: 0.75, lineWidth: 1.4 }
        }
      };

      for (const key of ['normal', 'active']) {
        let entry = this.tileStamps[key];
        if (!entry) {
          const canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          entry = { canvas, halfW, halfH };
          this.tileStamps[key] = entry;
        }
        const ctx = entry.canvas.getContext('2d');
        ctx.clearRect(0, 0, cw, ch);
        ctx.save();
        ctx.translate(halfW, halfH);
        this.bezelRenderer.renderFrameBezel(ctx, vertices, styles[key]);
        ctx.restore();
      }
    }

    // ========================================================================
    // 2. STANDARD BUTTON STAMPS (Sidebar Buttons & Spell Cards)
    // ========================================================================
    bakeButtonStamps(wBase = 124, hBase = 124, apex = 38) {
      if (!this.geom || !this.bezelRenderer) return;
      this.btnParams = { wBase, hBase, apex, orientation: 'flat' };

      const vertices = this.geom.getVertices(wBase, hBase, apex, 'flat');
      const pad = 24;
      const cw = Math.max(1, Math.ceil((wBase * 0.5 + apex + pad) * 2));
      const ch = Math.max(1, Math.ceil((hBase * 0.5 + pad) * 2));
      const halfW = cw * 0.5;
      const halfH = ch * 0.5;

      for (const colorKey in this.COLOR_MAP) {
        const pal = this.COLOR_MAP[colorKey];
        const states = [
          {
            name: 'idle',
            style: {
              bgColor: 'rgba(15, 23, 42, 0.72)',
              bgOpacity: 0.72,
              innerHighlight: { enabled: true, color: pal.prim, sharpEdgeColor: pal.edge, spread: 10, intensity: 0.55 },
              outerHighlight: { enabled: true, color: pal.prim, sharpEdgeColor: pal.prim, blur: 12, intensity: 0.40 }
            }
          },
          {
            name: 'hover',
            style: {
              bgColor: 'rgba(24, 32, 58, 0.88)',
              bgOpacity: 0.88,
              innerHighlight: { enabled: true, color: pal.prim, sharpEdgeColor: '#ffffff', spread: 14, intensity: 0.80 },
              outerHighlight: { enabled: true, color: pal.prim, sharpEdgeColor: pal.edge, blur: 18, intensity: 0.75 }
            }
          }
        ];

        for (const st of states) {
          const cacheKey = `${colorKey}_${st.name}`;
          let entry = this.buttonStamps[cacheKey];
          if (!entry || entry.canvas.width !== cw || entry.canvas.height !== ch) {
            const canvas = document.createElement('canvas');
            canvas.width = cw;
            canvas.height = ch;
            entry = { canvas, halfW, halfH };
            this.buttonStamps[cacheKey] = entry;
          }
          const ctx = entry.canvas.getContext('2d');
          ctx.clearRect(0, 0, cw, ch);
          ctx.save();
          ctx.translate(halfW, halfH);
          this.bezelRenderer.renderFrameBezel(ctx, vertices, st.style);
          ctx.restore();
        }
      }
    }

    bakeAll() {
      this.bakeTileStamps(this.tileRadius);
      this.bakeButtonStamps(this.btnParams.wBase, this.btnParams.hBase, this.btnParams.apex);
      this.dirty = false;
    }

    getTileStamp(type = 'normal') {
      if (this.dirty) this.bakeAll();
      return this.tileStamps[type] || this.tileStamps.normal || null;
    }

    getButtonStamp(colorKey = 'cyan', isHovered = false) {
      if (this.dirty) this.bakeAll();
      const stateKey = isHovered ? 'hover' : 'idle';
      const key = `${colorKey}_${stateKey}`;
      return this.buttonStamps[key] || this.buttonStamps[`cyan_${stateKey}`] || null;
    }

    getVramAllocMB() {
      let totalBytes = 0;
      for (const k in this.tileStamps) {
        const c = this.tileStamps[k]?.canvas;
        if (c) totalBytes += c.width * c.height * 4;
      }
      for (const k in this.buttonStamps) {
        const c = this.buttonStamps[k]?.canvas;
        if (c) totalBytes += c.width * c.height * 4;
      }
      return totalBytes / (1024 * 1024);
    }
  }

  const instance = new HexFrameAtlasClass();
  global.HexFrameAtlas = instance;
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Hex_Frame_Atlas', instance);
  }
})(typeof window !== 'undefined' ? window : this);
