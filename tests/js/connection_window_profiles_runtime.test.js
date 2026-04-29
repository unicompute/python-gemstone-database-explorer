const test = require('node:test');
const assert = require('node:assert/strict');

const {createConnectionWindowProfilesRuntime} = require('../../static/js/connection_window_profiles_runtime.js');

test('connection window profiles runtime applies targets through startup recovery or refresh', async () => {
  const calls = [];
  let latestPreflight = {connection: {configured: {stone: 'alpha'}}};
  let latestStartupError = 'startup failed';

  const runtime = createConnectionWindowProfilesRuntime({
    id: 'connection-1',
    getLatestPreflight() {
      return latestPreflight;
    },
    getLatestStartupError() {
      return latestStartupError;
    },
    syncConnectionWindowState() {},
    renderConnection() {},
    refreshConnection() {
      calls.push('refresh');
      return Promise.resolve();
    },
    retryStartup() {
      calls.push('retry');
      latestStartupError = '';
      return Promise.resolve();
    },
    buildConnectionFixShell(preflight) {
      return preflight?.connection?.configured?.stone ? `export GS_STONE=${preflight.connection.configured.stone}` : '';
    },
    startupBootstrapped() {
      return latestStartupError === '';
    },
    persistConnectionOverride(override) {
      calls.push(`persist:${override.stone}`);
      return override;
    },
    summarizeConnectionOverride(override) {
      return `stone=${override.stone}`;
    },
    setStatus() {},
    buildShellForOverride(override) {
      return `export GS_STONE=${override.stone}`;
    },
    copyTextToClipboard() {
      return Promise.resolve();
    },
    suggestedConnectionOverrideFromPayloadModel(payload) {
      return payload?.suggested || null;
    },
    buildConfiguredConnectionOverrideSeedModel() {
      return {current: null, placeholders: {}};
    },
    readConnectionOverride() {
      return null;
    },
    sanitizeConnectionOverride(override) {
      return override?.stone ? override : null;
    },
    localStoneOverridesFromPayloadModel() {
      return [];
    },
    currentConnectionTargetOverrideModel(payload) {
      return payload?.current || null;
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
    requestModal() {
      return Promise.resolve(null);
    },
    notifyLiveWindowUpdated() {},
    updateFavoriteConnectionProfile() {
      return null;
    },
    buildConnectionProfileBundle() {
      return {};
    },
    downloadDataFile() {},
    clearConnectionOverride() {},
    readRecentConnectionOverrides() {
      return [];
    },
    requestConfirmModal() {
      return Promise.resolve(false);
    },
    clearFavoriteConnectionProfiles() {},
    clearRecentConnectionOverrides() {},
    readLastSuccessfulConnectionOverride() {
      return null;
    },
    clearLastSuccessfulConnectionOverride() {},
    replaceConnectionProfileBundle() {
      return {importedFavoriteCount: 0, importedRecentCount: 0, defaultFavoriteProfile: null};
    },
    importConnectionProfileBundle() {
      return {importedFavoriteCount: 0, importedRecentCount: 0, defaultFavoriteProfile: null};
    },
    connectionOverrideKey(value) {
      return JSON.stringify(value || null);
    },
  });

  assert.equal(runtime.buildFixShell(), 'export GS_STONE=alpha');
  await runtime.applyConnectionTargetAction({stone: 'beta'}, 'applied target');
  assert.deepEqual(calls, ['persist:beta', 'retry']);

  latestPreflight = {connection: {configured: {stone: 'gamma'}}, suggested: {stone: 'gamma'}};
  await runtime.applySuggestedOverride();
  assert.deepEqual(calls, ['persist:beta', 'retry', 'persist:gamma', 'refresh']);
});

test('connection window profiles runtime saves favorite targets and rerenders', async () => {
  let rendered = 0;
  let savedFavorite = null;
  const runtime = createConnectionWindowProfilesRuntime({
    id: 'connection-1',
    getLatestPreflight() {
      return {connection: {configured: {stone: 'alpha'}}};
    },
    getLatestStartupError() {
      return '';
    },
    syncConnectionWindowState() {},
    renderConnection() {
      rendered += 1;
    },
    refreshConnection() {
      return Promise.resolve();
    },
    retryStartup() {
      return Promise.resolve();
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
    summarizeConnectionOverride(override) {
      return `stone=${override.stone}`;
    },
    setStatus() {},
    buildShellForOverride() {
      return '';
    },
    copyTextToClipboard() {
      return Promise.resolve();
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
    sanitizeConnectionOverride(override) {
      return override?.stone ? override : null;
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
    defaultConnectionOverrideName(override) {
      return override?.stone || 'Saved Target';
    },
    addFavoriteConnectionProfile(target, name, note) {
      savedFavorite = {target, name, note};
      return savedFavorite;
    },
    requestModal() {
      return Promise.resolve({
        'connection-1-favorite-name': 'Alpha',
        'connection-1-favorite-note': 'local stone',
      });
    },
    notifyLiveWindowUpdated() {},
    updateFavoriteConnectionProfile() {
      return null;
    },
    buildConnectionProfileBundle() {
      return {};
    },
    downloadDataFile() {},
    clearConnectionOverride() {},
    readRecentConnectionOverrides() {
      return [];
    },
    requestConfirmModal() {
      return Promise.resolve(false);
    },
    clearFavoriteConnectionProfiles() {},
    clearRecentConnectionOverrides() {},
    readLastSuccessfulConnectionOverride() {
      return null;
    },
    clearLastSuccessfulConnectionOverride() {},
    replaceConnectionProfileBundle() {
      return {importedFavoriteCount: 0, importedRecentCount: 0, defaultFavoriteProfile: null};
    },
    importConnectionProfileBundle() {
      return {importedFavoriteCount: 0, importedRecentCount: 0, defaultFavoriteProfile: null};
    },
    connectionOverrideKey(value) {
      return JSON.stringify(value || null);
    },
  });

  const saved = await runtime.saveConnectionTargetAsFavorite({stone: 'alpha'});

  assert.equal(saved.name, 'Alpha');
  assert.equal(savedFavorite.note, 'local stone');
  assert.equal(rendered, 1);
});
