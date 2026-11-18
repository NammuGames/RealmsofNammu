/**
 * @fileoverview cells/hex_ui/Game_Settings_Canvas_1.3.js - Native HexNode Pod Factories
 * @description Part 1.3 of the multi-part Game Settings Canvas system.
 * Attaches the native HexNode pod factory methods (Header, Base Button, Preview,
 * Preset Name, Full Stepper, and Half Stepper pods) to GameSettingsCanvasClass prototype.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const Proto = global.GameSettingsCanvasClass
    ? global.GameSettingsCanvasClass.prototype
    : (global.GameSettingsCanvas ? Object.getPrototypeOf(global.GameSettingsCanvas) : null);
  if (!Proto) return;

  Proto.createHeaderPod = function(titleText, canGoBack) {
    const HexNode = global.HexNode, traits = global.HexTraits, d = this.dims, cfg = this.subPodConfig || {};
    const header = new HexNode({
      id: 'menu-column-header', wBase: d.headerW, hBase: d.headerH, apex: d.headerApex, orientation: 'flat',
      style: {
        bgColor: 'rgba(7, 12, 24, 0.93)', bgOpacity: 1.0,
        innerHighlight: { enabled: true, color: '#10f000', sharpEdgeColor: '#10f000', spread: 8, intensity: 0.80, steps: 3 }
      }
    });
    const hSize = cfg.headerTextSize ?? 42, hY = cfg.headerTextY ?? 2;
    header.addTrait({
      name: 'header-title-render',
      render(ctx) {
        ctx.save();
        ctx.font = `400 ${hSize}px "Sci-Fae", "SciFaePseudoScript10", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; ctx.fillText(titleText, 0.5, hY + 0.5);
        ctx.fillStyle = '#ffffff'; ctx.fillText(titleText, 0, hY);
        ctx.restore();
      }
    });
    return header;
  };

  // ── 1. BASE COLUMN & ACTION BUTTON POD ──────────────────────────────────
  Proto.createBaseButtonPod = function(item) {
    const HexNode = global.HexNode, traits = global.HexTraits, d = this.dims, cfg = this.subPodConfig || {};
    const col = item.color || '#10f000';
    const isDoubleBorder = !!item.isDoubleBorder;
    const isInteractive = !item.isReadOnly && (typeof item.onClick === 'function');
    const pod = new HexNode({
      id: `pod-base-${item.id}`, wBase: d.podW, hBase: d.podH, apex: d.podApex, orientation: 'flat',
      style: {
        bgColor: isDoubleBorder ? 'rgba(8, 30, 24, 0.95)' : 'rgba(7, 12, 24, 0.93)', bgOpacity: 1.0,
        innerHighlight: { enabled: true, color: col, sharpEdgeColor: col, spread: 8, intensity: 0.80, steps: 3 },
        outerHighlight: { enabled: isDoubleBorder, color: col, sharpEdgeColor: col, blur: 8, intensity: 0.80, steps: 3 }
      }
    });
    if (isInteractive) {
      pod.isSidebarButton = true;
      pod.addTrait(new traits.ButtonTrait({ onClick: item.onClick }));
    }
    const bSize = (item.id === 'fused-preset-name-btn') ? (cfg.presetNameBtnTextSize ?? 52) : (cfg.baseBtnTextSize ?? 44);
    const bY = cfg.baseBtnTextY ?? 3;
    const hasUnderline = !!item.underline || (item.id === 'fused-preset-name-btn');
    pod.addTrait({
      name: 'base-title-render',
      render(ctx) {
        ctx.save();
        ctx.font = `400 ${bSize}px "Sci-Fae", "SciFaePseudoScript10", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (hasUnderline) {
          const tw = ctx.measureText(item.title).width;
          const halfW = tw * 0.5 + 6, lineY = bY + Math.round(bSize * 0.44);
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
          ctx.beginPath(); ctx.moveTo(-halfW, lineY + 1); ctx.lineTo(halfW, lineY + 1); ctx.stroke();
          ctx.strokeStyle = col;
          ctx.beginPath(); ctx.moveTo(-halfW, lineY); ctx.lineTo(halfW, lineY); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; ctx.fillText(item.title, 0.5, bY + 0.5);
        ctx.fillStyle = '#ffffff'; ctx.fillText(item.title, 0, bY);
        ctx.restore();
      }
    });
    return pod;
  };

  // ── 2. PREVIEW BUTTON POD (2 ROWS: PURPLE TITLE SUB-POD + BLUE STAT BADGES) ─
  Proto.createPreviewPod = function(item) {
    const HexNode = global.HexNode, traits = global.HexTraits, d = this.dims, cfg = this.subPodConfig || {};
    const col = '#10f000', isDoubleBorder = !!item.isDoubleBorder;
    const pod = new HexNode({
      id: `pod-prev-${item.id}`, wBase: d.podW, hBase: d.podH, apex: d.podApex, orientation: 'flat',
      style: {
        bgColor: isDoubleBorder ? 'rgba(8, 30, 24, 0.95)' : 'rgba(7, 12, 24, 0.93)', bgOpacity: 1.0,
        innerHighlight: { enabled: true, color: col, sharpEdgeColor: col, spread: 8, intensity: 0.80, steps: 3 },
        outerHighlight: { enabled: isDoubleBorder, color: col, sharpEdgeColor: col, blur: 8, intensity: 0.80, steps: 3 }
      }
    });
    pod.isSidebarButton = true;
    const onActivate = () => { if (typeof item.onClick === 'function') item.onClick(); };
    pod.addTrait(new traits.ButtonTrait({ onClick: onActivate }));

    // Row 1: Large Main Title Sub-Pod (Lock/Fortify Purple #953ffd, inert)
    const r1Y = cfg.prevRow1Y ?? -30, tW = cfg.prevTitleW ?? 760, tH = cfg.prevTitleH ?? 50, tApex = cfg.prevTitleApex ?? 16;
    const titlePod = new HexNode({
      id: `sub-title-${item.id}`, position: { x: 0, y: r1Y }, wBase: tW, hBase: tH, apex: tApex, orientation: 'flat', inert: true,
      style: {
        bgColor: 'rgba(15, 23, 42, 1.0)', bgOpacity: 1.0,
        innerHighlight: { enabled: true, color: '#953ffd', sharpEdgeColor: '#953ffd', spread: 6, intensity: 0.70, steps: 3 }
      }
    });
    const tSize = cfg.prevTitleTextSize ?? 24, tTextY = cfg.prevTitleTextY ?? 1;
    titlePod.addTrait({
      name: 'prev-title-render',
      render(ctx) {
        ctx.save(); ctx.font = `400 ${tSize}px "Sci-Fae", "SciFaePseudoScript10", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; ctx.fillText(item.title, 0.5, tTextY + 0.5);
        ctx.fillStyle = '#ffffff'; ctx.fillText(item.title, 0, tTextY); ctx.restore();
      }
    });
    pod.addChild(titlePod);

    // Row 2: Self-Centering Overlapping Sub-Pod Badges (Phase Blue #3d6eff, inert)
    const badges = item.badges || [], count = badges.length;
    const bW = cfg.prevBadgeW ?? 110, bH = cfg.prevBadgeH ?? 36, bApex = cfg.prevBadgeApex ?? 12;
    const bSpacing = cfg.prevBadgeSpacing ?? 54, bSize = cfg.prevBadgeTextSize ?? 24, bTextY = cfg.prevBadgeTextY ?? 2;
    const r2Y = cfg.prevRow2Y ?? 30;
    if (count > 0) {
      const maxRowW = d.podW, bTotalW = bW + 2 * bApex, naturalPitch = bTotalW + bSpacing;
      const pitch = (count > 1 && (count - 1) * naturalPitch + bTotalW > maxRowW) ? (maxRowW - bTotalW) / (count - 1) : naturalPitch;
      const startX = -((count - 1) * pitch) * 0.5;

      // Render reverse order (count - 1 down to 0) so left overlaps right!
      for (let idx = count - 1; idx >= 0; idx--) {
        const bText = badges[idx];
        const badge = new HexNode({
          id: `badge-${item.id}-${idx}`, position: { x: startX + idx * pitch, y: r2Y },
          wBase: bW, hBase: bH, apex: bApex, orientation: 'flat', inert: true,
          style: { bgColor: 'rgba(15, 23, 42, 1.0)', bgOpacity: 1.0, innerHighlight: { enabled: true, color: '#3d6eff', sharpEdgeColor: '#3d6eff', spread: 6, intensity: 0.70, steps: 3 } }
        });
        badge.addTrait({
          name: 'badge-text-render',
          render(ctx) {
            ctx.save(); ctx.font = `400 ${bSize}px "Sci-Fae", "SciFaePseudoScript10", sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; ctx.fillText(bText, 0.5, bTextY + 0.5);
            ctx.fillStyle = '#ffffff'; ctx.fillText(bText, 0, bTextY); ctx.restore();
          }
        });
        pod.addChild(badge);
      }
    }
    return pod;
  };

  // ── 3. PRESET NAME BUTTON POD (1 ROW: PURPLE LEFT + BLUE RIGHT SUB-POD) ─
  Proto.createPresetNamePod = function(item) {
    const HexNode = global.HexNode, traits = global.HexTraits, d = this.dims, cfg = this.subPodConfig || {};
    const col = item.color || '#10f000';
    const isRed = (col === '#ff3333');
    const isDouble = !isRed && !!item.isDoubleBorder;
    const pod = new HexNode({
      id: `pod-preset-${item.id}`, wBase: d.podW, hBase: d.podH, apex: d.podApex, orientation: 'flat',
      style: {
        bgColor: isDouble ? 'rgba(28, 18, 8, 0.95)' : 'rgba(7, 12, 24, 0.93)', bgOpacity: 1.0,
        innerHighlight: { enabled: true, color: col, sharpEdgeColor: col, spread: 8, intensity: 0.80, steps: 3 },
        outerHighlight: { enabled: isDouble, color: col, sharpEdgeColor: col, blur: 8, intensity: 0.85, steps: 3 }
      }
    });
    pod.isSidebarButton = true;
    const onActivate = () => { if (typeof item.onClick === 'function') item.onClick(); };
    pod.addTrait(new traits.ButtonTrait({ onClick: onActivate, hoverGlowColor: col }));

    const rowY = cfg.presetRowY ?? 0, pH = cfg.presetHeight ?? 62, pApex = cfg.presetApex ?? 18;
    const nameW = cfg.presetNameW ?? 530, tagW = cfg.presetTagW ?? 230, gap = cfg.presetSpacing ?? 48;
    const totalSpan = nameW + gap + tagW;
    const leftX = -totalSpan * 0.5 + nameW * 0.5;
    const rightX = totalSpan * 0.5 - tagW * 0.5;
    const nameSize = cfg.presetNameTextSize ?? 32, nameTextY = cfg.presetNameTextY ?? 2;
    const tagSize = cfg.presetTagTextSize ?? 32, tagTextY = cfg.presetTagTextY ?? 2;

    // Left Sub-Pod: Custom / Assigned Name (Lock/Fortify Purple #953ffd, inert)
    const leftPod = new HexNode({
      id: `sub-name-${item.id}`, position: { x: leftX, y: rowY }, wBase: nameW, hBase: pH, apex: pApex, orientation: 'flat', inert: true,
      style: { bgColor: 'rgba(15, 23, 42, 1.0)', bgOpacity: 1.0, innerHighlight: { enabled: true, color: isRed ? '#ff3333' : '#953ffd', sharpEdgeColor: isRed ? '#ff3333' : '#953ffd', spread: 6, intensity: 0.70, steps: 3 } }
    });
    leftPod.addTrait({
      name: 'sub-name-render',
      render(ctx) {
        ctx.save(); ctx.font = `400 ${nameSize}px "Sci-Fae", "SciFaePseudoScript10", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const titleText = item.title || 'Preset 1';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; ctx.fillText(titleText, 0.5, nameTextY + 0.5);
        ctx.fillStyle = '#ffffff'; ctx.fillText(titleText, 0, nameTextY); ctx.restore();
      }
    });
    pod.addChild(leftPod);

    // Right Sub-Pod: Indexed Category Tag (Phase Blue #3d6eff, inert)
    const rightPod = new HexNode({
      id: `sub-idx-${item.id}`, position: { x: rightX, y: rowY }, wBase: tagW, hBase: pH, apex: pApex, orientation: 'flat', inert: true,
      style: { bgColor: 'rgba(15, 23, 42, 1.0)', bgOpacity: 1.0, innerHighlight: { enabled: true, color: isRed ? '#ff3333' : '#3d6eff', sharpEdgeColor: isRed ? '#ff3333' : '#3d6eff', spread: 6, intensity: 0.75, steps: 3 } }
    });
    rightPod.addTrait({
      name: 'sub-idx-render',
      render(ctx) {
        ctx.save(); ctx.font = `400 ${tagSize}px "Sci-Fae", "SciFaePseudoScript10", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; ctx.fillText(item.categoryIndexText || 'Preset 001', 0.5, tagTextY + 0.5);
        ctx.fillStyle = '#ffffff'; ctx.fillText(item.categoryIndexText || 'Preset 001', 0, tagTextY); ctx.restore();
      }
    });
    pod.addChild(rightPod);

    return pod;
  };

  // ── 4. FULL STEPPER POD (PURPLE CENTER READOUT + 4 BLUE FLANKING BUTTONS) ─
  Proto.createFullStepperPod = function(item, isDoubleLine = false, isHalf = false) {
    const HexNode = global.HexNode, traits = global.HexTraits, d = this.dims, cfg = this.subPodConfig || {};
    const col = item.color || '#10f000';
    const pod = new HexNode({
      id: `pod-step-${item.id}`, wBase: d.podW, hBase: d.podH, apex: d.podApex, orientation: 'flat',
      style: { bgColor: 'rgba(7, 12, 24, 0.93)', bgOpacity: 1.0, innerHighlight: { enabled: true, color: col, sharpEdgeColor: col, spread: 8, intensity: 0.80, steps: 3 } }
    });

    // Center Sub-Pod: Parameter Value Display
    const cW = cfg.stepCenterW ?? (isDoubleLine ? 340 : 300), cH = isDoubleLine ? (cfg.stepDoubleH ?? 88) : (cfg.stepCenterH ?? 72);
    const cApex = cfg.stepCenterApex ?? 21, cY = cfg.stepCenterRowY ?? 0, cTextY = cfg.stepCenterTextY ?? 2;
    const isCenterClickable = typeof item.onCenterClick === 'function', isLocked = !!item.isLocked;
    let centerCol = '#953ffd', centerSpread = 6, centerIntensity = 0.70, isDoubleOuter = false;
    if (isLocked) {
      centerCol = '#ff9214';
      centerSpread = 8;
      centerIntensity = 0.85;
      isDoubleOuter = true;
    } else if (isCenterClickable) {
      centerCol = '#10f000';
      centerSpread = 6;
      centerIntensity = 0.80;
      isDoubleOuter = false;
    }
    const centerPod = new HexNode({
      id: `sub-ctr-${item.id}`, position: { x: 0, y: cY }, wBase: cW, hBase: cH, apex: cApex, orientation: 'flat', ghost: !!item.isCenterGhost,
      style: {
        bgColor: 'rgba(15, 23, 42, 1.0)', bgOpacity: 1.0,
        innerHighlight: { enabled: true, color: centerCol, sharpEdgeColor: centerCol, spread: centerSpread, intensity: centerIntensity, steps: 3 },
        outerHighlight: { enabled: isDoubleOuter, color: centerCol, sharpEdgeColor: centerCol, blur: centerSpread, intensity: centerIntensity, steps: 3 }
      }
    });
    if (isCenterClickable) {
      centerPod.isSidebarButton = true;
      centerPod.addTrait(new traits.ButtonTrait({ onClick: () => { item.onCenterClick(); } }));
    } else { centerPod.inert = true; }

    if (isDoubleLine) {
      const dSize = cfg.stepDoubleValTextSize ?? cfg.stepDoubleTitleTextSize ?? 32;
      const dSpacing = cfg.stepDoubleLineSpacing ?? 29;
      const tY = -dSpacing * 0.5 + cTextY, vY = dSpacing * 0.5 + cTextY;
      centerPod.addTrait({
        name: 'step-double-render',
        render(ctx) {
          ctx.save(); ctx.font = `400 ${dSize}px "Sci-Fae", "SciFaePseudoScript10", sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; ctx.fillText(item.title || '', 0.5, tY + 0.5); ctx.fillText(item.valText || '', 0.5, vY + 0.5);
          ctx.fillStyle = '#ffffff'; ctx.fillText(item.title || '', 0, tY); ctx.fillText(item.valText || '', 0, vY); ctx.restore();
        }
      });
    } else {
      const cSize = cfg.stepCenterTextSize ?? 32;
      centerPod.addTrait({
        name: 'step-val-render',
        render(ctx) {
          ctx.save(); ctx.font = `400 ${cSize}px "Sci-Fae", "SciFaePseudoScript10", sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; ctx.fillText(item.valText || '', 0.5, cTextY + 0.5);
          ctx.fillStyle = '#ffffff'; ctx.fillText(item.valText || '', 0, cTextY); ctx.restore();
        }
      });
    }
    pod.addChild(centerPod);

    // Flanking Sub-Pods: (Phase Blue #3d6eff resting, highlights Orange on hover/click)
    const btnY = cfg.stepBtnRowY ?? 0, btnW = cfg.stepBtnW ?? 72, btnH = cfg.stepBtnH ?? 72, btnApex = cfg.stepBtnApex ?? 21;
    const innerX = cfg.stepInnerX ?? 250, outerX = cfg.stepOuterX ?? 380, btnSize = cfg.stepBtnTextSize ?? 32, btnTextY = cfg.stepBtnTextY ?? 2;
    const steps = isHalf
      ? [{ label: '−1', d: -1, x: -innerX }, { label: '+1', d: 1, x: innerX }]
      : [{ label: '−12', d: -12, x: -outerX }, { label: '−1', d: -1, x: -innerX }, { label: '+1', d: 1, x: innerX }, { label: '+12', d: 12, x: outerX }];

    steps.forEach(st => {
      const btn = new HexNode({
        id: `step-${item.id}-${st.d}`, position: { x: st.x, y: btnY }, wBase: btnW, hBase: btnH, apex: btnApex, orientation: 'flat',
        style: { bgColor: 'rgba(15, 23, 42, 1.0)', bgOpacity: 1.0, innerHighlight: { enabled: true, color: '#3d6eff', sharpEdgeColor: '#3d6eff', spread: 6, intensity: 0.70, steps: 3 } }
      });
      btn.isSidebarButton = true;
      btn.addTrait(new traits.ButtonTrait({ onClick: () => { item.onDelta(st.d); } }));
      btn.addTrait({
        name: 'step-btn-render',
        render(ctx) {
          ctx.save(); ctx.font = `400 ${btnSize}px "Sci-Fae", "SciFaePseudoScript10", sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; ctx.fillText(st.label, 0.5, btnTextY + 0.5);
          ctx.fillStyle = '#ffffff'; ctx.fillText(st.label, 0, btnTextY); ctx.restore();
        }
      });
      pod.addChild(btn);
    });

    return pod;
  };

  Proto.createHalfStepperPod = function(item) {
    return this.createFullStepperPod(item, false, true);
  };

})(window);

