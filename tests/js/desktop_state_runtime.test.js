const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/desktop_state_runtime.js');

test('desktop state runtime serializes a restorable workspace window', () => {
  const win = {
    id: 'workspace-1',
    style: {
      left: '12px',
      top: '24px',
      width: '640px',
      height: '320px',
      zIndex: '9',
    },
    dataset: {
      minimised: '0',
      savedH: '320',
    },
    offsetLeft: 12,
    offsetTop: 24,
    offsetWidth: 640,
    offsetHeight: 320,
  };
  const stateMap = new Map([
    ['workspace-1', {kind: 'workspace', draft: '1 + 2'}],
  ]);

  const desktopStateRuntime = runtime.createDesktopStateRuntime({
    document: {
      querySelectorAll() {
        return [win];
      },
      getElementById(id) {
        return id === 'workspace-1' ? win : null;
      },
    },
    windowState: stateMap,
    restorableWindowKinds: new Set(['workspace']),
    windowLayoutModel: {
      buildWindowLayoutSnapshot(entries) {
        return entries;
      },
      hasRecoverableWindows(entries) {
        return Array.isArray(entries) && entries.length > 0;
      },
    },
    windowRestoreModel: {
      resolveRestoredSourceLinks() {
        return [];
      },
    },
    createDesktopLayoutRuntime() {
      throw new Error('not used');
    },
    localStorage: {},
    windowLayoutStorageKey: 'layout',
    healthyWindowLayoutStorageKey: 'healthy',
    isPersistSuppressed() {
      return false;
    },
    setPersistSuppressed() {},
    isStartupBootstrapped() {
      return true;
    },
    sanitizeSelectionIndex(index) {
      return Number(index) || 0;
    },
    toggleMinimise() {},
    focusWin() {},
    redrawArrows() {},
    notifyLiveWindowUpdated() {},
    getZTop() {
      return 1;
    },
    setZTop() {},
    buildWindowLinkSummaries() {
      return [];
    },
    buildWindowGroupSummaries() {
      return [];
    },
    arrows: [],
    computeRelatedWindowIds() {
      return [];
    },
    getStartupIds() {
      return {};
    },
    getRoots() {
      return {};
    },
  });

  assert.deepEqual(
    desktopStateRuntime.serializeWindowLayoutEntry('workspace-1', stateMap.get('workspace-1')),
    {
      savedId: 'workspace-1',
      kind: 'workspace',
      x: 12,
      y: 24,
      width: 640,
      height: 320,
      minimised: false,
      zIndex: 9,
      draft: '1 + 2',
    }
  );
});

test('desktop state runtime upserts state and persists layout', () => {
  const stateMap = new Map();
  let persistCalls = 0;
  let liveUpdateCalls = 0;

  const desktopStateRuntime = runtime.createDesktopStateRuntime({
    document: {
      querySelectorAll() {
        return [];
      },
      getElementById() {
        return null;
      },
    },
    windowState: stateMap,
    restorableWindowKinds: new Set(),
    windowLayoutModel: {
      buildWindowLayoutSnapshot(entries) {
        return entries;
      },
      hasRecoverableWindows() {
        return false;
      },
      normalizeStoredWindowLayout(layout) {
        return layout;
      },
      chooseRecoverableWindowLayout(layout) {
        return layout;
      },
      sortWindowLayoutEntries(layout) {
        return layout;
      },
    },
    windowRestoreModel: {
      resolveRestoredSourceLinks() {
        return [];
      },
    },
    createDesktopLayoutRuntime() {
      return {
        persistWindowLayout() {
          persistCalls += 1;
        },
      };
    },
    localStorage: {},
    windowLayoutStorageKey: 'layout',
    healthyWindowLayoutStorageKey: 'healthy',
    isPersistSuppressed() {
      return false;
    },
    setPersistSuppressed() {},
    isStartupBootstrapped() {
      return true;
    },
    sanitizeSelectionIndex(index) {
      return Number(index) || 0;
    },
    toggleMinimise() {},
    focusWin() {},
    redrawArrows() {},
    notifyLiveWindowUpdated() {
      liveUpdateCalls += 1;
    },
    getZTop() {
      return 1;
    },
    setZTop() {},
    buildWindowLinkSummaries() {
      return [];
    },
    buildWindowGroupSummaries() {
      return [];
    },
    arrows: [],
    computeRelatedWindowIds() {
      return [];
    },
    getStartupIds() {
      return {};
    },
    getRoots() {
      return {};
    },
  });

  desktopStateRuntime.upsertWindowState('w1', {kind: 'about'});
  desktopStateRuntime.upsertWindowState('w1', {title: 'About'});

  assert.deepEqual(stateMap.get('w1'), {kind: 'about', title: 'About'});
  assert.equal(persistCalls, 2);
  assert.equal(liveUpdateCalls, 2);
});
