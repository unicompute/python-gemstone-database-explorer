const test = require('node:test');
const assert = require('node:assert/strict');

const { createAppShellRuntime } = require('../../static/js/app_shell_runtime.js');

function createDesktopStateStub() {
  return {
    readWindowState() { return {}; },
    parsePixelValue() { return 0; },
    getManagedWindows() { return []; },
    getOrderedManagedWindows() { return []; },
    isRestorableWindowState() { return false; },
    serializeWindowLayoutEntry() { return {}; },
    buildWindowLayoutSnapshot() { return []; },
    hasRecoverableWindows() { return false; },
    getDesktopLayoutRuntime() { return {}; },
    upsertWindowState() {},
    persistHealthyWindowLayout() {},
    persistWindowLayout() {},
    readWindowLayout() { return []; },
    readHealthyWindowLayout() { return []; },
    readRecoverableWindowLayout() { return []; },
    collectOpenWindowSummaries() { return []; },
    collectWindowLinkSummaries() { return []; },
    collectWindowGroupSummaries() { return []; },
    clearWindowLayout() {},
    applyRestoredSourceLinks() {},
    restoreWindowBounds() {},
  };
}

function createDesktopRuntimeStub() {
  return {
    setStatus() {},
    isLeafBasetype() { return false; },
    shortLabel(value) { return String(value || ''); },
    currentStatusSource() { return null; },
    renderTaskbarVersion() {},
    sanitizeSelectionIndex(index) { return index; },
    closeAllWindows() {},
    getFocusedOrTopWindow() { return null; },
    revealWindow() {},
    resolveStatusEntrySourceWindow() { return null; },
    getRelatedWindowIds() { return []; },
    withSuppressedWindowLayoutPersist(fn) { return fn(); },
    afterWindowLayoutMutation(fn) { return fn?.(); },
    afterWindowLayoutPersistOnly(fn) { return fn?.(); },
    raiseWindowGroupByIds() {},
    closeWindowGroupByIds() {},
    cascadeWindows() {},
    tileWindows() {},
    raiseRelatedWindows() {},
    minimiseAllWindows() {},
    closeWindowGroup() {},
    closeOtherWindows() {},
    restoreSavedLayout() { return Promise.resolve(); },
    openDefaultStartupLayout() {},
    resetStartupLayout() {},
    shouldDrawManualArrow() { return false; },
    clampLinkedWindowPosition(value) { return value; },
    positionLinkedWindowOutsideSource() { return { x: 0, y: 0 }; },
    resolveLinkedWindowPosition() { return { x: 0, y: 0 }; },
    openLinkedObjectWindow() {},
    attachObjectButtonBehavior() {},
    createWindow() { return {}; },
    sourceRelativeWindowPosition() { return { x: 0, y: 0 }; },
    focusWin() {},
    closeWindow() {},
    toggleMinimise() {},
    drawArrow() {},
    redrawArrows() {},
    removeArrowsWhere() {},
    removeArrowsFor() {},
    collectObjectLinks() { return []; },
    syncObjectWindowArrows() {},
    makeChip() { return {}; },
  };
}

function createTaskbarRuntimeStub() {
  return {
    persistConnectionOverride() {},
    clearConnectionOverride() {},
    connectionOverrideHeadersFor() { return { 'x-test': '1' }; },
    buildShellForOverride() { return ''; },
    getConnectionOverrideHeaders() { return { 'x-test': '1' }; },
    summarizeConnectionOverride() { return ''; },
    renderTaskbarConnectionOverride() {},
    getTaskbarWindowKinds() { return []; },
    getManagedWindowsByKinds() { return []; },
    getLatestHaltedThreads() { return []; },
    setLatestHaltedThreads() {},
    getHaltedThreadCount() { return 0; },
    getStatusHistory() { return []; },
    getStatusHistorySummary() { return {}; },
    clearStatusHistory() {},
    recordStatusEntry() {},
    renderTaskbarWindowTypeButtons() {},
    renderDockLauncher() {},
    setDockLauncherOpen() {},
    runDockLauncherCommand() {},
    isDockLauncherOpen() { return false; },
    notifyStatusHistoryUpdated() {},
    notifyLiveWindowUpdated() {},
    closeDockContextMenu() {},
    closeDockWindowPreview() {},
    isDockContextMenuOpen() { return false; },
    initialise() {},
  };
}

test('app shell runtime exposes window bindings and delegates taskbar/object-link setup', () => {
  let taskbarInitialised = 0;
  let desktopDropBound = 0;

  const runtime = createAppShellRuntime({
    createAppApiRuntime() {
      return {
        escHtml(value) { return value; },
        api() { return Promise.resolve({}); },
        apiPost() { return Promise.resolve({}); },
        apiEvaluate() { return Promise.resolve({}); },
        apiTransaction() { return Promise.resolve({}); },
        exactWriteSessionChannel(value) { return value; },
        apiWithParams() { return Promise.resolve({}); },
        resolveConnectionPreflight() { return Promise.resolve({}); },
        copyTextToClipboard() { return Promise.resolve(); },
        downloadDataFile() {},
        loadRuntimeVersionInfo() { return Promise.resolve(); },
      };
    },
    createWindowArrowRuntime() {
      return { getArrows() { return []; } };
    },
    createDesktopStatusRuntime() {
      return { loadRuntimeVersionInfo() { return Promise.resolve(); } };
    },
    createWindowShellRuntime() {
      return { setCascadePosition() {} };
    },
    createObjectLinkRuntime() {
      return {
        bindDesktopDrop() {
          desktopDropBound += 1;
        },
      };
    },
    createObjectChipRuntime() {
      return {};
    },
    createStartupLayoutRuntime() {
      return {};
    },
    createDesktopStateRuntime() {
      return createDesktopStateStub();
    },
    createAppDesktopRuntime() {
      return createDesktopRuntimeStub();
    },
    createTaskbarRuntime() {
      const runtime = createTaskbarRuntimeStub();
      runtime.initialise = () => {
        taskbarInitialised += 1;
      };
      return runtime;
    },
    createAppBootstrapRuntime() {
      return {
        setStartupState() {},
        markStartupBootstrapped() {},
        init() { return Promise.resolve(true); },
        refreshHaltedThreadsBar() {},
        maybeOpenEvalDebugger() { return false; },
        startThreadPoller() {},
        startup() { return Promise.resolve(); },
      };
    },
    startupBootstrapController: {},
    document: {
      getElementById() { return null; },
    },
    window: {
      fetch() { return Promise.resolve({}); },
      Headers,
      navigator: {},
      Blob,
      URL,
      setInterval,
      clearInterval,
    },
    desktop: {},
    arrowCanvas: {},
    localStorage: {},
    windowState: new Map(),
    liveWindowRenderers: new Map(),
    windowLayoutStorageKey: 'layout',
    healthyWindowLayoutStorageKey: 'layout-ok',
    statusHistoryStorageKey: 'status',
    restorableWindowKinds: new Set(),
    windowLayoutModel: { sanitizeSelectionIndex(index) { return index; } },
    windowRestoreModel: {},
    createDesktopLayoutRuntime() {},
    desktopShortLabel(value) { return String(value || ''); },
    desktopIsLeafBasetype() { return false; },
    readZTop() { return 100; },
    writeZTop() {},
    readSuppressWindowLayoutPersist() { return false; },
    writeSuppressWindowLayoutPersist() {},
    readRuntimeVersionInfo() { return null; },
    writeRuntimeVersionInfo() {},
    readRoots() { return {}; },
    writeRoots() {},
    readStartupIds() { return {}; },
    writeStartupIds() {},
    readStartupBootstrapped() { return false; },
    writeStartupBootstrapped() {},
    taskbarConnectionOverrideButton: null,
    taskbarWindowTypeButtons: [],
    dockContextMenu: null,
    dockWindowPreview: null,
    dockLauncherBtn: null,
    dockLauncherPanel: null,
    connectionOverrideStorageKey: 'conn',
    readPersistedStatusHistory() { return []; },
    writePersistedStatusHistory() {},
    appendStatusHistoryEntry() {},
    summarizeStatusHistory() { return {}; },
    maglevReportDefs: {},
    sanitizeConnectionOverride(value) { return value; },
    readConnectionOverride() { return null; },
    rememberRecentConnectionOverride() {},
    buildDockContextMenuHtml() { return ''; },
    applyDockContextMenuState() {},
    bindDockContextMenuActions() {},
    buildDockWindowPreviewHtml() { return ''; },
    applyDockWindowPreviewState() {},
    bindDockWindowPreviewActions() {},
    buildDockLauncherView() { return {}; },
    applyDockLauncherState() {},
    bindDockLauncherActions() {},
    readPinnedCommands() { return []; },
    normalizePinnedCommands(value) { return value; },
    writePinnedCommands() {},
    togglePinnedCommand() {},
    buildWindowLinkSummaries() { return []; },
    buildWindowGroupSummaries() { return []; },
    computeRelatedWindowIds() { return []; },
    closeAllManagedWindows() {},
    getDesktopFocusedOrTopWindow() { return null; },
    revealDesktopWindow() {},
    resolveDesktopStatusEntrySourceWindow() { return null; },
    withSuppressedDesktopLayoutPersist(fn) { return fn?.(); },
    afterDesktopWindowLayoutMutation(fn) { return fn?.(); },
    afterDesktopWindowLayoutPersistOnly(fn) { return fn?.(); },
    raiseManagedWindowGroupByIds() {},
    closeManagedWindowGroupByIds() {},
    cascadeManagedWindows() {},
    tileManagedWindows() {},
    raiseManagedRelatedWindows() {},
    minimiseManagedWindows() {},
    closeManagedFocusedWindowGroup() {},
    openObjectBrowser() {},
    openClassBrowser() {},
    openWorkspace() {},
    openRubyWorkspace() {},
    openMaglevReportWindow() {},
    openWebBrowser() {},
    openConnectionWindow() {},
    openAboutWindow() {},
    openStatusLogWindow() {},
    openWindowGroupsWindow() {},
    openWindowLinksWindow() {},
    openSymbolList() {},
    openDebugger() {},
    openMethodQueryWindow() {},
    openHierarchyWindow() {},
    openVersionsWindow() {},
    rememberLastSuccessfulConnectionOverride() {},
  });

  const exposed = {};
  runtime.exposeWindowBindings(exposed);
  runtime.bindDesktopDrop();
  runtime.initialiseTaskbar();
  runtime.boot({});

  assert.equal(typeof exposed.setStatus, 'function');
  assert.equal(typeof exposed.currentStatusSource, 'function');
  assert.equal(taskbarInitialised, 2);
  assert.equal(desktopDropBound, 2);
});
