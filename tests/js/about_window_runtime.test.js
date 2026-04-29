const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/about_window_runtime.js');

test('about window runtime mounts and renders current diagnostics snapshot without auto refresh', () => {
  const liveWindowRenderers = new Map();
  const grid = {innerHTML: ''};
  const states = [];
  let boundHandlers = null;

  runtime.createAboutWindowRuntime({
    id: 'about-1',
    win: {offsetLeft: 10, offsetTop: 20},
    options: {autoRefresh: false},
    grid,
    buttons: {},
    liveWindowRenderers,
    upsertWindowState(id, state) {
      states.push({id, state});
    },
    buildDiagnosticsSnapshotData() {
      return {browser: {}, server: {}};
    },
    buildSupportBundleData() {
      return {};
    },
    buildAboutWindowView() {
      return {gridHtml: '<div>about-grid</div>'};
    },
    applyAboutWindowToolbarDisabledState() {},
    bindAboutWindowToolbarActions(_buttons, handlers) {
      boundHandlers = handlers;
    },
    readConnectionOverride() {
      return null;
    },
    getConnectionOverrideHeaders() {
      return {};
    },
    readLastSuccessfulConnectionOverride() {
      return null;
    },
    readFavoriteConnectionProfiles() {
      return [];
    },
    readDefaultFavoriteConnectionProfile() {
      return null;
    },
    readRecentConnectionOverrides() {
      return [];
    },
    getStatusHistory() {
      return [];
    },
    getStatusHistorySummary() {
      return {ok: 0, error: 0, closedSources: 0};
    },
    buildWindowLayoutSnapshot() {
      return [];
    },
    collectOpenWindowSummaries() {
      return [];
    },
    collectWindowLinkSummaries() {
      return [];
    },
    collectWindowGroupSummaries() {
      return [];
    },
    sanitizeConnectionOverride(value) {
      return value || null;
    },
    summarizeConnectionOverride() {
      return '—';
    },
    copyTextToClipboard() {
      return Promise.resolve();
    },
    downloadDataFile() {},
    setStatus() {},
    openStatusLogWindow() {
      return null;
    },
    openConnectionWindow() {
      return null;
    },
    openWindowGroupsWindow() {
      return null;
    },
    openWindowLinksWindow() {
      return null;
    },
    api() {
      throw new Error('unexpected diagnostics refresh');
    },
    readRuntimeVersionInfo() {
      return {app: 'GemStone Explorer'};
    },
    setRuntimeVersionInfo() {},
    renderTaskbarVersion() {},
    revealWindow() {},
    escHtml(value) {
      return String(value ?? '');
    },
  }).mount();

  assert.equal(grid.innerHTML, '<div>about-grid</div>');
  assert.equal(states.at(-1).id, 'about-1');
  assert.equal(states.at(-1).state.kind, 'about');
  assert.equal(typeof liveWindowRenderers.get('about-1'), 'function');
  assert.equal(typeof boundHandlers.refreshAboutInfo, 'function');
});

test('about window runtime refreshes diagnostics and updates runtime version info', async () => {
  const grid = {innerHTML: ''};
  const toolbarDisabled = [];
  const runtimeInfo = {app: 'Old'};
  let renderTaskbarVersionArg = null;
  let refreshHandler = null;

  runtime.createAboutWindowRuntime({
    id: 'about-2',
    win: {offsetLeft: 0, offsetTop: 0},
    options: {autoRefresh: false},
    grid,
    buttons: {},
    liveWindowRenderers: new Map(),
    upsertWindowState() {},
    buildDiagnosticsSnapshotData(server) {
      return {browser: {}, server};
    },
    buildSupportBundleData() {
      return {};
    },
    buildAboutWindowView(options) {
      return {gridHtml: `<div>${options.data.app || 'empty'}</div>`};
    },
    applyAboutWindowToolbarDisabledState(_buttons, disabled) {
      toolbarDisabled.push(disabled);
    },
    bindAboutWindowToolbarActions(_buttons, handlers) {
      refreshHandler = handlers.refreshAboutInfo;
    },
    readConnectionOverride() {
      return null;
    },
    getConnectionOverrideHeaders() {
      return {};
    },
    readLastSuccessfulConnectionOverride() {
      return null;
    },
    readFavoriteConnectionProfiles() {
      return [];
    },
    readDefaultFavoriteConnectionProfile() {
      return null;
    },
    readRecentConnectionOverrides() {
      return [];
    },
    getStatusHistory() {
      return [];
    },
    getStatusHistorySummary() {
      return {ok: 0, error: 0, closedSources: 0};
    },
    buildWindowLayoutSnapshot() {
      return [];
    },
    collectOpenWindowSummaries() {
      return [];
    },
    collectWindowLinkSummaries() {
      return [];
    },
    collectWindowGroupSummaries() {
      return [];
    },
    sanitizeConnectionOverride(value) {
      return value || null;
    },
    summarizeConnectionOverride() {
      return '—';
    },
    copyTextToClipboard() {
      return Promise.resolve();
    },
    downloadDataFile() {},
    setStatus() {},
    openStatusLogWindow() {
      return null;
    },
    openConnectionWindow() {
      return null;
    },
    openWindowGroupsWindow() {
      return null;
    },
    openWindowLinksWindow() {
      return null;
    },
    api() {
      return Promise.resolve({success: true, app: 'New'});
    },
    readRuntimeVersionInfo() {
      return runtimeInfo;
    },
    setRuntimeVersionInfo(value) {
      Object.assign(runtimeInfo, value);
    },
    renderTaskbarVersion(value) {
      renderTaskbarVersionArg = value;
    },
    revealWindow() {},
    escHtml(value) {
      return String(value ?? '');
    },
  }).mount();

  await refreshHandler();

  assert.deepEqual(toolbarDisabled, [true, false]);
  assert.equal(grid.innerHTML, '<div>New</div>');
  assert.equal(renderTaskbarVersionArg.app, 'New');
  assert.equal(runtimeInfo.app, 'New');
});
