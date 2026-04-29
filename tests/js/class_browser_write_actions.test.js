const test = require('node:test');
const assert = require('node:assert/strict');

const writeActions = require('../../static/js/class_browser_write_actions.js');

test('class browser write actions start new method mode', () => {
  let state = {
    currentClass: 'Behavior',
    currentProtocol: 'accessing',
    currentMeta: true,
    currentMethod: 'old',
    currentSourceMode: 'method',
  };
  let sourceNote = '';
  let browserStatus = '';
  let activeRowArgs = null;
  let syncCount = 0;
  let focusCount = 0;

  const workflow = writeActions.createClassBrowserWriteActions({
    getState() {
      return state;
    },
    setState(patch) {
      state = {...state, ...patch};
    },
    els: {
      methods: {},
      source: {
        value: 'old source',
        focus() { focusCount += 1; },
      },
    },
    syncSourceMode() {
      syncCount += 1;
    },
    setActiveRow(container, value) {
      activeRowArgs = [container, value];
    },
    setSourceNote(value) {
      sourceNote = value;
    },
    setBrowserStatus(value) {
      browserStatus = value;
    },
  });

  workflow.startNewMethod();

  assert.equal(state.currentMethod, null);
  assert.equal(state.currentSourceMode, 'newMethod');
  assert.equal(syncCount, 1);
  assert.deepEqual(activeRowArgs, [{}, null]);
  assert.equal(sourceNote, 'Behavior class >> (new method)');
  assert.equal(browserStatus, 'Enter a new method for accessing');
  assert.equal(focusCount, 1);
});

test('class browser write actions add dictionary refreshes browser state', async () => {
  let state = {
    currentDict: null,
    currentClass: null,
    currentProtocol: '-- all --',
    currentMethod: null,
    currentSourceMode: 'classDefinition',
  };
  const ensured = [];
  let loaded = 0;
  let finalized = '';

  const workflow = writeActions.createClassBrowserWriteActions({
    getState() {
      return state;
    },
    setState(patch) {
      state = {...state, ...patch};
    },
    requestTextModal() {
      return Promise.resolve('TmpUI');
    },
    setBrowserStatus() {},
    browserApiPost(path, payload) {
      assert.equal(path, '/class-browser/add-dictionary');
      assert.deepEqual(payload, {name: 'TmpUI'});
      return Promise.resolve({success: true, dictionary: 'TmpUI', result: 'Added TmpUI'});
    },
    clearBrowserCache() {},
    ensureFilterShowsValue(filter, value) {
      ensured.push([filter, value]);
    },
    loadDictionaries() {
      loaded += 1;
      return Promise.resolve();
    },
    finalizeBrowserWrite(message) {
      finalized = message;
      return Promise.resolve(true);
    },
    setStatus() {},
    els: {
      dictFilter: {id: 'dict-filter'},
    },
  });

  await workflow.addDictionary();

  assert.equal(state.currentDict, 'TmpUI');
  assert.equal(state.currentProtocol, '-- all --');
  assert.deepEqual(ensured, [[{id: 'dict-filter'}, 'TmpUI']]);
  assert.equal(loaded, 1);
  assert.equal(finalized, 'Added TmpUI');
});
