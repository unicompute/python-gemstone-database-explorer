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
    return {
      startupIds: {
        persistentRootId: data.persistentRootId,
        systemId: data.gemStoneSystemId,
        globalsId: data.globalsId,
        defaultWorkspaceId: data.defaultWorkspaceId,
      },
      roots: {
        UserGlobals: data.persistentRootId,
        Globals: data.globalsId,
        System: data.gemStoneSystemId,
        RubyWorkspace: data.defaultWorkspaceId,
      },
    };
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
