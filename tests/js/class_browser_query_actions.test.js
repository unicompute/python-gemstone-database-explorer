const test = require('node:test');
const assert = require('node:assert/strict');

const queryActions = require('../../static/js/class_browser_query_actions.js');

test('class browser query actions find dictionary reloads selection', async () => {
  let state = {
    currentDict: 'Globals',
    currentClass: 'Object',
    currentProtocol: 'accessing',
    currentMethod: 'printString',
    currentSourceMode: 'method',
  };
  const ensured = [];
  let loaded = 0;
  let focusedPane = '';
  let status = '';

  const workflow = queryActions.createClassBrowserQueryActions({
    getState() {
      return state;
    },
    setState(patch) {
      state = {...state, ...patch};
    },
    requestTextModal() {
      return Promise.resolve('UserGlobals');
    },
    fetchBrowserCached(name, keyParts, loader) {
      assert.equal(name, 'dictionaries');
      assert.deepEqual(keyParts, {});
      return loader();
    },
    browserApi() {
      return Promise.resolve({success: true, dictionaries: ['Globals', 'UserGlobals']});
    },
    ensureFilterShowsValue(filter, value) {
      ensured.push([filter, value]);
    },
    loadDictionaries() {
      loaded += 1;
      return Promise.resolve();
    },
    focusPaneList(key) {
      focusedPane = key;
    },
    setBrowserStatus(value) {
      status = value;
    },
    setStatus() {},
    els: {
      dictFilter: {id: 'dict-filter'},
    },
  });

  await workflow.findDictionary();

  assert.equal(state.currentDict, 'UserGlobals');
  assert.equal(state.currentClass, null);
  assert.equal(state.currentMethod, null);
  assert.deepEqual(ensured, [[{id: 'dict-filter'}, 'UserGlobals']]);
  assert.equal(loaded, 1);
  assert.equal(focusedPane, 'dicts');
  assert.equal(status, 'Selected UserGlobals');
});
