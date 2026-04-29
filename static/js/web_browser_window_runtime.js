(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WebBrowserWindowRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createWebBrowserWindowRuntime(deps = {}) {
    let urlInput = null;
    let iframe = null;

    function syncWindowState() {
      deps.upsertWindowState?.(deps.id, {
        kind: 'web-browser',
        url: urlInput?.value || iframe?.src || deps.defaultUrl || '',
      });
    }

    function navigate() {
      if (!iframe || !urlInput) return;
      iframe.src = urlInput.value;
      syncWindowState();
    }

    function mount() {
      deps.body.style.cssText = 'display:flex;flex-direction:column;overflow:hidden;min-height:0';
      deps.body.innerHTML = `
        <div class="wb-urlbar" style="flex-shrink:0">
          <label>URL</label>
          <input class="wb-url-input" id="${deps.id}-url" type="text" value="${deps.escHtml(deps.defaultUrl || '')}">
          <button class="btn-ghost" id="${deps.id}-go">Go</button>
          <button class="btn-ghost" id="${deps.id}-reload">↺</button>
        </div>
        <div class="wb-iframe-wrap" style="flex:1;min-height:0;overflow:hidden">
          <iframe id="${deps.id}-iframe" src="${deps.escHtml(deps.defaultUrl || '')}" style="width:100%;height:100%;border:none;background:#fff"></iframe>
        </div>
      `;
      urlInput = deps.body.querySelector?.(`#${deps.id}-url`) || null;
      iframe = deps.body.querySelector?.(`#${deps.id}-iframe`) || null;
      deps.body.querySelector?.(`#${deps.id}-go`)?.addEventListener?.('click', navigate);
      deps.body.querySelector?.(`#${deps.id}-reload`)?.addEventListener?.('click', () => {
        if (!iframe) return;
        iframe.src = iframe.src;
        syncWindowState();
      });
      urlInput?.addEventListener?.('keydown', event => {
        if (event.key === 'Enter') navigate();
      });
      urlInput?.addEventListener?.('input', syncWindowState);
      iframe?.addEventListener?.('load', syncWindowState);
      syncWindowState();
    }

    return {
      mount,
      navigate,
      syncWindowState,
      getUrlInput: () => urlInput,
      getIframe: () => iframe,
    };
  }

  return {
    createWebBrowserWindowRuntime,
  };
});
