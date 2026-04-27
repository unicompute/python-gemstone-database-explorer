(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ObjectBrowserController = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function bindEvent(node, type, handler) {
    if (!node || typeof node.addEventListener !== 'function' || typeof handler !== 'function') return;
    node.addEventListener(type, handler);
  }

  function bindObjectBrowserCoreActions(els = {}, handlers = {}) {
    bindEvent(els.tabsStrip, 'click', event => {
      const tab = event.target?.closest?.('.inspector-tab');
      if (!tab) return;
      handlers.onActivateTab?.(tab.dataset.itab, event);
    });
    bindEvent(els.openBrowserBtn, 'click', handlers.onOpenClassBrowser);
    bindEvent(els.closeMethodBrowserBtn, 'click', handlers.onCloseMethodBrowser);
    bindEvent(els.evalBtn, 'click', handlers.onEvaluate);
    bindEvent(els.evalCode, 'keydown', event => {
      if (event.ctrlKey && event.key === 'Enter') {
        handlers.onEvaluate?.();
      }
    });
    bindEvent(els.abortBtn, 'click', handlers.onAbort);
    bindEvent(els.commitBtn, 'click', handlers.onCommit);
    bindEvent(els.continueBtn, 'click', handlers.onContinue);
  }

  function bindObjectBrowserMethodBrowserActions(els = {}, handlers = {}) {
    bindEvent(els.categoriesEl, 'click', event => {
      const category = event.target?.closest?.('.mb-cat[data-category]');
      if (!category) return;
      handlers.onSelectCategory?.(category.dataset.category, event);
    });
    bindEvent(els.selectorsEl, 'click', event => {
      const selector = event.target?.closest?.('.mb-sel[data-selector]');
      if (!selector) return;
      handlers.onSelectSelector?.(selector.dataset.selector, event);
    });
    bindEvent(els.selectorsEl, 'dblclick', event => {
      const selector = event.target?.closest?.('.mb-sel[data-selector]');
      if (!selector) return;
      handlers.onOpenSelector?.(selector.dataset.selector, event);
    });
  }

  return {
    bindObjectBrowserCoreActions,
    bindObjectBrowserMethodBrowserActions,
  };
});
