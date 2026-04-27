(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AboutWindowController = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function bindEvent(node, type, handler) {
    if (!node || typeof node.addEventListener !== 'function' || typeof handler !== 'function') return;
    node.addEventListener(type, handler);
  }

  function bindAboutWindowToolbarActions(buttons = {}, handlers = {}) {
    bindEvent(buttons.connectionBtn, 'click', handlers.openAboutConnection);
    bindEvent(buttons.windowLinksBtn, 'click', handlers.openAboutWindowLinks);
    bindEvent(buttons.windowGroupsBtn, 'click', handlers.openAboutWindowGroups);
    bindEvent(buttons.statusLogBtn, 'click', handlers.openAboutStatusLogAll);
    bindEvent(buttons.statusErrorsBtn, 'click', handlers.openAboutStatusLogErrors);
    bindEvent(buttons.copyBundleBtn, 'click', handlers.copySupportBundle);
    bindEvent(buttons.bundleBtn, 'click', handlers.downloadSupportBundle);
    bindEvent(buttons.refreshBtn, 'click', handlers.refreshAboutInfo);
    bindEvent(buttons.copyBtn, 'click', handlers.copyDiagnostics);
    bindEvent(buttons.downloadBtn, 'click', handlers.downloadDiagnostics);
  }

  function applyAboutWindowToolbarDisabledState(buttons = {}, disabled = false) {
    Object.values(buttons).forEach(button => {
      if (button && Object.prototype.hasOwnProperty.call(button, 'disabled')) {
        button.disabled = !!disabled;
      }
    });
  }

  return {
    bindAboutWindowToolbarActions,
    applyAboutWindowToolbarDisabledState,
  };
});
