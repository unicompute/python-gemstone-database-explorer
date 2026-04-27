(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DockWindowPreviewController = api;
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

  function bindDockWindowPreviewActions(els = {}, handlers = {}) {
    const triggerButtons = Array.isArray(els.triggerButtons) ? els.triggerButtons : [];
    triggerButtons.forEach(btn => {
      bindEvent(btn, 'mouseenter', event => handlers.onTriggerEnter?.(btn, event));
      bindEvent(btn, 'mouseleave', event => handlers.onTriggerLeave?.(btn, event));
      bindEvent(btn, 'focus', event => handlers.onTriggerEnter?.(btn, event));
      bindEvent(btn, 'blur', event => handlers.onTriggerLeave?.(btn, event));
    });
    bindEvent(els.preview, 'mouseenter', event => handlers.onPreviewEnter?.(event));
    bindEvent(els.preview, 'mouseleave', event => handlers.onPreviewLeave?.(event));
    bindEvent(els.preview, 'click', event => {
      const action = event.target?.closest?.('[data-dock-preview-window-id]');
      if (!action) return;
      handlers.onWindowClick?.(action.dataset.dockPreviewWindowId, action, event);
    });
    bindEvent(els.documentNode, 'mousedown', event => {
      if (!handlers.isOpen?.()) return;
      const target = event.target;
      if (containsTarget(els.preview, target)) return;
      if (triggerButtons.some(btn => containsTarget(btn, target) || btn === target)) return;
      handlers.onClose?.(event);
    });
    bindEvent(els.documentNode, 'keydown', event => {
      if (!handlers.isOpen?.()) return;
      if (event.key === 'Escape') handlers.onEscape?.(event);
    });
  }

  function applyDockWindowPreviewState(preview, open) {
    if (!preview) return;
    preview.classList.toggle('open', !!open);
    preview.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  return {
    bindDockWindowPreviewActions,
    applyDockWindowPreviewState,
  };
});
