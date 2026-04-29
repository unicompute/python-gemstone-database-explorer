const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/connection_window_runtime.js');

function baseRenderState() {
  return {
    payload: {},
    override: null,
    suggestedOverride: null,
    currentTargetOverride: null,
    lastSuccessfulOverride: null,
    currentTargetIsFavorite: false,
    recentOverrides: [],
    favoriteProfiles: [],
    defaultFavoriteProfile: null,
    localStoneOverrides: [],
    probeEntries: [],
    probe: {},
    suggestions: [],
    connectionCheckEntries: [],
    allConnectionCheckEntries: [],
    connectionCheckViewMode: 'all',
    isFilteredConnectionChecksView: false,
    showLastSuccessfulOverride: false,
    okChecks: 0,
    errorChecks: 0,
    staleChecks: 0,
    legacyChecks: 0,
  };
}

test('connection window runtime mounts, renders, and skips refresh when preflight is provided', () => {
  let boundToolbarHandlers = null;
  let appliedToolbarState = null;
  let syncedState = null;
  let refreshCalls = 0;
  const liveWindowRenderers = new Map();
  const grid = {innerHTML: ''};
  const cards = {innerHTML: ''};

  const connectionRuntime = runtime.createConnectionWindowRuntime({
    id: 'connection-1',
    win: {},
    options: {
      preflight: {success: true, connection: {configured: {}, probe: {}}},
      autoRefresh: false,
      sourceWindowId: 'workspace-1',
    },
    buttons: {},
    grid,
    cards,
    buildConnectionPayloadModel() {
      return {};
    },
    buildConnectionFixShell() {
      return '';
    },
    startupBootstrapped() {
      return true;
    },
    persistConnectionOverride(override) {
      return override;
    },
    setStatus() {},
    summarizeConnectionOverride() {
      return 'stone=gs64stone';
    },
    buildShellForOverride() {
      return 'export GS_STONE=gs64stone';
    },
    copyTextToClipboard() {
      return Promise.resolve();
    },
    sanitizeConnectionCheckResult(item) {
      return item || null;
    },
    connectionOverrideKey(value) {
      return JSON.stringify(value || null);
    },
    sanitizeConnectionOverride(override) {
      return override || null;
    },
    api() {
      refreshCalls += 1;
      return Promise.resolve({success: true});
    },
    captureConnectionCheckResult(result) {
      return result;
    },
    resolveConnectionPreflight() {
      refreshCalls += 1;
      return Promise.resolve({success: true});
    },
    describeConnectionCheckFreshness() {
      return {label: 'Current', status: 'current', stale: false, legacy: false, reason: ''};
    },
    getVisibleConnectionCheckEntriesModel() {
      return [];
    },
    isFilteredConnectionChecksViewModel() {
      return false;
    },
    buildConnectionCheckBundle(entries) {
      return {checks: entries};
    },
    downloadDataFile() {},
    requestModal() {
      return Promise.resolve(null);
    },
    mergeConnectionCheckBundle() {
      return {checks: [], importedCheckCount: 0, checkCount: 0};
    },
    suggestedConnectionOverrideFromPayloadModel() {
      return null;
    },
    buildConfiguredConnectionOverrideSeedModel() {
      return {current: null, placeholders: {}};
    },
    readConnectionOverride() {
      return null;
    },
    localStoneOverridesFromPayloadModel() {
      return [];
    },
    currentConnectionTargetOverrideModel() {
      return null;
    },
    readFavoriteConnectionProfiles() {
      return [];
    },
    favoriteProfileForOverrideModel() {
      return null;
    },
    defaultConnectionOverrideName() {
      return 'Saved Target';
    },
    addFavoriteConnectionProfile(target, name, note) {
      return {target, name, note};
    },
    notifyLiveWindowUpdated() {},
    updateFavoriteConnectionProfile() {
      return null;
    },
    buildConnectionRenderStateModel() {
      return baseRenderState();
    },
    readDefaultFavoriteConnectionProfile() {
      return null;
    },
    readLastSuccessfulConnectionOverride() {
      return null;
    },
    readRecentConnectionOverrides() {
      return [];
    },
    escHtml(value) {
      return String(value ?? '');
    },
    shortLabel(value) {
      return String(value ?? '');
    },
    isDefaultFavoriteConnectionOverride() {
      return false;
    },
    buildConnectionWindowView() {
      return {
        gridHtml: '<div>grid</div>',
        cardsHtml: '<div>cards</div>',
        toolbarState: {
          retryVisible: false,
          applyOverrideVisible: false,
          saveSuggestedFavoriteVisible: false,
          clearOverrideVisible: false,
          favoriteTargetVisible: false,
          favoriteTargetLabel: 'Save Target',
          clearFavoritesVisible: false,
          clearRecentsVisible: false,
          clearLastWorkingVisible: false,
          copyFixDisabled: true,
        },
      };
    },
    bindConnectionWindowCardActions() {},
    normalizeConnectionCheckViewMode(mode) {
      return String(mode || 'all');
    },
    moveFavoriteConnectionOverride() {
      return null;
    },
    setDefaultFavoriteConnectionOverride() {},
    clearDefaultFavoriteConnectionOverride() {},
    removeFavoriteConnectionOverride() {},
    clearLastSuccessfulConnectionOverride() {},
    removeRecentConnectionOverride() {},
    requestConfirmModal() {
      return Promise.resolve(false);
    },
    clearConnectionOverride() {},
    clearFavoriteConnectionProfiles() {},
    clearRecentConnectionOverrides() {},
    bindConnectionWindowToolbarActions(_buttons, handlers) {
      boundToolbarHandlers = handlers;
    },
    liveWindowRenderers,
    upsertWindowState(id, state) {
      syncedState = {id, state};
    },
    buildConnectionProfileBundle() {
      return {};
    },
    importConnectionProfileBundle() {
      return {importedFavoriteCount: 0, importedRecentCount: 0, defaultFavoriteProfile: null};
    },
    replaceConnectionProfileBundle() {
      return {importedFavoriteCount: 0, importedRecentCount: 0, defaultFavoriteProfile: null};
    },
    init() {
      return Promise.resolve(true);
    },
    retryStartupRecovery() {
      return Promise.resolve();
    },
    getManagedWindows() {
      return [];
    },
    windowState: new Map(),
    restoreSavedLayout() {
      return Promise.resolve(false);
    },
    openDefaultStartupLayout() {},
    startThreadPoller() {},
    markStartupBootstrapped() {},
    persistWindowLayout() {},
    closeWindow() {},
    applyConnectionWindowToolbarState(_buttons, state) {
      appliedToolbarState = state;
    },
    rememberLastSuccessfulConnectionOverride() {},
    readRuntimeVersionInfo() {
      return null;
    },
    setRuntimeVersionInfo() {},
    renderTaskbarVersion() {},
  });

  connectionRuntime.mount();

  assert.equal(grid.innerHTML, '<div>grid</div>');
  assert.equal(cards.innerHTML, '<div>cards</div>');
  assert.equal(refreshCalls, 0);
  assert.equal(syncedState.id, 'connection-1');
  assert.equal(syncedState.state.kind, 'connection');
  assert.equal(syncedState.state.sourceWindowId, 'workspace-1');
  assert.equal(typeof boundToolbarHandlers.refreshConnection, 'function');
  assert.equal(typeof liveWindowRenderers.get('connection-1'), 'function');
  assert.equal(appliedToolbarState.favoriteTargetLabel, 'Save Target');
});

test('connection window runtime ignores stale refresh responses after a newer refresh starts', async () => {
  let boundToolbarHandlers = null;
  let resolveFirst = null;
  let resolveSecond = null;
  const grid = {innerHTML: ''};
  const cards = {innerHTML: ''};
  let preflightCallCount = 0;

  const connectionRuntime = runtime.createConnectionWindowRuntime({
    id: 'connection-race',
    win: {},
    options: {
      autoRefresh: false,
    },
    buttons: {},
    grid,
    cards,
    buildConnectionPayloadModel() {
      return {};
    },
    buildConnectionFixShell() {
      return '';
    },
    startupBootstrapped() {
      return true;
    },
    persistConnectionOverride(override) {
      return override;
    },
    setStatus() {},
    summarizeConnectionOverride() {
      return 'stone=gs64stone';
    },
    buildShellForOverride() {
      return '';
    },
    copyTextToClipboard() {
      return Promise.resolve();
    },
    sanitizeConnectionCheckResult(item) {
      return item || null;
    },
    connectionOverrideKey(value) {
      return JSON.stringify(value || null);
    },
    sanitizeConnectionOverride(override) {
      return override || null;
    },
    api() {
      return Promise.resolve({success: true});
    },
    captureConnectionCheckResult(result) {
      return result;
    },
    resolveConnectionPreflight() {
      preflightCallCount += 1;
      if (preflightCallCount === 1) {
        return new Promise(resolve => {
          resolveFirst = resolve;
        });
      }
      return new Promise(resolve => {
        resolveSecond = resolve;
      });
    },
    describeConnectionCheckFreshness() {
      return {label: 'Current', status: 'current', stale: false, legacy: false, reason: ''};
    },
    getVisibleConnectionCheckEntriesModel() {
      return [];
    },
    isFilteredConnectionChecksViewModel() {
      return false;
    },
    buildConnectionCheckBundle(entries) {
      return {checks: entries};
    },
    downloadDataFile() {},
    requestModal() {
      return Promise.resolve(null);
    },
    mergeConnectionCheckBundle() {
      return {checks: [], importedCheckCount: 0, checkCount: 0};
    },
    suggestedConnectionOverrideFromPayloadModel() {
      return null;
    },
    buildConfiguredConnectionOverrideSeedModel() {
      return {current: null, placeholders: {}};
    },
    readConnectionOverride() {
      return null;
    },
    localStoneOverridesFromPayloadModel() {
      return [];
    },
    currentConnectionTargetOverrideModel() {
      return null;
    },
    readFavoriteConnectionProfiles() {
      return [];
    },
    favoriteProfileForOverrideModel() {
      return null;
    },
    defaultConnectionOverrideName() {
      return 'Saved Target';
    },
    addFavoriteConnectionProfile(target, name, note) {
      return {target, name, note};
    },
    notifyLiveWindowUpdated() {},
    updateFavoriteConnectionProfile() {
      return null;
    },
    buildConnectionRenderStateModel({preflight}) {
      return {
        ...baseRenderState(),
        payload: preflight || {},
      };
    },
    readDefaultFavoriteConnectionProfile() {
      return null;
    },
    readLastSuccessfulConnectionOverride() {
      return null;
    },
    readRecentConnectionOverrides() {
      return [];
    },
    escHtml(value) {
      return String(value ?? '');
    },
    shortLabel(value) {
      return String(value ?? '');
    },
    isDefaultFavoriteConnectionOverride() {
      return false;
    },
    buildConnectionWindowView({renderState}) {
      return {
        gridHtml: `<div>${renderState.payload?.connection?.configured?.stoneSource || ''}</div>`,
        cardsHtml: '<div>cards</div>',
        toolbarState: {
          retryVisible: false,
          applyOverrideVisible: false,
          saveSuggestedFavoriteVisible: false,
          clearOverrideVisible: false,
          favoriteTargetVisible: false,
          favoriteTargetLabel: 'Save Target',
          clearFavoritesVisible: false,
          clearRecentsVisible: false,
          clearLastWorkingVisible: false,
          copyFixDisabled: true,
        },
      };
    },
    bindConnectionWindowCardActions() {},
    normalizeConnectionCheckViewMode(mode) {
      return String(mode || 'all');
    },
    moveFavoriteConnectionOverride() {
      return null;
    },
    setDefaultFavoriteConnectionOverride() {},
    clearDefaultFavoriteConnectionOverride() {},
    removeFavoriteConnectionOverride() {},
    clearLastSuccessfulConnectionOverride() {},
    removeRecentConnectionOverride() {},
    requestConfirmModal() {
      return Promise.resolve(false);
    },
    clearConnectionOverride() {},
    clearFavoriteConnectionProfiles() {},
    clearRecentConnectionOverrides() {},
    bindConnectionWindowToolbarActions(_buttons, handlers) {
      boundToolbarHandlers = handlers;
    },
    liveWindowRenderers: new Map(),
    upsertWindowState() {},
    buildConnectionProfileBundle() {
      return {};
    },
    importConnectionProfileBundle() {
      return {importedFavoriteCount: 0, importedRecentCount: 0, defaultFavoriteProfile: null};
    },
    replaceConnectionProfileBundle() {
      return {importedFavoriteCount: 0, importedRecentCount: 0, defaultFavoriteProfile: null};
    },
    init() {
      return Promise.resolve(true);
    },
    retryStartupRecovery() {
      return Promise.resolve();
    },
    getManagedWindows() {
      return [];
    },
    windowState: new Map(),
    restoreSavedLayout() {
      return Promise.resolve(false);
    },
    openDefaultStartupLayout() {},
    startThreadPoller() {},
    markStartupBootstrapped() {},
    persistWindowLayout() {},
    closeWindow() {},
    applyConnectionWindowToolbarState() {},
    rememberLastSuccessfulConnectionOverride() {},
    readRuntimeVersionInfo() {
      return null;
    },
    setRuntimeVersionInfo() {},
    renderTaskbarVersion() {},
  });

  connectionRuntime.mount();
  const firstRefresh = boundToolbarHandlers.refreshConnection();
  const secondRefresh = boundToolbarHandlers.refreshConnection();

  resolveSecond({
    success: true,
    connection: {
      configured: {
        stoneSource: 'request-override',
      },
    },
  });
  await secondRefresh;
  assert.equal(grid.innerHTML, '<div>request-override</div>');

  resolveFirst({
    success: true,
    connection: {
      configured: {
        stoneSource: 'default',
      },
    },
  });
  await firstRefresh;
  assert.equal(grid.innerHTML, '<div>request-override</div>');
});
