(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ClassBrowserAppRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function buildElements(body, id) {
    return {
      toolbar: body.querySelector('.cb-toolbar'),
      find: body.querySelector(`#${id}-find`),
      lists: body.querySelector(`#${id}-lists`),
      dicts: body.querySelector(`#${id}-dicts`),
      classes: body.querySelector(`#${id}-classes`),
      protocols: body.querySelector(`#${id}-protocols`),
      methods: body.querySelector(`#${id}-methods`),
      dictFilter: body.querySelector(`#${id}-dict-filter`),
      classFilter: body.querySelector(`#${id}-class-filter`),
      protocolFilter: body.querySelector(`#${id}-protocol-filter`),
      methodFilter: body.querySelector(`#${id}-method-filter`),
      source: body.querySelector(`#${id}-source`),
      sourceNote: body.querySelector(`#${id}-source-note`),
      status: body.querySelector(`#${id}-status`),
      meta: body.querySelector(`#${id}-meta`),
      queryScope: body.querySelector(`#${id}-query-scope`),
      fileOutMode: body.querySelector(`#${id}-file-out-mode`),
      refresh: body.querySelector(`#${id}-refresh`),
      findDictionary: body.querySelector(`#${id}-find-dictionary`),
      addDictionary: body.querySelector(`#${id}-add-dictionary`),
      renameDictionary: body.querySelector(`#${id}-rename-dictionary`),
      removeDictionary: body.querySelector(`#${id}-remove-dictionary`),
      addClass: body.querySelector(`#${id}-add-class`),
      addCategory: body.querySelector(`#${id}-add-category`),
      renameClass: body.querySelector(`#${id}-rename-class`),
      renameCategory: body.querySelector(`#${id}-rename-category`),
      addInstVar: body.querySelector(`#${id}-add-inst-var`),
      addClassVar: body.querySelector(`#${id}-add-class-var`),
      addClassInstVar: body.querySelector(`#${id}-add-class-inst-var`),
      renameVar: body.querySelector(`#${id}-rename-var`),
      removeVar: body.querySelector(`#${id}-remove-var`),
      moveClass: body.querySelector(`#${id}-move-class`),
      removeClass: body.querySelector(`#${id}-remove-class`),
      browseClass: body.querySelector(`#${id}-browse-class`),
      browseCategory: body.querySelector(`#${id}-browse-category`),
      browseMethod: body.querySelector(`#${id}-browse-method`),
      newMethod: body.querySelector(`#${id}-new-method`),
      moveMethod: body.querySelector(`#${id}-move-method`),
      removeMethod: body.querySelector(`#${id}-remove-method`),
      removeCategory: body.querySelector(`#${id}-remove-category`),
      hierarchy: body.querySelector(`#${id}-hierarchy`),
      versions: body.querySelector(`#${id}-versions`),
      references: body.querySelector(`#${id}-references`),
      methodText: body.querySelector(`#${id}-method-text`),
      inspectDictionary: body.querySelector(`#${id}-inspect-dictionary`),
      inspectClass: body.querySelector(`#${id}-inspect-class`),
      inspectMethod: body.querySelector(`#${id}-inspect-method`),
      inspectInstances: body.querySelector(`#${id}-inspect-instances`),
      senders: body.querySelector(`#${id}-senders`),
      implementors: body.querySelector(`#${id}-implementors`),
      fileOut: body.querySelector(`#${id}-file-out`),
      createAccessors: body.querySelector(`#${id}-create-accessors`),
      continueTx: body.querySelector(`#${id}-continue-tx`),
      abortTx: body.querySelector(`#${id}-abort-tx`),
      commit: body.querySelector(`#${id}-commit`),
      compile: body.querySelector(`#${id}-compile`),
      autoCommit: body.querySelector(`#${id}-auto-commit`),
    };
  }

  function createClassBrowserAppRuntime(deps = {}) {
    function openClassBrowser(options = {}) {
      const { win, body, id } = deps.createWindow({
        title: 'Class Browser',
        width: options.width || 960,
        height: options.height || 660,
        x: options.x,
        y: options.y,
        taskbarLabel: 'Class Browser',
      });

      const sessionChannel = deps.exactWriteSessionChannel(`class-browser:${id}`);
      const browserApi = (url, opts = {}) => deps.api(url, { ...opts, sessionChannel });
      const browserApiPost = (url, requestBody = {}) =>
        deps.apiPost(url, requestBody, { sessionChannel });
      const browserApiWithParams = (url, params = {}) =>
        deps.apiWithParams(url, params, { sessionChannel });
      const browserApiTransaction = url => deps.apiTransaction(url, { sessionChannel });
      const state = {
        sourceWindowId: options.sourceWindowId || null,
        currentDict: options.dictionary || null,
        currentClass: options.className || null,
        currentProtocol: options.protocol || '-- all --',
        currentMethod: options.method || null,
        currentMeta: !!options.meta,
        currentSourceMode: options.method ? 'method' : 'classDefinition',
      };
      const browserCache = new Map();
      const paneWidthStorageKey = 'python-gemstone-class-browser-pane-widths-v1';
      const autoCommitStorageKey = 'python-gemstone-class-browser-auto-commit-v1';
      const paneMinWidths = [120, 160, 140, 180];
      const defaultPaneWidths = [160, 220, 180, 220];
      let markBrowserReady = () => {};
      const browserReady = new Promise(resolve => {
        markBrowserReady = resolve;
      });
      const deferredFns = {
        loadDictionaries: null,
        compileSource: null,
      };

      deps.upsertWindowState(id, {
        kind: 'class-browser',
        sourceWindowId: state.sourceWindowId || null,
        sessionChannel,
      });

      const browserRuntime = {
        ready: browserReady,
        loadMethodReference: (...args) => classBrowserWindowRuntime.loadMethodReferenceIntoBrowser(...args),
        loadHierarchyEntry: (...args) => classBrowserWindowRuntime.loadHierarchyEntryIntoBrowser(...args),
        loadVersion: (...args) => classBrowserWindowRuntime.loadVersionIntoBrowser(...args),
        snapshot: () => ({
          dictionary: state.currentDict || '',
          className: state.currentClass || '',
          protocol: state.currentProtocol || '',
          method: state.currentMethod || '',
          meta: state.currentMeta,
          sourceMode: state.currentSourceMode,
          source: String(els?.source?.value || ''),
          sourceNote: String(els?.sourceNote?.textContent || ''),
        }),
      };

      body.innerHTML = deps.buildClassBrowserWindowHtml(id);
      const els = buildElements(body, id);
      els.meta.checked = state.currentMeta;

      function getState() {
        return state;
      }

      function setState(patch = {}) {
        Object.assign(state, patch);
      }

      const classBrowserShellRuntime = deps.createClassBrowserShellRuntime({
        id,
        win,
        window: deps.window,
        document: deps.document,
        els,
        sessionChannel,
        paneWidthStorageKey,
        autoCommitStorageKey,
        paneMinWidths,
        defaultPaneWidths,
        paneOrder: deps.paneOrder,
        initialActivePaneKey: deps.initialActivePaneKey({
          currentClass: state.currentClass,
          currentMethod: state.currentMethod,
        }),
        getState,
        setState,
        getSourceWindowId() {
          const existingSourceWindowId = deps.windowState.get(id)?.sourceWindowId || null;
          if (!state.sourceWindowId && existingSourceWindowId) {
            state.sourceWindowId = existingSourceWindowId;
          }
          return state.sourceWindowId || null;
        },
        upsertWindowState: deps.upsertWindowState,
        buildClassBrowserActionState: deps.buildClassBrowserActionState,
        applyClassBrowserActionState: deps.applyClassBrowserActionState,
        setStatus: deps.setStatus,
        browserApiTransaction,
        browserApiWithParams,
        buildBrowserCacheKey: deps.buildBrowserCacheKey,
        parseStoredPaneWidths: deps.parseStoredPaneWidths,
        clampPaneWidths: deps.clampPaneWidths,
        normalizeFilterText: deps.normalizeFilterText,
        getVisiblePaneItems: deps.getVisiblePaneItems,
        nextPaneKey: deps.nextPaneKey,
        currentPaneItem: deps.currentPaneItem,
        relativePaneItem: deps.relativePaneItem,
        boundaryPaneItem: deps.boundaryPaneItem,
        filterMatchesValue: deps.filterMatchesValue,
        buildClassSourceRequest: deps.buildClassSourceRequest,
        escHtml: deps.escHtml,
        getCompileSource() {
          return deferredFns.compileSource;
        },
        getLoadDictionaries() {
          return deferredFns.loadDictionaries;
        },
      });
      els.autoCommit.checked = classBrowserShellRuntime.loadStoredAutoCommitEnabled();
      classBrowserShellRuntime.syncWindowState();

      deps.upsertWindowState(id, { browserRuntime });

      const classBrowserWindowRuntime = deps.createClassBrowserWindowRuntime({
        window: deps.window,
        document: deps.document,
        getState,
        setState,
        els,
        bindClassBrowserToolbarActions: deps.bindClassBrowserToolbarActions,
        showLoading: classBrowserShellRuntime.showLoading,
        clearSource: classBrowserShellRuntime.clearSource,
        syncBrowserActions: classBrowserShellRuntime.syncBrowserActions,
        setBrowserStatus: classBrowserShellRuntime.setBrowserStatus,
        setStatus: deps.setStatus,
        fetchBrowserCached: classBrowserShellRuntime.fetchBrowserCached,
        browserApi,
        browserApiPost,
        browserApiWithParams,
        requestSelectModal: deps.requestSelectModal,
        requestTextModal: deps.requestTextModal,
        requestConfirmModal: deps.requestConfirmModal,
        requestModal: deps.requestModal,
        openMethodQueryWindow: deps.openMethodQueryWindow,
        openHierarchyWindow: deps.openHierarchyWindow,
        openVersionsWindow: deps.openVersionsWindow,
        openClassBrowser,
        openLinkedObjectWindow: deps.openLinkedObjectWindow,
        clearBrowserCache: classBrowserShellRuntime.clearBrowserCache,
        ensureFilterShowsValue: classBrowserShellRuntime.ensureFilterShowsValue,
        finalizeBrowserWrite: classBrowserShellRuntime.finalizeBrowserWrite,
        renderList: classBrowserShellRuntime.renderList,
        setActiveRow: classBrowserShellRuntime.setActiveRow,
        syncSourceMode: classBrowserShellRuntime.syncSourceMode,
        focusWindow: () => deps.focusWin(win),
        focusPaneList: classBrowserShellRuntime.focusPaneList,
        setSourceNote: classBrowserShellRuntime.setSourceNote,
        setPaneWidths: classBrowserShellRuntime.setPaneWidths,
        loadStoredPaneWidths: classBrowserShellRuntime.loadStoredPaneWidths,
        applyPaneWidths: classBrowserShellRuntime.applyPaneWidths,
        initPaneSplitters: classBrowserShellRuntime.initPaneSplitters,
        initListFilters: classBrowserShellRuntime.initListFilters,
        markBrowserReady,
        storeAutoCommitEnabledFlag: classBrowserShellRuntime.storeAutoCommitEnabledFlag,
        setMetaChecked(value) {
          state.currentMeta = !!value;
          els.meta.checked = state.currentMeta;
        },
        runBrowserTransaction: classBrowserShellRuntime.runBrowserTransaction,
        id,
        sessionChannel,
        hierarchyScopeLabel: deps.hierarchyScopeLabel,
        buildMethodsRequest: deps.buildMethodsRequest,
        normalizeMethodsState: deps.normalizeMethodsState,
        buildCategoriesRequest: deps.buildCategoriesRequest,
        normalizeProtocolsState: deps.normalizeProtocolsState,
        buildClassesRequest: deps.buildClassesRequest,
        normalizeClassesState: deps.normalizeClassesState,
        buildDictionariesRequest: deps.buildDictionariesRequest,
        normalizeDictionariesState: deps.normalizeDictionariesState,
        buildClassLocationRequest: deps.buildClassLocationRequest,
        normalizeClassLocationMatches: deps.normalizeClassLocationMatches,
        buildLocateClassState: deps.buildLocateClassState,
        snapshotBrowserSelection: deps.snapshotBrowserSelection,
        ownerLabel: deps.ownerLabel,
        buildCategoryQueryResults: deps.buildCategoryQueryResults,
        buildSelectorQueryRequest: deps.buildSelectorQueryRequest,
        buildReferenceQueryRequest: deps.buildReferenceQueryRequest,
        buildMethodTextQueryRequest: deps.buildMethodTextQueryRequest,
        buildHierarchyRequest: deps.buildHierarchyRequest,
        buildVersionsRequest: deps.buildVersionsRequest,
        buildFileOutRequest: deps.buildFileOutRequest,
        buildCompileRequest: deps.buildCompileRequest,
        applyCompileResponse: deps.applyCompileResponse,
        buildTransactionActionSpec: deps.buildTransactionActionSpec,
        loadClassSource: classBrowserShellRuntime.loadClassSource,
        escHtml: deps.escHtml,
      });

      deferredFns.loadDictionaries = classBrowserWindowRuntime.loadDictionaries;
      deferredFns.compileSource = classBrowserWindowRuntime.compileSource;
      classBrowserWindowRuntime.bindToolbar();
      win.addEventListener('keydown', event => classBrowserShellRuntime.handleKeydown(event));
      classBrowserWindowRuntime.initialize();

      return win;
    }

    return {
      openClassBrowser,
    };
  }

  return {
    createClassBrowserAppRuntime,
  };
});
