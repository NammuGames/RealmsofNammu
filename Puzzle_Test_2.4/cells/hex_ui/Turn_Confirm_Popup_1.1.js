/**
 * @fileoverview cells/hex_ui/Turn_Confirm_Popup_1.1.js - End Turn Confirmation Modal Scene Builder
 * @description Implements HexNode pop-up frame, metric pods, and overlay mounting on
 * TurnConfirmPopupClass.prototype.
 */

(function (global) {
  'use strict';

  const TurnConfirmPopupClass = global.TurnConfirmPopupClass;
  if (!TurnConfirmPopupClass) return;

  const fontSciFae = TurnConfirmPopupClass._fontSciFae;
  const proto = TurnConfirmPopupClass.prototype;

  proto.buildNode = function() {
    const HexNode = global.HexNode;
    const traits = global.HexTraits;
    if (!HexNode || !traits) return null;

    const self = this;
    const cfg = this.config;
    const isMenuPopup = !!this.options?.title;
    const frameColor = this.options?.frameColor || '#10f000';
    const burnRed = '#ff3333';

    // Pop-Up Frame: Exactly mirrors Rename pop-up (733x380 at {0,0}) for Delete, or End-Turn geometry
    const framePos = isMenuPopup ? { x: 0, y: 0 } : { x: cfg.frameX, y: cfg.frameY };
    const frameW = isMenuPopup ? 733 : cfg.frameW;
    const frameH = isMenuPopup ? 380 : cfg.frameH;
    const frameApex = isMenuPopup ? 116 : cfg.frameApex;
    const fHighlightColor = isMenuPopup ? (this.options?.frameColor || burnRed) : frameColor;

    const frame = new HexNode({
      id: 'turn-confirm-frame', position: framePos,
      wBase: frameW, hBase: frameH, apex: frameApex, orientation: 'flat',
      style: {
        bgColor: 'rgba(5, 10, 20, 0.96)', bgOpacity: 0.96,
        innerHighlight: { enabled: true, color: fHighlightColor, sharpEdgeColor: fHighlightColor, spread: 8, intensity: 0.80, steps: 3 },
        outerHighlight: { enabled: false }
      }
    });
    frame.isCustomSized = true;
    frame.offsetX = isMenuPopup ? 0 : cfg.frameX;
    frame.offsetY = isMenuPopup ? 0 : cfg.frameY;
    frame.addTrait(new traits.ButtonTrait({
      hoverGlowColor: fHighlightColor,
      onClick: () => self.confirm()
    }));

    if (isMenuPopup) {
      // Game Menu Delete confirmation: exact same sub-pod dimensions & positions as Rename pop-up
      const rCfg = global.GameSettingsRenamePopup?.config || {
        height: 100, apex: 32, rowY: 13, ySpacing: 64, topW: 740, bottomW: 180, textSize: 44, textY: 3
      };
      const pH = rCfg.height ?? 100;
      const pApex = rCfg.apex ?? 32;
      const rowY = rCfg.rowY ?? 13;
      const ySpacing = rCfg.ySpacing ?? 64;
      const topW = this.options?.topW || (rCfg.topW ?? 740);
      const bottomW = this.options?.bottomW || (rCfg.bottomW ?? 180);
      const textSize = rCfg.textSize ?? 44;
      const textY = rCfg.textY ?? 3;

      const makeDeletePod = (id, y, w, textStr) => {
        const pod = new HexNode({
          id, position: { x: 0, y }, wBase: w, hBase: pH, apex: pApex, orientation: 'flat',
          style: {
            bgColor: 'rgba(15, 23, 42, 1.0)', bgOpacity: 1.0,
            innerHighlight: { enabled: true, color: fHighlightColor, sharpEdgeColor: fHighlightColor, spread: 6, intensity: 0.80, steps: 3 }
          }
        });
        pod.inert = true;
        pod.addTrait({
          name: `${id}-render`,
          render(ctx) {
            ctx.save();
            ctx.font = `400 ${textSize}px ${fontSciFae}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
            ctx.fillText(textStr, 0.5, textY + 0.5);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(textStr, 0, textY);
            ctx.restore();
          }
        });
        return pod;
      };

      frame.addChild(makeDeletePod('delete-sub-top', rowY - ySpacing, topW, this.options?.topText || 'Are You Sure?'));
      frame.addChild(makeDeletePod('delete-sub-btm', rowY + ySpacing, bottomW, this.options?.bottomText || 'Delete'));
    } else {
      // End Turn Modal: Dynamic text prompt or 2 sub-pods
      const m = this.getTurnSummaryMetrics(global.GameState);
      const isUnplaced = !global.GameState?.placedThisTurn;
      const isZeroBonus = (m.destroyedPts === 0 && m.overflowPts === 0);

      if (isUnplaced || isZeroBonus) {
        const promptText = isUnplaced ? 'Scatter Unplaced Material' : 'Confirm End Turn?';
        frame.addTrait({
          name: 'turn-confirm-prompt',
          render(ctx) {
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `400 ${cfg.msgTextSize}px ${fontSciFae}`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(promptText, 0, cfg.msgTextY);
            ctx.restore();
          }
        });
      } else {
        const hexMath = global.HexMath;

        const drawBezelHex = (ctx, hx, hy, hr, fillCol, glowCol, bgOp, borderOp) => {
          const bz = global.HexBezelRenderer;
          if (!bz) {
            if (hexMath) hexMath.drawHexagon(ctx, hx, hy, hr, fillCol, glowCol, 2.0);
            return;
          }
          const verts = [];
          for (let k = 0; k < 6; k++) {
            const a = (Math.PI / 180) * (30 + 60 * k);
            verts.push({ x: hx + hr * Math.cos(a), y: hy + hr * Math.sin(a) });
          }
          bz.renderFrameBezel(ctx, verts, {
            bgColor: fillCol, bgOpacity: bgOp, strokeColor: glowCol, strokeOpacity: borderOp,
            innerHighlight: {
              enabled: true, color: glowCol, steps: 3, stepThickness: 2.0,
              borderOpacity: borderOp, stepDecrement: 0.25, zoom: 1.0, drawBoundaryLine: false
            }
          });
        };

        const makeMetricPod = (id, x, drawIconFn, textStr) => {
          const pod = new HexNode({
            id, position: { x, y: cfg.subPodY }, wBase: cfg.subPodW, hBase: cfg.subPodH, apex: cfg.subPodApex, orientation: 'flat',
            style: {
              bgColor: 'rgba(15, 23, 42, 1.0)', bgOpacity: 1.0,
              innerHighlight: { enabled: true, color: '#953ffd', sharpEdgeColor: '#953ffd', spread: 6, intensity: 0.80, steps: 3 }
            }
          });
          pod.inert = true;
          pod.addTrait({
            name: `${id}-render`,
            render(ctx) {
              ctx.save();
              const ix = cfg.iconX, iy = 0;
              // 1. Draw Icon
              drawIconFn(ctx, ix, iy);
              // 2. Draw text in white
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.font = `400 ${cfg.textSize}px ${fontSciFae}`;
              ctx.fillStyle = '#ffffff';
              ctx.fillText(textStr, cfg.textX, cfg.textY);
              ctx.restore();
            }
          });
          return pod;
        };

        const hexRadius = cfg.iconSize * 1.45;

        // 1. Left Pod: Orange polyhedron with Phase-Blue pulsing sandwich -> "+#"
        const leftPod = makeMetricPod(
          'turn-metric-left', -cfg.subPodSpacing * 0.5,
          (ctx, ix, iy) => {
            const pulseTime = global.BoardRenderer?.pulseTime ?? (performance.now() * 0.0025);
            const pulse = (Math.sin(pulseTime * 0.625) + 1.0) * 0.5;
            const pBg = Math.min(1.0, 0.10 + 0.34 * pulse);
            const pBorder = Math.min(1.0, 0.20 + 0.68 * pulse);

            // Back-tile (Phase-Blue pulsing)
            drawBezelHex(ctx, ix, iy, hexRadius, '#3d6eff', '#3d6eff', pBg, pBorder);
            // Middle orange polyhedron
            if (global.PolyhedronRenderer?.drawComponent) {
              global.PolyhedronRenderer.drawComponent(ctx, ix, iy, cfg.iconSize, 'orange', 0, false, false, 1.0);
            }
            // Front-tile (Phase-Blue sandwich overlay)
            drawBezelHex(ctx, ix, iy, hexRadius, '#3d6eff', '#3d6eff', pBg, pBorder);
          },
          `+${m.overflowPts}`
        );

        // 2. Right Pod: Disease token with red Burn pulsing sandwich -> "+#"
        const rightPod = makeMetricPod(
          'turn-metric-right', cfg.subPodSpacing * 0.5,
          (ctx, ix, iy) => {
            const pulseTime = global.BoardRenderer?.pulseTime ?? (performance.now() * 0.0025);
            const pulse = (Math.sin(pulseTime * 0.625) + 1.0) * 0.5;
            const pBg = Math.min(1.0, 0.10 + 0.34 * pulse);
            const pBorder = Math.min(1.0, 0.20 + 0.68 * pulse);

            // Back-tile
            drawBezelHex(ctx, ix, iy, hexRadius, '#ef4444', '#ef4444', pBg, pBorder);
            // Middle disease token
            if (global.PolyhedronRenderer?.drawComponent) {
              global.PolyhedronRenderer.drawComponent(ctx, ix, iy, cfg.iconSize, 'disease', 0, false, false, 1.0);
            }
            // Front-tile (sandwich overlay)
            drawBezelHex(ctx, ix, iy, hexRadius, '#ef4444', '#ef4444', pBg, pBorder);
          },
          `+${m.destroyedPts}`
        );

        frame.addChild(leftPod);
        frame.addChild(rightPod);
      }
    }

    this.frameNode = frame;
    frame.visible = true;
    return frame;
  };

  proto.buildScene = function() {
    const frame = this.buildNode();
    if (!frame) return;
    this.containerNode = frame;
    if (global.HexUIEngine?.setStudioOverlay) {
      global.HexUIEngine.setStudioOverlay(frame);
    }
  };

  if (global.ROLL_CALL) global.ROLL_CALL.set('Turn_Confirm_Popup_1.1', global.TurnConfirmPopup);
})(typeof window !== 'undefined' ? window : this);
