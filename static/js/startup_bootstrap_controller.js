(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./startup_bootstrap_model.js'));
    return;
  }
  if (root) {
    root.StartupBootstrapController = factory(root.StartupBootstrapModel);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (startupBootstrapModel) {
  const model = startupBootstrapModel || {
    buildStartupRootState(data = {}) {
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
    },
    hasNonConnectionManagedWindows(windows, readWindowState) {
      const items = Array.isArray(windows) ? windows : [];
      return items.some(win => {
        const id = typeof win === 'string' ? win : win?.id;
        const state = typeof readWindowState === 'function' ? (readWindowState(id) || {}) : {};
        return state.kind !== 'connection';
      });
    },
  };

  async function notifyStartupFailure(deps = {}, error, options = {}) {
    const message = error?.message || String(error || 'connection failed');
    const statusPrefix = options.statusPrefix || 'failed: ';
    deps.setStatus?.(false, `${statusPrefix}${message}`);
    const preflight = await deps.resolveConnectionPreflight?.(error);
    if (typeof options.onFailure === 'function') {
      await options.onFailure(preflight, error);
    } else if (options.showConnectionWindow !== false) {
      deps.openConnectionWindow?.({
        preflight,
        startupError: message,
        autoRefresh: false,
      });
    }
    return preflight || null;
  }

  async function initialiseRuntimeConnection(deps = {}, options = {}) {
    const {showConnectionWindow = true, onFailure = null} = options;
    try {
      const data = await deps.fetchIds?.();
      deps.rememberLastSuccessfulConnectionOverride?.(deps.readConnectionOverride?.());
      deps.setStartupState?.(model.buildStartupRootState(data));
      deps.setStatus?.(true, 'connected');
    } catch (error) {
      const preflight = await notifyStartupFailure(deps, error, {
        statusPrefix: 'failed: ',
        showConnectionWindow,
        onFailure,
      });
      return {connected: false, preflight, error};
    }
    try {
      await deps.loadRuntimeVersionInfo?.();
      return {connected: true, versionLoaded: true};
    } catch (error) {
      const preflight = await notifyStartupFailure(deps, error, {
        statusPrefix: 'version check failed: ',
        showConnectionWindow,
        onFailure,
      });
      return {connected: true, versionLoaded: false, preflight, error};
    }
  }

  async function restoreDesktopAfterConnect(deps = {}, options = {}) {
    const windows = deps.getManagedWindows?.() || [];
    const hasOpenNonConnection = model.hasNonConnectionManagedWindows(
      windows,
      deps.getWindowState
    );
    let restored = false;
    if (!hasOpenNonConnection) {
      restored = await deps.restoreSavedLayout?.({
        excludeKinds: ['class-browser', 'debugger'],
        ...(options.layoutOptions || {}),
      });
      if (!restored) deps.openDefaultStartupLayout?.();
    }
    deps.startThreadPoller?.();
    deps.markStartupBootstrapped?.(true);
    deps.persistWindowLayout?.();
    if (options.statusMessage) deps.setStatus?.(true, options.statusMessage);
    return {
      restored: !!restored,
      skippedRestore: !!hasOpenNonConnection,
    };
  }

  async function runStartupSequence(deps = {}, options = {}) {
    const initResult = await initialiseRuntimeConnection(deps, options.initOptions || {});
    if (!initResult.connected) return false;
    await restoreDesktopAfterConnect(deps, {
      layoutOptions: options.layoutOptions || {},
    });
    return true;
  }

  async function retryStartupRecovery(deps = {}, options = {}) {
    return restoreDesktopAfterConnect(deps, {
      layoutOptions: options.layoutOptions || {source: 'recoverable'},
      statusMessage: options.statusMessage || 'startup recovered',
    });
  }

  return {
    initialiseRuntimeConnection,
    restoreDesktopAfterConnect,
    runStartupSequence,
    retryStartupRecovery,
  };
});
