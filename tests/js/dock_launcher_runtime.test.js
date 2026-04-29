const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/dock_launcher_runtime.js');

test('dock launcher runtime builds pinned, system, and open-window sections', () => {
  let capturedView = null;
  const dockLauncherRuntime = runtime.createDockLauncherRuntime({
    document: {
      addEventListener() {},
    },
    window: {
      requestAnimationFrame() {},
    },
    localStorage: {},
    dockLauncherBtn: {
      contains() {
        return false;
      },
    },
    dockLauncherPanel: {
      innerHTML: '',
      querySelector() {
        return null;
      },
      contains() {
        return false;
      },
    },
    maglevReportDefs: {},
    getStartupIds() {
      return {};
    },
    getRoots() {
      return {};
    },
    getStatusErrorCount() {
      return 2;
    },
    getHaltedThreadCount() {
      return 1;
    },
    readPinnedCommands() {
      return ['open-workspace'];
    },
    normalizePinnedCommands(commands) {
      return commands;
    },
    writePinnedCommands(commands) {
      return commands;
    },
    togglePinnedCommand(commands, command, allowed) {
      return commands.includes(command)
        ? commands.filter(item => item !== command)
        : commands.concat(command).filter(item => allowed.includes(item));
    },
    collectOpenWindowSummaries() {
      return [
        {
          id: 'workspace-1',
          title: 'Workspace 1',
          kind: 'workspace',
          focused: false,
          minimised: false,
        },
      ];
    },
    buildDockLauncherView(view) {
      capturedView = view;
      return {
        html: '<div></div>',
        visibleItems: [],
        selectedIndex: -1,
      };
    },
    applyDockLauncherState() {},
    bindDockLauncherActions() {},
  });

  dockLauncherRuntime.renderDockLauncher();

  assert.ok(capturedView);
  const pinnedSection = capturedView.sections.find(section => section.key === 'pinned');
  const appsSection = capturedView.sections.find(section => section.key === 'apps');
  const systemSection = capturedView.sections.find(section => section.key === 'system');
  const openWindowsSection = capturedView.sections.find(section => section.key === 'open-windows');

  assert.equal(pinnedSection.items[0].command, 'open-workspace');
  assert.equal(pinnedSection.items[0].pinned, true);
  assert.equal(appsSection.items.find(item => item.command === 'open-status-log').badgeText, '2');
  assert.equal(systemSection.items[0].command, 'open-halted-debugger');
  assert.equal(openWindowsSection.items[0].value, 'workspace-1');
});

test('dock launcher runtime dispatches launcher commands', () => {
  let objectBrowserOpens = 0;
  let launcherState = null;
  const dockLauncherRuntime = runtime.createDockLauncherRuntime({
    document: {
      addEventListener() {},
    },
    window: {
      requestAnimationFrame() {},
    },
    localStorage: {},
    dockLauncherBtn: {
      contains() {
        return false;
      },
    },
    dockLauncherPanel: {
      innerHTML: '',
      querySelector() {
        return null;
      },
      contains() {
        return false;
      },
    },
    maglevReportDefs: {},
    getStartupIds() {
      return {};
    },
    getRoots() {
      return {};
    },
    getStatusErrorCount() {
      return 0;
    },
    getHaltedThreadCount() {
      return 0;
    },
    readPinnedCommands() {
      return [];
    },
    normalizePinnedCommands(commands) {
      return commands;
    },
    writePinnedCommands(commands) {
      return commands;
    },
    collectOpenWindowSummaries() {
      return [];
    },
    buildDockLauncherView() {
      return {
        html: '<div></div>',
        visibleItems: [],
        selectedIndex: -1,
      };
    },
    applyDockLauncherState(_btn, _panel, open) {
      launcherState = open;
    },
    bindDockLauncherActions() {},
    openObjectBrowser() {
      objectBrowserOpens += 1;
    },
    closeDockContextMenu() {},
    closeDockWindowPreview() {},
  });

  assert.equal(dockLauncherRuntime.runDockLauncherCommand('open-object-browser'), true);
  dockLauncherRuntime.setDockLauncherOpen(true);

  assert.equal(objectBrowserOpens, 1);
  assert.equal(dockLauncherRuntime.isDockLauncherOpen(), true);
  assert.equal(launcherState, true);
});

test('dock launcher runtime restores search focus when rerendering an open launcher', () => {
  const search = {
    id: 'dock-launcher-search',
    value: 'browser',
    focusCalls: 0,
    focus() {
      this.focusCalls += 1;
    },
    setSelectionRange() {},
  };
  const panel = {
    innerHTML: '',
    querySelector(selector) {
      return selector === '.dock-launcher-search' ? search : null;
    },
    contains(node) {
      return node === search;
    },
  };
  const documentNode = {
    activeElement: search,
    addEventListener() {},
  };
  const dockLauncherRuntime = runtime.createDockLauncherRuntime({
    document: documentNode,
    window: {
      requestAnimationFrame() {},
    },
    localStorage: {},
    dockLauncherBtn: {
      contains() {
        return false;
      },
    },
    dockLauncherPanel: panel,
    maglevReportDefs: {},
    getStartupIds() {
      return {};
    },
    getRoots() {
      return {};
    },
    getStatusErrorCount() {
      return 0;
    },
    getHaltedThreadCount() {
      return 0;
    },
    readPinnedCommands() {
      return [];
    },
    normalizePinnedCommands(commands) {
      return commands;
    },
    writePinnedCommands(commands) {
      return commands;
    },
    collectOpenWindowSummaries() {
      return [];
    },
    buildDockLauncherView() {
      return {
        html: '<div><input class="dock-launcher-search"></div>',
        visibleItems: [],
        selectedIndex: -1,
      };
    },
    applyDockLauncherState() {},
    bindDockLauncherActions() {},
    closeDockContextMenu() {},
    closeDockWindowPreview() {},
  });

  dockLauncherRuntime.setDockLauncherOpen(true, {clearQuery: false});
  search.focusCalls = 0;
  dockLauncherRuntime.renderDockLauncher();

  assert.equal(search.focusCalls > 0, true);
});
