const test = require('node:test');
const assert = require('node:assert/strict');

const {createConnectionWindowChecksRuntime} = require('../../static/js/connection_window_checks_runtime.js');

test('connection window checks runtime manages saved check entries', () => {
  let checkResults = [];
  let syncCount = 0;
  const runtime = createConnectionWindowChecksRuntime({
    id: 'connection-1',
    getLatestPreflight() {
      return {success: true};
    },
    setLatestPreflight() {},
    getLatestStartupError() {
      return '';
    },
    getConnectionCheckResults() {
      return checkResults;
    },
    setConnectionCheckResults(value) {
      checkResults = value;
    },
    getConnectionCheckViewMode() {
      return 'all';
    },
    setConnectionCheckViewMode() {},
    syncConnectionWindowState() {
      syncCount += 1;
    },
    renderConnection() {},
    sanitizeConnectionCheckResult(item) {
      return item || null;
    },
    connectionOverrideKey(value) {
      return JSON.stringify(value || null);
    },
    describeConnectionCheckFreshness() {
      return {stale: false};
    },
    getVisibleConnectionCheckEntriesModel({connectionCheckResults}) {
      return connectionCheckResults.map(item => ({item}));
    },
    isFilteredConnectionChecksViewModel() {
      return false;
    },
    buildConnectionCheckBundle(entries) {
      return {checks: entries};
    },
    setStatus() {},
    notifyLiveWindowUpdated() {},
    requestModal() {
      return Promise.resolve(null);
    },
    mergeConnectionCheckBundle(existing, imported) {
      return {
        checks: existing.concat(imported.checks || []),
        importedCheckCount: (imported.checks || []).length,
        checkCount: existing.length + (imported.checks || []).length,
      };
    },
  });

  const first = runtime.rememberConnectionCheckResult({
    label: 'favorite target alpha',
    target: {stone: 'alpha'},
    success: true,
  });
  runtime.rememberConnectionCheckResult({
    label: 'favorite target beta',
    target: {stone: 'beta'},
    success: false,
  });
  runtime.rememberConnectionCheckResult({
    label: 'favorite target alpha',
    target: {stone: 'alpha'},
    success: false,
  });

  assert.equal(first.success, true);
  assert.equal(checkResults.length, 2);
  assert.equal(checkResults[0].target.stone, 'alpha');
  assert.equal(checkResults[0].success, false);
  assert.ok(syncCount >= 3);

  runtime.removeConnectionCheckResult({
    label: 'favorite target beta',
    target: {stone: 'beta'},
  });
  assert.deepEqual(checkResults.map(item => item.target.stone), ['alpha']);

  runtime.clearConnectionCheckResults();
  assert.deepEqual(checkResults, []);
});

test('connection window checks runtime rechecks stale entries and refreshes preflight', async () => {
  let latestPreflight = {connection: {configured: {stone: 'alpha'}}};
  let renderedPreflight = null;
  let checkResults = [{
    label: 'favorite target alpha',
    target: {stone: 'alpha'},
    success: false,
  }];

  const runtime = createConnectionWindowChecksRuntime({
    id: 'connection-1',
    getLatestPreflight() {
      return latestPreflight;
    },
    setLatestPreflight(value) {
      latestPreflight = value;
    },
    getLatestStartupError() {
      return '';
    },
    getConnectionCheckResults() {
      return checkResults;
    },
    setConnectionCheckResults(value) {
      checkResults = value;
    },
    getConnectionCheckViewMode() {
      return 'all';
    },
    setConnectionCheckViewMode() {},
    syncConnectionWindowState() {},
    renderConnection(preflight) {
      renderedPreflight = preflight;
    },
    sanitizeConnectionOverride(target) {
      return target || null;
    },
    sanitizeConnectionCheckResult(item) {
      return item || null;
    },
    connectionOverrideKey(value) {
      return JSON.stringify(value || null);
    },
    api() {
      return Promise.resolve({
        success: true,
        connection: {configured: {effectiveTarget: 'stone=alpha', stoneSource: 'request-override'}},
      });
    },
    captureConnectionCheckResult(item) {
      return {...item, success: item.status === 'ok'};
    },
    resolveConnectionPreflight() {
      return Promise.resolve({connection: {configured: {stone: 'refreshed'}}});
    },
    describeConnectionCheckFreshness() {
      return {stale: true};
    },
    getVisibleConnectionCheckEntriesModel({connectionCheckResults}) {
      return connectionCheckResults.map(item => ({item}));
    },
    isFilteredConnectionChecksViewModel() {
      return false;
    },
    buildConnectionCheckBundle(entries) {
      return {checks: entries};
    },
    setStatus() {},
    notifyLiveWindowUpdated() {},
    copyTextToClipboard() {
      return Promise.resolve();
    },
    downloadDataFile() {},
    requestModal() {
      return Promise.resolve(null);
    },
    mergeConnectionCheckBundle() {
      return {checks: [], importedCheckCount: 0, checkCount: 0};
    },
  });

  const selected = await runtime.recheckConnectionTargetResults({staleOnly: true});

  assert.equal(selected.length, 1);
  assert.equal(checkResults[0].success, true);
  assert.equal(latestPreflight.connection.configured.stone, 'refreshed');
  assert.equal(renderedPreflight.connection.configured.stone, 'refreshed');
});
