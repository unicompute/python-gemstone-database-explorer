(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ClassBrowserWorkflow = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const globalRoot = typeof globalThis !== 'undefined' ? globalThis : this;
  const loaderApi = globalRoot.ClassBrowserLoader || {};
  const queryApi = globalRoot.ClassBrowserQueryActions || {};
  const writeApi = globalRoot.ClassBrowserWriteActions || {};

  function createClassBrowserWorkflow(deps = {}) {
    const loader = loaderApi.createClassBrowserLoaderWorkflow(deps);
    const query = queryApi.createClassBrowserQueryActions({ ...deps, ...loader });
    const write = writeApi.createClassBrowserWriteActions({ ...deps, ...loader });

    return {
      ...loader,
      ...query,
      ...write,
    };
  }

  return {
    createClassBrowserWorkflow,
  };
});
