(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DockContextMenuController = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function bindEvent(node, type, handler) {
    if (!node || typeof node.addEventListener !== 'function' || typeof handler !== 'function') return;
    node.addEventListener(type, handler);
  }

  function containsTarget(node, target) {
    if (!node || typeof node.contains !== 'function') return false;
    return !!target && node.contains(target);
  }

  function bindDockContextMenuActions(els = {}, handlers = {}) {
    const triggerButtons = Array.isArray(els.triggerButtons) ? els.triggerButtons : [];
    triggerButtons.forEach(btn => {
      bindEvent(btn, 'contextmenu', event => {
        handlers.onOpen?.(btn, event);
      });
    });
    bindEvent(els.menu, 'contextmenu', event => {
      event.preventDefault?.();
    });
    bindEvent(els.menu, 'click', event => {
      const action = event.target?.closest?.('[data-dock-context-command]');
      if (!action || action.disabled) return;
      handlers.onCommand?.(action.dataset.dockContextCommand, action, event);
    });
    bindEvent(els.documentNode, 'mousedown', event => {
      if (!handlers.isOpen?.()) return;
      const target = event.target;
      if (containsTarget(els.menu, target)) return;
      if (triggerButtons.some(btn => containsTarget(btn, target) || btn === target)) return;
      handlers.onClose?.(event);
    });
    bindEvent(els.documentNode, 'keydown', event => {
      if (!handlers.isOpen?.()) return;
      if (event.key === 'Escape') {
        handlers.onEscape?.(event);
      }
    });
  }

  function applyDockContextMenuState(menu, open) {
    if (!menu) return;
    menu.classList.toggle('open', !!open);
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  return {
    bindDockContextMenuActions,
    applyDockContextMenuState,
  };
});
