(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ClassBrowserController = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function bindEvent(node, type, handler) {
    if (!node || typeof node.addEventListener !== 'function' || typeof handler !== 'function') return;
    node.addEventListener(type, handler);
  }

  function applyButtonState(button, state = {}) {
    if (!button) return;
    button.disabled = !state.enabled;
    button.title = state.enabled ? '' : String(state.title || '');
  }

  function applyClassBrowserActionState(els = {}, state = {}) {
    Object.entries(state).forEach(([key, value]) => {
      applyButtonState(els[key], value);
    });
  }

  function bindClassBrowserMenus(toolbar) {
    if (!toolbar || typeof toolbar.querySelectorAll !== 'function') return;
    const menus = Array.from(toolbar.querySelectorAll('.cb-menu'));
    if (!menus.length) return;
    const doc = toolbar.ownerDocument || (typeof document !== 'undefined' ? document : null);

    function setMenuOpen(menu, isOpen) {
      if (!menu) return;
      const toggle = menu.querySelector('.cb-menu-toggle');
      const panel = menu.querySelector('.cb-menu-panel');
      if (toggle) toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (panel) panel.hidden = !isOpen;
      if (menu.classList && typeof menu.classList.toggle === 'function') {
        menu.classList.toggle('open', isOpen);
      }
    }

    menus.forEach(menu => {
      const toggle = menu.querySelector('.cb-menu-toggle');
      bindEvent(toggle, 'click', event => {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        const isOpen = !!menu.classList?.contains('open');
        menus.forEach(otherMenu => setMenuOpen(otherMenu, otherMenu === menu ? !isOpen : false));
      });
      const panel = menu.querySelector('.cb-menu-panel');
      bindEvent(panel, 'click', event => {
        const target = event?.target;
        if (target && typeof target.closest === 'function' && target.closest('.cb-menu-item')) {
          setMenuOpen(menu, false);
        }
      });
    });

    bindEvent(toolbar, 'keydown', event => {
      if (event?.key !== 'Escape') return;
      menus.forEach(menu => setMenuOpen(menu, false));
    });
    if (doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener('click', event => {
        if (!toolbar.isConnected) return;
        const target = event?.target;
        if (target && typeof toolbar.contains === 'function' && toolbar.contains(target)) return;
        menus.forEach(menu => setMenuOpen(menu, false));
      });
    }
  }

  function bindClassBrowserToolbarActions(els = {}, handlers = {}) {
    bindClassBrowserMenus(els.toolbar);
    bindEvent(els.find, 'click', handlers.onFindClass);
    bindEvent(els.findDictionary, 'click', handlers.onFindDictionary);
    bindEvent(els.addDictionary, 'click', handlers.onAddDictionary);
    bindEvent(els.renameDictionary, 'click', handlers.onRenameDictionary);
    bindEvent(els.removeDictionary, 'click', handlers.onRemoveDictionary);
    bindEvent(els.addClass, 'click', handlers.onAddClass);
    bindEvent(els.renameClass, 'click', handlers.onRenameClass);
    bindEvent(els.addCategory, 'click', handlers.onAddCategory);
    bindEvent(els.renameCategory, 'click', handlers.onRenameCategory);
    bindEvent(els.addInstVar, 'click', handlers.onAddInstVar);
    bindEvent(els.addClassVar, 'click', handlers.onAddClassVar);
    bindEvent(els.addClassInstVar, 'click', handlers.onAddClassInstVar);
    bindEvent(els.renameVar, 'click', handlers.onRenameVar);
    bindEvent(els.removeVar, 'click', handlers.onRemoveVar);
    bindEvent(els.moveClass, 'click', handlers.onMoveClass);
    bindEvent(els.removeClass, 'click', handlers.onRemoveClass);
    bindEvent(els.refresh, 'click', handlers.onRefresh);
    bindEvent(els.browseClass, 'click', handlers.onBrowseClass);
    bindEvent(els.browseCategory, 'click', handlers.onBrowseCategory);
    bindEvent(els.browseMethod, 'click', handlers.onBrowseMethod);
    bindEvent(els.newMethod, 'click', handlers.onNewMethod);
    bindEvent(els.moveMethod, 'click', handlers.onMoveMethod);
    bindEvent(els.removeMethod, 'click', handlers.onRemoveMethod);
    bindEvent(els.removeCategory, 'click', handlers.onRemoveCategory);
    bindEvent(els.hierarchy, 'click', handlers.onHierarchy);
    bindEvent(els.versions, 'click', handlers.onVersions);
    bindEvent(els.references, 'click', handlers.onReferences);
    bindEvent(els.methodText, 'click', handlers.onMethodText);
    bindEvent(els.inspectDictionary, 'click', handlers.onInspectDictionary);
    bindEvent(els.inspectClass, 'click', handlers.onInspectClass);
    bindEvent(els.inspectMethod, 'click', handlers.onInspectMethod);
    bindEvent(els.inspectInstances, 'click', handlers.onInspectInstances);
    bindEvent(els.senders, 'click', handlers.onSenders);
    bindEvent(els.implementors, 'click', handlers.onImplementors);
    bindEvent(els.fileOut, 'click', handlers.onFileOut);
    bindEvent(els.createAccessors, 'click', handlers.onCreateAccessors);
    bindEvent(els.continueTx, 'click', handlers.onContinueTx);
    bindEvent(els.abortTx, 'click', handlers.onAbortTx);
    bindEvent(els.commit, 'click', handlers.onCommit);
    bindEvent(els.compile, 'click', handlers.onCompile);
    bindEvent(els.autoCommit, 'change', handlers.onAutoCommitChange);
    bindEvent(els.meta, 'change', handlers.onMetaChange);
  }

  return {
    applyClassBrowserActionState,
    bindClassBrowserToolbarActions,
  };
});
