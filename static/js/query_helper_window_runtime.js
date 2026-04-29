(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.QueryHelperWindowRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function readWindowStateEntry(windowState, windowId) {
    if (!windowState || !windowId) return null;
    if (typeof windowState.get === 'function') {
      return windowState.get(windowId) || null;
    }
    if (typeof windowState === 'object') {
      return windowState[windowId] || null;
    }
    return null;
  }

  function clearActiveRows(listEl) {
    if (!listEl || typeof listEl.querySelectorAll !== 'function') return;
    listEl.querySelectorAll('.qv-item').forEach(el => el.classList.remove('active'));
  }

  function createMethodQueryWindowRuntime(deps = {}) {
    const {
      id,
      title,
      results = [],
      options = {},
      listEl,
      filterInput,
      titleEl,
      previewEl,
      buttons = {},
      windowState,
      openClassBrowser,
      apiWithParams,
      apiPost,
      parseMethodReference,
      openLinkedObjectWindow,
      setStatus,
      setupQueryWindowList,
      upsertWindowState,
      sanitizeSelectionIndex,
      bindQueryHelperToolbarActions,
      applyQueryHelperActionState,
      resolveClassBrowserRuntime,
    } = deps;

    let sourceWindowId = options.sourceWindowId || null;
    let currentRef = null;
    const canLoadResult = typeof options.onLoadResult === 'function' || !!sourceWindowId;
    const queryHelperRuntimeDeps = {windowState, openClassBrowser};

    function helperSessionChannel() {
      return options.sessionChannel || readWindowStateEntry(windowState, sourceWindowId || '')?.sessionChannel || '';
    }

    function queryApiWithParams(url, params = {}) {
      return apiWithParams(url, params, {sessionChannel: helperSessionChannel()});
    }

    function queryApiPost(url, body = {}) {
      return apiPost(url, body, {sessionChannel: helperSessionChannel()});
    }

    function trackOpenedBrowser(nextBrowser) {
      if (!nextBrowser?.id) return nextBrowser;
      sourceWindowId = nextBrowser.id;
      syncMethodQueryWindowState();
      return nextBrowser;
    }

    function syncMethodQueryWindowState() {
      const existingSourceWindowId = readWindowStateEntry(windowState, id)?.sourceWindowId || null;
      if (existingSourceWindowId) sourceWindowId = existingSourceWindowId;
      upsertWindowState(id, {
        kind: 'method-query',
        title,
        results,
        filterText: filterInput?.value || '',
        selectedIndex: Math.max(0, results.indexOf(currentRef)),
        loadLabel: options.loadLabel || 'Load Into Browser',
        sourceWindowId: sourceWindowId || null,
        sessionChannel: helperSessionChannel(),
      });
    }

    async function selectRef(ref, row) {
      currentRef = ref;
      clearActiveRows(listEl);
      row?.classList?.add?.('active');
      if (!ref) {
        if (titleEl) titleEl.textContent = 'Select a result';
        if (previewEl) previewEl.value = '';
        applyQueryHelperActionState(buttons, {
          loadDisabled: true,
          openDisabled: true,
          inspectDisabled: true,
        });
        syncMethodQueryWindowState();
        return;
      }
      const parsed = parseMethodReference(ref);
      if (!parsed) {
        if (titleEl) titleEl.textContent = ref;
        if (previewEl) previewEl.value = ref;
        applyQueryHelperActionState(buttons, {
          loadDisabled: true,
          openDisabled: true,
          inspectDisabled: true,
        });
        syncMethodQueryWindowState();
        return;
      }
      applyQueryHelperActionState(buttons, {
        loadDisabled: false,
        openDisabled: false,
        inspectDisabled: false,
      });
      if (titleEl) {
        titleEl.textContent = parsed.meta
          ? `${parsed.className} class >> ${parsed.selector}`
          : `${parsed.className} >> ${parsed.selector}`;
      }
      if (previewEl) previewEl.value = 'Loading…';
      try {
        const params = {
          class: parsed.className,
          selector: parsed.selector,
          meta: parsed.meta ? 1 : 0,
        };
        if (parsed.dictionary) params.dictionary = parsed.dictionary;
        const data = await queryApiWithParams('/class-browser/source', params);
        if (!data.success) throw new Error(data.exception);
        if (previewEl) previewEl.value = data.source || '';
      } catch (error) {
        if (previewEl) previewEl.value = 'Error: ' + error.message;
      } finally {
        syncMethodQueryWindowState();
      }
    }

    async function inspectCurrentRef(ref = currentRef) {
      const parsed = parseMethodReference(ref);
      if (!parsed) return;
      const data = await queryApiPost('/class-browser/inspect-target', {
        mode: 'method',
        dictionary: parsed.dictionary || '',
        className: parsed.className,
        selector: parsed.selector,
        meta: parsed.meta,
      });
      if (!data.success) throw new Error(data.exception || 'Inspection failed');
      openLinkedObjectWindow({
        oop: data.oop,
        text: data.label || parsed.label || ref,
        sourceWinId: id,
      });
    }

    function mount() {
      if (filterInput) filterInput.value = options.filterText || '';
      bindQueryHelperToolbarActions(buttons, {
        async onLoad() {
          const parsed = parseMethodReference(currentRef);
          if (!parsed) return;
          applyQueryHelperActionState(buttons, {
            loadDisabled: true,
            openDisabled: true,
            inspectDisabled: !!buttons.inspectBtn?.disabled,
          });
          try {
            sourceWindowId = readWindowStateEntry(windowState, id)?.sourceWindowId || sourceWindowId;
            const target = await resolveClassBrowserRuntime(sourceWindowId, {
              dictionary: parsed.dictionary || null,
              className: parsed.className,
              method: parsed.selector,
              meta: parsed.meta,
            }, queryHelperRuntimeDeps);
            sourceWindowId = target.sourceWindowId || sourceWindowId;
            syncMethodQueryWindowState();
            if (typeof target.runtime?.loadMethodReference !== 'function') {
              throw new Error('Source browser is no longer available');
            }
            await target.runtime.loadMethodReference(parsed, currentRef);
          } catch (error) {
            setStatus(false, error.message);
          } finally {
            if (parseMethodReference(currentRef)) {
              applyQueryHelperActionState(buttons, {
                loadDisabled: false,
                openDisabled: false,
                inspectDisabled: false,
              });
            }
          }
        },
        onOpen() {
          const parsed = parseMethodReference(currentRef);
          if (!parsed) return;
          trackOpenedBrowser(openClassBrowser({
            dictionary: parsed.dictionary || null,
            className: parsed.className,
            method: parsed.selector,
            meta: parsed.meta,
          }));
        },
        async onInspect() {
          if (!currentRef) return;
          applyQueryHelperActionState(buttons, {
            loadDisabled: !!buttons.loadBtn?.disabled,
            openDisabled: !!buttons.openBtn?.disabled,
            inspectDisabled: true,
          });
          try {
            await inspectCurrentRef(currentRef);
          } catch (error) {
            setStatus(false, error.message);
          } finally {
            if (parseMethodReference(currentRef)) {
              applyQueryHelperActionState(buttons, {
                loadDisabled: !!buttons.loadBtn?.disabled,
                openDisabled: !!buttons.openBtn?.disabled,
                inspectDisabled: false,
              });
            }
          }
        },
      });

      setupQueryWindowList({
        listEl,
        filterInput,
        items: results,
        labelForItem(item) {
          const parsed = parseMethodReference(item);
          return parsed?.label || String(item || '');
        },
        onSelectItem: selectRef,
        onOpenItem(item) {
          const parsed = parseMethodReference(item);
          if (!parsed) return;
          trackOpenedBrowser(openClassBrowser({
            dictionary: parsed.dictionary || null,
            className: parsed.className,
            method: parsed.selector,
            meta: parsed.meta,
            sourceWindowId: id,
          }));
        },
        onActivateItem(item) {
          if (canLoadResult && buttons.loadBtn && !buttons.loadBtn.disabled) {
            buttons.loadBtn.click();
            return;
          }
          const parsed = parseMethodReference(item);
          if (!parsed) return;
          trackOpenedBrowser(openClassBrowser({
            dictionary: parsed.dictionary || null,
            className: parsed.className,
            method: parsed.selector,
            meta: parsed.meta,
            sourceWindowId: id,
          }));
        },
        defaultIndex: sanitizeSelectionIndex(options.selectedIndex, results),
      });

      filterInput?.addEventListener?.('input', syncMethodQueryWindowState);
      syncMethodQueryWindowState();
    }

    return {
      mount,
      syncMethodQueryWindowState,
      getSourceWindowId: () => sourceWindowId,
    };
  }

  function createHierarchyWindowRuntime(deps = {}) {
    const {
      id,
      title,
      classes = [],
      options = {},
      listEl,
      filterInput,
      titleEl,
      previewEl,
      buttons = {},
      windowState,
      openClassBrowser,
      apiWithParams,
      apiPost,
      parseHierarchyEntry,
      openLinkedObjectWindow,
      setStatus,
      setupQueryWindowList,
      upsertWindowState,
      sanitizeSelectionIndex,
      bindQueryHelperToolbarActions,
      applyQueryHelperActionState,
      resolveClassBrowserRuntime,
    } = deps;

    let sourceWindowId = options.sourceWindowId || null;
    let currentEntry = null;
    const canLoadClass = typeof options.onLoadClass === 'function' || !!sourceWindowId;
    const queryHelperRuntimeDeps = {windowState, openClassBrowser};

    function helperSessionChannel() {
      return options.sessionChannel || readWindowStateEntry(windowState, sourceWindowId || '')?.sessionChannel || '';
    }

    function hierarchyApiWithParams(url, params = {}) {
      return apiWithParams(url, params, {sessionChannel: helperSessionChannel()});
    }

    function hierarchyApiPost(url, body = {}) {
      return apiPost(url, body, {sessionChannel: helperSessionChannel()});
    }

    function trackOpenedBrowser(nextBrowser) {
      if (!nextBrowser?.id) return nextBrowser;
      sourceWindowId = nextBrowser.id;
      syncHierarchyWindowState();
      return nextBrowser;
    }

    function hierarchySelectedIndex() {
      return Math.max(0, classes.findIndex(entry => {
        const parsed = parseHierarchyEntry(entry);
        return parsed.className === currentEntry?.className && parsed.dictionary === currentEntry?.dictionary;
      }));
    }

    function syncHierarchyWindowState() {
      const existingSourceWindowId = readWindowStateEntry(windowState, id)?.sourceWindowId || null;
      if (existingSourceWindowId) sourceWindowId = existingSourceWindowId;
      upsertWindowState(id, {
        kind: 'hierarchy',
        title,
        classes,
        filterText: filterInput?.value || '',
        selectedIndex: hierarchySelectedIndex(),
        meta: !!options.meta,
        loadLabel: options.loadLabel || 'Load Into Browser',
        sourceWindowId: sourceWindowId || null,
        sessionChannel: helperSessionChannel(),
      });
    }

    async function selectClass(entry, row) {
      const parsed = parseHierarchyEntry(entry);
      currentEntry = parsed.className ? parsed : null;
      clearActiveRows(listEl);
      row?.classList?.add?.('active');
      if (titleEl) titleEl.textContent = currentEntry?.className || 'Select a class';
      applyQueryHelperActionState(buttons, {
        loadDisabled: !currentEntry,
        openDisabled: !currentEntry,
        inspectDisabled: !currentEntry,
      });
      if (!currentEntry) {
        if (previewEl) previewEl.value = '';
        syncHierarchyWindowState();
        return;
      }
      if (previewEl) previewEl.value = 'Loading…';
      try {
        const params = {class: currentEntry.className};
        if (currentEntry.dictionary) params.dictionary = currentEntry.dictionary;
        const data = await hierarchyApiWithParams('/class-browser/source', params);
        if (!data.success) throw new Error(data.exception);
        if (previewEl) previewEl.value = data.source || '';
      } catch (error) {
        if (previewEl) previewEl.value = 'Error: ' + error.message;
      } finally {
        syncHierarchyWindowState();
      }
    }

    async function inspectCurrentClass(entry = currentEntry) {
      if (!entry) return;
      const data = await hierarchyApiPost('/class-browser/inspect-target', {
        mode: 'class',
        dictionary: entry.dictionary || '',
        className: entry.className,
        meta: !!options.meta,
      });
      if (!data.success) throw new Error(data.exception || 'Inspection failed');
      openLinkedObjectWindow({
        oop: data.oop,
        text: data.label || entry.className,
        sourceWinId: id,
      });
    }

    function mount() {
      if (filterInput) filterInput.value = options.filterText || '';
      bindQueryHelperToolbarActions(buttons, {
        async onLoad() {
          if (!currentEntry) return;
          applyQueryHelperActionState(buttons, {
            loadDisabled: true,
            openDisabled: true,
            inspectDisabled: !!buttons.inspectBtn?.disabled,
          });
          try {
            sourceWindowId = readWindowStateEntry(windowState, id)?.sourceWindowId || sourceWindowId;
            const target = await resolveClassBrowserRuntime(sourceWindowId, {
              dictionary: currentEntry.dictionary || null,
              className: currentEntry.className,
              meta: !!options.meta,
            }, queryHelperRuntimeDeps);
            sourceWindowId = target.sourceWindowId || sourceWindowId;
            syncHierarchyWindowState();
            if (typeof target.runtime?.loadHierarchyEntry !== 'function') {
              throw new Error('Source browser is no longer available');
            }
            await target.runtime.loadHierarchyEntry(currentEntry, !!options.meta);
          } catch (error) {
            setStatus(false, error.message);
          } finally {
            if (currentEntry) {
              applyQueryHelperActionState(buttons, {
                loadDisabled: false,
                openDisabled: false,
                inspectDisabled: false,
              });
            }
          }
        },
        onOpen() {
          if (!currentEntry) return;
          trackOpenedBrowser(openClassBrowser({
            dictionary: currentEntry.dictionary || null,
            className: currentEntry.className,
            meta: !!options.meta,
            sourceWindowId: id,
          }));
        },
        async onInspect() {
          if (!currentEntry) return;
          applyQueryHelperActionState(buttons, {
            loadDisabled: !!buttons.loadBtn?.disabled,
            openDisabled: !!buttons.openBtn?.disabled,
            inspectDisabled: true,
          });
          try {
            await inspectCurrentClass(currentEntry);
          } catch (error) {
            setStatus(false, error.message);
          } finally {
            if (currentEntry) {
              applyQueryHelperActionState(buttons, {
                loadDisabled: !!buttons.loadBtn?.disabled,
                openDisabled: !!buttons.openBtn?.disabled,
                inspectDisabled: false,
              });
            }
          }
        },
      });

      setupQueryWindowList({
        listEl,
        filterInput,
        items: classes,
        defaultIndex: Number.isFinite(Number(options.selectedIndex))
          ? sanitizeSelectionIndex(options.selectedIndex, classes)
          : Math.max(0, classes.length - 1),
        labelForItem(item) {
          return parseHierarchyEntry(item).className;
        },
        onSelectItem: selectClass,
        onOpenItem(item) {
          const parsed = parseHierarchyEntry(item);
          if (!parsed.className) return;
          trackOpenedBrowser(openClassBrowser({
            dictionary: parsed.dictionary || null,
            className: parsed.className,
            meta: !!options.meta,
            sourceWindowId: id,
          }));
        },
        onActivateItem(item) {
          if (canLoadClass && buttons.loadBtn && !buttons.loadBtn.disabled) {
            buttons.loadBtn.click();
            return;
          }
          const parsed = parseHierarchyEntry(item);
          if (!parsed.className) return;
          trackOpenedBrowser(openClassBrowser({
            dictionary: parsed.dictionary || null,
            className: parsed.className,
            meta: !!options.meta,
            sourceWindowId: id,
          }));
        },
      });

      filterInput?.addEventListener?.('input', syncHierarchyWindowState);
      syncHierarchyWindowState();
    }

    return {
      mount,
      syncHierarchyWindowState,
      getSourceWindowId: () => sourceWindowId,
    };
  }

  function createVersionsWindowRuntime(deps = {}) {
    const {
      id,
      title,
      versions = [],
      options = {},
      listEl,
      filterInput,
      titleEl,
      previewEl,
      buttons = {},
      windowState,
      openClassBrowser,
      setStatus,
      setupQueryWindowList,
      upsertWindowState,
      sanitizeSelectionIndex,
      bindQueryHelperToolbarActions,
      applyQueryHelperActionState,
      openLinkedObjectWindow,
      buildUnifiedLineDiff,
      openClassBrowserRuntime,
      resolveClassBrowserRuntime,
    } = deps;

    let sourceWindowId = options.sourceWindowId || null;
    let currentVersion = null;
    const canLoadVersion = typeof options.onLoadVersion === 'function' || !!sourceWindowId;
    const canOpenVersionBrowser = !!String(options.versionContext?.className || '').trim();
    const canCompareVersion = canOpenVersionBrowser;
    const queryHelperRuntimeDeps = {windowState, openClassBrowser};

    function helperSessionChannel() {
      return options.sessionChannel || readWindowStateEntry(windowState, sourceWindowId || '')?.sessionChannel || '';
    }

    function trackOpenedBrowser(nextBrowser) {
      if (!nextBrowser?.id) return nextBrowser;
      sourceWindowId = nextBrowser.id;
      syncVersionsWindowState();
      return nextBrowser;
    }

    function syncVersionsWindowState() {
      const existingSourceWindowId = readWindowStateEntry(windowState, id)?.sourceWindowId || null;
      if (existingSourceWindowId) sourceWindowId = existingSourceWindowId;
      upsertWindowState(id, {
        kind: 'versions',
        title,
        versions,
        filterText: filterInput?.value || '',
        selectedIndex: Math.max(0, versions.indexOf(currentVersion)),
        loadLabel: options.loadLabel || 'Load Into Browser',
        versionContext: options.versionContext || null,
        sourceWindowId: sourceWindowId || null,
        sessionChannel: helperSessionChannel(),
      });
    }

    function selectVersion(version, row) {
      currentVersion = version || null;
      clearActiveRows(listEl);
      row?.classList?.add?.('active');
      if (titleEl) titleEl.textContent = version?.label || 'Select a version';
      if (previewEl) previewEl.value = version?.source || '';
      applyQueryHelperActionState(buttons, {
        loadDisabled: !currentVersion,
        openDisabled: !currentVersion,
        compareDisabled: !currentVersion,
        inspectDisabled: !Number.isFinite(Number(currentVersion?.methodOop)),
      });
      syncVersionsWindowState();
    }

    async function openCurrentVersionInBrowser(version = currentVersion) {
      if (!version || !canOpenVersionBrowser) return;
      const target = await openClassBrowserRuntime({
        dictionary: options.versionContext?.dictionary || null,
        className: options.versionContext?.className || null,
        method: options.versionContext?.method || null,
        meta: !!options.versionContext?.meta,
        sourceWindowId: id,
      }, queryHelperRuntimeDeps);
      trackOpenedBrowser(target.browser);
      await Promise.resolve(target.runtime.loadVersion(version, options.versionContext || {}));
    }

    async function compareCurrentVersion(version = currentVersion) {
      if (!version || !canCompareVersion) return;
      sourceWindowId = readWindowStateEntry(windowState, id)?.sourceWindowId || sourceWindowId;
      const target = await resolveClassBrowserRuntime(sourceWindowId, {
        dictionary: options.versionContext?.dictionary || null,
        className: options.versionContext?.className || null,
        method: options.versionContext?.method || null,
        meta: !!options.versionContext?.meta,
        sourceWindowId: id,
      }, queryHelperRuntimeDeps);
      sourceWindowId = target.sourceWindowId || sourceWindowId;
      syncVersionsWindowState();
      const snapshot = typeof target.runtime?.snapshot === 'function' ? target.runtime.snapshot() : null;
      if (!snapshot) throw new Error('Source browser is no longer available');
      const leftLabel = version.label || 'Selected version';
      const rightLabel = snapshot.sourceNote || 'Current browser';
      if (titleEl) titleEl.textContent = `${leftLabel} vs current`;
      if (previewEl) previewEl.value = buildUnifiedLineDiff(version.source || '', snapshot.source || '', {leftLabel, rightLabel});
    }

    function mount() {
      if (filterInput) filterInput.value = options.filterText || '';
      bindQueryHelperToolbarActions(buttons, {
        async onLoad() {
          if (!currentVersion) return;
          try {
            sourceWindowId = readWindowStateEntry(windowState, id)?.sourceWindowId || sourceWindowId;
            const target = await resolveClassBrowserRuntime(sourceWindowId, {
              dictionary: options.versionContext?.dictionary || null,
              className: options.versionContext?.className || null,
              method: options.versionContext?.method || null,
              meta: !!options.versionContext?.meta,
            }, queryHelperRuntimeDeps);
            sourceWindowId = target.sourceWindowId || sourceWindowId;
            syncVersionsWindowState();
            if (typeof target.runtime?.loadVersion !== 'function') {
              throw new Error('Source browser is no longer available');
            }
            await Promise.resolve(target.runtime.loadVersion(currentVersion, options.versionContext || {}));
          } catch (error) {
            setStatus(false, error.message);
          }
        },
        async onOpen() {
          try {
            await openCurrentVersionInBrowser(currentVersion);
          } catch (error) {
            setStatus(false, error.message);
          }
        },
        async onCompare() {
          try {
            await compareCurrentVersion(currentVersion);
          } catch (error) {
            setStatus(false, error.message);
          }
        },
        onInspect() {
          const versionOop = Number(currentVersion?.methodOop);
          if (!Number.isFinite(versionOop) || versionOop <= 0) return;
          openLinkedObjectWindow({
            oop: versionOop,
            text: currentVersion?.label || options.versionContext?.method || 'CompiledMethod',
            sourceWinId: id,
            arrowLabel: 'inspect',
          });
        },
      });

      setupQueryWindowList({
        listEl,
        filterInput,
        items: versions,
        labelForItem(item) {
          return item?.label || '';
        },
        onSelectItem: selectVersion,
        async onOpenItem(item) {
          if (!item) return;
          await openCurrentVersionInBrowser(item);
        },
        onActivateItem(item) {
          if (canLoadVersion && buttons.loadBtn && !buttons.loadBtn.disabled) {
            buttons.loadBtn.click();
            return;
          }
          if (!item) return;
          openCurrentVersionInBrowser(item).catch(error => setStatus(false, error.message));
        },
        defaultIndex: sanitizeSelectionIndex(options.selectedIndex, versions),
      });

      filterInput?.addEventListener?.('input', syncVersionsWindowState);
      syncVersionsWindowState();
    }

    return {
      mount,
      syncVersionsWindowState,
      getSourceWindowId: () => sourceWindowId,
    };
  }

  return {
    createMethodQueryWindowRuntime,
    createHierarchyWindowRuntime,
    createVersionsWindowRuntime,
  };
});
