/**
 * @fileoverview cells/font_studio/Font_Path_Union.js - Vector Boolean Path Union & TrueType Overlap Engine
 * @description Performs exact boolean polygon/bezier path union ("Remove Overlaps") on glyph strokes,
 * fusing overlapping primitives into seamless unified outlines, and patches the TrueType binary ArrayBuffer
 * with the OVERLAP_SIMPLE (0x40) flag.
 */

(function(global) {
  'use strict';

  class FontPathUnionClass {
    constructor() {
      this.initialized = false;
    }

    initPaper() {
      if (this.initialized && global.paper?.project) return true;
      if (typeof window !== 'undefined' && global.paper) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 1000;
          canvas.height = 1000;
          global.paper.setup(canvas);
          this.initialized = true;
          return true;
        } catch (e) {
          console.warn('FontPathUnion: Failed to initialize paper.js:', e);
        }
      }
      return false;
    }

    /**
     * Converts an opentype.Path into a paper.js Path / CompoundPath.
     */
    openTypeToPaper(otPath, paper) {
      if (!otPath || !otPath.commands || otPath.commands.length === 0) return null;
      const compound = new paper.CompoundPath();
      let cur = null;

      for (let i = 0; i < otPath.commands.length; i++) {
        const cmd = otPath.commands[i];
        if (cmd.type === 'M') {
          cur = new paper.Path();
          cur.moveTo(new paper.Point(cmd.x, cmd.y));
          compound.addChild(cur);
        } else if (cmd.type === 'L' && cur) {
          cur.lineTo(new paper.Point(cmd.x, cmd.y));
        } else if (cmd.type === 'C' && cur) {
          cur.cubicCurveTo(
            new paper.Point(cmd.x1, cmd.y1),
            new paper.Point(cmd.x2, cmd.y2),
            new paper.Point(cmd.x, cmd.y)
          );
        } else if (cmd.type === 'Q' && cur) {
          cur.quadraticCurveTo(
            new paper.Point(cmd.x1, cmd.y1),
            new paper.Point(cmd.x, cmd.y)
          );
        } else if (cmd.type === 'Z' && cur) {
          cur.closePath();
        }
      }
      return compound;
    }

    /**
     * Converts a paper.js Item (Path or CompoundPath) back into an opentype.Path.
     */
    paperToOpenType(item, opentype) {
      const otPath = new opentype.Path();
      if (!item) return otPath;

      const children = item.children && item.children.length > 0 ? item.children : [item];
      for (let c = 0; c < children.length; c++) {
        const p = children[c];
        const segs = p.segments;
        if (!segs || segs.length === 0) continue;

        otPath.moveTo(Math.round(segs[0].point.x), Math.round(segs[0].point.y));
        for (let i = 0; i < segs.length; i++) {
          const cur = segs[i];
          const next = segs[(i + 1) % segs.length];
          if (i === segs.length - 1 && !p.closed) break;

          const hOut = cur.handleOut;
          const hIn = next.handleIn;
          const isCurve = (hOut && !hOut.isZero()) || (hIn && !hIn.isZero());

          if (isCurve) {
            const cp1x = cur.point.x + (hOut ? hOut.x : 0);
            const cp1y = cur.point.y + (hOut ? hOut.y : 0);
            const cp2x = next.point.x + (hIn ? hIn.x : 0);
            const cp2y = next.point.y + (hIn ? hIn.y : 0);
            otPath.curveTo(
              Math.round(cp1x), Math.round(cp1y),
              Math.round(cp2x), Math.round(cp2y),
              Math.round(next.point.x), Math.round(next.point.y)
            );
          } else {
            otPath.lineTo(Math.round(next.point.x), Math.round(next.point.y));
          }
        }
        if (p.closed) otPath.close();
      }
      return otPath;
    }

    /**
     * Unites multiple stroke opentype.Paths into a single seamless outline without internal overlaps.
     */
    uniteOpenTypePaths(otPaths, opentype) {
      if (!otPaths || otPaths.length === 0) return new opentype.Path();
      if (otPaths.length === 1 || !this.initPaper()) {
        const combined = new opentype.Path();
        for (let i = 0; i < otPaths.length; i++) {
          combined.commands.push(...otPaths[i].commands);
        }
        return combined;
      }

      const paper = global.paper;
      let accumulator = this.openTypeToPaper(otPaths[0], paper);

      for (let i = 1; i < otPaths.length; i++) {
        const nextItem = this.openTypeToPaper(otPaths[i], paper);
        if (!nextItem) continue;
        if (!accumulator) {
          accumulator = nextItem;
          continue;
        }

        try {
          const united = accumulator.unite(nextItem);
          accumulator.remove();
          nextItem.remove();
          accumulator = united;
        } catch (err) {
          console.warn('FontPathUnion: Path unite error on stroke', i, err);
        }
      }

      const result = this.paperToOpenType(accumulator, opentype);
      if (accumulator) accumulator.remove();
      if (paper.project?.activeLayer) paper.project.activeLayer.removeChildren();
      return result;
    }

    /**
     * Patches the compiled TrueType binary buffer with OVERLAP_SIMPLE (bit 6 = 0x40).
     */
    applyOverlapSimpleFlag(buffer) {
      if (!buffer || buffer.byteLength < 64) return buffer;
      try {
        const view = new DataView(buffer);
        const numTables = view.getUint16(4);
        let headOffset = 0, locaOffset = 0, glyfOffset = 0, maxpOffset = 0;

        for (let i = 0; i < numTables; i++) {
          const rec = 12 + i * 16;
          const tag = String.fromCharCode(
            view.getUint8(rec), view.getUint8(rec + 1),
            view.getUint8(rec + 2), view.getUint8(rec + 3)
          );
          const offset = view.getUint32(rec + 8);
          if (tag === 'head') headOffset = offset;
          else if (tag === 'loca') locaOffset = offset;
          else if (tag === 'glyf') glyfOffset = offset;
          else if (tag === 'maxp') maxpOffset = offset;
        }

        if (!headOffset || !locaOffset || !glyfOffset || !maxpOffset) return buffer;

        const isShort = view.getInt16(headOffset + 50) === 0;
        const numGlyphs = view.getUint16(maxpOffset + 4);

        for (let i = 0; i < numGlyphs; i++) {
          const startOffset = isShort
            ? view.getUint16(locaOffset + i * 2) * 2
            : view.getUint32(locaOffset + i * 4);
          const endOffset = isShort
            ? view.getUint16(locaOffset + (i + 1) * 2) * 2
            : view.getUint32(locaOffset + (i + 1) * 4);
          const glyphLen = endOffset - startOffset;

          if (glyphLen > 10) {
            const gOffset = glyfOffset + startOffset;
            const numContours = view.getInt16(gOffset);
            if (numContours > 0) {
              const instLenOffset = gOffset + 10 + numContours * 2;
              if (instLenOffset + 2 <= gOffset + glyphLen) {
                const instLen = view.getUint16(instLenOffset);
                const firstFlagOffset = instLenOffset + 2 + instLen;
                if (firstFlagOffset < gOffset + glyphLen) {
                  const flag0 = view.getUint8(firstFlagOffset);
                  view.setUint8(firstFlagOffset, flag0 | 0x40);
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('FontPathUnion: Error applying OVERLAP_SIMPLE flag:', err);
      }
      return buffer;
    }
  }

  const instance = new FontPathUnionClass();
  global.FontPathUnion = instance;
  if (global.ROLL_CALL?.set) global.ROLL_CALL.set('Font_Path_Union', instance);
})(typeof window !== 'undefined' ? window : this);
