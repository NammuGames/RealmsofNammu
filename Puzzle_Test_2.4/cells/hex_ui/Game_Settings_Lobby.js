/**
 * @fileoverview cells/hex_ui/Game_Settings_Lobby.js - Lobby, Host, Join & Saved Level Inspector
 * @description Phase 2 Canvas 2D sub-pages for GameSettingsCanvas:
 * 1. Lobby (Local/Online mode toggle, Match Naming, # Local Player(s) stepper, Host, Join).
 * 2. Host & Join pages backed by persistent unique Room Codes (nammu-<roomCode>).
 * 3. Read-only Level Settings viewer when a Saved Match is armed ("New Match" required to edit).
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const Proto = global.GameSettingsCanvasClass
    ? global.GameSettingsCanvasClass.prototype
    : (global.GameSettingsCanvas ? Object.getPrototypeOf(global.GameSettingsCanvas) : null);
  if (!Proto) return;

  const origLobbyPop = Proto.popColumn;
  if (typeof origLobbyPop === 'function') {
    Proto.popColumn = function(options = {}) {
      this._joiningRoom = false;
      return origLobbyPop.call(this, options);
    };
  }
  const origLobbyClose = Proto.close;
  if (typeof origLobbyClose === 'function') {
    Proto.close = function(onDone) {
      this._joiningRoom = false;
      return origLobbyClose.call(this, onDone);
    };
  }

  Proto.getPendingRoomCode = function() {
    if (!this.config.pendingRoomCode) {
      this.config.pendingRoomCode = global.MemoryCardManager?.generateUniqueRoomCode?.() || '4K9P';
    }
    return this.config.pendingRoomCode;
  };

  Proto.getPendingMatchName = function() {
    return String(this.config.pendingMatchName || '').trim();
  };

  Proto._focusHiddenInput = function(opts = {}) {
    if (typeof document === 'undefined') return;
    const self = this;
    let inp = document.getElementById('nammu-hidden-menu-input');
    if (!inp) {
      inp = document.createElement('input');
      inp.id = 'nammu-hidden-menu-input';
      inp.type = 'text';
      inp.autocomplete = 'off';
      inp.spellcheck = false;
      Object.assign(inp.style, { position: 'fixed', opacity: '0', pointerEvents: 'none', left: '-999px', top: '0', fontSize: '16px' });
      document.body.appendChild(inp);
    }
    const clampFn = global.GameSettingsRenamePopup?.clampWeightedName;
    if (opts.maxLength) inp.maxLength = opts.maxLength;
    else inp.removeAttribute('maxlength');
    inp.value = opts.initialValue || '';
    inp.oninput = () => {
      let cleaned = opts.transform ? opts.transform(inp.value) : inp.value;
      if (!opts.maxLength && clampFn) cleaned = clampFn(cleaned);
      if (inp.value !== cleaned) inp.value = cleaned;
      opts.onChange?.(cleaned);
      self.rebuildTopFrame();
    };
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        inp.blur();
        opts.onSubmit?.(inp.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        inp.blur();
      }
    };
    inp.focus();
  };

  // ── 1. PLAYERS / LOBBY COLUMN (MATCH SELECTOR TOP, LOCAL PLAYERS, HOST, JOIN) ──
  Proto._startHostRoomStatCanvas = function(originId = 'pod-base-mp-host') {
    const net = global.NetworkP2PManager;
    if (!net) { global.GameState?.showToast?.('⚠️ Online P2P only active inside Nammu Hub.'); return; }
    const roomCode = this.getPendingRoomCode();
    const armedDraft = this.getArmedDraft ? this.getArmedDraft() : null;
    const matchName = String(armedDraft?.matchName || this.config.pendingMatchName || '').trim();
    this.config.lobbyMode = 'Online';
    net.hostRoom(roomCode, { matchName, localPlayerCount: this.config.playerCount }).then((res) => {
      if (res?.roomCode) this.config.pendingRoomCode = res.roomCode;
    }).catch(() => {});
    if (global.RoomStatCanvas?.open) {
      global.RoomStatCanvas.open({ origin: originId });
    }
  };

  Proto._startGuestSearchingCanvas = function(code, originId = 'pod-base-mp-join') {
    const net = global.NetworkP2PManager;
    if (!net) { global.GameState?.showToast?.('⚠️ Online P2P only active inside Nammu Hub.'); return; }
    const cleanCode = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (cleanCode.length < 4) return;
    this._joinRoomCode = cleanCode;
    this.config.lobbyMode = 'Online';
    net._awaitingEnterMatch = false;
    net.joinRoom(cleanCode, { keepSearching: true, localPlayerCount: this.config.playerCount }).catch(() => {});
    if (global.RoomStatCanvas?.open) {
      global.RoomStatCanvas.open({ origin: originId });
    }
  };

  Proto.renderMultiplayerColumn = function() {
    const self = this;
    const mc = global.MemoryCardManager;
    const net = global.NetworkP2PManager;
    const armedDraft = this.getArmedDraft ? this.getArmedDraft() : null;
    const armedSave = this.getArmedSavedMatch ? this.getArmedSavedMatch() : null;
    const isStartedSave = !!(armedSave && armedSave.matchType !== 'Draft');
    const isHosting = net?.role === 'host';

    // Top slot (Index 0): Fused Match Selector + Match Name -> always opens Matches list
    const activeCard = armedDraft || (isStartedSave ? armedSave : null);
    const pendingName = String(this.config.pendingMatchName || (isHosting ? net.matchName : '') || '').trim();
    const topLeftTitle = activeCard ? (activeCard.matchName || activeCard.name || 'Match') : (pendingName || 'New Match');
    const topRightTag = activeCard && mc?.getMatchTagLabel ? mc.getMatchTagLabel(activeCard) : 'Create';
    const topMatchBtn = {
      type: 'preset_name',
      id: 'players-matches-selector',
      title: topLeftTitle,
      categoryIndexText: topRightTag,
      color: activeCard ? '#ff8800' : '#10f000',
      isDoubleBorder: !!activeCard,
      onClick: () => self.pushColumn('Matches', () => self.renderSavedMatchesColumn())
    };

    if (isStartedSave) {
      const pCount = armedSave.playerCount || 1;
      const items = [
        topMatchBtn,
        {
          type: 'half_stepper', id: 'players', title: 'Local Players', color: '#953ffd',
          valText: `${pCount} Local Player${pCount > 1 ? 's' : ''}`,
          isReadOnly: true,
          onDelta: () => {}
        },
        { type: 'base', id: 'mp-host', title: 'Host', color: '#953ffd', ghost: true, isReadOnly: true },
        { type: 'base', id: 'mp-join', title: 'Join', color: '#953ffd', ghost: true, isReadOnly: true }
      ];

      this.renderColumn('Lobby', true, items);
      return;
    }

    const items = [
      topMatchBtn,
      {
        type: 'half_stepper', id: 'players', title: 'Local Players', color: '#10f000',
        valText: `${this.config.playerCount} Local Player${this.config.playerCount > 1 ? 's' : ''}`,
        onDelta: (d) => {
          self.config.playerCount = Math.max(1, Math.min(6, self.config.playerCount + d));
          self.syncArmedDraftSettings?.();
          if (isHosting) net.setLocalPlayerCount?.(self.config.playerCount);
          self.buildScene();
        }
      },
      isHosting
        ? {
            type: 'preset_name', id: 'mp-open-room',
            title: `Room ${net.roomCode}`, categoryIndexText: `${net.getRoomSeats?.().length || 1}/6`,
            color: '#10f000', isDoubleBorder: false,
            onClick: () => {
              if (net.roomLocked && !net._isMatchActive?.()) net.setRoomLocked?.(false);
              global.RoomStatCanvas?.open?.({ origin: 'pod-preset-mp-open-room' });
            }
          }
        : {
            type: 'base', id: 'mp-host', title: 'Host', color: '#10f000',
            onClick: () => self._startHostRoomStatCanvas('pod-base-mp-host')
          },
      isHosting
        ? { type: 'base', id: 'mp-join', title: 'Join', color: '#3d6eff', ghost: true, isReadOnly: true }
        : {
            type: 'base', id: 'mp-join', title: 'Join', color: '#3d6eff',
            onClick: () => {
              if (!net) { global.GameState?.showToast?.('⚠️ Online P2P only active inside Nammu Hub.'); return; }
              if (global.GameSettingsRenamePopup?.openRoomCode) {
                global.GameSettingsRenamePopup.openRoomCode('', (enteredCode) => {
                  if (!enteredCode) return;
                  self._startGuestSearchingCanvas(enteredCode, 'pod-base-mp-join');
                }, { originNode: 'pod-base-mp-join' });
              }
            }
          }
    ];

    this.renderColumn('Lobby', true, items);
  };

  Proto.renderHostRoomColumn = function() { this.renderMultiplayerColumn(); };
  Proto.renderJoinRoomColumn = function() { this.renderMultiplayerColumn(); };
})(typeof window !== 'undefined' ? window : this);
