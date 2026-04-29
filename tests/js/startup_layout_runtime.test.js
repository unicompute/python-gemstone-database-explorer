const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/startup_layout_runtime.js');

test('startup layout runtime opens persistent root and system browsers and resets cascade', () => {
  const opened = [];
  const startup = runtime.createStartupLayoutRuntime({
    window: { innerWidth: 1440, innerHeight: 900 },
    getStartupIds() {
      return { persistentRootId: 10, systemId: 20 };
    },
    getRoots() {
      return {};
    },
    openObjectBrowser(...args) {
      opened.push(args);
    },
    setCascadePosition(x, y) {
      opened.push(['cascade', x, y]);
    },
  });

  startup.openDefaultStartupLayout();
  assert.equal(opened.length, 3);
  assert.equal(opened[0][0], 10);
  assert.equal(opened[0][1], 'Persistent Root');
  assert.equal(opened[1][0], 20);
  assert.equal(opened[1][1], 'System');
  assert.deepEqual(opened[2], ['cascade', 80, 80]);
});

test('startup layout runtime reset closes windows and persists layout around default startup reopen', () => {
  const events = [];
  const startup = runtime.createStartupLayoutRuntime({
    window: { innerWidth: 1200, innerHeight: 800 },
    getStartupIds() {
      return {};
    },
    getRoots() {
      return {};
    },
    clearWindowLayout() {
      events.push('clear');
    },
    setSuppressWindowLayoutPersist(value) {
      events.push(`suppress:${value}`);
    },
    closeAllWindows() {
      events.push('close-all');
    },
    openObjectBrowser() {
      events.push('open-default');
    },
    persistWindowLayout() {
      events.push('persist');
    },
    setCascadePosition() {},
  });

  startup.resetStartupLayout();
  assert.deepEqual(events, ['clear', 'suppress:true', 'close-all', 'open-default', 'suppress:false', 'persist']);
});
