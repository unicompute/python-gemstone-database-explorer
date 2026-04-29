const test = require('node:test');
const assert = require('node:assert/strict');

const { createSupportWindowsAppRuntime } = require('../../static/js/support_windows_app_runtime.js');

function createBody() {
  const nodes = new Map();
  return {
    innerHTML: '',
    style: {},
    querySelector(selector) {
      if (!nodes.has(selector)) {
        nodes.set(selector, {
          id: selector.replace('#', ''),
          value: '',
          textContent: '',
          checked: false,
        });
      }
      return nodes.get(selector);
    },
  };
}

test('support windows app runtime composes the connection window shell and mounts the connection runtime', () => {
  const body = createBody();
  let capturedConfig = null;
  const runtime = createSupportWindowsAppRuntime({
    createWindow() {
      return { win: { id: 'win-1' }, body, id: 'conn-1' };
    },
    createConnectionWindowRuntime(config) {
      capturedConfig = config;
      return { mount() {} };
    },
    createAboutWindowRuntime() {
      return { mount() {} };
    },
    createWindowLinksWindowRuntime() {
      return { mount() {} };
    },
    createWindowGroupsWindowRuntime() {
      return { mount() {} };
    },
    createStatusLogWindowRuntime() {
      return { mount() {} };
    },
    buildConnectionPayloadModel() {},
    buildConnectionFixShell() {},
    startupBootstrapped() { return false; },
    persistConnectionOverride() {},
    setStatus() {},
    summarizeConnectionOverride() { return ''; },
    buildShellForOverride() { return ''; },
    copyTextToClipboard() {},
    sanitizeConnectionCheckResult(value) { return value; },
    connectionOverrideKey() { return ''; },
    sanitizeConnectionOverride(value) { return value; },
    api() { return Promise.resolve({}); },
    captureConnectionCheckResult(value) { return value; },
    resolveConnectionPreflight() { return Promise.resolve({}); },
    describeConnectionCheckFreshness() { return { stale: false }; },
    getVisibleConnectionCheckEntriesModel() { return []; },
    isFilteredConnectionChecksViewModel() { return false; },
    buildConnectionCheckBundle() { return {}; },
    downloadDataFile() {},
    requestModal() {},
    mergeConnectionCheckBundle(bundle) { return bundle; },
    suggestedConnectionOverrideFromPayloadModel() { return null; },
    buildConfiguredConnectionOverrideSeedModel() { return null; },
    readConnectionOverride() { return null; },
    localStoneOverridesFromPayloadModel() { return []; },
    currentConnectionTargetOverrideModel() { return null; },
    readFavoriteConnectionProfiles() { return []; },
    favoriteProfileForOverrideModel() { return null; },
    defaultConnectionOverrideName() { return 'default'; },
    addFavoriteConnectionProfile() {},
    notifyLiveWindowUpdated() {},
    updateFavoriteConnectionProfile() {},
    buildConnectionRenderStateModel() { return {}; },
    readDefaultFavoriteConnectionProfile() { return null; },
    readLastSuccessfulConnectionOverride() { return null; },
    readRecentConnectionOverrides() { return []; },
    escHtml(value) { return String(value); },
    shortLabel(value) { return String(value); },
    isDefaultFavoriteConnectionOverride() { return false; },
    buildConnectionWindowView() { return {}; },
    bindConnectionWindowCardActions() {},
    normalizeConnectionCheckViewMode(value) { return value || 'all'; },
    moveFavoriteConnectionOverride() {},
    setDefaultFavoriteConnectionOverride() {},
    clearDefaultFavoriteConnectionOverride() {},
    removeFavoriteConnectionOverride() {},
    clearLastSuccessfulConnectionOverride() {},
    removeRecentConnectionOverride() {},
    requestConfirmModal() {},
    clearConnectionOverride() {},
    clearFavoriteConnectionProfiles() {},
    clearRecentConnectionOverrides() {},
    bindConnectionWindowToolbarActions() {},
    liveWindowRenderers: new Map(),
    upsertWindowState() {},
    buildConnectionProfileBundle() { return {}; },
    importConnectionProfileBundle() {},
    replaceConnectionProfileBundle() {},
    init() { return Promise.resolve(true); },
    retryStartupRecovery() { return Promise.resolve(true); },
    getManagedWindows() { return []; },
    windowState: new Map(),
    restoreSavedLayout() { return Promise.resolve(); },
    openDefaultStartupLayout() {},
    startThreadPoller() {},
    markStartupBootstrapped() {},
    persistWindowLayout() {},
    closeWindow() {},
    applyConnectionWindowToolbarState() {},
    rememberLastSuccessfulConnectionOverride() {},
    readRuntimeVersionInfo() { return null; },
    setRuntimeVersionInfo() {},
    renderTaskbarVersion() {},
    buildDiagnosticsSnapshotData() { return {}; },
    buildSupportBundleData() { return {}; },
    buildAboutWindowView() { return {}; },
    applyAboutWindowToolbarDisabledState() {},
    bindAboutWindowToolbarActions() {},
    getConnectionOverrideHeaders() { return {}; },
    getStatusHistory() { return []; },
    getStatusHistorySummary() { return {}; },
    buildWindowLayoutSnapshot() { return {}; },
    collectOpenWindowSummaries() { return []; },
    collectWindowLinkSummaries() { return []; },
    collectWindowGroupSummaries() { return []; },
    revealWindow() {},
    readArrows() { return []; },
    scopeWindowLinks() { return []; },
    filterWindowLinks() { return []; },
    isWindowLinksViewFiltered() { return false; },
    buildWindowLinksExportPayload() { return {}; },
    buildWindowLinksWindowView() { return {}; },
    applyWindowLinksToolbarState() {},
    bindWindowLinksToolbarActions() {},
    bindWindowLinkListActions() {},
    getRelatedWindowIds() { return []; },
    sanitizeSelectionIndex() { return 0; },
    raiseWindowGroupByIds() {},
    closeWindowGroupByIds() {},
    filterWindowGroups() { return []; },
    isWindowGroupsViewFiltered() { return false; },
    buildWindowGroupsExportPayload() { return {}; },
    buildWindowGroupsWindowView() { return {}; },
    applyWindowGroupsToolbarState() {},
    bindWindowGroupsToolbarActions() {},
    bindWindowGroupListActions() {},
    normalizeStatusLogLevel(value) { return value; },
    buildStatusLogViewState() { return {}; },
    statusEntriesForExportModel() { return []; },
    buildStatusLogWindowView() { return {}; },
    applyStatusLogToolbarState() {},
    bindStatusLogToolbarActions() {},
    bindStatusLogSourceButtons() {},
    resolveStatusEntrySourceWindow() { return null; },
    formatStatusTimestampModel() { return ''; },
    clearStatusHistory() {},
  });

  runtime.openConnectionWindow();
  assert.equal(capturedConfig.id, 'conn-1');
  assert.ok(capturedConfig.grid);
  assert.ok(capturedConfig.cards);
  assert.ok(capturedConfig.buttons.retryBtn);
  assert.ok(capturedConfig.buttons.downloadBtn);
});
