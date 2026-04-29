(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AppDesktopRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LEAF_BASETYPES = new Set(['string', 'symbol', 'fixnum', 'float', 'boolean', 'nilclass']);

  function shortLabel(value, max = 32) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function isLeafBasetype(basetype) {
    return LEAF_BASETYPES.has(basetype);
  }

  function createAppDesktopRuntime(deps = {}) {
    function setStatus(ok, msg) {
      return deps.desktopStatusRuntime?.setStatus?.(ok, msg);
    }

    function currentStatusSource() {
      return deps.desktopStatusRuntime?.currentStatusSource?.() || {
        sourceWindowId: null,
        sourceTitle: 'Desktop',
        sourceKind: 'desktop',
      };
    }

    function renderTaskbarVersion(info) {
      return deps.desktopStatusRuntime?.renderTaskbarVersion?.(info);
    }

    function sanitizeSelectionIndex(index, items) {
      return deps.windowLayoutModel.sanitizeSelectionIndex(index, items);
    }

    function createWindow(options = {}) {
      return deps.windowShellRuntime.createWindow(options);
    }

    function sourceRelativeWindowPosition(sourceWindowId, width, height, options = {}) {
      return deps.windowShellRuntime.sourceRelativeWindowPosition(sourceWindowId, width, height, options);
    }

    function focusWin(win, options = {}) {
      return deps.windowShellRuntime.focusWin(win, options);
    }

    function closeWindow(win, id) {
      return deps.windowShellRuntime.closeWindow(win, id);
    }

    function toggleMinimise(win, id) {
      return deps.windowShellRuntime.toggleMinimise(win, id);
    }

    function drawArrow(srcWinId, dstWinId, label = '', type = 'ref', options = {}) {
      return deps.windowArrowRuntime.drawArrow(srcWinId, dstWinId, label, type, options);
    }

    function redrawArrows() {
      return deps.windowArrowRuntime.redrawArrows();
    }

    function removeArrowsWhere(predicate) {
      return deps.windowArrowRuntime.removeArrowsWhere(predicate);
    }

    function removeArrowsFor(winId) {
      return deps.windowArrowRuntime.removeArrowsFor(winId);
    }

    function shouldDrawManualArrow(sourceWinId) {
      return deps.objectLinkRuntime.shouldDrawManualArrow(sourceWinId);
    }

    function clampLinkedWindowPosition(x, y, width = 520, height = 480) {
      return deps.objectLinkRuntime.clampLinkedWindowPosition(x, y, width, height);
    }

    function positionLinkedWindowOutsideSource(sourceEl, width = 520, height = 480, seedX, seedY) {
      return deps.objectLinkRuntime.positionLinkedWindowOutsideSource(sourceEl, width, height, seedX, seedY);
    }

    function resolveLinkedWindowPosition({sourceWinId, x, y, width = 520, height = 480}) {
      return deps.objectLinkRuntime.resolveLinkedWindowPosition({sourceWinId, x, y, width, height});
    }

    function openLinkedObjectWindow(payload) {
      return deps.objectLinkRuntime.openLinkedObjectWindow(payload);
    }

    function attachObjectButtonBehavior(element, payload = {}) {
      return deps.objectLinkRuntime.attachObjectButtonBehavior(element, payload);
    }

    function collectObjectLinks(obj, targetOop) {
      return deps.objectLinkRuntime.collectObjectLinks(obj, targetOop);
    }

    function syncObjectWindowArrows(winId) {
      return deps.objectLinkRuntime.syncObjectWindowArrows(winId);
    }

    function makeChip(text, oop, winId, evalContext) {
      return deps.objectChipRuntime.makeChip(text, oop, winId, evalContext);
    }

    function closeAllWindows() {
      return deps.closeAllManagedWindows({
        getManagedWindows: deps.getManagedWindows,
        closeWindow,
      });
    }

    function getFocusedOrTopWindow() {
      return deps.getDesktopFocusedOrTopWindow({
        document: deps.document,
        getOrderedManagedWindows: deps.getOrderedManagedWindows,
      });
    }

    function revealWindow(win) {
      return deps.revealDesktopWindow(win, {
        toggleMinimise,
        focusWin,
      });
    }

    function resolveStatusEntrySourceWindow(entry) {
      return deps.resolveDesktopStatusEntrySourceWindow(entry, {
        document: deps.document,
        getManagedWindows: deps.getManagedWindows,
        readWindowState(id) {
          return deps.windowState.get(id) || {};
        },
      });
    }

    function getRelatedWindowIds(seedId) {
      return deps.desktopStateRuntime.getRelatedWindowIds(seedId);
    }

    function withSuppressedWindowLayoutPersist(work) {
      return deps.withSuppressedDesktopLayoutPersist(work, {
        setSuppressWindowLayoutPersist(value) {
          deps.setSuppressWindowLayoutPersist(!!value);
        },
      });
    }

    function afterWindowLayoutMutation() {
      return deps.afterDesktopWindowLayoutMutation({
        persistWindowLayout: deps.persistWindowLayout,
        redrawArrows,
        notifyLiveWindowUpdated: deps.notifyLiveWindowUpdated,
      });
    }

    function afterWindowLayoutPersistOnly() {
      return deps.afterDesktopWindowLayoutPersistOnly({
        persistWindowLayout: deps.persistWindowLayout,
      });
    }

    function raiseWindowGroupByIds(memberIds, seedId = null) {
      return deps.raiseManagedWindowGroupByIds(memberIds, {seedId}, {
        getOrderedManagedWindows: deps.getOrderedManagedWindows,
        toggleMinimise,
        focusWin,
        withSuppressedLayoutPersist: withSuppressedWindowLayoutPersist,
        afterWindowMutation: afterWindowLayoutMutation,
      });
    }

    function closeWindowGroupByIds(memberIds, options = {}) {
      return deps.closeManagedWindowGroupByIds(memberIds, options, {
        getOrderedManagedWindows: deps.getOrderedManagedWindows,
        closeWindow,
      });
    }

    function cascadeWindows() {
      return deps.cascadeManagedWindows({
        getOrderedManagedWindows: deps.getOrderedManagedWindows,
        toggleMinimise,
        focusWin,
        cascadeX: () => 28,
        cascadeY: () => 24,
        setCascadePosition(nextX, nextY) {
          deps.windowShellRuntime.setCascadePosition(nextX, nextY);
        },
        CASCADE_STEP: deps.windowShellRuntime.CASCADE_STEP,
        CASCADE_MAX_X: deps.windowShellRuntime.CASCADE_MAX_X,
        CASCADE_MAX_Y: deps.windowShellRuntime.CASCADE_MAX_Y,
        withSuppressedLayoutPersist: withSuppressedWindowLayoutPersist,
        afterWindowMutation: afterWindowLayoutMutation,
      });
    }

    function tileWindows() {
      return deps.tileManagedWindows({
        getOrderedManagedWindows: deps.getOrderedManagedWindows,
        toggleMinimise,
        focusWin,
        windowWidth: () => deps.window.innerWidth,
        windowHeight: () => deps.window.innerHeight,
        withSuppressedLayoutPersist: withSuppressedWindowLayoutPersist,
        afterWindowMutation: afterWindowLayoutMutation,
      });
    }

    function raiseRelatedWindows() {
      return deps.raiseManagedRelatedWindows({
        getFocusedOrTopWindow,
        getRelatedWindowIds,
        getOrderedManagedWindows: deps.getOrderedManagedWindows,
        focusWin,
        withSuppressedLayoutPersist: withSuppressedWindowLayoutPersist,
        afterPersistOnly: afterWindowLayoutPersistOnly,
      });
    }

    function minimiseAllWindows() {
      return deps.minimiseManagedWindows({
        getManagedWindows: deps.getManagedWindows,
        toggleMinimise,
        withSuppressedLayoutPersist: withSuppressedWindowLayoutPersist,
        afterPersistOnly: afterWindowLayoutPersistOnly,
      });
    }

    function closeWindowGroup() {
      return deps.closeManagedFocusedWindowGroup({
        getFocusedOrTopWindow,
        getRelatedWindowIds,
        getOrderedManagedWindows: deps.getOrderedManagedWindows,
        closeWindow,
      });
    }

    function closeOtherWindows() {
      const focused = deps.document.querySelector('.win.focused') || deps.getOrderedManagedWindows().slice(-1)[0] || null;
      if (!focused) return;
      deps.getManagedWindows().forEach(win => {
        if (win !== focused) closeWindow(win, win.id);
      });
      focusWin(focused);
    }

    async function restoreSavedLayout(options = {}) {
      return deps.desktopStateRuntime.getDesktopLayoutRuntime().restoreSavedLayout(options);
    }

    function openDefaultStartupLayout() {
      return deps.startupLayoutRuntime.openDefaultStartupLayout();
    }

    function resetStartupLayout() {
      return deps.startupLayoutRuntime.resetStartupLayout();
    }

    return {
      setStatus,
      isLeafBasetype,
      shortLabel,
      currentStatusSource,
      renderTaskbarVersion,
      sanitizeSelectionIndex,
      closeAllWindows,
      getFocusedOrTopWindow,
      revealWindow,
      resolveStatusEntrySourceWindow,
      getRelatedWindowIds,
      withSuppressedWindowLayoutPersist,
      afterWindowLayoutMutation,
      afterWindowLayoutPersistOnly,
      raiseWindowGroupByIds,
      closeWindowGroupByIds,
      cascadeWindows,
      tileWindows,
      raiseRelatedWindows,
      minimiseAllWindows,
      closeWindowGroup,
      closeOtherWindows,
      restoreSavedLayout,
      openDefaultStartupLayout,
      resetStartupLayout,
      shouldDrawManualArrow,
      clampLinkedWindowPosition,
      positionLinkedWindowOutsideSource,
      resolveLinkedWindowPosition,
      openLinkedObjectWindow,
      attachObjectButtonBehavior,
      createWindow,
      sourceRelativeWindowPosition,
      focusWin,
      closeWindow,
      toggleMinimise,
      drawArrow,
      redrawArrows,
      removeArrowsWhere,
      removeArrowsFor,
      collectObjectLinks,
      syncObjectWindowArrows,
      makeChip,
    };
  }

  return {
    isLeafBasetype,
    shortLabel,
    createAppDesktopRuntime,
  };
});
