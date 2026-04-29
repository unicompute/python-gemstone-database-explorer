const test = require('node:test');
const assert = require('node:assert/strict');

const { createAppBootstrapRuntime } = require('../../static/js/app_bootstrap_runtime.js');

test('app bootstrap runtime writes startup state and refreshes launcher when open', () => {
  let startupIds = null;
  let roots = null;
  let renders = 0;
  const runtime = createAppBootstrapRuntime({
    startupBootstrapController: {
      initialiseRuntimeConnection() {
        return Promise.resolve({connected: true});
      },
      runStartupSequence() {
        return Promise.resolve();
      },
    },
    writeStartupIds(value) {
      startupIds = value;
    },
    writeRoots(value) {
      roots = value;
    },
    isDockLauncherOpen() {
      return true;
    },
    renderDockLauncher() {
      renders += 1;
    },
    setInterval() {
      return 1;
    },
    clearInterval() {},
  });

  runtime.setStartupState({startupIds: {defaultWorkspaceId: 77}, roots: {Globals: 88}});
  assert.deepEqual(startupIds, {defaultWorkspaceId: 77});
  assert.deepEqual(roots, {Globals: 88});
  assert.equal(renders, 1);
});

test('app bootstrap runtime opens eval debuggers on the write channel of the source window', async () => {
  let opened = null;
  const runtime = createAppBootstrapRuntime({
    startupBootstrapController: {
      initialiseRuntimeConnection() {
        return Promise.resolve({connected: true});
      },
      runStartupSequence() {
        return Promise.resolve();
      },
    },
    document: {
      getElementById() {
        return {innerHTML: '', appendChild() {}};
      },
      createElement() {
        return {
          style: {},
          textContent: '',
          appendChild() {},
          addEventListener() {},
        };
      },
    },
    api() {
      return Promise.resolve({success: true, threads: []});
    },
    exactWriteSessionChannel(channel) {
      return channel.endsWith('-w') ? channel : `${channel}-w`;
    },
    readWindowState(id) {
      return id === 'workspace-1' ? {sessionChannel: 'workspace-1-r'} : {};
    },
    openDebugger(thread, _threadName, options) {
      opened = {thread, options};
    },
    setLatestHaltedThreads() {},
    setInterval() {
      return 1;
    },
    clearInterval() {},
  });

  const result = runtime.maybeOpenEvalDebugger({debugThreadOop: 123, inspection: 'Boom'}, '1/0', 'workspace-1');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(result, true);
  assert.equal(opened.thread.oop, 123);
  assert.equal(opened.options.sessionChannel, 'workspace-1-r-w');
  assert.equal(opened.options.sourceWindowId, 'workspace-1');
});

test('app bootstrap runtime startup delegates to the shared startup controller', async () => {
  let called = false;
  const runtime = createAppBootstrapRuntime({
    startupBootstrapController: {
      initialiseRuntimeConnection() {
        return Promise.resolve({connected: true});
      },
      runStartupSequence(config) {
        called = true;
        assert.equal(typeof config.fetchIds, 'function');
        assert.equal(typeof config.restoreSavedLayout, 'function');
        assert.equal(typeof config.startThreadPoller, 'function');
        return Promise.resolve();
      },
    },
    api() {
      return Promise.resolve({});
    },
    readConnectionOverride() {
      return null;
    },
    rememberLastSuccessfulConnectionOverride() {},
    setStatus() {},
    loadRuntimeVersionInfo() {
      return Promise.resolve();
    },
    resolveConnectionPreflight() {
      return Promise.resolve({});
    },
    openConnectionWindow() {},
    getManagedWindows() {
      return [];
    },
    getWindowState() {
      return {};
    },
    restoreSavedLayout() {
      return Promise.resolve();
    },
    openDefaultStartupLayout() {},
    persistWindowLayout() {},
    writeStartupIds() {},
    writeRoots() {},
    writeStartupBootstrapped() {},
    isDockLauncherOpen() {
      return false;
    },
    renderDockLauncher() {},
    document: {
      getElementById() {
        return {innerHTML: '', appendChild() {}};
      },
      createElement() {
        return {
          style: {},
          textContent: '',
          appendChild() {},
          addEventListener() {},
        };
      },
    },
    setLatestHaltedThreads() {},
    setInterval() {
      return 1;
    },
    clearInterval() {},
  });

  await runtime.startup();
  assert.equal(called, true);
});
