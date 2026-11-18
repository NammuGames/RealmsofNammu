/**
 * @fileoverview cells/hex_ui/Component_Canvas.js - Component Canvas Laboratory
 * @description Dedicated canvas overlay displaying all polyhedral components in both
 * Placed and Unplaced states, complete with live 3D rotation, socket glow, and specs.
 */

(function(global) {
  'use strict';

  const COMPONENTS_DATA = [
    { key: 'red',     name: 'Fire',       model: 'Dodecahedron',    faces: '12 Pentagons', verts: 20, color: '#ec0e0e', seedPhase: Math.random(), seedTilt: Math.random() },
    { key: 'blue',    name: 'Water',      model: 'Icosahedron',     faces: '20 Triangles', verts: 12, color: '#0040ff', seedPhase: Math.random(), seedTilt: Math.random() },
    { key: 'yellow',  name: 'Air',        model: 'Octahedron',      faces: '8 Triangles',  verts: 6,  color: '#ffdd57', seedPhase: Math.random(), seedTilt: Math.random() },
    { key: 'purple',  name: 'Stone',      model: 'Hexahedron',      faces: '6 Squares',    verts: 8,  color: '#5900b3', seedPhase: Math.random(), seedTilt: Math.random() },
    { key: 'orange',  name: 'Stellated',  model: 'Stella Octangula',faces: '24 Triangles', verts: 14, color: '#ff7614', seedPhase: Math.random(), seedTilt: Math.random() },
    { key: 'green',   name: 'Cubocta',    model: 'Cuboctahedron',   faces: '14 Mixed',     verts: 12, color: '#008a02', seedPhase: Math.random(), seedTilt: Math.random() },
    { key: 'ether',   name: 'Ether',      model: 'Tetrahedron',     faces: '4 Triangles',  verts: 4,  color: '#ffffff', seedPhase: Math.random(), seedTilt: Math.random() },
    { key: 'disease', name: 'Disease',    color: '#e2e8f0', seedPhase: Math.random(), seedTilt: Math.random() }
  ];

  /**
   * Renders a 12-sided pyramid with an 80% flat front face (truncated dodecagonal token).
   * - 12 sloping lateral facets with directional crystalline lighting
   * - Flat front face at exactly 80% radius (user calibrated)
   * - Concentric coin bevel relief
   * - Dual-pass laser neon wireframe (or crisp deep black wireframe for Disease)
   * - Pointy-top (Ether): Apex directly up at 12:00 (-90°), Primary Black, Secondary White, 4 nested polyhedra
   * - Flat-top (Disease): Flat edge at 12:00 (-75°), Primary Grey, Secondary Black
   * - 100% static & flat-facing (zero 3D tilt/rotation)
   */
  function draw12SidedToken(ctx, cx, cy, radius, isPointy, primRgb, secRgb, isGhost = false, customAlpha = null, isEther = false, time = 0, ignoreScale = false) {
    const alphaBase = (customAlpha !== null && customAlpha !== undefined) ? customAlpha : (isGhost ? 0.40 : 1.0);
    const scale = (!ignoreScale && global.COSMOS_STATE?.tokenScale !== undefined) ? global.COSMOS_STATE.tokenScale : 0.88;
    const R = radius * scale;
    const rInner = R * 0.80; // 80% diameter flat front plateau

    // Orientation: Pointy-top starts at -90° (single apex pointing up at 12:00)
    // Flat-top starts at -75° (horizontal edge at 12:00)
    const baseAngle = isPointy ? (-Math.PI * 0.5) : (-Math.PI * 0.5 + Math.PI / 12);
    const step = (Math.PI * 2) / 12;

    const vOut = [];
    const vIn = [];
    for (let i = 0; i < 12; i++) {
      const a = baseAngle + i * step;
      const cosA = Math.cos(a), sinA = Math.sin(a);
      vOut.push({ x: cx + R * cosA, y: cy + R * sinA, a });
      vIn.push({ x: cx + rInner * cosA, y: cy + rInner * sinA, a });
    }

    ctx.save();

    // 1. Render 12 Sloping Lateral Facets in Primary Color with Crystalline Shading
    const [pr, pg, pb] = primRgb;
    const [sr, sg, sb] = secRgb;
    const isBlackSec = (sr === 0 && sg === 0 && sb === 0);
    const lightAngle = -Math.PI * 0.65; // Light from top-left (approx 10:30)

    for (let i = 0; i < 12; i++) {
      const next = (i + 1) % 12;
      const midA = (vOut[i].a + vOut[next].a) * 0.5;
      const delta = Math.cos(midA - lightAngle);
      const shade = delta * 0.28;

      ctx.beginPath();
      ctx.moveTo(vOut[i].x, vOut[i].y);
      ctx.lineTo(vOut[next].x, vOut[next].y);
      ctx.lineTo(vIn[next].x, vIn[next].y);
      ctx.lineTo(vIn[i].x, vIn[i].y);
      ctx.closePath();

      // Base primary body fill
      ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${0.94 * alphaBase})`;
      ctx.fill();

      // Directional light / ambient shadow pass
      if (shade > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${shade * alphaBase})`;
        ctx.fill();
        if (shade > 0.18) {
          ctx.fillStyle = `rgba(255, 255, 255, ${0.22 * alphaBase})`;
          ctx.fill();
        }
      } else {
        ctx.fillStyle = `rgba(0, 0, 0, ${(-shade * 1.1) * alphaBase})`;
        ctx.fill();
      }
    }

    // 2. Render 12-Sided Flat Front Face (80% Inner Diameter Plateau)
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      if (i === 0) ctx.moveTo(vIn[0].x, vIn[0].y);
      else ctx.lineTo(vIn[i].x, vIn[i].y);
    }
    ctx.closePath();
    const basinCr = Math.max(0, pr - 6), basinCg = Math.max(0, pg - 6), basinCb = Math.max(0, pb - 6);
    ctx.fillStyle = `rgba(${basinCr}, ${basinCg}, ${basinCb}, ${0.96 * alphaBase})`;
    ctx.fill();

    // Subtle inner coin bevel hairline at 88% of inner radius
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const bRad = rInner * 0.88;
      const bx = cx + bRad * Math.cos(vIn[i].a);
      const by = cy + bRad * Math.sin(vIn[i].a);
      if (i === 0) ctx.moveTo(bx, by);
      else ctx.lineTo(bx, by);
    }
    ctx.closePath();
    ctx.strokeStyle = isBlackSec ? `rgba(0, 0, 0, ${0.55 * alphaBase})` : `rgba(${sr}, ${sg}, ${sb}, ${0.25 * alphaBase})`;
    ctx.lineWidth = 1.0;
    ctx.stroke();

    // 2.5 Nested 4 Elemental Polyhedra for Ether Token (Fast GPU Sprite Atlas)
    if (isEther) {
      const polyRender = global.PolyhedronRenderer;
      const loopCache = polyRender?.loopCache;
      const distRatio = (global.COSMOS_STATE?.etherPolyDist !== undefined) ? global.COSMOS_STATE.etherPolyDist : 0.48;
      const sizeRatio = (global.COSMOS_STATE?.etherPolySize !== undefined) ? global.COSMOS_STATE.etherPolySize : 0.42;
      const offsetDist = rInner * distRatio;
      const miniRadius = rInner * sizeRatio;

      // Diamond arrangement aligned with pointy-top token:
      // Top: Fire (Red), Right: Air (Yellow), Bottom: Water (Blue), Left: Stone (Purple)
      const subPolyhedra = [
        { color: 'red',    angle: -Math.PI * 0.5 },
        { color: 'yellow', angle: 0 },
        { color: 'blue',   angle: Math.PI * 0.5 },
        { color: 'purple', angle: Math.PI }
      ];

      for (let sIdx = 0; sIdx < 4; sIdx++) {
        const sub = subPolyhedra[sIdx];
        const mx = cx + Math.cos(sub.angle) * offsetDist;
        const my = cy + Math.sin(sub.angle) * offsetDist;
        const alpha = (customAlpha !== null && customAlpha !== undefined) ? customAlpha : (isGhost ? 0.65 : 1.0);

        if (loopCache && loopCache.draw(ctx, mx, my, miniRadius, sub.color, time, alpha, sIdx * 0.25, 0)) {
          // Hardware-accelerated sprite atlas blit (zero CPU 3D projection overhead)
        } else if (polyRender?.models && typeof polyRender.renderProjectedPolyhedron === 'function') {
          // Fallback to software projection with corrected single-multiplier tumble speed
          const modelKey = polyRender.POLYHEDRON_MAP[sub.color] || 'octahedron';
          const model = polyRender.models[modelKey];
          if (model) {
            polyRender.renderProjectedPolyhedron(ctx, mx, my, miniRadius, model, time * 1.2, time * 1.5, 0, sub.color, 'gem', isGhost, customAlpha);
          }
        }
      }
    }

    // 3. Wireframe Pass
    const wirePath = new Path2D();
    for (let i = 0; i < 12; i++) {
      if (i === 0) wirePath.moveTo(vOut[0].x, vOut[0].y);
      else wirePath.lineTo(vOut[i].x, vOut[i].y);
    }
    wirePath.closePath();

    for (let i = 0; i < 12; i++) {
      wirePath.moveTo(vOut[i].x, vOut[i].y);
      wirePath.lineTo(vIn[i].x, vIn[i].y);
    }

    for (let i = 0; i < 12; i++) {
      if (i === 0) wirePath.moveTo(vIn[0].x, vIn[0].y);
      else wirePath.lineTo(vIn[i].x, vIn[i].y);
    }
    wirePath.closePath();

    if (isBlackSec) {
      // Crisp deep black wireframe lines and perimeter for Disease (Dual-Pass Alpha)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = radius < 30 ? 3.0 : 3.8;
      ctx.stroke(wirePath);
      ctx.strokeStyle = `rgba(0, 0, 0, ${0.92 * alphaBase})`;
      ctx.lineWidth = radius < 30 ? 1.6 : 2.0;
      ctx.stroke(wirePath);
    } else {
      // Pass 1: Outer soft neon aura (Dual-Pass Alpha, Zero Gaussian shadowBlur)
      ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, ${0.22 * alphaBase})`;
      ctx.lineWidth = radius < 30 ? 3.6 : 4.8;
      ctx.stroke(wirePath);

      // Pass 2: Mid neon beam
      ctx.strokeStyle = `rgba(${sr}, ${sg}, ${sb}, ${0.60 * alphaBase})`;
      ctx.lineWidth = radius < 30 ? 1.8 : 2.4;
      ctx.stroke(wirePath);

      // Pass 3: Inner crisp laser core
      const lr = Math.min(255, sr + 35), lg = Math.min(255, sg + 35), lb = Math.min(255, sb + 35);
      ctx.strokeStyle = `rgba(${lr}, ${lg}, ${lb}, ${0.95 * alphaBase})`;
      ctx.lineWidth = radius < 30 ? 0.8 : 1.0;
      ctx.stroke(wirePath);
    }

    ctx.restore();
  }

  let diseaseSprite = null;

  function getDiseaseSprite() {
    if (diseaseSprite) return diseaseSprite;
    if (typeof document === 'undefined') return null;
    const baseR = 64;
    const c = document.createElement('canvas');
    c.width = 144; c.height = 144;
    const sCtx = c.getContext('2d');
    draw12SidedToken(sCtx, 72, 72, baseR, false, [226, 232, 240], [0, 0, 0], false, 1.0, false, 0, true);
    diseaseSprite = c;
    return diseaseSprite;
  }

  function ensureSpecialRenderers() {
    const pr = global.PolyhedronRenderer;
    if (!pr) return;

    // Disease: Pre-rendered hardware sprite cache for 100% static, flat 12-sided token (zero per-frame vector tessellation)
    pr.drawDiseaseToken = pr.drawDiseaseRing = function(ctx, cx, cy, radius, time = 0, style = 'gem', isGhost = false, isOffBoard = false, customAlpha = null) {
      const sprite = getDiseaseSprite();
      if (!sprite) {
        draw12SidedToken(ctx, cx, cy, radius, false, [226, 232, 240], [0, 0, 0], isGhost, customAlpha, false, time);
        return;
      }
      const alpha = (customAlpha !== null && customAlpha !== undefined) ? customAlpha : (isGhost ? 0.65 : 1.0);
      const scale = (global.COSMOS_STATE?.tokenScale !== undefined) ? global.COSMOS_STATE.tokenScale : 0.88;
      const drawSize = ((radius * scale) / 64) * 144;
      if (alpha < 0.99) {
        ctx.save();
        ctx.globalAlpha = (ctx.globalAlpha || 1.0) * alpha;
        ctx.drawImage(sprite, cx - drawSize * 0.5, cy - drawSize * 0.5, drawSize, drawSize);
        ctx.restore();
      } else {
        ctx.drawImage(sprite, cx - drawSize * 0.5, cy - drawSize * 0.5, drawSize, drawSize);
      }
    };
  }
  ensureSpecialRenderers();

  class ComponentCanvasClass {
    constructor() {
      this.engine = null;
      this.containerNode = null;
      this.active = false;
      this.selectedComponent = null;
      this.time = 0;
    }

    init(engine) {
      this.engine = engine;
      ensureSpecialRenderers();
      const HexNode = global.HexNode;
      if (!HexNode) return false;

      this.containerNode = new HexNode({
        id: 'component-canvas-frame',
        wBase: 900,
        hBase: 790,
        apex: 250,
        orientation: 'flat',
        style: {
          bgColor: 'rgba(5, 10, 20, 0.88)',
          bgOpacity: 0.88,
          innerHighlight: { enabled: true, color: '#c084fc', sharpEdgeColor: '#e9d5ff', spread: 14, intensity: 0.60 },
          outerHighlight: { enabled: true, color: '#9333ea', sharpEdgeColor: '#c084fc', blur: 20, intensity: 0.45 }
        }
      });
      this.containerNode.visible = false;
      this.containerNode.onResize = () => { if (this.active) this.buildScene(); };
      return true;
    }

    isOpen() { return this.active; }

    open() {
      this.active = true;
      if (this.engine?.setStudioOverlay) this.engine.setStudioOverlay(this.containerNode);
      this.containerNode.visible = true;
      this.buildScene();
      const audio = global.AudioSynth;
      if (audio?.playClick) audio.playClick();
    }

    close() {
      this.active = false;
      if (this.containerNode) {
        this.containerNode.visible = false;
        this.containerNode.children = [];
      }
    }

    buildScene() {
      if (!this.containerNode) return;
      this.containerNode.children = [];
      const HexNode = global.HexNode;
      const traits = global.HexTraits;
      if (!HexNode || !traits) return;

      const self = this;
      const polyRender = global.PolyhedronRenderer;
      const state = global.COSMOS_STATE || { unplacedOpacity: 0.40, placedScale: 0.65 };

      // 1. Header Title Node
      const titleNode = new HexNode({
        id: 'component-title-node', position: { x: 0, y: -280 },
        wBase: 340, hBase: 34, apex: 12, orientation: 'flat',
        style: { bgColor: 'rgba(15, 23, 42, 0.90)', bgOpacity: 0.90, innerHighlight: { enabled: true, color: '#c084fc', sharpEdgeColor: '#e9d5ff', spread: 8, intensity: 0.8 } }
      });
      titleNode.addTrait(new traits.TextTrait({
        title: 'COMPONENT CANVAS',
        align: 'center', titleSize: 12, titleColor: '#c084fc'
      }));
      this.containerNode.addChild(titleNode);

      // 2. Navigation Back Button (Returns to Hub)
      const backBtn = new HexNode({
        id: 'btn-component-back-hub', position: { x: -330, y: -280 },
        wBase: 110, hBase: 34, apex: 12, orientation: 'pointy',
        style: {
          bgColor: 'rgba(15, 23, 42, 0.90)', bgOpacity: 0.90,
          innerHighlight: { enabled: true, color: '#38bdf8', sharpEdgeColor: '#bae6fd', fade: 0, spread: 0, intensity: 0.9, lineWidth: 1.5 },
          outerHighlight: { enabled: true, color: '#0284c7', blur: 14, intensity: 0.5 }
        }
      });
      backBtn.addTrait(new traits.ButtonTrait({
        hoverGlowColor: '#38bdf8',
        onClick: () => {
          self.close();
          if (global.CanvasHub) global.CanvasHub.open();
        }
      }));
      backBtn.addTrait(new traits.TextTrait({
        badge: 'ESC', title: '◄ HUB',
        align: 'center', titleSize: 10, titleColor: '#38bdf8'
      }));
      this.containerNode.addChild(backBtn);

      // 3. Render 8 Component Columns (X from -336 to +336, step 96px)
      const count = COMPONENTS_DATA.length;
      const startX = -336, stepX = 96;
      const socketR = 32;

      for (let i = 0; i < count; i++) {
        const comp = COMPONENTS_DATA[i];
        const colX = startX + i * stepX;

        // --- ROW 1: UNPLACED NODE (Top, Y = -105) ---
        const unplacedNode = new HexNode({
          id: `comp-unplaced-${comp.key}`, position: { x: colX, y: -105 },
          wBase: Math.round(Math.sqrt(3) * socketR), hBase: socketR, apex: Math.round(socketR * 0.5), orientation: 'pointy',
          style: { bgColor: 'rgba(15, 23, 42, 0.35)', bgOpacity: 0.35, outerHighlight: { enabled: true, color: comp.color, blur: 10, intensity: 0.35 } }
        });
        unplacedNode.addTrait(new traits.ButtonTrait({
          hoverGlowColor: comp.color,
          onClick: () => self.selectComponent(comp)
        }));
        unplacedNode.addTrait({
          name: 'render-unplaced',
          render(ctx) {
            const t = (global.COSMOS_STATE?.time || performance.now() * 0.001);
            if (polyRender?.drawHexSocket) {
              ctx.save();
              ctx.setLineDash([4, 4]);
              polyRender.drawHexSocket(ctx, 0, 0, socketR, comp.color, 0.35);
              ctx.restore();
            }
            if (polyRender?.drawComponent) polyRender.drawComponent(ctx, 0, 0, socketR * 0.90, comp.key, t, true, false, state.unplacedOpacity || 0.40, comp.seedPhase, comp.seedTilt);
          }
        });
        this.containerNode.addChild(unplacedNode);

        // --- MIDDLE IDENTITY BADGE (Y = 5) ---
        const idBadge = new HexNode({
          id: `comp-id-${comp.key}`, position: { x: colX, y: 5 },
          wBase: 84, hBase: 26, apex: 8, orientation: 'flat',
          style: { bgColor: 'rgba(15, 23, 42, 0.85)', bgOpacity: 0.85, innerHighlight: { enabled: true, color: comp.color, spread: 2, intensity: 0.7 } }
        });
        idBadge.addTrait(new traits.TextTrait({
          title: comp.name.toUpperCase(),
          align: 'center', titleSize: 9.5, titleColor: comp.color
        }));
        this.containerNode.addChild(idBadge);

        // --- ROW 2: PLACED NODE (Bottom, Y = 115) ---
        const placedNode = new HexNode({
          id: `comp-placed-${comp.key}`, position: { x: colX, y: 115 },
          wBase: Math.round(Math.sqrt(3) * socketR), hBase: socketR, apex: Math.round(socketR * 0.5), orientation: 'pointy',
          style: { bgColor: 'rgba(15, 23, 42, 0.50)', bgOpacity: 0.50, outerHighlight: { enabled: true, color: comp.color, blur: 14, intensity: 0.55 } }
        });
        placedNode.addTrait(new traits.ButtonTrait({
          hoverGlowColor: comp.color,
          onClick: () => self.selectComponent(comp)
        }));
        placedNode.addTrait({
          name: 'render-placed',
          render(ctx) {
            const t = (global.COSMOS_STATE?.time || performance.now() * 0.001);
            if (polyRender?.drawHexSocket) polyRender.drawHexSocket(ctx, 0, 0, socketR, comp.color, 0.60);
            if (polyRender?.drawComponent) polyRender.drawComponent(ctx, 0, 0, socketR * (state.placedScale || 0.65), comp.key, t, false, false, 1.0, comp.seedPhase, comp.seedTilt);
          }
        });
        this.containerNode.addChild(placedNode);
      }
    }

    selectComponent(comp) {
      this.selectedComponent = comp;
      const audio = global.AudioSynth;
      if (audio?.playClick) audio.playClick();
      if (this.engine?.showToast) this.engine.showToast(`Selected: ${comp.name}`);
    }
  }

  const instance = new ComponentCanvasClass();
  global.ComponentCanvas = instance;
  if (global.ROLL_CALL?.set) global.ROLL_CALL.set('Component_Canvas', instance);
})(typeof window !== 'undefined' ? window : this);
