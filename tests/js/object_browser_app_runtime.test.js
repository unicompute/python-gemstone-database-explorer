const test = require('node:test');
const assert = require('node:assert/strict');

const { createObjectBrowserAppRuntime } = require('../../static/js/object_browser_app_runtime.js');

test('object browser app runtime mounts shell, syncs state, and loads initial object', () => {
  const win = {};
  const body = {
    innerHTML: '',
    style: {},
    querySelector(selector) {
      if (selector === '#obj-eval-code') return { value: '' };
      if (selector === '#obj-eval-res') return { textContent: '' };
      if (selector === '#obj-itabs') return { style: {}, classList: { add() {}, remove() {} } };
      if (selector === '#obj-mb-open-browser') return {};
      if (selector === '#obj-mb-close') return {};
      if (selector === '#obj-eval-btn') return {};
      if (selector === '#obj-abort') return {};
      if (selector === '#obj-commit') return {};
      if (selector === '#obj-continue') return {};
      if (selector === '#obj-mb-cats') return {};
      if (selector === '#obj-mb-sels') return {};
      if (selector === '#obj-ibody') return { innerHTML: '', style: {} };
      if (selector === '#obj-roots') return {};
      if (selector === '#obj-bc') return {};
      return {};
    },
    querySelectorAll() {
      return [];
    },
  };
  const calls = {
    mounted: 0,
    synced: 0,
    loaded: [],
  };

  const runtime = createObjectBrowserAppRuntime({
    createWindow() {
      return { win, body, id: 'obj' };
    },
    roots: {},
    model: {
      buildMethodBrowserButtonState() {
        return {};
      },
      buildObjectLoadStartState() {
        return {
          currentOop: 7,
          currentObjData: null,
          currentObjectQuery: {},
          mbClassName: '',
          mbCurrentCategory: null,
          mbCurrentSelector: null,
          constantPage: null,
          instPage: null,
          modulePage: null,
        };
      },
      chooseRequestedInspectorTab() {
        return null;
      },
      buildPagedCollectionState() {
        return {};
      },
      buildCustomTabPagerState() {
        return {};
      },
      customTabRangeQuery() {
        return {};
      },
    },
    buildObjectBrowserWindowHtml() {
      return '<div></div>';
    },
    buildInspectorTabsHtml() {
      return '';
    },
    prepareTitlebar() {},
    updateTitlebar() {},
    populateRootsList() {},
    renderBreadcrumb() {},
    createObjectBrowserWindowRuntime() {
      return {
        mountShell() {
          calls.mounted += 1;
        },
        updateTitlebar() {},
        currentCodeBrowserTarget() {
          return null;
        },
        getCodeTarget() {
          return null;
        },
        clearInspectorTabCache() {},
        buildObjectIndexUrl() {
          return '/object/index/7?depth=2';
        },
        applyItabVisibility() {},
        renderBreadcrumb() {},
        fetchInspectorTabData() {
          return Promise.resolve(null);
        },
        nextInspectorRenderToken() {
          return 1;
        },
        isActiveInspectorRender() {
          return true;
        },
        findSelectorCategory() {
          return null;
        },
        fetchMethodBrowserCached() {
          return Promise.resolve(null);
        },
        getCustomTab() {
          return null;
        },
      };
    },
    createObjectBrowserActionsRuntime() {
      return {
        syncWindowState() {
          calls.synced += 1;
        },
        activateItab() {
          return false;
        },
        updateMethodBrowserActions() {},
        reloadCurrentObject() {},
        evaluateCurrentObject() {},
      };
    },
    api() {
      return Promise.resolve({ success: true, result: { oop: 7 } });
    },
    apiEvaluate() {
      return Promise.resolve({ success: true });
    },
    apiTransaction() {
      return Promise.resolve({ success: true });
    },
    upsertWindowState() {},
    maybeOpenEvalDebugger() {},
    isLeafBasetype() {
      return false;
    },
    makeChip() {},
    bindObjectBrowserCoreActions() {},
    bindObjectBrowserMethodBrowserActions() {},
    loadObjectBrowserObject(oop, label, options, deps) {
      calls.loaded.push({ oop, label, options });
      deps.applyLoadStartState(deps.buildObjectLoadStartState(oop, null, { keepInstPage: false }));
      deps.setLoadedObject({ oop });
      deps.onAfterLoad();
      return Promise.resolve();
    },
    syncObjectWindowArrows() {},
    showObjectBrowserInspectorTab() {
      return Promise.resolve();
    },
    renderObjectBrowserInstances() {
      return Promise.resolve();
    },
    renderObjectBrowserConstants() {
      return Promise.resolve();
    },
    renderObjectBrowserModules() {
      return Promise.resolve();
    },
    renderControlPanel() {},
    setStatus() {},
    refreshHaltedThreadsBar() {},
    document: {
      createElement() {
        return { style: {}, innerHTML: '' };
      },
    },
    escHtml(value) {
      return String(value);
    },
    attachObjectButtonBehavior() {},
    createObjectBrowserContentRuntime() {
      return {
        renderAssociationPairs() {},
        renderCustomTab() {},
        renderCard() {
          return {};
        },
        makeValCellFromState() {
          return {};
        },
      };
    },
    buildAssociationRenderState() {
      return {};
    },
    buildCustomTabRenderState() {
      return {};
    },
    buildObjectCardState() {
      return {};
    },
    buildValueRenderState() {
      return {};
    },
    appendObjectBrowserValueChips() {},
    renderObjectBrowserAssociationPairs() {},
    makeObjectBrowserValCellFromState() {},
    renderObjectBrowserCustomTab() {},
    renderObjectBrowserCard() {
      return {};
    },
    openMethodBrowser() {
      return Promise.resolve();
    },
    buildMethodBrowserCategoriesHtml() {
      return '';
    },
    buildMethodBrowserSelectorsHtml() {
      return '';
    },
    openClassBrowser() {},
    makeTable() {},
  });

  const returnedWin = runtime.openObjectBrowser(7, 'Seven');

  assert.equal(returnedWin, win);
  assert.equal(calls.mounted, 1);
  assert.equal(calls.synced, 3);
  assert.deepEqual(calls.loaded, [{
    oop: 7,
    label: 'Seven',
    options: { query: null, preserveCurrentTab: false },
  }]);
});
