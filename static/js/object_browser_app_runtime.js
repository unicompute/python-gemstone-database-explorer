(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ObjectBrowserAppRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createObjectBrowserAppRuntime(deps = {}) {
    function openObjectBrowser(initialOop, initialLabel, px, py, pw, ph, options = {}) {
      const { win, body, id } = deps.createWindow({
        title: 'Object Browser',
        width: pw || 520,
        height: ph || 480,
        taskbarLabel: 'Objects',
        x: px,
        y: py,
      });

      const state = {
        currentOop: null,
        currentObjData: null,
        history: [],
        currentItab: 'instvars',
        mbData: {},
        mbClassOop: null,
        mbClassName: '',
        mbCurrentCategory: null,
        mbCurrentSelector: null,
        constantPage: 0,
        instPage: 0,
        modulePage: 0,
        currentObjectQuery: {},
        preferredInitialTab: options.initialTab || null,
      };
      const compactMode = !!options.compact;
      const sessionChannel = `object:${id}`;
      const objectApi = (url, opts = {}) => deps.api(url, { ...opts, sessionChannel });
      const objectApiEvaluate = (oop, payload = {}) =>
        deps.apiEvaluate(oop, payload, { sessionChannel });
      const objectApiTransaction = url => deps.apiTransaction(url, { sessionChannel });
      let selectMethodBrowserCategory = null;
      let selectMethodBrowserSelector = null;
      let openMethodBrowserSelector = null;
      let evalCode = null;
      let evalRes = null;

      function getState() {
        return state;
      }

      function setState(patch = {}) {
        Object.assign(state, patch);
      }

      const objectBrowserWindowRuntime = deps.createObjectBrowserWindowRuntime({
        id,
        win,
        body,
        compactMode,
        roots: deps.roots,
        model: deps.model,
        buildObjectBrowserWindowHtml: deps.buildObjectBrowserWindowHtml,
        buildInspectorTabsHtml: deps.buildInspectorTabsHtml,
        prepareTitlebar: () => deps.prepareTitlebar(win, id, { document: deps.document }),
        updateTitlebar: obj => deps.updateTitlebar(win, id, obj, {
          document: deps.document,
          escHtml: deps.escHtml,
          attachObjectButtonBehavior: deps.attachObjectButtonBehavior,
          sourceWinId: id,
        }),
        populateRootsList: deps.populateRootsList,
        renderBreadcrumb: deps.renderBreadcrumb,
        getState,
        setState,
      });

      const objectBrowserActions = deps.createObjectBrowserActionsRuntime({
        id,
        body,
        document: deps.document,
        compactMode,
        sessionChannel,
        initialOop,
        initialLabel,
        getEvalCode: () => evalCode,
        getEvalRes: () => evalRes,
        upsertWindowState: deps.upsertWindowState,
        getState,
        setState,
        buildMethodBrowserButtonState: deps.model.buildMethodBrowserButtonState,
        currentCodeBrowserTarget: selector => objectBrowserWindowRuntime.currentCodeBrowserTarget(selector),
        getCodeTarget: obj => objectBrowserWindowRuntime.getCodeTarget(obj),
        openMethodBrowser: (classOop, className) => openMB(classOop, className),
        showInspectorTab: () => showItab(),
        clearInspectorTabCache: oop => objectBrowserWindowRuntime.clearInspectorTabCache(oop),
        loadObject: (oop, label, objectOptions) => loadObj(oop, label, objectOptions),
        objectApiEvaluate,
        maybeOpenEvalDebugger: deps.maybeOpenEvalDebugger,
        isLeafBasetype: deps.isLeafBasetype,
        makeChip: deps.makeChip,
      });
      const syncObjectBrowserWindowState = objectBrowserActions.syncWindowState;

      objectBrowserWindowRuntime.mountShell({
        onSelectRoot(label, oop) {
          state.history = [{ label, oop }];
          loadObj(oop, label);
        },
      });
      syncObjectBrowserWindowState();

      evalCode = body.querySelector(`#${id}-eval-code`);
      evalRes = body.querySelector(`#${id}-eval-res`);

      function updateTitlebar(obj) {
        return objectBrowserWindowRuntime.updateTitlebar(obj);
      }

      function renderBc() {
        return objectBrowserWindowRuntime.renderBreadcrumb((index, item) => {
          state.history = state.history.slice(0, index + 1);
          loadObj(item.oop, item.label);
        });
      }

      function openCurrentCodeInClassBrowser(selector = state.mbCurrentSelector) {
        const target = objectBrowserWindowRuntime.currentCodeBrowserTarget(selector);
        if (!target) return false;
        deps.openClassBrowser({ ...target, sourceWindowId: id });
        return true;
      }

      function buildObjectIndexUrl(oop) {
        return objectBrowserWindowRuntime.buildObjectIndexUrl(oop);
      }

      function clearInspectorTabCache(oop = state.currentOop) {
        return objectBrowserWindowRuntime.clearInspectorTabCache(oop);
      }

      function fetchInspectorTabData(oop, tabName, keyParts, loader) {
        return objectBrowserWindowRuntime.fetchInspectorTabData(oop, tabName, keyParts, loader);
      }

      function nextInspectorRenderToken() {
        return objectBrowserWindowRuntime.nextInspectorRenderToken();
      }

      function isActiveInspectorRender(token, tabName, oop) {
        return objectBrowserWindowRuntime.isActiveInspectorRender(token, tabName, oop);
      }

      function findSelectorCategory(data, selector) {
        return objectBrowserWindowRuntime.findSelectorCategory(data, selector);
      }

      function fetchMethodBrowserCached(name, keyParts, loader) {
        return objectBrowserWindowRuntime.fetchMethodBrowserCached(name, keyParts, loader);
      }

      function getCodeTarget(obj) {
        return objectBrowserWindowRuntime.getCodeTarget(obj);
      }

      function currentCodeBrowserTarget(selector = state.mbCurrentSelector) {
        return objectBrowserWindowRuntime.currentCodeBrowserTarget(selector);
      }

      function getCustomTab(tabId) {
        return objectBrowserWindowRuntime.getCustomTab(tabId);
      }

      function applyItabVisibility(obj) {
        return objectBrowserWindowRuntime.applyItabVisibility(
          obj,
          () => objectBrowserActions.updateMethodBrowserActions()
        );
      }

      async function txAction(route, label) {
        const resEl = body.querySelector(`#${id}-tx-res`);
        if (resEl) {
          resEl.classList.remove('hidden', 'error');
          resEl.textContent = `${label}…`;
        }
        try {
          const data = await objectApiTransaction(route);
          if (resEl) {
            resEl.textContent = data.success ? `${label} ok` : `Error: ${data.exception || ''}`;
            if (!data.success) resEl.classList.add('error');
          }
          if (data.success) clearInspectorTabCache(state.currentOop);
          deps.setStatus(data.success, data.success ? label : data.exception || 'error');
        } catch (error) {
          if (resEl) {
            resEl.classList.add('error');
            resEl.textContent = error.message;
          }
          deps.setStatus(false, error.message);
        }
      }

      deps.bindObjectBrowserCoreActions({
        tabsStrip: body.querySelector(`#${id}-itabs`),
        openBrowserBtn: body.querySelector(`#${id}-mb-open-browser`),
        closeMethodBrowserBtn: body.querySelector(`#${id}-mb-close`),
        evalBtn: body.querySelector(`#${id}-eval-btn`),
        evalCode,
        abortBtn: body.querySelector(`#${id}-abort`),
        commitBtn: body.querySelector(`#${id}-commit`),
        continueBtn: body.querySelector(`#${id}-continue`),
      }, {
        onActivateTab: tabId => objectBrowserActions.activateItab(tabId),
        onOpenClassBrowser: () => openCurrentCodeInClassBrowser(),
        onCloseMethodBrowser: () => {
          body.querySelector(`#${id}-mb`).classList.add('hidden');
          body.querySelectorAll('.inspector-tab').forEach(tab => {
            if (tab.dataset.itab === 'instvars') tab.classList.add('active');
            else tab.classList.remove('active');
          });
          state.currentItab = 'instvars';
          showItab();
        },
        onEvaluate: () => objectBrowserActions.evaluateCurrentObject(),
        onAbort: async () => {
          await txAction('/transaction/abort', 'aborted');
          if (state.currentOop) objectBrowserActions.reloadCurrentObject();
        },
        onCommit: () => txAction('/transaction/commit', 'committed'),
        onContinue: () => txAction('/transaction/continue', 'continued'),
      });
      deps.bindObjectBrowserMethodBrowserActions({
        categoriesEl: body.querySelector(`#${id}-mb-cats`),
        selectorsEl: body.querySelector(`#${id}-mb-sels`),
      }, {
        onSelectCategory: category => selectMethodBrowserCategory?.(category),
        onSelectSelector: selector => selectMethodBrowserSelector?.(selector),
        onOpenSelector: selector => openMethodBrowserSelector?.(selector),
      });

      function reloadCurrentObject({ query = state.currentObjectQuery, preserveCurrentTab = true, invalidateCache = true } = {}) {
        return objectBrowserActions.reloadCurrentObject({ query, preserveCurrentTab, invalidateCache });
      }

      async function loadObj(oop, label, options = {}) {
        return deps.loadObjectBrowserObject(oop, label, options, {
          buildObjectLoadStartState: deps.model.buildObjectLoadStartState,
          objectApi,
          buildObjectIndexUrl,
          applyLoadStartState(startState) {
            setState({
              currentOop: startState.currentOop,
              currentObjData: startState.currentObjData,
              currentObjectQuery: startState.currentObjectQuery,
              mbClassName: startState.mbClassName,
              mbCurrentCategory: startState.mbCurrentCategory,
              mbCurrentSelector: startState.mbCurrentSelector,
            });
            if (startState.constantPage !== null) state.constantPage = startState.constantPage;
            if (startState.instPage !== null) state.instPage = startState.instPage;
            if (startState.modulePage !== null) state.modulePage = startState.modulePage;
            syncObjectBrowserWindowState();
            deps.syncObjectWindowArrows(id);
          },
          onBeforeLoad() {
            renderBc();
            body.querySelectorAll(`#${id}-roots li`).forEach(li => {
              li.classList.toggle('active', parseInt(li.dataset.oop, 10) === oop);
            });
            const ibody = body.querySelector(`#${id}-ibody`);
            ibody.innerHTML = '<span class="spinner"></span>';
            body.querySelector(`#${id}-itabs`).style.display = 'none';
            if (evalRes) evalRes.textContent = '';
            updateTitlebar(null);
          },
          setLoadedObject(result) {
            state.currentObjData = result;
            syncObjectBrowserWindowState();
          },
          onAfterLoad() {
            updateTitlebar(state.currentObjData);
            deps.syncObjectWindowArrows(id);
            applyItabVisibility(state.currentObjData);
          },
          chooseRequestedInspectorTab({ preserveCurrentTab = false } = {}) {
            return deps.model.chooseRequestedInspectorTab(state.currentItab, state.currentObjData, {
              preferredInitialTab: state.preferredInitialTab,
              preserveCurrentTab,
            });
          },
          activateItab: tabId => objectBrowserActions.activateItab(tabId),
          clearPreferredInitialTab() {
            state.preferredInitialTab = null;
          },
          showInspectorTab: () => showItab(),
          onLoadError(error) {
            const ibody = body.querySelector(`#${id}-ibody`);
            ibody.innerHTML = `<p style="color:#f38ba8;padding:10px">Error: ${deps.escHtml(error.message)}</p>`;
            syncObjectBrowserWindowState();
          },
        });
      }

      async function showItab() {
        return deps.showObjectBrowserInspectorTab({
          ibody: body.querySelector(`#${id}-ibody`),
          getState,
          nextInspectorRenderToken,
          getCustomTab,
          renderCustomTab,
          renderConstants,
          renderInstances,
          renderModules,
          renderControlPanel,
          renderCard,
          fetchInspectorTabData,
          objectApi,
          isActiveInspectorRender,
          openCurrentCodeInClassBrowser,
          currentCodeBrowserTarget,
          openClassBrowser: deps.openClassBrowser,
          makeTable: deps.makeTable,
          document: deps.document,
          escHtml: deps.escHtml,
          id,
        });
      }

      async function renderInstances(ibody, renderToken, oop) {
        return deps.renderObjectBrowserInstances(ibody, renderToken, oop, {
          fetchInspectorTabData,
          objectApi,
          isActiveInspectorRender,
          getPage: () => state.instPage,
          setPage: value => {
            state.instPage = value;
          },
          nextInspectorRenderToken,
          buildPagedCollectionState: deps.model.buildPagedCollectionState,
          buildInstancesCollectionState: deps.buildInstancesCollectionState,
          document: deps.document,
          makeChip: (text, chipOop) => deps.makeChip(text, chipOop, id),
          escHtml: deps.escHtml,
        });
      }

      async function renderConstants(ibody, renderToken, oop) {
        return deps.renderObjectBrowserConstants(ibody, renderToken, oop, {
          fetchInspectorTabData,
          objectApi,
          isActiveInspectorRender,
          getPage: () => state.constantPage,
          setPage: value => {
            state.constantPage = value;
          },
          nextInspectorRenderToken,
          buildPagedCollectionState: deps.model.buildPagedCollectionState,
          buildConstantsCollectionState: deps.buildConstantsCollectionState,
          document: deps.document,
          makeValCellFromState: (valueState, label) => makeValCellFromState(valueState, label),
          escHtml: deps.escHtml,
        });
      }

      async function renderModules(ibody, renderToken, oop) {
        return deps.renderObjectBrowserModules(ibody, renderToken, oop, {
          fetchInspectorTabData,
          objectApi,
          isActiveInspectorRender,
          getPage: () => state.modulePage,
          setPage: value => {
            state.modulePage = value;
          },
          nextInspectorRenderToken,
          buildPagedCollectionState: deps.model.buildPagedCollectionState,
          buildModulesCollectionState: deps.buildModulesCollectionState,
          document: deps.document,
          makeValCellFromState: (valueState, label) => makeValCellFromState(valueState, label),
          escHtml: deps.escHtml,
        });
      }

      function renderControlPanel(ibody) {
        return deps.renderControlPanel(ibody, {
          document: deps.document,
          objectApi,
          clearInspectorTabCache,
          getCurrentOop: () => state.currentOop,
          setStatus: deps.setStatus,
          refreshHaltedThreadsBar: deps.refreshHaltedThreadsBar,
        });
      }

      function assocChip(text, oop) {
        const chip = deps.document.createElement('span');
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:2px;background:#232336;border:1px solid #45475a;border-radius:3px;padding:0 4px;font-size:10px;font-family:monospace;cursor:pointer;color:#cdd6f4;vertical-align:middle;';
        chip.innerHTML = '<span style="font-size:9px;color:#a6adc8">▤</span>' +
          deps.escHtml(String(text || '').slice(0, 30)) +
          '<span style="color:#6c7086;font-size:8px;margin-left:2px">▼</span>';
        deps.attachObjectButtonBehavior(chip, { oop, text, sourceWinId: id });
        return chip;
      }

      function hashBraceChip(label, oop) {
        const chip = deps.document.createElement('span');
        chip.style.cssText = 'display:inline-flex;align-items:center;background:#232336;border:1px solid #45475a;border-radius:3px;padding:0 3px;font-size:11px;font-family:monospace;cursor:pointer;color:#89dceb;vertical-align:middle;';
        chip.innerHTML = deps.escHtml(label) +
          '<span style="color:#6c7086;font-size:8px;margin-left:1px">▼</span>';
        deps.attachObjectButtonBehavior(chip, { oop, text: label, sourceWinId: id });
        return chip;
      }

      const objectBrowserContent = deps.createObjectBrowserContentRuntime({
        id,
        document: deps.document,
        escHtml: deps.escHtml,
        assocChip,
        hashBraceChip,
        getState,
        setState,
        loadObject: (oop, label, objectOptions) => loadObj(oop, label, objectOptions),
        buildAssociationRenderState: deps.buildAssociationRenderState,
        buildCustomTabRenderState: deps.buildCustomTabRenderState,
        buildObjectCardState: deps.buildObjectCardState,
        buildValueRenderState: deps.buildValueRenderState,
        buildCustomTabPagerState: deps.model.buildCustomTabPagerState,
        customTabRangeQuery: (query, customTab, from, to) =>
          deps.model.customTabRangeQuery(query, customTab, from, to),
        appendObjectBrowserValueChips: deps.appendObjectBrowserValueChips,
        renderObjectBrowserAssociationPairs: deps.renderObjectBrowserAssociationPairs,
        makeObjectBrowserValCellFromState: deps.makeObjectBrowserValCellFromState,
        renderObjectBrowserCustomTab: deps.renderObjectBrowserCustomTab,
        renderObjectBrowserCard: deps.renderObjectBrowserCard,
        getCodeTarget,
        openMethodBrowser: (classOop, className) => openMB(classOop, className),
        makeChip: deps.makeChip,
      });

      function renderAssociationPairs(ibody, entries, totalSize, emptyText = '(empty)', options = {}) {
        return objectBrowserContent.renderAssociationPairs(ibody, entries, totalSize, emptyText, options);
      }

      function renderCustomTab(ibody, obj, customTab) {
        return objectBrowserContent.renderCustomTab(ibody, obj, customTab);
      }

      function renderCard(obj) {
        return objectBrowserContent.renderCard(obj);
      }

      function makeValCellFromState(valueState, label) {
        return objectBrowserContent.makeValCellFromState(valueState, label);
      }

      async function openMB(classOop, className) {
        return deps.openMethodBrowser(classOop, className, {
          body,
          id,
          fetchMethodBrowserCached,
          objectApi,
          buildMethodBrowserCategoriesHtml: deps.buildMethodBrowserCategoriesHtml,
          buildMethodBrowserSelectorsHtml: deps.buildMethodBrowserSelectorsHtml,
          findSelectorCategory,
          escHtml: deps.escHtml,
          updateMethodBrowserActions: () => objectBrowserActions.updateMethodBrowserActions(),
          getState() {
            return {
              mbClassOop: state.mbClassOop,
              mbClassName: state.mbClassName,
              mbCurrentCategory: state.mbCurrentCategory,
              mbCurrentSelector: state.mbCurrentSelector,
              mbData: state.mbData,
            };
          },
          setState(patch = {}) {
            Object.assign(state, patch);
          },
          selectCategory(handler) {
            selectMethodBrowserCategory = handler;
          },
          selectSelector(handler) {
            selectMethodBrowserSelector = handler;
          },
          openSelector(handler) {
            openMethodBrowserSelector = handler;
          },
          openCurrentCodeInClassBrowser,
        });
      }

      if (initialOop) {
        state.history = [{ label: initialLabel || 'object', oop: initialOop }];
        loadObj(initialOop, initialLabel || 'object', {
          query: options.query || null,
          preserveCurrentTab: !!options.initialTab,
        });
      }
      return win;
    }

    return {
      openObjectBrowser,
    };
  }

  return {
    createObjectBrowserAppRuntime,
  };
});
