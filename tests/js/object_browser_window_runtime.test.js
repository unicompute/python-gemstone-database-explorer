const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/object_browser_window_runtime.js');

test('object browser window runtime loads object and activates requested tab', async () => {
  let appliedStart = null;
  let loadedObject = null;
  let clearedPreferred = false;
  let showedInspector = false;
  let beforeLoad = 0;
  let afterLoad = 0;

  await runtime.loadObject(123, 'Object', {preserveCurrentTab: true}, {
    buildObjectLoadStartState(oop, query, options) {
      assert.equal(oop, 123);
      assert.equal(query, null);
      assert.equal(options.keepInstPage, false);
      return {currentOop: oop};
    },
    applyLoadStartState(state) {
      appliedStart = state;
    },
    onBeforeLoad() {
      beforeLoad += 1;
    },
    objectApi(url) {
      assert.equal(url, '/object/index/123?depth=2');
      return Promise.resolve({success: true, result: {oop: 123, inspection: 'anObject'}});
    },
    buildObjectIndexUrl() {
      return '/object/index/123?depth=2';
    },
    setLoadedObject(obj) {
      loadedObject = obj;
    },
    onAfterLoad() {
      afterLoad += 1;
    },
    chooseRequestedInspectorTab() {
      return 'code';
    },
    activateItab(tabName) {
      assert.equal(tabName, 'code');
      return true;
    },
    clearPreferredInitialTab() {
      clearedPreferred = true;
    },
    async showInspectorTab() {
      showedInspector = true;
    },
  });

  assert.deepEqual(appliedStart, {currentOop: 123});
  assert.deepEqual(loadedObject, {oop: 123, inspection: 'anObject'});
  assert.equal(beforeLoad, 1);
  assert.equal(afterLoad, 1);
  assert.equal(clearedPreferred, true);
  assert.equal(showedInspector, false);
});

test('object browser window runtime shows inspector card for instvars tab', async () => {
  const ibody = {
    className: '',
    style: {},
    innerHTML: 'old',
    appended: null,
    appendChild(node) {
      this.appended = node;
    },
  };
  const card = {kind: 'card'};

  await runtime.showInspectorTab({
    ibody,
    getState() {
      return {
        currentObjData: {oop: 55},
        currentItab: 'instvars',
        currentOop: 55,
        history: [],
        mbCurrentSelector: null,
      };
    },
    nextInspectorRenderToken() {
      return 1;
    },
    renderCard() {
      return card;
    },
    getCustomTab() {
      return null;
    },
  });

  assert.equal(ibody.className, 'inspector-body');
  assert.equal(ibody.style.overflow, 'auto');
  assert.equal(ibody.innerHTML, '');
  assert.equal(ibody.appended, card);
});

test('object browser window runtime mounts shell and reuses method-browser cache', async () => {
  const rootsNode = {};
  const tabsNode = { innerHTML: '', style: {} };
  const mbNode = {
    toggled: null,
    classList: {
      toggle(name, hidden) {
        assert.equal(name, 'hidden');
        mbNode.toggled = hidden;
      },
    },
  };
  const body = {
    style: {},
    innerHTML: '',
    querySelector(selector) {
      if (selector === '#obj-roots') return rootsNode;
      if (selector === '#obj-itabs') return tabsNode;
      if (selector === '#obj-mb') return mbNode;
      return null;
    },
  };
  const selectedRoots = [];
  const state = {
    currentObjData: { customTabs: [] },
    currentItab: 'old',
    history: [{ label: 'root', oop: 1 }],
    mbCurrentSelector: 'foo',
    mbClassName: 'Object',
    currentObjectQuery: { flag: 'ok' },
  };
  const patches = [];
  let loaderCalls = 0;

  const browserRuntime = runtime.createObjectBrowserWindowRuntime({
    id: 'obj',
    body,
    compactMode: false,
    roots: { Globals: 1 },
    model: {
      BUILTIN_ITAB_CAPTIONS: { instvars: 'Instance Variables' },
      getCodeTarget(obj) {
        return obj;
      },
      currentCodeBrowserTarget(obj, className, currentSelector, selector) {
        return { obj, className, currentSelector, selector };
      },
      getCustomTab() {
        return null;
      },
      getInspectorTabCaption(tabId) {
        return tabId.toUpperCase();
      },
      resolveInspectorTab() {
        return {
          availableTabs: ['instvars', 'code'],
          resolvedTab: 'code',
          showTabs: true,
          showMethodBrowser: true,
        };
      },
      normalizeObjectQuery(query) {
        return query;
      },
      buildObjectIndexUrl(oop, query) {
        return `/object/index/${oop}?q=${query.flag}`;
      },
    },
    buildObjectBrowserWindowHtml(id, options) {
      assert.equal(id, 'obj');
      assert.equal(options.compactMode, false);
      return '<div>shell</div>';
    },
    buildInspectorTabsHtml(tabIds, currentTab, captionFor) {
      return `${tabIds.join(',')}|${currentTab}|${captionFor('code')}`;
    },
    prepareTitlebar() {
      body.prepared = true;
    },
    updateTitlebar(obj) {
      body.updatedTitle = obj;
    },
    populateRootsList(node, roots, onSelectRoot) {
      assert.equal(node, rootsNode);
      assert.deepEqual(roots, { Globals: 1 });
      onSelectRoot('Globals', 1);
    },
    renderBreadcrumb(node, history, onSelectIndex) {
      body.breadcrumb = { node, history };
      onSelectIndex(0, history[0]);
    },
    getState() {
      return state;
    },
    setState(patch) {
      patches.push(patch);
      Object.assign(state, patch);
    },
  });

  browserRuntime.mountShell({
    onSelectRoot(label, oop) {
      selectedRoots.push({ label, oop });
    },
  });
  browserRuntime.renderBreadcrumb(() => {});
  browserRuntime.applyItabVisibility(state.currentObjData);

  const first = await browserRuntime.fetchMethodBrowserCached('selectors', { oop: 1 }, async () => {
    loaderCalls += 1;
    return ['one'];
  });
  const second = await browserRuntime.fetchMethodBrowserCached('selectors', { oop: 1 }, async () => {
    loaderCalls += 1;
    return ['two'];
  });

  assert.equal(body.style.minHeight, '0');
  assert.equal(body.innerHTML, '<div>shell</div>');
  assert.equal(body.prepared, true);
  assert.deepEqual(selectedRoots, [{ label: 'Globals', oop: 1 }]);
  assert.equal(body.breadcrumb.history.length, 1);
  assert.equal(tabsNode.innerHTML, 'instvars,code|code|CODE');
  assert.equal(tabsNode.style.display, 'flex');
  assert.equal(mbNode.toggled, false);
  assert.deepEqual(first, ['one']);
  assert.deepEqual(second, ['one']);
  assert.equal(loaderCalls, 1);
  assert.deepEqual(
    patches.some(patch => Object.prototype.hasOwnProperty.call(patch, 'currentItab')),
    true,
  );
  assert.deepEqual(
    browserRuntime.currentCodeBrowserTarget('bar'),
    { obj: state.currentObjData, className: 'Object', currentSelector: 'foo', selector: 'bar' },
  );
  assert.equal(browserRuntime.buildObjectIndexUrl(77), '/object/index/77?q=ok');
});
