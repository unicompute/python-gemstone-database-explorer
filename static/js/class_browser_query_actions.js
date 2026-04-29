(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ClassBrowserQueryActions = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createClassBrowserQueryActions(deps = {}) {
    const state = () => deps.getState();

    async function browseCategory() {
      const current = state();
      if (!current.currentClass || !current.currentProtocol || current.currentProtocol === '-- all --') {
        deps.setBrowserStatus('Select a category first', 'error');
        return;
      }
      const labelOwner = deps.ownerLabel({
        currentClass: current.currentClass,
        currentMeta: current.currentMeta,
      });
      deps.setBrowserStatus(`Opening ${current.currentProtocol}…`);
      try {
        const d = await deps.fetchCurrentMethods();
        if (!d.success) throw new Error(d.exception);
        const results = deps.buildCategoryQueryResults(d.methods || [], {
          currentClass: current.currentClass,
          currentMeta: current.currentMeta,
          currentDict: current.currentDict,
        });
        if (!results.length) {
          deps.setBrowserStatus(`No methods in ${current.currentProtocol}`, 'error');
          return;
        }
        deps.openMethodQueryWindow(`Category ${current.currentProtocol} in ${labelOwner} (${results.length})`, results, {
          sourceWindowId: deps.id,
          loadLabel: 'Load Into Browser',
          sessionChannel: deps.sessionChannel,
          onLoadResult: deps.loadMethodReferenceIntoBrowser,
        });
        deps.setBrowserStatus(`${results.length} methods in ${current.currentProtocol}`, 'ok');
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    function browseMethod() {
      const current = state();
      if (!current.currentClass || !current.currentMethod) {
        deps.setBrowserStatus('Select a method first', 'error');
        return;
      }
      deps.openClassBrowser({
        dictionary: current.currentDict || null,
        className: current.currentClass,
        method: current.currentMethod,
        meta: current.currentMeta,
        sourceWindowId: deps.id,
      });
      deps.setBrowserStatus(
        `Opened ${current.currentMeta ? `${current.currentClass} class >> ${current.currentMethod}` : `${current.currentClass} >> ${current.currentMethod}`}`,
        'ok'
      );
    }

    async function runSelectorQuery(mode, promptTitle, forcePrompt = false) {
      const current = state();
      let selector = !forcePrompt && current.currentMethod ? current.currentMethod : '';
      if (!selector) selector = await deps.requestTextModal(promptTitle.replace(/:$/, ''), 'Selector', current.currentMethod || '', 'printString');
      selector = String(selector || '').trim();
      if (!selector) return;
      const query = deps.buildSelectorQueryRequest(current, mode, selector, deps.els.queryScope?.value || 'all');
      if (query.error) {
        deps.setBrowserStatus(query.error, 'error');
        return;
      }
      deps.setBrowserStatus('Searching…');
      try {
        const d = await deps.browserApiWithParams('/class-browser/query', query.params);
        if (!d.success) throw new Error(d.exception);
        if (!d.results.length) {
          deps.setBrowserStatus('No matches found');
          return;
        }
        const titlePrefix = query.scope === 'all'
          ? promptTitle.replace(/:$/, '')
          : `${promptTitle.replace(/:$/, '')} (${deps.hierarchyScopeLabel(query.scope)})`;
        deps.openMethodQueryWindow(`${titlePrefix} (${d.results.length})`, d.results, {
          sourceWindowId: deps.id,
          loadLabel: 'Load Into Browser',
          sessionChannel: deps.sessionChannel,
          onLoadResult: deps.loadMethodReferenceIntoBrowser,
        });
        deps.setBrowserStatus(`${d.results.length} matches`, 'ok');
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function runReferenceQuery() {
      const current = state();
      let selector = current.currentMethod || current.currentClass || '';
      if (!selector) selector = await deps.requestTextModal('References', 'Class or variable name', current.currentClass || '', 'Object');
      selector = String(selector || '').trim();
      if (!selector) return;
      deps.setBrowserStatus('Searching…');
      try {
        const d = await deps.browserApiWithParams('/class-browser/query', deps.buildReferenceQueryRequest(current, selector).params);
        if (!d.success) throw new Error(d.exception);
        if (!d.results.length) {
          deps.setBrowserStatus('No matches found');
          return;
        }
        deps.openMethodQueryWindow(`References to ${selector} (${d.results.length})`, d.results, {
          sourceWindowId: deps.id,
          loadLabel: 'Load Into Browser',
          sessionChannel: deps.sessionChannel,
          onLoadResult: deps.loadMethodReferenceIntoBrowser,
        });
        deps.setBrowserStatus(`${d.results.length} matches`, 'ok');
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function runMethodTextQuery() {
      const current = state();
      const selector = await deps.requestTextModal('Methods With String Matching', 'Source substring', '', 'printString');
      if (!selector) return;
      const request = deps.buildMethodTextQueryRequest(current, selector);
      deps.setBrowserStatus('Searching…');
      try {
        const d = await deps.browserApiWithParams('/class-browser/query', request.params);
        if (!d.success) throw new Error(d.exception);
        if (!d.results.length) {
          deps.setBrowserStatus('No matches found');
          return;
        }
        deps.openMethodQueryWindow(`Methods with "${selector}" (${d.results.length})`, d.results, {
          sourceWindowId: deps.id,
          loadLabel: 'Load Into Browser',
          sessionChannel: deps.sessionChannel,
          onLoadResult: deps.loadMethodReferenceIntoBrowser,
        });
        deps.setBrowserStatus(`${d.results.length} matches`, 'ok');
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function showHierarchy() {
      const current = state();
      if (!current.currentClass) {
        deps.setBrowserStatus('Select a class first', 'error');
        return;
      }
      const request = deps.buildHierarchyRequest(current);
      try {
        const d = await deps.fetchBrowserCached('hierarchy', request.cacheKeyParts, () =>
          deps.browserApiWithParams('/class-browser/hierarchy', request.params)
        );
        if (!d.success) throw new Error(d.exception);
        deps.openHierarchyWindow(`${current.currentClass} Hierarchy`, d.hierarchy || [], {
          sourceWindowId: deps.id,
          loadLabel: 'Load Into Browser',
          sessionChannel: deps.sessionChannel,
          meta: current.currentMeta,
          onLoadClass: entry => deps.loadHierarchyEntryIntoBrowser(entry, current.currentMeta),
        });
        deps.setBrowserStatus('Hierarchy loaded', 'ok');
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function showVersions() {
      const current = state();
      if (!current.currentClass || !current.currentMethod) {
        deps.setBrowserStatus('Select a method first', 'error');
        return;
      }
      const request = deps.buildVersionsRequest(current);
      try {
        const d = await deps.fetchBrowserCached('versions', request.cacheKeyParts, () =>
          deps.browserApiWithParams('/class-browser/versions', request.params)
        );
        if (!d.success) throw new Error(d.exception);
        if (!d.versions.length) {
          deps.setBrowserStatus('No versions available');
          return;
        }
        deps.openVersionsWindow(`${current.currentClass} >> ${current.currentMethod} Versions`, d.versions, {
          sourceWindowId: deps.id,
          loadLabel: 'Load Into Browser',
          sessionChannel: deps.sessionChannel,
          versionContext: {
            className: current.currentClass,
            method: current.currentMethod,
            meta: current.currentMeta,
            dictionary: current.currentDict || '',
          },
          onLoadVersion(version) {
            deps.loadVersionIntoBrowser(version, {
              className: current.currentClass,
              method: current.currentMethod,
              meta: current.currentMeta,
              dictionary: current.currentDict || '',
            });
          },
        });
        deps.setBrowserStatus(`${d.versions.length} versions`, 'ok');
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function fileOut() {
      const current = state();
      const mode = deps.els.fileOutMode?.value || 'class';
      const request = deps.buildFileOutRequest(mode, current);
      if (request.error) {
        deps.setBrowserStatus(request.error, 'error');
        return;
      }
      deps.setBrowserStatus('Exporting…');
      try {
        const d = await deps.browserApiWithParams('/class-browser/file-out', request.params);
        if (!d.success) throw new Error(d.exception);
        deps.downloadTextFile(d.filename || 'export.st', d.source || '');
        deps.setBrowserStatus(`Exported ${d.filename || 'export.st'}`, 'ok');
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function findDictionary() {
      const current = state();
      const rawName = await deps.requestTextModal('Find Dictionary', 'Dictionary name', current.currentDict || '', 'Globals');
      const name = String(rawName || '').trim();
      if (!name) return;
      try {
        const d = await deps.fetchBrowserCached('dictionaries', {}, () => deps.browserApi('/class-browser/dictionaries'));
        if (!d.success) throw new Error(d.exception);
        const dictionaries = Array.isArray(d.dictionaries) ? d.dictionaries : [];
        const exact = dictionaries.find(item => String(item).toLowerCase() === name.toLowerCase());
        if (!exact) {
          deps.setBrowserStatus(`Dictionary not found: ${name}`, 'error');
          return;
        }
        deps.setState({
          currentDict: exact,
          currentClass: null,
          currentProtocol: '-- all --',
          currentMethod: null,
          currentSourceMode: 'classDefinition',
        });
        deps.ensureFilterShowsValue(deps.els.dictFilter, exact);
        await deps.loadDictionaries();
        deps.focusPaneList?.('dicts');
        deps.setBrowserStatus(`Selected ${exact}`, 'ok');
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function inspectTarget(mode) {
      const current = state();
      try {
        const d = await deps.browserApiPost('/class-browser/inspect-target', {
          mode,
          dictionary: current.currentDict || '',
          className: current.currentClass || '',
          selector: current.currentMethod || '',
          meta: current.currentMeta,
        });
        if (!d.success) throw new Error(d.exception || 'Inspect failed');
        deps.openLinkedObjectWindow({
          oop: d.oop,
          text: d.label || current.currentClass || current.currentDict || 'object',
          sourceWinId: deps.id,
        });
        deps.setBrowserStatus(`Opened ${d.label || 'inspector'}`, 'ok');
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    return {
      browseCategory,
      browseMethod,
      runSelectorQuery,
      runReferenceQuery,
      runMethodTextQuery,
      showHierarchy,
      showVersions,
      fileOut,
      findDictionary,
      inspectTarget,
    };
  }

  return {
    createClassBrowserQueryActions,
  };
});
