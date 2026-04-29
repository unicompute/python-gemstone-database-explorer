(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ClassBrowserToolbarRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createToolbarHandlers(deps = {}) {
    return {
      async onFindClass() {
        const currentClass = deps.getCurrentClass?.() || '';
        const className = await deps.requestTextModal?.('Find Class', 'Class name', currentClass, 'Object');
        if (!className) return;
        try {
          const loaded = await deps.locateAndSelectClass?.(className);
          if (!loaded) {
            deps.setBrowserStatus?.('Class selection cancelled');
            return;
          }
          deps.setBrowserStatus?.(`Selected ${className}`, 'ok');
        } catch (error) {
          deps.setBrowserStatus?.(error.message, 'error');
          deps.setStatus?.(false, error.message);
        }
      },
      onFindDictionary: () => deps.findDictionary?.(),
      onAddDictionary: () => deps.addDictionary?.(),
      onRenameDictionary: () => deps.renameDictionary?.(),
      onRemoveDictionary: () => deps.removeDictionary?.(),
      onAddClass: () => deps.addClass?.(),
      onRenameClass: () => deps.renameClass?.(),
      onAddCategory: () => deps.addCategory?.(),
      onRenameCategory: () => deps.renameCategory?.(),
      onAddInstVar: () => deps.addClassVariable?.('/class-browser/add-instance-variable', 'Add Instance Variable', `Instance variable name for ${deps.getCurrentClass?.()}`, 'slotName'),
      onAddClassVar: () => deps.addClassVariable?.('/class-browser/add-class-variable', 'Add Class Variable', `Class variable name for ${deps.getCurrentClass?.()}`, 'SharedState'),
      onAddClassInstVar: () => deps.addClassVariable?.('/class-browser/add-class-instance-variable', 'Add Class Instance Variable', `Class instance variable name for ${deps.getCurrentClass?.()}`, 'cachedState'),
      onRenameVar: () => deps.renameVariable?.(),
      onRemoveVar: () => deps.removeVariable?.(),
      onMoveClass: () => deps.moveClass?.(),
      onRemoveClass: () => deps.removeClass?.(),
      onRefresh: () => deps.refreshBrowser?.(),
      onBrowseClass: () => deps.browseClassDefinition?.(),
      onBrowseCategory: () => deps.browseCategory?.(),
      onBrowseMethod: () => deps.browseMethod?.(),
      onNewMethod: () => deps.startNewMethod?.(),
      onMoveMethod: () => deps.moveMethod?.(),
      onRemoveMethod: () => deps.removeMethod?.(),
      onRemoveCategory: () => deps.removeCategory?.(),
      onHierarchy: () => deps.showHierarchy?.(),
      onVersions: () => deps.showVersions?.(),
      onReferences: () => deps.runReferenceQuery?.(),
      onMethodText: () => deps.runMethodTextQuery?.(),
      onInspectDictionary: () => deps.inspectTarget?.('dictionary'),
      onInspectClass: () => deps.inspectTarget?.('class'),
      onInspectMethod: () => deps.inspectTarget?.('method'),
      onInspectInstances: () => deps.inspectTarget?.('instances'),
      onSenders: () => deps.runSelectorQuery?.('senders', 'Senders of selector:'),
      onImplementors: () => deps.runSelectorQuery?.('implementors', 'Implementors of selector:'),
      onFileOut: () => deps.fileOut?.(),
      onCreateAccessors: () => deps.createAccessors?.(),
      onContinueTx: () => deps.continueSession?.(),
      onAbortTx: () => deps.abortSession?.(),
      onCommit: () => deps.commitSession?.(),
      onCompile: () => deps.compileSource?.(),
      onAutoCommitChange() {
        const autoCommitEnabled = !!deps.readAutoCommitChecked?.();
        deps.storeAutoCommitEnabled?.(autoCommitEnabled);
        deps.setBrowserStatus?.(autoCommitEnabled ? 'Auto Commit enabled' : 'Auto Commit disabled', 'ok');
      },
      async onMetaChange() {
        const currentClass = deps.getCurrentClass?.();
        deps.applyMetaToggle?.();
        deps.ensureClassFilter?.(currentClass);
        await deps.loadProtocols?.();
      },
    };
  }

  return {
    createToolbarHandlers,
  };
});
