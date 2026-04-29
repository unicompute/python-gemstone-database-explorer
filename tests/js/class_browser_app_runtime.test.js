const test = require('node:test');
const assert = require('node:assert/strict');

const { createClassBrowserAppRuntime } = require('../../static/js/class_browser_app_runtime.js');

function createBody(id) {
  const nodes = new Map();
  return {
    innerHTML: '',
    querySelector(selector) {
      if (!nodes.has(selector)) {
        nodes.set(selector, selector === '.cb-toolbar'
          ? {}
          : {
              id: selector.replace('#', ''),
              value: '',
              textContent: '',
              checked: false,
            });
      }
      return nodes.get(selector);
    },
  };
}

test('class browser app runtime builds shell and delegates bootstrap to window runtime', () => {
  const win = {
    addEventListener(type, handler) {
      win.lastListener = { type, handler };
    },
  };
  const body = createBody('cb');
  const upserts = [];
  const calls = {
    bindToolbar: 0,
    initialize: 0,
    syncShellState: 0,
  };

  const runtime = createClassBrowserAppRuntime({
    createWindow() {
      return { win, body, id: 'cb' };
    },
    exactWriteSessionChannel(name) {
      return `exact:${name}`;
    },
    api() {
      return Promise.resolve({});
    },
    apiPost() {
      return Promise.resolve({});
    },
    apiWithParams() {
      return Promise.resolve({});
    },
    apiTransaction() {
      return Promise.resolve({});
    },
    upsertWindowState(id, patch) {
      upserts.push({ id, patch });
    },
    buildClassBrowserWindowHtml() {
      return '<div class="cb-toolbar"></div>';
    },
    createClassBrowserShellRuntime() {
      return {
        loadStoredAutoCommitEnabled() {
          return true;
        },
        syncWindowState() {
          calls.syncShellState += 1;
        },
        showLoading() {},
        clearSource() {},
        syncBrowserActions() {},
        setBrowserStatus() {},
        fetchBrowserCached() {
          return Promise.resolve(null);
        },
        clearBrowserCache() {},
        ensureFilterShowsValue() {},
        finalizeBrowserWrite() {},
        renderList() {},
        setActiveRow() {},
        syncSourceMode() {},
        focusPaneList() {},
        setSourceNote() {},
        setPaneWidths() {},
        loadStoredPaneWidths() {
          return [];
        },
        applyPaneWidths() {},
        initPaneSplitters() {},
        initListFilters() {},
        storeAutoCommitEnabledFlag() {},
        runBrowserTransaction() {
          return Promise.resolve();
        },
        loadClassSource() {},
        handleKeydown() {},
      };
    },
    createClassBrowserWindowRuntime() {
      return {
        loadDictionaries() {
          return Promise.resolve();
        },
        compileSource() {
          return Promise.resolve();
        },
        loadMethodReferenceIntoBrowser() {},
        loadHierarchyEntryIntoBrowser() {},
        loadVersionIntoBrowser() {},
        bindToolbar() {
          calls.bindToolbar += 1;
        },
        initialize() {
          calls.initialize += 1;
        },
      };
    },
    window: {},
    document: {},
    windowState: new Map(),
    paneOrder: ['dicts', 'classes', 'protocols', 'methods'],
    initialActivePaneKey() {
      return 'classes';
    },
    buildClassBrowserActionState() {
      return {};
    },
    applyClassBrowserActionState() {},
    setStatus() {},
    buildBrowserCacheKey() {
      return 'cache-key';
    },
    parseStoredPaneWidths() {
      return [];
    },
    clampPaneWidths(value) {
      return value;
    },
    normalizeFilterText(value) {
      return value;
    },
    getVisiblePaneItems() {
      return [];
    },
    nextPaneKey() {
      return null;
    },
    currentPaneItem() {
      return null;
    },
    relativePaneItem() {
      return null;
    },
    boundaryPaneItem() {
      return null;
    },
    filterMatchesValue() {
      return true;
    },
    buildClassSourceRequest() {
      return {};
    },
    escHtml(value) {
      return String(value);
    },
    bindClassBrowserToolbarActions() {},
    requestSelectModal() {},
    requestTextModal() {},
    requestConfirmModal() {},
    requestModal() {},
    openMethodQueryWindow() {},
    openHierarchyWindow() {},
    openVersionsWindow() {},
    openLinkedObjectWindow() {},
    focusWin() {},
    hierarchyScopeLabel() {
      return '';
    },
    buildMethodsRequest() {
      return {};
    },
    normalizeMethodsState() {
      return {};
    },
    buildCategoriesRequest() {
      return {};
    },
    normalizeProtocolsState() {
      return {};
    },
    buildClassesRequest() {
      return {};
    },
    normalizeClassesState() {
      return {};
    },
    buildDictionariesRequest() {
      return {};
    },
    normalizeDictionariesState() {
      return {};
    },
    buildClassLocationRequest() {
      return {};
    },
    normalizeClassLocationMatches() {
      return [];
    },
    buildLocateClassState() {
      return {};
    },
    snapshotBrowserSelection() {
      return {};
    },
    ownerLabel() {
      return '';
    },
    buildCategoryQueryResults() {
      return {};
    },
    buildSelectorQueryRequest() {
      return {};
    },
    buildReferenceQueryRequest() {
      return {};
    },
    buildMethodTextQueryRequest() {
      return {};
    },
    buildHierarchyRequest() {
      return {};
    },
    buildVersionsRequest() {
      return {};
    },
    buildFileOutRequest() {
      return {};
    },
    buildCompileRequest() {
      return {};
    },
    applyCompileResponse() {},
    buildTransactionActionSpec() {
      return {};
    },
  });

  const returnedWin = runtime.openClassBrowser({ className: 'Object', method: 'printString' });

  assert.equal(returnedWin, win);
  assert.equal(calls.syncShellState, 1);
  assert.equal(calls.bindToolbar, 1);
  assert.equal(calls.initialize, 1);
  assert.equal(body.querySelector('#cb-meta').checked, false);
  assert.equal(body.querySelector('#cb-auto-commit').checked, true);
  assert.equal(upserts[0].patch.kind, 'class-browser');
  assert.equal(upserts[0].patch.sessionChannel, 'exact:class-browser:cb');
  assert.equal(upserts[1].patch.browserRuntime.ready instanceof Promise, true);
});
