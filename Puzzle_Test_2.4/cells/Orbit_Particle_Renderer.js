/**
 * @fileoverview cells/Orbit_Particle_Renderer.js - Resonance Point Swarms & Score Funnel
 * @description Coordinates vertex-ordered concentric orbit swarms (cap = 6 per ring,
 * outer-to-inner remainder distribution, parity alternating CCW/CW rotation, Air Weave comet
 * orbs) and the subsequent streaming Bezier score funnel to the HUD Score Counter.
 * Adheres strictly to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const H1_SEC = global.H_TIMING?.BEAT_SEC ?? (Math.pow(12, 8) / 1420405751.768);
  const H2_SEC = global.H_TIMING?.TWO_BEATS_SEC ?? (2 * H1_SEC);
  const H1_MS = H1_SEC * 1000;
  const H3_MS = global.H_TIMING?.THREE_BEATS_MS ?? (3 * H1_MS);
  const DRIFT_SPEED = global.H_TIMING?.DRIFT_PX_PER_SEC ?? (144 / H1_SEC);

  class OrbitParticleRendererClass {
    constructor() {
      this.swarms = [];         // Active orbiting swarms: Array<{ sigilId, vertex, rings, spawnTime }>
      this.activeStream = null;  // Active score funnel stream: { startTime, particles, onComplete }
    }

    /**
     * Checks if there are any active orbiting or streaming particles.
     * @returns {boolean}
     */
    hasParticles() {
      return this.swarms.length > 0 || (this.activeStream && this.activeStream.particles.length > 0);
    }

    /**
     * Distributes N particles across concentric rings (cap 6 per ring).
     * Remainders placed on outer rings first.
     * e.g., N=7 -> [3, 4] (inner to outer) / outer has 4, inner has 3.
     * @param {number} N
     * @returns {Array<number>} Counts per ring from inner (index 0) to outer (index K-1)
     */
    distributeParticlesToRings(N) {
      if (N <= 0) return [];
      const K = Math.ceil(N / 6);
      const B = Math.floor(N / K);
      const R = N % K;
      const ringCounts = [];
      for (let k = 0; k < K; k++) {
        // Outer rings (higher index) receive remainder first
        const getsRemainder = k >= (K - R);
        ringCounts.push(B + (getsRemainder ? 1 : 0));
      }
      return ringCounts;
    }

    /**
     * Spawns a concentric orbit swarm of N point particles around a vertex center.
     * Outermost ring rotates CCW for odd sigils (1st, 3rd...) and CW for even sigils (2nd, 4th...);
     * concentric inner rings alternate direction.
     * @param {Object} vertex - { type, q, r }
     * @param {number} count - Point value (1st sigil = 1, 2nd = 2, etc.)
     * @param {number} sigilIndex - Sigil sequence number (1st = 1, 2nd = 2, etc.)
     * @param {string} [color='#fde047'] - Source spell primary color
     */
    spawnSwarm(vertex, count, sigilIndex = 1, color = '#fde047') {
      if (!vertex || count <= 0) return;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const ringCounts = this.distributeParticlesToRings(count);
      const K = ringCounts.length;
      // Even sigils reverse the orbit pattern to CW (-1), odd sigils orbit CCW (+1)
      const isEven = ((Number(sigilIndex) || 1) % 2 === 0);
      const outerDir = isEven ? -1 : 1;

      const rings = ringCounts.map((mCount, k) => {
        // Direction alternates from outer ring inwards
        const isSameAsOuter = ((K - 1 - k) % 2 === 0);
        const direction = isSameAsOuter ? outerDir : -outerDir;
        const baseRadiusFactor = 1.5 + k * 1.0; // Rings at 1.5, 2.5, 3.5 hexRadius
        const speed = (0.5 / H1_SEC) / baseRadiusFactor; // Constant linear speed: 0.5 hexRadius / H-Beat
        const angleStep = (Math.PI * 2) / Math.max(1, mCount);
        const startPhase = (k * 0.618033) * Math.PI * 2; // Golden ratio phase offset per ring

        const particles = [];
        for (let i = 0; i < mCount; i++) {
          particles.push({
            angleOffset: startPhase + i * angleStep,
            wobbleSeed: (k * 7 + i * 13) % 1.0
          });
        }

        return {
          ringIndex: k,
          count: mCount,
          direction,
          speed,
          baseRadiusFactor,
          particles
        };
      });

      this.swarms.push({
        vertex,
        sigilIndex,
        count,
        color: color || '#fde047',
        rings,
        spawnTime: now
      });
    }

    /**
     * Converts all current orbiting particles into a streaming Bezier funnel to the HUD Score Counter.
     * @param {Function} onComplete
     * @param {number} [speed=DRIFT_SPEED] - Flight speed in px/sec (144 px / H-Beat)
     * @param {number|null} [pendingPoints=null] - Total score points represented by this stream
     */
    startScoreFunnel(onComplete, speed = DRIFT_SPEED, pendingPoints = null) {
      if (this.swarms.length === 0) {
        if (pendingPoints > 0) global.NativeStatPod?.awardArrivedScorePoint?.(pendingPoints);
        if (typeof onComplete === 'function') onComplete();
        return;
      }

      const br = global.BoardRenderer, math = global.HexMath, engine = global.HexUIEngine;
      const ox = br?.originX ?? (typeof window !== 'undefined' ? window.innerWidth * 0.5 : 0);
      const oy = br?.originY ?? (typeof window !== 'undefined' ? window.innerHeight * 0.5 : 0);
      const hr = br?.hexRadius ?? 30;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());

      let target = global.NativeStatPod?.getScoreSubPodCenter?.() || {
        x: (typeof window !== 'undefined' ? window.innerWidth : 1920) * 0.5 + 100,
        y: 42
      };
      if (engine?.boardFrame?.screenToLocal) target = engine.boardFrame.screenToLocal(target.x, target.y);
      else if (engine?.boardFrame?.position) target = { x: target.x - engine.boardFrame.position.x, y: target.y - engine.boardFrame.position.y };

      // Compile staggered orbit-to-funnel schedule across all particles (max 1 H-Beat step, max 3 H-Beats span)
      const streamingParticles = [];
      let globalIndex = 0;

      this.swarms.forEach(swarm => {
        const { x: vx, y: vy } = math?.vertexToScreen ? math.vertexToScreen(swarm.vertex, ox, oy, hr) : { x: ox, y: oy };
        swarm.rings.forEach(ring => {
          const rPix = hr * ring.baseRadiusFactor;
          ring.particles.forEach(p => {
            streamingParticles.push({
              index: globalIndex++,
              vx, vy, rPix,
              color: swarm.color || '#fde047',
              spawnTime: swarm.spawnTime,
              angleOffset: p.angleOffset,
              direction: ring.direction,
              angularSpeed: ring.speed,
              targetX: target.x, targetY: target.y,
              delayMs: 0,
              launched: false,
              arrived: false
            });
          });
        });
      });

      const totalCount = streamingParticles.length;
      const stepMs = totalCount > 1 ? Math.min(H1_MS, H3_MS / (totalCount - 1)) : 0;
      streamingParticles.forEach((p, idx) => { p.delayMs = idx * stepMs; });

      // Move active orbit swarms into the streaming funnel so unlaunched particles keep orbiting until peel-off
      this.swarms = [];
      this.activeStream = {
        startTime: now,
        speed: speed || DRIFT_SPEED,
        remainingPoints: (pendingPoints !== null && pendingPoints !== undefined) ? Math.max(0, pendingPoints) : totalCount,
        particles: streamingParticles,
        onComplete
      };
    }

    _drawParticleComet(ctx, px, py, ux, uy, tailLen, ballR, tailW, tailAlpha, shadowBlur, color = '#fde047') {
      const nx = -uy, ny = ux;
      const prevAlpha = ctx.globalAlpha;
      ctx.beginPath();
      ctx.moveTo(px - ux * tailLen, py - uy * tailLen);
      ctx.lineTo(px + nx * tailW, py + ny * tailW);
      ctx.lineTo(px - nx * tailW, py - ny * tailW);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = prevAlpha * tailAlpha;
      ctx.fill();
      ctx.globalAlpha = prevAlpha;

      ctx.beginPath();
      ctx.arc(px, py, ballR * 2.1, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = prevAlpha * 0.28;
      ctx.fill();
      ctx.globalAlpha = prevAlpha;

      ctx.beginPath();
      ctx.arc(px, py, ballR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, ballR * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }

    /**
     * Master render pass for active orbiting swarms & score funnel stream (Layer 4.97).
     */
    renderParticles(ctx, math, originX, originY, hexRadius, elapsedTime) {
      if (!ctx || !math) return;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const scale = hexRadius / 30;
      const ballR = 2.5 * scale;
      const tailLen = 10 * scale;
      const tailW = ballR * 0.85;

      // 1. RENDER ACTIVE ORBITING SWARMS
      if (this.swarms.length > 0) {
        ctx.save();
        this.swarms.forEach(swarm => {
          const { x: vx, y: vy } = math.vertexToScreen(swarm.vertex, originX, originY, hexRadius);
          const elapsedSec = (now - swarm.spawnTime) * 0.001;
          // Burst scale: expand outward from 0 to ring radius over 2 H-Beats
          const burstProgress = Math.min(1.0, elapsedSec / H2_SEC);
          const burstEase = Math.sin(burstProgress * Math.PI * 0.5);

          swarm.rings.forEach(ring => {
            const rPix = hexRadius * ring.baseRadiusFactor * burstEase;
            const dir = ring.direction;

            ring.particles.forEach(p => {
              const angle = p.angleOffset + dir * ring.speed * elapsedSec;
              const px = vx + Math.cos(angle) * rPix;
              const py = vy + Math.sin(angle) * rPix;
              const tx = -Math.sin(angle) * dir, ty = Math.cos(angle) * dir;
              this._drawParticleComet(ctx, px, py, tx, ty, tailLen * burstEase, ballR, tailW, 0.40, ballR * 2.5, swarm.color);
            });
          });
        });
        ctx.restore();
      }

      // 2. RENDER STREAMING SCORE FUNNEL PARTICLES
      if (this.activeStream) {
        ctx.save();
        const stream = this.activeStream;
        const elapsedStreamMs = now - stream.startTime;
        let allDone = true;

        stream.particles.forEach(p => {
          if (elapsedStreamMs < p.delayMs) {
            allDone = false;
            const elapsedSec = (now - p.spawnTime) * 0.001;
            const burstEase = Math.sin(Math.min(1.0, elapsedSec / H2_SEC) * Math.PI * 0.5);
            const angle = p.angleOffset + p.direction * p.angularSpeed * elapsedSec;
            const rPix = p.rPix * burstEase;
            const px = p.vx + Math.cos(angle) * rPix;
            const py = p.vy + Math.sin(angle) * rPix;
            const tx = -Math.sin(angle) * p.direction, ty = Math.cos(angle) * p.direction;
            this._drawParticleComet(ctx, px, py, tx, ty, tailLen * burstEase, ballR, tailW, 0.40, ballR * 2.5, p.color);
            return;
          }

          if (!p.launched) {
            p.launched = true;
            const launchElapsedSec = ((stream.startTime + p.delayMs) - p.spawnTime) * 0.001;
            const burstEase = Math.sin(Math.min(1.0, launchElapsedSec / H2_SEC) * Math.PI * 0.5);
            const angle = p.angleOffset + p.direction * p.angularSpeed * launchElapsedSec;
            const rCur = p.rPix * burstEase;
            p.startX = p.vx + Math.cos(angle) * rCur;
            p.startY = p.vy + Math.sin(angle) * rCur;
            const dx = p.targetX - p.startX, dy = p.targetY - p.startY;
            const dist = Math.hypot(dx, dy);
            p.flightDurationMs = Math.max(300, (dist / (stream.speed || DRIFT_SPEED)) * 1000);
            const flightSec = p.flightDurationMs * 0.001;
            // Preserve exact orbital tangential momentum at peel-off: P1 = P0 + (V_orb * T) / 3
            const tx = -Math.sin(angle) * p.direction, ty = Math.cos(angle) * p.direction;
            const tangLen = (rCur * p.angularSpeed * flightSec) / 3.0;
            p.ctrl1X = p.startX + tx * tangLen;
            p.ctrl1Y = p.startY + ty * tangLen;
            // Early second control point (~28% along chord + lateral arch) curves smoothly and accelerates into target
            const nx = -dy / (dist || 1), ny = dx / (dist || 1);
            const archOffset = Math.min(90, dist * 0.25) * ((p.index % 2 === 0) ? 1 : -1);
            const p2X = p.startX + dx * 0.28, p2Y = p.startY + dy * 0.28;
            p.ctrl2X = p2X + nx * archOffset;
            p.ctrl2Y = Math.min(p2Y - Math.abs(archOffset) * 0.4, p2Y + ny * archOffset);
          }

          const u = Math.min(1.0, (elapsedStreamMs - p.delayMs) / p.flightDurationMs);

          if (u < 1.0) {
            allDone = false;
          } else {
            if (!p.arrived) {
              p.arrived = true;
              if (global.AudioSynth?.playScoreTick) global.AudioSynth.playScoreTick();
              const pts = stream.remainingPoints > 0 ? 1 : 0;
              stream.remainingPoints -= pts;
              if (pts > 0) global.NativeStatPod?.awardArrivedScorePoint?.(pts);
              else global.NativeStatPod?.triggerScoreBounce?.();
            }
            return; // Absorbed into score pod upon arrival
          }

          // Momentum-preserving cubic Bezier: carries orbital velocity smoothly into accelerating funnel
          const invU = 1.0 - u, invU2 = invU * invU, u2 = u * u;
          const w0 = invU2 * invU, w1 = 3.0 * invU2 * u, w2 = 3.0 * invU * u2, w3 = u2 * u;
          const cx = w0 * p.startX + w1 * p.ctrl1X + w2 * p.ctrl2X + w3 * p.targetX;
          const cy = w0 * p.startY + w1 * p.ctrl1Y + w2 * p.ctrl2Y + w3 * p.targetY;

          // Tangent velocity along the cubic Bezier curve
          const dX = 3.0 * invU2 * (p.ctrl1X - p.startX) + 6.0 * invU * u * (p.ctrl2X - p.ctrl1X) + 3.0 * u2 * (p.targetX - p.ctrl2X);
          const dY = 3.0 * invU2 * (p.ctrl1Y - p.startY) + 6.0 * invU * u * (p.ctrl2Y - p.ctrl1Y) + 3.0 * u2 * (p.targetY - p.ctrl2Y);
          const tDist = Math.hypot(dX, dY) || 1;
          const ux = dX / tDist, uy = dY / tDist;
          const streamTailLen = Math.max(tailLen * (1.0 - u), Math.min(16 * scale, tDist * 0.08) * Math.sin(Math.PI * u));
          this._drawParticleComet(ctx, cx, cy, ux, uy, streamTailLen, ballR, tailW, 0.50, ballR * 3.0, p.color);
        });

        ctx.restore();

        if (allDone) {
          if (stream.remainingPoints > 0) {
            global.NativeStatPod?.awardArrivedScorePoint?.(stream.remainingPoints);
            stream.remainingPoints = 0;
          }
          const cb = stream.onComplete;
          this.activeStream = null;
          if (typeof cb === 'function') cb();
        }
      }
    }
  }

  const particleRendererInstance = new OrbitParticleRendererClass();
  global.OrbitParticleRendererClass = OrbitParticleRendererClass;
  global.OrbitParticleRenderer = particleRendererInstance;

  // Register with global Roll Call
  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Orbit_Particle_Renderer', particleRendererInstance);

})(typeof window !== 'undefined' ? window : this);

