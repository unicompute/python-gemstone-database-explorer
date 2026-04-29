(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.StartupLayoutRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createStartupLayoutRuntime(deps = {}) {
    const windowNode = deps.window || globalThis;

    function openDefaultStartupLayout() {
      const startupIds = deps.getStartupIds?.() || {};
      const roots = deps.getRoots?.() || {};
      const vw = windowNode.innerWidth;
      const vh = Math.max(420, windowNode.innerHeight - 42);

      const hashOop = startupIds.persistentRootId || roots.UserGlobals || roots.Globals;
      const hashLabel = 'Persistent Root';
      const hashW = Math.min(vw - 32, Math.max(900, Math.floor(vw * 0.72)));
      const hashH = Math.min(300, Math.max(220, Math.floor(vh * 0.34)));
      const hashX = Math.max(16, vw - hashW - 16);
      const hashY = 10;

      const systemW = Math.min(vw - 32, Math.max(980, Math.floor(vw * 0.9)));
      const systemH = Math.min(340, Math.max(280, Math.floor(vh * 0.46)));
      const systemX = 20;
      const systemY = Math.min(Math.max(180, hashY + hashH + 34), Math.max(20, vh - systemH - 20));

      if (hashOop) {
        deps.openObjectBrowser?.(hashOop, hashLabel, hashX, hashY, hashW, hashH, {
          initialTab: 'instvars',
          compact: true,
        });
      } else {
        deps.openObjectBrowser?.(undefined, undefined, 10, 10, 520, 480);
      }

      if (startupIds.systemId || roots.System) {
        deps.openObjectBrowser?.(
          startupIds.systemId || roots.System,
          'System',
          systemX,
          systemY,
          systemW,
          systemH,
          { initialTab: 'control', compact: true },
        );
      }

      deps.setCascadePosition?.(80, 80);
    }

    function resetStartupLayout() {
      deps.clearWindowLayout?.();
      deps.setSuppressWindowLayoutPersist?.(true);
      try {
        deps.closeAllWindows?.();
        openDefaultStartupLayout();
      } finally {
        deps.setSuppressWindowLayoutPersist?.(false);
        deps.persistWindowLayout?.();
      }
    }

    return {
      openDefaultStartupLayout,
      resetStartupLayout,
    };
  }

  return {
    createStartupLayoutRuntime,
  };
});
