(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DesktopStateRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createDesktopStateRuntime(deps = {}) {
    let desktopLayoutRuntime = null;

    function readWindowState(id) {
      return deps.windowState.get(id) || {};
    }

    function parsePixelValue(value, fallback = 0) {
      const numeric = Number.parseInt(String(value || ''), 10);
      return Number.isFinite(numeric) ? numeric : fallback;
    }

    function getManagedWindows() {
      return Array.from(deps.document.querySelectorAll('.win'));
    }

    function getOrderedManagedWindows() {
      return getManagedWindows().sort((left, right) => {
        const leftZ = Number(left.style.zIndex || 0);
        const rightZ = Number(right.style.zIndex || 0);
        return leftZ - rightZ;
      });
    }

    function isRestorableWindowState(state) {
      return !!state && deps.restorableWindowKinds.has(state.kind);
    }

    function serializeWindowLayoutEntry(id, state) {
      if (!isRestorableWindowState(state)) return null;
      const win = deps.document.getElementById(id);
      if (!win) return null;
      const width = Math.max(320, Math.round(win.offsetWidth || parsePixelValue(win.style.width, 320)));
      const liveHeight = Math.max(180, Math.round(win.offsetHeight || parsePixelValue(win.style.height, 180)));
      const savedHeight = parsePixelValue(win.dataset.savedH, liveHeight);
      const base = {
        savedId: id,
        kind: state.kind,
        x: Math.round(win.offsetLeft || parsePixelValue(win.style.left, 0)),
        y: Math.round(win.offsetTop || parsePixelValue(win.style.top, 0)),
        width,
        height: win.dataset.minimised === '1' ? savedHeight : liveHeight,
        minimised: win.dataset.minimised === '1',
        zIndex: Number(win.style.zIndex || 0),
      };
      if (state.sourceWindowId) base.sourceWindowId = state.sourceWindowId;
      if (state.kind === 'object') {
        return {
          ...base,
          oop: state.objectOop || state.object?.oop || null,
          label: state.objectLabel || state.object?.inspection || '',
          currentTab: state.currentTab || 'instvars',
          compactMode: !!state.compactMode,
          query: state.objectQuery || {},
        };
      }
      if (state.kind === 'class-browser') {
        return {
          ...base,
          dictionary: state.dictionary || '',
          className: state.className || '',
          protocol: state.protocol || '-- all --',
          method: state.method || '',
          meta: !!state.meta,
        };
      }
      if (state.kind === 'workspace') {
        return {
          ...base,
          draft: state.draft || '',
        };
      }
      if (state.kind === 'ruby-workspace') {
        return {
          ...base,
          draft: state.draft || '',
          oop: state.oop || deps.getStartupIds().defaultWorkspaceId || deps.getRoots()['RubyWorkspace'] || 0,
        };
      }
      if (state.kind === 'maglev-report') {
        return {
          ...base,
          reportKey: state.reportKey || '',
          reportTitle: state.reportTitle || '',
        };
      }
      if (state.kind === 'web-browser') {
        return {
          ...base,
          url: state.url || '',
        };
      }
      if (state.kind === 'symbol-list') {
        return {
          ...base,
          user: state.user || '',
          dictionary: state.dictionary || '',
          key: state.key || '',
        };
      }
      if (state.kind === 'debugger') {
        return {
          ...base,
          threadOop: state.threadOop || 0,
          threadLabel: state.threadLabel || '',
          currentTab: state.currentTab || 'stack',
          frameIndex: Number.isFinite(Number(state.frameIndex)) ? Number(state.frameIndex) : 0,
        };
      }
      if (state.kind === 'method-query') {
        return {
          ...base,
          title: state.title || '',
          results: Array.isArray(state.results) ? state.results : [],
          filterText: state.filterText || '',
          selectedIndex: Number.isFinite(Number(state.selectedIndex)) ? Number(state.selectedIndex) : 0,
          loadLabel: state.loadLabel || 'Load Into Browser',
        };
      }
      if (state.kind === 'hierarchy') {
        return {
          ...base,
          title: state.title || '',
          classes: Array.isArray(state.classes) ? state.classes : [],
          filterText: state.filterText || '',
          selectedIndex: Number.isFinite(Number(state.selectedIndex)) ? Number(state.selectedIndex) : 0,
          meta: !!state.meta,
          loadLabel: state.loadLabel || 'Load Into Browser',
        };
      }
      if (state.kind === 'versions') {
        return {
          ...base,
          title: state.title || '',
          versions: Array.isArray(state.versions) ? state.versions : [],
          filterText: state.filterText || '',
          selectedIndex: Number.isFinite(Number(state.selectedIndex)) ? Number(state.selectedIndex) : 0,
          loadLabel: state.loadLabel || 'Load Into Browser',
          versionContext: state.versionContext || null,
        };
      }
      if (state.kind === 'connection') {
        return {
          ...base,
          checkResults: Array.isArray(state.checkResults) ? state.checkResults : [],
          checkViewMode: state.checkViewMode || 'all',
        };
      }
      if (state.kind === 'status-log') {
        return {
          ...base,
          filterText: state.filterText || '',
          level: state.level || 'all',
        };
      }
      if (state.kind === 'window-groups') {
        return {
          ...base,
          filterText: state.filterText || '',
          viewMode: state.viewMode || 'all',
        };
      }
      if (state.kind === 'window-links') {
        return {
          ...base,
          filterText: state.filterText || '',
          linkType: state.linkType || 'all',
          viewMode: state.viewMode || 'all',
          selectedIndex: Number.isFinite(Number(state.selectedIndex)) ? Number(state.selectedIndex) : 0,
        };
      }
      return base;
    }

    function buildWindowLayoutSnapshot() {
      const windows = Array.from(deps.windowState.entries())
        .map(([id, state]) => serializeWindowLayoutEntry(id, state))
        .filter(Boolean);
      return deps.windowLayoutModel.buildWindowLayoutSnapshot(windows);
    }

    function hasRecoverableWindows(snapshot) {
      return deps.windowLayoutModel.hasRecoverableWindows(snapshot);
    }

    function getDesktopLayoutRuntime() {
      if (desktopLayoutRuntime) return desktopLayoutRuntime;
      desktopLayoutRuntime = deps.createDesktopLayoutRuntime({
        localStorage: deps.localStorage,
        windowLayoutStorageKey: deps.windowLayoutStorageKey,
        healthyWindowLayoutStorageKey: deps.healthyWindowLayoutStorageKey,
        buildWindowLayoutSnapshot,
        normalizeStoredWindowLayout: deps.windowLayoutModel.normalizeStoredWindowLayout,
        chooseRecoverableWindowLayout: deps.windowLayoutModel.chooseRecoverableWindowLayout,
        sortWindowLayoutEntries: deps.windowLayoutModel.sortWindowLayoutEntries,
        resolveRestoredSourceLinks: deps.windowRestoreModel.resolveRestoredSourceLinks,
        isPersistSuppressed: deps.isPersistSuppressed,
        setPersistSuppressed: deps.setPersistSuppressed,
        isStartupBootstrapped: deps.isStartupBootstrapped,
        hasRecoverableWindows,
        getOrderedManagedWindows,
        getManagedWindows,
        readWindowState,
        writeWindowState(id, nextState) {
          deps.windowState.set(id, nextState);
        },
        parsePixelValue,
        buildWindowLinkSummaries: deps.buildWindowLinkSummaries,
        buildWindowGroupSummaries: deps.buildWindowGroupSummaries,
        get arrows() {
          return deps.arrows;
        },
        sanitizeSelectionIndex: deps.sanitizeSelectionIndex,
        toggleMinimise: deps.toggleMinimise,
        focusWin: deps.focusWin,
        redrawArrows: deps.redrawArrows,
        notifyLiveWindowUpdated: deps.notifyLiveWindowUpdated,
        getZTop: deps.getZTop,
        setZTop: deps.setZTop,
        openObjectBrowser: deps.openObjectBrowser,
        openClassBrowser: deps.openClassBrowser,
        openWorkspace: deps.openWorkspace,
        openRubyWorkspace: deps.openRubyWorkspace,
        openMaglevReportWindow: deps.openMaglevReportWindow,
        openWebBrowser: deps.openWebBrowser,
        openConnectionWindow: deps.openConnectionWindow,
        openAboutWindow: deps.openAboutWindow,
        openStatusLogWindow: deps.openStatusLogWindow,
        openWindowGroupsWindow: deps.openWindowGroupsWindow,
        openWindowLinksWindow: deps.openWindowLinksWindow,
        openSymbolList: deps.openSymbolList,
        openDebugger: deps.openDebugger,
        openMethodQueryWindow: deps.openMethodQueryWindow,
        openHierarchyWindow: deps.openHierarchyWindow,
        openVersionsWindow: deps.openVersionsWindow,
        get startupIds() {
          return deps.getStartupIds();
        },
        get roots() {
          return deps.getRoots();
        },
      });
      return desktopLayoutRuntime;
    }

    function upsertWindowState(id, patch) {
      const current = readWindowState(id);
      deps.windowState.set(id, {...current, ...patch});
      persistWindowLayout();
      deps.notifyLiveWindowUpdated();
    }

    function persistHealthyWindowLayout(snapshot) {
      return getDesktopLayoutRuntime().persistHealthyWindowLayout(snapshot);
    }

    function persistWindowLayout() {
      return getDesktopLayoutRuntime().persistWindowLayout();
    }

    function readWindowLayout(storageKey = deps.windowLayoutStorageKey) {
      return getDesktopLayoutRuntime().readWindowLayout(storageKey);
    }

    function readHealthyWindowLayout() {
      return getDesktopLayoutRuntime().readHealthyWindowLayout();
    }

    function readRecoverableWindowLayout() {
      return getDesktopLayoutRuntime().readRecoverableWindowLayout();
    }

    function collectOpenWindowSummaries() {
      return getDesktopLayoutRuntime().collectOpenWindowSummaries();
    }

    function collectWindowLinkSummaries() {
      return getDesktopLayoutRuntime().collectWindowLinkSummaries();
    }

    function collectWindowGroupSummaries() {
      return getDesktopLayoutRuntime().collectWindowGroupSummaries();
    }

    function clearWindowLayout() {
      return getDesktopLayoutRuntime().clearWindowLayout();
    }

    function applyRestoredSourceLinks(restoredIdMap, pendingSourceLinks) {
      return getDesktopLayoutRuntime().applyRestoredSourceLinks(restoredIdMap, pendingSourceLinks);
    }

    function restoreWindowBounds(win, desc) {
      return getDesktopLayoutRuntime().restoreWindowBounds(win, desc);
    }

    function getRelatedWindowIds(seedId) {
      return deps.computeRelatedWindowIds(seedId, collectOpenWindowSummaries(), deps.arrows);
    }

    return {
      readWindowState,
      parsePixelValue,
      getManagedWindows,
      getOrderedManagedWindows,
      isRestorableWindowState,
      serializeWindowLayoutEntry,
      buildWindowLayoutSnapshot,
      hasRecoverableWindows,
      getDesktopLayoutRuntime,
      upsertWindowState,
      persistHealthyWindowLayout,
      persistWindowLayout,
      readWindowLayout,
      readHealthyWindowLayout,
      readRecoverableWindowLayout,
      collectOpenWindowSummaries,
      collectWindowLinkSummaries,
      collectWindowGroupSummaries,
      clearWindowLayout,
      applyRestoredSourceLinks,
      restoreWindowBounds,
      getRelatedWindowIds,
    };
  }

  return {
    createDesktopStateRuntime,
  };
});
