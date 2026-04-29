(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ObjectBrowserWindowRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function renderError(ibody, message, escHtml) {
    ibody.innerHTML = `<p style="color:#f38ba8;padding:8px">${escHtml(String(message || 'error'))}</p>`;
  }

  function createCachedLoader(cache, cacheKey, loader) {
    const existing = cache.get(cacheKey);
    if (existing) {
      if (Object.prototype.hasOwnProperty.call(existing, 'value')) return Promise.resolve(existing.value);
      return existing.promise;
    }
    const promise = Promise.resolve()
      .then(loader)
      .then(value => {
        cache.set(cacheKey, { value });
        return value;
      })
      .catch(error => {
        if (cache.get(cacheKey)?.promise === promise) cache.delete(cacheKey);
        throw error;
      });
    cache.set(cacheKey, { promise });
    return promise;
  }

  function createObjectBrowserWindowRuntime(deps = {}) {
    const methodBrowserCache = new Map();
    const inspectorTabCache = new Map();
    let inspectorRenderToken = 0;
    const state = () => deps.getState?.() || {};

    function mountShell(options = {}) {
      deps.body.style.minHeight = '0';
      deps.body.innerHTML = deps.buildObjectBrowserWindowHtml?.(deps.id, {
        compactMode: deps.compactMode,
      }) || '';
      deps.prepareTitlebar?.();
      const rootsUl = deps.body.querySelector?.(`#${deps.id}-roots`);
      deps.populateRootsList?.(rootsUl, deps.roots, (label, oop) => {
        options.onSelectRoot?.(label, oop);
      });
    }

    function updateTitlebar(obj) {
      deps.updateTitlebar?.(obj);
    }

    function renderBreadcrumb(onSelectIndex) {
      deps.renderBreadcrumb?.(
        deps.body.querySelector?.(`#${deps.id}-bc`),
        state().history || [],
        (index, item) => onSelectIndex?.(index, item),
      );
    }

    function getCodeTarget(obj = state().currentObjData) {
      return deps.model?.getCodeTarget?.(obj) || null;
    }

    function currentCodeBrowserTarget(selector = state().mbCurrentSelector) {
      const current = state();
      return deps.model?.currentCodeBrowserTarget?.(
        current.currentObjData,
        current.mbClassName,
        current.mbCurrentSelector,
        selector,
      ) || null;
    }

    function fetchMethodBrowserCached(name, keyParts, loader) {
      const cacheKey = `${name}:${JSON.stringify(keyParts || {})}`;
      return createCachedLoader(methodBrowserCache, cacheKey, loader);
    }

    function findSelectorCategory(data, selector) {
      if (!selector) return null;
      let fallback = null;
      Object.entries(data || {}).forEach(([category, selectors]) => {
        if (!Array.isArray(selectors) || !selectors.includes(selector)) return;
        if (category !== '(all Smalltalk)') fallback = category;
        else fallback = fallback || category;
      });
      return fallback;
    }

    function getCustomTab(tabId, obj = state().currentObjData) {
      return deps.model?.getCustomTab?.(obj?.customTabs || [], tabId) || null;
    }

    function getInspectorTabCaption(tabId, obj = state().currentObjData) {
      return deps.model?.getInspectorTabCaption?.(
        tabId,
        obj?.customTabs || [],
        deps.model?.BUILTIN_ITAB_CAPTIONS || {},
      ) || tabId;
    }

    function renderInspectorTabs(obj = state().currentObjData) {
      const itabs = deps.body.querySelector?.(`#${deps.id}-itabs`);
      const tabState = deps.model?.resolveInspectorTab?.(state().currentItab, obj) || {
        availableTabs: ['instvars'],
        resolvedTab: 'instvars',
        showTabs: false,
        showMethodBrowser: false,
      };
      deps.setState?.({ currentItab: tabState.resolvedTab });
      if (itabs) {
        itabs.innerHTML = deps.buildInspectorTabsHtml?.(
          tabState.availableTabs,
          tabState.resolvedTab,
          tabId => getInspectorTabCaption(tabId, obj),
          'control',
        ) || '';
      }
      return tabState;
    }

    function applyItabVisibility(obj = state().currentObjData, afterRender = null) {
      const mb = deps.body.querySelector?.(`#${deps.id}-mb`);
      const tabState = renderInspectorTabs(obj);
      if (mb) mb.classList.toggle('hidden', !tabState.showMethodBrowser);
      const itabs = deps.body.querySelector?.(`#${deps.id}-itabs`);
      if (itabs) itabs.style.display = tabState.showTabs ? 'flex' : 'none';
      afterRender?.(tabState);
      return tabState;
    }

    function normalizeObjectQuery(query) {
      return deps.model?.normalizeObjectQuery?.(query) || {};
    }

    function buildObjectIndexUrl(oop) {
      return deps.model?.buildObjectIndexUrl?.(oop, state().currentObjectQuery) || `/object/index/${oop}?depth=2`;
    }

    function inspectorCacheFor(oop) {
      let cache = inspectorTabCache.get(oop);
      if (!cache) {
        cache = new Map();
        inspectorTabCache.set(oop, cache);
      }
      return cache;
    }

    function clearInspectorTabCache(oop = state().currentOop) {
      if (oop === null || oop === undefined) return;
      inspectorTabCache.delete(oop);
    }

    function fetchInspectorTabData(oop, tabName, keyParts, loader) {
      const cache = inspectorCacheFor(oop);
      const cacheKey = `${tabName}:${JSON.stringify(keyParts || {})}`;
      return createCachedLoader(cache, cacheKey, loader);
    }

    function nextInspectorRenderToken() {
      inspectorRenderToken += 1;
      return inspectorRenderToken;
    }

    function isActiveInspectorRender(token, tabName, oop) {
      const current = state();
      return token === inspectorRenderToken && tabName === current.currentItab && oop === current.currentOop;
    }

    return {
      mountShell,
      updateTitlebar,
      renderBreadcrumb,
      getCodeTarget,
      currentCodeBrowserTarget,
      fetchMethodBrowserCached,
      findSelectorCategory,
      getCustomTab,
      getInspectorTabCaption,
      renderInspectorTabs,
      applyItabVisibility,
      normalizeObjectQuery,
      buildObjectIndexUrl,
      clearInspectorTabCache,
      fetchInspectorTabData,
      nextInspectorRenderToken,
      isActiveInspectorRender,
    };
  }

  async function loadObject(oop, label, options = {}, deps = {}) {
    const { query = null, preserveCurrentTab = false, keepInstPage = false } = options;
    const startState = deps.buildObjectLoadStartState(oop, query, { keepInstPage });
    deps.applyLoadStartState(startState);
    deps.onBeforeLoad?.(oop, label);
    try {
      const d = await deps.objectApi(deps.buildObjectIndexUrl(oop));
      if (!d.success) throw new Error(d.exception);
      deps.setLoadedObject?.(d.result);
      deps.onAfterLoad?.();
      const requestedTab = deps.chooseRequestedInspectorTab?.({
        preserveCurrentTab,
      });
      if (requestedTab && deps.activateItab?.(requestedTab)) {
        deps.clearPreferredInitialTab?.();
      } else {
        await deps.showInspectorTab?.();
      }
    } catch (error) {
      deps.onLoadError?.(error);
    }
  }

  async function showInspectorTab(deps = {}) {
    const {
      ibody,
      getState,
      nextInspectorRenderToken,
      getCustomTab,
      renderCustomTab,
      renderConstants,
      renderInstances,
      renderModules,
      renderControlPanel,
      fetchInspectorTabData,
      objectApi,
      isActiveInspectorRender,
      openCurrentCodeInClassBrowser,
      currentCodeBrowserTarget,
      document,
      escHtml,
    } = deps;
    const state = getState();
    if (!state.currentObjData) return;

    const tabName = state.currentItab;
    const oop = state.currentOop;
    const renderToken = nextInspectorRenderToken();
    ibody.className = 'inspector-body';
    ibody.style.overflow = 'auto';
    ibody.innerHTML = '';

    if (tabName === 'instvars') {
      ibody.appendChild(deps.renderCard(state.currentObjData));
      return;
    }

    const customTab = getCustomTab(tabName);
    if (customTab) {
      renderCustomTab(ibody, state.currentObjData, customTab);
      return;
    }

    if (tabName === 'constants') {
      await renderConstants(ibody, renderToken, oop);
      return;
    }

    if (tabName === 'hierarchy') {
      ibody.innerHTML = '<span class="spinner"></span>';
      try {
        const d = await fetchInspectorTabData(oop, 'hierarchy', {}, () => objectApi(`/object/hierarchy/${oop}`));
        if (!isActiveInspectorRender(renderToken, tabName, oop)) return;
        ibody.innerHTML = '';
        if (!d.success) throw new Error(d.exception);
        const ul = document.createElement('ul');
        ul.className = 'hierarchy-tree';
        (d.hierarchy || []).forEach((entry, index) => {
          const clsRef = entry?.class || (typeof entry === 'string' ? {inspection: entry, oop: null} : entry) || {inspection: ''};
          const clsName = clsRef.inspection || entry?.name || '';
          const dictionary = entry?.dictionary || '';
          const li = document.createElement('li');
          if (index > 0) {
            for (let j = 0; j < index - 1; j += 1) {
              const spacer = document.createElement('span');
              spacer.className = 'tree-indent';
              li.appendChild(spacer);
            }
            const connector = document.createElement('span');
            connector.className = 'tree-connector';
            li.appendChild(connector);
          }
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'tree-link';
          btn.textContent = clsName;
          btn.title = dictionary ? `Open ${clsName} from ${dictionary} in Class Browser` : `Open ${clsName} in Class Browser`;
          btn.addEventListener('click', () => deps.openClassBrowser(dictionary ? {dictionary, className: clsName, sourceWindowId: deps.id} : {className: clsName, sourceWindowId: deps.id}));
          li.appendChild(btn);
          if (dictionary) {
            const meta = document.createElement('span');
            meta.className = 'tree-meta';
            meta.textContent = dictionary;
            li.appendChild(meta);
          }
          ul.appendChild(li);
        });
        ibody.appendChild(ul);
      } catch (error) {
        renderError(ibody, error.message, escHtml);
      }
      return;
    }

    if (tabName === 'instances') {
      await renderInstances(ibody, renderToken, oop);
      return;
    }

    if (tabName === 'modules') {
      await renderModules(ibody, renderToken, oop);
      return;
    }

    if (tabName === 'stone-ver' || tabName === 'gem-ver') {
      const path = tabName === 'stone-ver' ? '/object/stone-version-report' : '/object/gem-version-report';
      ibody.innerHTML = '<span class="spinner"></span>';
      try {
        const d = await fetchInspectorTabData(oop, tabName, {}, () => objectApi(path));
        if (!isActiveInspectorRender(renderToken, tabName, oop)) return;
        ibody.innerHTML = '';
        if (!d.success) throw new Error(d.exception);
        ibody.appendChild(deps.makeTable(['Property', 'Value'], (d.report || []).map(row => [row.key, row.value])));
      } catch (error) {
        renderError(ibody, error.message, escHtml);
      }
      return;
    }

    if (tabName === 'control') {
      renderControlPanel(ibody);
      return;
    }

    if (tabName === 'code') {
      const wrap = document.createElement('div');
      wrap.className = 'obj-card';
      const intro = document.createElement('p');
      intro.style.cssText = 'color:#6c7086;padding:10px 10px 0;font-size:11px;line-height:1.5';
      const target = currentCodeBrowserTarget();
      const codeLabel = target
        ? `${target.className}${target.meta ? ' class' : ''}${state.mbCurrentSelector ? ` >> ${state.mbCurrentSelector}` : ''}`
        : 'the side method browser';
      intro.textContent = `Browsing ${codeLabel} in the panel on the right.`;
      wrap.appendChild(intro);
      const actions = document.createElement('div');
      actions.style.cssText = 'padding:0 10px 10px;display:flex;gap:8px;align-items:center';
      const openBtn = document.createElement('button');
      openBtn.className = 'btn';
      openBtn.textContent = 'Open in Class Browser';
      openBtn.disabled = !target;
      openBtn.addEventListener('click', () => openCurrentCodeInClassBrowser());
      actions.appendChild(openBtn);
      const hint = document.createElement('span');
      hint.style.cssText = 'font-size:10px;color:#6c7086';
      hint.textContent = 'Double-click a selector to jump into the full browser.';
      actions.appendChild(hint);
      wrap.appendChild(actions);
      ibody.appendChild(wrap);
    }
  }

  return {
    createObjectBrowserWindowRuntime,
    loadObject,
    showInspectorTab,
  };
});
