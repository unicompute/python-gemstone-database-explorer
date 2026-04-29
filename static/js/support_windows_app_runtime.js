(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SupportWindowsAppRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createSupportWindowsAppRuntime(deps = {}) {
    function openConnectionWindow(options = {}) {
      const { win, body, id } = deps.createWindow({
        title: 'Connection',
        width: options.width || 560,
        height: options.height || 420,
        x: options.x,
        y: options.y,
        taskbarLabel: 'Connection',
      });
      body.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:14px;overflow:auto;min-height:0';
      body.innerHTML = `
        <div class="about-title">Connection</div>
        <div class="about-subtitle">
          Effective GemStone login target, local <code>gslist -lcv</code> probe, and suggested shell fixes.
        </div>
        <div class="about-grid" id="${id}-grid"></div>
        <div id="${id}-cards" style="display:flex;flex-direction:column;gap:10px"></div>
        <div class="about-actions">
          <button class="btn-ghost" id="${id}-retry">Retry Startup</button>
          <button class="btn-ghost" id="${id}-apply-override">Use Suggested Target</button>
          <button class="btn-ghost" id="${id}-save-suggested-favorite">Save Suggested Target</button>
          <button class="btn-ghost" id="${id}-edit-override">Edit Override</button>
          <button class="btn-ghost" id="${id}-favorite-target">Save Target</button>
          <button class="btn-ghost" id="${id}-import-profiles">Import Profiles</button>
          <button class="btn-ghost" id="${id}-replace-profiles">Replace Profiles</button>
          <button class="btn-ghost" id="${id}-clear-favorites">Clear Favorites</button>
          <button class="btn-ghost" id="${id}-clear-recents">Clear Recents</button>
          <button class="btn-ghost" id="${id}-clear-last-working">Clear Last Working</button>
          <button class="btn-ghost" id="${id}-clear-override">Clear Override</button>
          <button class="btn-ghost" id="${id}-refresh">Refresh</button>
          <button class="btn-ghost" id="${id}-copy-fix">Copy Fix Shell</button>
          <button class="btn-ghost" id="${id}-copy-profiles">Copy Profiles</button>
          <button class="btn-ghost" id="${id}-download-profiles">Download Profiles</button>
          <button class="btn-ghost" id="${id}-copy">Copy JSON</button>
          <button class="btn-ghost" id="${id}-download">Download JSON</button>
        </div>
      `;
      const grid = body.querySelector(`#${id}-grid`);
      const cards = body.querySelector(`#${id}-cards`);
      deps.createConnectionWindowRuntime({
        id,
        win,
        options,
        buttons: {
          retryBtn: body.querySelector(`#${id}-retry`),
          applyOverrideBtn: body.querySelector(`#${id}-apply-override`),
          saveSuggestedFavoriteBtn: body.querySelector(`#${id}-save-suggested-favorite`),
          editOverrideBtn: body.querySelector(`#${id}-edit-override`),
          favoriteTargetBtn: body.querySelector(`#${id}-favorite-target`),
          importProfilesBtn: body.querySelector(`#${id}-import-profiles`),
          replaceProfilesBtn: body.querySelector(`#${id}-replace-profiles`),
          clearFavoritesBtn: body.querySelector(`#${id}-clear-favorites`),
          clearRecentsBtn: body.querySelector(`#${id}-clear-recents`),
          clearLastWorkingBtn: body.querySelector(`#${id}-clear-last-working`),
          clearOverrideBtn: body.querySelector(`#${id}-clear-override`),
          refreshBtn: body.querySelector(`#${id}-refresh`),
          copyFixBtn: body.querySelector(`#${id}-copy-fix`),
          copyProfilesBtn: body.querySelector(`#${id}-copy-profiles`),
          downloadProfilesBtn: body.querySelector(`#${id}-download-profiles`),
          copyBtn: body.querySelector(`#${id}-copy`),
          downloadBtn: body.querySelector(`#${id}-download`),
        },
        grid,
        cards,
        buildConnectionPayloadModel: deps.buildConnectionPayloadModel,
        buildConnectionFixShell: deps.buildConnectionFixShell,
        startupBootstrapped: deps.startupBootstrapped,
        persistConnectionOverride: deps.persistConnectionOverride,
        setStatus: deps.setStatus,
        summarizeConnectionOverride: deps.summarizeConnectionOverride,
        buildShellForOverride: deps.buildShellForOverride,
        copyTextToClipboard: deps.copyTextToClipboard,
        sanitizeConnectionCheckResult: deps.sanitizeConnectionCheckResult,
        connectionOverrideKey: deps.connectionOverrideKey,
        sanitizeConnectionOverride: deps.sanitizeConnectionOverride,
        api: deps.api,
        captureConnectionCheckResult: deps.captureConnectionCheckResult,
        resolveConnectionPreflight: deps.resolveConnectionPreflight,
        describeConnectionCheckFreshness: deps.describeConnectionCheckFreshness,
        getVisibleConnectionCheckEntriesModel: deps.getVisibleConnectionCheckEntriesModel,
        isFilteredConnectionChecksViewModel: deps.isFilteredConnectionChecksViewModel,
        buildConnectionCheckBundle: deps.buildConnectionCheckBundle,
        downloadDataFile: deps.downloadDataFile,
        requestModal: deps.requestModal,
        mergeConnectionCheckBundle: deps.mergeConnectionCheckBundle,
        suggestedConnectionOverrideFromPayloadModel: deps.suggestedConnectionOverrideFromPayloadModel,
        buildConfiguredConnectionOverrideSeedModel: deps.buildConfiguredConnectionOverrideSeedModel,
        readConnectionOverride: deps.readConnectionOverride,
        localStoneOverridesFromPayloadModel: deps.localStoneOverridesFromPayloadModel,
        currentConnectionTargetOverrideModel: deps.currentConnectionTargetOverrideModel,
        readFavoriteConnectionProfiles: deps.readFavoriteConnectionProfiles,
        favoriteProfileForOverrideModel: deps.favoriteProfileForOverrideModel,
        defaultConnectionOverrideName: deps.defaultConnectionOverrideName,
        addFavoriteConnectionProfile: deps.addFavoriteConnectionProfile,
        notifyLiveWindowUpdated: deps.notifyLiveWindowUpdated,
        updateFavoriteConnectionProfile: deps.updateFavoriteConnectionProfile,
        buildConnectionRenderStateModel: deps.buildConnectionRenderStateModel,
        readDefaultFavoriteConnectionProfile: deps.readDefaultFavoriteConnectionProfile,
        readLastSuccessfulConnectionOverride: deps.readLastSuccessfulConnectionOverride,
        readRecentConnectionOverrides: deps.readRecentConnectionOverrides,
        escHtml: deps.escHtml,
        shortLabel: deps.shortLabel,
        isDefaultFavoriteConnectionOverride: deps.isDefaultFavoriteConnectionOverride,
        buildConnectionWindowView: deps.buildConnectionWindowView,
        bindConnectionWindowCardActions: deps.bindConnectionWindowCardActions,
        normalizeConnectionCheckViewMode: deps.normalizeConnectionCheckViewMode,
        moveFavoriteConnectionOverride: deps.moveFavoriteConnectionOverride,
        setDefaultFavoriteConnectionOverride: deps.setDefaultFavoriteConnectionOverride,
        clearDefaultFavoriteConnectionOverride: deps.clearDefaultFavoriteConnectionOverride,
        removeFavoriteConnectionOverride: deps.removeFavoriteConnectionOverride,
        clearLastSuccessfulConnectionOverride: deps.clearLastSuccessfulConnectionOverride,
        removeRecentConnectionOverride: deps.removeRecentConnectionOverride,
        requestConfirmModal: deps.requestConfirmModal,
        clearConnectionOverride: deps.clearConnectionOverride,
        clearFavoriteConnectionProfiles: deps.clearFavoriteConnectionProfiles,
        clearRecentConnectionOverrides: deps.clearRecentConnectionOverrides,
        bindConnectionWindowToolbarActions: deps.bindConnectionWindowToolbarActions,
        liveWindowRenderers: deps.liveWindowRenderers,
        upsertWindowState: deps.upsertWindowState,
        buildConnectionProfileBundle: deps.buildConnectionProfileBundle,
        importConnectionProfileBundle: deps.importConnectionProfileBundle,
        replaceConnectionProfileBundle: deps.replaceConnectionProfileBundle,
        init: deps.init,
        retryStartupRecovery: deps.retryStartupRecovery,
        getManagedWindows: deps.getManagedWindows,
        windowState: deps.windowState,
        restoreSavedLayout: deps.restoreSavedLayout,
        openDefaultStartupLayout: deps.openDefaultStartupLayout,
        startThreadPoller: deps.startThreadPoller,
        markStartupBootstrapped: deps.markStartupBootstrapped,
        persistWindowLayout: deps.persistWindowLayout,
        closeWindow: deps.closeWindow,
        applyConnectionWindowToolbarState: deps.applyConnectionWindowToolbarState,
        rememberLastSuccessfulConnectionOverride: deps.rememberLastSuccessfulConnectionOverride,
        readRuntimeVersionInfo: deps.readRuntimeVersionInfo,
        setRuntimeVersionInfo: deps.setRuntimeVersionInfo,
        renderTaskbarVersion: deps.renderTaskbarVersion,
      }).mount();
      return win;
    }

    function openAboutWindow(options = {}) {
      const { win, body, id } = deps.createWindow({
        title: 'About',
        width: options.width || 420,
        height: options.height || 320,
        x: options.x,
        y: options.y,
        taskbarLabel: 'About',
      });
      body.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:14px;overflow:auto;min-height:0';
      body.innerHTML = `
        <div class="about-title">GemStone Database Explorer</div>
        <div class="about-subtitle">
          Windowed GemStone browser/debugger with object inspectors, Class Browser, Symbol List Browser,
          debugger windows, persisted layouts, and isolated session-channel families.
        </div>
        <div class="about-grid" id="${id}-grid"></div>
        <div class="about-actions">
          <button class="btn-ghost" id="${id}-connection">Connection</button>
          <button class="btn-ghost" id="${id}-window-links">Window Links</button>
          <button class="btn-ghost" id="${id}-window-groups">Window Groups</button>
          <button class="btn-ghost" id="${id}-status-log">Status Log</button>
          <button class="btn-ghost" id="${id}-status-errors">Errors Only</button>
          <button class="btn-ghost" id="${id}-copy-bundle">Copy Bundle</button>
          <button class="btn-ghost" id="${id}-bundle">Download Bundle</button>
          <button class="btn-ghost" id="${id}-refresh">Refresh</button>
          <button class="btn-ghost" id="${id}-copy">Copy JSON</button>
          <button class="btn-ghost" id="${id}-download">Download JSON</button>
        </div>
      `;
      deps.createAboutWindowRuntime({
        id,
        win,
        options,
        grid: body.querySelector(`#${id}-grid`),
        buttons: {
          connectionBtn: body.querySelector(`#${id}-connection`),
          windowLinksBtn: body.querySelector(`#${id}-window-links`),
          windowGroupsBtn: body.querySelector(`#${id}-window-groups`),
          statusLogBtn: body.querySelector(`#${id}-status-log`),
          statusErrorsBtn: body.querySelector(`#${id}-status-errors`),
          copyBundleBtn: body.querySelector(`#${id}-copy-bundle`),
          bundleBtn: body.querySelector(`#${id}-bundle`),
          refreshBtn: body.querySelector(`#${id}-refresh`),
          copyBtn: body.querySelector(`#${id}-copy`),
          downloadBtn: body.querySelector(`#${id}-download`),
        },
        liveWindowRenderers: deps.liveWindowRenderers,
        upsertWindowState: deps.upsertWindowState,
        buildDiagnosticsSnapshotData: deps.buildDiagnosticsSnapshotData,
        buildSupportBundleData: deps.buildSupportBundleData,
        buildAboutWindowView: deps.buildAboutWindowView,
        applyAboutWindowToolbarDisabledState: deps.applyAboutWindowToolbarDisabledState,
        bindAboutWindowToolbarActions: deps.bindAboutWindowToolbarActions,
        readConnectionOverride: deps.readConnectionOverride,
        getConnectionOverrideHeaders: deps.getConnectionOverrideHeaders,
        readLastSuccessfulConnectionOverride: deps.readLastSuccessfulConnectionOverride,
        readFavoriteConnectionProfiles: deps.readFavoriteConnectionProfiles,
        readDefaultFavoriteConnectionProfile: deps.readDefaultFavoriteConnectionProfile,
        readRecentConnectionOverrides: deps.readRecentConnectionOverrides,
        getStatusHistory: deps.getStatusHistory,
        getStatusHistorySummary: deps.getStatusHistorySummary,
        buildWindowLayoutSnapshot: deps.buildWindowLayoutSnapshot,
        collectOpenWindowSummaries: deps.collectOpenWindowSummaries,
        collectWindowLinkSummaries: deps.collectWindowLinkSummaries,
        collectWindowGroupSummaries: deps.collectWindowGroupSummaries,
        sanitizeConnectionOverride: deps.sanitizeConnectionOverride,
        summarizeConnectionOverride: deps.summarizeConnectionOverride,
        copyTextToClipboard: deps.copyTextToClipboard,
        downloadDataFile: deps.downloadDataFile,
        setStatus: deps.setStatus,
        openStatusLogWindow,
        openConnectionWindow,
        openWindowGroupsWindow,
        openWindowLinksWindow,
        api: deps.api,
        readRuntimeVersionInfo: deps.readRuntimeVersionInfo,
        setRuntimeVersionInfo: deps.setRuntimeVersionInfo,
        renderTaskbarVersion: deps.renderTaskbarVersion,
        revealWindow: deps.revealWindow,
        escHtml: deps.escHtml,
      }).mount();
      return win;
    }

    function openWindowLinksWindow(options = {}) {
      const { body, id, win } = deps.createWindow({
        title: 'Window Links',
        width: options.width || 620,
        height: options.height || 360,
        x: options.x,
        y: options.y,
        taskbarLabel: 'Window Links',
      });
      body.style.cssText = 'display:flex;flex-direction:column;padding:12px;overflow:hidden;min-height:0';
      body.innerHTML = `
        <div class="status-log-toolbar">
          <div class="status-log-controls">
            <input class="status-log-filter" id="${id}-filter" type="text" placeholder="Filter links">
            <div class="status-log-scope" id="${id}-scope">
              <button class="btn-ghost" data-link-type="all">All</button>
              <button class="btn-ghost" data-link-type="source">Source</button>
              <button class="btn-ghost" data-link-type="arrow">Arrow</button>
            </div>
            <div class="status-log-scope" id="${id}-view-mode">
              <button class="btn-ghost" data-view-mode="all">All Windows</button>
              <button class="btn-ghost" data-view-mode="related">Related Only</button>
            </div>
          </div>
          <div class="status-log-controls">
            <button class="btn-ghost" id="${id}-raise-selected">Raise Selected Group</button>
            <button class="btn-ghost" id="${id}-close-selected">Close Selected Group</button>
            <button class="btn-ghost" id="${id}-copy">Copy JSON</button>
            <button class="btn-ghost" id="${id}-download">Download JSON</button>
            <button class="btn-ghost" id="${id}-refresh">Refresh</button>
          </div>
        </div>
        <div class="status-log-meta" id="${id}-meta"></div>
        <div class="window-links-list" id="${id}-list"></div>
      `;
      deps.createWindowLinksWindowRuntime({
        id,
        options,
        filterInput: body.querySelector(`#${id}-filter`),
        scope: body.querySelector(`#${id}-scope`),
        viewScope: body.querySelector(`#${id}-view-mode`),
        meta: body.querySelector(`#${id}-meta`),
        list: body.querySelector(`#${id}-list`),
        buttons: {
          raiseSelectedBtn: body.querySelector(`#${id}-raise-selected`),
          closeSelectedBtn: body.querySelector(`#${id}-close-selected`),
          copyBtn: body.querySelector(`#${id}-copy`),
          downloadBtn: body.querySelector(`#${id}-download`),
          refreshBtn: body.querySelector(`#${id}-refresh`),
        },
        windowState: deps.windowState,
        upsertWindowState: deps.upsertWindowState,
        collectOpenWindowSummaries: deps.collectOpenWindowSummaries,
        collectWindowLinkSummaries: deps.collectWindowLinkSummaries,
        scopeWindowLinks: deps.scopeWindowLinks,
        filterWindowLinks: deps.filterWindowLinks,
        isWindowLinksViewFiltered: deps.isWindowLinksViewFiltered,
        buildWindowLinksExportPayload: deps.buildWindowLinksExportPayload,
        buildWindowLinksWindowView: deps.buildWindowLinksWindowView,
        applyWindowLinksToolbarState: deps.applyWindowLinksToolbarState,
        bindWindowLinksToolbarActions: deps.bindWindowLinksToolbarActions,
        bindWindowLinkListActions: deps.bindWindowLinkListActions,
        getRelatedWindowIds: deps.getRelatedWindowIds,
        sanitizeSelectionIndex: deps.sanitizeSelectionIndex,
        revealWindow: deps.revealWindow,
        raiseWindowGroupByIds: deps.raiseWindowGroupByIds,
        closeWindowGroupByIds: deps.closeWindowGroupByIds,
        copyTextToClipboard: deps.copyTextToClipboard,
        downloadDataFile: deps.downloadDataFile,
        setStatus: deps.setStatus,
        liveWindowRenderers: deps.liveWindowRenderers,
        notifyLiveWindowUpdated: deps.notifyLiveWindowUpdated,
        arrows: deps.readArrows(),
        escHtml: deps.escHtml,
      }).mount();
      return win;
    }

    function openWindowGroupsWindow(options = {}) {
      const { body, id, win } = deps.createWindow({
        title: 'Window Groups',
        width: options.width || 560,
        height: options.height || 360,
        x: options.x,
        y: options.y,
        taskbarLabel: 'Window Groups',
      });
      body.style.cssText = 'display:flex;flex-direction:column;padding:12px;overflow:hidden;min-height:0';
      body.innerHTML = `
        <div class="status-log-toolbar">
          <div class="status-log-controls">
            <input class="status-log-filter" id="${id}-filter" type="text" placeholder="Filter groups">
            <div class="status-log-scope" id="${id}-scope">
              <button class="btn-ghost" data-view-mode="all">All Windows</button>
              <button class="btn-ghost" data-view-mode="linked">Linked Only</button>
            </div>
            <button class="btn-ghost" id="${id}-raise-largest">Raise Largest Group</button>
            <button class="btn-ghost" id="${id}-close-largest">Close Largest Group</button>
          </div>
          <div class="status-log-controls">
            <button class="btn-ghost" id="${id}-copy">Copy JSON</button>
            <button class="btn-ghost" id="${id}-download">Download JSON</button>
            <button class="btn-ghost" id="${id}-refresh">Refresh</button>
          </div>
        </div>
        <div class="status-log-meta" id="${id}-meta"></div>
        <div class="window-groups-list" id="${id}-list"></div>
      `;
      deps.createWindowGroupsWindowRuntime({
        id,
        options,
        filterInput: body.querySelector(`#${id}-filter`),
        scope: body.querySelector(`#${id}-scope`),
        meta: body.querySelector(`#${id}-meta`),
        list: body.querySelector(`#${id}-list`),
        buttons: {
          raiseLargestBtn: body.querySelector(`#${id}-raise-largest`),
          closeLargestBtn: body.querySelector(`#${id}-close-largest`),
          copyBtn: body.querySelector(`#${id}-copy`),
          downloadBtn: body.querySelector(`#${id}-download`),
          refreshBtn: body.querySelector(`#${id}-refresh`),
        },
        windowState: deps.windowState,
        upsertWindowState: deps.upsertWindowState,
        collectOpenWindowSummaries: deps.collectOpenWindowSummaries,
        collectWindowGroupSummaries: deps.collectWindowGroupSummaries,
        filterWindowGroups: deps.filterWindowGroups,
        isWindowGroupsViewFiltered: deps.isWindowGroupsViewFiltered,
        buildWindowGroupsExportPayload: deps.buildWindowGroupsExportPayload,
        buildWindowGroupsWindowView: deps.buildWindowGroupsWindowView,
        applyWindowGroupsToolbarState: deps.applyWindowGroupsToolbarState,
        bindWindowGroupsToolbarActions: deps.bindWindowGroupsToolbarActions,
        bindWindowGroupListActions: deps.bindWindowGroupListActions,
        getRelatedWindowIds: deps.getRelatedWindowIds,
        revealWindow: deps.revealWindow,
        raiseWindowGroupByIds: deps.raiseWindowGroupByIds,
        closeWindowGroupByIds: deps.closeWindowGroupByIds,
        copyTextToClipboard: deps.copyTextToClipboard,
        downloadDataFile: deps.downloadDataFile,
        setStatus: deps.setStatus,
        liveWindowRenderers: deps.liveWindowRenderers,
        notifyLiveWindowUpdated: deps.notifyLiveWindowUpdated,
        arrows: deps.readArrows(),
        escHtml: deps.escHtml,
      }).mount();
      return win;
    }

    function openStatusLogWindow(options = {}) {
      const { body, id, win } = deps.createWindow({
        title: 'Status Log',
        width: options.width || 560,
        height: options.height || 340,
        x: options.x,
        y: options.y,
        taskbarLabel: 'Status Log',
      });
      body.style.cssText = 'display:flex;flex-direction:column;padding:12px;overflow:hidden;min-height:0';
      body.innerHTML = `
        <div class="status-log-toolbar">
          <div class="status-log-controls">
            <input class="status-log-filter" id="${id}-filter" type="text" placeholder="Filter status messages">
            <div class="status-log-scope" id="${id}-scope">
              <button class="btn-ghost" data-level="all">All</button>
              <button class="btn-ghost" data-level="ok">OK</button>
              <button class="btn-ghost" data-level="error">Errors</button>
            </div>
          </div>
          <div class="status-log-controls">
            <button class="btn-ghost" id="${id}-clear">Clear</button>
            <button class="btn-ghost" id="${id}-copy">Copy JSON</button>
            <button class="btn-ghost" id="${id}-download">Download JSON</button>
          </div>
        </div>
        <div class="status-log-meta" id="${id}-meta"></div>
        <div class="status-log-list" id="${id}-list"></div>
      `;
      deps.createStatusLogWindowRuntime({
        id,
        options,
        filterInput: body.querySelector(`#${id}-filter`),
        scope: body.querySelector(`#${id}-scope`),
        meta: body.querySelector(`#${id}-meta`),
        list: body.querySelector(`#${id}-list`),
        buttons: {
          clearBtn: body.querySelector(`#${id}-clear`),
          copyBtn: body.querySelector(`#${id}-copy`),
          downloadBtn: body.querySelector(`#${id}-download`),
        },
        windowState: deps.windowState,
        upsertWindowState: deps.upsertWindowState,
        normalizeStatusLogLevel: deps.normalizeStatusLogLevel,
        getStatusHistory: deps.getStatusHistory,
        buildStatusLogViewState: deps.buildStatusLogViewState,
        statusEntriesForExportModel: deps.statusEntriesForExportModel,
        buildStatusLogWindowView: deps.buildStatusLogWindowView,
        applyStatusLogToolbarState: deps.applyStatusLogToolbarState,
        bindStatusLogToolbarActions: deps.bindStatusLogToolbarActions,
        bindStatusLogSourceButtons: deps.bindStatusLogSourceButtons,
        resolveStatusEntrySourceWindow: deps.resolveStatusEntrySourceWindow,
        formatStatusTimestampModel: deps.formatStatusTimestampModel,
        revealWindow: deps.revealWindow,
        clearStatusHistory: deps.clearStatusHistory,
        copyTextToClipboard: deps.copyTextToClipboard,
        downloadDataFile: deps.downloadDataFile,
        setStatus: deps.setStatus,
        liveWindowRenderers: deps.liveWindowRenderers,
        escHtml: deps.escHtml,
      }).mount();
      return win;
    }

    return {
      openConnectionWindow,
      openAboutWindow,
      openWindowLinksWindow,
      openWindowGroupsWindow,
      openStatusLogWindow,
    };
  }

  return {
    createSupportWindowsAppRuntime,
  };
});
