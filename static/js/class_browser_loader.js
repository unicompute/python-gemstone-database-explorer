(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ClassBrowserLoader = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createClassBrowserLoaderWorkflow(deps = {}) {
    const state = () => deps.getState();
    const setState = patch => deps.setState(patch || {});
    const runBrowserTask = deps.runBrowserTask || (task => Promise.resolve().then(task));
    let activeLoadToken = 0;

    function beginLoadToken() {
      activeLoadToken += 1;
      return activeLoadToken;
    }

    function isCurrentLoadToken(token) {
      return token === activeLoadToken;
    }

    async function fetchCurrentMethods() {
      const current = state();
      const request = deps.buildMethodsRequest({
        currentDict: current.currentDict,
        currentClass: current.currentClass,
        currentProtocol: current.currentProtocol,
        currentMeta: current.currentMeta,
      });
      return deps.fetchBrowserCached('methods', request.cacheKeyParts, () =>
        deps.browserApiWithParams('/class-browser/methods', request.params)
      );
    }

    async function loadMethods(token = beginLoadToken()) {
      return runBrowserTask(async () => {
        const current = state();
        if (!current.currentClass) {
          deps.els.methods.innerHTML = '<div class="cb-empty">(select a class)</div>';
          deps.clearSource();
          deps.syncBrowserActions();
          return;
        }
        deps.showLoading(deps.els.methods);
        try {
          const d = await fetchCurrentMethods();
          if (!isCurrentLoadToken(token)) return;
          if (!d.success) throw new Error(d.exception);
          const normalized = deps.normalizeMethodsState(d.methods || [], state().currentMethod);
          setState({ currentMethod: normalized.currentMethod });
          const selectMethod = method => runBrowserTask(async () => {
            const nextToken = beginLoadToken();
            setState({ currentMethod: method });
            deps.renderList(deps.els.methods, normalized.items, state().currentMethod, selectMethod);
            await deps.loadClassSource(state().currentMethod, {
              token: nextToken,
              isTokenCurrent: isCurrentLoadToken,
              stateSnapshot: {
                currentDict: state().currentDict,
                currentClass: state().currentClass,
                currentMeta: state().currentMeta,
              },
            });
            if (!isCurrentLoadToken(nextToken)) return;
          });
          deps.renderList(deps.els.methods, normalized.items, state().currentMethod, selectMethod);
          await deps.loadClassSource(state().currentMethod || '', {
            token,
            isTokenCurrent: isCurrentLoadToken,
            stateSnapshot: {
              currentDict: state().currentDict,
              currentClass: state().currentClass,
              currentMeta: state().currentMeta,
            },
          });
          if (!isCurrentLoadToken(token)) return;
        } catch (error) {
          if (!isCurrentLoadToken(token)) return;
          deps.els.methods.innerHTML = `<div class="cb-empty" style="color:#f38ba8">${deps.escHtml(error.message)}</div>`;
          deps.setBrowserStatus(error.message, 'error');
          deps.setStatus(false, error.message);
        }
        if (!isCurrentLoadToken(token)) return;
        deps.syncBrowserActions();
      });
    }

    async function loadProtocols(token = beginLoadToken()) {
      return runBrowserTask(async () => {
        const current = state();
        if (!current.currentClass) {
          deps.els.protocols.innerHTML = '<div class="cb-empty">(select a class)</div>';
          deps.els.methods.innerHTML = '<div class="cb-empty">(select a class)</div>';
          deps.clearSource();
          deps.syncBrowserActions();
          return;
        }
        deps.showLoading(deps.els.protocols);
        try {
          const request = deps.buildCategoriesRequest({
            currentDict: current.currentDict,
            currentClass: current.currentClass,
            currentMeta: current.currentMeta,
          });
          const d = await deps.fetchBrowserCached('categories', request.cacheKeyParts, () =>
            deps.browserApiWithParams('/class-browser/categories', request.params)
          );
          if (!isCurrentLoadToken(token)) return;
          if (!d.success) throw new Error(d.exception);
          const normalized = deps.normalizeProtocolsState(d.categories, state().currentProtocol);
          setState({ currentProtocol: normalized.currentProtocol });
          const selectProtocol = protocol => runBrowserTask(async () => {
            const nextToken = beginLoadToken();
            setState({ currentProtocol: protocol, currentMethod: null });
            deps.renderList(deps.els.protocols, normalized.items, state().currentProtocol, selectProtocol);
            await loadMethods(nextToken);
          });
          deps.renderList(deps.els.protocols, normalized.items, state().currentProtocol, selectProtocol);
          await loadMethods(token);
        } catch (error) {
          if (!isCurrentLoadToken(token)) return;
          deps.els.protocols.innerHTML = `<div class="cb-empty" style="color:#f38ba8">${deps.escHtml(error.message)}</div>`;
          deps.setBrowserStatus(error.message, 'error');
          deps.setStatus(false, error.message);
        }
        if (!isCurrentLoadToken(token)) return;
        deps.syncBrowserActions();
      });
    }

    async function loadClasses(token = beginLoadToken()) {
      return runBrowserTask(async () => {
        const current = state();
        if (!current.currentDict) {
          deps.els.classes.innerHTML = '<div class="cb-empty">(select a dictionary)</div>';
          deps.els.protocols.innerHTML = '<div class="cb-empty">(select a class)</div>';
          deps.els.methods.innerHTML = '<div class="cb-empty">(select a class)</div>';
          deps.clearSource();
          deps.syncBrowserActions();
          return;
        }
        deps.showLoading(deps.els.classes);
        try {
          const request = deps.buildClassesRequest({ currentDict: current.currentDict });
          const d = await deps.fetchBrowserCached('classes', request.cacheKeyParts, () =>
            deps.browserApiWithParams('/class-browser/classes', request.params)
          );
          if (!isCurrentLoadToken(token)) return;
          if (!d.success) throw new Error(d.exception);
          const normalized = deps.normalizeClassesState(d.classes || [], state().currentClass);
          setState({ currentClass: normalized.currentClass });
          const selectClass = className => runBrowserTask(async () => {
            const nextToken = beginLoadToken();
            setState({
              currentClass: className,
              currentProtocol: '-- all --',
              currentMethod: null,
            });
            deps.renderList(deps.els.classes, normalized.items, state().currentClass, selectClass);
            await loadProtocols(nextToken);
          });
          deps.renderList(deps.els.classes, normalized.items, state().currentClass, selectClass);
          await loadProtocols(token);
        } catch (error) {
          if (!isCurrentLoadToken(token)) return;
          deps.els.classes.innerHTML = `<div class="cb-empty" style="color:#f38ba8">${deps.escHtml(error.message)}</div>`;
          deps.setBrowserStatus(error.message, 'error');
          deps.setStatus(false, error.message);
        }
        if (!isCurrentLoadToken(token)) return;
        deps.syncBrowserActions();
      });
    }

    async function loadDictionaries(token = beginLoadToken()) {
      return runBrowserTask(async () => {
        deps.showLoading(deps.els.dicts);
        try {
          const request = deps.buildDictionariesRequest();
          const d = await deps.fetchBrowserCached('dictionaries', request.cacheKeyParts, () => deps.browserApi('/class-browser/dictionaries'));
          if (!isCurrentLoadToken(token)) return;
          if (!d.success) throw new Error(d.exception);
          const normalized = deps.normalizeDictionariesState(d.dictionaries || [], state().currentDict);
          setState({ currentDict: normalized.currentDict });
          const selectDictionary = dictName => runBrowserTask(async () => {
            const nextToken = beginLoadToken();
            setState({
              currentDict: dictName,
              currentClass: null,
              currentProtocol: '-- all --',
              currentMethod: null,
            });
            deps.renderList(deps.els.dicts, normalized.items, state().currentDict, selectDictionary);
            await loadClasses(nextToken);
          });
          deps.renderList(deps.els.dicts, normalized.items, state().currentDict, selectDictionary);
          await loadClasses(token);
        } catch (error) {
          if (!isCurrentLoadToken(token)) return;
          deps.els.dicts.innerHTML = `<div class="cb-empty" style="color:#f38ba8">${deps.escHtml(error.message)}</div>`;
          deps.setBrowserStatus(error.message, 'error');
          deps.setStatus(false, error.message);
        }
        if (!isCurrentLoadToken(token)) return;
        deps.syncBrowserActions();
      });
    }

    async function chooseClassMatch(className, matches) {
      const options = (matches || []).map(match => ({
        value: match.dictionary,
        label: `${match.dictionary} :: ${className}`,
      }));
      const selected = await deps.requestSelectModal(
        'Select Class Dictionary',
        `Class "${className}" was found in multiple dictionaries`,
        options,
        options[0]?.value || '',
        { okLabel: 'Load' }
      );
      return (matches || []).find(match => match.dictionary === selected) || null;
    }

    async function locateAndSelectClass(className, methodName = null, meta = state().currentMeta, dictionary = null) {
      return runBrowserTask(async () => {
        const token = beginLoadToken();
        const nextMeta = !!meta;
        let nextDict = dictionary || '';
        if (!nextDict) {
          const request = deps.buildClassLocationRequest(className);
          const d = await deps.fetchBrowserCached('class-location', request.cacheKeyParts, () =>
            deps.browserApiWithParams('/class-browser/class-location', request.params)
          );
          if (!isCurrentLoadToken(token)) return false;
          if (!d.success) throw new Error(d.exception);
          const matches = deps.normalizeClassLocationMatches(d, className);
          if (!matches.length) throw new Error(`Class not found: ${className}`);
          if (matches.length === 1) {
            nextDict = matches[0].dictionary;
          } else {
            const chosen = await chooseClassMatch(className, matches);
            if (!chosen) return false;
            nextDict = chosen.dictionary;
          }
        }
        const nextState = deps.buildLocateClassState({
          className,
          methodName,
          meta: nextMeta,
          dictionary: nextDict,
        });
        setState(nextState);
        deps.setMetaChecked(nextState.currentMeta);
        deps.ensureFilterShowsValue(deps.els.dictFilter, nextState.currentDict);
        deps.ensureFilterShowsValue(deps.els.classFilter, nextState.currentClass);
        deps.ensureFilterShowsValue(deps.els.methodFilter, nextState.currentMethod);
        await loadDictionaries(token);
        if (!isCurrentLoadToken(token)) return false;
        return true;
      });
    }

    async function loadMethodReferenceIntoBrowser(parsed) {
      return runBrowserTask(async () => {
        await locateAndSelectClass(parsed.className, parsed.selector, parsed.meta, parsed.dictionary || null);
        deps.setBrowserStatus(`Loaded ${parsed.meta ? `${parsed.className} class >> ${parsed.selector}` : `${parsed.className} >> ${parsed.selector}`}`, 'ok');
        deps.focusWindow();
      });
    }

    async function loadHierarchyEntryIntoBrowser(entry, meta = state().currentMeta) {
      return runBrowserTask(async () => {
        await locateAndSelectClass(entry.className, null, meta, entry.dictionary || null);
        deps.setBrowserStatus(`Loaded ${meta ? `${entry.className} class` : entry.className}`, 'ok');
        deps.focusWindow();
      });
    }

    function loadVersionIntoBrowser(version, context = {}) {
      if (!version) return;
      const current = state();
      const noteClass = context.className || current.currentClass || '';
      const noteMethod = context.method || current.currentMethod || '';
      const noteMeta = typeof context.meta === 'boolean' ? context.meta : current.currentMeta;
      deps.els.source.value = version.source || '';
      const owner = noteMeta ? `${noteClass} class` : noteClass;
      const sourceLabel = noteMethod ? `${owner} >> ${noteMethod}` : owner;
      deps.setSourceNote(sourceLabel ? `${sourceLabel} (${version.label})` : (version.label || ''));
      deps.setBrowserStatus(`Loaded ${version.label} into editor`, 'ok');
      deps.focusWindow();
    }

    async function refreshBrowser() {
      return runBrowserTask(async () => {
        const token = beginLoadToken();
        const saved = deps.snapshotBrowserSelection(state());
        setState({
          currentDict: saved.dict,
          currentClass: saved.className,
          currentProtocol: saved.protocol,
          currentMethod: saved.method,
          currentMeta: saved.meta,
        });
        deps.setMetaChecked(saved.meta);
        deps.clearBrowserCache();
        await loadDictionaries(token);
      });
    }

    return {
      fetchCurrentMethods,
      loadMethods,
      loadProtocols,
      loadClasses,
      loadDictionaries,
      chooseClassMatch,
      locateAndSelectClass,
      loadMethodReferenceIntoBrowser,
      loadHierarchyEntryIntoBrowser,
      loadVersionIntoBrowser,
      refreshBrowser,
    };
  }

  return {
    createClassBrowserLoaderWorkflow,
  };
});
