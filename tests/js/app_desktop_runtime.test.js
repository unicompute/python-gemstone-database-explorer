const test = require('node:test');
const assert = require('node:assert/strict');

const { createAppDesktopRuntime } = require('../../static/js/app_desktop_runtime.js');

test('app desktop runtime delegates status helpers and selection sanitization', () => {
  const runtime = createAppDesktopRuntime({
    desktopStatusRuntime: {
      setStatus(ok, msg) {
        return {ok, msg};
      },
      currentStatusSource() {
        return {sourceWindowId: 'w1', sourceTitle: 'Workspace', sourceKind: 'workspace'};
      },
      renderTaskbarVersion(info) {
        return `v:${info.version}`;
      },
    },
    windowLayoutModel: {
      sanitizeSelectionIndex(index, items) {
        return Math.max(0, Math.min(index, items.length - 1));
      },
    },
  });

  assert.deepEqual(runtime.setStatus(true, 'ok'), {ok: true, msg: 'ok'});
  assert.deepEqual(runtime.currentStatusSource(), {sourceWindowId: 'w1', sourceTitle: 'Workspace', sourceKind: 'workspace'});
  assert.equal(runtime.renderTaskbarVersion({version: '3.7'}), 'v:3.7');
  assert.equal(runtime.sanitizeSelectionIndex(9, [1, 2, 3]), 2);
});

test('app desktop runtime closes non-focused windows and refocuses the winner', () => {
  const focused = {id: 'w2'};
  const other = {id: 'w1'};
  const closed = [];
  let focusedAgain = null;
  const runtime = createAppDesktopRuntime({
    document: {
      querySelector(selector) {
        return selector === '.win.focused' ? focused : null;
      },
    },
    getManagedWindows() {
      return [other, focused];
    },
    getOrderedManagedWindows() {
      return [other, focused];
    },
    windowShellRuntime: {
      closeWindow(win, id) {
        closed.push(id || win.id);
      },
      focusWin(win) {
        focusedAgain = win.id;
      },
    },
  });

  runtime.closeOtherWindows();
  assert.deepEqual(closed, ['w1']);
  assert.equal(focusedAgain, 'w2');
});
