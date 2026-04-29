const test = require('node:test');
const assert = require('node:assert/strict');

const { createWorkspaceAppRuntime } = require('../../static/js/workspace_app_runtime.js');

test('workspace app runtime composes a standard workspace with the current startup roots', () => {
  let capturedConfig = null;
  const runtime = createWorkspaceAppRuntime({
    createWindow() {
      return { win: { id: 'win-1' }, body: {}, id: 'ws-1' };
    },
    api() {
      return Promise.resolve({});
    },
    apiEvaluate() {
      return Promise.resolve({});
    },
    apiTransaction() {
      return Promise.resolve({});
    },
    upsertWindowState() {},
    createWorkspaceWindowRuntime(config) {
      capturedConfig = config;
      return { mount() {} };
    },
    bindWorkspaceWindowActions() {},
    buildWorkspaceWindowHtml() {
      return '';
    },
    setStatus() {},
    maybeOpenEvalDebugger() {},
    isLeafBasetype() {
      return false;
    },
    makeChip() {},
    openLinkedObjectWindow() {},
    readRoots() {
      return { Globals: 77, RubyWorkspace: 91 };
    },
    readStartupIds() {
      return { defaultWorkspaceId: 88 };
    },
    maglevReportDefs: {},
    createMaglevReportWindowRuntime() {
      return { mount() {} };
    },
    createWebBrowserWindowRuntime() {
      return { mount() {} };
    },
    escHtml(value) {
      return String(value);
    },
  });

  runtime.openWorkspace({ draft: '1+1' });
  assert.equal(capturedConfig.kind, 'workspace');
  assert.equal(capturedConfig.draft, '1+1');
  assert.equal(capturedConfig.sessionChannel, 'workspace:ws-1');
  assert.equal(capturedConfig.resolveTargetOop(), 77);
});

test('workspace app runtime uses startup ruby workspace ids before fallback roots', () => {
  let capturedConfig = null;
  const runtime = createWorkspaceAppRuntime({
    createWindow() {
      return { win: { id: 'win-2' }, body: {}, id: 'ruby-1' };
    },
    api() {
      return Promise.resolve({});
    },
    apiEvaluate() {
      return Promise.resolve({});
    },
    apiTransaction() {
      return Promise.resolve({});
    },
    upsertWindowState() {},
    createWorkspaceWindowRuntime(config) {
      capturedConfig = config;
      return { mount() {} };
    },
    bindWorkspaceWindowActions() {},
    buildWorkspaceWindowHtml() {
      return '';
    },
    setStatus() {},
    maybeOpenEvalDebugger() {},
    isLeafBasetype() {
      return false;
    },
    makeChip() {},
    openLinkedObjectWindow() {},
    readRoots() {
      return { RubyWorkspace: 123 };
    },
    readStartupIds() {
      return { defaultWorkspaceId: 456 };
    },
    maglevReportDefs: {},
    createMaglevReportWindowRuntime() {
      return { mount() {} };
    },
    createWebBrowserWindowRuntime() {
      return { mount() {} };
    },
    escHtml(value) {
      return String(value);
    },
  });

  runtime.openRubyWorkspace();
  assert.equal(capturedConfig.kind, 'ruby-workspace');
  assert.equal(capturedConfig.targetOop, 456);
  assert.equal(capturedConfig.sessionChannel, 'ruby-workspace:ruby-1');
});
