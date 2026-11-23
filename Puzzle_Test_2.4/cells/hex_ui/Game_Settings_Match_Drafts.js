/**
 * @fileoverview cells/hex_ui/Game_Settings_Match_Drafts.js - Match Drafts, Copy Mode & Direct Resume
 * @description Companion cell for GameSettingsCanvasClass handling:
 * 1. Armed Draft state, editable Draft rules (including copied external presets), and live Draft sync.
 * 2. Matches List direct-click routing (Draft -> arm, Local -> board, Host/Guest -> RoomStatCanvas).
 * 3. Yellow Copy mode cloning ("<Name> (Copy)" -> editable Draft) & New Match Draft creation.
 * 4. Mandatory Begin Match naming gate and in-place Draft -> Local/Host promotion on launch.
 * Strictly adheres to the 500-line hard cap and underscore naming conventions.
 */

(function(global) {
  'use strict';

  const Proto = global.GameSettingsCanvasClass
    ? global.GameSettingsCanvasClass.prototype
    : (global.GameSettingsCanvas ? Object.getPrototypeOf(global.GameSettingsCanvas) : null);
  if (!Proto) return;

  function deepClone(obj) {
    return obj ? JSON.parse(JSON.stringify(obj)) : null;
  }

  Proto.getArmedDraft = function() {
    if (!this.armedDraftId || !global.MemoryCardManager?.getSaveById) return null;
    const found = global.MemoryCardManager.getSaveById(this.armedDraftId);
    if (!found || found.matchType !== 'Draft') {
      this.armedDraftId = null;
      this.armedDraftPreset = null;
      return null;
    }
    return found;
  };

  Proto.isMatchReadOnly = function() {
    const net = global.NetworkP2PManager;
    if (net?.role === 'guest' && net?.isConnected?.()) return true;
    const armedSave = this.getArmedSavedMatch ? this.getArmedSavedMatch() : null;
    return !!(armedSave && armedSave.matchType !== 'Draft');
  };

  Proto.buildReadOnlyPresetFromSave = function(save) {
    if (!save) return null;
    if (save.presetSnapshot && save.presetSnapshot.match) {
      return deepClone(save.presetSnapshot);
    }
    const mc = save.matchConfig || {};
    const fallback = this.config.presets?.[0] || {};
    return {
      id: save.id || 'ro_preset',
      name: save.presetName || mc.presetName || fallback.name || 'Meditate',
      isDefault: false,
      match: {
        materialComposition: mc.materialComposition || 'Even',
        luckComposition: mc.luckComposition || 'Ether',
        startingSpells: mc.startingSpells ?? 0,
        rounds: (mc.isEndless || mc.rounds === '∞') ? 144 : (Number(mc.rounds ?? save.maxRounds) || 144),
        boardRadius: Number(mc.boardRadius ?? save.boardRadius) || 6,
        isEndless: !!(mc.isEndless ?? save.isEndless ?? (mc.rounds === '∞'))
      },
      luck: deepClone(mc.luckPreset || mc.luck || fallback.luck || { activePlayfieldIndex: 0, activeMaterialIndex: 0, playfieldItems: [], materialItems: [] }),
      blight: deepClone(mc.blightPreset || mc.blight || fallback.blight || { activePlayfieldIndex: 0, activeMaterialIndex: 0, playfieldItems: [], materialItems: [] })
    };
  };

  Proto.getReadOnlyLevelPreset = function() {
    const net = global.NetworkP2PManager;
    if (net?.role === 'guest' && net?.isConnected?.()) {
      return this.buildReadOnlyPresetFromSave({
        presetName: net.hostPresetName || 'Host Preset',
        matchConfig: net.hostMatchConfig || {}
      });
    }
    const armedSave = this.getArmedSavedMatch ? this.getArmedSavedMatch() : null;
    if (armedSave && armedSave.matchType !== 'Draft') {
      return this.buildReadOnlyPresetFromSave(armedSave);
    }
    return null;
  };

  Proto.armDraft = function(draft) {
    if (!draft || draft.matchType !== 'Draft') return false;
    this.selectedSavedMatchId = null;
    this.armedDraftId = draft.id;
    this.config.pendingMatchName = draft.matchName || draft.name || '';
    this.config.playerCount = Math.max(1, Math.min(6, Number(draft.playerCount) || 1));

    const snap = draft.presetSnapshot ? deepClone(draft.presetSnapshot) : null;
    if (snap) {
      if (!snap.match) snap.match = {};
      if (!snap.luck) snap.luck = deepClone(this.config.presets?.[0]?.luck || { activePlayfieldIndex: 0, activeMaterialIndex: 0, playfieldItems: [], materialItems: [] });
      if (!snap.blight) snap.blight = deepClone(this.config.presets?.[0]?.blight || { activePlayfieldIndex: 0, activeMaterialIndex: 0, playfieldItems: [], materialItems: [] });
      this.armedDraftPreset = snap;
      const matchIdx = (this.config.presets || []).findIndex(p => p.id === snap.id);
      if (matchIdx >= 0) this.config.activePresetIndex = matchIdx;
    } else {
      this.armedDraftPreset = null;
    }

    const net = global.NetworkP2PManager;
    if (net?.role === 'host') {
      net.matchName = this.config.pendingMatchName;
      net.setLocalPlayerCount?.(this.config.playerCount);
      net._broadcastRoster?.();
    }
    return true;
  };

  Proto.clearArmedDraft = function(keepPendingName = false) {
    this.armedDraftId = null;
    this.armedDraftPreset = null;
    if (!keepPendingName && this.config) {
      this.config.pendingMatchName = null;
    }
  };

  Proto.applySelectedPresetToArmedDraft = function(preset) {
    if (!this.armedDraftId || !preset) return false;
    this.armedDraftPreset = deepClone(preset);
    return this.syncArmedDraftSettings();
  };

  Proto.syncArmedDraftSettings = function() {
    const draft = this.getArmedDraft();
    if (!draft || !global.MemoryCardManager?.updateDraft) return false;
    const wp = this.armedDraftPreset || this.getActiveWorkingPreset?.();
    const m = wp?.match || {};
    const matchConfig = {
      playerCount: this.config.playerCount || 1,
      presetName: wp?.name || draft.presetName || 'Meditate',
      boardRadius: m.boardRadius ?? 6,
      materialComposition: m.materialComposition || 'Even',
      luckComposition: m.luckComposition || 'Ether',
      startingSpells: Number(m.startingSpells ?? 0),
      rounds: m.isEndless ? '∞' : (m.rounds ?? 144),
      isEndless: !!m.isEndless,
      luck: wp?.luck ? deepClone(wp.luck) : null,
      blight: wp?.blight ? deepClone(wp.blight) : null
    };
    global.MemoryCardManager.updateDraft(draft.id, {
      name: this.config.pendingMatchName || draft.matchName,
      playerCount: this.config.playerCount || 1,
      presetName: wp?.name || draft.presetName || 'Meditate',
      matchConfig,
      presetSnapshot: wp ? deepClone(wp) : draft.presetSnapshot
    });
    return true;
  };

  /** Opens naming popup to create & arm a brand-new named Draft card. */
  Proto.promptCreateNewDraft = function(originNode = 'pod-preset-match-slot-new') {
    const self = this;
    const mc = global.MemoryCardManager;
    const wp = this.getActiveWorkingPreset?.() || this.config.presets?.[0] || {};
    const onConfirmName = (entered) => {
      const clean = String(entered || '').trim();
      if (!clean) return;
      const m = wp.match || {};
      const created = mc?.createDraft?.({
        name: clean,
        playerCount: self.config.playerCount || 1,
        presetName: wp.name || 'Meditate',
        matchConfig: {
          ...m,
          presetName: wp.name || 'Meditate',
          luck: wp.luck ? deepClone(wp.luck) : null,
          blight: wp.blight ? deepClone(wp.blight) : null
        },
        presetSnapshot: deepClone(wp)
      });
      if (created) {
        self.armDraft(created);
        global.GameState?.showToast?.(`✦ Created Draft "${created.matchName}" (${mc.getMatchTagLabel(created)})`);
      } else {
        self.clearArmedDraft();
        self.selectedSavedMatchId = null;
        self.config.pendingMatchName = clean;
      }
      if (self.history?.length > 1) self.popColumn();
      else self.rebuildTopFrame();
    };

    if (global.GameSettingsRenamePopup?.openSingleText) {
      global.GameSettingsRenamePopup.openSingleText({
        title: 'New Match Name',
        initialValue: '',
        placeholder: 'Enter Match Name',
        requireNonEmpty: true,
        originNode,
        onConfirm: onConfirmName
      });
    } else {
      onConfirmName(`Match ${Date.now().toString().slice(-3)}`);
    }
  };

  /** Opens naming popup pre-filled with "<SourceName> (Copy)" and clones into a new Draft. */
  Proto.promptCopyMatchToDraft = function(sourceSave, originNode = null) {
    if (!sourceSave) return;
    const self = this;
    const mc = global.MemoryCardManager;
    const baseName = sourceSave.matchName || sourceSave.name || 'Match';
    const prefill = this.formatCopyName ? this.formatCopyName(baseName) : `${baseName} (Copy)`;

    const onConfirmCopy = (entered) => {
      const clean = String(entered || '').trim();
      if (!clean) return;
      const cloned = mc?.cloneMatchToDraft?.(sourceSave.id, clean);
      self._isMatchCopyMode = false;
      if (cloned) {
        self.armDraft(cloned);
        global.GameState?.showToast?.(`✦ Copied to Draft "${cloned.matchName}" (${mc.getMatchTagLabel(cloned)})`);
        if (self.history?.length > 1) self.popColumn();
        else self.rebuildTopFrame();
      }
    };

    if (global.GameSettingsRenamePopup?.openSingleText) {
      global.GameSettingsRenamePopup.openSingleText({
        title: 'Copy Match to Draft',
        initialValue: prefill,
        placeholder: 'Draft Name',
        requireNonEmpty: true,
        originNode,
        onConfirm: onConfirmCopy
      });
    } else {
      onConfirmCopy(prefill);
    }
  };

  /** Routes normal-mode clicks on any card in the Matches list. */
  Proto.handleMatchCardSelect = function(save, originNode = null) {
    if (!save) return;
    const mc = global.MemoryCardManager;
    const net = global.NetworkP2PManager;
    const type = save.matchType || (save.isDraft ? 'Draft' : (save.lobbyMode === 'Online' ? (save.roleBadge === 'Host' ? 'Host' : 'Guest') : 'Local'));

    if (type === 'Draft') {
      this.armDraft(save);
      global.GameState?.showToast?.(`✦ Armed Draft "${save.matchName}"`);
      if (this.history?.length > 1) this.popColumn();
      else this.rebuildTopFrame();
      return;
    }

    if (type === 'Local') {
      this.clearArmedDraft();
      this.selectedSavedMatchId = save.id;
      if (net && net.role !== 'offline') net.leaveRoom?.();
      global.GameState?.showToast?.(`✦ Selected "${save.matchName || save.name || 'Local Match'}"`);
      if (this.history?.length > 1) this.popColumn();
      else this.rebuildTopFrame();
      return;
    }

    if (type === 'Host') {
      this.clearArmedDraft();
      this.selectedSavedMatchId = save.id;
      const roster = save.rosterMeta || {};
      const hostAndOpenRoom = async () => {
        if (net) {
          net.hydrateSavedRoster?.({
            hostPeerId: net.getDevicePeerId?.() || net.myPeerId,
            seatOwners: roster.seatOwners || save.seatOwners || [],
            roomSeats: roster.roomSeats || save.roomSeats || [],
            peers: roster.peers || save.peers || [],
            matchStarted: true
          });
          try {
            await net.hostRoom(save.roomCode || null, {
              matchName: save.matchName || save.name || '',
              matchStarted: true,
              roomLocked: true,
              seatOwners: roster.seatOwners || save.seatOwners,
              roomSeats: roster.roomSeats || save.roomSeats,
              peers: roster.peers || save.peers,
              localPlayerCount: save.playerCount || 1
            });
          } catch {}
          if (net.role === 'host') {
            if (!net.seatOwners?.length) {
              net._assignDefaultSeats?.(save.playerCount || 1);
              net._syncLockedRoomSeats?.();
            }
            net._broadcastRoster?.();
          }
        }
        if (global.RoomStatCanvas?.open) {
          global.RoomStatCanvas.open({ origin: originNode || 'btn-nav-menu', mode: 'saved_reentry', savedMatch: save });
        }
      };
      hostAndOpenRoom();
      return;
    }

    // Guest save: hydrate saved roster immediately, connect to roomCode, open RoomStatCanvas
    if (type === 'Guest') {
      this.clearArmedDraft();
      this.selectedSavedMatchId = save.id;
      const code = String(save.roomCode || '').trim().toUpperCase();
      if (!net || !code) {
        global.GameState?.showToast?.('⚠️ Online P2P room unavailable for this Guest save.');
        return;
      }
      const roster = save.rosterMeta || {};
      net.matchName = save.matchName || save.name || '';
      net.roomCode = code;
      net.role = 'guest';
      net.hostOnline = false;
      net.matchStarted = true;
      net._awaitingEnterMatch = true;
      net.hydrateSavedRoster?.({
        hostPeerId: roster.hostPeerId || null,
        seatOwners: roster.seatOwners || save.seatOwners || [],
        roomSeats: roster.roomSeats || save.roomSeats || [],
        peers: roster.peers || save.peers || [],
        matchStarted: true
      });
      net.joinRoom(code, { keepSearching: true, localPlayerCount: this.config.playerCount || 1 }).catch(() => {});
      if (global.RoomStatCanvas?.open) {
        global.RoomStatCanvas.open({ origin: originNode || 'btn-nav-menu', mode: 'saved_reentry', savedMatch: save });
      }
    }
  };

  /** Mandatory naming gate before launching a new match/Draft, or entering an armed saved match. */
  Proto.launchMatchWithNamingGate = function() {
    const self = this;
    const net = global.NetworkP2PManager;
    const mc = global.MemoryCardManager;
    const armedSave = this.getArmedSavedMatch ? this.getArmedSavedMatch() : null;

    if (armedSave && armedSave.matchType !== 'Draft') {
      if (armedSave.matchType === 'Guest') {
        if (net && !net.isHostOnline?.()) {
          global.AudioSynth?.playCancel?.();
          global.GameState?.showToast?.('⏳ Waiting for Host to come online...');
          return;
        }
        this.clearArmedDraft();
        this.isMatchActive = true;
        if (net?.pendingMatchStartSnap) {
          net.enterLoadedMatch?.();
        } else {
          if (net) net._awaitingEnterMatch = false;
          mc?.restorePuzzleState?.(armedSave);
          net?.requestLogCatchUp?.();
        }
        global.GameState?.showToast?.(`✦ Entered "${armedSave.matchName || armedSave.name || 'Online Match'}"`);
        return;
      }

      if (armedSave.matchType === 'Host') {
        this.clearArmedDraft();
        this.isMatchActive = true;
        mc?.restorePuzzleState?.(armedSave);
        if (net?.role === 'host') {
          if (!net.seatOwners?.length) {
            net._assignDefaultSeats?.(armedSave.playerCount || global.GameState?.playerCount || 1);
            net._syncLockedRoomSeats?.();
          }
          setTimeout(() => net.syncFullState?.('MATCH_RESUME'), 200);
        }
        global.GameState?.showToast?.(`✦ Entered "${armedSave.matchName || armedSave.name || 'Host Match'}"`);
        return;
      }

      this.clearArmedDraft();
      this.isMatchActive = true;
      if (net && net.role !== 'offline') net.leaveRoom?.();
      mc?.restorePuzzleState?.(armedSave);
      global.GameState?.showToast?.(`✦ Entered "${armedSave.matchName || armedSave.name || 'Local Match'}"`);
      return;
    }

    if (net?.role === 'guest' && net?.isConnected?.()) {
      global.GameState?.showToast?.('⏳ Waiting for Host to start the match...');
      return;
    }

    const armedDraft = this.getArmedDraft();
    const existingName = String(
      armedDraft?.matchName || (net?.role === 'host' ? net.matchName : '') || this.config.pendingMatchName || ''
    ).trim();

    if (existingName) {
      this._executeNewMatchLaunch(existingName, armedDraft);
      return;
    }

    if (global.GameSettingsRenamePopup?.openSingleText) {
      global.GameSettingsRenamePopup.openSingleText({
        title: 'Name Your Match',
        initialValue: '',
        placeholder: 'Enter Match Name',
        requireNonEmpty: true,
        originNode: 'pod-base-begin-match',
        onConfirm: (entered) => {
          const clean = String(entered || '').trim();
          if (!clean) return;
          self.config.pendingMatchName = clean;
          if (net?.role === 'host') {
            net.matchName = clean;
            net._broadcastRoster?.();
          }
          self._executeNewMatchLaunch(clean, armedDraft);
        }
      });
    } else {
      this._executeNewMatchLaunch('New Match', armedDraft);
    }
  };
})(typeof window !== 'undefined' ? window : this);
