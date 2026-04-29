(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DockLauncherRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createDockLauncherRuntime(deps = {}) {
    const documentNode = deps.document || globalThis.document;
    const windowNode = deps.window || globalThis;
    const storage = deps.localStorage || globalThis.localStorage;
    const dockLauncherBtn = deps.dockLauncherBtn || null;
    const dockLauncherPanel = deps.dockLauncherPanel || null;

    let dockLauncherOpen = false;
    let dockLauncherQuery = '';
    let dockLauncherVisibleItems = [];
    let dockLauncherSelectedIndex = 0;
    let dockLauncherPinnedCommands = [];
    let dockLauncherPinnedCommandsInitialised = false;

    function hasMaglevRuntimeSurface() {
      const startupIds = deps.getStartupIds?.() || {};
      const roots = deps.getRoots?.() || {};
      return !!(startupIds.defaultWorkspaceId || roots.RubyWorkspace);
    }

    function buildDockLauncherAppLaunchers() {
      const statusErrorCount = deps.getStatusErrorCount?.() || 0;
      const launchers = [
        { command: 'open-object-browser', title: 'Object Browser', description: 'Inspect roots and live objects', keywords: 'object browser inspect roots' },
        { command: 'open-class-browser', title: 'Class Browser', description: 'Browse classes, methods, and versions', keywords: 'class browser methods versions' },
        { command: 'open-workspace', title: 'Workspace', description: 'Scratchpad with transaction controls', keywords: 'workspace evaluate transaction' },
        { command: 'open-symbol-list', title: 'Symbol List', description: 'Inspect users, dictionaries, and bindings', keywords: 'symbol list dictionaries bindings' },
        { command: 'open-web-browser', title: 'Web Browser', description: 'Open a browser window on the desktop', keywords: 'web browser url' },
        { command: 'open-connection', title: 'Connection', description: 'Connection diagnostics and target overrides', keywords: 'connection diagnostics override stone' },
        { command: 'open-about', title: 'About', description: 'Runtime details and support bundle export', keywords: 'about diagnostics bundle' },
        {
          command: 'open-status-log',
          title: 'Status Log',
          description: 'Review status history and export logs',
          keywords: 'status log errors history',
          meta: statusErrorCount > 0 ? `${statusErrorCount} error${statusErrorCount === 1 ? '' : 's'}` : '',
          badgeText: statusErrorCount > 0 ? String(statusErrorCount) : '',
          badgeTone: 'error',
        },
      ];
      if (hasMaglevRuntimeSurface()) {
        launchers.splice(3, 0, {
          command: 'open-ruby-workspace',
          title: 'Ruby Workspace',
          description: 'MagLev Ruby scratchpad bound to RubyWorkspace default_instance',
          keywords: 'ruby workspace maglev scratchpad default_instance',
        });
        launchers.splice(4, 0,
          deps.maglevReportDefs['load-path'],
          deps.maglevReportDefs['loaded-features'],
          deps.maglevReportDefs['persistent-features'],
          deps.maglevReportDefs['finalizer-registry'],
        );
      }
      return launchers;
    }

    function getDockLauncherPinnedCommands(appLaunchers = buildDockLauncherAppLaunchers()) {
      const allowedCommands = appLaunchers.map(item => item.command);
      if (!dockLauncherPinnedCommandsInitialised) {
        dockLauncherPinnedCommands = deps.readPinnedCommands(storage, undefined, allowedCommands);
        dockLauncherPinnedCommandsInitialised = true;
      } else {
        dockLauncherPinnedCommands = deps.normalizePinnedCommands(dockLauncherPinnedCommands, allowedCommands);
      }
      return dockLauncherPinnedCommands;
    }

    function persistDockLauncherPinnedCommands(commands, appLaunchers = buildDockLauncherAppLaunchers()) {
      const allowedCommands = appLaunchers.map(item => item.command);
      dockLauncherPinnedCommands = deps.writePinnedCommands(commands, storage, undefined, allowedCommands);
      dockLauncherPinnedCommandsInitialised = true;
      return dockLauncherPinnedCommands;
    }

    function toggleDockLauncherPinned(command) {
      const appLaunchers = buildDockLauncherAppLaunchers();
      const allowedCommands = appLaunchers.map(item => item.command);
      const nextCommands = deps.togglePinnedCommand(
        getDockLauncherPinnedCommands(appLaunchers),
        command,
        allowedCommands
      );
      return persistDockLauncherPinnedCommands(nextCommands, appLaunchers);
    }

    function buildDockLauncherSections() {
      const appLaunchers = buildDockLauncherAppLaunchers();
      const pinnedSet = new Set(getDockLauncherPinnedCommands(appLaunchers));
      const haltedThreadCount = deps.getHaltedThreadCount?.() || 0;
      const pinned = appLaunchers
        .filter(item => pinnedSet.has(item.command))
        .map(item => ({ ...item, pinnable: true, pinned: true }));
      const apps = appLaunchers
        .filter(item => !pinnedSet.has(item.command))
        .map(item => ({ ...item, pinnable: true, pinned: false }));
      const system = [
        ...(haltedThreadCount > 0 ? [{
          command: 'open-halted-debugger',
          title: 'Halted Threads',
          description: 'Open the first halted thread in the debugger',
          keywords: 'halted threads debugger exception',
          meta: `${haltedThreadCount} halted`,
          badgeText: String(haltedThreadCount),
          badgeTone: 'error',
        }] : []),
        { command: 'open-window-links', title: 'Window Links', description: 'Inspect live window relationships', keywords: 'window links arrows related' },
        { command: 'open-window-groups', title: 'Window Groups', description: 'Inspect related window groups', keywords: 'window groups related' },
        { command: 'cascade', title: 'Cascade Windows', description: 'Cascade all desktop windows', keywords: 'cascade windows layout' },
        { command: 'tile', title: 'Tile Windows', description: 'Tile all desktop windows', keywords: 'tile windows layout' },
        { command: 'raise-related', title: 'Raise Related Windows', description: 'Bring the focused window group forward', keywords: 'raise related windows' },
        { command: 'minimise-all', title: 'Minimise All Windows', description: 'Collapse every open window', keywords: 'minimise all windows' },
        { command: 'close-others', title: 'Close Other Windows', description: 'Close every window except the focused one', keywords: 'close other windows' },
        { command: 'reset-startup', title: 'Reset Startup Layout', description: 'Forget the saved startup layout', keywords: 'reset startup layout' },
      ];
      const openWindows = deps.collectOpenWindowSummaries().map(summary => ({
        command: 'focus-window',
        value: summary.id,
        title: summary.title || summary.kind || summary.id,
        description: summary.kind ? summary.kind.replace(/-/g, ' ') : 'window',
        meta: summary.focused ? 'Focused' : (summary.minimised ? 'Minimised' : 'Open'),
        active: !!summary.focused,
        muted: !!summary.minimised,
        keywords: `${summary.kind || ''} ${summary.title || ''} ${summary.minimised ? 'minimised' : 'open'}`,
      }));
      return [
        { key: 'pinned', title: 'Pinned', layout: 'grid', items: pinned, emptyText: 'No pinned apps yet.' },
        { key: 'apps', title: 'Apps', layout: 'grid', items: apps, emptyText: 'All launcher apps are pinned.' },
        { key: 'system', title: 'Window Actions', layout: 'grid', items: system, emptyText: 'No actions available' },
        { key: 'open-windows', title: 'Open Windows', layout: 'list', items: openWindows, emptyText: 'No managed windows are open yet.' },
      ];
    }

    function renderDockLauncher(options = {}) {
      if (!dockLauncherPanel) return;
      const { focusSearch = false } = options;
      const activeElement = documentNode?.activeElement || null;
      const shouldRestoreSearchFocus =
        !!focusSearch ||
        !!(activeElement && (
          activeElement.id === 'dock-launcher-search' ||
          dockLauncherPanel.contains?.(activeElement)
        ));
      const view = deps.buildDockLauncherView({
        query: dockLauncherQuery,
        selectedIndex: dockLauncherSelectedIndex,
        sections: buildDockLauncherSections(),
      });
      dockLauncherVisibleItems = view.visibleItems || [];
      dockLauncherSelectedIndex = Number.isFinite(Number(view.selectedIndex)) ? Number(view.selectedIndex) : -1;
      dockLauncherPanel.innerHTML = view.html;
      deps.applyDockLauncherState(dockLauncherBtn, dockLauncherPanel, dockLauncherOpen);
      if (dockLauncherOpen && shouldRestoreSearchFocus) {
        const focusSearchInput = () => {
          const search = dockLauncherPanel.querySelector('.dock-launcher-search');
          if (!search) return;
          search.focus();
          search.setSelectionRange(search.value.length, search.value.length);
        };
        focusSearchInput();
        windowNode.requestAnimationFrame?.(focusSearchInput);
        setTimeout(focusSearchInput, 0);
        setTimeout(focusSearchInput, 50);
      }
    }

    function isDockLauncherOpen() {
      return dockLauncherOpen;
    }

    function setDockLauncherOpen(nextOpen, options = {}) {
      if (nextOpen) deps.closeDockContextMenu?.();
      if (nextOpen) deps.closeDockWindowPreview?.();
      dockLauncherOpen = !!nextOpen;
      if (!dockLauncherOpen && options.clearQuery !== false) {
        dockLauncherQuery = '';
      }
      if (!dockLauncherOpen) {
        dockLauncherSelectedIndex = 0;
      } else if (options.resetSelection !== false) {
        dockLauncherSelectedIndex = 0;
      }
      renderDockLauncher({ focusSearch: dockLauncherOpen });
    }

    function moveDockLauncherSelection(key) {
      const count = dockLauncherVisibleItems.length;
      if (!count) {
        dockLauncherSelectedIndex = -1;
        return;
      }
      switch (key) {
        case 'ArrowDown':
          dockLauncherSelectedIndex = dockLauncherSelectedIndex < 0 ? 0 : (dockLauncherSelectedIndex + 1) % count;
          break;
        case 'ArrowUp':
          dockLauncherSelectedIndex = dockLauncherSelectedIndex < 0 ? count - 1 : (dockLauncherSelectedIndex - 1 + count) % count;
          break;
        case 'Home':
          dockLauncherSelectedIndex = 0;
          break;
        case 'End':
          dockLauncherSelectedIndex = count - 1;
          break;
        default:
          return;
      }
    }

    function runDockLauncherCommand(command, value) {
      switch (command) {
        case 'open-object-browser': deps.openObjectBrowser(); break;
        case 'open-class-browser': deps.openClassBrowser(); break;
        case 'open-workspace': deps.openWorkspace(); break;
        case 'open-ruby-workspace': deps.openRubyWorkspace(); break;
        case 'open-maglev-load-path': deps.openMaglevReportWindow('load-path'); break;
        case 'open-maglev-loaded-features': deps.openMaglevReportWindow('loaded-features'); break;
        case 'open-maglev-persistent-features': deps.openMaglevReportWindow('persistent-features'); break;
        case 'open-maglev-finalizer-registry': deps.openMaglevReportWindow('finalizer-registry'); break;
        case 'open-symbol-list': deps.openSymbolList(); break;
        case 'open-web-browser': deps.openWebBrowser(); break;
        case 'open-connection': deps.openConnectionWindow(); break;
        case 'open-about': deps.openAboutWindow(); break;
        case 'open-status-log': deps.openStatusLogWindow(); break;
        case 'open-halted-debugger':
          if (!(deps.getLatestHaltedThreads?.() || []).length) return false;
          deps.openDebugger((deps.getLatestHaltedThreads?.() || [])[0], null, { sessionChannel: 'debug-w' });
          break;
        case 'open-window-links': deps.openWindowLinksWindow(); break;
        case 'open-window-groups': deps.openWindowGroupsWindow(); break;
        case 'cascade': deps.cascadeWindows(); break;
        case 'tile': deps.tileWindows(); break;
        case 'raise-related': deps.raiseRelatedWindows(); break;
        case 'minimise-all': deps.minimiseAllWindows(); break;
        case 'close-others': deps.closeOtherWindows(); break;
        case 'reset-startup': deps.resetStartupLayout(); break;
        case 'focus-window': {
          const win = documentNode.getElementById(String(value || ''));
          if (win) deps.revealWindow(win);
          break;
        }
        default:
          return false;
      }
      return true;
    }

    function initialise() {
      deps.bindDockLauncherActions({
        toggleBtn: dockLauncherBtn,
        panel: dockLauncherPanel,
        documentNode,
      }, {
        onToggle(event) {
          event.preventDefault();
          setDockLauncherOpen(!dockLauncherOpen, { clearQuery: !dockLauncherOpen });
        },
        onShortcutOpen(event) {
          event.preventDefault();
          if (!dockLauncherOpen) {
            setDockLauncherOpen(true, { clearQuery: false, resetSelection: true });
            return;
          }
          renderDockLauncher({ focusSearch: true });
        },
        onCommand(command, value) {
          if (!command) return;
          if (runDockLauncherCommand(command, value)) {
            setDockLauncherOpen(false);
          }
        },
        onPinToggle(command, event) {
          event?.preventDefault?.();
          if (!command) return;
          toggleDockLauncherPinned(command);
          renderDockLauncher({ focusSearch: dockLauncherOpen });
        },
        onMove(key, event) {
          if (!dockLauncherOpen) return;
          event?.preventDefault?.();
          moveDockLauncherSelection(key);
          renderDockLauncher({ focusSearch: true });
        },
        onFilter(value) {
          dockLauncherQuery = String(value || '');
          dockLauncherSelectedIndex = 0;
          renderDockLauncher({ focusSearch: true });
        },
        onSubmit() {
          const selected = dockLauncherVisibleItems[dockLauncherSelectedIndex] || dockLauncherVisibleItems[0];
          if (!selected) return;
          if (runDockLauncherCommand(selected.command, selected.value)) {
            setDockLauncherOpen(false);
          }
        },
        onEscape() {
          setDockLauncherOpen(false);
        },
      });

      documentNode.addEventListener('mousedown', event => {
        if (!dockLauncherOpen) return;
        const target = event.target;
        if (dockLauncherPanel.contains(target) || dockLauncherBtn.contains(target)) return;
        setDockLauncherOpen(false);
      }, true);
    }

    return {
      initialise,
      renderDockLauncher,
      setDockLauncherOpen,
      runDockLauncherCommand,
      isDockLauncherOpen,
      toggleDockLauncherPinned,
    };
  }

  return {
    createDockLauncherRuntime,
  };
});
