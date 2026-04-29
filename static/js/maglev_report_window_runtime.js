(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.MaglevReportWindowRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createMaglevReportWindowRuntime(deps = {}) {
    let preview = null;

    async function load() {
      if (!preview) return;
      preview.textContent = `Loading ${deps.title}…`;
      try {
        const rv = await deps.api(`/maglev/report/${encodeURIComponent(String(deps.reportKey || '').trim())}`);
        if (rv?.title) {
          const titleText = String(rv.title || deps.title);
          deps.applyTitle?.(titleText, rv);
          deps.upsertWindowState?.(deps.id, {
            kind: 'maglev-report',
            reportKey: String(rv.reportKey || deps.reportKey || '').trim(),
            reportTitle: titleText,
          });
        }
        preview.textContent = String(rv?.text || `${deps.title}\n\n(empty)`);
      } catch (error) {
        preview.textContent = `${deps.title}\n\n${error?.message || error}`;
      }
    }

    function mount() {
      deps.body.innerHTML = `<pre class="qv-preview qv-preview-text"></pre>`;
      preview = deps.body.querySelector?.('pre') || null;
      deps.upsertWindowState?.(deps.id, {
        kind: 'maglev-report',
        reportKey: String(deps.reportKey || '').trim(),
        reportTitle: deps.title,
      });
      void load();
    }

    return {
      mount,
      load,
      getPreview: () => preview,
    };
  }

  return {
    createMaglevReportWindowRuntime,
  };
});
