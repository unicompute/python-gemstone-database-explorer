(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ClassBrowserWindowRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const globalRoot = typeof globalThis !== 'undefined' ? globalThis : this;

  function createReentrantTaskRunner() {
    let tail = Promise.resolve();
    let depth = 0;
    return function runBrowserTask(task) {
      if (depth > 0) {
        return Promise.resolve().then(task);
      }
      const run = async () => {
        depth += 1;
        try {
          return await task();
        } finally {
          depth -= 1;
        }
      };
      const next = tail.then(run, run);
      tail = next.catch(() => {});
      return next;
    };
  }

  function createDownloadTextFile(documentRef, windowRef) {
    return function downloadTextFile(filename, text) {
      windowRef.__lastDownloadedFile = {
        filename: String(filename || ''),
        text: String(text || ''),
      };
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = documentRef.createElement('a');
      link.href = url;
      link.download = String(filename || 'export.st').replace(/[\\/:*?"<>|]+/g, '-');
      documentRef.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    };
  }

  function createClassBrowserWindowRuntime(deps = {}) {
    const workflowApi = globalRoot.ClassBrowserWorkflow || {};
    const toolbarApi = globalRoot.ClassBrowserToolbarRuntime || {};
    const runBrowserTask = deps.runBrowserTask || createReentrantTaskRunner();
    const workflow = workflowApi.createClassBrowserWorkflow({
      ...deps,
      runBrowserTask,
      downloadTextFile: deps.downloadTextFile || createDownloadTextFile(deps.document, deps.window || globalRoot),
    });

    function browseClassDefinition() {
      deps.setState?.({
        currentMethod: null,
        currentSourceMode: 'classDefinition',
      });
      deps.setActiveRow?.(deps.els?.methods, null);
      deps.loadClassSource?.('');
    }

    function persistAutoCommitFlag(value) {
      deps.storeAutoCommitEnabledFlag?.(!!value);
    }

    function applyMetaToggle() {
      deps.setState?.({
        currentMeta: !!deps.els?.meta?.checked,
        currentProtocol: '-- all --',
        currentMethod: null,
      });
    }

    function bindToolbar() {
      const handlers = toolbarApi.createToolbarHandlers({
        getCurrentClass: () => deps.getState?.().currentClass || '',
        requestTextModal: deps.requestTextModal,
        locateAndSelectClass: workflow.locateAndSelectClass,
        setBrowserStatus: deps.setBrowserStatus,
        setStatus: deps.setStatus,
        findDictionary: workflow.findDictionary,
        addDictionary: workflow.addDictionary,
        renameDictionary: workflow.renameDictionary,
        removeDictionary: workflow.removeDictionary,
        addClass: workflow.addClass,
        renameClass: workflow.renameClass,
        addCategory: workflow.addCategory,
        renameCategory: workflow.renameCategory,
        addClassVariable: workflow.addClassVariable,
        renameVariable: workflow.renameVariable,
        removeVariable: workflow.removeVariable,
        moveClass: workflow.moveClass,
        removeClass: workflow.removeClass,
        refreshBrowser: workflow.refreshBrowser,
        browseClassDefinition,
        browseCategory: workflow.browseCategory,
        browseMethod: workflow.browseMethod,
        startNewMethod: workflow.startNewMethod,
        moveMethod: workflow.moveMethod,
        removeMethod: workflow.removeMethod,
        removeCategory: workflow.removeCategory,
        showHierarchy: workflow.showHierarchy,
        showVersions: workflow.showVersions,
        runReferenceQuery: workflow.runReferenceQuery,
        runMethodTextQuery: workflow.runMethodTextQuery,
        inspectTarget: workflow.inspectTarget,
        runSelectorQuery: workflow.runSelectorQuery,
        fileOut: workflow.fileOut,
        createAccessors: workflow.createAccessors,
        continueSession: workflow.continueSession,
        abortSession: workflow.abortSession,
        commitSession: workflow.commitSession,
        compileSource: workflow.compileSource,
        readAutoCommitChecked: () => !!deps.els?.autoCommit?.checked,
        storeAutoCommitEnabled: persistAutoCommitFlag,
        applyMetaToggle,
        ensureClassFilter(className) {
          deps.ensureFilterShowsValue?.(deps.els?.classFilter, className);
        },
        loadProtocols: workflow.loadProtocols,
      });
      const wrappedHandlers = Object.fromEntries(
        Object.entries(handlers).map(([name, handler]) => [
          name,
          typeof handler === 'function'
            ? (...args) => runBrowserTask(() => handler(...args))
            : handler,
        ])
      );
      deps.bindClassBrowserToolbarActions?.(deps.els, wrappedHandlers);
    }

    async function initialize() {
      try {
        deps.setPaneWidths?.(deps.loadStoredPaneWidths?.());
        deps.applyPaneWidths?.();
        deps.initPaneSplitters?.();
        deps.initListFilters?.();
        deps.syncSourceMode?.();
        const current = deps.getState?.() || {};
        if (current.currentClass && !current.currentDict) {
          const loaded = await workflow.locateAndSelectClass(current.currentClass, current.currentMethod, current.currentMeta);
          if (!loaded) {
            deps.setState?.({
              currentClass: null,
              currentMethod: null,
              currentProtocol: '-- all --',
            });
            await workflow.loadDictionaries();
            deps.setBrowserStatus?.('Ready');
            return;
          }
        } else {
          await workflow.loadDictionaries();
        }
        const refreshed = deps.getState?.() || {};
        deps.setBrowserStatus?.(refreshed.currentClass ? `Loaded ${refreshed.currentClass}` : 'Ready');
      } catch (error) {
        deps.setBrowserStatus?.(error.message, 'error');
        deps.setStatus?.(false, error.message);
      } finally {
        deps.markBrowserReady?.();
      }
    }

    return {
      ...workflow,
      bindToolbar,
      initialize,
      browseClassDefinition,
      persistAutoCommitFlag,
      applyMetaToggle,
    };
  }

  return {
    createClassBrowserWindowRuntime,
  };
});
