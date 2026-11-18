/**
 * @fileoverview cells/font_studio/Font_Canvas.js - Font Canvas Overview Board with Pre-Baked Tile Stamps
 * @description First canvas entered from Canvas Hub. Features an exact copy of the game board
 * grid and tile format displaying all 95 glyphs. Utilizes high-performance pre-baked offscreen
 * tile stamps (single ctx.drawImage per tile) to eliminate frame rate drops, and mounts the 3-Slot
 * Export Deck into the right sidebar.
 */

(function(global) {
  'use strict';

  class FontCanvasClass {
    constructor() {
      this.engine = null;
      this.containerNode = null;
      this.active = false;
      this.keyHandler = null;
      this.baseTileRadius = 23;
      this.gridScale = 1.5;

      // Offscreen GPU tile stamp caches
      this.bgTileStamp = null;
      this.glyphTileBaseStamp = null;
      this.glyphTileHoverStamp = null;
      this.miniGlyphStamps = {};
      this.glyphStamps = {};
      this.dirtyStamps = true;
      this.lastBakeRadius = 0;

      // Hex tile mapping across the 13 rows of the Radius-6 board
      this.rowDefinitions = [
        // Row 0 (7 tiles): Uppercase A-G
        { tiles: 7, chars: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], startCol: 0 },
        // Row 1 (8 tiles): Uppercase H-O
        { tiles: 8, chars: ['H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'], startCol: 0 },
        // Row 2 (9 tiles): Uppercase P-X
        { tiles: 9, chars: ['P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X'], startCol: 0 },
        // Row 3 (10 tiles): Uppercase Y, Z centered
        { tiles: 10, chars: ['Y', 'Z'], startCol: 4 },
        // Row 4 (11 tiles): Lowercase a-k
        { tiles: 11, chars: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'], startCol: 0 },
        // Row 5 (12 tiles): Lowercase l-w
        { tiles: 12, chars: ['l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w'], startCol: 0 },
        // Row 6 (13 tiles, equator): Lowercase x, y, z centered
        { tiles: 13, chars: ['x', 'y', 'z'], startCol: 5 },
        // Row 7 (12 tiles): Numbers 0-9 centered
        { tiles: 12, chars: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], startCol: 1 },
        // Row 8 (11 tiles): Special characters
        { tiles: 11, chars: ['!', '?', '.', ',', '%', '&', '+', '-', '=', ':', ';'], startCol: 0 },
        // Row 9 (10 tiles): Special characters
        { tiles: 10, chars: ['<', '>', '/', '*', '@', '^', '~', '_', '(', ')'], startCol: 0 },
        // Row 10 (9 tiles): Special characters
        { tiles: 9, chars: ['[', ']', '{', '}', '|', '\\', '`', '\'', '"'], startCol: 0 },
        // Row 11 (8 tiles): Extra symbols & tags
        { tiles: 8, chars: ['#', '$', '∞', 'Ω', 'Δ', 'Σ', 'λ', '★'], startCol: 0 },
        // Row 12 (7 tiles): Bottom center tile (index 3) reserved for Copy to Clipboard
        { tiles: 7, chars: ['COPY_CLIPBOARD'], startCol: 3 }
      ];
    }

    init(engine) {
      this.engine = engine;
      const HexNode = global.HexNode;
      if (!HexNode) return false;

      // Exact same size as Canvas Hub Frame
      this.containerNode = new HexNode({
        id: 'font-canvas-frame',
        wBase: 900,
        hBase: 790,
        apex: 250,
        orientation: 'flat',
        style: {
          bgColor: 'rgba(5, 10, 20, 0.90)',
          bgOpacity: 0.90,
          innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#c084fc', spread: 16, intensity: 0.65 },
          outerHighlight: { enabled: true, color: '#0284c7', sharpEdgeColor: '#38bdf8', blur: 24, intensity: 0.50 }
        }
      });
      this.containerNode.visible = false;
      this.containerNode.onResize = () => { if (this.active) this.buildScene(); };

      // Invalidate stamps whenever font data changes
      if (global.FontStudioData?.onChange) {
        global.FontStudioData.onChange(() => {
          this.dirtyStamps = true;
          if (this.active) this.bakeTileStamps();
        });
      }

      return true;
    }

    isOpen() { return this.active; }

    open() {
      this.active = true;
      if (global.CanvasHub?.isOpen() && !global.CanvasHub.active) global.CanvasHub.close();
      if (global.GlyphCanvas?.isOpen()) global.GlyphCanvas.close();

      if (this.engine?.setStudioOverlay) this.engine.setStudioOverlay(this.containerNode);
      this.containerNode.visible = true;

      // Sync display scale from Tuning Drawer config
      if (global.UICardsDeck?.config?.fontGridScale !== undefined) {
        this.gridScale = global.UICardsDeck.config.fontGridScale;
      }

      // Mount the 3-Slot Export Column directly in the right sidebar
      if (global.FontStudioDeck?.mountExportDeck) {
        global.FontStudioDeck.mountExportDeck(this.engine?.rightSidebar);
      }

      if (this.engine?.bottomPod) {
        this._prevPodVis = this.engine.bottomPod.visible;
        this.engine.bottomPod.visible = false;
      }

      this.buildScene();
      this.bindKeyboard();

      const audio = global.AudioSynth;
      if (audio?.playClick) audio.playClick();
    }

    close() {
      this.active = false;
      this.unbindKeyboard();

      if (global.FontStudioDeck?.unmount) {
        global.FontStudioDeck.unmount();
      }

      if (this.engine?.bottomPod && this._prevPodVis !== undefined) {
        this.engine.bottomPod.visible = this._prevPodVis;
      }
      if (this.containerNode) {
        this.containerNode.visible = false;
        this.containerNode.children = [];
      }
    }

    bindKeyboard() {
      if (this.keyHandler) return;
      this.keyHandler = (e) => {
        if (!this.active) return;
        if (e.key === 'Escape' || e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          this.close();
          if (global.CanvasHub) global.CanvasHub.open();
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
          e.preventDefault();
          if (global.FontStudioData) global.FontStudioData.copyToClipboard();
        }
      };
      window.addEventListener('keydown', this.keyHandler);
    }

    unbindKeyboard() {
      if (this.keyHandler) {
        window.removeEventListener('keydown', this.keyHandler);
        this.keyHandler = null;
      }
    }

    setGridScale(scale) {
      this.gridScale = Math.max(0.5, Math.min(2.0, scale));
      this.dirtyStamps = true;
      if (this.active) this.buildScene();
    }

    openGlyphCanvas(charKey) {
      this.close();
      if (global.FontStudioData) global.FontStudioData.selectGlyph(charKey);
      if (global.GlyphCanvas) global.GlyphCanvas.open(charKey);
    }

    // ========================================================================
    // PRE-BAKED OFFSCREEN TILE STAMP ATLAS (Fixes Grid Canvas 60 FPS Drop)
    // ========================================================================
    bakeTileStamps() {
      const geom = global.HexFrameGeometry;
      const bezel = global.HexBezelRenderer;
      const data = global.FontStudioData;
      const renderer = global.FontStudioRenderer;
      if (!geom || !bezel || !data || typeof document === 'undefined') return;

      const tileRadius = this.baseTileRadius * (this.gridScale || 1.0);
      const wBase = tileRadius * Math.sqrt(3);
      const hBase = tileRadius;
      const apex = tileRadius * 0.5;
      const vertices = geom.getVertices(wBase, hBase, apex, 'pointy');

      const pad = 18;
      const cw = Math.max(1, Math.ceil((wBase * 0.5 + apex + pad) * 2));
      const ch = Math.max(1, Math.ceil((hBase * 0.5 + apex + pad) * 2));
      const halfW = cw * 0.5;
      const halfH = ch * 0.5;

      // 1. Bake Background Tile Stamp (Empty Hex)
      if (!this.bgTileStamp || this.lastBakeRadius !== tileRadius) {
        const bgCanvas = document.createElement('canvas');
        bgCanvas.width = cw; bgCanvas.height = ch;
        const bgCtx = bgCanvas.getContext('2d');
        bgCtx.translate(halfW, halfH);
        bezel.renderFrameBezel(bgCtx, vertices, {
          bgColor: 'rgba(15, 23, 42, 0.35)',
          bgOpacity: 0.35,
          innerHighlight: { enabled: true, color: 'rgba(56, 189, 248, 0.15)', spread: 2, intensity: 0.3 }
        });
        this.bgTileStamp = { canvas: bgCanvas, halfW, halfH };
      }

      // 2. Bake Glyph Tile Base Idle Stamp
      if (!this.glyphTileBaseStamp || this.lastBakeRadius !== tileRadius) {
        const baseCanvas = document.createElement('canvas');
        baseCanvas.width = cw; baseCanvas.height = ch;
        const bCtx = baseCanvas.getContext('2d');
        bCtx.translate(halfW, halfH);
        bezel.renderFrameBezel(bCtx, vertices, {
          bgColor: 'rgba(15, 23, 42, 0.82)',
          bgOpacity: 0.82,
          innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#bae6fd', spread: 4, intensity: 0.70 },
          outerHighlight: { enabled: true, color: '#0284c7', blur: 8, intensity: 0.40 }
        });
        this.glyphTileBaseStamp = { canvas: baseCanvas, halfW, halfH };
      }

      // 3. Bake Glyph Tile Hover Stamp
      if (!this.glyphTileHoverStamp || this.lastBakeRadius !== tileRadius) {
        const hovCanvas = document.createElement('canvas');
        hovCanvas.width = cw; hovCanvas.height = ch;
        const hCtx = hovCanvas.getContext('2d');
        hCtx.translate(halfW, halfH);
        bezel.renderFrameBezel(hCtx, vertices, {
          bgColor: 'rgba(24, 38, 70, 0.92)',
          bgOpacity: 0.92,
          innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#ffffff', spread: 8, intensity: 0.95 },
          outerHighlight: { enabled: true, color: '#38bdf8', blur: 14, intensity: 0.75 }
        });
        this.glyphTileHoverStamp = { canvas: hovCanvas, halfW, halfH };
      }

      this.lastBakeRadius = tileRadius;

      // 4. Pre-bake all 95 Glyph mini stamps and combined idle stamps
      const miniSize = Math.max(18, Math.round(tileRadius * 1.1));
      const mPad = 12;
      const mcw = miniSize + mPad * 2;
      const mch = miniSize + mPad * 2;
      const mHalfW = mcw * 0.5;
      const mHalfH = mch * 0.5;

      for (let rIdx = 0; rIdx < this.rowDefinitions.length; rIdx++) {
        const chars = this.rowDefinitions[rIdx].chars;
        for (let cIdx = 0; cIdx < chars.length; cIdx++) {
          const charKey = chars[cIdx];
          if (!charKey || charKey === 'COPY_CLIPBOARD') continue;

          // Mini Glyph Stamp
          const miniCanvas = document.createElement('canvas');
          miniCanvas.width = mcw; miniCanvas.height = mch;
          const mCtx = miniCanvas.getContext('2d');
          const g = data.getGlyph(charKey);

          if (g && g.strokes?.length > 0 && renderer?.renderGlyphMini) {
            renderer.renderGlyphMini(mCtx, g, mHalfW, mHalfH, miniSize, '#38bdf8');
          } else {
            mCtx.save();
            mCtx.font = `700 ${Math.round(tileRadius * 0.6)}px Orbitron, sans-serif`;
            mCtx.fillStyle = '#f8fafc';
            mCtx.textAlign = 'center';
            mCtx.textBaseline = 'middle';
            mCtx.fillText(charKey, mHalfW, mHalfH);
            mCtx.restore();
          }
          this.miniGlyphStamps[charKey] = { canvas: miniCanvas, halfW: mHalfW, halfH: mHalfH };

          // Combined Idle Tile Stamp (Tile Bezel + Mini Glyph = 1 GPU Texture Blit!)
          const combCanvas = document.createElement('canvas');
          combCanvas.width = cw; combCanvas.height = ch;
          const combCtx = combCanvas.getContext('2d');
          combCtx.drawImage(this.glyphTileBaseStamp.canvas, 0, 0);
          combCtx.drawImage(miniCanvas, halfW - mHalfW, halfH - mHalfH);
          this.glyphStamps[charKey] = { canvas: combCanvas, halfW, halfH };
        }
      }

      this.dirtyStamps = false;
    }

    buildScene() {
      if (!this.containerNode) return;
      this.containerNode.children = [];

      const HexNode = global.HexNode;
      const traits = global.HexTraits;
      const data = global.FontStudioData;
      if (!HexNode || !traits || !data) return;

      // Ensure stamps are baked for current scale
      this.bakeTileStamps();

      const self = this;
      const tileRadius = this.baseTileRadius * (this.gridScale || 1.0);
      const stepDist = tileRadius * Math.sqrt(3);
      const rowStepY = stepDist * (Math.sqrt(3) * 0.5);

      // 13 Rows centered vertically (from y = -6 * rowStepY to +6 * rowStepY)
      for (let rIdx = 0; rIdx < this.rowDefinitions.length; rIdx++) {
        const rowDef = this.rowDefinitions[rIdx];
        const rowTiles = rowDef.tiles;
        const K = 6 - rIdx;
        const py = -K * rowStepY;

        for (let tIdx = 0; tIdx < rowTiles; tIdx++) {
          const px = (tIdx - (rowTiles - 1) * 0.5) * stepDist;
          const charIndex = tIdx - rowDef.startCol;
          const charKey = (charIndex >= 0 && charIndex < rowDef.chars.length) ? rowDef.chars[charIndex] : null;

          if (!charKey) {
            // Background Empty Tile: Rendered with single GPU drawImage stamp
            const bgTile = new HexNode({
              id: `board-bg-${rIdx}-${tIdx}`,
              position: { x: px, y: py },
              wBase: tileRadius * Math.sqrt(3),
              hBase: tileRadius,
              apex: tileRadius * 0.5,
              orientation: 'pointy',
              clipContent: false,
              style: { bgOpacity: 0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
            });
            bgTile.addTrait({
              name: 'bg-tile-stamp',
              render(ctx) {
                if (self.bgTileStamp) {
                  ctx.drawImage(self.bgTileStamp.canvas, -self.bgTileStamp.halfW, -self.bgTileStamp.halfH);
                }
              }
            });
            this.containerNode.addChild(bgTile);
            continue;
          }

          if (charKey === 'COPY_CLIPBOARD') {
            // Row 12 Center: Shorthand Copy Button
            const copyTile = new HexNode({
              id: 'btn-font-copy-tile',
              position: { x: px, y: py },
              wBase: tileRadius * Math.sqrt(3) * 1.5,
              hBase: tileRadius * 1.3,
              apex: tileRadius * 0.6,
              orientation: 'pointy',
              cacheBezel: true,
              style: {
                bgColor: 'rgba(74, 222, 128, 0.20)',
                bgOpacity: 0.85,
                innerHighlight: { enabled: true, color: '#4ade80', sharpEdgeColor: '#bbf7d0', spread: 6, intensity: 0.9 },
                outerHighlight: { enabled: true, color: '#16a34a', blur: 14, intensity: 0.6 }
              }
            });
            copyTile.addTrait(new traits.ButtonTrait({
              hoverGlowColor: '#4ade80',
              onClick: () => data.copyToClipboard()
            }));
            copyTile.addTrait(new traits.TextTrait({
              badge: 'EXPORT',
              title: '📋 COPY',
              subtitle: 'Shorthand',
              align: 'center',
              titleSize: 10,
              subtitleSize: 7,
              titleColor: '#4ade80'
            }));
            this.containerNode.addChild(copyTile);
            continue;
          }

          // Active Character Tile Button: 1 drawImage per tile when idle!
          const glyphTile = new HexNode({
            id: `font-glyph-tile-${charKey}`,
            position: { x: px, y: py },
            wBase: tileRadius * Math.sqrt(3),
            hBase: tileRadius,
            apex: tileRadius * 0.5,
            orientation: 'pointy',
            clipContent: false,
            style: { bgOpacity: 0, innerHighlight: { enabled: false }, outerHighlight: { enabled: false } }
          });

          const btnTrait = new traits.ButtonTrait({
            hoverGlowColor: '#38bdf8',
            onClick: () => self.openGlyphCanvas(charKey)
          });
          glyphTile.addTrait(btnTrait);

          glyphTile.addTrait({
            name: 'render-stamped-tile',
            render(ctx, node) {
              const isHov = btnTrait.state === 'hovered' || btnTrait.state === 'pressed';
              if (isHov) {
                if (self.glyphTileHoverStamp) {
                  ctx.drawImage(self.glyphTileHoverStamp.canvas, -self.glyphTileHoverStamp.halfW, -self.glyphTileHoverStamp.halfH);
                }
                const mini = self.miniGlyphStamps[charKey];
                if (mini) ctx.drawImage(mini.canvas, -mini.halfW, -mini.halfH);
              } else {
                const stamp = self.glyphStamps[charKey];
                if (stamp) ctx.drawImage(stamp.canvas, -stamp.halfW, -stamp.halfH);
              }
            }
          });

          this.containerNode.addChild(glyphTile);
        }
      }
    }
  }

  const instance = new FontCanvasClass();
  global.FontCanvas = instance;
  if (global.ROLL_CALL?.set) global.ROLL_CALL.set('Font_Canvas', instance);
})(typeof window !== 'undefined' ? window : this);
