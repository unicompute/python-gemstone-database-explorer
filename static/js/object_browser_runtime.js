(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ObjectBrowserRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const tabRuntime = (typeof globalThis !== 'undefined' ? globalThis : this).ObjectBrowserTabRuntime || {};
  const collectionRuntime = (typeof globalThis !== 'undefined' ? globalThis : this).ObjectBrowserCollectionRuntime || {};
  const methodBrowserRuntime = (typeof globalThis !== 'undefined' ? globalThis : this).ObjectBrowserMethodBrowser || {};
  const windowRuntime = (typeof globalThis !== 'undefined' ? globalThis : this).ObjectBrowserWindowRuntime || {};

  return {
    appendRenderedValueChips: tabRuntime.appendRenderedValueChips,
    renderAssociationPairs: tabRuntime.renderAssociationPairs,
    makeValCellFromState: tabRuntime.makeValCellFromState,
    renderCustomTab: tabRuntime.renderCustomTab,
    renderObjectCard: tabRuntime.renderObjectCard,
    renderInstances: collectionRuntime.renderInstances,
    renderConstants: collectionRuntime.renderConstants,
    renderModules: collectionRuntime.renderModules,
    openMethodBrowser: methodBrowserRuntime.openMethodBrowser,
    createObjectBrowserWindowRuntime: windowRuntime.createObjectBrowserWindowRuntime,
    loadObject: windowRuntime.loadObject,
    showInspectorTab: windowRuntime.showInspectorTab,
  };
});
