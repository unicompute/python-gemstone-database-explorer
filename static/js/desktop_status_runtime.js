(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DesktopStatusRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createDesktopStatusRuntime(deps = {}) {
    const documentNode = deps.document || globalThis.document;
    const statusDotEl = deps.statusDotEl || documentNode?.getElementById?.('status-dot') || null;
    const statusTextEl = deps.statusTextEl || documentNode?.getElementById?.('status-txt') || null;
    const taskbarVersionEl = deps.taskbarVersionEl || documentNode?.getElementById?.('taskbar-version') || null;

    function currentStatusSource() {
      const focused =
        documentNode?.querySelector?.('.win.focused') ||
        deps.getFocusedOrTopWindow?.() ||
        null;
      if (!focused) {
        return {
          sourceWindowId: null,
          sourceTitle: 'Desktop',
          sourceKind: 'desktop',
        };
      }
      const state = deps.readWindowState?.(focused.id) || {};
      return {
        sourceWindowId: focused.id,
        sourceTitle:
          focused.querySelector?.('.win-title')?.textContent?.trim() ||
          state.kind ||
          'Window',
        sourceKind: state.kind || 'window',
      };
    }

    function renderTaskbarVersion(info) {
      if (!taskbarVersionEl) return;
      const parts = [];
      if (info?.app) parts.push(`Explorer ${info.app}`);
      if (info?.stone) parts.push(`GemStone ${info.stone}`);
      taskbarVersionEl.textContent = parts.join(' · ');
    }

    function setStatus(ok, msg) {
      if (statusDotEl) statusDotEl.className = ok ? '' : 'error';
      if (statusTextEl) statusTextEl.textContent = msg;
      deps.recordStatusEntry?.(ok, msg);
    }

    async function loadRuntimeVersionInfo() {
      const data = await deps.fetchVersion?.();
      if (data?.success) {
        deps.onRuntimeVersionLoaded?.(data);
        renderTaskbarVersion(data);
      }
      return data;
    }

    return {
      currentStatusSource,
      renderTaskbarVersion,
      setStatus,
      loadRuntimeVersionInfo,
    };
  }

  return {
    createDesktopStatusRuntime,
  };
});
