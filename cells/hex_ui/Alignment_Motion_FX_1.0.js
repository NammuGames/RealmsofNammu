/**
 * @fileoverview cells/hex_ui/Alignment_Motion_FX_1.0.js - Disease Resonant Hum Network & Topology Engine
 * @description Dedicated hardware-optimized runtime renderer providing 60 FPS disease network alignments:
 * 1. Global Topology Caching: Bypasses per-frame graph discovery; caches static edge geometry and node endpoints.
 * 2. Stamped Sprite Nodes: Offscreen pre-baked oval rings and socket caps.
 * 3. Double-Buffered Hum Pipeline: Offscreen canvas buffering with 60 FPS animation override and per-edge alpha
 * (Part 1 of multi-part AlignmentMotionFX cell).
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  class AlignmentMotionFXClass {
    constructor() {
      this.cachedSig = null;
      this.cachedEdges = [];
      this.cachedNodes = [];
      this.ovalSprites = this.createOvalSprites();
      this.capSprite = this.createCapSprite();
    }

    /**
     * Pre-renders a hollow oval ring sprite (with an empty hole in the middle)
     * rotated to a specific hex angle once at startup.
     */
    createRingSprite(angle) {
      if (typeof document === 'undefined') return null;
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const sCtx = c.getContext('2d');
      sCtx.save();
      sCtx.translate(32, 32);
      sCtx.rotate(angle);
      sCtx.beginPath();
      sCtx.ellipse(0, 0, 18, 11, 0, 0, Math.PI * 2);
      sCtx.strokeStyle = 'rgba(255, 255, 255, 0.28)'; sCtx.lineWidth = 5.0; sCtx.stroke();
      sCtx.strokeStyle = 'rgba(248, 250, 252, 0.70)'; sCtx.lineWidth = 2.6; sCtx.stroke();
      sCtx.strokeStyle = '#ffffff'; sCtx.lineWidth = 1.3; sCtx.stroke();
      sCtx.restore();
      return c;
    }

    createOvalSprites() {
      return [
        this.createRingSprite(Math.PI / 2),
        this.createRingSprite(Math.PI / 6),
        this.createRingSprite(5 * Math.PI / 6)
      ];
    }

    createCapSprite() {
      if (typeof document === 'undefined') return null;
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const sCtx = c.getContext('2d'), cx = 32, cy = 32;
      sCtx.beginPath(); sCtx.arc(cx, cy, 18, 0, Math.PI * 2); sCtx.fillStyle = 'rgba(255, 255, 255, 0.25)'; sCtx.fill();
      sCtx.beginPath(); sCtx.arc(cx, cy, 14.5, 0, Math.PI * 2); sCtx.strokeStyle = 'rgba(255, 255, 255, 0.85)'; sCtx.lineWidth = 2.0; sCtx.stroke();
      sCtx.beginPath(); sCtx.arc(cx, cy, 6.5, 0, Math.PI * 2); sCtx.fillStyle = '#ffffff'; sCtx.fill();
      sCtx.beginPath(); sCtx.arc(cx, cy, 2.8, 0, Math.PI * 2); sCtx.fill();
      return c;
    }

    /**
     * Rebuilds the cached connection topology only when board layout or disease pieces change.
     */
    updateTopologyCache(state, compDisease, math, originX, originY, hexRadius) {
      let sig = `${compDisease.shapes.size}:${originX.toFixed(1)}:${originY.toFixed(1)}:${hexRadius.toFixed(1)}:`;
      compDisease.shapes.forEach(s => {
        sig += `${s.id}_${s.components.length};`;
        s.components.forEach(c => { sig += `${c.key}|`; });
      });

      if (this.cachedSig === sig && this.cachedEdges && this.cachedNodes) {
        return; // Cache hit: Topology hasn't changed, zero discovery cost!
      }

      this.cachedSig = sig;
      this.cachedEdges = [];
      const drawnPairs = new Set();
      const nodeMap = new Map();

      const isDiseaseTile = (t, sId) => t && ((t.color === 'disease' && (t.plagueId === sId || !t.plagueId)) || (t.underneath && (t.underneath.color === 'disease' || t.underneath.plagueId === sId)));

      compDisease.shapes.forEach(shape => {
        if (!shape || !shape.components || shape.components.length < 2) return;
        const comps = shape.components;
        for (let i = 0; i < comps.length; i++) {
          const c1 = comps[i];
          const t1 = state.board.get(c1.key);
          if (c1.onBoard && !isDiseaseTile(t1, shape.id)) continue;

          for (let j = i + 1; j < comps.length; j++) {
            const c2 = comps[j];
            const t2 = state.board.get(c2.key);
            if (c2.onBoard && !isDiseaseTile(t2, shape.id)) continue;

            const dist = math.hexDistanceBetween
              ? math.hexDistanceBetween(c1.q, c1.r, c2.q, c2.r)
              : (math.hexDistance ? math.hexDistance(c1.q - c2.q, c1.r - c2.r) : 999);

            if (dist === 1) {
              const pairKey = c1.key < c2.key ? `${c1.key}|${c2.key}` : `${c2.key}|${c1.key}`;
              if (drawnPairs.has(pairKey)) continue;
              drawnPairs.add(pairKey);

              const p1 = math.hexToScreen(c1.q, c1.r, originX, originY, hexRadius);
              const p2 = math.hexToScreen(c2.q, c2.r, originX, originY, hexRadius);
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const length = Math.hypot(dx, dy);
              const angle = Math.atan2(dy, dx);

              // Exact hex symmetry direction (0: East-West, 1: Northeast-Southwest, 2: Northwest-Southeast)
              const diffQ = Math.abs(c2.q - c1.q);
              const diffR = Math.abs(c2.r - c1.r);
              const dirIndex = (diffQ === 1 && diffR === 1) ? 0 : (diffQ === 1 ? 1 : 2);

              this.cachedEdges.push({ p1, p2, dx, dy, length, angle, dirIndex, q1: c1.q, r1: c1.r, q2: c2.q, r2: c2.r });

              if (!nodeMap.has(c1.key)) nodeMap.set(c1.key, { ...p1, q: c1.q, r: c1.r });
              if (!nodeMap.has(c2.key)) nodeMap.set(c2.key, { ...p2, q: c2.q, r: c2.r });
            }
          }
        }
      });

      this.cachedNodes = Array.from(nodeMap.values());
    }

    /**
     * Stamped rendering of all unique connection nodes (Socket Caps) via pre-baked hardware sprite.
     */
    drawBatchedNodes(ctx, nodes, time, scale = 1) {
      if (!nodes || nodes.length === 0 || !this.capSprite) return;
      const rippleRenderer = global.BoardRippleRenderer;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        let animScale = 1.0;
        if (n.q !== undefined && rippleRenderer?.getTileAnimState) {
          const anim = rippleRenderer.getTileAnimState(n.q, n.r);
          if (anim && anim.scale !== undefined) animScale = anim.scale;
        }
        if (animScale <= 0.01) continue;
        const pulse = 1.0 + 0.12 * Math.sin(time * 3.0 + i);
        const s = 34 * scale * pulse * animScale;
        if (animScale < 0.99) {
          ctx.save();
          ctx.globalAlpha = animScale;
          ctx.drawImage(this.capSprite, n.x - s / 2, n.y - s / 2, s, s);
          ctx.restore();
        } else {
          ctx.drawImage(this.capSprite, n.x - s / 2, n.y - s / 2, s, s);
        }
      }
    }

    /**
     * Master batched disease connection pipeline:
     * - Double-buffered 30 FPS cluster snapshot reduces frame overhead by 50%.
     * - 60 FPS redraw when active tile animations are running.
     * - 1 centered hollow oval ring per connection edge.
     * - Stamped large prominent socket caps.
     */
    drawDiseaseConnections(ctx, math, originX, originY, hexRadius, time) {
      const state = global.GameState;
      const compDisease = global.ComponentDisease;
      if (!state || !state.board || !compDisease || !compDisease.shapes) return;

      this.updateTopologyCache(state, compDisease, math, originX, originY, hexRadius);

      const edges = this.cachedEdges;
      const nodes = this.cachedNodes;
      if (!edges || edges.length === 0 || !nodes || nodes.length === 0) return;

      const scale = hexRadius / 30;

      // Frame throttle: Update hum buffer every 6th frame (10 FPS) or 60 FPS while tile animates
      this.humFrame = (this.humFrame || 0) + 1;
      const camChanged = Math.abs((this.lastOriginX ?? originX) - originX) > 0.5 ||
                         Math.abs((this.lastOriginY ?? originY) - originY) > 0.5 ||
                         Math.abs((this.lastHexR ?? hexRadius) - hexRadius) > 0.2;
      if (camChanged || this.lastOriginX === undefined) {
        this.lastOriginX = originX;
        this.lastOriginY = originY;
        this.lastHexR = hexRadius;
      }

      // Compute bounding box around the active disease network
      let minX = nodes[0].x, maxX = nodes[0].x, minY = nodes[0].y, maxY = nodes[0].y;
      for (let i = 1; i < nodes.length; i++) {
        const nx = nodes[i].x, ny = nodes[i].y;
        if (nx < minX) minX = nx; else if (nx > maxX) maxX = nx;
        if (ny < minY) minY = ny; else if (ny > maxY) maxY = ny;
      }
      const pad = Math.ceil(36 * scale);
      const bx = Math.floor(minX - pad), by = Math.floor(minY - pad);
      const bw = Math.max(72, Math.ceil(maxX - minX + pad * 2));
      const bh = Math.max(72, Math.ceil(maxY - minY + pad * 2));

      if (!this.humCanvas) this.humCanvas = document.createElement('canvas');
      if (this.humCanvas.width !== bw || this.humCanvas.height !== bh) {
        this.humCanvas.width = bw;
        this.humCanvas.height = bh;
        this.humDirty = true;
      }

      const hasTileAnims = (global.BoardRippleRenderer?.activeTileAnims?.size || 0) > 0;
      const animsJustEnded = !hasTileAnims && this.lastHadTileAnims;
      this.lastHadTileAnims = hasTileAnims;

      // Render into offscreen buffer on every 6th frame (or 60 FPS while animating)
      if (this.humFrame % 6 === 0 || camChanged || this.humDirty || hasTileAnims || animsJustEnded || !this.humBufferValid) {
        const bCtx = this.humCanvas.getContext('2d');
        bCtx.clearRect(0, 0, bw, bh);
        bCtx.save();
        bCtx.translate(-bx, -by);

        const rippleRenderer = global.BoardRippleRenderer;
        for (let i = 0; i < edges.length; i++) {
          const e = edges[i];
          let alpha = 1.0;
          if (rippleRenderer?.getTileAnimState) {
            const a1 = rippleRenderer.getTileAnimState(e.q1, e.r1);
            const a2 = rippleRenderer.getTileAnimState(e.q2, e.r2);
            const s1 = (a1 && a1.scale !== undefined) ? a1.scale : 1.0;
            const s2 = (a2 && a2.scale !== undefined) ? a2.scale : 1.0;
            alpha = Math.min(s1, s2);
          }
          e._alpha = Math.max(0.0, Math.min(1.0, alpha));
        }

        const shimmer = Math.sin(time * 26) * 0.8 + Math.cos(time * 42) * 0.4;
        const coreWidth = Math.max(0.6, (2.0 + shimmer * 0.5) * scale);
        const glowWidth = Math.max(1.5, (8 + shimmer * 1.5) * scale);

        // PASS 1: BATCHED LASER BEAMS (Solid edges batched, fading edges drawn individually)
        bCtx.beginPath();
        let hasSolid = false;
        for (let i = 0; i < edges.length; i++) {
          if (edges[i]._alpha >= 0.99) {
            bCtx.moveTo(edges[i].p1.x, edges[i].p1.y);
            bCtx.lineTo(edges[i].p2.x, edges[i].p2.y);
            hasSolid = true;
          }
        }
        if (hasSolid) {
          bCtx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
          bCtx.lineWidth = glowWidth;
          bCtx.stroke();
          bCtx.strokeStyle = '#ffffff';
          bCtx.lineWidth = coreWidth;
          bCtx.stroke();
        }

        for (let i = 0; i < edges.length; i++) {
          const e = edges[i];
          if (e._alpha > 0.01 && e._alpha < 0.99) {
            bCtx.save();
            bCtx.globalAlpha = e._alpha;
            bCtx.beginPath();
            bCtx.moveTo(e.p1.x, e.p1.y);
            bCtx.lineTo(e.p2.x, e.p2.y);
            bCtx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
            bCtx.lineWidth = glowWidth;
            bCtx.stroke();
            bCtx.strokeStyle = '#ffffff';
            bCtx.lineWidth = coreWidth;
            bCtx.stroke();
            bCtx.restore();
          }
        }

        // PASS 2: 1 STAMPED OVAL RING PER EDGE (Centered Pulse Node)
        if (this.ovalSprites) {
          for (let i = 0; i < edges.length; i++) {
            const e = edges[i];
            if (e._alpha <= 0.01) continue;
            const sprite = this.ovalSprites[e.dirIndex];
            if (!sprite) continue;
            const nx = e.p1.x + e.dx * 0.5, ny = e.p1.y + e.dy * 0.5;
            const s = 18 * scale * (0.8 + 0.3 * Math.abs(Math.sin(time * 3.0 + i * 0.8)));
            if (e._alpha < 0.99) {
              bCtx.save();
              bCtx.globalAlpha = e._alpha;
              bCtx.drawImage(sprite, nx - s / 2, ny - s / 2, s, s);
              bCtx.restore();
            } else {
              bCtx.drawImage(sprite, nx - s / 2, ny - s / 2, s, s);
            }
          }
        }

        // PASS 3: STAMPED SOCKET CAPS (Prominent Larger Ring Caps)
        this.drawBatchedNodes(bCtx, nodes, time, scale);

        bCtx.restore();
        this.humBufferValid = true;
        this.humDirty = false;
        this.lastBx = bx;
        this.lastBy = by;
      }

      // Blit pre-rendered snapshot (1 single fast GPU call on odd frames!)
      ctx.drawImage(this.humCanvas, this.lastBx ?? bx, this.lastBy ?? by);
    }

    drawHum(ctx, p1, p2, time) { this.drawDiseaseConnections(ctx, global.HexMath, 0, 0, 30, time); }
    drawDiseaseSocketCap(ctx, x, y, time) { this.drawBatchedNodes(ctx, [{ x, y }], time); }
  }

  const instance = new AlignmentMotionFXClass();
  global.AlignmentMotionFXClass = AlignmentMotionFXClass;
  global.AlignmentMotionFX = instance;
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Alignment_Motion_FX_1.0', instance);

})(typeof window !== 'undefined' ? window : this);

