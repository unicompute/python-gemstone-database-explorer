(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.QueryHelperWindowModel = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function readWindowStateEntry(windowState, windowId) {
    if (!windowState || !windowId) return null;
    if (typeof windowState.get === 'function') {
      return windowState.get(windowId) || null;
    }
    if (typeof windowState === 'object') {
      return windowState[windowId] || null;
    }
    return null;
  }

  function getClassBrowserRuntime(sourceWindowId, windowState) {
    const sourceState = readWindowStateEntry(windowState, sourceWindowId);
    if (!sourceState || sourceState.kind !== 'class-browser') return null;
    return sourceState.browserRuntime || null;
  }

  async function waitForRuntime(runtime) {
    if (!runtime) return null;
    await Promise.resolve(runtime.ready);
    return runtime;
  }

  async function openClassBrowserRuntime(browserOptions = {}, deps = {}) {
    const openClassBrowser = deps.openClassBrowser;
    if (typeof openClassBrowser !== 'function') {
      throw new Error('Class Browser could not be opened');
    }
    const browser = openClassBrowser(browserOptions) || null;
    const sourceWindowId = browser?.id || null;
    const runtime = getClassBrowserRuntime(sourceWindowId, deps.windowState);
    if (!runtime) {
      throw new Error('Class Browser could not be opened');
    }
    await waitForRuntime(runtime);
    return {browser, runtime, sourceWindowId, created: true};
  }

  async function resolveClassBrowserRuntime(sourceWindowId, browserOptions = {}, deps = {}) {
    const existingRuntime = getClassBrowserRuntime(sourceWindowId, deps.windowState);
    if (existingRuntime) {
      await waitForRuntime(existingRuntime);
      return {runtime: existingRuntime, sourceWindowId, created: false};
    }
    return openClassBrowserRuntime(browserOptions, deps);
  }

  return {
    getClassBrowserRuntime,
    openClassBrowserRuntime,
    resolveClassBrowserRuntime,
  };
});
