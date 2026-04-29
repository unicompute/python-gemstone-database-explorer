const test = require('node:test');
const assert = require('node:assert/strict');

const { createAppWindowsRuntime } = require('../../static/js/app_windows_runtime.js');

test('app windows runtime delegates window openers to composed runtimes', () => {
  const runtime = createAppWindowsRuntime({
    document: {
      createElement(tag) {
        return {
          tagName: tag.toUpperCase(),
          className: '',
          textContent: '',
          innerHTML: '',
          children: [],
          appendChild(child) {
            this.children.push(child);
          },
        };
      },
    },
    escHtml(value) { return String(value); },
    setStatus() {},
    createModalRuntime() {
      return {
        requestModal() {},
        openModal() {},
        requestTextModal() {},
        requestSelectModal() {},
        requestConfirmModal() {},
      };
    },
    createObjectBrowserAppRuntime() {
      return {
        openObjectBrowser(...args) {
          return ['object', ...args];
        },
      };
    },
    createClassBrowserAppRuntime() {
      return {
        openClassBrowser(options) {
          return ['class-browser', options];
        },
      };
    },
    createWorkspaceAppRuntime() {
      return {
        openExpressionWorkspace(options) {
          return ['expression-workspace', options];
        },
        openWorkspace(options) {
          return ['workspace', options];
        },
        openRubyWorkspace(options) {
          return ['ruby-workspace', options];
        },
        openMaglevReportWindow(reportKey, options) {
          return ['maglev-report', reportKey, options];
        },
        openWebBrowser(initialUrl, options) {
          return ['web-browser', initialUrl, options];
        },
        openTextWindow(title, text, taskbarLabel) {
          return ['text', title, text, taskbarLabel];
        },
      };
    },
    createSupportWindowsAppRuntime() {
      return {
        openConnectionWindow(options) {
          return ['connection', options];
        },
        openAboutWindow(options) {
          return ['about', options];
        },
        openWindowLinksWindow(options) {
          return ['window-links', options];
        },
        openWindowGroupsWindow(options) {
          return ['window-groups', options];
        },
        openStatusLogWindow(options) {
          return ['status-log', options];
        },
      };
    },
    createDeveloperToolsAppRuntime() {
      return {
        openDebugger(thread, threadName, options) {
          return ['debugger', thread, threadName, options];
        },
        openSymbolList(px, py, pw, ph) {
          return ['symbol-list', px, py, pw, ph];
        },
        openMethodQueryWindow(title, results, options) {
          return ['method-query', title, results, options];
        },
        openHierarchyWindow(title, classes, options) {
          return ['hierarchy', title, classes, options];
        },
        openVersionsWindow(title, versions, options) {
          return ['versions', title, versions, options];
        },
      };
    },
  });

  assert.deepEqual(runtime.openWorkspace({ x: 1 }), ['workspace', { x: 1 }]);
  assert.deepEqual(runtime.openConnectionWindow({ y: 2 }), ['connection', { y: 2 }]);
  assert.deepEqual(runtime.openDebugger(7, 'thread', { sessionChannel: 'debug-w' }), ['debugger', 7, 'thread', { sessionChannel: 'debug-w' }]);
  assert.deepEqual(runtime.openClassBrowser({ dictionary: 'UserGlobals' }), ['class-browser', { dictionary: 'UserGlobals' }]);
  assert.deepEqual(runtime.openTextWindow('Report', 'body', 'Report'), ['text', 'Report', 'body', 'Report']);
});

test('app windows runtime builds db tables through the shared helper', () => {
  function createNode(tag) {
    return {
      tagName: tag.toUpperCase(),
      className: '',
      textContent: '',
      innerHTML: '',
      children: [],
      appendChild(child) {
        this.children.push(child);
      },
    };
  }

  const runtime = createAppWindowsRuntime({
    document: {
      createElement: createNode,
    },
    escHtml(value) { return String(value); },
    setStatus() {},
    createModalRuntime() {
      return {
        requestModal() {},
        openModal() {},
        requestTextModal() {},
        requestSelectModal() {},
        requestConfirmModal() {},
      };
    },
    createObjectBrowserAppRuntime() {
      return { openObjectBrowser() {} };
    },
    createClassBrowserAppRuntime() {
      return { openClassBrowser() {} };
    },
    createWorkspaceAppRuntime() {
      return {
        openExpressionWorkspace() {},
        openWorkspace() {},
        openRubyWorkspace() {},
        openMaglevReportWindow() {},
        openWebBrowser() {},
        openTextWindow() {},
      };
    },
    createSupportWindowsAppRuntime() {
      return {
        openConnectionWindow() {},
        openAboutWindow() {},
        openWindowLinksWindow() {},
        openWindowGroupsWindow() {},
        openStatusLogWindow() {},
      };
    },
    createDeveloperToolsAppRuntime() {
      return {
        openDebugger() {},
        openSymbolList() {},
        openMethodQueryWindow() {},
        openHierarchyWindow() {},
        openVersionsWindow() {},
      };
    },
  });

  const table = runtime.makeTable(['Key', 'Value'], [['alpha', 'beta']]);
  assert.equal(table.tagName, 'TABLE');
  assert.equal(table.children.length, 2);
  assert.equal(table.children[1].children.length, 1);
});

test('app windows runtime can expose global window openers', () => {
  const runtime = createAppWindowsRuntime({
    document: {
      createElement(tag) {
        return {
          tagName: tag.toUpperCase(),
          className: '',
          textContent: '',
          innerHTML: '',
          children: [],
          appendChild(child) {
            this.children.push(child);
          },
        };
      },
    },
    escHtml(value) { return String(value); },
    setStatus() {},
    createModalRuntime() {
      return {
        requestModal() {},
        openModal() {},
        requestTextModal() {},
        requestSelectModal() {},
        requestConfirmModal() {},
      };
    },
    createObjectBrowserAppRuntime() {
      return { openObjectBrowser() { return 'object'; } };
    },
    createClassBrowserAppRuntime() {
      return { openClassBrowser() { return 'class-browser'; } };
    },
    createWorkspaceAppRuntime() {
      return {
        openExpressionWorkspace() { return 'expression-workspace'; },
        openWorkspace() { return 'workspace'; },
        openRubyWorkspace() { return 'ruby-workspace'; },
        openMaglevReportWindow() { return 'maglev-report'; },
        openWebBrowser() { return 'web-browser'; },
        openTextWindow() { return 'text-window'; },
      };
    },
    createSupportWindowsAppRuntime() {
      return {
        openConnectionWindow() { return 'connection'; },
        openAboutWindow() { return 'about'; },
        openWindowLinksWindow() { return 'window-links'; },
        openWindowGroupsWindow() { return 'window-groups'; },
        openStatusLogWindow() { return 'status-log'; },
      };
    },
    createDeveloperToolsAppRuntime() {
      return {
        openDebugger() { return 'debugger'; },
        openSymbolList() { return 'symbol-list'; },
        openMethodQueryWindow() { return 'method-query'; },
        openHierarchyWindow() { return 'hierarchy'; },
        openVersionsWindow() { return 'versions'; },
      };
    },
  });

  const target = {};
  runtime.exposeWindowBindings(target);

  assert.equal(target.openWorkspace(), 'workspace');
  assert.equal(target.openConnectionWindow(), 'connection');
  assert.equal(target.openClassBrowser(), 'class-browser');
});
