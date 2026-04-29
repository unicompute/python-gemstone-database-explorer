(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports
      ? require('./connection_window_checks_runtime.js')
      : root.ConnectionWindowChecksRuntime,
    typeof module === 'object' && module.exports
      ? require('./connection_window_profiles_runtime.js')
      : root.ConnectionWindowProfilesRuntime
  );
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ConnectionWindowRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (
  checksRuntimeApi,
  profilesRuntimeApi
) {
  const {createConnectionWindowChecksRuntime} = checksRuntimeApi;
  const {createConnectionWindowProfilesRuntime} = profilesRuntimeApi;

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

    function getLatestPreflight() {
      return latestPreflight;
    }

    function setLatestPreflight(value) {
      latestPreflight = value;
    }

    function getLatestStartupError() {
      return latestStartupError;
    }

    function getConnectionCheckResults() {
      return connectionCheckResults;
    }

    function setConnectionCheckResults(value) {
      connectionCheckResults = Array.isArray(value) ? value : [];
    }

    function getConnectionCheckViewMode() {
      return connectionCheckViewMode;
    }

    function setConnectionCheckViewMode(value) {
      connectionCheckViewMode = deps.normalizeConnectionCheckViewMode(value);
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

    const checksRuntime = createConnectionWindowChecksRuntime({
      ...deps,
      id,
      getLatestPreflight,
      setLatestPreflight,
      getLatestStartupError,
      getConnectionCheckResults,
      setConnectionCheckResults,
      getConnectionCheckViewMode,
      setConnectionCheckViewMode,
      syncConnectionWindowState,
      renderConnection,
    });

    const profilesRuntime = createConnectionWindowProfilesRuntime({
      ...deps,
      id,
      getLatestPreflight,
      getLatestStartupError,
      syncConnectionWindowState,
      renderConnection,
      refreshConnection,
      retryStartup,
    });

    const {
      rememberConnectionCheckResult,
      removeConnectionCheckResult,
      clearConnectionCheckResults,
      checkConnectionTargetPreflight,
      recheckConnectionTargetResults,
      getVisibleConnectionCheckEntries,
      isFilteredConnectionChecksView,
      copyConnectionChecks,
      downloadConnectionChecks,
      importConnectionChecksFromModal,
    } = checksRuntime;

    const {
      buildFixShell,
      applyConnectionTargetAction,
      copyNamedConnectionTargetShell,
      suggestedOverrideFromPayload,
      configuredOverrideSeed,
      localStoneOverridesFromPayload,
      currentConnectionTargetOverride,
      favoriteProfileForOverride,
      saveConnectionTargetAsFavorite,
      editFavoriteTargetProfile,
      copyConnectionProfiles,
      downloadConnectionProfiles,
      applySuggestedOverride,
      saveSuggestedOverrideAsFavorite,
      editOverride,
      toggleFavoriteCurrentTarget,
      importConnectionProfilesFromModal,
      clearOverrideAndRefresh,
      clearFavoriteProfilesWithConfirm,
      clearRecentTargetsWithConfirm,
      clearLastWorkingTargetWithConfirm,
    } = profilesRuntime;

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

    function downloadConnectionJson() {
      const stamp = new Date().toISOString().replace(/[:]/g, '-');
      deps.downloadDataFile(`connection-preflight-${stamp}.json`, JSON.stringify(connectionPayload(), null, 2), 'application/json;charset=utf-8');
      deps.setStatus(true, 'downloaded connection diagnostics');
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
