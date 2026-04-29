const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/class_browser_toolbar_runtime.js');

test('class browser toolbar runtime find class loads and reports success', async () => {
  const statuses = [];
  const handlers = runtime.createToolbarHandlers({
    getCurrentClass() {
      return 'Object';
    },
    async requestTextModal() {
      return 'Behavior';
    },
    async locateAndSelectClass(className) {
      assert.equal(className, 'Behavior');
      return true;
    },
    setBrowserStatus(message, level) {
      statuses.push({message, level});
    },
    setStatus() {},
  });

  await handlers.onFindClass();
  assert.deepEqual(statuses, [{message: 'Selected Behavior', level: 'ok'}]);
});

test('class browser toolbar runtime auto commit and meta handlers delegate state changes', async () => {
  const statuses = [];
  let storedAutoCommit = null;
  let metaToggled = 0;
  let ensuredClass = null;
  let protocolLoads = 0;
  const handlers = runtime.createToolbarHandlers({
    readAutoCommitChecked() {
      return true;
    },
    storeAutoCommitEnabled(value) {
      storedAutoCommit = value;
    },
    setBrowserStatus(message, level) {
      statuses.push({message, level});
    },
    applyMetaToggle() {
      metaToggled += 1;
    },
    getCurrentClass() {
      return 'Behavior';
    },
    ensureClassFilter(className) {
      ensuredClass = className;
    },
    async loadProtocols() {
      protocolLoads += 1;
    },
  });

  handlers.onAutoCommitChange();
  await handlers.onMetaChange();

  assert.equal(storedAutoCommit, true);
  assert.equal(metaToggled, 1);
  assert.equal(ensuredClass, 'Behavior');
  assert.equal(protocolLoads, 1);
  assert.deepEqual(statuses[0], {message: 'Auto Commit enabled', level: 'ok'});
});
