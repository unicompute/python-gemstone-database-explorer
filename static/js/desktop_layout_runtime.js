(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DesktopLayoutRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createDesktopLayoutRuntime(deps = {}) {
    async function openWindowFromLayoutDescriptor(desc, helpers = {}) {
      if (!desc || typeof desc !== 'object') return null;
      if (desc.kind === 'object' && desc.oop) {
        return helpers.openObjectBrowser?.(
          desc.oop,
          desc.label || 'object',
          desc.x,
          desc.y,
          desc.width,
          desc.height,
          {
            initialTab: desc.currentTab || 'instvars',
            compact: !!desc.compactMode,
            query: desc.query || {},
          },
        ) || null;
      }
      if (desc.kind === 'class-browser') {
        return helpers.openClassBrowser?.({
          x: desc.x,
          y: desc.y,
          width: desc.width,
          height: desc.height,
          dictionary: desc.dictionary || null,
          className: desc.className || null,
          protocol: desc.protocol || '-- all --',
          method: desc.method || null,
          meta: !!desc.meta,
          sourceWindowId: desc.sourceWindowId || null,
        }) || null;
      }
      if (desc.kind === 'workspace') {
        return helpers.openWorkspace?.({
          x: desc.x,
          y: desc.y,
          width: desc.width,
          height: desc.height,
          draft: desc.draft || '',
        }) || null;
      }
      if (desc.kind === 'ruby-workspace') {
        return helpers.openRubyWorkspace?.({
          x: desc.x,
          y: desc.y,
          width: desc.width,
          height: desc.height,
          draft: desc.draft || '',
          oop: desc.oop || helpers.startupIds?.defaultWorkspaceId || helpers.roots?.RubyWorkspace || 0,
        }) || null;
      }
      if (desc.kind === 'maglev-report' && desc.reportKey) {
        return helpers.openMaglevReportWindow?.(desc.reportKey, {
          x: desc.x,
          y: desc.y,
          width: desc.width,
          height: desc.height,
          title: desc.reportTitle || '',
        }) || null;
      }
      if (desc.kind === 'web-browser') {
        return helpers.openWebBrowser?.(desc.url || '', {
          x: desc.x,
          y: desc.y,
          width: desc.width,
          height: desc.height,
        }) || null;
      }
      if (desc.kind === 'connection') {
        return helpers.openConnectionWindow?.({
          x: desc.x,
          y: desc.y,
          width: desc.width,
          height: desc.height,
          sourceWindowId: desc.sourceWindowId || null,
          checkResults: Array.isArray(desc.checkResults) ? desc.checkResults : [],
          checkViewMode: desc.checkViewMode || 'all',
        }) || null;
      }
      if (desc.kind === 'about') {
        return helpers.openAboutWindow?.({
          x: desc.x,
          y: desc.y,
          width: desc.width,
          height: desc.height,
        }) || null;
      }
      if (desc.kind === 'status-log') {
        return helpers.openStatusLogWindow?.({
          x: desc.x,
          y: desc.y,
          width: desc.width,
          height: desc.height,
          filterText: desc.filterText || '',
          level: desc.level || 'all',
          sourceWindowId: desc.sourceWindowId || null,
        }) || null;
      }
      if (desc.kind === 'window-groups') {
        return helpers.openWindowGroupsWindow?.({
          x: desc.x,
          y: desc.y,
          width: desc.width,
          height: desc.height,
          filterText: desc.filterText || '',
          viewMode: desc.viewMode || 'all',
          sourceWindowId: desc.sourceWindowId || null,
        }) || null;
      }
      if (desc.kind === 'window-links') {
        return helpers.openWindowLinksWindow?.({
          x: desc.x,
          y: desc.y,
          width: desc.width,
          height: desc.height,
          filterText: desc.filterText || '',
          linkType: desc.linkType || 'all',
          viewMode: desc.viewMode || 'all',
          selectedIndex: helpers.sanitizeSelectionIndex?.(desc.selectedIndex, helpers.collectWindowLinkSummaries?.() || []) ?? 0,
          sourceWindowId: desc.sourceWindowId || null,
        }) || null;
      }
      if (desc.kind === 'symbol-list') {
        return helpers.openSymbolList?.({
          x: desc.x,
          y: desc.y,
          width: desc.width,
          height: desc.height,
          user: desc.user || '',
          dictionary: desc.dictionary || '',
          key: desc.key || '',
        }) || null;
      }
      if (desc.kind === 'debugger' && desc.threadOop) {
        return helpers.openDebugger?.({
          oop: desc.threadOop,
          printString: desc.threadLabel || 'Debugger',
        }, null, {
          x: desc.x,
          y: desc.y,
          width: desc.width,
          height: desc.height,
          currentTab: desc.currentTab || 'stack',
          frameIndex: Number.isFinite(Number(desc.frameIndex)) ? Number(desc.frameIndex) : 0,
          sourceWindowId: desc.sourceWindowId || null,
        }) || null;
      }
      if (desc.kind === 'method-query' && Array.isArray(desc.results)) {
        return helpers.openMethodQueryWindow?.(desc.title || 'Method Query', desc.results, {
          x: desc.x,
          y: desc.y,
          width: desc.width,
          height: desc.height,
          filterText: desc.filterText || '',
          selectedIndex: helpers.sanitizeSelectionIndex?.(desc.selectedIndex, desc.results) ?? 0,
          sourceWindowId: desc.sourceWindowId || null,
          sessionChannel: desc.sessionChannel || '',
          loadLabel: desc.loadLabel || 'Load Into Browser',
        }) || null;
      }
      if (desc.kind === 'hierarchy' && Array.isArray(desc.classes)) {
        return helpers.openHierarchyWindow?.(desc.title || 'Hierarchy', desc.classes, {
          x: desc.x,
          y: desc.y,
          width: desc.width,
          height: desc.height,
          filterText: desc.filterText || '',
          selectedIndex: helpers.sanitizeSelectionIndex?.(desc.selectedIndex, desc.classes) ?? 0,
          sourceWindowId: desc.sourceWindowId || null,
          sessionChannel: desc.sessionChannel || '',
          loadLabel: desc.loadLabel || 'Load Into Browser',
          meta: !!desc.meta,
        }) || null;
      }
      if (desc.kind === 'versions' && Array.isArray(desc.versions)) {
        return helpers.openVersionsWindow?.(desc.title || 'Versions', desc.versions, {
          x: desc.x,
          y: desc.y,
          width: desc.width,
          height: desc.height,
          filterText: desc.filterText || '',
          selectedIndex: helpers.sanitizeSelectionIndex?.(desc.selectedIndex, desc.versions) ?? 0,
          sourceWindowId: desc.sourceWindowId || null,
          sessionChannel: desc.sessionChannel || '',
          loadLabel: desc.loadLabel || 'Load Into Browser',
          versionContext: desc.versionContext || null,
        }) || null;
      }
      return null;
    }

    function persistHealthyWindowLayout(snapshot) {
      try {
        deps.localStorage?.setItem?.(deps.healthyWindowLayoutStorageKey, JSON.stringify(snapshot));
      } catch (_) {
        // ignore storage failures
      }
    }

    function persistWindowLayout() {
      if (deps.isPersistSuppressed?.()) return;
      try {
        const snapshot = deps.buildWindowLayoutSnapshot?.() || [];
        deps.localStorage?.setItem?.(deps.windowLayoutStorageKey, JSON.stringify(snapshot));
        if (deps.isStartupBootstrapped?.() && deps.hasRecoverableWindows?.(snapshot)) {
          persistHealthyWindowLayout(snapshot);
        }
      } catch (_) {
        // ignore storage failures
      }
    }

    function readWindowLayout(storageKey = deps.windowLayoutStorageKey) {
      try {
        const raw = deps.localStorage?.getItem?.(storageKey);
        if (!raw) return [];
        return deps.normalizeStoredWindowLayout?.(JSON.parse(raw)) || [];
      } catch (_) {
        return [];
      }
    }

    function readHealthyWindowLayout() {
      return readWindowLayout(deps.healthyWindowLayoutStorageKey);
    }

    function readRecoverableWindowLayout() {
      return deps.chooseRecoverableWindowLayout?.(readWindowLayout(), readHealthyWindowLayout()) || [];
    }

    function collectOpenWindowSummaries() {
      return (deps.getOrderedManagedWindows?.() || []).map(win => {
        const state = deps.readWindowState?.(win.id) || {};
        return {
          id: win.id,
          title: win.querySelector?.('.win-title')?.textContent?.trim?.() || '',
          kind: state.kind || '',
          minimised: win.dataset?.minimised === '1',
          focused: !!win.classList?.contains?.('focused'),
          zIndex: Number(win.style?.zIndex || 0),
          sourceWindowId: state.sourceWindowId || null,
          x: Math.round(win.offsetLeft || deps.parsePixelValue?.(win.style?.left, 0) || 0),
          y: Math.round(win.offsetTop || deps.parsePixelValue?.(win.style?.top, 0) || 0),
          width: Math.max(320, Math.round(win.offsetWidth || deps.parsePixelValue?.(win.style?.width, 320) || 320)),
          height: Math.max(180, Math.round(win.offsetHeight || deps.parsePixelValue?.(win.style?.height, 180) || 180)),
        };
      });
    }

    function collectWindowLinkSummaries() {
      return deps.buildWindowLinkSummaries?.(collectOpenWindowSummaries(), deps.arrows) || [];
    }

    function collectWindowGroupSummaries() {
      return deps.buildWindowGroupSummaries?.(collectOpenWindowSummaries(), deps.arrows) || [];
    }

    function clearWindowLayout() {
      try {
        deps.localStorage?.removeItem?.(deps.windowLayoutStorageKey);
        deps.localStorage?.removeItem?.(deps.healthyWindowLayoutStorageKey);
      } catch (_) {
        // ignore storage failures
      }
    }

    function applyRestoredSourceLinks(restoredIdMap, pendingSourceLinks) {
      const patches = deps.resolveRestoredSourceLinks?.(
        restoredIdMap,
        pendingSourceLinks,
        (deps.getManagedWindows?.() || []).map(win => win.id)
      ) || [];
      patches.forEach(link => {
        const currentState = deps.readWindowState?.(link.windowId);
        if (!currentState) return;
        deps.writeWindowState?.(link.windowId, { ...currentState, sourceWindowId: link.sourceWindowId });
      });
      deps.notifyLiveWindowUpdated?.();
    }

    function restoreWindowBounds(win, desc) {
      if (!win || !desc) return;
      win.style.left = `${Math.max(0, Math.round(desc.x || 0))}px`;
      win.style.top = `${Math.max(0, Math.round(desc.y || 0))}px`;
      win.style.width = `${Math.max(320, Math.round(desc.width || 320))}px`;
      win.style.height = `${Math.max(180, Math.round(desc.height || 180))}px`;
      if (Number.isFinite(Number(desc.zIndex))) {
        const zIndex = Math.max(1, Math.round(Number(desc.zIndex)));
        win.style.zIndex = zIndex;
        deps.setZTop?.(Math.max(deps.getZTop?.() || 1, zIndex));
      }
      if (desc.minimised && win.dataset?.minimised !== '1') {
        deps.toggleMinimise?.(win, win.id);
      }
    }

    async function restoreSavedLayout(options = {}) {
      const source = options.source === 'recoverable' ? 'recoverable' : 'current';
      const layout = source === 'recoverable' ? readRecoverableWindowLayout() : readWindowLayout();
      if (!layout.length) return false;
      const excludedKinds = new Set(
        Array.isArray(options.excludeKinds)
          ? options.excludeKinds.map(kind => String(kind || '').trim()).filter(Boolean)
          : []
      );
      const restoredIdMap = new Map();
      const pendingSourceLinks = [];
      deps.setPersistSuppressed?.(true);
      try {
        const sortedLayout = deps.sortWindowLayoutEntries?.(layout) || [];
        for (const desc of sortedLayout) {
          if (excludedKinds.has(String(desc.kind || '').trim())) continue;
          const resolvedSourceWindowId = restoredIdMap.get(desc.sourceWindowId) || desc.sourceWindowId || null;
          const descriptor = {
            ...desc,
            sourceWindowId: resolvedSourceWindowId,
          };
          const win = await openWindowFromLayoutDescriptor(descriptor, {
            ...deps,
            startupIds: deps.startupIds,
            roots: deps.roots,
            collectWindowLinkSummaries,
          });
          restoreWindowBounds(win, desc);
          if (win && desc.savedId) restoredIdMap.set(desc.savedId, win.id);
          if (win && desc.sourceWindowId) {
            pendingSourceLinks.push({ windowId: win.id, sourceWindowId: desc.sourceWindowId });
          }
        }
        applyRestoredSourceLinks(restoredIdMap, pendingSourceLinks);
        const topWindow = (deps.getOrderedManagedWindows?.() || []).slice(-1)[0];
        if (topWindow) deps.focusWin?.(topWindow);
      } finally {
        deps.setPersistSuppressed?.(false);
        persistWindowLayout();
        deps.redrawArrows?.();
      }
      setTimeout(() => {
        applyRestoredSourceLinks(restoredIdMap, pendingSourceLinks);
        persistWindowLayout();
      }, 0);
      return (deps.getManagedWindows?.() || []).length > 0;
    }

    return {
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
      openWindowFromLayoutDescriptor,
      restoreSavedLayout,
    };
  }

  return {
    createDesktopLayoutRuntime,
  };
});
