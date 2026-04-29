(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TaskbarRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const globalRoot = typeof globalThis !== 'undefined' ? globalThis : this;
  const taskbarStateApi = typeof module === 'object' && module.exports
    ? require('./taskbar_state_runtime.js')
    : (globalRoot.TaskbarStateRuntime || {});
  const dockLauncherApi = typeof module === 'object' && module.exports
    ? require('./dock_launcher_runtime.js')
    : (globalRoot.DockLauncherRuntime || {});
  const dockSurfaceApi = typeof module === 'object' && module.exports
    ? require('./dock_surface_runtime.js')
    : (globalRoot.DockSurfaceRuntime || {});

  function createTaskbarRuntime(deps = {}) {
    let launcherRuntime = null;
    let surfaceRuntime = null;
    let initialised = false;

    const stateRuntime = taskbarStateApi.createTaskbarStateRuntime({
      ...deps,
      onUiChanged() {
        surfaceRuntime?.renderTaskbarWindowTypeButtons?.();
        launcherRuntime?.renderDockLauncher?.();
      },
    });

    launcherRuntime = dockLauncherApi.createDockLauncherRuntime({
      ...deps,
      getStatusErrorCount() {
        return stateRuntime.getStatusErrorCount();
      },
      getHaltedThreadCount() {
        return stateRuntime.getHaltedThreadCount();
      },
      getLatestHaltedThreads() {
        return stateRuntime.getLatestHaltedThreads();
      },
      closeDockContextMenu() {
        surfaceRuntime?.closeDockContextMenu?.();
      },
      closeDockWindowPreview() {
        surfaceRuntime?.closeDockWindowPreview?.();
      },
      isDockContextMenuOpen() {
        return surfaceRuntime?.isDockContextMenuOpen?.() || false;
      },
      setDockLauncherOpen(nextOpen, options = {}) {
        return launcherRuntime?.setDockLauncherOpen?.(nextOpen, options);
      },
      runDockLauncherCommand(command, value) {
        return launcherRuntime?.runDockLauncherCommand?.(command, value);
      },
    });

    surfaceRuntime = dockSurfaceApi.createDockSurfaceRuntime({
      ...deps,
      getHaltedThreadCount() {
        return stateRuntime.getHaltedThreadCount();
      },
      getStatusErrorCount() {
        return stateRuntime.getStatusErrorCount();
      },
      setDockLauncherOpen(nextOpen, options = {}) {
        return launcherRuntime?.setDockLauncherOpen?.(nextOpen, options);
      },
      runDockLauncherCommand(command, value) {
        return launcherRuntime?.runDockLauncherCommand?.(command, value);
      },
      isDockLauncherOpen() {
        return launcherRuntime?.isDockLauncherOpen?.() || false;
      },
    });

    function initialise() {
      if (initialised) return;
      initialised = true;
      stateRuntime.renderTaskbarConnectionOverride();
      surfaceRuntime.initialise();
      launcherRuntime.initialise();
      surfaceRuntime.renderTaskbarWindowTypeButtons();
      launcherRuntime.renderDockLauncher();
    }

    return {
      initialise,
      persistConnectionOverride: stateRuntime.persistConnectionOverride,
      clearConnectionOverride: stateRuntime.clearConnectionOverride,
      connectionOverrideHeadersFor: stateRuntime.connectionOverrideHeadersFor,
      buildShellForOverride: stateRuntime.buildShellForOverride,
      getConnectionOverrideHeaders: stateRuntime.getConnectionOverrideHeaders,
      summarizeConnectionOverride: stateRuntime.summarizeConnectionOverride,
      renderTaskbarConnectionOverride: stateRuntime.renderTaskbarConnectionOverride,
      getTaskbarWindowKinds: surfaceRuntime.getTaskbarWindowKinds,
      getManagedWindowsByKinds: surfaceRuntime.getManagedWindowsByKinds,
      getLatestHaltedThreads: stateRuntime.getLatestHaltedThreads,
      setLatestHaltedThreads: stateRuntime.setLatestHaltedThreads,
      getHaltedThreadCount: stateRuntime.getHaltedThreadCount,
      getStatusHistory: stateRuntime.getStatusHistory,
      getStatusHistorySummary: stateRuntime.getStatusHistorySummary,
      clearStatusHistory: stateRuntime.clearStatusHistory,
      recordStatusEntry: stateRuntime.recordStatusEntry,
      renderTaskbarWindowTypeButtons: surfaceRuntime.renderTaskbarWindowTypeButtons,
      renderDockLauncher: launcherRuntime.renderDockLauncher,
      setDockLauncherOpen: launcherRuntime.setDockLauncherOpen,
      runDockLauncherCommand: launcherRuntime.runDockLauncherCommand,
      isDockLauncherOpen: launcherRuntime.isDockLauncherOpen,
      notifyStatusHistoryUpdated: stateRuntime.notifyStatusHistoryUpdated,
      notifyLiveWindowUpdated: stateRuntime.notifyLiveWindowUpdated,
      closeDockContextMenu: surfaceRuntime.closeDockContextMenu,
      closeDockWindowPreview: surfaceRuntime.closeDockWindowPreview,
      isDockContextMenuOpen: surfaceRuntime.isDockContextMenuOpen,
    };
  }

  return {
    createTaskbarRuntime,
  };
});
