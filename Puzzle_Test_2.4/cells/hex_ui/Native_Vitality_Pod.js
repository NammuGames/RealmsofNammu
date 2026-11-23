/**
 * @fileoverview cells/hex_ui/Native_Vitality_Pod.js - Vitality & Inventory Bottom HUD Pod
 * @description Manages the bottom flat-top hex pod containing:
 * 1. 12 HP Vitality Slots (Pointy hexes with damage/heal pending animations & Last Breath warning)
 * 2. 12 Component Bag Slots (Pointy hex sockets displaying miniature rotating 3D polyhedra)
 */

(function(global) {
  'use strict';

  function drawPointyHex(ctx, cx, cy, radius) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const angle = -Math.PI * 0.5 + (k * Math.PI) / 3;
      const vx = cx + radius * Math.cos(angle);
      const vy = cy + radius * Math.sin(angle);
      if (k === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
  }

  const COMP_SLOT_PAL = {
    red:    { f: 'rgba(236, 14, 14, 0.16)', o: 'rgba(236, 14, 14, 0.35)', i: '#f87171' },
    blue:   { f: 'rgba(0, 64, 255, 0.16)',  o: 'rgba(0, 64, 255, 0.35)',  i: '#38bdf8' },
    yellow: { f: 'rgba(255, 221, 87, 0.16)', o: 'rgba(255, 221, 87, 0.35)', i: '#fde047' },
    purple: { f: 'rgba(168, 85, 247, 0.16)', o: 'rgba(168, 85, 247, 0.45)', i: '#c084fc' }
  };

  class NativeVitalityPodClass {
    constructor() {
      this.engine = null;
      this.botPodNode = null;
      this.hpNode = null;
      this.compNode = null;
      this.viewWidth = 0;
      this.viewHeight = 0;

      // Data Model
      this.hp = 10;
      this.maxHp = 12;
      this.pendingDamage = 3;
      this.pendingHeal = 0;
      this.componentsBag = ['blue', 'red', 'yellow', 'purple', 'orange', 'green', 'blue', 'red', null, null, null, null];

      // Configurable Parameters (Synchronized with NativeStatPod)
      this.config = {
        podEdgeY: 42,
        podHeight: 72,
        podApex: 22,
        botPodWidth: 872,
        hpCompScale: 1.5,
        hpCompOffset: 224,
        hpCompY: 0
      };

      // Permanent spawn-time seeds
      this.hpSeeds = Array.from({ length: 12 }, () => ({ phase: Math.random(), tilt: Math.random() }));
      this.bagSeeds = Array.from({ length: 12 }, () => ({ phase: Math.random(), tilt: Math.random() }));
    }

    get isLastBreath() {
      const netDmg = Math.max(0, this.pendingDamage - (this.pendingHeal || 0));
      return netDmg > 0 && netDmg >= this.hp && this.hp > 0;
    }

    setPodConfig(updates = {}) {
      Object.assign(this.config, updates);
      if (this.botPodNode) {
        this.botPodNode.setDimensions(this.config.botPodWidth, this.config.podHeight, this.config.podApex, 'flat');
        this.botPodNode.invalidateCache();
      }
      this.updateHpCompLayout();
      if (this.viewWidth && this.viewHeight) {
        this.resize(this.viewWidth, this.viewHeight);
      }
    }

    init(engine) {
      this.engine = engine;
      const HexNode = global.HexNode;
      if (!HexNode) return false;

      const self = this;
      const cfg = this.config;

      // BOTTOM STAT POD (HP Bar & Inventory)
      this.botPodNode = new HexNode({
        id: 'native-bot-stat-pod', wBase: cfg.botPodWidth, hBase: cfg.podHeight, apex: cfg.podApex, orientation: 'flat', clipContent: false,
        style: {
          bgColor: 'rgba(7, 12, 24, 0.93)', bgOpacity: 1.0,
          innerHighlight: { enabled: true, color: '#10f000', sharpEdgeColor: '#10f000', spread: 8, intensity: 0.80, lineWidth: 1.4, steps: 3 },
          outerHighlight: { enabled: false, color: '#a855f7', sharpEdgeColor: '#a855f7', blur: 18, intensity: 0.35, steps: 3 }
        }
      });
      this.botPodNode.isSidebarButton = true;
      this.botPodNode.cacheBezel = true;

      // Build Bottom Pod: HP Slots Node
      this.hpNode = new HexNode({
        id: 'pod-hp-enclosure', position: { x: -cfg.hpCompOffset, y: cfg.hpCompY },
        wBase: Math.round(270 * cfg.hpCompScale), hBase: Math.round(34 * cfg.hpCompScale), apex: Math.round(10 * cfg.hpCompScale),
        orientation: 'flat',
        style: {
          bgColor: 'rgba(11, 17, 32, 1.0)', bgOpacity: 1.0,
          innerHighlight: { enabled: true, color: '#953ffd', sharpEdgeColor: '#953ffd', spread: 10, intensity: 0.65, lineWidth: 1.5 },
          outerHighlight: { enabled: true, color: '#7c3aed', sharpEdgeColor: '#953ffd', blur: 14, intensity: 0.35 }
        }
      });

      this.hpNode.addTrait({
        name: 'hp-slots-render',
        render(ctx) {
          const time = (global.COSMOS_STATE?.time || performance.now() * 0.001);
          const polyRender = global.PolyhedronRenderer;
          const s = self.config.hpCompScale || 1.0;
          const startX = -121.0 * s, slotPitch = 22.0 * s, R = 9.0 * s;
          const compSize = 7.5 * s;
          const hp = self.hp, dmg = self.pendingDamage, heal = self.pendingHeal || 0;
          const net = heal - dmg; // >0: heal in lead (brown), <0: damage in lead (grey)
          const netCount = Math.abs(net);
          const isLB = self.isLastBreath;

          if (self.hpNode?.style) {
            const lbPulse = isLB ? (0.5 + 0.5 * Math.sin(time * 3.5)) : 0;
            self.hpNode.style.innerHighlight.color = isLB ? '#ef4444' : '#953ffd';
            self.hpNode.style.innerHighlight.sharpEdgeColor = isLB ? '#fca5a5' : '#953ffd';
            self.hpNode.style.outerHighlight.color = isLB ? '#dc2626' : '#7c3aed';
            self.hpNode.style.outerHighlight.sharpEdgeColor = isLB ? '#ef4444' : '#953ffd';
            self.hpNode.style.outerHighlight.intensity = isLB ? (0.35 + 0.25 * lbPulse) : 0.35;
          }

          const cState = global.COSMOS_STATE || {};
          const backBgOp = cState.tileBgOpacity ?? 0.40;
          const backBorderOp = cState.tileBorderOpacity ?? 0.80;

          const hpBatch = [];
          for (let i = 0; i < 12; i++) {
            const sx = startX + i * slotPitch, sy = 0, hasHp = (i < hp), isPending = (i < netCount);

            // 1. Base socket fill & stroke (healthy emerald green if not pending)
            drawPointyHex(ctx, sx, sy, R);
            if (hasHp && !isPending) {
              ctx.fillStyle = 'rgba(16, 185, 129, 0.16)'; ctx.fill();
              ctx.strokeStyle = '#10b981'; ctx.lineWidth = 1.3 * s; ctx.stroke();
            } else {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'; ctx.fill();
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'; ctx.lineWidth = 1.0 * s; ctx.stroke();
            }

            if (hasHp) {
              hpBatch.push({ cx: sx, cy: sy, radius: compSize, colorName: 'green', customAlpha: 1.0, seedPhase: self.hpSeeds[i].phase, seedTilt: self.hpSeeds[i].tilt });
            }
          }

          // 2. Render 3D Polyhedra batch underneath the pending overlay (Vitality Green Cuboctahedron)
          if (hpBatch.length > 0 && polyRender) {
            if (typeof polyRender.drawBatch === 'function') polyRender.drawBatch(ctx, hpBatch, time);
            else hpBatch.forEach(it => polyRender.drawComponent(ctx, it.cx, it.cy, it.radius, it.colorName, time, false, false, 1.0, it.seedPhase, it.seedTilt));
          }

          // 3. Render Pending Back-Tile Layered ON TOP (0.40 fill / 0.80 inner & 1-step outer border)
          for (let i = 0; i < netCount && i < 12; i++) {
            const sx = startX + i * slotPitch, sy = 0;
            const pulse = 0.5 + 0.5 * Math.sin(time * 2.2 - i * 0.50);
            const pBg = Math.min(1.0, backBgOp * (0.75 + 0.50 * pulse)), pBorder = Math.min(1.0, backBorderOp * (0.75 + 0.50 * pulse)), isDmg = net < 0;
            // 1-Step Outer Border: Feral green (#0abd0d) for PH, Silver (#cbd5e1) for PD
            drawPointyHex(ctx, sx, sy, R + 1.8 * s);
            ctx.strokeStyle = isDmg ? `rgba(203, 213, 225, ${pBorder})` : `rgba(10, 189, 13, ${pBorder})`;
            ctx.lineWidth = 1.2 * s; ctx.stroke();
            // Back-Tile Fill & Inner Border: Grey (#64748b / #94a3b8) for PD, Feral brown (#a66a26) for PH
            drawPointyHex(ctx, sx, sy, R);
            ctx.fillStyle = isDmg ? `rgba(100, 116, 139, ${pBg})` : `rgba(166, 106, 38, ${pBg})`; ctx.fill();
            ctx.strokeStyle = isDmg ? `rgba(148, 163, 184, ${pBorder})` : `rgba(166, 106, 38, ${pBorder})`;
            ctx.lineWidth = 1.8 * s; ctx.stroke();
          }
        }
      });
      this.botPodNode.addChild(this.hpNode);

      // Build Bottom Pod: Inventory Node
      this.compNode = new HexNode({
        id: 'pod-comp-enclosure', position: { x: cfg.hpCompOffset, y: cfg.hpCompY },
        wBase: Math.round(270 * cfg.hpCompScale), hBase: Math.round(34 * cfg.hpCompScale), apex: Math.round(10 * cfg.hpCompScale),
        orientation: 'flat',
        style: {
          bgColor: 'rgba(11, 17, 32, 1.0)', bgOpacity: 1.0,
          innerHighlight: { enabled: true, color: '#3d6eff', sharpEdgeColor: '#3d6eff', spread: 10, intensity: 0.65, lineWidth: 1.5 },
          outerHighlight: { enabled: true, color: '#0284c7', sharpEdgeColor: '#3d6eff', blur: 14, intensity: 0.35 }
        }
      });
      this.compNode.cacheBezel = true;

      this.compNode.addTrait({
        name: 'comp-slots-render',
        render(ctx) {
          const time = (global.COSMOS_STATE?.time || performance.now() * 0.001);
          const polyRender = global.PolyhedronRenderer;
          const s = self.config.hpCompScale || 1.0;
          const startX = -121.0 * s, slotPitch = 22.0 * s, R = 9.0 * s;
          const compSize = 7.5 * s;
          const bag = self.componentsBag || [];

          const compBatch = [];
          for (let i = 0; i < 12; i++) {
            const sx = startX + i * slotPitch, sy = 0, comp = (i < bag.length) ? bag[i] : null;
            const compColor = (typeof comp === 'object' && comp) ? comp.color : comp;
            let enchColor = null;
            if (typeof comp === 'object' && comp) {
              if (comp.burned || comp.enchantment === 'burn') enchColor = 'red';
              else if (comp.phased || comp.enchantment === 'phase') enchColor = 'blue';
              else if (comp.woven || comp.enchantment === 'weave') enchColor = 'yellow';
              else if (comp.fortified || comp.enchantment === 'fortify') enchColor = 'purple';
            }

            drawPointyHex(ctx, sx, sy, R);
            if (enchColor) {
              const pal = COMP_SLOT_PAL[enchColor];
              ctx.fillStyle = pal.f; ctx.fill();
              ctx.strokeStyle = pal.o; ctx.lineWidth = 3.2 * s; ctx.stroke();
              ctx.strokeStyle = pal.i; ctx.lineWidth = 1.2 * s; ctx.stroke();
            } else {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'; ctx.fill();
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'; ctx.lineWidth = 1.0 * s; ctx.stroke();
            }

            if (compColor) {
              compBatch.push({ cx: sx, cy: sy, radius: compSize, colorName: compColor, customAlpha: 0.95, seedPhase: self.bagSeeds[i].phase, seedTilt: self.bagSeeds[i].tilt });
            }
          }
          if (compBatch.length > 0 && polyRender) {
            if (typeof polyRender.drawBatch === 'function') polyRender.drawBatch(ctx, compBatch, time);
            else compBatch.forEach(it => polyRender.drawComponent(ctx, it.cx, it.cy, it.radius, it.colorName, time, false, false, 0.95, it.seedPhase, it.seedTilt));
          }
        }
      });
      this.botPodNode.addChild(this.compNode);

      // Center-bottom hotkey badge ('V') at the same height from the lower edge as sidebar buttons
      this.botPodNode.addTrait({
        name: 'pod-hotkey-render',
        render(ctx, node) {
          if (!global.UIButtonSprites?.drawCornerHotkey) return;
          const cState = global.COSMOS_STATE || {};
          const btnScale = cState.sidebarBtnScale ?? 1.0;
          const btnH = (cState.btnHeight ?? 124) * btnScale;
          const hkY = (cState.hotkeyY ?? (global.UIButtonSprites.config?.hotkeyY ?? 48)) * btnScale;
          const distFromEdge = (btnH * 0.5) - hkY;
          const podH = self.config.podHeight || 72;
          const ky = (podH * 0.5) - distFromEdge;
          const btnTrait = node?.getTrait('button');
          const isHovered = btnTrait ? (btnTrait.state === 'hovered' || btnTrait.state === 'pressed') : false;
          global.UIButtonSprites.drawCornerHotkey(ctx, 'V', false, '#ffffff', isHovered, node, 0, ky);
        }
      });

      const traits = global.HexTraits;
      if (traits?.ButtonTrait) {
        const onPodClick = () => {
          if (global.StatCanvas) {
            global.StatCanvas.toggle();
          }
        };
        const bindPod = (parentPod, node) => {
          if (!node) return;
          const isParent = (node === parentPod);
          if (isParent) node.isSidebarButton = true;
          const trait = new traits.ButtonTrait({ hoverOutline: false, onClick: onPodClick });
          if (!isParent) {
            const origDown = trait.handlePointerDown.bind(trait);
            trait.handlePointerDown = () => { origDown(); const p = parentPod.getTrait('button'); if (p) p.state = 'pressed'; };
            const origUp = trait.handlePointerUp.bind(trait);
            trait.handlePointerUp = (inside, isTouch = false) => { origUp(inside, isTouch); const p = parentPod.getTrait('button'); if (p) p.state = (inside && !isTouch) ? 'hovered' : 'idle'; };
            trait.onHover = (h) => { const p = parentPod.getTrait('button'); if (p) p.state = h ? 'hovered' : 'idle'; };
          }
          node.addTrait(trait);
          if (node.children) node.children.forEach(c => bindPod(parentPod, c));
        };
        bindPod(this.botPodNode, this.botPodNode);
      }

      if (this.engine?.setBottomPod) {
        this.engine.setBottomPod(this.botPodNode);
      } else if (this.engine?.root) {
        this.engine.root.addChild(this.botPodNode);
      }

      const initW = this.engine?.viewWidth || (typeof window !== 'undefined' ? window.innerWidth : 0);
      const initH = this.engine?.viewHeight || (typeof window !== 'undefined' ? window.innerHeight : 0);
      if (initW && initH) {
        this.resize(initW, initH);
      }

      return true;
    }

    updateHpCompLayout() {
      const cfg = this.config;
      const s = cfg.hpCompScale || 1.0;
      const barW = Math.round(270 * s);
      const barH = Math.round(34 * s);
      const barApex = Math.round(10 * s);

      if (this.hpNode) {
        this.hpNode.setDimensions(barW, barH, barApex, 'flat');
        this.hpNode.position.x = -cfg.hpCompOffset;
        this.hpNode.position.y = cfg.hpCompY;
        this.hpNode.invalidateCache();
      }
      if (this.compNode) {
        this.compNode.setDimensions(barW, barH, barApex, 'flat');
        this.compNode.position.x = +cfg.hpCompOffset;
        this.compNode.position.y = cfg.hpCompY;
        this.compNode.invalidateCache();
      }
    }

    setHp(current, pendingDamage = this.pendingDamage, pendingHeal = this.pendingHeal) {
      this.hp = Math.max(0, Math.min(this.maxHp, current));
      this.pendingDamage = Math.max(0, pendingDamage);
      this.pendingHeal = Math.max(0, pendingHeal);
    }
    setPendingDamage(dmg) { this.pendingDamage = Math.max(0, dmg); }
    setPendingHeal(heal) { this.pendingHeal = Math.max(0, heal); }
    setComponents(bag) {
      if (Array.isArray(bag)) {
        this.componentsBag = bag.slice(0, 12);
        while (this.componentsBag.length < 12) this.componentsBag.push(null);
      }
    }

    resize(viewWidth, viewHeight) {
      this.viewWidth = viewWidth;
      this.viewHeight = viewHeight;
      const cfg = this.config;
      if (this.botPodNode) {
        this.botPodNode.position.x = viewWidth * 0.5;
        this.botPodNode.position.y = viewHeight - cfg.podEdgeY;
      }
      this.updateHpCompLayout();
    }

    getHpSubPodCenter() {
      const bot = this.botPodNode;
      const hp = this.hpNode;
      if (hp?.worldMatrix) return { x: hp.worldMatrix[4], y: hp.worldMatrix[5] };
      const botX = bot ? bot.position.x : ((this.viewWidth || (typeof window !== 'undefined' ? window.innerWidth : 1920)) * 0.5);
      const botY = bot ? bot.position.y : ((this.viewHeight || (typeof window !== 'undefined' ? window.innerHeight : 1080)) - (this.config?.podEdgeY || 42));
      const hpX = hp?.position?.x ?? -(this.config?.hpCompOffset || 0);
      const hpY = hp?.position?.y ?? (this.config?.hpCompY || 0);
      return { x: botX + hpX, y: botY + hpY };
    }
  }

  const vitalityPodInstance = new NativeVitalityPodClass();
  global.NativeVitalityPod = vitalityPodInstance;
  if (global.ROLL_CALL && typeof global.ROLL_CALL.set === 'function') {
    global.ROLL_CALL.set('Native_Vitality_Pod', vitalityPodInstance);
  }

})(typeof window !== 'undefined' ? window : this);
