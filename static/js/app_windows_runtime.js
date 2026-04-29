(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AppWindowsRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function makeTable(document, escHtml, headers, rows) {
    const tbl = document.createElement('table');
    tbl.className = 'dbtable';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr>' + headers.map(h => `<th>${escHtml(h)}</th>`).join('') + '</tr>';
    tbl.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach(r => {
      const tr = document.createElement('tr');
      r.forEach((c, i) => {
        const td = document.createElement('td');
        td.className = i === 0 ? 'col-key' : 'col-val';
        td.textContent = c;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    return tbl;
  }

  function createAppWindowsRuntime(deps = {}) {
    let objectBrowserAppRuntime = null;
    let classBrowserAppRuntime = null;
    let workspaceAppRuntime = null;
    let supportWindowsAppRuntime = null;
    let developerToolsAppRuntime = null;

    function openObjectBrowser(initialOop, initialLabel, px, py, pw, ph, options = {}) {
      return objectBrowserAppRuntime.openObjectBrowser(initialOop, initialLabel, px, py, pw, ph, options);
    }

    function openExpressionWorkspace(options = {}) {
      return workspaceAppRuntime.openExpressionWorkspace(options);
    }

    function openWorkspace(options = {}) {
      return workspaceAppRuntime.openWorkspace(options);
    }

    function openRubyWorkspace(options = {}) {
      return workspaceAppRuntime.openRubyWorkspace(options);
    }

    function openMaglevReportWindow(reportKey, options = {}) {
      return workspaceAppRuntime.openMaglevReportWindow(reportKey, options);
    }

    function openWebBrowser(initialUrl, options = {}) {
      return workspaceAppRuntime.openWebBrowser(initialUrl, options);
    }

    function openConnectionWindow(options = {}) {
      return supportWindowsAppRuntime.openConnectionWindow(options);
    }

    function openAboutWindow(options = {}) {
      return supportWindowsAppRuntime.openAboutWindow(options);
    }

    function openWindowLinksWindow(options = {}) {
      return supportWindowsAppRuntime.openWindowLinksWindow(options);
    }

    function openWindowGroupsWindow(options = {}) {
      return supportWindowsAppRuntime.openWindowGroupsWindow(options);
    }

    function openStatusLogWindow(options = {}) {
      return supportWindowsAppRuntime.openStatusLogWindow(options);
    }

    function openDebugger(threadOrOop, threadName, options = {}) {
      return developerToolsAppRuntime.openDebugger(threadOrOop, threadName, options);
    }

    function openSymbolList(px, py, pw, ph) {
      return developerToolsAppRuntime.openSymbolList(px, py, pw, ph);
    }

    function openTextWindow(title, text, taskbarLabel, px, py, pw, ph) {
      return workspaceAppRuntime.openTextWindow(title, text, taskbarLabel, px, py, pw, ph);
    }

    function openMethodQueryWindow(title, results, options = {}) {
      return developerToolsAppRuntime.openMethodQueryWindow(title, results, options);
    }

    function openHierarchyWindow(title, classes, options = {}) {
      return developerToolsAppRuntime.openHierarchyWindow(title, classes, options);
    }

    function openVersionsWindow(title, versions, options = {}) {
      return developerToolsAppRuntime.openVersionsWindow(title, versions, options);
    }

    function openClassBrowser(options = {}) {
      return classBrowserAppRuntime.openClassBrowser(options);
    }

    function exposeWindowBindings(target) {
      Object.assign(target, {
        openObjectBrowser,
        openExpressionWorkspace,
        openWorkspace,
        openRubyWorkspace,
        openMaglevReportWindow,
        openWebBrowser,
        openConnectionWindow,
        openAboutWindow,
        openWindowLinksWindow,
        openWindowGroupsWindow,
        openStatusLogWindow,
        openDebugger,
        openSymbolList,
        openTextWindow,
        openMethodQueryWindow,
        openHierarchyWindow,
        openVersionsWindow,
        openClassBrowser,
      });
      return target;
    }

    const modalRuntime = deps.createModalRuntime({
      document: deps.document,
      setStatus: deps.setStatus,
    });

    const {
      requestModal,
      openModal,
      requestTextModal,
      requestSelectModal,
      requestConfirmModal,
    } = modalRuntime;

    objectBrowserAppRuntime = deps.createObjectBrowserAppRuntime({
      createWindow: deps.createWindow,
      roots: deps.roots,
      model: deps.objectBrowserModel,
      buildObjectBrowserWindowHtml: deps.buildObjectBrowserWindowHtml,
      buildInspectorTabsHtml: deps.buildInspectorTabsHtml,
      prepareTitlebar: deps.prepareObjectBrowserTitlebar,
      updateTitlebar: deps.updateObjectBrowserTitlebar,
      populateRootsList: deps.populateObjectBrowserRootsList,
      renderBreadcrumb: deps.renderObjectBrowserBreadcrumb,
      createObjectBrowserWindowRuntime: deps.createObjectBrowserWindowRuntime,
      createObjectBrowserActionsRuntime: deps.createObjectBrowserActionsRuntime,
      api: deps.api,
      apiEvaluate: deps.apiEvaluate,
      apiTransaction: deps.apiTransaction,
      upsertWindowState: deps.upsertWindowState,
      maybeOpenEvalDebugger: deps.maybeOpenEvalDebugger,
      isLeafBasetype: deps.isLeafBasetype,
      makeChip: deps.makeChip,
      bindObjectBrowserCoreActions: deps.bindObjectBrowserCoreActions,
      bindObjectBrowserMethodBrowserActions: deps.bindObjectBrowserMethodBrowserActions,
      loadObjectBrowserObject: deps.loadObjectBrowserObject,
      syncObjectWindowArrows: deps.syncObjectWindowArrows,
      showObjectBrowserInspectorTab: deps.showObjectBrowserInspectorTab,
      renderObjectBrowserInstances: deps.renderObjectBrowserInstances,
      renderObjectBrowserConstants: deps.renderObjectBrowserConstants,
      renderObjectBrowserModules: deps.renderObjectBrowserModules,
      renderControlPanel: deps.renderObjectBrowserControlPanel,
      setStatus: deps.setStatus,
      refreshHaltedThreadsBar: deps.refreshHaltedThreadsBar,
      document: deps.document,
      escHtml: deps.escHtml,
      attachObjectButtonBehavior: deps.attachObjectButtonBehavior,
      createObjectBrowserContentRuntime: deps.createObjectBrowserContentRuntime,
      buildAssociationRenderState: deps.buildAssociationRenderState,
      buildCustomTabRenderState: deps.buildCustomTabRenderState,
      buildObjectCardState: deps.buildObjectCardState,
      buildValueRenderState: deps.buildValueRenderState,
      buildInstancesCollectionState: deps.buildInstancesCollectionState,
      buildConstantsCollectionState: deps.buildConstantsCollectionState,
      buildModulesCollectionState: deps.buildModulesCollectionState,
      appendObjectBrowserValueChips: deps.appendObjectBrowserValueChips,
      renderObjectBrowserAssociationPairs: deps.renderObjectBrowserAssociationPairs,
      makeObjectBrowserValCellFromState: deps.makeObjectBrowserValCellFromState,
      renderObjectBrowserCustomTab: deps.renderObjectBrowserCustomTab,
      renderObjectBrowserCard: deps.renderObjectBrowserCard,
      openMethodBrowser: deps.openObjectBrowserMethodBrowser,
      buildMethodBrowserCategoriesHtml: deps.buildMethodBrowserCategoriesHtml,
      buildMethodBrowserSelectorsHtml: deps.buildMethodBrowserSelectorsHtml,
      openClassBrowser,
      makeTable(headers, rows) {
        return makeTable(deps.document, deps.escHtml, headers, rows);
      },
    });

    classBrowserAppRuntime = deps.createClassBrowserAppRuntime({
      createWindow: deps.createWindow,
      exactWriteSessionChannel: deps.exactWriteSessionChannel,
      api: deps.api,
      apiPost: deps.apiPost,
      apiWithParams: deps.apiWithParams,
      apiTransaction: deps.apiTransaction,
      upsertWindowState: deps.upsertWindowState,
      buildClassBrowserWindowHtml: deps.buildClassBrowserWindowHtml,
      createClassBrowserShellRuntime: deps.createClassBrowserShellRuntime,
      createClassBrowserWindowRuntime: deps.createClassBrowserWindowRuntime,
      window: deps.window,
      document: deps.document,
      windowState: deps.windowState,
      paneOrder: deps.classBrowserPaneOrder,
      initialActivePaneKey: deps.initialActivePaneKey,
      buildClassBrowserActionState: deps.buildClassBrowserActionState,
      applyClassBrowserActionState: deps.applyClassBrowserActionState,
      setStatus: deps.setStatus,
      buildBrowserCacheKey: deps.buildBrowserCacheKey,
      parseStoredPaneWidths: deps.parseStoredPaneWidths,
      clampPaneWidths: deps.clampPaneWidths,
      normalizeFilterText: deps.normalizeClassBrowserFilterText,
      getVisiblePaneItems: deps.getVisiblePaneItems,
      nextPaneKey: deps.nextPaneKey,
      currentPaneItem: deps.currentPaneItem,
      relativePaneItem: deps.relativePaneItem,
      boundaryPaneItem: deps.boundaryPaneItem,
      filterMatchesValue: deps.filterMatchesValue,
      buildClassSourceRequest: deps.buildClassSourceRequest,
      bindClassBrowserToolbarActions: deps.bindClassBrowserToolbarActions,
      requestSelectModal,
      requestTextModal,
      requestConfirmModal,
      requestModal,
      openMethodQueryWindow,
      openHierarchyWindow,
      openVersionsWindow,
      openLinkedObjectWindow: deps.openLinkedObjectWindow,
      focusWin: deps.focusWin,
      hierarchyScopeLabel: deps.hierarchyScopeLabel,
      buildMethodsRequest: deps.buildMethodsRequest,
      normalizeMethodsState: deps.normalizeMethodsState,
      buildCategoriesRequest: deps.buildCategoriesRequest,
      normalizeProtocolsState: deps.normalizeProtocolsState,
      buildClassesRequest: deps.buildClassesRequest,
      normalizeClassesState: deps.normalizeClassesState,
      buildDictionariesRequest: deps.buildDictionariesRequest,
      normalizeDictionariesState: deps.normalizeDictionariesState,
      buildClassLocationRequest: deps.buildClassLocationRequest,
      normalizeClassLocationMatches: deps.normalizeClassLocationMatches,
      buildLocateClassState: deps.buildLocateClassState,
      snapshotBrowserSelection: deps.snapshotBrowserSelection,
      ownerLabel: deps.ownerLabel,
      buildCategoryQueryResults: deps.buildCategoryQueryResults,
      buildSelectorQueryRequest: deps.buildSelectorQueryRequest,
      buildReferenceQueryRequest: deps.buildReferenceQueryRequest,
      buildMethodTextQueryRequest: deps.buildMethodTextQueryRequest,
      buildHierarchyRequest: deps.buildHierarchyRequest,
      buildVersionsRequest: deps.buildVersionsRequest,
      buildFileOutRequest: deps.buildFileOutRequest,
      buildCompileRequest: deps.buildCompileRequest,
      applyCompileResponse: deps.applyCompileResponse,
      buildTransactionActionSpec: deps.buildTransactionActionSpec,
      escHtml: deps.escHtml,
    });

    workspaceAppRuntime = deps.createWorkspaceAppRuntime({
      createWindow: deps.createWindow,
      api: deps.api,
      apiEvaluate: deps.apiEvaluate,
      apiTransaction: deps.apiTransaction,
      upsertWindowState: deps.upsertWindowState,
      createWorkspaceWindowRuntime: deps.createWorkspaceWindowRuntime,
      bindWorkspaceWindowActions: deps.bindWorkspaceWindowActions,
      buildWorkspaceWindowHtml: deps.buildWorkspaceWindowHtml,
      setStatus: deps.setStatus,
      maybeOpenEvalDebugger: deps.maybeOpenEvalDebugger,
      isLeafBasetype: deps.isLeafBasetype,
      makeChip: deps.makeChip,
      openLinkedObjectWindow: deps.openLinkedObjectWindow,
      readRoots: () => deps.readRoots?.() || {},
      readStartupIds: () => deps.readStartupIds?.() || {},
      maglevReportDefs: deps.maglevReportDefs,
      createMaglevReportWindowRuntime: deps.createMaglevReportWindowRuntime,
      createWebBrowserWindowRuntime: deps.createWebBrowserWindowRuntime,
      escHtml: deps.escHtml,
    });

    supportWindowsAppRuntime = deps.createSupportWindowsAppRuntime({
      createWindow: deps.createWindow,
      createConnectionWindowRuntime: deps.createConnectionWindowRuntime,
      createAboutWindowRuntime: deps.createAboutWindowRuntime,
      createWindowLinksWindowRuntime: deps.createWindowLinksWindowRuntime,
      createWindowGroupsWindowRuntime: deps.createWindowGroupsWindowRuntime,
      createStatusLogWindowRuntime: deps.createStatusLogWindowRuntime,
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
      requestModal,
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
      requestConfirmModal,
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
      buildDiagnosticsSnapshotData: deps.buildDiagnosticsSnapshotData,
      buildSupportBundleData: deps.buildSupportBundleData,
      buildAboutWindowView: deps.buildAboutWindowView,
      applyAboutWindowToolbarDisabledState: deps.applyAboutWindowToolbarDisabledState,
      bindAboutWindowToolbarActions: deps.bindAboutWindowToolbarActions,
      getConnectionOverrideHeaders: deps.getConnectionOverrideHeaders,
      getStatusHistory: deps.getStatusHistory,
      getStatusHistorySummary: deps.getStatusHistorySummary,
      buildWindowLayoutSnapshot: deps.buildWindowLayoutSnapshot,
      collectOpenWindowSummaries: deps.collectOpenWindowSummaries,
      collectWindowLinkSummaries: deps.collectWindowLinkSummaries,
      collectWindowGroupSummaries: deps.collectWindowGroupSummaries,
      revealWindow: deps.revealWindow,
      readArrows: () => deps.readArrows?.() || [],
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
      raiseWindowGroupByIds: deps.raiseWindowGroupByIds,
      closeWindowGroupByIds: deps.closeWindowGroupByIds,
      filterWindowGroups: deps.filterWindowGroups,
      isWindowGroupsViewFiltered: deps.isWindowGroupsViewFiltered,
      buildWindowGroupsExportPayload: deps.buildWindowGroupsExportPayload,
      buildWindowGroupsWindowView: deps.buildWindowGroupsWindowView,
      applyWindowGroupsToolbarState: deps.applyWindowGroupsToolbarState,
      bindWindowGroupsToolbarActions: deps.bindWindowGroupsToolbarActions,
      bindWindowGroupListActions: deps.bindWindowGroupListActions,
      normalizeStatusLogLevel: deps.normalizeStatusLogLevel,
      buildStatusLogViewState: deps.buildStatusLogViewState,
      statusEntriesForExportModel: deps.statusEntriesForExportModel,
      buildStatusLogWindowView: deps.buildStatusLogWindowView,
      applyStatusLogToolbarState: deps.applyStatusLogToolbarState,
      bindStatusLogToolbarActions: deps.bindStatusLogToolbarActions,
      bindStatusLogSourceButtons: deps.bindStatusLogSourceButtons,
      resolveStatusEntrySourceWindow: deps.resolveStatusEntrySourceWindow,
      formatStatusTimestampModel: deps.formatStatusTimestampModel,
      clearStatusHistory: deps.clearStatusHistory,
    });

    developerToolsAppRuntime = deps.createDeveloperToolsAppRuntime({
      createWindow: deps.createWindow,
      sourceRelativeWindowPosition: deps.sourceRelativeWindowPosition,
      exactWriteSessionChannel: deps.exactWriteSessionChannel,
      api: deps.api,
      apiPost: deps.apiPost,
      apiWithParams: deps.apiWithParams,
      apiTransaction: deps.apiTransaction,
      windowState: deps.windowState,
      upsertWindowState: deps.upsertWindowState,
      createDebuggerWindowRuntime: deps.createDebuggerWindowRuntime,
      buildDebuggerWindowHtml: deps.buildDebuggerWindowHtml,
      buildDebuggerSummaryState: deps.buildDebuggerSummaryState,
      buildDebuggerFramesListHtml: deps.buildDebuggerFramesListHtml,
      buildDebuggerSourceView: deps.buildDebuggerSourceView,
      buildDebuggerFramesExportText: deps.buildDebuggerFramesExportText,
      buildDebuggerSourceExportText: deps.buildDebuggerSourceExportText,
      buildDebuggerVariableOptionsHtml: deps.buildDebuggerVariableOptionsHtml,
      bindDebuggerTabActions: deps.bindDebuggerTabActions,
      bindDebuggerToolbarActions: deps.bindDebuggerToolbarActions,
      bindDebuggerKeyboardActions: deps.bindDebuggerKeyboardActions,
      bindDebuggerVariableSelector: deps.bindDebuggerVariableSelector,
      bindDebuggerFrameListActions: deps.bindDebuggerFrameListActions,
      applyDebuggerTabState: deps.applyDebuggerTabState,
      applyDebuggerFrameSelection: deps.applyDebuggerFrameSelection,
      applyDebuggerToolbarState: deps.applyDebuggerToolbarState,
      copyTextToClipboard: deps.copyTextToClipboard,
      refreshHaltedThreadsBar: deps.refreshHaltedThreadsBar,
      closeWindow: deps.closeWindow,
      setStatus: deps.setStatus,
      makeChip: deps.makeChip,
      shortLabel: deps.shortLabel,
      isLeafBasetype: deps.isLeafBasetype,
      escHtml: deps.escHtml,
      createSymbolListWindowRuntime: deps.createSymbolListWindowRuntime,
      requestModal,
      requestConfirmModal,
      buildQueryHelperWindowHtml: deps.buildQueryHelperWindowHtml,
      bindQueryHelperToolbarActions: deps.bindQueryHelperToolbarActions,
      applyQueryHelperActionState: deps.applyQueryHelperActionState,
      createMethodQueryWindowRuntime: deps.createMethodQueryWindowRuntime,
      createHierarchyWindowRuntime: deps.createHierarchyWindowRuntime,
      createVersionsWindowRuntime: deps.createVersionsWindowRuntime,
      openClassBrowser,
      openLinkedObjectWindow: deps.openLinkedObjectWindow,
      sanitizeSelectionIndex: deps.sanitizeSelectionIndex,
      resolveClassBrowserRuntime: deps.resolveClassBrowserRuntime,
      openClassBrowserRuntime: deps.openClassBrowserRuntime,
    });

    return {
      modalRuntime,
      requestModal,
      openModal,
      requestTextModal,
      requestSelectModal,
      requestConfirmModal,
      objectBrowserAppRuntime,
      classBrowserAppRuntime,
      workspaceAppRuntime,
      supportWindowsAppRuntime,
      developerToolsAppRuntime,
      openObjectBrowser,
      openExpressionWorkspace,
      openWorkspace,
      openRubyWorkspace,
      openMaglevReportWindow,
      openWebBrowser,
      openConnectionWindow,
      openAboutWindow,
      openWindowLinksWindow,
      openWindowGroupsWindow,
      openStatusLogWindow,
      openDebugger,
      openSymbolList,
      openTextWindow,
      openMethodQueryWindow,
      openHierarchyWindow,
      openVersionsWindow,
      openClassBrowser,
      exposeWindowBindings,
      makeTable(headers, rows) {
        return makeTable(deps.document, deps.escHtml, headers, rows);
      },
    };
  }

  return {
    createAppWindowsRuntime,
  };
});
