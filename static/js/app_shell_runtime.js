(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AppShellRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createAppShellRuntime(deps = {}) {
    let taskbarRuntime = null;
    let startupLayoutRuntime = null;
    let windowShellRuntime = null;
    let objectLinkRuntime = null;
    let desktopStatusRuntime = null;
    let windowArrowRuntime = null;
    let objectChipRuntime = null;

    const appApiRuntime = deps.createAppApiRuntime({
      fetchImpl: (...args) => deps.window.fetch(...args),
      Headers: deps.window.Headers,
      navigator: deps.window.navigator,
      document: deps.document,
      window: deps.window,
      Blob: deps.window.Blob,
      URL: deps.window.URL,
      timerApi: deps.window,
      connectionOverrideHeadersFor(override) {
        return taskbarRuntime?.connectionOverrideHeadersFor?.(override) || {};
      },
      getConnectionOverrideHeaders() {
        return taskbarRuntime?.getConnectionOverrideHeaders?.() || {};
      },
      loadRuntimeVersionInfo() {
        return desktopStatusRuntime?.loadRuntimeVersionInfo?.();
      },
    });

    const {
      escHtml,
      api,
      apiPost,
      apiEvaluate,
      apiTransaction,
      exactWriteSessionChannel,
      apiWithParams,
      resolveConnectionPreflight,
      copyTextToClipboard,
      downloadDataFile,
      loadRuntimeVersionInfo,
    } = appApiRuntime;

    windowArrowRuntime = deps.createWindowArrowRuntime({
      document: deps.document,
      arrowCanvas: deps.arrowCanvas,
      shortLabel: deps.desktopShortLabel,
    });

    desktopStatusRuntime = deps.createDesktopStatusRuntime({
      document: deps.document,
      readWindowState(id) {
        return deps.windowState.get(id) || {};
      },
      getFocusedOrTopWindow: () => getFocusedOrTopWindow(),
      recordStatusEntry(ok, msg) {
        taskbarRuntime?.recordStatusEntry?.(ok, msg);
      },
      fetchVersion: () => api('/version'),
      onRuntimeVersionLoaded(value) {
        deps.writeRuntimeVersionInfo?.(value);
      },
    });

    windowShellRuntime = deps.createWindowShellRuntime({
      document: deps.document,
      window: deps.window,
      desktop: deps.desktop,
      escHtml,
      nextZIndex() {
        const nextValue = (deps.readZTop?.() || 0) + 1;
        deps.writeZTop?.(nextValue);
        return nextValue;
      },
      taskbarInsertBeforeEl: deps.document.getElementById('halted-threads-bar'),
      taskbarContainer: deps.document.getElementById('taskbar'),
      upsertWindowState: (...args) => upsertWindowState(...args),
      persistWindowLayout: () => persistWindowLayout(),
      notifyStatusHistoryUpdated() {
        taskbarRuntime?.notifyStatusHistoryUpdated?.();
      },
      notifyLiveWindowUpdated() {
        taskbarRuntime?.notifyLiveWindowUpdated?.();
      },
      redrawArrows(...args) {
        return redrawArrows(...args);
      },
      removeArrowsFor(...args) {
        return removeArrowsFor(...args);
      },
      liveWindowRenderers: deps.liveWindowRenderers,
      windowState: deps.windowState,
    });

    objectLinkRuntime = deps.createObjectLinkRuntime({
      document: deps.document,
      window: deps.window,
      desktop: deps.desktop,
      windowState: deps.windowState,
      openObjectBrowser: (...args) => deps.openObjectBrowser(...args),
      drawArrow(...args) {
        return drawArrow(...args);
      },
      redrawArrows(...args) {
        return redrawArrows(...args);
      },
      removeArrowsWhere(...args) {
        return removeArrowsWhere(...args);
      },
      isLeafBasetype: deps.desktopIsLeafBasetype,
      shortLabel: deps.desktopShortLabel,
    });

    objectChipRuntime = deps.createObjectChipRuntime({
      document: deps.document,
      apiEvaluate,
      maybeOpenEvalDebugger: (...args) => maybeOpenEvalDebugger(...args),
      openLinkedObjectWindow: payload => openLinkedObjectWindow(payload),
    });

    startupLayoutRuntime = deps.createStartupLayoutRuntime({
      window: deps.window,
      getStartupIds: () => deps.readStartupIds?.() || {},
      getRoots: () => deps.readRoots?.() || {},
      openObjectBrowser: (...args) => deps.openObjectBrowser(...args),
      clearWindowLayout: () => clearWindowLayout(),
      closeAllWindows: () => closeAllWindows(),
      persistWindowLayout: () => persistWindowLayout(),
      setSuppressWindowLayoutPersist(value) {
        deps.writeSuppressWindowLayoutPersist?.(!!value);
      },
      setCascadePosition(x, y) {
        windowShellRuntime.setCascadePosition(x, y);
      },
    });

    const desktopStateRuntime = deps.createDesktopStateRuntime({
      document: deps.document,
      localStorage: deps.localStorage,
      windowState: deps.windowState,
      restorableWindowKinds: deps.restorableWindowKinds,
      windowLayoutStorageKey: deps.windowLayoutStorageKey,
      healthyWindowLayoutStorageKey: deps.healthyWindowLayoutStorageKey,
      windowLayoutModel: deps.windowLayoutModel,
      windowRestoreModel: deps.windowRestoreModel,
      createDesktopLayoutRuntime: deps.createDesktopLayoutRuntime,
      isPersistSuppressed: () => !!deps.readSuppressWindowLayoutPersist?.(),
      setPersistSuppressed(value) {
        deps.writeSuppressWindowLayoutPersist?.(!!value);
      },
      isStartupBootstrapped: () => !!deps.readStartupBootstrapped?.(),
      sanitizeSelectionIndex(index, items) {
        return deps.windowLayoutModel.sanitizeSelectionIndex(index, items);
      },
      toggleMinimise(...args) {
        return toggleMinimise(...args);
      },
      focusWin(...args) {
        return focusWin(...args);
      },
      redrawArrows(...args) {
        return redrawArrows(...args);
      },
      notifyLiveWindowUpdated() {
        taskbarRuntime?.notifyLiveWindowUpdated?.();
      },
      getZTop: () => deps.readZTop?.() || 0,
      setZTop(value) {
        deps.writeZTop?.(value);
      },
      buildWindowLinkSummaries: deps.buildWindowLinkSummaries,
      buildWindowGroupSummaries: deps.buildWindowGroupSummaries,
      get arrows() {
        return windowArrowRuntime?.getArrows?.() || [];
      },
      computeRelatedWindowIds: deps.computeRelatedWindowIds,
      getStartupIds: () => deps.readStartupIds?.() || {},
      getRoots: () => deps.readRoots?.() || {},
      openObjectBrowser: (...args) => deps.openObjectBrowser(...args),
      openClassBrowser: (...args) => deps.openClassBrowser(...args),
      openWorkspace: (...args) => deps.openWorkspace(...args),
      openRubyWorkspace: (...args) => deps.openRubyWorkspace(...args),
      openMaglevReportWindow: (...args) => deps.openMaglevReportWindow(...args),
      openWebBrowser: (...args) => deps.openWebBrowser(...args),
      openConnectionWindow: (...args) => deps.openConnectionWindow(...args),
      openAboutWindow: (...args) => deps.openAboutWindow(...args),
      openStatusLogWindow: (...args) => deps.openStatusLogWindow(...args),
      openWindowGroupsWindow: (...args) => deps.openWindowGroupsWindow(...args),
      openWindowLinksWindow: (...args) => deps.openWindowLinksWindow(...args),
      openSymbolList: (...args) => deps.openSymbolList(...args),
      openDebugger: (...args) => deps.openDebugger(...args),
      openMethodQueryWindow: (...args) => deps.openMethodQueryWindow(...args),
      openHierarchyWindow: (...args) => deps.openHierarchyWindow(...args),
      openVersionsWindow: (...args) => deps.openVersionsWindow(...args),
    });

    const {
      readWindowState,
      parsePixelValue,
      getManagedWindows,
      getOrderedManagedWindows,
      isRestorableWindowState,
      serializeWindowLayoutEntry,
      buildWindowLayoutSnapshot,
      hasRecoverableWindows,
      getDesktopLayoutRuntime,
      upsertWindowState,
      persistHealthyWindowLayout,
      persistWindowLayout,
      readWindowLayout,
      readHealthyWindowLayout,
      readRecoverableWindowLayout,
      collectOpenWindowSummaries,
      collectWindowLinkSummaries,
      collectWindowGroupSummaries,
      clearWindowLayout,
      applyRestoredSourceLinks,
      restoreWindowBounds,
    } = desktopStateRuntime;

    const appDesktopRuntime = deps.createAppDesktopRuntime({
      document: deps.document,
      window: deps.window,
      windowState: deps.windowState,
      windowLayoutModel: deps.windowLayoutModel,
      desktopStatusRuntime,
      windowShellRuntime,
      windowArrowRuntime,
      objectLinkRuntime,
      objectChipRuntime,
      desktopStateRuntime,
      setSuppressWindowLayoutPersist(value) {
        deps.writeSuppressWindowLayoutPersist?.(!!value);
      },
      persistWindowLayout,
      notifyLiveWindowUpdated() {
        taskbarRuntime?.notifyLiveWindowUpdated?.();
      },
      getManagedWindows,
      getOrderedManagedWindows,
      closeAllManagedWindows: deps.closeAllManagedWindows,
      getDesktopFocusedOrTopWindow: deps.getDesktopFocusedOrTopWindow,
      revealDesktopWindow: deps.revealDesktopWindow,
      resolveDesktopStatusEntrySourceWindow: deps.resolveDesktopStatusEntrySourceWindow,
      withSuppressedDesktopLayoutPersist: deps.withSuppressedDesktopLayoutPersist,
      afterDesktopWindowLayoutMutation: deps.afterDesktopWindowLayoutMutation,
      afterDesktopWindowLayoutPersistOnly: deps.afterDesktopWindowLayoutPersistOnly,
      raiseManagedWindowGroupByIds: deps.raiseManagedWindowGroupByIds,
      closeManagedWindowGroupByIds: deps.closeManagedWindowGroupByIds,
      cascadeManagedWindows: deps.cascadeManagedWindows,
      tileManagedWindows: deps.tileManagedWindows,
      raiseManagedRelatedWindows: deps.raiseManagedRelatedWindows,
      minimiseManagedWindows: deps.minimiseManagedWindows,
      closeManagedFocusedWindowGroup: deps.closeManagedFocusedWindowGroup,
      startupLayoutRuntime,
    });

    const {
      setStatus,
      isLeafBasetype,
      shortLabel,
      currentStatusSource,
      renderTaskbarVersion,
      sanitizeSelectionIndex,
      closeAllWindows,
      getFocusedOrTopWindow,
      revealWindow,
      resolveStatusEntrySourceWindow,
      getRelatedWindowIds,
      withSuppressedWindowLayoutPersist,
      afterWindowLayoutMutation,
      afterWindowLayoutPersistOnly,
      raiseWindowGroupByIds,
      closeWindowGroupByIds,
      cascadeWindows,
      tileWindows,
      raiseRelatedWindows,
      minimiseAllWindows,
      closeWindowGroup,
      closeOtherWindows,
      restoreSavedLayout,
      openDefaultStartupLayout,
      resetStartupLayout,
      shouldDrawManualArrow,
      clampLinkedWindowPosition,
      positionLinkedWindowOutsideSource,
      resolveLinkedWindowPosition,
      openLinkedObjectWindow,
      attachObjectButtonBehavior,
      createWindow,
      sourceRelativeWindowPosition,
      focusWin,
      closeWindow,
      toggleMinimise,
      drawArrow,
      redrawArrows,
      removeArrowsWhere,
      removeArrowsFor,
      collectObjectLinks,
      syncObjectWindowArrows,
      makeChip,
    } = appDesktopRuntime;

    taskbarRuntime = deps.createTaskbarRuntime({
      document: deps.document,
      window: deps.window,
      localStorage: deps.localStorage,
      taskbarConnectionOverrideButton: deps.taskbarConnectionOverrideButton,
      taskbarWindowTypeButtons: deps.taskbarWindowTypeButtons,
      dockContextMenu: deps.dockContextMenu,
      dockWindowPreview: deps.dockWindowPreview,
      dockLauncherBtn: deps.dockLauncherBtn,
      dockLauncherPanel: deps.dockLauncherPanel,
      connectionOverrideStorageKey: deps.connectionOverrideStorageKey,
      statusHistoryStorageKey: deps.statusHistoryStorageKey,
      maglevReportDefs: deps.maglevReportDefs,
      sanitizeConnectionOverride: deps.sanitizeConnectionOverride,
      readConnectionOverride: deps.readConnectionOverride,
      rememberRecentConnectionOverride: deps.rememberRecentConnectionOverride,
      readPersistedStatusHistory: deps.readPersistedStatusHistory,
      writePersistedStatusHistory: deps.writePersistedStatusHistory,
      appendStatusHistoryEntry: deps.appendStatusHistoryEntry,
      summarizeStatusHistory: deps.summarizeStatusHistory,
      shortLabel,
      currentStatusSource,
      resolveStatusEntrySourceWindow,
      getLiveWindowRenderers: () => Array.from(deps.liveWindowRenderers.values()),
      buildDockContextMenuHtml: deps.buildDockContextMenuHtml,
      applyDockContextMenuState: deps.applyDockContextMenuState,
      bindDockContextMenuActions: deps.bindDockContextMenuActions,
      buildDockWindowPreviewHtml: deps.buildDockWindowPreviewHtml,
      applyDockWindowPreviewState: deps.applyDockWindowPreviewState,
      bindDockWindowPreviewActions: deps.bindDockWindowPreviewActions,
      buildDockLauncherView: deps.buildDockLauncherView,
      applyDockLauncherState: deps.applyDockLauncherState,
      bindDockLauncherActions: deps.bindDockLauncherActions,
      readPinnedCommands: deps.readPinnedCommands,
      normalizePinnedCommands: deps.normalizePinnedCommands,
      writePinnedCommands: deps.writePinnedCommands,
      togglePinnedCommand: deps.togglePinnedCommand,
      getOrderedManagedWindows,
      readWindowState,
      collectOpenWindowSummaries,
      raiseWindowGroupByIds,
      closeWindowGroupByIds,
      revealWindow,
      resolveStatusEntrySourceWindow,
      getStartupIds: () => deps.readStartupIds?.() || {},
      getRoots: () => deps.readRoots?.() || {},
      openObjectBrowser: (...args) => deps.openObjectBrowser(...args),
      openClassBrowser: (...args) => deps.openClassBrowser(...args),
      openWorkspace: (...args) => deps.openWorkspace(...args),
      openRubyWorkspace: (...args) => deps.openRubyWorkspace(...args),
      openMaglevReportWindow: (...args) => deps.openMaglevReportWindow(...args),
      openSymbolList: (...args) => deps.openSymbolList(...args),
      openWebBrowser: (...args) => deps.openWebBrowser(...args),
      openConnectionWindow: (...args) => deps.openConnectionWindow(...args),
      openAboutWindow: (...args) => deps.openAboutWindow(...args),
      openStatusLogWindow: (...args) => deps.openStatusLogWindow(...args),
      openWindowLinksWindow: (...args) => deps.openWindowLinksWindow(...args),
      openWindowGroupsWindow: (...args) => deps.openWindowGroupsWindow(...args),
      openDebugger: (...args) => deps.openDebugger(...args),
      cascadeWindows,
      tileWindows,
      raiseRelatedWindows,
      minimiseAllWindows,
      closeOtherWindows,
      resetStartupLayout,
    });

    const {
      persistConnectionOverride,
      clearConnectionOverride,
      connectionOverrideHeadersFor,
      buildShellForOverride,
      getConnectionOverrideHeaders,
      summarizeConnectionOverride,
      renderTaskbarConnectionOverride,
      getTaskbarWindowKinds,
      getManagedWindowsByKinds,
      getLatestHaltedThreads,
      setLatestHaltedThreads,
      getHaltedThreadCount,
      getStatusHistory,
      getStatusHistorySummary,
      clearStatusHistory,
      recordStatusEntry,
      renderTaskbarWindowTypeButtons,
      renderDockLauncher,
      setDockLauncherOpen,
      runDockLauncherCommand,
      isDockLauncherOpen,
      notifyStatusHistoryUpdated,
      notifyLiveWindowUpdated,
      closeDockContextMenu,
      closeDockWindowPreview,
      isDockContextMenuOpen,
    } = taskbarRuntime;

    const appBootstrapRuntime = deps.createAppBootstrapRuntime({
      startupBootstrapController: deps.startupBootstrapController,
      document: deps.document,
      api,
      exactWriteSessionChannel,
      readConnectionOverride: deps.readConnectionOverride,
      rememberLastSuccessfulConnectionOverride: deps.rememberLastSuccessfulConnectionOverride,
      loadRuntimeVersionInfo,
      resolveConnectionPreflight,
      setStatus,
      openConnectionWindow: (...args) => deps.openConnectionWindow(...args),
      openDebugger: (...args) => deps.openDebugger(...args),
      readWindowState(id) {
        return deps.windowState.get(id) || {};
      },
      setLatestHaltedThreads,
      getManagedWindows,
      getWindowState: id => deps.windowState.get(id),
      restoreSavedLayout,
      openDefaultStartupLayout,
      persistWindowLayout,
      writeStartupIds(nextStartupIds) {
        deps.writeStartupIds?.(nextStartupIds || {});
      },
      writeRoots(nextRoots) {
        deps.writeRoots?.(nextRoots || {});
      },
      writeStartupBootstrapped(value) {
        deps.writeStartupBootstrapped?.(!!value);
      },
      isDockLauncherOpen,
      renderDockLauncher,
      setInterval: deps.window.setInterval.bind(deps.window),
      clearInterval: deps.window.clearInterval.bind(deps.window),
    });

    const {
      setStartupState,
      markStartupBootstrapped,
      init,
      refreshHaltedThreadsBar,
      maybeOpenEvalDebugger,
      startThreadPoller,
      startup,
    } = appBootstrapRuntime;

    function exposeWindowBindings(target) {
      Object.assign(target, {
        setStatus,
        currentStatusSource,
        renderTaskbarVersion,
        resolveStatusEntrySourceWindow,
      });
    }

    function bindDesktopDrop() {
      objectLinkRuntime?.bindDesktopDrop?.();
    }

    function initialiseTaskbar() {
      taskbarRuntime?.initialise?.();
    }

    function boot(target) {
      exposeWindowBindings(target);
      bindDesktopDrop();
      initialiseTaskbar();
      return startup();
    }

    return {
      appApiRuntime,
      appDesktopRuntime,
      appBootstrapRuntime,
      taskbarRuntime,
      desktopStateRuntime,
      windowArrowRuntime,
      desktopStatusRuntime,
      windowShellRuntime,
      objectLinkRuntime,
      objectChipRuntime,
      startupLayoutRuntime,
      escHtml,
      api,
      apiPost,
      apiEvaluate,
      apiTransaction,
      exactWriteSessionChannel,
      apiWithParams,
      resolveConnectionPreflight,
      copyTextToClipboard,
      downloadDataFile,
      loadRuntimeVersionInfo,
      readWindowState,
      parsePixelValue,
      getManagedWindows,
      getOrderedManagedWindows,
      isRestorableWindowState,
      serializeWindowLayoutEntry,
      buildWindowLayoutSnapshot,
      hasRecoverableWindows,
      getDesktopLayoutRuntime,
      upsertWindowState,
      persistHealthyWindowLayout,
      persistWindowLayout,
      readWindowLayout,
      readHealthyWindowLayout,
      readRecoverableWindowLayout,
      collectOpenWindowSummaries,
      collectWindowLinkSummaries,
      collectWindowGroupSummaries,
      clearWindowLayout,
      applyRestoredSourceLinks,
      restoreWindowBounds,
      setStatus,
      isLeafBasetype,
      shortLabel,
      currentStatusSource,
      renderTaskbarVersion,
      sanitizeSelectionIndex,
      closeAllWindows,
      getFocusedOrTopWindow,
      revealWindow,
      resolveStatusEntrySourceWindow,
      getRelatedWindowIds,
      withSuppressedWindowLayoutPersist,
      afterWindowLayoutMutation,
      afterWindowLayoutPersistOnly,
      raiseWindowGroupByIds,
      closeWindowGroupByIds,
      cascadeWindows,
      tileWindows,
      raiseRelatedWindows,
      minimiseAllWindows,
      closeWindowGroup,
      closeOtherWindows,
      restoreSavedLayout,
      openDefaultStartupLayout,
      resetStartupLayout,
      shouldDrawManualArrow,
      clampLinkedWindowPosition,
      positionLinkedWindowOutsideSource,
      resolveLinkedWindowPosition,
      openLinkedObjectWindow,
      attachObjectButtonBehavior,
      createWindow,
      sourceRelativeWindowPosition,
      focusWin,
      closeWindow,
      toggleMinimise,
      drawArrow,
      redrawArrows,
      removeArrowsWhere,
      removeArrowsFor,
      collectObjectLinks,
      syncObjectWindowArrows,
      makeChip,
      persistConnectionOverride,
      clearConnectionOverride,
      connectionOverrideHeadersFor,
      buildShellForOverride,
      getConnectionOverrideHeaders,
      summarizeConnectionOverride,
      renderTaskbarConnectionOverride,
      getTaskbarWindowKinds,
      getManagedWindowsByKinds,
      getLatestHaltedThreads,
      setLatestHaltedThreads,
      getHaltedThreadCount,
      getStatusHistory,
      getStatusHistorySummary,
      clearStatusHistory,
      recordStatusEntry,
      renderTaskbarWindowTypeButtons,
      renderDockLauncher,
      setDockLauncherOpen,
      runDockLauncherCommand,
      isDockLauncherOpen,
      notifyStatusHistoryUpdated,
      notifyLiveWindowUpdated,
      closeDockContextMenu,
      closeDockWindowPreview,
      isDockContextMenuOpen,
      setStartupState,
      markStartupBootstrapped,
      init,
      refreshHaltedThreadsBar,
      maybeOpenEvalDebugger,
      startThreadPoller,
      startup,
      bindDesktopDrop,
      initialiseTaskbar,
      exposeWindowBindings,
      boot,
    };
  }

  return {
    createAppShellRuntime,
  };
});
