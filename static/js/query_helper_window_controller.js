(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.QueryHelperWindowController = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function bindEvent(node, type, handler) {
    if (!node || typeof node.addEventListener !== 'function' || typeof handler !== 'function') return;
    node.addEventListener(type, handler);
  }

  function bindQueryHelperToolbarActions(buttons = {}, handlers = {}) {
    bindEvent(buttons.loadBtn, 'click', handlers.onLoad);
    bindEvent(buttons.openBtn, 'click', handlers.onOpen);
    bindEvent(buttons.compareBtn, 'click', handlers.onCompare);
    bindEvent(buttons.inspectBtn, 'click', handlers.onInspect);
  }

  function applyQueryHelperActionState(buttons = {}, state = {}) {
    if (buttons.loadBtn) buttons.loadBtn.disabled = !!state.loadDisabled;
    if (buttons.openBtn) buttons.openBtn.disabled = !!state.openDisabled;
    if (buttons.compareBtn) buttons.compareBtn.disabled = !!state.compareDisabled;
    if (buttons.inspectBtn) buttons.inspectBtn.disabled = !!state.inspectDisabled;
  }

  return {
    bindQueryHelperToolbarActions,
    applyQueryHelperActionState,
  };
});
