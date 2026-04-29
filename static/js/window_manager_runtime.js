(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WindowManagerRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function raiseWindowGroupByIds(memberIds, options = {}, deps = {}) {
    const { seedId = null } = options;
    const idSet = new Set((memberIds || []).map(id => String(id)).filter(Boolean));
    if (!idSet.size) return false;
    const ordered = deps.getOrderedManagedWindows().filter(win => idSet.has(win.id));
    if (!ordered.length) return false;
    deps.withSuppressedLayoutPersist(() => {
      ordered.forEach(win => {
        if (win.dataset.minimised === '1') deps.toggleMinimise(win, win.id);
      });
      ordered.filter(win => win.id !== seedId).forEach(win => deps.focusWin(win));
      const seed = ordered.find(win => win.id === seedId) || ordered[ordered.length - 1];
      if (seed) deps.focusWin(seed);
    });
    deps.afterWindowMutation?.();
    return true;
  }

  function closeWindowGroupByIds(memberIds, options = {}, deps = {}) {
    const excluded = new Set((options.excludeIds || []).map(id => String(id)).filter(Boolean));
    const ordered = deps.getOrderedManagedWindows().filter(win => {
      return (memberIds || []).includes(win.id) && !excluded.has(win.id);
    });
    if (!ordered.length) return false;
    ordered.forEach(win => deps.closeWindow(win, win.id));
    return true;
  }

  function cascadeWindows(deps = {}) {
    const windows = deps.getOrderedManagedWindows();
    if (!windows.length) return;
    let nextX = deps.cascadeX();
    let nextY = deps.cascadeY();
    deps.withSuppressedLayoutPersist(() => {
      windows.forEach(win => {
        if (win.dataset.minimised === '1') deps.toggleMinimise(win, win.id);
        win.style.left = `${nextX}px`;
        win.style.top = `${nextY}px`;
        deps.focusWin(win);
        nextX += deps.CASCADE_STEP;
        nextY += deps.CASCADE_STEP;
        if (nextX > deps.CASCADE_MAX_X || nextY > deps.CASCADE_MAX_Y) {
          nextX = 28;
          nextY = 24;
        }
      });
    });
    deps.setCascadePosition(nextX, nextY);
    deps.afterWindowMutation?.();
  }

  function tileWindows(deps = {}) {
    const windows = deps.getOrderedManagedWindows();
    if (!windows.length) return;
    windows.forEach(win => {
      if (win.dataset.minimised === '1') deps.toggleMinimise(win, win.id);
    });
    const count = windows.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.max(1, Math.ceil(count / cols));
    const inset = 10;
    const taskbarHeight = 42;
    const availableWidth = Math.max(320, deps.windowWidth() - inset * 2);
    const availableHeight = Math.max(220, deps.windowHeight() - taskbarHeight - inset * 2);
    const cellWidth = Math.max(320, Math.floor(availableWidth / cols));
    const cellHeight = Math.max(180, Math.floor(availableHeight / rows));
    deps.withSuppressedLayoutPersist(() => {
      windows.forEach((win, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const left = inset + col * cellWidth;
        const top = inset + row * cellHeight;
        const width = Math.max(320, cellWidth - 8);
        const height = Math.max(180, cellHeight - 8);
        win.style.left = `${left}px`;
        win.style.top = `${top}px`;
        win.style.width = `${width}px`;
        win.style.height = `${height}px`;
        deps.focusWin(win);
      });
    });
    deps.afterWindowMutation?.();
  }

  function raiseRelatedWindows(deps = {}) {
    const seed = deps.getFocusedOrTopWindow();
    if (!seed) return;
    const relatedIds = new Set(deps.getRelatedWindowIds(seed.id));
    if (!relatedIds.size) return;
    const ordered = deps.getOrderedManagedWindows().filter(win => relatedIds.has(win.id));
    deps.withSuppressedLayoutPersist(() => {
      ordered.filter(win => win.id !== seed.id).forEach(win => deps.focusWin(win));
      deps.focusWin(seed);
    });
    deps.afterPersistOnly?.();
  }

  function minimiseAllWindows(deps = {}) {
    deps.withSuppressedLayoutPersist(() => {
      deps.getManagedWindows().forEach(win => {
        if (win.dataset.minimised !== '1') deps.toggleMinimise(win, win.id);
      });
    });
    deps.afterPersistOnly?.();
  }

  function closeFocusedWindowGroup(deps = {}) {
    const seed = deps.getFocusedOrTopWindow();
    if (!seed) return;
    const relatedIds = new Set(deps.getRelatedWindowIds(seed.id));
    if (!relatedIds.size) return;
    deps.getOrderedManagedWindows()
      .filter(win => relatedIds.has(win.id))
      .forEach(win => deps.closeWindow(win, win.id));
  }

  return {
    raiseWindowGroupByIds,
    closeWindowGroupByIds,
    cascadeWindows,
    tileWindows,
    raiseRelatedWindows,
    minimiseAllWindows,
    closeFocusedWindowGroup,
  };
});
