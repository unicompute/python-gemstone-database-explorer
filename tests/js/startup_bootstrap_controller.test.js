const test = require('node:test');
const assert = require('node:assert/strict');

const startupBootstrapController = require('../../static/js/startup_bootstrap_controller.js');

test('initialiseRuntimeConnection stores startup ids and roots on success', async () => {
  const calls = {
    remembered: null,
    startupState: null,
    statuses: [],
    versionLoads: 0,
  };

  const result = await startupBootstrapController.initialiseRuntimeConnection({
    fetchIds: async () => ({
      persistentRootId: 10,
      gemStoneSystemId: 20,
      globalsId: 30,
    }),
    readConnectionOverride: () => ({stone: 'seaside'}),
    rememberLastSuccessfulConnectionOverride(override) {
      calls.remembered = override;
    },
    setStartupState(state) {
      calls.startupState = state;
    },
    setStatus(ok, message) {
      calls.statuses.push([ok, message]);
    },
    loadRuntimeVersionInfo: async () => {
      calls.versionLoads += 1;
    },
  });

  assert.equal(result.connected, true);
  assert.equal(result.versionLoaded, true);
  assert.deepEqual(calls.remembered, {stone: 'seaside'});
  assert.deepEqual(calls.startupState, {
    startupIds: {
      persistentRootId: 10,
      systemId: 20,
      globalsId: 30,
    },
    roots: {
      UserGlobals: 10,
      Globals: 30,
      System: 20,
    },
  });
  assert.deepEqual(calls.statuses, [[true, 'connected']]);
  assert.equal(calls.versionLoads, 1);
});

test('initialiseRuntimeConnection reports connection failure through onFailure without opening a window', async () => {
  const error = new Error('login failed');
  const seen = {
    opened: 0,
    failures: [],
    statuses: [],
  };

  const result = await startupBootstrapController.initialiseRuntimeConnection({
    fetchIds: async () => {
      throw error;
    },
    setStatus(ok, message) {
      seen.statuses.push([ok, message]);
    },
    resolveConnectionPreflight: async () => ({success: false, exception: 'login failed'}),
    openConnectionWindow() {
      seen.opened += 1;
    },
  }, {
    onFailure(preflight, nextError) {
      seen.failures.push([preflight, nextError]);
    },
  });

  assert.equal(result.connected, false);
  assert.equal(seen.opened, 0);
  assert.deepEqual(seen.statuses, [[false, 'failed: login failed']]);
  assert.equal(seen.failures.length, 1);
  assert.deepEqual(seen.failures[0][0], {success: false, exception: 'login failed'});
  assert.equal(seen.failures[0][1], error);
});

test('initialiseRuntimeConnection keeps startup connected when version load fails and opens connection window', async () => {
  const opened = [];

  const result = await startupBootstrapController.initialiseRuntimeConnection({
    fetchIds: async () => ({
      persistentRootId: 10,
      gemStoneSystemId: 20,
      globalsId: 30,
    }),
    readConnectionOverride: () => null,
    rememberLastSuccessfulConnectionOverride() {},
    setStartupState() {},
    setStatus() {},
    loadRuntimeVersionInfo: async () => {
      throw new Error('version offline');
    },
    resolveConnectionPreflight: async () => ({success: false, exception: 'version offline'}),
    openConnectionWindow(payload) {
      opened.push(payload);
    },
  });

  assert.equal(result.connected, true);
  assert.equal(result.versionLoaded, false);
  assert.equal(opened.length, 1);
  assert.deepEqual(opened[0], {
    preflight: {success: false, exception: 'version offline'},
    startupError: 'version offline',
    autoRefresh: false,
  });
});

test('runStartupSequence restores or opens default layout and marks startup bootstrapped', async () => {
  const seen = {
    restoreArgs: null,
    defaultLayout: 0,
    threadPoller: 0,
    bootstrapped: [],
    persisted: 0,
  };

  const result = await startupBootstrapController.runStartupSequence({
    fetchIds: async () => ({
      persistentRootId: 10,
      gemStoneSystemId: 20,
      globalsId: 30,
    }),
    readConnectionOverride: () => null,
    rememberLastSuccessfulConnectionOverride() {},
    setStartupState() {},
    setStatus() {},
    loadRuntimeVersionInfo: async () => {},
    getManagedWindows: () => [],
    getWindowState: () => ({}),
    restoreSavedLayout: async options => {
      seen.restoreArgs = options;
      return false;
    },
    openDefaultStartupLayout() {
      seen.defaultLayout += 1;
    },
    startThreadPoller() {
      seen.threadPoller += 1;
    },
    markStartupBootstrapped(value) {
      seen.bootstrapped.push(value);
    },
    persistWindowLayout() {
      seen.persisted += 1;
    },
  });

  assert.equal(result, true);
  assert.deepEqual(seen.restoreArgs, {excludeKinds: ['class-browser', 'debugger']});
  assert.equal(seen.defaultLayout, 1);
  assert.equal(seen.threadPoller, 1);
  assert.deepEqual(seen.bootstrapped, [true]);
  assert.equal(seen.persisted, 1);
});

test('retryStartupRecovery skips recoverable restore when non-connection windows are already open', async () => {
  const seen = {
    restoreCalls: 0,
    defaultLayout: 0,
    threadPoller: 0,
    bootstrapped: [],
    persisted: 0,
    statuses: [],
  };

  const result = await startupBootstrapController.retryStartupRecovery({
    getManagedWindows: () => [{id: 'workspace-1'}],
    getWindowState: () => ({kind: 'workspace'}),
    restoreSavedLayout: async () => {
      seen.restoreCalls += 1;
      return true;
    },
    openDefaultStartupLayout() {
      seen.defaultLayout += 1;
    },
    startThreadPoller() {
      seen.threadPoller += 1;
    },
    markStartupBootstrapped(value) {
      seen.bootstrapped.push(value);
    },
    persistWindowLayout() {
      seen.persisted += 1;
    },
    setStatus(ok, message) {
      seen.statuses.push([ok, message]);
    },
  });

  assert.deepEqual(result, {restored: false, skippedRestore: true});
  assert.equal(seen.restoreCalls, 0);
  assert.equal(seen.defaultLayout, 0);
  assert.equal(seen.threadPoller, 1);
  assert.deepEqual(seen.bootstrapped, [true]);
  assert.equal(seen.persisted, 1);
  assert.deepEqual(seen.statuses, [[true, 'startup recovered']]);
});
