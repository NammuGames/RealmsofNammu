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
    if (!this.config.pendingMatchName) {
      const count = (global.MemoryCardManager?.listSaves?.().length || 0) + 1;
      this.config.pendingMatchName = `Match ${String(count).padStart(3, '0')}`;
    }
    return this.config.pendingMatchName;
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
    inp.maxLength = opts.maxLength || 18;
    inp.value = opts.initialValue || '';
    inp.oninput = () => {
      const cleaned = opts.transform ? opts.transform(inp.value) : inp.value;
      inp.value = cleaned;
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

  // ── 1. PLAYERS / LOBBY COLUMN (LOCAL PLAYERS, MATCH NAME, HOST, JOIN) ─────
  Proto._startHostRoomStatCanvas = function(originId = 'pod-base-mp-host') {
    const net = global.NetworkP2PManager;
    if (!net) { global.GameState?.showToast?.('⚠️ Online P2P only active inside Nammu Hub.'); return; }
    const roomCode = this.getPendingRoomCode();
    const matchName = this.getPendingMatchName();
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

    net.joinRoom(cleanCode, { keepSearching: true, localPlayerCount: this.config.playerCount }).then((res) => {
      if (res?.ok) {
        global.MemoryCardManager?.saveJoinedLobbyMatch?.({
          roomCode: net.roomCode || cleanCode,
          matchName: net.matchName,
          presetName: net.hostPresetName,
          playerCount: net.hostPlayerCount,
          matchConfig: net.hostMatchConfig
        });
      }
    }).catch(() => {});

    if (global.RoomStatCanvas?.open) {
      global.RoomStatCanvas.open({ origin: originId });
    }
  };

  Proto.renderMultiplayerColumn = function() {
    const self = this;
    const armed = this.getArmedSavedMatch ? this.getArmedSavedMatch() : null;
    const net = global.NetworkP2PManager;

    if (armed) {
      const pCount = armed.playerCount || 1;
      const lMode = armed.lobbyMode || 'Local';
      const lockedNotice = () => global.GameState?.showToast?.('🔒 View-Only: Select "New Match" in Matches to edit.');

      const items = [
        {
          type: 'half_stepper', id: 'players', title: 'Local Players', color: '#953ffd',
          valText: `${pCount} Local Player${pCount > 1 ? 's' : ''}`,
          onDelta: () => lockedNotice()
        },
        {
          type: 'preset_name', id: 'lobby-mode-view',
          title: lMode, categoryIndexText: 'Mode', color: '#953ffd',
          onClick: () => lockedNotice()
        },
        {
          type: 'preset_name', id: 'lobby-match-name-view',
          title: armed.matchName || 'Saved Match', categoryIndexText: 'Match Name', color: '#953ffd',
          onClick: () => lockedNotice()
        },
        {
          type: 'preset_name', id: 'lobby-room-code-view',
          title: armed.roomCode || '----', categoryIndexText: 'Room Code', color: '#3d6eff',
          onClick: () => {
            if (armed.roomCode && global.navigator?.clipboard?.writeText) {
              global.navigator.clipboard.writeText(armed.roomCode);
              global.GameState?.showToast?.(`📋 Copied Room Code: ${armed.roomCode}`);
            }
          }
        }
      ];

      if (lMode === 'Online' || armed.roleBadge === 'Host') {
        items.push({
          type: 'base', id: 'mp-host', title: 'Host Room', color: '#10f000',
          onClick: () => {
            if (!net) { global.GameState?.showToast?.('⚠️ Online P2P only active inside Nammu Hub.'); return; }
            net.hostRoom(armed.roomCode || null, { matchName: armed.matchName, localPlayerCount: armed.playerCount || 1 }).catch(() => {});
            global.RoomStatCanvas?.open?.({ origin: 'pod-base-mp-host' });
          }
        });
      }
      if (armed.roomCode) {
        items.push({
          type: 'base', id: 'mp-join', title: 'Join Room', color: '#3d6eff',
          onClick: () => self._startGuestSearchingCanvas(armed.roomCode, 'pod-base-mp-join')
        });
      }

      this.renderColumn('Players (View Only)', true, items);
      return;
    }

    const isHosting = net?.role === 'host';
    const matchName = isHosting ? (net.matchName || this.getPendingMatchName()) : this.getPendingMatchName();
    const items = [];

    if (isHosting) {
      items.push({
        type: 'preset_name', id: 'mp-open-room',
        title: `Room ${net.roomCode}`, categoryIndexText: `${net.getRoomSeats?.().length || 1}/6`,
        color: '#10f000', isDoubleBorder: true,
        onClick: () => global.RoomStatCanvas?.open?.({ origin: 'pod-preset-mp-open-room' })
      });
    }

    items.push(
      {
        type: 'half_stepper', id: 'players', title: 'Local Players', color: '#10f000',
        valText: `${this.config.playerCount} Local Player${this.config.playerCount > 1 ? 's' : ''}`,
        onDelta: (d) => {
          self.config.playerCount = Math.max(1, Math.min(6, self.config.playerCount + d));
          if (isHosting) net.setLocalPlayerCount?.(self.config.playerCount);
          self.buildScene();
        }
      },
      {
        type: 'preset_name', id: 'lobby-match-name',
        title: matchName, categoryIndexText: 'Match Name', color: '#3d6eff',
        onClick: () => {
          if (global.GameSettingsRenamePopup?.openSingleText) {
            global.GameSettingsRenamePopup.openSingleText({
              title: 'Enter Match Name',
              initialValue: matchName,
              placeholder: 'Match 001',
              maxLength: 18,
              originNode: 'pod-preset-lobby-match-name',
              onConfirm: (val) => {
                self.config.pendingMatchName = val || 'Match 001';
                if (isHosting) {
                  net.matchName = self.config.pendingMatchName;
                  net._broadcastRoster?.();
                }
                self.rebuildTopFrame();
              }
            });
          } else {
            self._focusHiddenInput({
              maxLength: 18,
              initialValue: matchName,
              onChange: (val) => { self.config.pendingMatchName = val || 'Match 001'; }
            });
          }
        }
      }
    );

    if (isHosting) {
      items.push({
        type: 'base', id: 'mp-leave-host', title: 'Close Host Room', color: '#ff3333',
        onClick: () => {
          self.config.lobbyMode = 'Local';
          net.closeRoomAndSave().then(() => self.rebuildTopFrame());
        }
      });
    } else {
      items.push(
        {
          type: 'base', id: 'mp-host', title: 'Host', color: '#10f000',
          onClick: () => self._startHostRoomStatCanvas('pod-base-mp-host')
        },
        {
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
      );

      // Quick-join chips for saved online matches
      const saves = (global.MemoryCardManager?.listSaves?.() || []).filter(s => s?.roomCode);
      saves.slice(0, 2).forEach((s, idx) => {
        items.push({
          type: 'preset_name', id: `join-saved-${idx}`,
          title: s.matchName || 'Saved Match', categoryIndexText: `Join ${s.roomCode}`,
          color: '#3d6eff',
          onClick: () => self._startGuestSearchingCanvas(s.roomCode, `pod-preset-join-saved-${idx}`)
        });
      });
    }

    this.renderColumn('Players', true, items);
  };

  Proto.renderHostRoomColumn = function() { this.renderMultiplayerColumn(); };
  Proto.renderJoinRoomColumn = function() { this.renderMultiplayerColumn(); };

  // ── 3. READ-ONLY LEVEL SETTINGS VIEW FOR ARMED SAVED MATCHES ──────────────
  Proto.renderSavedMatchLevelView = function(save) {
    const cfg = save?.matchConfig || {};
    const notice = () => global.GameState?.showToast?.('🔒 View-Only: Select "New Match" in Matches to edit.');
    const rText = cfg.isEndless || cfg.rounds === '∞' ? 'Endless' : `${cfg.rounds || 144}`;

    this.renderColumn('Level (View Only)', true, [
      { type: 'preset_name', id: 'ro-preset-name', title: save.presetName || 'Match Preset', categoryIndexText: 'Locked', color: '#953ffd', onClick: notice },
      { type: 'preset_name', id: 'ro-radius', title: `Radius ${cfg.boardRadius || save.boardRadius || 6}`, categoryIndexText: 'Playfield', color: '#3d6eff', onClick: notice },
      { type: 'preset_name', id: 'ro-rounds', title: `${rText} Rounds`, categoryIndexText: `Round ${save.round || 1}`, color: '#3d6eff', onClick: notice },
      { type: 'preset_name', id: 'ro-spells', title: `${cfg.startingSpells ?? 0} Starting Spells`, categoryIndexText: 'Grimoire', color: '#3d6eff', onClick: notice },
      { type: 'preset_name', id: 'ro-comp', title: `${cfg.materialComposition || 'Even'} / ${cfg.luckComposition || 'Ether'}`, categoryIndexText: 'Mix', color: '#3d6eff', onClick: notice }
    ]);
  };
})(typeof window !== 'undefined' ? window : this);
