(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DesktopWindowRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function closeAllWindows(deps = {}) {
    deps.getManagedWindows?.().forEach(win => deps.closeWindow?.(win, win.id));
  }

  function getFocusedOrTopWindow(deps = {}) {
    return deps.document?.querySelector?.('.win.focused')
      || deps.getOrderedManagedWindows?.().slice(-1)[0]
      || null;
  }

  function revealWindow(win, deps = {}) {
    if (!win) return false;
    if (win.dataset?.minimised === '1') deps.toggleMinimise?.(win, win.id);
    deps.focusWin?.(win);
    return true;
  }

  function resolveStatusEntrySourceWindow(entry, deps = {}) {
    if (!entry || typeof entry !== 'object') return null;
    const sourceWindowId = entry.sourceWindowId ? String(entry.sourceWindowId) : '';
    if (sourceWindowId) {
      const sourceWin = deps.document?.getElementById?.(sourceWindowId);
      if (sourceWin) return sourceWin;
    }
    const sourceTitle = String(entry.sourceTitle || '').trim();
    const sourceKind = String(entry.sourceKind || '').trim();
    if (!sourceTitle && !sourceKind) return null;
    const candidates = (deps.getManagedWindows?.() || []).filter(win => {
      const state = deps.readWindowState?.(win.id) || {};
      if (sourceKind && state.kind !== sourceKind) return false;
      if (sourceTitle) {
        const title = win.querySelector?.('.win-title')?.textContent?.trim?.() || '';
        if (title !== sourceTitle) return false;
      }
      return true;
    });
    return candidates.length === 1 ? candidates[0] : null;
  }

  function withSuppressedLayoutPersist(work, deps = {}) {
    deps.setSuppressWindowLayoutPersist?.(true);
    try {
      return work();
    } finally {
      deps.setSuppressWindowLayoutPersist?.(false);
    }
  }

  function afterWindowLayoutMutation(deps = {}) {
    deps.persistWindowLayout?.();
    deps.redrawArrows?.();
    deps.notifyLiveWindowUpdated?.();
  }

  function afterWindowLayoutPersistOnly(deps = {}) {
    deps.persistWindowLayout?.();
  }

  return {
    closeAllWindows,
    getFocusedOrTopWindow,
    revealWindow,
    resolveStatusEntrySourceWindow,
    withSuppressedLayoutPersist,
    afterWindowLayoutMutation,
    afterWindowLayoutPersistOnly,
  };
});
