(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AboutWindowRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createAboutWindowRuntime(deps = {}) {
    const {
      id,
      win,
      options = {},
      grid,
      buttons = {},
      liveWindowRenderers,
      upsertWindowState,
      buildDiagnosticsSnapshotData,
      buildSupportBundleData,
      buildAboutWindowView,
      applyAboutWindowToolbarDisabledState,
      bindAboutWindowToolbarActions,
      readConnectionOverride,
      getConnectionOverrideHeaders,
      readLastSuccessfulConnectionOverride,
      readFavoriteConnectionProfiles,
      readDefaultFavoriteConnectionProfile,
      readRecentConnectionOverrides,
      getStatusHistory,
      getStatusHistorySummary,
      buildWindowLayoutSnapshot,
      collectOpenWindowSummaries,
      collectWindowLinkSummaries,
      collectWindowGroupSummaries,
      sanitizeConnectionOverride,
      summarizeConnectionOverride,
      copyTextToClipboard,
      downloadDataFile,
      setStatus,
      openStatusLogWindow,
      openConnectionWindow,
      openWindowGroupsWindow,
      openWindowLinksWindow,
      api,
      readRuntimeVersionInfo,
      setRuntimeVersionInfo,
      renderTaskbarVersion,
      windowObj = typeof window !== 'undefined' ? window : null,
      navigatorObj = typeof navigator !== 'undefined' ? navigator : null,
      documentObj = typeof document !== 'undefined' ? document : null,
      escHtml,
    } = deps;

    let latestDiagnostics = null;
    let latestServerData = (typeof readRuntimeVersionInfo === 'function' ? readRuntimeVersionInfo() : null) || {};
    let latestDiagnosticsError = '';

    function syncAboutWindowState() {
      upsertWindowState?.(id, {kind: 'about'});
    }

    function buildBrowserDiagnostics() {
      return {
        userAgent: navigatorObj?.userAgent || '',
        url: windowObj?.location?.href || '',
        viewport: {
          width: Number(windowObj?.innerWidth || 0),
          height: Number(windowObj?.innerHeight || 0),
        },
        language: navigatorObj?.language || '',
      };
    }

    function buildDiagnosticsSnapshot(serverData = {}, errorText = '') {
      return buildDiagnosticsSnapshotData({
        server: serverData || {},
        browser: buildBrowserDiagnostics(),
        connectionOverride: readConnectionOverride(),
        connectionOverrideHeaders: getConnectionOverrideHeaders(),
        lastSuccessfulConnectionOverride: readLastSuccessfulConnectionOverride(),
        favoriteConnectionProfiles: readFavoriteConnectionProfiles(),
        defaultFavoriteConnectionProfile: readDefaultFavoriteConnectionProfile(),
        recentConnectionOverrides: readRecentConnectionOverrides(),
        statusHistory: getStatusHistory(),
        error: errorText || '',
      });
    }

    function buildSupportBundle(serverData = {}, errorText = '') {
      const taskbarVersionLabel = documentObj?.getElementById?.('taskbar-version')?.textContent || '';
      const configuredConnection = serverData?.connection?.configured || latestServerData?.connection?.configured || {};
      const localOverride = readConnectionOverride();
      const favoriteProfiles = readFavoriteConnectionProfiles();
      const defaultFavoriteProfile = readDefaultFavoriteConnectionProfile();
      return buildSupportBundleData({
        diagnostics: latestDiagnostics || buildDiagnosticsSnapshot(serverData, errorText),
        connectionSummary: {
          effectiveTarget: configuredConnection.effectiveTarget || '',
          stoneSource: configuredConnection.stoneSource || '',
          override: sanitizeConnectionOverride(configuredConnection.override || localOverride),
          lastSuccessfulOverride: readLastSuccessfulConnectionOverride(),
          favoriteProfiles,
          defaultFavoriteProfile,
        },
        currentStatus: {
          ok: !documentObj?.getElementById?.('status-dot')?.classList?.contains?.('error'),
          text: documentObj?.getElementById?.('status-txt')?.textContent || '',
        },
        taskbarVersion: taskbarVersionLabel,
        statusSummary: getStatusHistorySummary(),
        windowLayout: buildWindowLayoutSnapshot(),
        openWindows: collectOpenWindowSummaries(),
        windowLinks: collectWindowLinkSummaries(),
        windowGroups: collectWindowGroupSummaries(),
      });
    }

    function renderAboutInfo(data = {}, errorText = '') {
      latestServerData = data || {};
      latestDiagnosticsError = errorText || '';
      latestDiagnostics = buildDiagnosticsSnapshot(data, errorText);
      const browser = latestDiagnostics.browser || {};
      const broker = data.sessionBroker || {};
      const connection = data.connection || {};
      const configuredConnection = connection.configured || {};
      const localOverride = readConnectionOverride();
      const overrideSummary = summarizeConnectionOverride(configuredConnection.override || localOverride);
      const probe = connection.probe || {};
      const favoriteProfiles = readFavoriteConnectionProfiles();
      const defaultFavoriteProfile = readDefaultFavoriteConnectionProfile();
      const statusSummary = getStatusHistorySummary();
      const windowGroups = collectWindowGroupSummaries();
      const largestGroupSize = windowGroups.reduce((max, each) => Math.max(max, Number(each.size || 0)), 0);
      const channelNames = Array.isArray(broker.channels) ? broker.channels.map(each => each.name).join(', ') : '';
      const runtimeVersionInfo = (typeof readRuntimeVersionInfo === 'function' ? readRuntimeVersionInfo() : null) || {};
      const view = buildAboutWindowView({
        data,
        runtimeVersionInfo,
        browser,
        broker,
        configuredConnection,
        overrideSummary,
        favoriteProfiles,
        defaultFavoriteProfile,
        localStones: Array.isArray(probe.availableStones) ? probe.availableStones : [],
        channelNames,
        statusSummary,
        openWindowCount: collectOpenWindowSummaries().length,
        windowLinkCount: collectWindowLinkSummaries().length,
        windowGroupCount: windowGroups.length,
        largestGroupSize,
        statusEntryCount: getStatusHistory().length,
        errorText,
        summarizeConnectionOverride,
        escHtml,
      });
      if (grid) grid.innerHTML = view.gridHtml;
    }

    async function copyDiagnostics() {
      try {
        await copyTextToClipboard(JSON.stringify(latestDiagnostics || buildDiagnosticsSnapshot(readRuntimeVersionInfo?.() || {}, ''), null, 2));
        setStatus(true, 'copied diagnostics');
      } catch (error) {
        setStatus(false, error.message);
      }
    }

    function downloadDiagnostics() {
      const data = latestDiagnostics || buildDiagnosticsSnapshot(readRuntimeVersionInfo?.() || {}, '');
      const stamp = new Date().toISOString().replace(/[:]/g, '-');
      downloadDataFile(`diagnostics-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
      setStatus(true, 'downloaded diagnostics');
    }

    function downloadSupportBundle() {
      const data = buildSupportBundle(readRuntimeVersionInfo?.() || {}, '');
      const stamp = new Date().toISOString().replace(/[:]/g, '-');
      downloadDataFile(`support-bundle-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
      setStatus(true, 'downloaded support bundle');
    }

    async function copySupportBundle() {
      try {
        await copyTextToClipboard(JSON.stringify(buildSupportBundle(readRuntimeVersionInfo?.() || {}, ''), null, 2));
        setStatus(true, 'copied support bundle');
      } catch (error) {
        setStatus(false, error.message);
      }
    }

    function revealNext(nextWin) {
      if (nextWin && typeof deps.revealWindow === 'function') deps.revealWindow(nextWin);
    }

    function openAboutStatusLog(nextOptions = {}) {
      revealNext(openStatusLogWindow({
        x: win?.offsetLeft + 24,
        y: win?.offsetTop + 24,
        filterText: nextOptions.filterText || '',
        level: nextOptions.level || 'all',
        sourceWindowId: id,
      }));
    }

    function openAboutConnection() {
      revealNext(openConnectionWindow({
        x: win?.offsetLeft + 20,
        y: win?.offsetTop + 20,
        sourceWindowId: id,
      }));
    }

    function openAboutWindowGroups() {
      revealNext(openWindowGroupsWindow({
        x: win?.offsetLeft + 32,
        y: win?.offsetTop + 32,
        sourceWindowId: id,
      }));
    }

    function openAboutWindowLinks() {
      revealNext(openWindowLinksWindow({
        x: win?.offsetLeft + 28,
        y: win?.offsetTop + 28,
        viewMode: 'related',
        sourceWindowId: id,
      }));
    }

    async function refreshAboutInfo() {
      applyAboutWindowToolbarDisabledState(buttons, true);
      renderAboutInfo(readRuntimeVersionInfo?.() || {}, '');
      try {
        const data = await api('/diagnostics');
        if (data?.success) {
          const nextRuntimeVersionInfo = {...((typeof readRuntimeVersionInfo === 'function' ? readRuntimeVersionInfo() : null) || {}), ...data};
          setRuntimeVersionInfo?.(nextRuntimeVersionInfo);
          renderTaskbarVersion?.(nextRuntimeVersionInfo);
          renderAboutInfo(data, '');
        }
      } catch (error) {
        renderAboutInfo(readRuntimeVersionInfo?.() || {}, error.message);
        setStatus(false, error.message);
      } finally {
        applyAboutWindowToolbarDisabledState(buttons, false);
        syncAboutWindowState();
      }
    }

    function mount() {
      bindAboutWindowToolbarActions(buttons, {
        openAboutConnection,
        openAboutWindowLinks,
        openAboutWindowGroups,
        openAboutStatusLogAll: () => openAboutStatusLog({level: 'all'}),
        openAboutStatusLogErrors: () => openAboutStatusLog({level: 'error'}),
        copySupportBundle,
        downloadSupportBundle,
        refreshAboutInfo,
        copyDiagnostics,
        downloadDiagnostics,
      });
      liveWindowRenderers?.set?.(id, () => renderAboutInfo(latestServerData, latestDiagnosticsError));
      syncAboutWindowState();
      renderAboutInfo(readRuntimeVersionInfo?.() || {}, '');
      if (options.autoRefresh !== false) refreshAboutInfo();
      return {
        renderAboutInfo,
        refreshAboutInfo,
      };
    }

    return {
      mount,
      renderAboutInfo,
      refreshAboutInfo,
    };
  }

  return {
    createAboutWindowRuntime,
  };
});
