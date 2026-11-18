/**
 * @fileoverview cells/Last_Breath_Manager_1.1.js - Dynamic Last Breath Interception (Tiers 2-3 & Render)
 * @description Executes concurrent held-token and Spellbook heal launches, resolves survival
 * or elimination, manages heal-token flights/splashes, and renders Layer 4.97.
 */

(function(global) {
  'use strict';

  const LastBreathManagerClass = global.LastBreathManagerClass;
  if (!LastBreathManagerClass) return;

  const { H1_SEC, H2_MS, H_HALF_MS, DRIFT_SPEED } = LastBreathManagerClass._timing;
  const proto = LastBreathManagerClass.prototype;

  /**
   * Synchronizes Tier 1 (HP staged heal), Tier 2 (held board Heal tokens), and Tier 3 (Spellbook Heal charges),
   * spawning all Heal sets simultaneously with ring-distributed off-screen blooms.
   */
  proto.runTier2And3Heals = function(state, onDone) {
    const rr = global.BoardRippleRenderer;
    const pendingHeal = state.pendingHeal || 0;
    state.pendingHeal = 0;
    const dmgTokens = rr?.persistentDamageTokens ? [...rr.persistentDamageTokens] : [];

    if (dmgTokens.length === 0) {
      if (pendingHeal > 0) state.hp = Math.min(state.maxHp, state.hp + pendingHeal);
      state.syncUI();
      this.releaseUnusedResonantHeals(rr);
      onDone();
      return;
    }

    const hpTokensCount = Math.min(pendingHeal, dmgTokens.length);
    const hpTargets = dmgTokens.slice(0, hpTokensCount);
    const excessPendingHeal = pendingHeal - hpTokensCount;
    let dmgCursor = hpTokensCount;

    const heldTokens = Array.isArray(rr.persistentSpellTokens)
      ? rr.persistentSpellTokens.filter(t => t.isHeldForLastBreath) : [];
    const healSpell = state.spellbook?.find(s => s.formula === 'PPB' || s.name?.toLowerCase() === 'heal');

    const boardPlans = [];
    for (const spellTok of heldTokens) {
      if (dmgCursor >= dmgTokens.length || (dmgTokens.length - dmgCursor) < state.hp) break;
      const sIdx = rr.persistentSpellTokens.indexOf(spellTok);
      if (sIdx !== -1) rr.persistentSpellTokens.splice(sIdx, 1);
      const count = Math.min(4, dmgTokens.length - dmgCursor);
      const targets = dmgTokens.slice(dmgCursor, dmgCursor + count);
      dmgCursor += count;
      boardPlans.push({
        spellTok,
        leftover: 4 - count,
        tokenSpawnTime: 0,
        healSpecs: targets.map((targetDmg, i) => ({
          targetDmg, tokenIdx: i, seedPhase: Math.random(), seedTilt: Math.random()
        }))
      });
    }

    const spellbookPlans = [];
    let remCharges = healSpell?.charges || 0;
    while (dmgCursor < dmgTokens.length && (dmgTokens.length - dmgCursor) >= state.hp && remCharges > 0) {
      remCharges--;
      const count = Math.min(4, dmgTokens.length - dmgCursor);
      spellbookPlans.push({ targets: dmgTokens.slice(dmgCursor, dmgCursor + count), leftover: 4 - count });
      dmgCursor += count;
    }

    if (hpTargets.length === 0 && boardPlans.length === 0 && spellbookPlans.length === 0) {
      if (excessPendingHeal > 0) state.hp = Math.min(state.maxHp, state.hp + excessPendingHeal);
      state.syncUI();
      this.releaseUnusedResonantHeals(rr);
      onDone();
      return;
    }

    if (spellbookPlans.length > 0) {
      global.UISidebarDeck?.openSpellbookColumn?.(true);
      global.UISidebars?.renderSpellbookUI?.();
    }

    const launchAllHeals = () => {
      const math = global.HexMath, br = global.BoardRenderer;
      const originX = br?.originX ?? (window.innerWidth / 2), originY = br?.originY ?? (window.innerHeight / 2), hexRadius = br?.hexRadius ?? 30;
      const sbTargets = spellbookPlans.flatMap(sp => sp.targets);
      const totalLaunches = hpTargets.length + boardPlans.reduce((s, bp) => s + bp.healSpecs.length, 0) + sbTargets.length;
      let arrivedCount = 0;
      let leftoverHp = excessPendingHeal;

      boardPlans.forEach(bp => { leftoverHp += bp.leftover; });
      spellbookPlans.forEach(sp => { leftoverHp += sp.leftover; });
      if (spellbookPlans.length > 0 && healSpell) {
        healSpell.charges = Math.max(0, (healSpell.charges || 0) - spellbookPlans.length);
        global.UISidebars?.renderSpellbookUI?.();
        global.UISidebarDeck?.syncSpellbookColumnWithGameState?.();
      }
      if (leftoverHp > 0) state.hp = Math.min(state.maxHp, state.hp + leftoverHp);
      state.syncUI();

      if (totalLaunches > 0) {
        global.AudioSynth?.playReward?.('heal');
      } else {
        this.releaseUnusedResonantHeals(rr);
        onDone();
        return;
      }

      const onTokenArrive = (targetDmg) => {
        this.onTokenCollision(targetDmg);
        if (++arrivedCount >= totalLaunches) {
          this.releaseUnusedResonantHeals(rr);
          setTimeout(onDone, 350);
        }
      };

      // Builds concentric ring orbits matching OrbitParticleRenderer's cap-6 / outer-remainder / parity-alternating rules
      const buildRingOrbits = (ox, oy, count, seedIndex) => {
        if (count <= 0) return [];
        const opr = global.OrbitParticleRenderer;
        let ringCounts;
        if (opr?.distributeParticlesToRings) {
          ringCounts = opr.distributeParticlesToRings(count);
        } else {
          const K = Math.ceil(count / 6), B = Math.floor(count / K), R = count % K;
          ringCounts = Array.from({ length: K }, (_, k) => B + (k >= (K - R) ? 1 : 0));
        }
        const K = ringCounts.length;
        const outerDir = (((seedIndex || 1) % 2) === 0) ? -1 : 1;
        const orbits = [];
        ringCounts.forEach((mCount, k) => {
          const dir = (((K - 1 - k) % 2) === 0) ? outerDir : -outerDir;
          const baseRadiusFactor = 1.5 + k * 1.0;
          const omega = (0.5 / H1_SEC) / baseRadiusFactor;
          const angleStep = (Math.PI * 2) / Math.max(1, mCount);
          const startPhase = (k * 0.618033) * Math.PI * 2;
          for (let i = 0; i < mCount; i++) {
            orbits.push({
              originX: ox, originY: oy,
              orbitRadius: hexRadius * baseRadiusFactor, bloomMs: H2_MS,
              omega, dir, angleOffset: startPhase + i * angleStep
            });
          }
        });
        return orbits;
      };

      const makeBoardOrbit = (ox, oy, batchIdx, tokIdx, count) => ({
        originX: ox, originY: oy, orbitRadius: 3.0 * hexRadius, bloomMs: H2_MS,
        omega: (0.5 / H1_SEC) / 3.0, dir: (batchIdx % 2 === 0 ? 1 : -1),
        angleOffset: (batchIdx * 0.618033) * Math.PI * 2 + tokIdx * ((Math.PI * 2) / Math.max(1, count))
      });

      // 1. Tier 1: HP Sub-Pod staged Heal set (off-screen bottom HUD origin)
      if (hpTargets.length > 0) {
        const hpScreen = global.NativeVitalityPod?.getHpSubPodCenter?.() || {
          x: (typeof window !== 'undefined' ? window.innerWidth * 0.5 - 100 : 860),
          y: (typeof window !== 'undefined' ? window.innerHeight - 42 : 1038)
        };
        const hpPos = this._toBoardLocal(hpScreen);
        const hpOrbits = buildRingOrbits(hpPos.x, hpPos.y, hpTargets.length, 1);
        hpTargets.forEach((targetDmg, i) => {
          const targetPos = math ? math.hexToScreen(targetDmg.q, targetDmg.r, originX, originY, hexRadius) : hpPos;
          this.launchHealToken(hpPos.x, hpPos.y, targetPos.x, targetPos.y, null, () => onTokenArrive(targetDmg), i, {
            orbit: hpOrbits[i]
          });
        });
      }

      // 2. Tier 2: Held Board Heal token sets
      boardPlans.forEach((bp, bpIdx) => {
        const vPos = bp.spellTok.vertex && math ? math.vertexToScreen(bp.spellTok.vertex, originX, originY, hexRadius) : { x: originX, y: originY };
        bp.healSpecs.forEach(hs => {
          const targetPos = math ? math.hexToScreen(hs.targetDmg.q, hs.targetDmg.r, originX, originY, hexRadius) : vPos;
          this.launchHealToken(vPos.x, vPos.y, targetPos.x, targetPos.y, null, () => onTokenArrive(hs.targetDmg), hs.tokenIdx, {
            seedPhase: hs.seedPhase, seedTilt: hs.seedTilt, spinStartTime: bp.tokenSpawnTime,
            orbit: makeBoardOrbit(vPos.x, vPos.y, bpIdx, hs.tokenIdx, bp.healSpecs.length)
          });
        });
      });

      // 3. Tier 3: Spellbook Heal button set (off-screen right HUD origin)
      if (sbTargets.length > 0) {
        const btnNode = global.UICardsDeck?.spellButtonNodes?.find(b => b.spell?.formula === 'PPB' || b.spell?.name?.toLowerCase() === 'heal');
        const sbPos = this._toBoardLocal(btnNode?.worldMatrix
          ? { x: btnNode.worldMatrix[4], y: btnNode.worldMatrix[5] }
          : { x: (typeof window !== 'undefined' ? window.innerWidth - 120 : 1800), y: 240 });
        this.spawnSplash(sbPos.x, sbPos.y, '#10b981', 30);
        const sbOrbits = buildRingOrbits(sbPos.x, sbPos.y, sbTargets.length, boardPlans.length + 2);
        sbTargets.forEach((targetDmg, i) => {
          const targetPos = math ? math.hexToScreen(targetDmg.q, targetDmg.r, originX, originY, hexRadius) : sbPos;
          this.launchHealToken(sbPos.x, sbPos.y, targetPos.x, targetPos.y, null, () => onTokenArrive(targetDmg), i, {
            orbit: sbOrbits[i]
          });
        });
      }
    };

    if (boardPlans.length > 0 && rr.playHeldHealDespawn) {
      let despawnDone = 0;
      boardPlans.forEach(bp => {
        rr.playHeldHealDespawn(bp.spellTok, bp.healSpecs, (tokenSpawnTime) => {
          bp.tokenSpawnTime = tokenSpawnTime;
          if (++despawnDone >= boardPlans.length) launchAllHeals();
        });
      });
    } else if (boardPlans.length > 0 || spellbookPlans.length === 0) {
      launchAllHeals();
    } else {
      setTimeout(launchAllHeals, 350);
    }
  };

  /**
   * Resolves the final state: all damage neutralized (survival) or damage remains (elimination).
   */
  proto.finalizeResolution = function(state, newlyForgedSpells = [], onComplete) {
    const rr = global.BoardRippleRenderer;
    const remainingDmg = rr?.persistentDamageTokens || [];
    const unblockedDmg = remainingDmg.length;

    const finish = () => {
      const remainingOverflow = state.overflowSpells ? state.overflowSpells.length : 0;
      const creditedOverflow = state._creditedOverflowPts || 0;
      const uncreditedOverflow = Math.max(0, remainingOverflow - creditedOverflow);
      state._creditedOverflowPts = 0;
      if (uncreditedOverflow > 0) {
        if (global.NativeStatPod?.awardArrivedScorePoint) global.NativeStatPod.awardArrivedScorePoint(uncreditedOverflow);
        else state.score = (state.score || 0) + uncreditedOverflow;
      }
      if (remainingOverflow > 0) state.roundBonusPoints = (state.roundBonusPoints || 0) + remainingOverflow;
      state.overflowSpells = [];
      state.cameraLocked = false;
      this.isInterceptionRunning = false;
      global.MatchOrchestrator?.saveActivePlayerFromState?.(state);
      state.syncUI();
      if (typeof onComplete === 'function') onComplete();
    };

    if (unblockedDmg === 0) {
      state.activeDamageTiles = [];
      state.hp = Math.min(state.maxHp, Math.max(1, state.hp));
      global.AudioSynth?.playDetonate?.();
      state.showToast(`🛡️ LAST BREATH SURVIVED! All damage neutralized! HP restored to ${state.hp}.`);
      finish();
    } else {
      if (state.hp - unblockedDmg <= 0) {
        state.showToast(`☠️ LAST BREATH FAILED: ${unblockedDmg} unblocked damage remaining!`);
      }
      const applyDamage = (appliedDamage = 0) => {
        const remainingDmg = Math.max(0, unblockedDmg - (appliedDamage || 0));
        state.activeDamageTiles = [];
        state.hp = Math.min(state.maxHp, Math.max(0, state.hp - remainingDmg));
        if (state.hp > 0) {
          global.AudioSynth?.playDetonate?.();
          state.showToast(`🛡️ LAST BREATH SURVIVED! Took ${unblockedDmg} damage. HP: ${state.hp}.`);
        } else {
          global.AudioSynth?.playClick?.();
          const pName = state.getActivePlayer?.()?.name || `Player ${state.currentPlayerId || 1}`;
          state.showToast(`💀 ${pName} vitality depleted (0 HP)!`);
        }
        finish();
      };
      if (rr?.startDamageTokensDrift) rr.startDamageTokensDrift(applyDamage);
      else applyDamage(0);
    }
  };

  /**
   * Unholds any remaining resonant heal tokens so they can drift away normally.
   */
  proto.releaseUnusedResonantHeals = function(rr) {
    if (!rr || !Array.isArray(rr.persistentSpellTokens)) return;
    rr.persistentSpellTokens.forEach(t => {
      if (t.isHeldForLastBreath) t.isHeldForLastBreath = false;
    });
    this.heldResonantHeals = [];
  };

  /**
   * Helper to spawn an in-flight heal token paced by DRIFT_SPEED.
   */
  proto.launchHealToken = function(startX, startY, targetX, targetY, durationMs, onImpact, tokenIdx = 0, opts = {}) {
    const dist = Math.hypot(targetX - startX, targetY - startY);
    const dur = (typeof durationMs === 'number' && durationMs > 0) ? durationMs : Math.max(H_HALF_MS, (dist / DRIFT_SPEED) * 1000);
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.activeHealTokens.push({
      startX, startY, targetX, targetY, startTime: now, spinStartTime: opts.spinStartTime ?? now,
      durationMs: dur, tokenIdx, seedPhase: opts.seedPhase ?? Math.random(), seedTilt: opts.seedTilt ?? Math.random(),
      orbit: opts.orbit || null, orbitDone: !opts.orbit, completed: false, onImpact
    });
  };

  /**
   * Collision resolution: removes the target damage token and spawns splash effect.
   */
  proto.onTokenCollision = function(targetDmg) {
    const rr = global.BoardRippleRenderer;
    if (rr && Array.isArray(rr.persistentDamageTokens)) {
      const idx = rr.persistentDamageTokens.indexOf(targetDmg);
      if (idx !== -1) rr.persistentDamageTokens.splice(idx, 1);
    }

    const state = global.GameState;
    if (state && Array.isArray(state.activeDamageTiles)) {
      state.activeDamageTiles = state.activeDamageTiles.filter(d => !(d.q === targetDmg.q && d.r === targetDmg.r));
    }
    if (state?.board) {
      const t = state.board.get(`${targetDmg.q},${targetDmg.r}`);
      if (t && t.color === 'disease') { t.color = null; t.plagueId = null; }
    }

    const math = global.HexMath, br = global.BoardRenderer;
    const originX = br?.originX ?? (window.innerWidth / 2), originY = br?.originY ?? (window.innerHeight / 2), hexRadius = br?.hexRadius ?? 30;
    const pos = math ? math.hexToScreen(targetDmg.q, targetDmg.r, originX, originY, hexRadius) : { x: originX, y: originY };
    this.spawnSplash(pos.x, pos.y, '#10b981', 28);
    global.AudioSynth?.playDiseaseDestroy ? global.AudioSynth.playDiseaseDestroy() : global.AudioSynth?.playScoreTick?.();
  };

  /**
   * Helper to spawn a visual collision splash.
   */
  proto.spawnSplash = function(x, y, color = '#10b981', maxR = 28) {
    this.activeSplashes.push({ x, y, color, maxR, startTime: (typeof performance !== 'undefined' ? performance.now() : Date.now()), durationMs: global.H_TIMING?.ONE_HALF_BEATS_MS ?? (H1_SEC * 1500) });
  };

  /**
   * Master render pass for active in-flight Heal tokens and collision splashes (Layer 4.97).
   */
  proto.render = function(ctx, math, originX, originY, hexRadius, elapsedTime, options = {}) {
    if (!ctx) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    // 1. Splashes
    for (let i = this.activeSplashes.length - 1; i >= 0; i--) {
      const sp = this.activeSplashes[i], p = Math.min(1.0, (now - sp.startTime) / sp.durationMs);
      if (p >= 1.0) { this.activeSplashes.splice(i, 1); continue; }
      const r = p * sp.maxR, alpha = 1.0 - p;
      ctx.save(); ctx.beginPath(); ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
      ctx.lineWidth = 3; ctx.strokeStyle = sp.color; ctx.globalAlpha = alpha; ctx.stroke();
      ctx.fillStyle = sp.color; ctx.globalAlpha = alpha * 0.35; ctx.fill(); ctx.restore();
    }

    // 2. In-flight Heal Tokens (2 H-Beat radial bloom -> momentum-preserving cubic Bezier drift)
    for (let i = this.activeHealTokens.length - 1; i >= 0; i--) {
      const tok = this.activeHealTokens[i], elapsed = now - tok.startTime;
      let curX, curY, p = 0;
      if (tok.orbit && elapsed < tok.orbit.bloomMs) {
        const orb = tok.orbit, rCur = orb.orbitRadius * (elapsed / orb.bloomMs);
        const ang = orb.angleOffset + orb.dir * orb.omega * (elapsed * 0.001);
        curX = orb.originX + Math.cos(ang) * rCur; curY = orb.originY + Math.sin(ang) * rCur;
      } else {
        if (tok.orbit && !tok.orbitDone) {
          const orb = tok.orbit, endAng = orb.angleOffset + orb.dir * orb.omega * (orb.bloomMs * 0.001);
          tok.startX = orb.originX + Math.cos(endAng) * orb.orbitRadius;
          tok.startY = orb.originY + Math.sin(endAng) * orb.orbitRadius;
          const dx = tok.targetX - tok.startX, dy = tok.targetY - tok.startY, dist = Math.hypot(dx, dy);
          tok.durationMs = Math.max(H_HALF_MS, (dist / DRIFT_SPEED) * 1000);
          const flightSec = tok.durationMs * 0.001;
          // Carry radial bloom velocity directly into Bezier P1 (ignoring negligible orbital angular speed)
          const bloomSpeed = orb.orbitRadius / Math.max(0.001, orb.bloomMs * 0.001);
          const carryLen = (bloomSpeed * flightSec) / 3.0;
          tok.ctrl1X = tok.startX + Math.cos(endAng) * carryLen;
          tok.ctrl1Y = tok.startY + Math.sin(endAng) * carryLen;
          tok.ctrl2X = tok.startX + dx * 0.35;
          tok.ctrl2Y = tok.startY + dy * 0.35;
          tok.orbitDone = true;
        }
        p = Math.min(1.0, (tok.orbit ? (elapsed - tok.orbit.bloomMs) : elapsed) / tok.durationMs);
        if (tok.orbit) {
          const invP = 1.0 - p, invP2 = invP * invP, p2 = p * p;
          const w0 = invP2 * invP, w1 = 3.0 * invP2 * p, w2 = 3.0 * invP * p2, w3 = p2 * p;
          curX = w0 * tok.startX + w1 * tok.ctrl1X + w2 * tok.ctrl2X + w3 * tok.targetX;
          curY = w0 * tok.startY + w1 * tok.ctrl1Y + w2 * tok.ctrl2Y + w3 * tok.targetY;
        } else {
          const easeP = p * p * p, arcY = Math.sin(p * Math.PI) * -26;
          curX = tok.startX + (tok.targetX - tok.startX) * easeP;
          curY = tok.startY + (tok.targetY - tok.startY) * easeP + arcY;
        }
      }

      if (global.BoardRippleRenderer?.drawDoubleTokenBackTiles) {
        global.BoardRippleRenderer.drawDoubleTokenBackTiles(options.drawBezelHex, curX, curY, hexRadius - 1.5, '#10b981', '#10b981', options.ghostBorderOp ?? 1.00, tok.spinStartTime ?? tok.startTime, tok.tokenIdx || 0, now);
      } else if (typeof options.drawBezelHex === 'function') {
        options.drawBezelHex(curX, curY, hexRadius - 1.5, '#10b981', '#10b981', 0, options.ghostBorderOp ?? 1.00, '#10b981');
      }
      if (global.PolyhedronRenderer?.drawComponent) {
        const pScale = global.COSMOS_STATE?.placedScale || 0.65;
        global.PolyhedronRenderer.drawComponent(ctx, curX, curY, hexRadius * pScale, 'green', elapsedTime, false, false, 1.0, tok.seedPhase ?? 0.5, tok.seedTilt ?? 0.5);
      }

      if (p >= 1.0 && !tok.completed) {
        tok.completed = true;
        this.activeHealTokens.splice(i, 1);
        if (typeof tok.onImpact === 'function') tok.onImpact();
      }
    }
  };

  window.ROLL_CALL = window.ROLL_CALL || new Map();
  window.ROLL_CALL.set('Last_Breath_Manager_1.1', global.LastBreathManager);
})(typeof window !== 'undefined' ? window : this);
