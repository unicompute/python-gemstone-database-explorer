(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.StatusLogWindowController = api;
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

  function bindStatusLogToolbarActions(buttons = {}, handlers = {}) {
    bindEvent(buttons.filterInput, 'input', handlers.onFilterInput);
    forEachQuery(buttons.scope, '[data-level]', btn => {
      bindEvent(btn, 'click', () => handlers.onLevelChange?.(btn.dataset.level || 'all'));
    });
    bindEvent(buttons.clearBtn, 'click', handlers.onClear);
    bindEvent(buttons.copyBtn, 'click', handlers.onCopy);
    bindEvent(buttons.downloadBtn, 'click', handlers.onDownload);
  }

  function bindStatusLogSourceButtons(list, handlers = {}) {
    forEachQuery(list, '[data-source-entry-index]', button => {
      bindEvent(button, 'click', event => {
        if (typeof event?.stopPropagation === 'function') event.stopPropagation();
        handlers.onSourceClick?.(Number(button.dataset.sourceEntryIndex));
      });
    });
  }

  function applyStatusLogToolbarState(buttons = {}, state = {}) {
    if (buttons.filterInput) buttons.filterInput.value = String(state.filterText || '');
    if (buttons.copyBtn) buttons.copyBtn.textContent = String(state.copyLabel || 'Copy JSON');
    if (buttons.downloadBtn) buttons.downloadBtn.textContent = String(state.downloadLabel || 'Download JSON');
    forEachQuery(buttons.scope, '[data-level]', btn => {
      btn.classList.toggle('active', btn.dataset.level === state.level);
    });
  }

  return {
    bindStatusLogToolbarActions,
    bindStatusLogSourceButtons,
    applyStatusLogToolbarState,
  };
});
