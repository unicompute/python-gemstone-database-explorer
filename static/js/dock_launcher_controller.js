(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DockLauncherController = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function bindEvent(node, type, handler) {
    if (!node || typeof node.addEventListener !== 'function' || typeof handler !== 'function') return;
    node.addEventListener(type, handler);
  }

  function isEditableTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return !!target.closest('input, textarea, select, [contenteditable], [contenteditable="true"]');
  }

  function bindDockLauncherActions(els = {}, handlers = {}) {
    bindEvent(els.toggleBtn, 'click', event => handlers.onToggle?.(event));
    bindEvent(els.documentNode, 'keydown', event => {
      if (event.defaultPrevented) return;
      const isShortcutSlash = event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey;
      const isShortcutSpace = (event.ctrlKey || event.metaKey) && (event.code === 'Space' || event.key === ' ');
      if (!isShortcutSlash && !isShortcutSpace) return;
      if (isEditableTarget(event.target)) return;
      handlers.onShortcutOpen?.(event);
    });
    bindEvent(els.panel, 'click', event => {
      const pinAction = event.target?.closest?.('[data-launcher-pin-command]');
      if (pinAction) {
        handlers.onPinToggle?.(pinAction.dataset.launcherPinCommand, event);
        return;
      }
      const action = event.target?.closest?.('[data-launcher-command]');
      if (!action) return;
      handlers.onCommand?.(action.dataset.launcherCommand, action.dataset.launcherValue, event);
    });
    bindEvent(els.panel, 'input', event => {
      const search = event.target?.closest?.('.dock-launcher-search');
      if (!search) return;
      handlers.onFilter?.(search.value, event);
    });
    bindEvent(els.panel, 'keydown', event => {
      const search = event.target?.closest?.('.dock-launcher-search');
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
        handlers.onMove?.(event.key, event);
        return;
      }
      if (event.key === 'Escape') {
        handlers.onEscape?.(event);
        return;
      }
      if (!search) return;
      if (event.key === 'Enter') {
        handlers.onSubmit?.(search.value, event);
      }
    });
  }

  function applyDockLauncherState(toggleBtn, panel, open) {
    if (toggleBtn) {
      toggleBtn.classList.toggle('active', !!open);
      toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (panel) {
      panel.classList.toggle('open', !!open);
      panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
  }

  return {
    bindDockLauncherActions,
    applyDockLauncherState,
  };
});
