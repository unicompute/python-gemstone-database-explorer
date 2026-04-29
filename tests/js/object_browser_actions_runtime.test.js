const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/object_browser_actions_runtime.js');

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(name) { values.add(name); },
    remove(name) { values.delete(name); },
    has(name) { return values.has(name); },
  };
}

test('object browser actions sync window state from current object state', () => {
  let lastState = null;
  const actions = runtime.createObjectBrowserActionsRuntime({
    id: 'obj-1',
    sessionChannel: 'object:obj-1',
    compactMode: true,
    initialOop: 11,
    initialLabel: 'Root',
    getState() {
      return {
        currentOop: 12,
        currentObjData: { oop: 13, inspection: 'anObject' },
        history: [{ label: 'Thing', oop: 13 }],
        currentItab: 'code',
        currentObjectQuery: { depth: 2 },
      };
    },
    upsertWindowState(id, state) {
      lastState = { id, state };
    },
  });

  actions.syncWindowState();
  assert.equal(lastState.id, 'obj-1');
  assert.equal(lastState.state.objectOop, 13);
  assert.equal(lastState.state.objectLabel, 'Thing');
  assert.equal(lastState.state.currentTab, 'code');
  assert.deepEqual(lastState.state.objectQuery, { depth: 2 });
});

test('object browser actions activate code tab and open method browser when class changes', () => {
  const tabs = [
    { dataset: { itab: 'instvars' }, classList: createClassList(['active']) },
    { dataset: { itab: 'code' }, classList: createClassList() },
  ];
  const methodBrowser = { classList: createClassList(['hidden']) };
  const openButton = { disabled: true, title: '' };
  const state = {
    currentObjData: { oop: 20, classObject: { oop: 99, inspection: 'Object' } },
    currentItab: 'instvars',
    mbClassOop: null,
    history: [{ label: 'Thing', oop: 20 }],
    currentObjectQuery: {},
  };
  let shown = 0;
  let opened = null;

  const actions = runtime.createObjectBrowserActionsRuntime({
    id: 'obj-2',
    compactMode: false,
    initialLabel: 'Thing',
    body: {
      querySelector(selector) {
        if (selector === '#obj-2-itabs [data-itab="code"]') return tabs[1];
        if (selector === '#obj-2-mb') return methodBrowser;
        if (selector === '#obj-2-mb-open-browser') return openButton;
        return null;
      },
      querySelectorAll(selector) {
        assert.equal(selector, '.inspector-tab');
        return tabs;
      },
    },
    getState() { return state; },
    setState(patch) { Object.assign(state, patch); },
    getCodeTarget() { return { oop: 99, label: 'Object' }; },
    currentCodeBrowserTarget() { return { className: 'Object', method: 'printString' }; },
    buildMethodBrowserButtonState() { return { disabled: false, title: 'Open Object >> printString' }; },
    openMethodBrowser(oop, label) { opened = { oop, label }; },
    showInspectorTab() { shown += 1; },
    upsertWindowState() {},
  });

  const activated = actions.activateItab('code');
  assert.equal(activated, true);
  assert.equal(state.currentItab, 'code');
  assert.equal(methodBrowser.classList.has('hidden'), false);
  assert.deepEqual(opened, { oop: 99, label: 'Object' });
  assert.equal(openButton.disabled, false);
  assert.equal(shown, 1);
});

test('object browser actions reload current object and clear cache', async () => {
  const state = {
    currentOop: 44,
    currentObjData: { inspection: 'Reloaded' },
    history: [{ label: 'Reloaded', oop: 44 }],
    currentObjectQuery: { range: 1 },
  };
  let cleared = null;
  let loaded = null;

  const actions = runtime.createObjectBrowserActionsRuntime({
    getState() { return state; },
    clearInspectorTabCache(oop) { cleared = oop; },
    loadObject(oop, label, options) { loaded = { oop, label, options }; return Promise.resolve(); },
  });

  await actions.reloadCurrentObject();
  assert.equal(cleared, 44);
  assert.deepEqual(loaded, {
    oop: 44,
    label: 'Reloaded',
    options: { query: { range: 1 }, preserveCurrentTab: true, keepInstPage: true },
  });
});
