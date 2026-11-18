/**
 * @fileoverview cells/hex_ui/Stat_Canvas_1.1.js - Player Stat Leaderboard Canvas (Pod & Bar Builders)
 * @description Header pod, double-high player HP/inventory pods, and measured stat-pair hex layouts.
 */

(function(global) {
  'use strict';

  const StatCanvasClass = global.StatCanvasClass;
  if (!StatCanvasClass) return;

  const { fontSciFae, getMeasCtx, drawSlotHex, COMP_SLOT_PAL } = StatCanvasClass._gfx;
  const proto = StatCanvasClass.prototype;

  proto.createHeaderStatPod = function(g) {
    const HexNode = global.HexNode;
    const spCfg = global.NativeStatPod?.config || {};
    const cfg = this.config;

    const podNode = new HexNode({
      id: 'stat-canvas-header-pod',
      wBase: cfg.headerPodWidth,
      hBase: cfg.headerPodHeight,
      apex: cfg.headerPodApex,
      orientation: 'flat',
      style: {
        bgColor: 'rgba(7, 12, 24, 0.93)', bgOpacity: 1.0,
        innerHighlight: { enabled: true, color: '#10f000', sharpEdgeColor: '#10f000', spread: 8, intensity: 0.80, steps: 3 },
        outerHighlight: { enabled: false }
      }
    });

    const endVal = g.isEndless ? '∞' : (g.maxRounds || g.totalRounds || 12).toString();
    const defs = [
      { key: 'turn', label: 'Turn', val: `P${g.currentPlayerId || 1}` },
      { key: 'round', label: 'Round', val: (g.round || 1).toString() },
      { key: 'end', label: 'End', val: endVal }
    ];

    const sHeight = spCfg.statHeight ?? 44, sApex = spCfg.statApex ?? 14;
    const sValW = spCfg.statValWidth ?? 72, sTextSize = spCfg.statTextSize ?? 30;
    this.layoutStatPairs(podNode, defs, sHeight, sApex, sValW, sTextSize, 0, cfg.headerPairsSpacing);
    return podNode;
  };

  proto.createPlayerDoublePod = function(player, playerIndex) {
    const HexNode = global.HexNode;
    const seeds = this.playerSeeds[playerIndex % this.playerSeeds.length];
    const spCfg = global.NativeStatPod?.config || {};
    const cfg = this.config;

    const podNode = new HexNode({
      id: `stat-canvas-player-pod-${player.id}`, wBase: cfg.playerPodWidth, hBase: cfg.playerPodHeight, apex: cfg.playerPodApex, orientation: 'flat',
      style: {
        bgColor: 'rgba(7, 12, 24, 0.93)', bgOpacity: 1.0,
        innerHighlight: { enabled: true, color: '#10f000', sharpEdgeColor: '#10f000', spread: 8, intensity: 0.80, steps: 3 },
        outerHighlight: { enabled: false }
      }
    });
    if (this.playerSelectCallback && global.HexTraits?.ButtonTrait) {
      const cb = this.playerSelectCallback;
      podNode.addTrait(new global.HexTraits.ButtonTrait({ hoverGlowColor: '#10f000', soundClick: false, onClick: () => { this.playerSelectCallback = null; this.close(true); cb(player.id); } }));
    }

    // --- TOP ROW: 3 Stat Pairs (Player, Score, Average) ---
    const statDefs = [
      { key: 'player', label: 'Player', val: player.id.toString() },
      { key: 'score', label: 'Score', val: player.score.toString() },
      { key: 'ave', label: 'Average', val: (typeof player.average === 'number' ? (player.average >= 100 ? Math.round(player.average) : Number(player.average.toFixed(player.average >= 10 ? 1 : 2))) : player.average).toString() }
    ];
    const sHeight = spCfg.statHeight ?? 44, sApex = spCfg.statApex ?? 14;
    const sValW = spCfg.statValWidth ?? 72, sTextSize = spCfg.statTextSize ?? 30;
    const row1Y = -cfg.playerRowSpacing * 0.5, row2Y = cfg.playerRowSpacing * 0.5;

    this.layoutStatPairs(podNode, statDefs, sHeight, sApex, sValW, sTextSize, row1Y, cfg.playerPairsSpacing);

    // --- BOTTOM ROW: HP Bar (left) and Inventory Bar (right) ---
    const scale = spCfg.hpCompScale ?? 1.5;
    const barW = Math.round(270 * scale), barH = Math.round(34 * scale), barApex = Math.round(10 * scale);
    const hpX = -cfg.hpCompSpacing * 0.5, compX = cfg.hpCompSpacing * 0.5;

    // 1. HP Bar
    const hpNode = new HexNode({
      id: `player-hp-${player.id}`, position: { x: hpX, y: row2Y },
      wBase: barW, hBase: barH, apex: barApex, orientation: 'flat',
      style: {
        bgColor: 'rgba(11, 17, 32, 1.0)', bgOpacity: 1.0,
        innerHighlight: { enabled: true, color: '#953ffd', sharpEdgeColor: '#953ffd', spread: 8, intensity: 0.65, lineWidth: 1.4 },
        outerHighlight: { enabled: false }
      }
    });

    hpNode.addTrait({
      name: 'hp-render',
      render(ctx) {
        const time = (global.COSMOS_STATE?.time || performance.now() * 0.001);
        const polyRender = global.PolyhedronRenderer;
        const s = scale;
        const startX = -121.0 * s, slotPitch = 22.0 * s, R = 9.0 * s, compSize = 7.5 * s;
        const hp = player.hp, dmg = player.pendingDamage || 0, heal = player.pendingHeal || 0;
        const net = heal - dmg, netCount = Math.abs(net);
        const backBgOp = 0.40, backBorderOp = 0.80;

        for (let i = 0; i < 12; i++) {
          const sx = startX + i * slotPitch, sy = 0, hasHp = (i < hp), isPending = (i < netCount);

          // 1. Base socket fill & stroke (healthy green if not pending)
          drawSlotHex(ctx, sx, sy, R, (hasHp && !isPending) ? 'rgba(16, 185, 129, 0.16)' : 'rgba(255, 255, 255, 0.03)', (hasHp && !isPending) ? '#10b981' : 'rgba(255, 255, 255, 0.14)', (hasHp && !isPending) ? 1.3 * s : 1.0 * s);

          // 2. Render 3D Polyhedron underneath the pending overlay
          if (hasHp && polyRender?.drawComponent) {
            polyRender.drawComponent(ctx, sx, sy, compSize, 'green', time, false, false, 1.0, seeds.hpSeeds[i].phase, seeds.hpSeeds[i].tilt);
          }

          // 3. Render Pending Back-Tile Layered ON TOP (0.40 fill / 0.80 inner & 1-step outer border)
          if (isPending) {
            const pulse = 0.5 + 0.5 * Math.sin(time * 2.2 - i * 0.50);
            const pBg = Math.min(1.0, backBgOp * (0.75 + 0.50 * pulse)), pBorder = Math.min(1.0, backBorderOp * (0.75 + 0.50 * pulse)), isDmg = net < 0;
            // 1-Step Outer Border: Feral green (#0abd0d) for PH, Silver (#cbd5e1) for PD
            drawSlotHex(ctx, sx, sy, R + 1.8 * s, null, isDmg ? `rgba(203, 213, 225, ${pBorder})` : `rgba(10, 189, 13, ${pBorder})`, 1.2 * s);
            // Back-Tile Fill & Inner Border: Grey (#64748b / #94a3b8) for PD, Feral brown (#a66a26) for PH
            drawSlotHex(ctx, sx, sy, R, isDmg ? `rgba(100, 116, 139, ${pBg})` : `rgba(166, 106, 38, ${pBg})`, isDmg ? `rgba(148, 163, 184, ${pBorder})` : `rgba(166, 106, 38, ${pBorder})`, 1.8 * s);
          }
        }
      }
    });
    hpNode.inert = true;
    podNode.addChild(hpNode);

    // 2. Inventory Bar
    const compNode = new HexNode({
      id: `player-comp-${player.id}`, position: { x: compX, y: row2Y },
      wBase: barW, hBase: barH, apex: barApex, orientation: 'flat',
      style: {
        bgColor: 'rgba(11, 17, 32, 1.0)', bgOpacity: 1.0,
        innerHighlight: { enabled: true, color: '#3d6eff', sharpEdgeColor: '#3d6eff', spread: 8, intensity: 0.65, lineWidth: 1.4 },
        outerHighlight: { enabled: false }
      }
    });

    compNode.addTrait({
      name: 'comp-render',
      render(ctx) {
        const time = (global.COSMOS_STATE?.time || performance.now() * 0.001);
        const polyRender = global.PolyhedronRenderer;
        const s = scale;
        const startX = -121.0 * s, slotPitch = 22.0 * s, R = 9.0 * s, compSize = 7.5 * s;
        const bag = player.componentsBag || [];

        for (let i = 0; i < 12; i++) {
          const sx = startX + i * slotPitch, sy = 0, comp = (i < bag.length) ? bag[i] : null;
          const compColor = (typeof comp === 'object' && comp) ? comp.color : comp;
          let enchColor = null;
          if (typeof comp === 'object' && comp) {
            enchColor = (comp.burned || comp.enchantment === 'burn') ? 'red'
                      : (comp.phased || comp.enchantment === 'phase') ? 'blue'
                      : (comp.woven || comp.enchantment === 'weave') ? 'yellow'
                      : (comp.fortified || comp.enchantment === 'fortify') ? 'purple' : null;
          }
          if (enchColor) {
            const pal = COMP_SLOT_PAL[enchColor];
            drawSlotHex(ctx, sx, sy, R, pal.f, pal.i, 1.2 * s);
          } else {
            drawSlotHex(ctx, sx, sy, R, 'rgba(255, 255, 255, 0.03)', 'rgba(255, 255, 255, 0.12)', 1.0 * s);
          }
          if (compColor && polyRender?.drawComponent) {
            polyRender.drawComponent(ctx, sx, sy, compSize, compColor, time, false, false, 0.95, seeds.bagSeeds[i].phase, seeds.bagSeeds[i].tilt);
          }
        }
      }
    });
    compNode.inert = true;
    podNode.addChild(compNode);

    return podNode;
  };

  proto.layoutStatPairs = function(parentPod, defs, statHeight, statApex, statValWidth, textSize, posY, gap = 10) {
    const HexNode = global.HexNode;
    const meas = getMeasCtx();
    const clearance = 4, leftPad = 8;
    const pairMetrics = [];
    let totalWidth = 0;

    defs.forEach(def => {
      let labelW = 20;
      if (meas) {
        meas.font = `400 ${textSize}px ${fontSciFae}`;
        meas.textAlign = 'left'; meas.textBaseline = 'middle';
        const metrics = meas.measureText(def.label);
        const inkW = metrics.actualBoundingBoxRight;
        labelW = Math.ceil((inkW && inkW > 0) ? inkW : metrics.width);
      }
      const rightWBase = Math.round(statValWidth / 2) * 2;
      const rightHalfSpan = rightWBase * 0.5 + statApex;
      const leftWBase = Math.round((leftPad + labelW + clearance + rightWBase * 0.5) / 2) * 2;
      const leftHalfSpan = leftWBase * 0.5 + statApex;

      const textEndX = - (leftWBase * 0.5) + leftPad + labelW;
      const dx = textEndX + clearance + rightHalfSpan;
      const pairSpan = leftHalfSpan + dx + rightHalfSpan;

      pairMetrics.push({ def, leftWBase, rightWBase, dx, leftHalfSpan, rightHalfSpan, pairSpan });
      totalWidth += pairSpan;
    });

    const fullSpan = totalWidth + (defs.length - 1) * gap;
    let curX = - fullSpan * 0.5;

    pairMetrics.forEach(m => {
      // Label Node (Fortify Purple #953ffd)
      const typeNode = new HexNode({
        id: `stat-type-${m.def.key}`, wBase: m.leftWBase, hBase: statHeight, apex: statApex, orientation: 'flat',
        position: { x: Math.round(curX + m.leftHalfSpan), y: posY },
        style: {
          bgColor: 'rgba(15, 23, 42, 1.0)', bgOpacity: 1.0,
          innerHighlight: { enabled: true, color: '#953ffd', sharpEdgeColor: '#953ffd', spread: 8, intensity: 0.65, lineWidth: 1.2, steps: 3 },
          outerHighlight: { enabled: false }
        }
      });
      typeNode.addTrait({
        name: 'type-label',
        render(ctx, node) {
          ctx.save();
          ctx.font = `400 ${textSize}px ${fontSciFae}`;
          ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
          const textStartX = - (node.dimensions.wBase * 0.5) + leftPad;
          const statTextY = global.NativeStatPod?.config?.statTextY ?? 1;
          const tY = statTextY + 0.5;
          ctx.fillStyle = '#ffffff';
          ctx.fillText(m.def.label, textStartX, tY);
          ctx.restore();
        }
      });
      typeNode.inert = true;
      parentPod.addChild(typeNode);

      // Value Node (Phase Blue #3d6eff with variables Y offset)
      const valNode = new HexNode({
        id: `stat-val-${m.def.key}`, wBase: m.rightWBase, hBase: statHeight, apex: statApex, orientation: 'flat',
        position: { x: Math.round(typeNode.position.x + m.dx), y: posY },
        style: {
          bgColor: '#0f172a', bgOpacity: 1.0,
          innerHighlight: { enabled: true, color: '#3d6eff', sharpEdgeColor: '#3d6eff', spread: 8, intensity: 0.65, lineWidth: 1.4, steps: 3 }, outerHighlight: { enabled: false }
        }
      });
      valNode.addTrait({
        name: 'val-display',
        render(ctx) {
          ctx.save(); ctx.font = `400 ${textSize}px ${fontSciFae}`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const tY = (global.NativeStatPod?.config?.statTextY ?? 1) + 1.5;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; ctx.fillText(m.def.val, 0.5, tY + 0.5);
          ctx.fillStyle = '#ffffff'; ctx.fillText(m.def.val, 0, tY);
          ctx.restore();
        }
      });
      valNode.inert = true;
      parentPod.addChild(valNode);

      curX += m.pairSpan + gap;
    });
  };

  global.ROLL_CALL?.set?.('Stat_Canvas_1.1', global.StatCanvas);
})(typeof window !== 'undefined' ? window : this);
