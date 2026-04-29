(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ConnectionWindowRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createConnectionWindowRuntime(deps = {}) {
    const {
      id,
      win,
      options = {},
      buttons = {},
      grid,
      cards,
    } = deps;

    let latestPreflight = options.preflight || null;
    let latestStartupError = String(options.startupError || '').trim();
    let connectionCheckResults = Array.isArray(options.checkResults)
      ? options.checkResults.map(item => deps.sanitizeConnectionCheckResult(item)).filter(Boolean).slice(0, 8)
      : [];
    let connectionCheckViewMode = deps.normalizeConnectionCheckViewMode(options.checkViewMode);
    let refreshToken = 0;

    function nextRefreshToken() {
      refreshToken += 1;
      return refreshToken;
    }

    function isStaleRefreshToken(token) {
      return token !== refreshToken;
    }

    function syncConnectionWindowState() {
      deps.upsertWindowState(id, {
        kind: 'connection',
        sourceWindowId: options.sourceWindowId || null,
        checkResults: connectionCheckResults,
        checkViewMode: connectionCheckViewMode,
      });
    }

    function connectionPayload() {
      return deps.buildConnectionPayloadModel({
        latestPreflight,
        latestStartupError,
        browserState: {
          override: deps.readConnectionOverride(),
          lastSuccessfulOverride: deps.readLastSuccessfulConnectionOverride(),
          favoriteProfiles: deps.readFavoriteConnectionProfiles(),
          defaultFavoriteProfile: deps.readDefaultFavoriteConnectionProfile(),
          recentOverrides: deps.readRecentConnectionOverrides(),
          profileBundle: deps.buildConnectionProfileBundle(),
          connectionCheckResults,
          connectionCheckViewMode,
        },
      });
    }

    function buildFixShell() {
      return deps.buildConnectionFixShell(latestPreflight);
    }

    function shouldAutoRecoverStartup() {
      return !deps.startupBootstrapped() || !!latestStartupError;
    }

    async function applyConnectionTargetAction(override, successLabel) {
      const normalized = deps.persistConnectionOverride(override);
      if (!normalized) {
        deps.setStatus(false, 'no connection target available');
        return false;
      }
      deps.setStatus(true, `${successLabel}: ${deps.summarizeConnectionOverride(normalized)}`);
      if (shouldAutoRecoverStartup()) {
        await retryStartup();
      } else {
        await refreshConnection();
      }
      return true;
    }

    async function copyNamedConnectionTargetShell(override, label) {
      const shell = deps.buildShellForOverride(override);
      if (!shell) {
        deps.setStatus(false, `no shell export available for ${label}`);
        return false;
      }
      try {
        await deps.copyTextToClipboard(shell);
        deps.setStatus(true, `copied shell for ${label}`);
        return true;
      } catch (e) {
        deps.setStatus(false, e.message);
        return false;
      }
    }

    function rememberConnectionCheckResult(result) {
      const sanitized = deps.sanitizeConnectionCheckResult(result);
      if (!sanitized) return null;
      const key = deps.connectionOverrideKey(sanitized.target);
      connectionCheckResults = [
        sanitized,
        ...connectionCheckResults.filter(item => !(item.label === sanitized.label && deps.connectionOverrideKey(item.target) === key)),
      ].slice(0, 8);
      syncConnectionWindowState();
      return sanitized;
    }

    function removeConnectionCheckResult(result) {
      const sanitized = deps.sanitizeConnectionCheckResult(result);
      if (!sanitized) return;
      const key = deps.connectionOverrideKey(sanitized.target);
      connectionCheckResults = connectionCheckResults.filter(item => !(item.label === sanitized.label && deps.connectionOverrideKey(item.target) === key));
      syncConnectionWindowState();
    }

    function clearConnectionCheckResults() {
      connectionCheckResults = [];
      syncConnectionWindowState();
    }

    async function checkConnectionTargetPreflight(target, label) {
      const normalized = deps.sanitizeConnectionOverride(target);
      if (!normalized) {
        deps.setStatus(false, `no target available to check for ${label}`);
        return null;
      }
      try {
        const data = await deps.api('/connection/preflight', {
          connectionOverride: normalized,
        });
        const result = rememberConnectionCheckResult(deps.captureConnectionCheckResult({
          label,
          target: normalized,
          status: data?.success ? 'ok' : 'error',
          checkedAt: new Date().toISOString(),
          exception: data?.exception || '',
          effectiveTarget: data?.connection?.configured?.effectiveTarget || '',
          stoneSource: data?.connection?.configured?.stoneSource || '',
        }, data));
        if (data?.success) {
          deps.setStatus(true, `checked ${label}: ok`);
        } else {
          deps.setStatus(false, `checked ${label}: ${data?.exception || 'connection failed'}`);
        }
        renderConnection(latestPreflight, latestStartupError);
        return result;
      } catch (e) {
        const result = rememberConnectionCheckResult(deps.captureConnectionCheckResult({
          label,
          target: normalized,
          status: 'error',
          checkedAt: new Date().toISOString(),
          exception: e.message || 'connection failed',
        }, latestPreflight));
        deps.setStatus(false, `checked ${label}: ${e.message}`);
        renderConnection(latestPreflight, latestStartupError);
        return result;
      }
    }

    async function recheckConnectionTargetResults(options = {}) {
      const failuresOnly = !!options.failuresOnly;
      const staleOnly = !!options.staleOnly;
      const selected = connectionCheckResults.filter(item => {
        if (!item) return false;
        if (failuresOnly && item.success) return false;
        if (staleOnly && !deps.describeConnectionCheckFreshness(item, latestPreflight).stale) return false;
        return true;
      });
      if (!selected.length) {
        deps.setStatus(false, staleOnly
          ? 'no stale target checks to recheck'
          : (failuresOnly ? 'no failing target checks to recheck' : 'no target checks to recheck'));
        return [];
      }
      let okCount = 0;
      let errorCount = 0;
      for (const item of selected) {
        const result = await checkConnectionTargetPreflight(item.target, item.label);
        if (result?.success) okCount += 1;
        else errorCount += 1;
      }
      if (staleOnly) {
        try {
          latestPreflight = await deps.resolveConnectionPreflight();
        } catch (_) {
          // keep the last rendered preflight if the current target cannot be refreshed
        }
      }
      deps.setStatus(errorCount === 0, `rechecked ${selected.length} target check${selected.length === 1 ? '' : 's'}: ${okCount} ok${errorCount ? `, ${errorCount} error` : ''}`);
      renderConnection(latestPreflight, latestStartupError);
      return selected;
    }

    function getVisibleConnectionCheckEntries(payload = latestPreflight) {
      return deps.getVisibleConnectionCheckEntriesModel({
        connectionCheckResults,
        payload,
        connectionCheckViewMode,
        describeConnectionCheckFreshness: deps.describeConnectionCheckFreshness,
      });
    }

    function isFilteredConnectionChecksView() {
      return deps.isFilteredConnectionChecksViewModel(connectionCheckViewMode);
    }

    async function copyConnectionChecks() {
      if (!connectionCheckResults.length) {
        deps.setStatus(false, 'no target checks to copy');
        return;
      }
      try {
        const entries = getVisibleConnectionCheckEntries(latestPreflight);
        await deps.copyTextToClipboard(JSON.stringify(deps.buildConnectionCheckBundle(entries.map(entry => entry.item)), null, 2));
        deps.setStatus(true, `copied ${isFilteredConnectionChecksView() ? 'visible' : 'saved'} target checks`);
      } catch (e) {
        deps.setStatus(false, e.message);
      }
    }

    function downloadConnectionChecks() {
      if (!connectionCheckResults.length) {
        deps.setStatus(false, 'no target checks to download');
        return;
      }
      const stamp = new Date().toISOString().replace(/[:]/g, '-');
      const entries = getVisibleConnectionCheckEntries(latestPreflight);
      deps.downloadDataFile(`connection-checks-${stamp}.json`, JSON.stringify(deps.buildConnectionCheckBundle(entries.map(entry => entry.item)), null, 2), 'application/json;charset=utf-8');
      deps.setStatus(true, `downloaded ${isFilteredConnectionChecksView() ? 'visible' : 'saved'} target checks`);
    }

    async function importConnectionChecksFromModal(options = {}) {
      const replace = !!options.replace;
      const values = await deps.requestModal(replace ? 'Replace Target Checks' : 'Import Target Checks', [{
        id: `${id}-import-checks-json`,
        label: 'Check JSON',
        type: 'textarea',
        placeholder: '{"version":1,"checks":[...]}',
        value: '',
      }], {
        okLabel: replace ? 'Replace Checks' : 'Import Checks',
        message: replace
          ? 'Paste a target-check bundle exported from Copy Checks JSON or Download Checks JSON. This replaces the current saved target checks.'
          : 'Paste a target-check bundle exported from Copy Checks JSON or Download Checks JSON. Imported checks are merged into the current saved target checks.',
      });
      if (!values) return;
      const raw = String(values[`${id}-import-checks-json`] || '').trim();
      if (!raw) {
        deps.setStatus(false, 'no target check JSON provided');
        return;
      }
      try {
        const imported = deps.mergeConnectionCheckBundle(connectionCheckResults, JSON.parse(raw), {replace});
        connectionCheckResults = imported.checks;
        syncConnectionWindowState();
        const verb = replace ? 'replaced' : 'imported';
        deps.setStatus(true, `${verb} ${imported.importedCheckCount} target check${imported.importedCheckCount === 1 ? '' : 's'}; ${imported.checkCount} saved`);
        deps.notifyLiveWindowUpdated();
        renderConnection(latestPreflight, latestStartupError);
      } catch (e) {
        deps.setStatus(false, `target check import failed: ${e.message}`);
      }
    }

    function suggestedOverrideFromPayload(payload = latestPreflight) {
      return deps.suggestedConnectionOverrideFromPayloadModel(payload, deps.sanitizeConnectionOverride);
    }

    function configuredOverrideSeed(payload = latestPreflight) {
      return deps.buildConfiguredConnectionOverrideSeedModel(payload, deps.readConnectionOverride(), deps.sanitizeConnectionOverride);
    }

    function localStoneOverridesFromPayload(payload = latestPreflight) {
      return deps.localStoneOverridesFromPayloadModel(payload);
    }

    function currentConnectionTargetOverride(payload = latestPreflight) {
      return deps.currentConnectionTargetOverrideModel(payload, deps.readConnectionOverride(), deps.sanitizeConnectionOverride);
    }

    function favoriteProfileForOverride(override, profiles = deps.readFavoriteConnectionProfiles()) {
      return deps.favoriteProfileForOverrideModel(override, profiles, deps.connectionOverrideKey);
    }

    async function saveConnectionTargetAsFavorite(target, options = {}) {
      const normalized = deps.sanitizeConnectionOverride(target);
      if (!normalized) {
        deps.setStatus(false, 'no connection target available to save');
        return null;
      }
      const currentProfile = favoriteProfileForOverride(normalized);
      const baseName = currentProfile?.name || String(options.suggestedName || '').trim() || deps.defaultConnectionOverrideName(normalized);
      const baseNote = currentProfile?.note || String(options.suggestedNote || '').trim();
      const values = await deps.requestModal(currentProfile ? 'Rename Favorite Target' : 'Save Favorite Target', [{
        id: `${id}-favorite-name`,
        label: 'Name',
        value: baseName,
        placeholder: baseName,
      }, {
        id: `${id}-favorite-note`,
        label: 'Note',
        type: 'textarea',
        value: baseNote,
        placeholder: 'Optional note about this saved target',
      }], {
        okLabel: currentProfile ? 'Rename Favorite' : 'Save Favorite',
        message: options.message || 'Saved favorite targets stay available in the Connection window even after recents change.',
      });
      if (!values) return null;
      const profileName = String(values[`${id}-favorite-name`] || '').trim() || baseName;
      const profileNote = String(values[`${id}-favorite-note`] || '').trim();
      const saved = deps.addFavoriteConnectionProfile(normalized, profileName, profileNote);
      deps.setStatus(true, `${currentProfile ? 'renamed' : 'saved'} favorite target ${saved.name}: ${deps.summarizeConnectionOverride(saved.target)}`);
      deps.notifyLiveWindowUpdated();
      renderConnection(latestPreflight, latestStartupError);
      return saved;
    }

    async function editFavoriteTargetProfile(favorite) {
      if (!favorite) {
        deps.setStatus(false, 'no favorite target available to edit');
        return null;
      }
      const current = deps.sanitizeConnectionOverride(favorite.target);
      if (!current) {
        deps.setStatus(false, 'favorite target is invalid');
        return null;
      }
      const values = await deps.requestModal(`Edit Favorite Target ${favorite.name}`, [
        {
          id: `${id}-edit-favorite-name`,
          label: 'Name',
          value: favorite.name || deps.defaultConnectionOverrideName(current),
          placeholder: favorite.name || deps.defaultConnectionOverrideName(current),
        },
        {
          id: `${id}-edit-favorite-note`,
          label: 'Note',
          type: 'textarea',
          value: favorite.note || '',
          placeholder: 'Optional note about this saved target',
        },
        {
          id: `${id}-edit-favorite-stone`,
          label: 'Stone',
          value: current.stone || '',
          placeholder: 'stone name',
        },
        {
          id: `${id}-edit-favorite-host`,
          label: 'Host',
          value: current.host || '',
          placeholder: 'host',
        },
        {
          id: `${id}-edit-favorite-netldi`,
          label: 'NetLDI',
          value: current.netldi || '',
          placeholder: 'netldi port or service',
        },
        {
          id: `${id}-edit-favorite-gem-service`,
          label: 'Gem Service',
          value: current.gemService || '',
          placeholder: 'gem service',
        },
      ], {
        okLabel: 'Save Favorite',
        message: 'Edit the saved target details without changing the active override.',
      });
      if (!values) return null;
      const nextTarget = deps.sanitizeConnectionOverride({
        stone: values[`${id}-edit-favorite-stone`] || '',
        host: values[`${id}-edit-favorite-host`] || '',
        netldi: values[`${id}-edit-favorite-netldi`] || '',
        gemService: values[`${id}-edit-favorite-gem-service`] || '',
      });
      if (!nextTarget) {
        deps.setStatus(false, 'favorite target must include at least one connection field');
        return null;
      }
      const nextName = String(values[`${id}-edit-favorite-name`] || '').trim() || favorite.name || deps.defaultConnectionOverrideName(nextTarget);
      const nextNote = String(values[`${id}-edit-favorite-note`] || '').trim();
      const updated = deps.updateFavoriteConnectionProfile(favorite.target, nextTarget, nextName, nextNote);
      if (!updated) {
        deps.setStatus(false, 'failed to update favorite target');
        return null;
      }
      deps.setStatus(true, `updated favorite target ${updated.name}: ${deps.summarizeConnectionOverride(updated.target)}`);
      deps.notifyLiveWindowUpdated();
      renderConnection(latestPreflight, latestStartupError);
      return updated;
    }

    function renderConnection(preflight = null, startupError = '') {
      if (preflight) latestPreflight = preflight;
      latestStartupError = String(startupError || latestStartupError || '').trim();
      const favoriteProfiles = deps.readFavoriteConnectionProfiles();
      const defaultFavoriteProfile = deps.readDefaultFavoriteConnectionProfile();
      const renderState = deps.buildConnectionRenderStateModel({
        preflight: latestPreflight,
        startupError: latestStartupError,
        browserOverride: deps.readConnectionOverride(),
        lastSuccessfulOverride: deps.readLastSuccessfulConnectionOverride(),
        favoriteProfiles,
        defaultFavoriteProfile,
        recentOverrides: deps.readRecentConnectionOverrides(),
        connectionCheckResults,
        connectionCheckViewMode,
        sanitizeConnectionOverride: deps.sanitizeConnectionOverride,
        connectionOverrideKey: deps.connectionOverrideKey,
        describeConnectionCheckFreshness: deps.describeConnectionCheckFreshness,
        summarizeConnectionOverride: deps.summarizeConnectionOverride,
      });
      const {
        override,
        suggestedOverride,
        currentTargetOverride,
        lastSuccessfulOverride,
        recentOverrides,
      } = renderState;
      const view = deps.buildConnectionWindowView({
        renderState,
        startupBootstrapped: deps.startupBootstrapped(),
        latestStartupError,
        escHtml: deps.escHtml,
        shortLabel: deps.shortLabel,
        summarizeConnectionOverride: deps.summarizeConnectionOverride,
        defaultConnectionOverrideName: deps.defaultConnectionOverrideName,
        favoriteProfileForOverride,
        isDefaultFavoriteConnectionOverride: deps.isDefaultFavoriteConnectionOverride,
      });
      const toolbarState = view.toolbarState;
      grid.innerHTML = view.gridHtml;
      cards.innerHTML = view.cardsHtml;
      const favoriteAt = index => deps.readFavoriteConnectionProfiles()[index] || null;
      const recentAt = index => deps.readRecentConnectionOverrides()[index] || null;
      const checkAt = index => connectionCheckResults[index] || null;
      const localStoneOverride = stone => ({
        stone,
        host: '',
        netldi: '',
        gemService: '',
      });

      deps.bindConnectionWindowCardActions({
        cards,
        normalizeConnectionCheckViewMode: deps.normalizeConnectionCheckViewMode,
        handlers: {
          onCheckViewMode(mode) {
            connectionCheckViewMode = mode;
            syncConnectionWindowState();
            deps.notifyLiveWindowUpdated();
            renderConnection(latestPreflight, latestStartupError);
          },
          async onFavoriteOverride(index) {
            const favorite = favoriteAt(index);
            if (!favorite) return;
            await applyConnectionTargetAction(favorite.target, `applied favorite target ${favorite.name}`);
          },
          async onRenameFavorite(index) {
            const favorite = favoriteAt(index);
            if (!favorite) return;
            await saveConnectionTargetAsFavorite(favorite.target, {
              suggestedName: favorite.name,
              message: 'Rename this saved favorite target without changing the active override.',
            });
          },
          async onEditFavorite(index) {
            const favorite = favoriteAt(index);
            if (!favorite) return;
            await editFavoriteTargetProfile(favorite);
          },
          async onCopyFavoriteShell(index) {
            const favorite = favoriteAt(index);
            if (!favorite) return;
            await copyNamedConnectionTargetShell(favorite.target, `favorite target ${favorite.name}`);
          },
          async onCheckFavorite(index) {
            const favorite = favoriteAt(index);
            if (!favorite) return;
            await checkConnectionTargetPreflight(favorite.target, `favorite target ${favorite.name}`);
          },
          onMoveFavoriteUp(index) {
            const favorite = favoriteAt(index);
            if (!favorite) return;
            const moved = deps.moveFavoriteConnectionOverride(favorite.target, -1);
            if (!moved) return;
            deps.setStatus(true, `moved favorite target up: ${moved.name}`);
            deps.notifyLiveWindowUpdated();
            renderConnection(latestPreflight, latestStartupError);
          },
          onMoveFavoriteDown(index) {
            const favorite = favoriteAt(index);
            if (!favorite) return;
            const moved = deps.moveFavoriteConnectionOverride(favorite.target, 1);
            if (!moved) return;
            deps.setStatus(true, `moved favorite target down: ${moved.name}`);
            deps.notifyLiveWindowUpdated();
            renderConnection(latestPreflight, latestStartupError);
          },
          async onDefaultFavoriteOverride() {
            const favorite = deps.readDefaultFavoriteConnectionProfile();
            if (!favorite) return;
            await applyConnectionTargetAction(favorite.target, `applied default favorite target ${favorite.name}`);
          },
          async onCopyDefaultFavoriteShell() {
            const favorite = deps.readDefaultFavoriteConnectionProfile();
            if (!favorite) return;
            await copyNamedConnectionTargetShell(favorite.target, `default favorite target ${favorite.name}`);
          },
          async onCheckDefaultFavorite() {
            const favorite = deps.readDefaultFavoriteConnectionProfile();
            if (!favorite) return;
            await checkConnectionTargetPreflight(favorite.target, `default favorite target ${favorite.name}`);
          },
          onClearDefaultFavorite() {
            const favorite = deps.readDefaultFavoriteConnectionProfile();
            if (!favorite) return;
            deps.clearDefaultFavoriteConnectionOverride();
            deps.setStatus(true, `cleared default favorite target ${favorite.name}: ${deps.summarizeConnectionOverride(favorite.target)}`);
            deps.notifyLiveWindowUpdated();
            renderConnection(latestPreflight, latestStartupError);
          },
          onSetDefaultFavorite(index) {
            const favorite = favoriteAt(index);
            if (!favorite) return;
            deps.setDefaultFavoriteConnectionOverride(favorite.target);
            deps.setStatus(true, `set default favorite target ${favorite.name}: ${deps.summarizeConnectionOverride(favorite.target)}`);
            deps.notifyLiveWindowUpdated();
            renderConnection(latestPreflight, latestStartupError);
          },
          onForgetFavorite(index) {
            const favorite = favoriteAt(index);
            if (!favorite) return;
            deps.removeFavoriteConnectionOverride(favorite.target);
            deps.setStatus(true, `forgot favorite target ${favorite.name}: ${deps.summarizeConnectionOverride(favorite.target)}`);
            deps.notifyLiveWindowUpdated();
            renderConnection(latestPreflight, latestStartupError);
          },
          async onLastSuccessfulOverride() {
            const saved = deps.readLastSuccessfulConnectionOverride();
            if (!saved) return;
            await applyConnectionTargetAction(saved, 'restored last working target');
          },
          async onSaveLastWorkingFavorite() {
            const saved = deps.readLastSuccessfulConnectionOverride();
            if (!saved) return;
            await saveConnectionTargetAsFavorite(saved, {
              suggestedName: deps.defaultConnectionOverrideName(saved),
              message: 'Save or rename the last known working target as a reusable favorite profile.',
            });
          },
          async onCopyLastWorkingShell() {
            const saved = deps.readLastSuccessfulConnectionOverride();
            if (!saved) return;
            await copyNamedConnectionTargetShell(saved, 'last working target');
          },
          async onCheckLastWorking() {
            const saved = deps.readLastSuccessfulConnectionOverride();
            if (!saved) return;
            await checkConnectionTargetPreflight(saved, 'last working target');
          },
          async onClearLastWorking() {
            const saved = deps.readLastSuccessfulConnectionOverride();
            if (!saved) return;
            const confirmed = await deps.requestConfirmModal('Forget Last Working Target', `Forget the saved last working target ${deps.summarizeConnectionOverride(saved)}?`, {
              okLabel: 'Forget Last Working',
            });
            if (!confirmed) return;
            deps.clearLastSuccessfulConnectionOverride();
            deps.setStatus(true, `forgot last working target: ${deps.summarizeConnectionOverride(saved)}`);
            deps.notifyLiveWindowUpdated();
            renderConnection(latestPreflight, latestStartupError);
          },
          async onRecentOverride(index) {
            const recent = recentAt(index);
            if (!recent) return;
            await applyConnectionTargetAction(recent, 'applied recent target');
          },
          async onSaveRecentFavorite(index) {
            const recent = recentAt(index);
            if (!recent) return;
            await saveConnectionTargetAsFavorite(recent, {
              suggestedName: deps.defaultConnectionOverrideName(recent),
              message: 'Save or rename this recent target as a reusable favorite profile without changing the active override.',
            });
          },
          async onCopyRecentShell(index) {
            const recent = recentAt(index);
            if (!recent) return;
            await copyNamedConnectionTargetShell(recent, `recent target ${deps.defaultConnectionOverrideName(recent)}`);
          },
          async onCheckRecent(index) {
            const recent = recentAt(index);
            if (!recent) return;
            await checkConnectionTargetPreflight(recent, `recent target ${deps.defaultConnectionOverrideName(recent)}`);
          },
          onForgetRecent(index) {
            const recent = recentAt(index);
            if (!recent) return;
            deps.removeRecentConnectionOverride(recent);
            deps.setStatus(true, `forgot recent target: ${deps.summarizeConnectionOverride(recent)}`);
            deps.notifyLiveWindowUpdated();
            renderConnection(latestPreflight, latestStartupError);
          },
          async onLocalStone(stone) {
            if (!stone) return;
            await applyConnectionTargetAction(localStoneOverride(stone), 'applied local stone override');
          },
          async onSaveLocalStoneFavorite(stone) {
            if (!stone) return;
            await saveConnectionTargetAsFavorite(localStoneOverride(stone), {
              suggestedName: stone,
              message: 'Save or rename this local Stone target as a reusable favorite profile without changing the active override.',
            });
          },
          async onCopyLocalStoneShell(stone) {
            if (!stone) return;
            await copyNamedConnectionTargetShell(localStoneOverride(stone), `local stone ${stone}`);
          },
          async onCheckLocalStone(stone) {
            if (!stone) return;
            await checkConnectionTargetPreflight(localStoneOverride(stone), `local stone ${stone}`);
          },
          async onApplyCheckResult(index) {
            const result = checkAt(index);
            if (!result) return;
            await applyConnectionTargetAction(result.target, `applied checked target ${result.label}`);
          },
          async onSaveCheckFavorite(index) {
            const result = checkAt(index);
            if (!result) return;
            await saveConnectionTargetAsFavorite(result.target, {
              suggestedName: deps.defaultConnectionOverrideName(result.target),
              message: 'Save or rename this checked target as a reusable favorite profile without changing the active override.',
            });
          },
          async onCopyCheckShell(index) {
            const result = checkAt(index);
            if (!result) return;
            await copyNamedConnectionTargetShell(result.target, `checked target ${result.label}`);
          },
          async onRecheckAll() {
            await recheckConnectionTargetResults();
          },
          onCopyChecks() {
            return copyConnectionChecks();
          },
          onDownloadChecks() {
            return downloadConnectionChecks();
          },
          onImportChecks() {
            return importConnectionChecksFromModal();
          },
          onReplaceChecks() {
            return importConnectionChecksFromModal({replace: true});
          },
          async onRecheckFailures() {
            await recheckConnectionTargetResults({failuresOnly: true});
          },
          async onRecheckStale() {
            await recheckConnectionTargetResults({staleOnly: true});
          },
          onForgetCheck(index) {
            const result = checkAt(index);
            if (!result) return;
            removeConnectionCheckResult(result);
            deps.setStatus(true, `forgot check result for ${result.label}`);
            deps.notifyLiveWindowUpdated();
            renderConnection(latestPreflight, latestStartupError);
          },
          async onClearChecks() {
            if (!connectionCheckResults.length) return;
            const confirmed = await deps.requestConfirmModal('Clear Target Checks', `Forget all ${connectionCheckResults.length} saved target check${connectionCheckResults.length === 1 ? '' : 's'}?`, {
              okLabel: 'Clear Checks',
            });
            if (!confirmed) return;
            clearConnectionCheckResults();
            deps.setStatus(true, 'cleared target checks');
            deps.notifyLiveWindowUpdated();
            renderConnection(latestPreflight, latestStartupError);
          },
        },
      });
      deps.applyConnectionWindowToolbarState(buttons, {
        ...toolbarState,
        applyOverrideDisabled: !suggestedOverride,
        saveSuggestedFavoriteDisabled: !suggestedOverride,
        editOverrideDisabled: false,
        favoriteTargetDisabled: !currentTargetOverride,
        replaceProfilesDisabled: false,
        clearFavoritesDisabled: !favoriteProfiles.length,
        clearRecentsDisabled: !recentOverrides.length,
        clearLastWorkingDisabled: !lastSuccessfulOverride,
        clearOverrideDisabled: !override,
      });
    }

    function setToolbarBusy(disabled) {
      Object.values(buttons).forEach(button => {
        if (button) button.disabled = !!disabled;
      });
    }

    async function retryStartup() {
      let closedOnSuccess = false;
      const refreshTokenValue = nextRefreshToken();
      setToolbarBusy(true);
      latestStartupError = '';
      try {
        const connected = await deps.init({
          showConnectionWindow: false,
          onFailure: (preflight, error) => {
            if (isStaleRefreshToken(refreshTokenValue)) return;
            latestPreflight = preflight;
            latestStartupError = error?.message || preflight?.exception || 'connection failed';
            renderConnection(preflight, latestStartupError);
          },
        });
        if (isStaleRefreshToken(refreshTokenValue)) return;
        if (!connected) return;
        if (latestPreflight && latestPreflight.success === false && latestStartupError) return;
        await deps.retryStartupRecovery({
          getManagedWindows: deps.getManagedWindows,
          getWindowState: windowId => deps.windowState.get(windowId),
          restoreSavedLayout: deps.restoreSavedLayout,
          openDefaultStartupLayout: deps.openDefaultStartupLayout,
          startThreadPoller: deps.startThreadPoller,
          markStartupBootstrapped: deps.markStartupBootstrapped,
          persistWindowLayout: deps.persistWindowLayout,
          setStatus: deps.setStatus,
        });
        latestStartupError = '';
        deps.setStatus(true, 'startup recovered');
        deps.closeWindow(win, id);
        closedOnSuccess = true;
      } catch (e) {
        if (isStaleRefreshToken(refreshTokenValue)) return;
        latestStartupError = e.message || 'startup retry failed';
        deps.setStatus(false, latestStartupError);
        renderConnection(latestPreflight, latestStartupError);
      } finally {
        if (isStaleRefreshToken(refreshTokenValue)) return;
        if (closedOnSuccess) return;
        setToolbarBusy(false);
        deps.applyConnectionWindowToolbarState(buttons, {
          ...deps.buildConnectionWindowView({
            renderState: deps.buildConnectionRenderStateModel({
              preflight: latestPreflight,
              startupError: latestStartupError,
              browserOverride: deps.readConnectionOverride(),
              lastSuccessfulOverride: deps.readLastSuccessfulConnectionOverride(),
              favoriteProfiles: deps.readFavoriteConnectionProfiles(),
              defaultFavoriteProfile: deps.readDefaultFavoriteConnectionProfile(),
              recentOverrides: deps.readRecentConnectionOverrides(),
              connectionCheckResults,
              connectionCheckViewMode,
              sanitizeConnectionOverride: deps.sanitizeConnectionOverride,
              connectionOverrideKey: deps.connectionOverrideKey,
              describeConnectionCheckFreshness: deps.describeConnectionCheckFreshness,
              summarizeConnectionOverride: deps.summarizeConnectionOverride,
            }),
            startupBootstrapped: deps.startupBootstrapped(),
            latestStartupError,
            escHtml: deps.escHtml,
            shortLabel: deps.shortLabel,
            summarizeConnectionOverride: deps.summarizeConnectionOverride,
            defaultConnectionOverrideName: deps.defaultConnectionOverrideName,
            favoriteProfileForOverride,
            isDefaultFavoriteConnectionOverride: deps.isDefaultFavoriteConnectionOverride,
          }).toolbarState,
          applyOverrideDisabled: !suggestedOverrideFromPayload(),
          saveSuggestedFavoriteDisabled: !suggestedOverrideFromPayload(),
          editOverrideDisabled: false,
          favoriteTargetDisabled: !currentConnectionTargetOverride(),
          replaceProfilesDisabled: false,
          clearFavoritesDisabled: !deps.readFavoriteConnectionProfiles().length,
          clearRecentsDisabled: !deps.readRecentConnectionOverrides().length,
          clearLastWorkingDisabled: !deps.readLastSuccessfulConnectionOverride(),
          clearOverrideDisabled: !deps.readConnectionOverride(),
          copyFixDisabled: !buildFixShell(),
        });
        syncConnectionWindowState();
      }
    }

    async function refreshConnection() {
      const refreshTokenValue = nextRefreshToken();
      setToolbarBusy(true);
      try {
        const data = await deps.resolveConnectionPreflight();
        if (isStaleRefreshToken(refreshTokenValue)) return;
        latestPreflight = data;
        if (data?.success) {
          deps.rememberLastSuccessfulConnectionOverride(deps.readConnectionOverride());
          deps.setRuntimeVersionInfo({
            ...(deps.readRuntimeVersionInfo() || {}),
            ...data,
          });
          deps.renderTaskbarVersion(deps.readRuntimeVersionInfo());
          deps.setStatus(true, 'connection preflight ok');
        } else {
          deps.setStatus(false, data?.exception || 'connection preflight failed');
        }
        renderConnection(data, latestStartupError);
      } catch (e) {
        if (isStaleRefreshToken(refreshTokenValue)) return;
        renderConnection(null, e.message);
        deps.setStatus(false, e.message);
      } finally {
        if (isStaleRefreshToken(refreshTokenValue)) return;
        setToolbarBusy(false);
        deps.applyConnectionWindowToolbarState(buttons, {
          ...deps.buildConnectionWindowView({
            renderState: deps.buildConnectionRenderStateModel({
              preflight: latestPreflight,
              startupError: latestStartupError,
              browserOverride: deps.readConnectionOverride(),
              lastSuccessfulOverride: deps.readLastSuccessfulConnectionOverride(),
              favoriteProfiles: deps.readFavoriteConnectionProfiles(),
              defaultFavoriteProfile: deps.readDefaultFavoriteConnectionProfile(),
              recentOverrides: deps.readRecentConnectionOverrides(),
              connectionCheckResults,
              connectionCheckViewMode,
              sanitizeConnectionOverride: deps.sanitizeConnectionOverride,
              connectionOverrideKey: deps.connectionOverrideKey,
              describeConnectionCheckFreshness: deps.describeConnectionCheckFreshness,
              summarizeConnectionOverride: deps.summarizeConnectionOverride,
            }),
            startupBootstrapped: deps.startupBootstrapped(),
            latestStartupError,
            escHtml: deps.escHtml,
            shortLabel: deps.shortLabel,
            summarizeConnectionOverride: deps.summarizeConnectionOverride,
            defaultConnectionOverrideName: deps.defaultConnectionOverrideName,
            favoriteProfileForOverride,
            isDefaultFavoriteConnectionOverride: deps.isDefaultFavoriteConnectionOverride,
          }).toolbarState,
          applyOverrideDisabled: !suggestedOverrideFromPayload(),
          saveSuggestedFavoriteDisabled: !suggestedOverrideFromPayload(),
          editOverrideDisabled: false,
          favoriteTargetDisabled: !currentConnectionTargetOverride(),
          replaceProfilesDisabled: false,
          clearFavoritesDisabled: !deps.readFavoriteConnectionProfiles().length,
          clearRecentsDisabled: !deps.readRecentConnectionOverrides().length,
          clearLastWorkingDisabled: !deps.readLastSuccessfulConnectionOverride(),
          clearOverrideDisabled: !deps.readConnectionOverride(),
          copyFixDisabled: !buildFixShell(),
        });
        syncConnectionWindowState();
      }
    }

    async function copyFixShell() {
      const text = buildFixShell();
      if (!text) {
        deps.setStatus(false, 'no fix shell available');
        return;
      }
      try {
        await deps.copyTextToClipboard(text);
        deps.setStatus(true, 'copied connection fix shell');
      } catch (e) {
        deps.setStatus(false, e.message);
      }
    }

    async function copyConnectionJson() {
      try {
        await deps.copyTextToClipboard(JSON.stringify(connectionPayload(), null, 2));
        deps.setStatus(true, 'copied connection diagnostics');
      } catch (e) {
        deps.setStatus(false, e.message);
      }
    }

    async function copyConnectionProfiles() {
      try {
        await deps.copyTextToClipboard(JSON.stringify(deps.buildConnectionProfileBundle(), null, 2));
        deps.setStatus(true, 'copied connection profiles');
      } catch (e) {
        deps.setStatus(false, e.message);
      }
    }

    function downloadConnectionJson() {
      const stamp = new Date().toISOString().replace(/[:]/g, '-');
      deps.downloadDataFile(`connection-preflight-${stamp}.json`, JSON.stringify(connectionPayload(), null, 2), 'application/json;charset=utf-8');
      deps.setStatus(true, 'downloaded connection diagnostics');
    }

    function downloadConnectionProfiles() {
      const stamp = new Date().toISOString().replace(/[:]/g, '-');
      deps.downloadDataFile(`connection-profiles-${stamp}.json`, JSON.stringify(deps.buildConnectionProfileBundle(), null, 2), 'application/json;charset=utf-8');
      deps.setStatus(true, 'downloaded connection profiles');
    }

    async function applySuggestedOverride() {
      const override = suggestedOverrideFromPayload();
      if (!override) {
        deps.setStatus(false, 'no suggested target available');
        return;
      }
      await applyConnectionTargetAction(override, 'applied connection override');
    }

    async function saveSuggestedOverrideAsFavorite() {
      const override = suggestedOverrideFromPayload();
      if (!override) {
        deps.setStatus(false, 'no suggested target available');
        return;
      }
      await saveConnectionTargetAsFavorite(override, {
        suggestedName: deps.defaultConnectionOverrideName(override),
        message: 'Save or rename the current suggested target as a reusable favorite profile without changing the active override.',
      });
    }

    async function editOverride() {
      const seed = configuredOverrideSeed();
      const values = await deps.requestModal('Edit Connection Override', [
        {
          id: `${id}-override-stone`,
          label: 'Stone',
          value: seed.current?.stone || '',
          placeholder: seed.placeholders.stone || 'stone name',
        },
        {
          id: `${id}-override-host`,
          label: 'Host',
          value: seed.current?.host || '',
          placeholder: seed.placeholders.host || 'host',
        },
        {
          id: `${id}-override-netldi`,
          label: 'NetLDI',
          value: seed.current?.netldi || '',
          placeholder: seed.placeholders.netldi || 'netldi port or service',
        },
        {
          id: `${id}-override-gem-service`,
          label: 'Gem Service',
          value: seed.current?.gemService || '',
          placeholder: seed.placeholders.gemService || 'gem service',
        },
      ], {
        message: 'Leave fields blank to remove the browser-local override and fall back to the server environment.',
        okLabel: 'Apply Override',
      });
      if (!values) return;
      const override = {
        stone: values[`${id}-override-stone`] || '',
        host: values[`${id}-override-host`] || '',
        netldi: values[`${id}-override-netldi`] || '',
        gemService: values[`${id}-override-gem-service`] || '',
      };
      const normalized = deps.sanitizeConnectionOverride(override);
      if (!normalized) {
        deps.clearConnectionOverride();
        deps.setStatus(true, 'cleared connection override');
        await refreshConnection();
        return;
      }
      await applyConnectionTargetAction(normalized, 'applied connection override');
    }

    async function toggleFavoriteCurrentTarget() {
      const target = currentConnectionTargetOverride();
      if (!target) {
        deps.setStatus(false, 'no current target to save');
        return;
      }
      await saveConnectionTargetAsFavorite(target);
    }

    async function importConnectionProfilesFromModal(options = {}) {
      const replace = !!options.replace;
      const values = await deps.requestModal(replace ? 'Replace Connection Profiles' : 'Import Connection Profiles', [{
        id: `${id}-import-profiles-json`,
        label: 'Profile JSON',
        type: 'textarea',
        placeholder: '{"version":1,"favoriteProfiles":[...]}',
        value: '',
      }], {
        okLabel: replace ? 'Replace Profiles' : 'Import Profiles',
        message: replace
          ? 'Paste a connection profile bundle exported from Copy Profiles or Download Profiles. This replaces the current favorites, recents, default favorite, and last working target.'
          : 'Paste a connection profile bundle exported from Copy Profiles or Download Profiles. Imported favorites and recents are merged into the current browser state.',
      });
      if (!values) return;
      const raw = String(values[`${id}-import-profiles-json`] || '').trim();
      if (!raw) {
        deps.setStatus(false, 'no connection profile JSON provided');
        return;
      }
      try {
        const imported = replace
          ? deps.replaceConnectionProfileBundle(JSON.parse(raw))
          : deps.importConnectionProfileBundle(JSON.parse(raw));
        const defaultLabel = imported.defaultFavoriteProfile ? `; default ${imported.defaultFavoriteProfile.name}` : '';
        const verb = replace ? 'replaced' : 'imported';
        deps.setStatus(true, `${verb} ${imported.importedFavoriteCount} favorite target${imported.importedFavoriteCount === 1 ? '' : 's'} and ${imported.importedRecentCount} recent target${imported.importedRecentCount === 1 ? '' : 's'}${defaultLabel}`);
        deps.notifyLiveWindowUpdated();
        renderConnection(latestPreflight, latestStartupError);
      } catch (e) {
        deps.setStatus(false, `profile import failed: ${e.message}`);
      }
    }

    async function clearOverrideAndRefresh() {
      deps.clearConnectionOverride();
      deps.setStatus(true, 'cleared connection override');
      await refreshConnection();
    }

    async function clearFavoriteProfilesWithConfirm() {
      const favorites = deps.readFavoriteConnectionProfiles();
      if (!favorites.length) {
        deps.setStatus(false, 'no favorite targets to clear');
        return;
      }
      const confirmed = await deps.requestConfirmModal('Clear Favorite Targets', `Forget all ${favorites.length} saved favorite target${favorites.length === 1 ? '' : 's'}?`, {
        okLabel: 'Clear Favorites',
      });
      if (!confirmed) return;
      deps.clearFavoriteConnectionProfiles();
      deps.setStatus(true, `cleared ${favorites.length} favorite target${favorites.length === 1 ? '' : 's'}`);
      deps.notifyLiveWindowUpdated();
      renderConnection(latestPreflight, latestStartupError);
    }

    async function clearRecentTargetsWithConfirm() {
      const recents = deps.readRecentConnectionOverrides();
      if (!recents.length) {
        deps.setStatus(false, 'no recent targets to clear');
        return;
      }
      const confirmed = await deps.requestConfirmModal('Clear Recent Targets', `Forget all ${recents.length} recent target${recents.length === 1 ? '' : 's'}?`, {
        okLabel: 'Clear Recents',
      });
      if (!confirmed) return;
      deps.clearRecentConnectionOverrides();
      deps.setStatus(true, `cleared ${recents.length} recent target${recents.length === 1 ? '' : 's'}`);
      deps.notifyLiveWindowUpdated();
      renderConnection(latestPreflight, latestStartupError);
    }

    async function clearLastWorkingTargetWithConfirm() {
      const saved = deps.readLastSuccessfulConnectionOverride();
      if (!saved) {
        deps.setStatus(false, 'no last working target to clear');
        return;
      }
      const confirmed = await deps.requestConfirmModal('Clear Last Working Target', `Forget the saved last working target ${deps.summarizeConnectionOverride(saved)}?`, {
        okLabel: 'Clear Last Working',
      });
      if (!confirmed) return;
      deps.clearLastSuccessfulConnectionOverride();
      deps.setStatus(true, `cleared last working target: ${deps.summarizeConnectionOverride(saved)}`);
      deps.notifyLiveWindowUpdated();
      renderConnection(latestPreflight, latestStartupError);
    }

    function mount() {
      deps.bindConnectionWindowToolbarActions(buttons, {
        retryStartup,
        applySuggestedOverride,
        saveSuggestedOverrideAsFavorite,
        editOverride,
        toggleFavoriteCurrentTarget,
        importConnectionProfilesFromModal,
        replaceConnectionProfilesFromModal: () => importConnectionProfilesFromModal({replace: true}),
        clearFavoriteProfilesWithConfirm,
        clearRecentTargetsWithConfirm,
        clearLastWorkingTargetWithConfirm,
        clearOverrideAndRefresh,
        refreshConnection,
        copyFixShell,
        copyConnectionProfiles,
        downloadConnectionProfiles,
        copyConnectionJson,
        downloadConnectionJson,
      });
      deps.liveWindowRenderers.set(id, () => renderConnection(latestPreflight, latestStartupError));
      syncConnectionWindowState();
      renderConnection(latestPreflight, latestStartupError);
      if (options.autoRefresh !== false && !options.preflight) refreshConnection();
    }

    return {
      mount,
      renderConnection,
      refreshConnection,
      retryStartup,
    };
  }

  return {
    createConnectionWindowRuntime,
  };
});
