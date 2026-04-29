(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ClassBrowserShellRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createClassBrowserShellRuntime(deps = {}) {
    const state = () => deps.getState?.() || {};
    const setState = patch => deps.setState?.(patch || {});
    const browserCache = new Map();
    const listStates = {
      dicts: {container: deps.els?.dicts, filterInput: deps.els?.dictFilter, items: [], active: null, onSelect: null},
      classes: {container: deps.els?.classes, filterInput: deps.els?.classFilter, items: [], active: null, onSelect: null},
      protocols: {container: deps.els?.protocols, filterInput: deps.els?.protocolFilter, items: [], active: null, onSelect: null},
      methods: {container: deps.els?.methods, filterInput: deps.els?.methodFilter, items: [], active: null, onSelect: null},
    };
    const listStateByContainer = new Map(
      Object.values(listStates)
        .filter(each => each.container)
        .map(each => [each.container, each]),
    );
    const paneOrder = Array.isArray(deps.paneOrder) ? deps.paneOrder.slice() : ['dicts', 'classes', 'protocols', 'methods'];
    const paneMinWidths = Array.isArray(deps.paneMinWidths) ? deps.paneMinWidths.slice() : [120, 160, 140, 180];
    const defaultPaneWidths = Array.isArray(deps.defaultPaneWidths) ? deps.defaultPaneWidths.slice() : [160, 220, 180, 220];
    let paneWidths = defaultPaneWidths.slice();
    let activePaneKey = String(deps.initialActivePaneKey || paneOrder[0] || 'dicts');
    const schedule = typeof deps.window?.requestAnimationFrame === 'function'
      ? callback => deps.window.requestAnimationFrame(callback)
      : callback => callback();

    function syncWindowState() {
      const current = state();
      deps.upsertWindowState?.(deps.id, {
        kind: 'class-browser',
        dictionary: current.currentDict || '',
        className: current.currentClass || '',
        protocol: current.currentProtocol || '-- all --',
        method: current.currentMethod || '',
        meta: !!current.currentMeta,
        sourceWindowId: deps.getSourceWindowId?.() || null,
        sessionChannel: deps.sessionChannel || '',
      });
    }

    function setBrowserStatus(message, tone = '') {
      if (deps.els?.status) {
        deps.els.status.textContent = message || '';
        deps.els.status.className = 'cb-status' + (tone ? ` ${tone}` : '');
      }
    }

    function setSourceNote(text) {
      if (deps.els?.sourceNote) deps.els.sourceNote.textContent = text || '';
    }

    function loadStoredAutoCommitEnabled() {
      try {
        return localStorage.getItem(deps.autoCommitStorageKey) === '1';
      } catch (_) {
        return false;
      }
    }

    function storeAutoCommitEnabledFlag(value) {
      if (deps.els?.autoCommit) deps.els.autoCommit.checked = !!value;
      try {
        localStorage.setItem(deps.autoCommitStorageKey, value ? '1' : '0');
      } catch (_) {
        // ignore storage failures
      }
    }

    function readAutoCommitEnabled() {
      return !!deps.els?.autoCommit?.checked;
    }

    function loadStoredPaneWidths() {
      try {
        const raw = localStorage.getItem(deps.paneWidthStorageKey);
        return deps.parseStoredPaneWidths(raw, {defaultWidths: defaultPaneWidths, minWidths: paneMinWidths});
      } catch (_) {
        return defaultPaneWidths.slice();
      }
    }

    function setPaneWidths(nextWidths) {
      if (!Array.isArray(nextWidths)) return paneWidths.slice();
      paneWidths = nextWidths.slice();
      return paneWidths.slice();
    }

    function applyPaneWidths() {
      paneWidths = deps.clampPaneWidths(Array.isArray(paneWidths) ? paneWidths : defaultPaneWidths.slice());
      paneWidths.forEach((width, index) => {
        deps.els?.lists?.style?.setProperty?.(`--cb-col-${index + 1}`, `${width}px`);
      });
      return paneWidths.slice();
    }

    function persistPaneWidths() {
      try {
        localStorage.setItem(deps.paneWidthStorageKey, JSON.stringify(paneWidths));
      } catch (_) {
        // ignore storage failures
      }
    }

    function initPaneSplitters() {
      deps.els?.lists?.parentElement?.querySelectorAll?.('.cb-splitter')?.forEach?.((splitter, index) => {
        splitter.addEventListener('pointerdown', event => {
          event.preventDefault();
          const startX = event.clientX;
          const leftIndex = index;
          const rightIndex = index + 1;
          const startLeft = paneWidths[leftIndex];
          const startRight = paneWidths[rightIndex];
          const total = startLeft + startRight;
          splitter.classList.add('is-active');
          if (deps.document?.body?.style) deps.document.body.style.userSelect = 'none';

          const onMove = moveEvent => {
            const delta = moveEvent.clientX - startX;
            const minLeft = paneMinWidths[leftIndex];
            const minRight = paneMinWidths[rightIndex];
            const nextLeft = Math.min(total - minRight, Math.max(minLeft, startLeft + delta));
            paneWidths[leftIndex] = Math.round(nextLeft);
            paneWidths[rightIndex] = Math.round(total - nextLeft);
            applyPaneWidths();
          };
          const onUp = () => {
            deps.window?.removeEventListener?.('pointermove', onMove);
            deps.window?.removeEventListener?.('pointerup', onUp);
            deps.window?.removeEventListener?.('pointercancel', onUp);
            if (deps.document?.body?.style) deps.document.body.style.userSelect = '';
            splitter.classList.remove('is-active');
            persistPaneWidths();
          };

          deps.window?.addEventListener?.('pointermove', onMove);
          deps.window?.addEventListener?.('pointerup', onUp);
          deps.window?.addEventListener?.('pointercancel', onUp);
        });
      });
    }

    function ensureFilterShowsValue(filterInput, value) {
      if (!filterInput || !value) return;
      if (!deps.filterMatchesValue(filterInput.value, value)) {
        filterInput.value = '';
      }
    }

    function renderList(container, items, active, onSelect) {
      const listState = listStateByContainer.get(container) || null;
      const allItems = Array.isArray(items) ? items.slice() : [];
      if (listState) {
        listState.items = allItems;
        listState.active = active;
        listState.onSelect = onSelect;
      }
      const filterText = listState ? deps.normalizeFilterText(listState.filterInput?.value || '') : '';
      const visibleItems = deps.getVisiblePaneItems(allItems, filterText);
      container.innerHTML = '';
      if (!allItems.length) {
        container.innerHTML = '<div class="cb-empty">(empty)</div>';
        return;
      }
      if (!visibleItems.length) {
        container.innerHTML = '<div class="cb-empty">(no matches)</div>';
        return;
      }
      let activeRow = null;
      visibleItems.forEach(item => {
        const row = deps.document.createElement('div');
        row.className = 'cb-item' + (item === active ? ' active' : '');
        row.textContent = item;
        row.title = item;
        row.addEventListener('click', () => onSelect(item));
        container.appendChild(row);
        if (item === active) activeRow = row;
      });
      if (activeRow) schedule(() => activeRow.scrollIntoView?.({block: 'nearest'}));
    }

    function showLoading(container) {
      container.innerHTML = '<div class="cb-empty"><span class="spinner"></span></div>';
    }

    function setActiveRow(container, value) {
      const listState = listStateByContainer.get(container) || null;
      if (listState) listState.active = value;
      let activeRow = null;
      container.querySelectorAll('.cb-item').forEach(row => {
        const isActive = !!value && row.textContent === value;
        row.classList.toggle('active', isActive);
        if (isActive) activeRow = row;
      });
      if (activeRow) schedule(() => activeRow.scrollIntoView?.({block: 'nearest'}));
    }

    function initListFilters() {
      Object.entries(listStates).forEach(([key, listState]) => {
        if (!listState.container || !listState.filterInput) return;
        listState.container.dataset.listKey = key;
        listState.filterInput.dataset.listKey = key;
        listState.container.addEventListener('focus', () => { activePaneKey = key; });
        listState.container.addEventListener('mousedown', () => { activePaneKey = key; });
        listState.container.addEventListener('click', () => {
          activePaneKey = key;
          listState.container.focus?.({preventScroll: true});
        });
        listState.filterInput.addEventListener('focus', () => { activePaneKey = key; });
        listState.filterInput.addEventListener('input', () => {
          renderList(listState.container, listState.items, listState.active, listState.onSelect);
        });
        listState.filterInput.addEventListener('keydown', event => {
          if (event.key !== 'Escape' || !listState.filterInput.value) return;
          event.preventDefault();
          listState.filterInput.value = '';
          renderList(listState.container, listState.items, listState.active, listState.onSelect);
        });
      });
    }

    function focusPaneList(key) {
      const listState = listStates[key];
      if (!listState?.container) return false;
      activePaneKey = key;
      listState.container.focus?.({preventScroll: true});
      return true;
    }

    function movePaneFocus(fromKey, delta) {
      return focusPaneList(deps.nextPaneKey(fromKey, delta, paneOrder));
    }

    function activatePaneItem(key, item) {
      const listState = listStates[key];
      if (!listState?.onSelect || !item) return false;
      activePaneKey = key;
      listState.onSelect(item);
      listState.container.focus?.({preventScroll: true});
      return true;
    }

    function activateCurrentPaneItem(key) {
      const listState = listStates[key];
      const activeItem = deps.currentPaneItem(listState?.items, listState?.active, listState?.filterInput?.value || '');
      if (!activeItem) return false;
      return activatePaneItem(key, activeItem);
    }

    function selectRelativePaneItem(key, delta) {
      const listState = listStates[key];
      const nextItem = deps.relativePaneItem(listState?.items, listState?.active, listState?.filterInput?.value || '', delta);
      if (!nextItem) return false;
      return activatePaneItem(key, nextItem);
    }

    function selectBoundaryPaneItem(key, boundary) {
      const listState = listStates[key];
      const nextItem = deps.boundaryPaneItem(listState?.items, listState?.filterInput?.value || '', boundary);
      if (!nextItem) return false;
      return activatePaneItem(key, nextItem);
    }

    function syncSourceMode() {
      const editable = state().currentSourceMode !== 'classDefinition';
      deps.els.source.readOnly = !editable;
      deps.els.source.classList.toggle('is-readonly', !editable);
      deps.els.compile.disabled = !editable;
      deps.els.compile.title = editable
        ? 'Compile the current method source'
        : 'Browse Class shows the class definition; use New Method to compile source';
      syncBrowserActions();
    }

    function syncBrowserActions() {
      deps.applyClassBrowserActionState(deps.els, deps.buildClassBrowserActionState({
        currentDict: state().currentDict,
        currentClass: state().currentClass,
        currentProtocol: state().currentProtocol,
        currentMethod: state().currentMethod,
      }));
      syncWindowState();
    }

    function clearBrowserCache() {
      browserCache.clear();
    }

    async function finalizeBrowserWrite(message) {
      const successMessage = String(message || 'Done').trim() || 'Done';
      if (!readAutoCommitEnabled()) {
        setBrowserStatus(successMessage, 'ok');
        return true;
      }
      try {
        const data = await deps.browserApiTransaction('/transaction/commit');
        if (!data.success) throw new Error(data.exception || 'Transaction commit failed');
        clearBrowserCache();
        setBrowserStatus(`${successMessage}; transaction committed`, 'ok');
        deps.setStatus(true, 'committed');
        return true;
      } catch (error) {
        setBrowserStatus(`${successMessage}; auto-commit failed: ${error.message}`, 'error');
        deps.setStatus(false, error.message);
        return false;
      }
    }

    async function runBrowserTransaction(path, busyMessage, successMessage) {
      setBrowserStatus(busyMessage);
      try {
        const data = await deps.browserApiTransaction(path);
        if (!data.success) throw new Error(data.exception || successMessage);
        clearBrowserCache();
        if (state().currentDict || state().currentClass) {
          await deps.getLoadDictionaries?.()?.();
        }
        setBrowserStatus(successMessage, 'ok');
        deps.setStatus(true, successMessage.toLowerCase());
        return true;
      } catch (error) {
        setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
        return false;
      }
    }

    async function fetchBrowserCached(name, keyParts, loader) {
      const cacheKey = deps.buildBrowserCacheKey(name, keyParts);
      const existing = browserCache.get(cacheKey);
      if (existing) {
        if (Object.prototype.hasOwnProperty.call(existing, 'value')) return existing.value;
        return existing.promise;
      }
      const promise = Promise.resolve()
        .then(loader)
        .then(value => {
          browserCache.set(cacheKey, {value});
          return value;
        })
        .catch(error => {
          if (browserCache.get(cacheKey)?.promise === promise) browserCache.delete(cacheKey);
          throw error;
        });
      browserCache.set(cacheKey, {promise});
      return promise;
    }

    function clearSource() {
      setState({ currentSourceMode: 'classDefinition' });
      syncSourceMode();
      deps.els.source.value = '';
      setSourceNote('');
    }

    async function loadClassSource(selector = '', options = {}) {
      const token = options?.token;
      const isTokenCurrent = typeof options?.isTokenCurrent === 'function' ? options.isTokenCurrent : null;
      const sourceState = options?.stateSnapshot || {
        currentDict: state().currentDict,
        currentClass: state().currentClass,
        currentMeta: state().currentMeta,
      };
      if (isTokenCurrent && token != null && !isTokenCurrent(token)) return;
      if (!sourceState.currentClass) {
        clearSource();
        syncBrowserActions();
        return;
      }
      const sourceRequest = deps.buildClassSourceRequest(sourceState, selector);
      setState({ currentSourceMode: sourceRequest.sourceMode });
      syncSourceMode();
      const label = sourceRequest.sourceLabel;
      setSourceNote(label);
      deps.els.source.value = 'Loading…';
      try {
        const data = await fetchBrowserCached('source', sourceRequest.cacheKeyParts, () =>
          deps.browserApiWithParams('/class-browser/source', sourceRequest.params)
        );
        if (isTokenCurrent && token != null && !isTokenCurrent(token)) return;
        if (!data.success) throw new Error(data.exception);
        deps.els.source.value = data.source || '';
        setBrowserStatus(label, 'ok');
      } catch (error) {
        if (isTokenCurrent && token != null && !isTokenCurrent(token)) return;
        deps.els.source.value = 'Error: ' + error.message;
        setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
      if (isTokenCurrent && token != null && !isTokenCurrent(token)) return;
      syncBrowserActions();
    }

    function handleKeydown(event) {
      if (!deps.win?.classList?.contains('focused')) return;
      if (deps.document.getElementById('modal-overlay')?.classList.contains('visible')) return;
      if (!deps.win.contains(event.target)) return;

      const key = event.key || '';
      const lowerKey = key.toLowerCase();
      const target = event.target;
      const isFilter = target instanceof HTMLInputElement && target.classList.contains('cb-filter');
      const isList = target instanceof HTMLElement && target.classList.contains('cb-list');
      const isSource = target === deps.els.source;
      const isSelect = target instanceof HTMLSelectElement;
      const isButton = target instanceof HTMLButtonElement;
      const targetPaneKey = (isFilter || isList) ? String(target.dataset.listKey || activePaneKey || '') : activePaneKey;
      const compileSource = deps.getCompileSource?.();

      if ((event.metaKey || event.ctrlKey) && !event.altKey && lowerKey === 's') {
        event.preventDefault();
        if (deps.els.compile.disabled) {
          setBrowserStatus(deps.els.compile.title || 'Compile unavailable', 'error');
          return;
        }
        compileSource?.();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && !event.altKey && key === 'Enter' && isSource) {
        event.preventDefault();
        if (deps.els.compile.disabled) {
          setBrowserStatus(deps.els.compile.title || 'Compile unavailable', 'error');
          return;
        }
        compileSource?.();
        return;
      }

      if (isSource || isSelect || isButton) return;
      if (!(isFilter || isList)) return;

      if (key === 'ArrowUp') {
        event.preventDefault();
        selectRelativePaneItem(targetPaneKey, -1);
        return;
      }
      if (key === 'ArrowDown') {
        event.preventDefault();
        selectRelativePaneItem(targetPaneKey, 1);
        return;
      }
      if (key === 'Home') {
        event.preventDefault();
        selectBoundaryPaneItem(targetPaneKey, 'first');
        return;
      }
      if (key === 'End') {
        event.preventDefault();
        selectBoundaryPaneItem(targetPaneKey, 'last');
        return;
      }
      if (isList && key === 'ArrowLeft') {
        event.preventDefault();
        movePaneFocus(targetPaneKey, -1);
        return;
      }
      if (isList && key === 'ArrowRight') {
        event.preventDefault();
        movePaneFocus(targetPaneKey, 1);
        return;
      }
      if (key === 'Enter') {
        event.preventDefault();
        activateCurrentPaneItem(targetPaneKey);
      }
    }

    return {
      syncWindowState,
      setBrowserStatus,
      setSourceNote,
      loadStoredAutoCommitEnabled,
      storeAutoCommitEnabledFlag,
      readAutoCommitEnabled,
      loadStoredPaneWidths,
      setPaneWidths,
      applyPaneWidths,
      initPaneSplitters,
      ensureFilterShowsValue,
      initListFilters,
      focusPaneList,
      handleKeydown,
      syncSourceMode,
      syncBrowserActions,
      clearBrowserCache,
      finalizeBrowserWrite,
      runBrowserTransaction,
      fetchBrowserCached,
      renderList,
      showLoading,
      setActiveRow,
      clearSource,
      loadClassSource,
    };
  }

  return {
    createClassBrowserShellRuntime,
  };
});
