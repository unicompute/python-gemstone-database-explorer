const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDeveloperToolsAppRuntime,
  buildUnifiedLineDiff,
  parseMethodReference,
} = require('../../static/js/developer_tools_app_runtime.js');

test('developer tools helpers parse method references and build readable diffs', () => {
  assert.deepEqual(parseMethodReference('Object>>printString'), {
    className: 'Object',
    selector: 'printString',
    meta: false,
    dictionary: '',
    label: 'Object>>printString',
  });
  assert.match(
    buildUnifiedLineDiff('a\nb', 'a\nc'),
    /\-\s+b[\s\S]*\+\s+c/
  );
});

test('developer tools app runtime composes a debugger window with a write session channel', () => {
  let capturedConfig = null;
  const runtime = createDeveloperToolsAppRuntime({
    createWindow() {
      return { win: { id: 'win-1' }, body: {}, id: 'dbg-1' };
    },
    sourceRelativeWindowPosition() {
      return { x: 10, y: 20 };
    },
    exactWriteSessionChannel(channel) {
      return `${channel}:w`;
    },
    api() {
      return Promise.resolve({});
    },
    apiPost() {
      return Promise.resolve({});
    },
    apiWithParams() {
      return Promise.resolve({});
    },
    apiTransaction() {
      return Promise.resolve({});
    },
    windowState: new Map([['src-1', { sessionChannel: 'workspace:src-1' }]]),
    upsertWindowState() {},
    createDebuggerWindowRuntime(config) {
      capturedConfig = config;
      return { mount() {} };
    },
    buildDebuggerWindowHtml() { return ''; },
    buildDebuggerSummaryState() { return {}; },
    buildDebuggerFramesListHtml() { return ''; },
    buildDebuggerSourceView() { return ''; },
    buildDebuggerFramesExportText() { return ''; },
    buildDebuggerSourceExportText() { return ''; },
    buildDebuggerVariableOptionsHtml() { return ''; },
    bindDebuggerTabActions() {},
    bindDebuggerToolbarActions() {},
    bindDebuggerKeyboardActions() {},
    bindDebuggerVariableSelector() {},
    bindDebuggerFrameListActions() {},
    applyDebuggerTabState() {},
    applyDebuggerFrameSelection() {},
    applyDebuggerToolbarState() {},
    copyTextToClipboard() {},
    refreshHaltedThreadsBar() {},
    closeWindow() {},
    setStatus() {},
    makeChip() {},
    shortLabel(value) { return String(value); },
    isLeafBasetype() { return false; },
    escHtml(value) { return String(value); },
    createSymbolListWindowRuntime() { return { mount() {} }; },
    requestModal() {},
    requestConfirmModal() {},
    buildQueryHelperWindowHtml() { return ''; },
    bindQueryHelperToolbarActions() {},
    applyQueryHelperActionState() {},
    createMethodQueryWindowRuntime() { return { mount() {} }; },
    createHierarchyWindowRuntime() { return { mount() {} }; },
    createVersionsWindowRuntime() { return { mount() {} }; },
    openClassBrowser() {},
    openLinkedObjectWindow() {},
    sanitizeSelectionIndex() { return 0; },
    resolveClassBrowserRuntime() {},
    openClassBrowserRuntime() {},
  });

  runtime.openDebugger({ oop: 99, printString: 'Err', sourcePreview: '1/0' }, null, {
    sourceWindowId: 'src-1',
  });
  assert.equal(capturedConfig.threadOop, 99);
  assert.equal(capturedConfig.sessionChannel, 'workspace:src-1:w');
});
