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

  // ── 1. LOBBY COLUMN (LOCAL/ONLINE, PLAYERS, MATCH NAME, HOST, JOIN) ───────
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
          type: 'base', id: 'mp-host', title: 'Host', color: '#10f000',
          onClick: () => self.pushColumn('Host', () => self.renderHostRoomColumn())
        });
      }
      items.push({
        type: 'base', id: 'mp-join', title: 'Join', color: '#3d6eff',
        onClick: () => {
          if (armed.roomCode) self._joinRoomCode = armed.roomCode;
          self.pushColumn('Join', () => self.renderJoinRoomColumn());
        }
      });

      this.renderColumn('Lobby (View Only)', true, items);
      return;
    }

    const isOnline = (net?.isConnected?.() || this.config.lobbyMode === 'Online');
    const modeLabel = isOnline ? 'Online' : 'Local';
    const matchName = this.getPendingMatchName();

    this.renderColumn('Lobby', true, [
      {
        type: 'preset_name', id: 'lobby-mode-toggle',
        title: modeLabel, categoryIndexText: 'Mode',
        color: isOnline ? '#3d6eff' : '#10f000', isDoubleBorder: isOnline,
        onClick: () => {
          if (net?.isConnected?.()) {
            global.GameState?.showToast?.('⚠️ Leave online room in Host/Join before switching to Local.');
            return;
          }
          self.config.lobbyMode = isOnline ? 'Local' : 'Online';
          self.buildScene();
        }
      },
      {
        type: 'half_stepper', id: 'players', title: 'Local Players', color: '#10f000',
        valText: `${this.config.playerCount} Local Player${this.config.playerCount > 1 ? 's' : ''}`,
        onDelta: (d) => { self.config.playerCount = Math.max(1, Math.min(6, self.config.playerCount + d)); self.buildScene(); }
      },
      {
        type: 'preset_name', id: 'lobby-match-name',
        title: matchName, categoryIndexText: 'Match Name', color: '#3d6eff',
        onClick: () => self._focusHiddenInput({
          maxLength: 18,
          initialValue: self.getPendingMatchName(),
          onChange: (val) => { self.config.pendingMatchName = val || 'Match 001'; }
        })
      },
      {
        type: 'base', id: 'mp-host', title: 'Host', color: '#10f000',
        onClick: () => {
          self.config.lobbyMode = 'Online';
          self.pushColumn('Host', () => self.renderHostRoomColumn());
        }
      },
      {
        type: 'base', id: 'mp-join', title: 'Join', color: '#3d6eff',
        onClick: () => {
          self.config.lobbyMode = 'Online';
          self.pushColumn('Join', () => self.renderJoinRoomColumn());
        }
      }
    ]);
  };

  // ── 2. HOST & JOIN SUB-PAGES ──────────────────────────────────────────────
  Proto.renderHostRoomColumn = function() {
    const self = this;
    const net = global.NetworkP2PManager;
    const armed = this.getArmedSavedMatch ? this.getArmedSavedMatch() : null;
    const isHosting = net?.role === 'host';
    const peersCount = net?.connections?.size || 0;
    const roomCode = armed?.roomCode || this.getPendingRoomCode();
    const matchName = armed?.matchName || this.getPendingMatchName();

    this.renderColumn('Host', true, [
      {
        type: 'preset_name', id: 'host-match-label',
        title: isHosting ? (net.matchName || matchName) : matchName,
        categoryIndexText: `Code ${isHosting ? net.roomCode : roomCode}`,
        color: isHosting ? '#10f000' : '#3d6eff',
        isDoubleBorder: isHosting,
        onClick: () => {
          const codeToCopy = isHosting ? net.roomCode : roomCode;
          if (global.navigator?.clipboard?.writeText) {
            global.navigator.clipboard.writeText(codeToCopy);
            global.GameState?.showToast?.(`📋 Copied Room Code: ${codeToCopy}`);
          }
        }
      },
      {
        type: 'preset_name', id: 'host-peers-badge',
        title: isHosting ? `${peersCount} Guest(s) Online` : 'Room Closed',
        categoryIndexText: isHosting ? 'Hosting' : 'Standby',
        color: isHosting ? '#10f000' : '#953ffd',
        onClick: () => {}
      },
      {
        type: 'base', id: 'host-start-room',
        title: isHosting ? 'Close Room' : 'Open Host Room',
        color: isHosting ? '#ff3333' : '#10f000',
        onClick: () => {
          if (!net) { global.GameState?.showToast?.('⚠️ Online P2P only active inside Nammu Hub.'); return; }
          if (isHosting) {
            net.leaveRoom().then(() => self.rebuildTopFrame());
          } else {
            net.hostRoom(roomCode, { matchName }).then(() => self.rebuildTopFrame()).catch(() => {});
          }
        }
      }
    ]);
  };

  Proto.renderJoinRoomColumn = function() {
    const self = this;
    const net = global.NetworkP2PManager;
    const isJoined = net?.role === 'guest';
    const code = this._joinRoomCode || '';

    const items = [
      {
        type: 'preset_name', id: 'join-code-entry',
        title: code || 'Tap To Enter',
        categoryIndexText: 'Room Code',
        color: code ? '#10f000' : '#3d6eff',
        isDoubleBorder: !!code,
        onClick: () => self._focusHiddenInput({
          maxLength: 8,
          initialValue: self._joinRoomCode || '',
          transform: (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8),
          onChange: (val) => { self._joinRoomCode = val; },
          onSubmit: () => {
            if (!net || !self._joinRoomCode) return;
            net.joinRoom(self._joinRoomCode).then(() => self.rebuildTopFrame()).catch(() => {});
          }
        })
      },
      {
        type: 'base', id: 'join-connect-btn',
        title: isJoined ? `Leave (${net.roomCode})` : 'Join Match',
        color: isJoined ? '#ff3333' : '#10f000',
        onClick: () => {
          if (!net) { global.GameState?.showToast?.('⚠️ Online P2P only active inside Nammu Hub.'); return; }
          if (isJoined) net.leaveRoom().then(() => self.rebuildTopFrame());
          else net.joinRoom(self._joinRoomCode).then(() => self.rebuildTopFrame()).catch(() => {});
        }
      }
    ];

    // Quick-fill buttons for previously saved matches with stored Room Codes
    const saves = (global.MemoryCardManager?.listSaves?.() || []).filter(s => s?.roomCode);
    saves.slice(0, 3).forEach((s, idx) => {
      items.push({
        type: 'preset_name',
        id: `join-saved-${idx}`,
        title: s.matchName || 'Saved Match',
        categoryIndexText: s.roomCode,
        color: '#3d6eff',
        onClick: () => {
          self._joinRoomCode = s.roomCode;
          global.GameState?.showToast?.(`✦ Selected Room Code ${s.roomCode}`);
          self.rebuildTopFrame();
        }
      });
    });

    this.renderColumn('Join', true, items);
  };

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
