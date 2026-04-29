(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./startup_bootstrap_controller.js'));
    return;
  }
  if (root) {
    root.AppBootstrapRuntime = factory(root.StartupBootstrapController);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (StartupBootstrapController) {
  function createAppBootstrapRuntime(deps = {}) {
    const controller = deps.startupBootstrapController || StartupBootstrapController;
    let threadPollTimer = null;

    function setStartupState(state = {}) {
      deps.writeStartupIds?.(state.startupIds || {});
      deps.writeRoots?.(state.roots || {});
      if (deps.isDockLauncherOpen?.()) deps.renderDockLauncher?.({focusSearch: false});
    }

    function markStartupBootstrapped(value) {
      deps.writeStartupBootstrapped?.(!!value);
    }

    async function init(options = {}) {
      const result = await controller.initialiseRuntimeConnection({
        fetchIds: () => deps.api('/ids'),
        readConnectionOverride: deps.readConnectionOverride,
        rememberLastSuccessfulConnectionOverride: deps.rememberLastSuccessfulConnectionOverride,
        setStartupState,
        setStatus: deps.setStatus,
        loadRuntimeVersionInfo: deps.loadRuntimeVersionInfo,
        resolveConnectionPreflight: deps.resolveConnectionPreflight,
        openConnectionWindow: deps.openConnectionWindow,
      }, options);
      return !!result.connected;
    }

    async function refreshHaltedThreadsBar() {
      const bar = deps.document.getElementById('halted-threads-bar');
      try {
        const haltedThreadsSessionChannel = 'debug-w';
        const data = await deps.api('/debug/threads', {sessionChannel: haltedThreadsSessionChannel});
        const haltedThreads = data.success && Array.isArray(data.threads) ? data.threads.slice() : [];
        deps.setLatestHaltedThreads?.(haltedThreads);
        if (bar) bar.innerHTML = '';
        if (bar && haltedThreads.length) {
          const label = deps.document.createElement('span');
          label.style.cssText = 'font-size:10px;color:#f38ba8;margin-right:3px';
          label.textContent = 'Halted:';
          bar.appendChild(label);
          haltedThreads.forEach(thread => {
            const pillText = thread.displayText || thread.sourcePreview || thread.exceptionText || thread.printString || `oop:${thread.oop}`;
            const pillTitle = [thread.sourcePreview, thread.exceptionText ? `⚑ ${thread.exceptionText}` : '', thread.printString]
              .filter(Boolean)
              .join('\n');
            const pill = deps.document.createElement('span');
            pill.className = 'thread-pill';
            pill.textContent = pillText.slice(0, 30);
            pill.title = pillTitle || pillText;
            pill.addEventListener('click', () => deps.openDebugger(thread, null, {sessionChannel: haltedThreadsSessionChannel}));
            bar.appendChild(pill);
          });
        }
      } catch (_) {
        deps.setLatestHaltedThreads?.([]);
        if (bar) bar.innerHTML = '';
      }
    }

    function maybeOpenEvalDebugger(rv, code, sourceWindowId = null) {
      const threadOop = Number(rv?.debugThreadOop || 0);
      if (!(threadOop > 20)) return false;
      refreshHaltedThreadsBar();
      const sourceSessionChannel = sourceWindowId ? deps.readWindowState(sourceWindowId)?.sessionChannel || '' : '';
      deps.openDebugger({
        oop: threadOop,
        printString: rv?.inspection || 'Debugger',
        exceptionText: rv?.exceptionText || rv?.inspection || 'Exception',
        sourcePreview: rv?.sourcePreview || code || '',
      }, null, {
        sourceWindowId,
        sessionChannel: deps.exactWriteSessionChannel(sourceSessionChannel),
      });
      return true;
    }

    function startThreadPoller() {
      deps.clearInterval(threadPollTimer);
      refreshHaltedThreadsBar();
      threadPollTimer = deps.setInterval(refreshHaltedThreadsBar, 3000);
    }

    async function startup() {
      await controller.runStartupSequence({
        fetchIds: () => deps.api('/ids'),
        readConnectionOverride: deps.readConnectionOverride,
        rememberLastSuccessfulConnectionOverride: deps.rememberLastSuccessfulConnectionOverride,
        setStartupState,
        setStatus: deps.setStatus,
        loadRuntimeVersionInfo: deps.loadRuntimeVersionInfo,
        resolveConnectionPreflight: deps.resolveConnectionPreflight,
        openConnectionWindow: deps.openConnectionWindow,
        getManagedWindows: deps.getManagedWindows,
        getWindowState: deps.getWindowState,
        restoreSavedLayout: deps.restoreSavedLayout,
        openDefaultStartupLayout: deps.openDefaultStartupLayout,
        startThreadPoller,
        markStartupBootstrapped,
        persistWindowLayout: deps.persistWindowLayout,
      });
    }

    return {
      setStartupState,
      markStartupBootstrapped,
      init,
      refreshHaltedThreadsBar,
      maybeOpenEvalDebugger,
      startThreadPoller,
      startup,
    };
  }

  return {
    createAppBootstrapRuntime,
  };
});
