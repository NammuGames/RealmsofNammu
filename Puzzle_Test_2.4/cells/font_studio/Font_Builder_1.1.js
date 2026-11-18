/**
 * @fileoverview cells/font_studio/Font_Builder_1.1.js - OpenType Compilation, Download & Live Font Injection
 * @description Implements buildFont, getFontBuffer, downloadOTF, and applyLiveToGame on
 * FontBuilderClass.prototype.
 */

(function(global) {
  'use strict';

  const FontBuilderClass = global.FontBuilderClass;
  if (!FontBuilderClass) return;

  const proto = FontBuilderClass.prototype;

  /**
   * Builds the complete opentype.Font instance with all 95 characters.
   */
  proto.buildFont = function() {
    const opentype = global.opentype;
    const data = global.FontStudioData;
    const renderer = global.FontStudioRenderer;
    if (!opentype) {
      throw new Error('opentype.js is not loaded. Please ensure script is included.');
    }
    if (!data) throw new Error('FontStudioData is not initialized.');

    const overlap = data.config?.squareOverlap || 4;
    const metrics = renderer ? renderer.getGridMetrics(48, overlap) : null;
    if (!metrics) throw new Error('Could not calculate grid metrics.');

    const glyphs = [];

    // 1. .notdef glyph & 2. Space glyph
    const notdefPath = new opentype.Path();
    notdefPath.moveTo(50, 0); notdefPath.lineTo(450, 0); notdefPath.lineTo(450, 700); notdefPath.lineTo(50, 700); notdefPath.close();
    notdefPath.moveTo(80, 30); notdefPath.lineTo(80, 670); notdefPath.lineTo(420, 670); notdefPath.lineTo(420, 30); notdefPath.close();
    glyphs.push(new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 600, path: notdefPath }));
    glyphs.push(new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 400, path: new opentype.Path() }));

    // 3. All Defined Glyphs
    const charKeys = Object.keys(data.glyphs);
    for (let i = 0; i < charKeys.length; i++) {
      const char = charKeys[i];
      const g = data.glyphs[char];
      if (!g || !g.strokes || g.strokes.length === 0) continue;

      const typo = data.getGlyphTypoMetrics(char);
      const advanceWidth = typo.isWide ? 880 : 560;

      const strokePaths = [];
      for (let sIdx = 0; sIdx < g.strokes.length; sIdx++) {
        try {
          const sp = new opentype.Path();
          this.strokeToOpenTypeContours(g.strokes[sIdx], sp, metrics, typo, this.unitsPerEm);
          if (sp.commands && sp.commands.length > 0) strokePaths.push(sp);
        } catch (err) {
          console.warn(`FontBuilder: Error compiling stroke on '${char}':`, err);
        }
      }

      // Apply Option 3 Boolean Path Union (Remove Overlaps)
      let gPath;
      if (global.FontPathUnion) {
        gPath = global.FontPathUnion.uniteOpenTypePaths(strokePaths, opentype);
      } else {
        gPath = new opentype.Path();
        strokePaths.forEach(p => gPath.commands.push(...p.commands));
      }

      glyphs.push(new opentype.Glyph({ name: `glyph_${char.charCodeAt(0)}`, unicode: char.charCodeAt(0), advanceWidth, path: gPath }));
    }

    const fontName = data.config?.name || this.fontFamily || 'SciFae Pseudo Script 1.0';
    const font = new opentype.Font({
      familyName: fontName,
      styleName: this.fontStyle,
      unitsPerEm: this.unitsPerEm,
      ascender: this.ascender,
      descender: this.descender,
      glyphs: glyphs
    });

    return font;
  };

  /**
   * Compiles font into binary ArrayBuffer with TrueType OVERLAP_SIMPLE patching.
   */
  proto.getFontBuffer = function() {
    const font = this.buildFont();
    const raw = font.toArrayBuffer();
    return global.FontPathUnion ? global.FontPathUnion.applyOverlapSimpleFlag(raw) : raw;
  };

  /**
   * Slot 1 Action: Downloads the .OTF font file with local folder picker support.
   */
  proto.downloadOTF = async function() {
    const data = global.FontStudioData;
    const fontName = data?.config?.name || 'SciFae Pseudo Script 1.0';
    const sanitized = fontName.replace(/[^a-zA-Z0-9_-]/g, '') || 'SciFaePseudoScript10';
    const fileName = `${sanitized}.otf`;
    data?.showToast?.(`⚙ Compiling ${fontName} .OTF...`);

    try {
      const buffer = this.getFontBuffer();
      const blob = new Blob([buffer], { type: 'font/opentype' });

      // Check for modern Native File System Access API (allows picking target folder)
      if (typeof window !== 'undefined' && window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'OpenType Font (.otf)',
              accept: { 'font/otf': ['.otf'], 'font/opentype': ['.otf'] }
            }]
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          data?.showToast?.(`✔ Saved ${fileName} successfully!`);
          return;
        } catch (pickerErr) {
          if (pickerErr.name === 'AbortError') return; // User cancelled
          console.info('Native file picker fallback:', pickerErr);
        }
      }

      // Standard browser download anchor fallback
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      data?.showToast?.(`✔ Downloaded ${fileName}`);
    } catch (err) {
      console.error('FontBuilder: Failed to download OTF:', err);
      data?.showToast?.('⚠ Failed to compile .OTF font');
    }
  };

  /**
   * Slot 2 Action: Live applies compiled font directly to game HUD and UI.
   */
  proto.applyLiveToGame = async function(silent = false) {
    const data = global.FontStudioData;
    const fontName = data?.config?.name || 'SciFae Pseudo Script 1.0';
    const sanitized = fontName.replace(/[^a-zA-Z0-9_-]/g, '') || 'SciFaePseudoScript10';
    if (!silent) data?.showToast?.(`🎮 Injecting "${fontName}" Live...`);

    try {
      const buffer = this.getFontBuffer();
      const blob = new Blob([buffer], { type: 'font/opentype' });
      const fontUrl = URL.createObjectURL(blob);

      // 1. Register with Document FontFace API
      if (typeof FontFace !== 'undefined' && document.fonts) {
        const fontFace = new FontFace(sanitized, buffer);
        await fontFace.load();
        document.fonts.add(fontFace);
        const fontFaceSciFae = new FontFace('Sci-Fae', buffer);
        await fontFaceSciFae.load();
        document.fonts.add(fontFaceSciFae);
      }

      // 2. Inject Dynamic CSS Style Tag
      let styleEl = document.getElementById('aetheria-live-font-style');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'aetheria-live-font-style';
        document.head.appendChild(styleEl);
      }

      styleEl.textContent = `
        @font-face {
          font-family: '${sanitized}';
          src: url('${fontUrl}') format('opentype');
          font-weight: normal;
          font-style: normal;
        }
        @font-face {
          font-family: 'Sci-Fae';
          src: url('${fontUrl}') format('opentype');
          font-weight: normal;
          font-style: normal;
        }
        :root {
          --font-orbitron: 'Sci-Fae', '${sanitized}', 'Orbitron', sans-serif !important;
        }
        .brand-title, .brand-badge, .hud-title, .metric-val, .hud-btn, .drawer-title {
          font-family: 'Sci-Fae', '${sanitized}', 'Orbitron', sans-serif !important;
        }
      `;

      // 3. Inform Canvas 2D scene graph
      global.ACTIVE_FONT_FAMILY = `'Sci-Fae', '${sanitized}', 'Orbitron', sans-serif`;
      this.isApplied = true;

      if (!silent) data?.showToast?.(`✔ In-Game Font Set to "${fontName}"!`);
    } catch (err) {
      console.error('FontBuilder: Failed to apply live font:', err);
      if (!silent) data?.showToast?.('⚠ Failed to apply live font');
    }
  };

  if (global.ROLL_CALL?.set) global.ROLL_CALL.set('Font_Builder_1.1', global.FontBuilder);
})(typeof window !== 'undefined' ? window : this);
