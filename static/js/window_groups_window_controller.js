(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WindowGroupsWindowController = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function bindEvent(node, type, handler) {
    if (!node || typeof node.addEventListener !== 'function' || typeof handler !== 'function') return;
    node.addEventListener(type, handler);
  }

  function forEachQuery(root, selector, handler) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll(selector).forEach(node => handler(node));
  }

  function bindWindowGroupsToolbarActions(buttons = {}, handlers = {}) {
    bindEvent(buttons.filterInput, 'input', handlers.onFilterInput);
    forEachQuery(buttons.scope, '[data-view-mode]', btn => {
      bindEvent(btn, 'click', () => handlers.onViewModeChange?.(btn.dataset.viewMode || 'all'));
    });
    bindEvent(buttons.raiseLargestBtn, 'click', handlers.onRaiseLargest);
    bindEvent(buttons.closeLargestBtn, 'click', handlers.onCloseLargest);
    bindEvent(buttons.copyBtn, 'click', handlers.onCopy);
    bindEvent(buttons.downloadBtn, 'click', handlers.onDownload);
    bindEvent(buttons.refreshBtn, 'click', handlers.onRefresh);
  }

  function applyWindowGroupsToolbarState(buttons = {}, state = {}) {
    if (buttons.filterInput) buttons.filterInput.value = String(state.filterText || '');
    if (buttons.raiseLargestBtn) buttons.raiseLargestBtn.disabled = !!state.raiseLargestDisabled;
    if (buttons.closeLargestBtn) buttons.closeLargestBtn.disabled = !!state.closeLargestDisabled;
    if (buttons.copyBtn) buttons.copyBtn.textContent = String(state.copyLabel || 'Copy JSON');
    if (buttons.downloadBtn) buttons.downloadBtn.textContent = String(state.downloadLabel || 'Download JSON');
    forEachQuery(buttons.scope, '[data-view-mode]', btn => {
      btn.classList.toggle('active', btn.dataset.viewMode === state.viewMode);
    });
  }

  function bindWindowGroupListActions(list, handlers = {}) {
    forEachQuery(list, '[data-window-id]', button => {
      bindEvent(button, 'click', () => handlers.onMemberClick?.(button.dataset.windowId || ''));
    });
    forEachQuery(list, '[data-group-seed-id]', button => {
      bindEvent(button, 'click', () => handlers.onRaiseGroup?.(button.dataset.groupSeedId || ''));
    });
    forEachQuery(list, '[data-close-group-seed-id]', button => {
      bindEvent(button, 'click', () => handlers.onCloseGroup?.(button.dataset.closeGroupSeedId || ''));
    });
  }

  return {
    bindWindowGroupsToolbarActions,
    applyWindowGroupsToolbarState,
    bindWindowGroupListActions,
  };
});
