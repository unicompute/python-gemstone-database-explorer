const test = require('node:test');
const assert = require('node:assert/strict');

const modulePath = '../../static/js/class_browser_window_runtime.js';

function loadRuntime({ workflow, toolbar } = {}) {
  const prevWorkflow = global.ClassBrowserWorkflow;
  const prevToolbar = global.ClassBrowserToolbarRuntime;
  delete require.cache[require.resolve(modulePath)];
  global.ClassBrowserWorkflow = {
    createClassBrowserWorkflow() {
      return workflow || {};
    },
  };
  global.ClassBrowserToolbarRuntime = {
    createToolbarHandlers() {
      return toolbar || {};
    },
  };
  const runtime = require(modulePath);
  return {
    runtime,
    cleanup() {
      if (prevWorkflow === undefined) delete global.ClassBrowserWorkflow;
      else global.ClassBrowserWorkflow = prevWorkflow;
      if (prevToolbar === undefined) delete global.ClassBrowserToolbarRuntime;
      else global.ClassBrowserToolbarRuntime = prevToolbar;
      delete require.cache[require.resolve(modulePath)];
    },
  };
}

test('class browser window runtime binds toolbar handlers through controller wiring', () => {
  const workflow = {
    locateAndSelectClass() {},
    findDictionary() {},
    addDictionary() {},
    renameDictionary() {},
    removeDictionary() {},
    addClass() {},
    renameClass() {},
    addCategory() {},
    renameCategory() {},
    addClassVariable() {},
    renameVariable() {},
    removeVariable() {},
    moveClass() {},
    removeClass() {},
    refreshBrowser() {},
    browseCategory() {},
    browseMethod() {},
    startNewMethod() {},
    moveMethod() {},
    removeMethod() {},
    removeCategory() {},
    showHierarchy() {},
    showVersions() {},
    runReferenceQuery() {},
    runMethodTextQuery() {},
    inspectTarget() {},
    runSelectorQuery() {},
    fileOut() {},
    createAccessors() {},
    continueSession() {},
    abortSession() {},
    commitSession() {},
    compileSource() {},
    loadProtocols() {},
  };
  let receivedDeps = null;
  const toolbarHandlers = { compile() {} };
  const { runtime, cleanup } = loadRuntime({
    workflow,
    toolbar: toolbarHandlers,
  });

  try {
    const els = { toolbar: true };
    const bound = [];
    const browserRuntime = runtime.createClassBrowserWindowRuntime({
      document: {
        createElement() {
          return {};
        },
        body: {
          appendChild() {},
        },
      },
      window: {},
      els,
      getState() {
        return { currentClass: 'Sample' };
      },
      requestTextModal() {},
      setBrowserStatus() {},
      setStatus() {},
      ensureFilterShowsValue() {},
      loadClassSource() {},
      setSourceNote() {},
      setActiveRow() {},
      syncSourceMode() {},
      loadStoredPaneWidths() {
        return [];
      },
      applyPaneWidths() {},
      initPaneSplitters() {},
      initListFilters() {},
      markBrowserReady() {},
      storeAutoCommitEnabledFlag() {},
      bindClassBrowserToolbarActions(boundEls, handlers) {
        bound.push({ boundEls, handlers });
      },
    });

    global.ClassBrowserToolbarRuntime.createToolbarHandlers = deps => {
      receivedDeps = deps;
      return toolbarHandlers;
    };

    browserRuntime.bindToolbar();

    assert.equal(bound.length, 1);
    assert.equal(bound[0].boundEls, els);
    assert.notEqual(bound[0].handlers, toolbarHandlers);
    assert.equal(typeof bound[0].handlers.compile, 'function');
    assert.equal(typeof receivedDeps.locateAndSelectClass, 'function');
    assert.equal(typeof receivedDeps.compileSource, 'function');
    assert.equal(typeof receivedDeps.storeAutoCommitEnabled, 'function');
  } finally {
    cleanup();
  }
});

test('class browser window runtime initialize falls back to dictionaries when unresolved class cannot be located', async () => {
  let loadDictionariesCalls = 0;
  let setStatePatch = null;
  let browserStatus = null;
  let readyCalls = 0;
  const { runtime, cleanup } = loadRuntime({
    workflow: {
      async locateAndSelectClass() {
        return false;
      },
      async loadDictionaries() {
        loadDictionariesCalls += 1;
      },
    },
  });

  try {
    const browserRuntime = runtime.createClassBrowserWindowRuntime({
      document: {
        createElement() {
          return {};
        },
        body: {
          appendChild() {},
        },
      },
      window: {},
      els: {},
      getState() {
        return {
          currentClass: 'MissingClass',
          currentDict: null,
          currentMethod: 'foo',
          currentMeta: false,
        };
      },
      setState(patch) {
        setStatePatch = patch;
      },
      setPaneWidths() {},
      loadStoredPaneWidths() {
        return [1, 2, 3];
      },
      applyPaneWidths() {},
      initPaneSplitters() {},
      initListFilters() {},
      syncSourceMode() {},
      setBrowserStatus(message) {
        browserStatus = message;
      },
      setStatus() {},
      markBrowserReady() {
        readyCalls += 1;
      },
    });

    await browserRuntime.initialize();

    assert.deepEqual(setStatePatch, {
      currentClass: null,
      currentMethod: null,
      currentProtocol: '-- all --',
    });
    assert.equal(loadDictionariesCalls, 1);
    assert.equal(browserStatus, 'Ready');
    assert.equal(readyCalls, 1);
  } finally {
    cleanup();
  }
});
