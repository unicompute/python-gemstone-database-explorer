const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/window_manager_runtime.js');

test('window manager runtime raises grouped windows and restores minimised ones', () => {
  const focused = [];
  const toggled = [];
  const windows = [
    {id: 'a', dataset: {minimised: '1'}},
    {id: 'b', dataset: {minimised: '0'}},
  ];
  let afterMutation = 0;

  const result = runtime.raiseWindowGroupByIds(['a', 'b'], {seedId: 'b'}, {
    getOrderedManagedWindows() {
      return windows;
    },
    toggleMinimise(win, id) {
      toggled.push(id);
      win.dataset.minimised = '0';
    },
    focusWin(win) {
      focused.push(win.id);
    },
    withSuppressedLayoutPersist(work) {
      work();
    },
    afterWindowMutation() {
      afterMutation += 1;
    },
  });

  assert.equal(result, true);
  assert.deepEqual(toggled, ['a']);
  assert.deepEqual(focused, ['a', 'b']);
  assert.equal(afterMutation, 1);
});

test('window manager runtime closes focused related group', () => {
  const closed = [];
  runtime.closeFocusedWindowGroup({
    getFocusedOrTopWindow() {
      return {id: 'seed'};
    },
    getRelatedWindowIds() {
      return ['seed', 'peer'];
    },
    getOrderedManagedWindows() {
      return [{id: 'seed'}, {id: 'peer'}, {id: 'other'}];
    },
    closeWindow(win, id) {
      closed.push(id);
    },
  });

  assert.deepEqual(closed, ['seed', 'peer']);
});
