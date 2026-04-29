const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/desktop_layout_runtime.js');

test('desktop layout runtime collects open window summaries from managed windows', () => {
  const windows = [
    {
      id: 'w1',
      dataset: { minimised: '1' },
      classList: { contains(name) { return name === 'focused'; } },
      style: { zIndex: '7', left: '12px', top: '24px', width: '500px', height: '240px' },
      offsetLeft: 12,
      offsetTop: 24,
      offsetWidth: 500,
      offsetHeight: 240,
      querySelector(selector) {
        return selector === '.win-title' ? { textContent: 'Workspace' } : null;
      },
    },
  ];
  const stateMap = new Map([
    ['w1', { kind: 'workspace', sourceWindowId: 'src-1' }],
  ]);

  const layoutRuntime = runtime.createDesktopLayoutRuntime({
    getOrderedManagedWindows() {
      return windows;
    },
    readWindowState(id) {
      return stateMap.get(id);
    },
    parsePixelValue(value, fallback) {
      return Number.parseInt(String(value || fallback), 10) || fallback;
    },
  });

  assert.deepEqual(layoutRuntime.collectOpenWindowSummaries(), [
    {
      id: 'w1',
      title: 'Workspace',
      kind: 'workspace',
      minimised: true,
      focused: true,
      zIndex: 7,
      sourceWindowId: 'src-1',
      x: 12,
      y: 24,
      width: 500,
      height: 240,
    },
  ]);
});

test('desktop layout runtime restores saved layout through openers and reapplies source links', async () => {
  const savedLayout = [
    {
      savedId: 'saved-workspace',
      kind: 'workspace',
      x: 30,
      y: 40,
      width: 640,
      height: 320,
      zIndex: 9,
      draft: 'Transcript show: 1',
      sourceWindowId: 'saved-source',
    },
  ];
  const storage = new Map([
    ['layout-key', JSON.stringify(savedLayout)],
  ]);
  const managedWindows = [];
  const stateMap = new Map();
  const focused = [];
  let redrawCalls = 0;
  let persistCalls = 0;
  let suppressValue = null;
  let persistedSnapshot = null;

  const layoutRuntime = runtime.createDesktopLayoutRuntime({
    localStorage: {
      getItem(key) {
        return storage.get(key) || null;
      },
      setItem(key, value) {
        storage.set(key, value);
        if (key === 'layout-key') persistedSnapshot = value;
      },
      removeItem(key) {
        storage.delete(key);
      },
    },
    windowLayoutStorageKey: 'layout-key',
    healthyWindowLayoutStorageKey: 'healthy-layout-key',
    buildWindowLayoutSnapshot() {
      persistCalls += 1;
      return savedLayout;
    },
    normalizeStoredWindowLayout(parsed) {
      return parsed;
    },
    chooseRecoverableWindowLayout(current) {
      return current;
    },
    sortWindowLayoutEntries(layout) {
      return layout;
    },
    resolveRestoredSourceLinks(restoredIdMap, pendingLinks) {
      return pendingLinks.map(link => ({
        windowId: link.windowId,
        sourceWindowId: restoredIdMap.get(link.sourceWindowId) || 'resolved-source',
      }));
    },
    isPersistSuppressed() {
      return suppressValue === true;
    },
    setPersistSuppressed(value) {
      suppressValue = value;
    },
    isStartupBootstrapped() {
      return true;
    },
    hasRecoverableWindows() {
      return true;
    },
    getManagedWindows() {
      return managedWindows;
    },
    getOrderedManagedWindows() {
      return managedWindows;
    },
    readWindowState(id) {
      return stateMap.get(id) || {};
    },
    writeWindowState(id, nextState) {
      stateMap.set(id, nextState);
    },
    buildWindowLinkSummaries() {
      return [];
    },
    buildWindowGroupSummaries() {
      return [];
    },
    arrows: [],
    sanitizeSelectionIndex(index) {
      return Number(index) || 0;
    },
    toggleMinimise(win) {
      win.dataset.minimised = win.dataset.minimised === '1' ? '0' : '1';
    },
    focusWin(win) {
      focused.push(win.id);
    },
    redrawArrows() {
      redrawCalls += 1;
    },
    notifyLiveWindowUpdated() {},
    getZTop() {
      return 1;
    },
    setZTop() {},
    openWorkspace(options) {
      const win = {
        id: 'workspace-1',
        dataset: { minimised: '0' },
        style: {},
        classList: { contains() { return false; } },
        querySelector(selector) {
          return selector === '.win-title' ? { textContent: 'Workspace' } : null;
        },
        offsetLeft: 0,
        offsetTop: 0,
        offsetWidth: 0,
        offsetHeight: 0,
      };
      managedWindows.push(win);
      stateMap.set(win.id, {
        kind: 'workspace',
        draft: options.draft,
      });
      return win;
    },
  });

  const restored = await layoutRuntime.restoreSavedLayout();
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(restored, true);
  assert.equal(managedWindows.length, 1);
  assert.deepEqual(focused, ['workspace-1']);
  assert.equal(managedWindows[0].style.left, '30px');
  assert.equal(managedWindows[0].style.top, '40px');
  assert.equal(managedWindows[0].style.width, '640px');
  assert.equal(managedWindows[0].style.height, '320px');
  assert.equal(stateMap.get('workspace-1').sourceWindowId, 'resolved-source');
  assert.equal(redrawCalls, 1);
  assert.ok(persistCalls >= 1);
  assert.equal(typeof persistedSnapshot, 'string');
});
