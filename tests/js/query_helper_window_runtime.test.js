const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/query_helper_window_runtime.js');

function makeButton() {
  return {
    disabled: true,
    addEventListener() {},
    click() {
      this.clicked = true;
    },
  };
}

test('method query runtime syncs state and updates source window when opening an item', () => {
  const states = [];
  const openCalls = [];
  let listConfig = null;
  const windowState = new Map();
  const filterInput = {
    value: '',
    addEventListener(type, handler) {
      this.listeners = this.listeners || {};
      this.listeners[type] = handler;
    },
  };

  const methodRuntime = runtime.createMethodQueryWindowRuntime({
    id: 'method-query-1',
    title: 'Method Query',
    results: ['Globals Object>>size'],
    options: {
      sourceWindowId: 'browser-1',
      filterText: 'size',
      loadLabel: 'Load Into Browser',
    },
    listEl: {
      querySelectorAll() {
        return [];
      },
    },
    filterInput,
    titleEl: {textContent: ''},
    previewEl: {value: ''},
    buttons: {
      loadBtn: makeButton(),
      openBtn: makeButton(),
      inspectBtn: makeButton(),
    },
    windowState,
    openClassBrowser(options) {
      openCalls.push(options);
      return {id: 'browser-2'};
    },
    apiWithParams() {
      throw new Error('unexpected source fetch');
    },
    apiPost() {
      throw new Error('unexpected inspect fetch');
    },
    parseMethodReference() {
      return {
        dictionary: 'Globals',
        className: 'Object',
        selector: 'size',
        meta: false,
        label: 'Object >> size',
      };
    },
    openLinkedObjectWindow() {},
    setStatus() {},
    setupQueryWindowList(config) {
      listConfig = config;
    },
    upsertWindowState(id, state) {
      states.push({id, state});
    },
    sanitizeSelectionIndex(index) {
      return Number(index) || 0;
    },
    bindQueryHelperToolbarActions() {},
    applyQueryHelperActionState() {},
    resolveClassBrowserRuntime() {
      throw new Error('unexpected browser resolve');
    },
  });

  methodRuntime.mount();
  assert.equal(filterInput.value, 'size');
  assert.equal(states.at(-1).id, 'method-query-1');
  assert.equal(states.at(-1).state.kind, 'method-query');
  assert.equal(states.at(-1).state.sourceWindowId, 'browser-1');

  listConfig.onOpenItem('Globals Object>>size');

  assert.deepEqual(openCalls, [{
    dictionary: 'Globals',
    className: 'Object',
    method: 'size',
    meta: false,
    sourceWindowId: 'method-query-1',
  }]);
  assert.equal(states.at(-1).state.sourceWindowId, 'browser-2');
});

test('versions runtime compares selected version against current browser source', async () => {
  const states = [];
  const buttons = {
    loadBtn: makeButton(),
    openBtn: makeButton(),
    compareBtn: makeButton(),
    inspectBtn: makeButton(),
  };
  let listConfig = null;
  let toolbarHandlers = null;
  const titleEl = {textContent: ''};
  const previewEl = {value: ''};

  const versionsRuntime = runtime.createVersionsWindowRuntime({
    id: 'versions-1',
    title: 'Versions',
    versions: [{label: 'Version 1', source: 'old source', methodOop: 17}],
    options: {
      versionContext: {
        dictionary: 'Globals',
        className: 'Object',
        method: 'size',
        meta: false,
      },
    },
    listEl: {
      querySelectorAll() {
        return [];
      },
    },
    filterInput: {
      value: '',
      addEventListener() {},
    },
    titleEl,
    previewEl,
    buttons,
    windowState: new Map([['browser-1', {sessionChannel: 'browser-1-r'}]]),
    openClassBrowser() {
      return {id: 'browser-2'};
    },
    setStatus() {},
    setupQueryWindowList(config) {
      listConfig = config;
    },
    upsertWindowState(id, state) {
      states.push({id, state});
    },
    sanitizeSelectionIndex(index) {
      return Number(index) || 0;
    },
    bindQueryHelperToolbarActions(_buttons, handlers) {
      toolbarHandlers = handlers;
    },
    applyQueryHelperActionState(_buttons, state) {
      buttons.loadBtn.disabled = !!state.loadDisabled;
      buttons.openBtn.disabled = !!state.openDisabled;
      buttons.compareBtn.disabled = !!state.compareDisabled;
      buttons.inspectBtn.disabled = !!state.inspectDisabled;
    },
    openLinkedObjectWindow() {},
    buildUnifiedLineDiff(left, right, labels) {
      return `${labels.leftLabel} vs ${labels.rightLabel}\n${left}\n${right}`;
    },
    openClassBrowserRuntime() {
      throw new Error('unexpected browser open');
    },
    async resolveClassBrowserRuntime(sourceWindowId, browserOptions) {
      assert.equal(sourceWindowId, null);
      assert.deepEqual(browserOptions, {
        dictionary: 'Globals',
        className: 'Object',
        method: 'size',
        meta: false,
        sourceWindowId: 'versions-1',
      });
      return {
        sourceWindowId: 'browser-1',
        runtime: {
          snapshot() {
            return {
              source: 'current source',
              sourceNote: 'Current browser',
            };
          },
        },
      };
    },
  });

  versionsRuntime.mount();
  listConfig.onSelectItem({label: 'Version 1', source: 'old source', methodOop: 17}, {
    classList: {
      add() {},
    },
  });
  await toolbarHandlers.onCompare();

  assert.equal(titleEl.textContent, 'Version 1 vs current');
  assert.equal(previewEl.value, 'Version 1 vs Current browser\nold source\ncurrent source');
  assert.equal(states.at(-1).state.sourceWindowId, 'browser-1');
});
