(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ClassBrowserDataModel = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function withOptionalDictionary(params, dictionary) {
    const next = {...(params || {})};
    if (dictionary) next.dictionary = dictionary;
    return next;
  }

  function buildClassSourceRequest(state = {}, selector = '') {
    const params = withOptionalDictionary({
      class: state.currentClass,
      selector,
      meta: state.currentMeta ? 1 : 0,
    }, state.currentDict || '');
    return {
      cacheKeyParts: {...params},
      params,
      sourceMode: selector ? 'method' : 'classDefinition',
      sourceLabel: selector
        ? (state.currentMeta ? `${state.currentClass} class >> ${selector}` : `${state.currentClass} >> ${selector}`)
        : (state.currentMeta ? `${state.currentClass} class` : state.currentClass),
    };
  }

  function buildMethodsRequest(state = {}) {
    const params = withOptionalDictionary({
      class: state.currentClass,
      protocol: state.currentProtocol,
      meta: state.currentMeta ? 1 : 0,
    }, state.currentDict || '');
    return {
      cacheKeyParts: {...params},
      params,
    };
  }

  function normalizeMethodsState(methods, currentMethod = null) {
    const items = Array.isArray(methods) ? methods.slice() : [];
    return {
      items,
      currentMethod: items.includes(currentMethod) ? currentMethod : null,
    };
  }

  function buildCategoriesRequest(state = {}) {
    const params = withOptionalDictionary({
      class: state.currentClass,
      meta: state.currentMeta ? 1 : 0,
    }, state.currentDict || '');
    return {
      cacheKeyParts: {...params},
      params,
    };
  }

  function normalizeProtocolsState(categories, currentProtocol = '-- all --') {
    const items = Array.isArray(categories) && categories.length ? categories.slice() : ['-- all --'];
    return {
      items,
      currentProtocol: items.includes(currentProtocol) ? currentProtocol : '-- all --',
    };
  }

  function buildClassesRequest(state = {}) {
    const params = {
      dictionary: state.currentDict,
    };
    return {
      cacheKeyParts: {...params},
      params,
    };
  }

  function normalizeClassesState(classes, currentClass = null) {
    const items = Array.isArray(classes) ? classes.slice() : [];
    return {
      items,
      currentClass: items.includes(currentClass) ? currentClass : (items[0] || null),
    };
  }

  function buildDictionariesRequest() {
    return {
      cacheKeyParts: {},
      params: {},
    };
  }

  function normalizeDictionariesState(dictionaries, currentDict = null) {
    const items = Array.isArray(dictionaries) ? dictionaries.slice() : [];
    return {
      items,
      currentDict: items.includes(currentDict) ? currentDict : (items[0] || null),
    };
  }

  function buildClassLocationRequest(className) {
    return {
      cacheKeyParts: {class: className},
      params: {class: className},
    };
  }

  function normalizeClassLocationMatches(payload = {}, className = '') {
    if (Array.isArray(payload.matches)) return payload.matches.slice();
    if (payload.dictionary) {
      return [{className, dictionary: payload.dictionary}];
    }
    return [];
  }

  function buildLocateClassState({className, methodName = null, meta = false, dictionary = ''} = {}) {
    return {
      currentMeta: !!meta,
      currentDict: dictionary || null,
      currentClass: className || null,
      currentProtocol: '-- all --',
      currentMethod: methodName || null,
    };
  }

  function snapshotBrowserSelection(state = {}) {
    return {
      dict: state.currentDict || null,
      className: state.currentClass || null,
      protocol: state.currentProtocol || '-- all --',
      method: state.currentMethod || null,
      meta: !!state.currentMeta,
    };
  }

  function ownerLabel(state = {}) {
    if (!state.currentClass) return '';
    return state.currentMeta ? `${state.currentClass} class` : state.currentClass;
  }

  function buildCategoryQueryResults(methods, state = {}) {
    const labelOwner = ownerLabel(state);
    const selectors = Array.isArray(methods) ? methods.slice() : [];
    return selectors.map(selector => ({
      label: `${labelOwner}>>${selector}`,
      className: state.currentClass,
      selector,
      meta: !!state.currentMeta,
      dictionary: state.currentDict || '',
    }));
  }

  function buildSelectorQueryRequest(state = {}, mode, selector, scope = 'all') {
    const requestedScope = String(scope || 'all');
    if (requestedScope !== 'all' && !state.currentClass) {
      return {error: 'Select a class first for hierarchy queries'};
    }
    const resolvedMode = requestedScope === 'all'
      ? mode
      : (mode === 'implementors' ? 'hierarchyImplementors' : 'hierarchySenders');
    return {
      mode: resolvedMode,
      scope: requestedScope,
      params: {
        selector,
        mode: resolvedMode,
        rootClassName: state.currentClass || '',
        rootDictionary: state.currentDict || '',
        meta: state.currentMeta ? 1 : 0,
        hierarchyScope: requestedScope,
      },
    };
  }

  function buildReferenceQueryRequest(state = {}, selector) {
    return {
      params: {
        selector,
        mode: 'references',
        rootClassName: state.currentClass || '',
        rootDictionary: state.currentDict || '',
        meta: state.currentMeta ? 1 : 0,
      },
    };
  }

  function buildMethodTextQueryRequest(state = {}, selector) {
    return {
      params: {
        selector,
        mode: 'methodText',
        rootClassName: state.currentClass || '',
        rootDictionary: state.currentDict || '',
        meta: state.currentMeta ? 1 : 0,
      },
    };
  }

  function buildHierarchyRequest(state = {}) {
    const params = withOptionalDictionary({
      class: state.currentClass,
    }, state.currentDict || '');
    return {
      cacheKeyParts: {...params},
      params,
    };
  }

  function buildVersionsRequest(state = {}) {
    const params = withOptionalDictionary({
      class: state.currentClass,
      selector: state.currentMethod,
      meta: state.currentMeta ? 1 : 0,
    }, state.currentDict || '');
    return {
      cacheKeyParts: {...params},
      params,
    };
  }

  function buildFileOutRequest(mode, state = {}) {
    const params = {mode};
    if (mode === 'method') {
      if (!state.currentClass || !state.currentMethod) return {error: 'Select a method first'};
      if (state.currentDict) params.dictionary = state.currentDict;
      params.class = state.currentClass;
      params.selector = state.currentMethod;
      params.meta = state.currentMeta ? 1 : 0;
      return {params};
    }
    if (String(mode || '').startsWith('class')) {
      if (!state.currentClass) return {error: 'Select a class first'};
      if (state.currentDict) params.dictionary = state.currentDict;
      params.class = state.currentClass;
      params.meta = state.currentMeta ? 1 : 0;
      return {params};
    }
    if (!state.currentDict) return {error: 'Select a dictionary first'};
    params.dictionary = state.currentDict;
    return {params};
  }

  function buildCompileRequest(state = {}, source = '', sourceKind = 'method') {
    return {
      className: state.currentClass,
      dictionary: state.currentDict || '',
      category: state.currentProtocol === '-- all --' ? 'as yet unclassified' : state.currentProtocol,
      selector: state.currentMethod || '',
      source,
      meta: !!state.currentMeta,
      sourceKind,
    };
  }

  function applyCompileResponse(state = {}, response = {}) {
    const compiledSelector = String(response.selector || state.currentMethod || '').trim();
    const compiledCategory = String(response.category || state.currentProtocol || '').trim();
    const nextState = {
      currentProtocol: compiledCategory || state.currentProtocol || '-- all --',
      currentMethod: compiledSelector || null,
      currentSourceMode: 'method',
    };
    const compiledLabel = compiledSelector
      ? `${state.currentClass}${state.currentMeta ? ' class' : ''} >> ${compiledSelector}`
      : `${state.currentClass}${state.currentMeta ? ' class' : ''}`;
    const renameNote = response.previousSelector && compiledSelector && response.previousSelector !== compiledSelector
      ? ` (${response.previousSelector} → ${compiledSelector})`
      : '';
    return {
      nextState,
      compiledLabel,
      compileStatus: `${response.result || 'Compiled'}${renameNote}`,
    };
  }

  function buildTransactionActionSpec(action) {
    return {
      commit: {
        path: '/transaction/commit',
        busyMessage: 'Committing…',
        successMessage: 'Transaction committed',
      },
      abort: {
        path: '/transaction/abort',
        busyMessage: 'Aborting…',
        successMessage: 'Transaction aborted',
      },
      continue: {
        path: '/transaction/continue',
        busyMessage: 'Continuing…',
        successMessage: 'Transaction continued',
      },
    }[action] || null;
  }

  return {
    buildClassSourceRequest,
    buildMethodsRequest,
    normalizeMethodsState,
    buildCategoriesRequest,
    normalizeProtocolsState,
    buildClassesRequest,
    normalizeClassesState,
    buildDictionariesRequest,
    normalizeDictionariesState,
    buildClassLocationRequest,
    normalizeClassLocationMatches,
    buildLocateClassState,
    snapshotBrowserSelection,
    ownerLabel,
    buildCategoryQueryResults,
    buildSelectorQueryRequest,
    buildReferenceQueryRequest,
    buildMethodTextQueryRequest,
    buildHierarchyRequest,
    buildVersionsRequest,
    buildFileOutRequest,
    buildCompileRequest,
    applyCompileResponse,
    buildTransactionActionSpec,
  };
});
