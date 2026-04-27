(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WorkspaceWindowController = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function bindEvent(node, type, handler) {
    if (!node || typeof node.addEventListener !== 'function' || typeof handler !== 'function') return;
    node.addEventListener(type, handler);
  }

  function bindWorkspaceWindowActions(els = {}, handlers = {}) {
    bindEvent(els.doitBtn, 'click', handlers.onDoIt);
    bindEvent(els.clearBtn, 'click', handlers.onClear);
    bindEvent(els.codeArea, 'input', handlers.onInput);
    bindEvent(els.codeArea, 'keydown', event => {
      if (event.ctrlKey && event.key === 'Enter') {
        handlers.onDoIt?.();
      }
    });
    bindEvent(els.abortBtn, 'click', handlers.onAbort);
    bindEvent(els.commitBtn, 'click', handlers.onCommit);
    bindEvent(els.continueBtn, 'click', handlers.onContinue);
  }

  return {
    bindWorkspaceWindowActions,
  };
});
