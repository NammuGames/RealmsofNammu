/**
 * @fileoverview cells/Component_Disease_1.1.js - Multi-Part Cell: Part 1.1 of Component_Disease
 * @description Plague destruction (Phase/Burn), covered counts, off-board damage, snapshots, and canvas rendering.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const Proto = (global.ComponentDiseaseClass && global.ComponentDiseaseClass.prototype) ||
                (global.ComponentDisease && Object.getPrototypeOf(global.ComponentDisease));

  if (!Proto) {
    console.error('[Component_Disease_1.1] ComponentDiseaseClass prototype not found. Ensure Component_Disease_1.0.js is loaded first.');
    return;
  }

  /**
   * Completely destroys a PlagueShape without inflicting damage:
   * - Frees any components covered by its non-incinerated parts.
   * - If directHitKey is specified (e.g. from Fire Burn or Phase alignment detonate),
   *   that specific tile was incinerated/cleared directly.
   * - All other components of the shape dissolve, restoring what they covered.
   * @param {string} plagueId - ID of the PlagueShape
   * @param {string} reason - Cause of destruction ('burn' | 'phase')
   * @param {string|Array<string>|Set<string>} directHitKey - Coordinate key(s)
   * @returns {Object|null} Dissolution record
   */
  Proto.destroyPlagueShape = function(plagueId, reason = 'burn', directHitKey = null, opts = {}) {
    const state = global.GameState;
    if (!plagueId) return null;

    const shape = this.shapes.get(plagueId);
    if (!shape) return null;

    let freedComponentsCount = 0;
    const dissolutionRecord = {
      plagueId: shape.id,
      reason: reason,
      shapeSnapshot: JSON.parse(JSON.stringify(shape)),
      clearedTiles: []
    };

    const directHitSet = directHitKey instanceof Set
      ? directHitKey
      : (Array.isArray(directHitKey)
        ? new Set(directHitKey)
        : new Set(directHitKey ? [directHitKey] : []));

    shape.components.forEach(comp => {
      if (directHitSet.has(comp.key)) return; // Direct hit tile handled by calling spell

      if (state && state.board) {
        const tile = state.board.get(comp.key);
        if (tile && (tile.plagueId === plagueId || tile.color === 'disease' || tile.underneath?.plagueId === plagueId)) {
          dissolutionRecord.clearedTiles.push({
            key: comp.key,
            previousColor: 'disease',
            previousPlagueId: plagueId,
            previousCoveredComponent: tile.coveredComponent ? { ...tile.coveredComponent } : null
          });

          if (tile.phased) {
            // Phased component remains on top! Only restore or clear what was underneath
            if (tile.coveredComponent) {
              tile.underneath = {
                color: tile.coveredComponent.color,
                sigilId: tile.coveredComponent.sigilId || null,
                fortified: tile.coveredComponent.fortified || false,
                lockOwner: tile.coveredComponent.lockOwner || null
              };
              tile.coveredComponent = null;
              freedComponentsCount++;
            } else {
              tile.underneath = null;
            }
            tile.plagueId = null;
          } else {
            if (tile.coveredComponent) {
              // Restore covered normal component
              tile.color = tile.coveredComponent.color;
              tile.sigilId = tile.coveredComponent.sigilId || null;
              tile.fortified = tile.coveredComponent.fortified || false;
              tile.lockOwner = tile.coveredComponent.lockOwner || null;
              tile.coveredComponent = null;
              tile.plagueId = null;
              freedComponentsCount++;
            } else {
              tile.color = null;
              tile.sigilId = null;
              tile.plagueId = null;
            }
            if (tile.underneath?.plagueId === plagueId || tile.underneath?.color === 'disease') tile.underneath = null;
          }
        }
      }
    });

    // Purge all pending damage segments registered for this plague shape in activeDamageTiles
    if (state && state.activeDamageTiles) {
      state.activeDamageTiles = state.activeDamageTiles.filter(
        d => d.plagueShapeId !== plagueId && !shape.components.some(c => c.q === d.q && c.r === d.r && (d.color === 'disease' || d.isDisease))
      );
    }

    this.shapes.delete(plagueId);

    const bonusPts = 1;
    dissolutionRecord.bonusPoints = bonusPts;
    if (state) {
      if (!opts?.deferScore) {
        if (global.NativeStatPod?.awardArrivedScorePoint) global.NativeStatPod.awardArrivedScorePoint(bonusPts);
        else state.score = (state.score || 0) + bonusPts;
      }
      state.roundBonusPoints = (state.roundBonusPoints || 0) + bonusPts;
    }

    if (global.UISidebars) {
      const freedMsg = freedComponentsCount > 0 ? ` (${freedComponentsCount} covered component(s) freed!)` : '';
      const actionLabel = reason === 'phase' ? 'Water Phase Alignment' : 'Fire Burn';
      global.UISidebars.showToast(`✨ PLAGUE PURGED (+${bonusPts} PTS): Plague ${plagueId} dissolved via ${actionLabel}!${freedMsg}`);
      global.UISidebars.updateHpBar?.();
    }

    if (state && state.evaluateSigils) {
      state.evaluateSigils();
    }

    return dissolutionRecord;
  };

  /**
   * Calculates the total count of normal components currently covered by plague components.
   * @param {Object} state - GameState instance
   * @returns {number}
   */
  Proto.getCoveredNormalComponentsCount = function(state) {
    if (!state || !state.board) return 0;
    let count = 0;
    for (const tile of state.board.values()) {
      if (tile && tile.coveredComponent) count++;
    }
    return count;
  };

  /**
   * Calculates the total impending damage from all Plague Shapes that have grown off-board.
   * @returns {number}
   */
  Proto.getOffBoardPlagueDamage = function() {
    let dmg = 0;
    for (const shape of this.shapes.values()) {
      if (shape.offBoard) dmg += 1;
    }
    return dmg;
  };

  /**
   * Creates a deep snapshot of the current plague shapes for undo/reversal tracking.
   * @returns {Object}
   */
  Proto.createSnapshot = function() {
    const serializedShapes = [];
    for (const [, shape] of this.shapes.entries()) {
      serializedShapes.push({
        id: shape.id,
        components: JSON.parse(JSON.stringify(shape.components)),
        offBoard: shape.offBoard,
        spawnTurn: shape.spawnTurn
      });
    }
    return { nextId: this.nextId, shapes: serializedShapes };
  };

  /**
   * Restores a previously created snapshot.
   * @param {Object} snap
   */
  Proto.restoreSnapshot = function(snap) {
    if (!snap) return;
    this.shapes.clear();
    this.nextId = snap.nextId || 0;
    if (snap.shapes && Array.isArray(snap.shapes)) {
      snap.shapes.forEach(s => {
        this.shapes.set(s.id, {
          id: s.id,
          components: JSON.parse(JSON.stringify(s.components)),
          offBoard: s.offBoard,
          spawnTurn: s.spawnTurn
        });
      });
    }
  };

  /**
   * Renders the Disease component canvas visual:
   * - Stark bone-white porcelain hexagon base
   * - Concentric pathogen spore ring and hazard core
   * - Off-board hazard styling with warning indicator
   * - Normal components underneath are invisible per design.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x - Center X
   * @param {number} y - Center Y
   * @param {number} radius - Hexagon radius
   * @param {boolean} isOffBoard - Whether placed outside board boundary
   * @param {number} pulseTime - Animation ticker
   * @param {Object} math - HexMath instance
   */
  Proto.draw = function(ctx, x, y, radius, isOffBoard = false, pulseTime = 0, math = null) {
    const hexMath = math || global.HexMath;
    if (!hexMath) return;

    ctx.save();
    const pulse = (Math.sin(pulseTime * 3) + 1) * 0.5;

    // 1. Base Stark White Hexagon
    const baseFill = '#f8fafc';
    const baseStroke = isOffBoard
      ? `rgba(239, 68, 68, ${0.8 + pulse * 0.2})`
      : `rgba(203, 213, 225, ${0.7 + pulse * 0.3})`;
    const baseStrokeWidth = isOffBoard ? 2.5 : 1.5;

    if (isOffBoard) {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 10;
    } else {
      ctx.shadowColor = 'rgba(255, 255, 255, 0.45)';
      ctx.shadowBlur = 6;
    }

    hexMath.drawHexagon(ctx, x, y, radius - 1.5, baseFill, baseStroke, baseStrokeWidth);
    ctx.restore();

    // 2. Inner Spore Contagion Core (Pale Slate / Ash)
    ctx.save();
    const coreRadius = radius * 0.45;
    const coreFill = 'rgba(148, 163, 184, 0.25)';
    const coreStroke = 'rgba(100, 116, 139, 0.5)';
    hexMath.drawHexagon(ctx, x, y, coreRadius, coreFill, coreStroke, 1);
    ctx.restore();

    // 3. Central Biohazard Glyph
    ctx.save();
    ctx.fillStyle = isOffBoard ? '#dc2626' : '#475569';
    ctx.font = `900 ${Math.round(radius * 0.5)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = isOffBoard ? '#ef4444' : 'rgba(255, 255, 255, 0.8)';
    ctx.shadowBlur = 3;
    ctx.fillText('☣', x, y);
    ctx.restore();
  };

})(typeof window !== 'undefined' ? window : this);
