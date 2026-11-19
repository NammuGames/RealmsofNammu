/**
 * @fileoverview cells/hex_ui/Game_Settings_Pause.js - Pause Menu, Multi-Day Leave & Pass Host UI
 * @description Phase 3 Pause Menu engine for GameSettingsCanvas:
 * 1. Player Info (with "Host • " prefix when Host + click -> StatCanvas ghost-filtered local selector).
 * 2. Resume Game.
 * 3. Pass Host (Host -> StatCanvas ghosting offline peers -> HOST_OFFER) / Receive Host (Guest un-ghosted on offer).
 * 4. Leave Match (auto-save + close room + return to Game Menu without forfeiting).
 * 5. Quit Match (forfeits ONLY the current paused player to 0 HP).
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const Proto = global.GameSettingsCanvasClass
    ? global.GameSettingsCanvasClass.prototype
    : (global.GameSettingsCanvas ? Object.getPrototypeOf(global.GameSettingsCanvas) : null);
  if (!Proto) return;

  const origOpenPause = Proto.openInGamePause;
  Proto.openInGamePause = function(origin = 'btn-nav-menu', options = {}) {
    if (!options.keepPausedSeat) {
      const net = global.NetworkP2PManager;
      this.pausedPlayerIndex = net?.getDefaultPausedPlayerIndex
        ? net.getDefaultPausedPlayerIndex()
        : (global.GameState?.activePlayerIndex || 0);
    }
    return origOpenPause.call(this, origin, options);
  };

  Proto.leaveMatchToMenu = function() {
    const state = global.GameState;
    const net = global.NetworkP2PManager;
    const mc = global.MemoryCardManager;

    this.close(async () => {
      if (state?.matchStarted) {
        mc?.saveActivePuzzleMatch?.();
      }
      if (net?.isConnected?.()) {
        if (net.role === 'host') await net.closeRoomAndSave();
        else await net.leaveRoom();
      }
      state?.clearToPreMatch?.();
      this.isMatchActive = false;
      this.openSetupMenu('btn-nav-menu', { silent: true });
      global.GameState?.showToast?.('💾 Match saved — returned to Game Menu');
    });
  };

  Proto.forfeitPlayerByIndex = function(playerIdx, opts = {}) {
    const state = global.GameState;
    if (!state?.matchStarted) {
      state?.clearToPreMatch?.();
      this.isMatchActive = false;
      this.openSetupMenu();
      return;
    }

    const idx = Math.max(0, Math.min((state.players?.length || 1) - 1, playerIdx ?? (state.activePlayerIndex || 0)));
    const isActiveTurnSeat = (idx === (state.activePlayerIndex || 0));
    const net = global.NetworkP2PManager;

    if (!opts.fromRemote && net?.isConnected?.()) {
      net._emit?.('PLAYER_FORFEIT', { seatIndex: idx });
    }

    const performDrop = () => {
      if (isActiveTurnSeat) {
        state.inSigilStage = false;
        state.activeMaterialMod = null;
        state.inForesightMode = false;
        state.inTeleportMode = false;
        state.inChargeMode = false;
        state.inShiftMode = false;
        state.inArchMode = false;
        state.inRitualMode = false;
        state.inManifestMode = false;
        state.inSpellOverflow = false;
        state.hp = 0;
        state.pendingHeal = 0;
        state.activeDamageTiles = [];
        global.MatchOrchestrator?.saveActivePlayerFromState?.(state);
        const pName = state.getActivePlayer?.()?.name || `Player ${idx + 1}`;
        state.showToast?.(`💀 ${pName} forfeited (0 HP)!`);
        if (global.TurnManager) {
          global.TurnManager.isEndingTurn = true;
          global.TurnManager.completeRoundAdvancement();
        } else {
          global.MatchOrchestrator?.triggerMatchEndSequence?.(state, false);
        }
      } else {
        const targetPlayer = state.players?.[idx];
        if (targetPlayer) {
          targetPlayer.hp = 0;
          targetPlayer.pendingHeal = 0;
        }
        const pName = targetPlayer?.name || `Player ${idx + 1}`;
        state.showToast?.(`💀 ${pName} forfeited (0 HP)!`);
        global.MemoryCardManager?.saveActivePuzzleMatch?.();
        const anyAlive = (state.players || []).some(p => (p?.hp ?? 0) > 0);
        if (!anyAlive) {
          global.MatchOrchestrator?.triggerMatchEndSequence?.(state, false);
        } else {
          state.syncUI?.();
          global.BoardRenderer?.render?.();
        }
      }
    };

    if (!opts.fromRemote && this.isOpen?.()) {
      this.close(performDrop);
    } else {
      performDrop();
    }
  };

  Proto.quitToSetup = function() {
    const pIdx = this.pausedPlayerIndex ?? (global.GameState?.activePlayerIndex || 0);
    this.forfeitPlayerByIndex(pIdx);
  };

  Proto.buildPauseScene = function() {
    const self = this;
    const state = global.GameState || {};
    const net = global.NetworkP2PManager;
    const players = Array.isArray(state.players) ? state.players : [];
    const pIdx = Math.max(0, Math.min(Math.max(0, players.length - 1), this.pausedPlayerIndex ?? (state.activePlayerIndex || 0)));
    const pObj = players[pIdx];
    const isActiveSeat = (pIdx === (state.activePlayerIndex || 0));

    const pName = pObj?.name || `Player ${pIdx + 1}`;
    const pScore = isActiveSeat ? (state.score || 0) : (pObj?.score || 0);
    const curRound = state.round || 1;
    const isHost = net?.role === 'host';
    const isGuest = net?.role === 'guest';
    const infoTitle = `${isHost ? 'Host • ' : ''}${pName} • Round ${curRound} • Score: ${pScore}`;

    // Build Pass Host / Receive Host pod config
    let hostTransferItem;
    if (isHost) {
      const hasPeers = (net.connections?.size || 0) > 0;
      hostTransferItem = {
        type: 'base',
        id: 'pause-pass-host',
        title: 'Pass Host',
        color: '#3d6eff',
        ghost: !hasPeers,
        onClick: () => {
          if (!hasPeers || !global.StatCanvas?.openForPlayerSelect) return;
          self.close(() => {
            global.StatCanvas.openForPlayerSelect((selectedPlayerId) => {
              net.offerHostToPlayer(selectedPlayerId);
              self.openInGamePause('btn-nav-menu', { keepPausedSeat: true });
            }, {
              returnToPause: true,
              isSelectable: (p) => net.isSeatOnlineRemote((p.id || 1) - 1)
            });
          });
        }
      };
    } else if (isGuest) {
      const hasOffer = !!net.pendingHostOfferForMe;
      hostTransferItem = {
        type: 'base',
        id: 'pause-receive-host',
        title: 'Receive Host',
        color: hasOffer ? '#10f000' : '#953ffd',
        isDoubleBorder: hasOffer,
        ghost: !hasOffer,
        onClick: () => {
          if (!hasOffer) return;
          net.acceptHostOffer();
          self.rebuildTopFrame?.();
        }
      };
    } else {
      hostTransferItem = {
        type: 'base',
        id: 'pause-pass-host',
        title: 'Pass Host',
        color: '#953ffd',
        ghost: true
      };
    }

    this.renderColumn('Game Paused', false, [
      {
        type: 'base',
        id: 'pause-match-info',
        title: infoTitle,
        color: '#38bdf8',
        onClick: () => {
          if (!global.StatCanvas?.openForPlayerSelect || players.length <= 1) return;
          self.close(() => {
            global.StatCanvas.openForPlayerSelect((selectedPlayerId) => {
              self.pausedPlayerIndex = Math.max(0, (selectedPlayerId || 1) - 1);
              self.openInGamePause('btn-nav-menu', { keepPausedSeat: true });
            }, {
              returnToPause: true,
              isSelectable: (p) => (net ? net.isSeatLocal((p.id || 1) - 1) : true)
            });
          });
        }
      },
      {
        type: 'base',
        id: 'pause-resume',
        title: '▶ Resume Game',
        color: '#00ff88',
        isDoubleBorder: true,
        onClick: () => self.close()
      },
      hostTransferItem,
      {
        type: 'base',
        id: 'pause-leave-match',
        title: 'Leave Match',
        color: '#ff9214',
        onClick: () => self.leaveMatchToMenu()
      },
      {
        type: 'base',
        id: 'pause-quit-match',
        title: 'Quit Match',
        color: '#ff3333',
        onClick: () => self.quitToSetup()
      }
    ]);
  };
})(typeof window !== 'undefined' ? window : this);
