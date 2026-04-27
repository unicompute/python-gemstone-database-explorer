(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WindowLinksWindowController = api;
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

  function bindWindowLinksToolbarActions(buttons = {}, handlers = {}) {
    bindEvent(buttons.filterInput, 'input', handlers.onFilterInput);
    forEachQuery(buttons.scope, '[data-link-type]', btn => {
      bindEvent(btn, 'click', () => handlers.onLinkTypeChange?.(btn.dataset.linkType || 'all'));
    });
    forEachQuery(buttons.viewScope, '[data-view-mode]', btn => {
      bindEvent(btn, 'click', () => handlers.onViewModeChange?.(btn.dataset.viewMode || 'all'));
    });
    bindEvent(buttons.raiseSelectedBtn, 'click', handlers.onRaiseSelected);
    bindEvent(buttons.closeSelectedBtn, 'click', handlers.onCloseSelected);
    bindEvent(buttons.copyBtn, 'click', handlers.onCopy);
    bindEvent(buttons.downloadBtn, 'click', handlers.onDownload);
    bindEvent(buttons.refreshBtn, 'click', handlers.onRefresh);
  }

  function applyWindowLinksToolbarState(buttons = {}, state = {}) {
    if (buttons.filterInput) buttons.filterInput.value = String(state.filterText || '');
    if (buttons.raiseSelectedBtn) buttons.raiseSelectedBtn.disabled = !!state.raiseSelectedDisabled;
    if (buttons.closeSelectedBtn) buttons.closeSelectedBtn.disabled = !!state.closeSelectedDisabled;
    if (buttons.copyBtn) buttons.copyBtn.textContent = String(state.copyLabel || 'Copy JSON');
    if (buttons.downloadBtn) buttons.downloadBtn.textContent = String(state.downloadLabel || 'Download JSON');
    forEachQuery(buttons.scope, '[data-link-type]', btn => {
      btn.classList.toggle('active', btn.dataset.linkType === state.linkType);
    });
    forEachQuery(buttons.viewScope, '[data-view-mode]', btn => {
      btn.classList.toggle('active', btn.dataset.viewMode === state.viewMode);
      if (btn.dataset.viewMode === 'related') btn.disabled = !state.hasSourceWindow;
    });
  }

  function bindWindowLinkListActions(list, handlers = {}) {
    forEachQuery(list, '[data-link-row-index]', row => {
      bindEvent(row, 'click', () => handlers.onSelectRow?.(Number(row.dataset.linkRowIndex)));
    });
    forEachQuery(list, '[data-link-index]', button => {
      bindEvent(button, 'click', event => {
        if (typeof event?.stopPropagation === 'function') event.stopPropagation();
        handlers.onEndpointClick?.({
          index: Number(button.dataset.linkIndex),
          endpoint: button.dataset.linkEndpoint || '',
        });
      });
    });
  }

  return {
    bindWindowLinksToolbarActions,
    applyWindowLinksToolbarState,
    bindWindowLinkListActions,
  };
});
