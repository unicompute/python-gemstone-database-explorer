(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.StartupBootstrapModel = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function buildStartupRootState(data = {}) {
    const startupIds = {
      persistentRootId: data.persistentRootId,
      systemId: data.gemStoneSystemId,
      globalsId: data.globalsId,
    };
    const roots = {
      UserGlobals: data.persistentRootId,
      Globals: data.globalsId,
      System: data.gemStoneSystemId,
    };
    if (data.defaultWorkspaceId !== undefined) {
      startupIds.defaultWorkspaceId = data.defaultWorkspaceId;
      roots.RubyWorkspace = data.defaultWorkspaceId;
    }
    return {startupIds, roots};
  }

  function hasNonConnectionManagedWindows(windows, readWindowState) {
    const items = Array.isArray(windows) ? windows : [];
    const getState = typeof readWindowState === 'function'
      ? readWindowState
      : () => ({});
    return items.some(win => {
      const id = typeof win === 'string' ? win : win?.id;
      const state = getState(id) || {};
      return state.kind !== 'connection';
    });
  }

  return {
    buildStartupRootState,
    hasNonConnectionManagedWindows,
  };
});
