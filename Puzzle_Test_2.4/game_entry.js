/**
 * @fileoverview Puzzle_Test_2.4/game_entry.js - On-Demand Puzzle Module Entry Node
 * @description Exports window.GAME_ENTRIES.puzzle with its ordered Puzzle-only script list
 * and mount/unmount lifecycle hooks for Hub_Game_Loader (zero iframes, shared Cosmic_Domain_Warp).
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  global.GAME_ENTRIES = global.GAME_ENTRIES || {};

  // Scripts loaded on demand (Shared Hub core cells are already loaded by root index.html)
  const PUZZLE_SCRIPTS = [
    'cells/Hex_Bilateral_Math_1.0.js',
    'cells/Hex_Bilateral_Math_1.1.js',
    'cells/Materials_Data.js',
    'cells/Component_Ether.js',
    'cells/Component_Disease_1.0.js',
    'cells/Component_Disease_1.1.js',
    'cells/Undo_Manager.js',
    'cells/Sigil_Engine_1.0.js',
    'cells/Sigil_Engine_1.1.js',
    'cells/Sigil_Engine.js',
    'cells/Sigil_Resolver_1.0.js',
    'cells/Sigil_Resolver_1.1.js',
    'cells/Sigil_Resolver.js',
    'cells/Match_Orchestrator_1.0.js',
    'cells/Match_Orchestrator_1.1.js',
    'cells/Match_Orchestrator.js',
    'cells/Turn_Manager_1.0.js',
    'cells/Turn_Manager_1.1.js',
    'cells/Turn_Manager_1.2.js',
    'cells/Turn_Manager_1.3.js',
    'cells/Turn_Manager.js',
    'cells/Last_Breath_Manager_1.0.js',
    'cells/Last_Breath_Manager_1.1.js',
    'cells/Last_Breath_Manager.js',
    'cells/spells/Spell_Heal.js',
    'cells/spells/Spell_Fortify.js',
    'cells/spells/Spell_Phase.js',
    'cells/spells/Spell_Burn.js',
    'cells/spells/Spell_Weave.js',
    'cells/spells/Spell_Foresight.js',
    'cells/spells/Spell_Charge_1.0.js',
    'cells/spells/Spell_Charge_1.1.js',
    'cells/spells/Spell_Charge.js',
    'cells/spells/Spell_Teleport_1.0.js',
    'cells/spells/Spell_Teleport_1.1.js',
    'cells/spells/Spell_Teleport.js',
    'cells/spells/Spell_Arch.js',
    'cells/spells/Spell_Shift_1.0.js',
    'cells/spells/Spell_Shift_1.1.js',
    'cells/spells/Spell_Ritual_1.0.js',
    'cells/spells/Spell_Ritual_1.1.js',
    'cells/spells/Spell_Ritual.js',
    'cells/spells/Spell_Manifest_1.0.js',
    'cells/spells/Spell_Manifest_1.1.js',
    'cells/spells/Spell_Manifest.js',
    'cells/Spell_Manager.js',
    'cells/Piece_Placement.js',
    'cells/Game_State.js',
    'cells/Board_Ripple_Renderer_1.0.js',
    'cells/Board_Ripple_Renderer_1.1.js',
    'cells/Board_Ripple_Renderer_1.2.js',
    'cells/Board_Ripple_Detonation_FX.js',
    'cells/Board_Ripple_Renderer_1.3.js',
    'cells/Board_Ripple_Renderer_1.4.js',
    'cells/Board_Ripple_Renderer.js',
    'cells/Orbit_Particle_Renderer.js',
    'cells/Board_Renderer_1.0.js',
    'cells/Board_Renderer_1.1.js',
    'cells/Board_Renderer.js',
    'cells/Warp_Halo_Renderer.js',
    'cells/Board_Cursor_Renderer_1.0.js',
    'cells/Board_Cursor_Renderer_1.1.js',
    'cells/Board_Cursor_Renderer.js',
    'cells/Board_Overlay_Renderer_1.0.js',
    'cells/Board_Overlay_Renderer_1.1.js',
    'cells/Board_Overlay_Renderer.js',
    'cells/Board_Ghost_Renderer.js',
    'cells/Input_Controller_1.0.js',
    'cells/Input_Controller_1.1.js',
    'cells/Input_Controller.js',
    'cells/Polyhedron_Models.js',
    'cells/Polyhedron_Renderer.js',
    'cells/Polyhedron_Loop_Cache.js',
    'cells/hex_ui/Sigil_Emblem_Renderer_1.0.js',
    'cells/hex_ui/Sigil_Emblem_Renderer_1.1.js',
    'cells/hex_ui/Sigil_Emblem_Studio_1.0.js',
    'cells/hex_ui/Sigil_Emblem_Studio_1.1.js',
    'cells/hex_ui/Sigil_Emblem_Studio.js',
    'cells/hex_ui/Emblem_Tuner_HUD.js',
    'cells/hex_ui/Component_Canvas.js',
    'cells/hex_ui/Alignment_Canvas_Preview.js',
    'cells/hex_ui/Alignment_Canvas.js',
    'cells/hex_ui/Game_Settings_Canvas_1.0.js',
    'cells/hex_ui/Game_Settings_Canvas_1.1.js',
    'cells/hex_ui/Game_Settings_Vector_Columns.js',
    'cells/hex_ui/Game_Settings_Canvas_1.2.js',
    'cells/hex_ui/Game_Settings_Canvas_1.3.js',
    'cells/hex_ui/Game_Settings_Memory_Matches.js',
    'cells/hex_ui/Game_Settings_Lobby.js',
    'cells/hex_ui/Game_Settings_Pause.js',
    'cells/hex_ui/Game_Settings_Rename_Popup_1.0.js',
    'cells/hex_ui/Game_Settings_Rename_Popup_1.1.js',
    'cells/hex_ui/Game_Settings_Rename_Popup.js',
    'cells/hex_ui/Turn_Confirm_Popup_1.0.js',
    'cells/hex_ui/Turn_Confirm_Popup_1.1.js',
    'cells/hex_ui/Turn_Confirm_Popup.js',
    'cells/hex_ui/Sigil_Nook_Canvas_1.0.js',
    'cells/hex_ui/Sigil_Nook_Canvas_1.1.js',
    'cells/hex_ui/Native_Stat_Pod.js',
    'cells/hex_ui/Native_Vitality_Pod.js',
    'cells/hex_ui/Stat_Canvas_1.0.js',
    'cells/hex_ui/Stat_Canvas_1.1.js',
    'cells/hex_ui/Stat_Canvas.js',
    'cells/hex_ui/UI_Cards_Deck_1.0.js',
    'cells/hex_ui/UI_Cards_Deck_1.1.js',
    'cells/hex_ui/UI_Button_Sprites.js',
    'cells/hex_ui/UI_View_Button.js',
    'cells/hex_ui/UI_Bridge_Legacy.js',
    'cells/hex_ui/UI_Deck_Sync_1.0.js',
    'cells/hex_ui/UI_Deck_Sync_1.1.js',
    'cells/hex_ui/UI_Deck_Sync.js',
    'cells/hex_ui/UI_Sidebar_Deck_1.0.js',
    'cells/hex_ui/UI_Sidebar_Deck_1.1.js',
    'cells/hex_ui/Emblem_Palette_Lab.js',
    'cells/hex_ui/Border_Tuning_Lab_1.0.js',
    'cells/hex_ui/Border_Tuning_Lab_1.1.js',
    'cells/hex_ui/Border_Tuning_Lab.js',
    'cells/hex_ui/Menu_Tuning_Lab.js',
    'cells/hex_ui/Warp_Halo_Tuning_Lab.js',
    'cells/hex_ui/Audio_Tuning_Lab.js',
    'cells/hex_ui/Match_Start_Tuning_Lab.js',
    'cells/hex_ui/Board_Edit_Lab.js',
    'cells/hex_ui/Board_Edit_Ops.js',
    'cells/hex_ui/Board_Edit_Renderer.js',
    'https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js',
    'https://cdn.jsdelivr.net/npm/paper@0.12.18/dist/paper-core.min.js',
    'cells/font_studio/Font_Studio_Presets.js',
    'cells/font_studio/Font_Studio_Data.js',
    'cells/font_studio/Font_Studio_Renderer.js',
    'cells/font_studio/Font_Path_Union.js',
    'cells/font_studio/Font_Builder_1.0.js',
    'cells/font_studio/Font_Builder_1.1.js',
    'cells/font_studio/Font_Builder.js',
    'cells/font_studio/Font_Canvas.js',
    'cells/font_studio/Glyph_Canvas.js',
    'cells/font_studio/Font_Studio_Deck_1.0.js',
    'cells/font_studio/Font_Studio_Deck_1.1.js',
    'cells/font_studio/Font_Studio_Deck.js'
  ];

  let _puzzleMountedOnce = false;

  global.GAME_ENTRIES.puzzle = {
    id: 'puzzle',
    scripts: PUZZLE_SCRIPTS,

    mount(ctx = {}, _meta = {}, opts = {}) {
      const state = ctx.state || global.COSMOS_STATE;
      const dom = ctx.dom || {};
      const warp = ctx.warp || global.CosmicDomainWarp;
      const engine = ctx.engine || global.HexUIEngine;
      const audio = ctx.audio || global.AudioSynth;
      const cameraCtrl = ctx.cameraCtrl || global.BoardCameraController;
      const ticker = ctx.ticker || global.EngineTicker;

      if (!engine || !state) {
        console.error('[Puzzle game_entry] Missing Hub engine or state context.');
        return;
      }

      // Restore Puzzle macro frames & clear any Hub placeholder overlay
      if (engine.boardFrame) engine.boardFrame.visible = true;
      if (engine.leftSidebar) engine.leftSidebar.visible = true;
      if (engine.rightSidebar) engine.rightSidebar.visible = true;
      engine.setStudioOverlay(null);

      const polyRender = global.PolyhedronRenderer;
      const studio = global.SigilEmblemStudio;
      const compCanvas = global.ComponentCanvas;
      const alignCanvas = global.AlignmentCanvas;
      const fontCanvas = global.FontCanvas;
      const glyphCanvas = global.GlyphCanvas;
      const fontDeck = global.FontStudioDeck;
      const fontBuilder = global.FontBuilder;
      const statPod = global.NativeStatPod;
      const boardRenderer = global.BoardRenderer;
      const inputController = global.InputController;
      const deckSync = global.UIDeckSync;
      const sidebarDeck = global.UISidebarDeck;

      if (!_puzzleMountedOnce) {
        if (boardRenderer) boardRenderer.mount(engine);
        if (inputController && dom.canvasBoard) inputController.init(dom.canvasBoard);
        if (studio) studio.init(engine);
        if (compCanvas) compCanvas.init(engine);
        if (alignCanvas) alignCanvas.init(engine);
        if (fontCanvas) fontCanvas.init(engine);
        if (glyphCanvas) glyphCanvas.init(engine);
        if (fontDeck) fontDeck.init(engine, glyphCanvas);
        if (fontBuilder) {
          fontBuilder.init();
          fontBuilder.applyLiveToGame(true);
        }
        if (global.SigilNookCanvas) global.SigilNookCanvas.init(engine);
        if (statPod) statPod.init(engine);
        if (global.StatCanvas) global.StatCanvas.init(engine);
        if (deckSync) deckSync.initBridge();
        if (sidebarDeck) sidebarDeck.init(engine, state, audio);
        if (deckSync) deckSync.syncNativeStatPodWithGameState();

        if (polyRender) {
          polyRender.vibrancy = state.polyVibrancy;
          polyRender.glassiness = state.polyGlassiness;
          polyRender.edgeNeonWidth = state.polyEdgeWidth;
          polyRender.lineMultiplierEarth = state.lineMultiplierEarth;
          if (global.PolyhedronLoopCache) global.PolyhedronLoopCache.init(polyRender);
        }
        if (global.SigilEmblemRenderer) {
          global.SigilEmblemRenderer.vibrancy = state.pyramidVibrancy;
        }
        if (global.SigilResolver && global.GameState) {
          global.SigilResolver.evaluateSigils(global.GameState.board);
        }

        // Wire Puzzle-specific Tuning Labs inside the persistent HTML Tuning Drawer
        if (global.BorderTuningLab) global.BorderTuningLab.init(dom, audio);
        if (global.WarpHaloTuningLab) global.WarpHaloTuningLab.init(dom, audio);
        if (global.AudioTuningLab) global.AudioTuningLab.init(dom, audio);
        if (global.MatchStartTuningLab) global.MatchStartTuningLab.init(dom, audio);
        if (global.EmblemTunerHUD) global.EmblemTunerHUD.init();
        if (global.GameSettingsCanvas) global.GameSettingsCanvas.init(engine);

        _puzzleMountedOnce = true;
      } else {
        if (boardRenderer) boardRenderer.mount(engine);
        if (statPod?.topPodNode) {
          engine.setTopPod(statPod.topPodNode);
          statPod.topPodNode.visible = true;
        }
        if (global.NativeVitalityPod?.botPodNode) {
          engine.setBottomPod(global.NativeVitalityPod.botPodNode);
          global.NativeVitalityPod.botPodNode.visible = true;
        }
      }

      if (ticker) {
        ticker.init(state, dom, warp, engine, polyRender, cameraCtrl, sidebarDeck, deckSync);
      }

      const w = engine.viewWidth || window.innerWidth;
      const h = engine.viewHeight || window.innerHeight;
      engine.resize(w, h);
      if (global.NativeStatPod?.resize) global.NativeStatPod.resize(w, h);
      if (global.ResponsiveViewportAdapter?.applyLayoutToEngine) {
        global.ResponsiveViewportAdapter.applyLayoutToEngine(w, h);
      }
      if (global.MemoryCardManager?.hookPuzzleLifecycle) {
        global.MemoryCardManager.hookPuzzleLifecycle();
      }
      if (global.NetworkP2PManager?.hookPuzzleNetwork) {
        global.NetworkP2PManager.hookPuzzleNetwork();
      }

      if (!opts?.skipAutoMenu && global.GameSettingsCanvas) {
        global.GameSettingsCanvas.openSetupMenu('btn-nav-menu', { silent: true });
      }
      if (global.ResponsiveViewportAdapter?.syncViewport) {
        global.ResponsiveViewportAdapter.syncViewport();
      }
    },

    unmount(ctx = {}) {
      const engine = ctx.engine || global.HexUIEngine;
      const ticker = ctx.ticker || global.EngineTicker;

      if (global.GameSettingsCanvas?.isOpen?.()) global.GameSettingsCanvas.close();
      if (global.StatCanvas?.isOpen?.()) global.StatCanvas.close();
      if (global.SigilNookCanvas?.isOpen?.()) global.SigilNookCanvas.close();
      if (global.TurnConfirmPopup?.isOpen?.()) global.TurnConfirmPopup.close();

      if (engine) {
        if (engine.boardFrame) engine.boardFrame.visible = false;
        if (engine.leftSidebar) engine.leftSidebar.visible = false;
        if (engine.rightSidebar) engine.rightSidebar.visible = false;
        if (engine.topPod) engine.topPod.visible = false;
        if (engine.bottomPod) engine.bottomPod.visible = false;
        engine.boardRenderDelegate = null;
        engine.setStudioOverlay(null);
      }

      if (ticker) {
        ticker.polyRender = null;
        ticker.deck = null;
        ticker.deckSync = null;
      }
    }
  };
})(typeof window !== 'undefined' ? window : this);
