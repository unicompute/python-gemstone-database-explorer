const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/desktop_window_runtime.js');

test('desktop runtime resolves source windows and reveals minimised windows', () => {
  const focused = [];
  const toggled = [];
  const matchingWindow = {
    id: 'w2',
    dataset: {minimised: '1'},
    querySelector() {
      return {textContent: 'About'};
    },
  };
  const doc = {
    querySelector(selector) {
      assert.equal(selector, '.win.focused');
      return null;
    },
    getElementById(id) {
      return id === 'w1' ? {id: 'w1'} : null;
    },
  };

  const resolvedById = runtime.resolveStatusEntrySourceWindow({sourceWindowId: 'w1'}, {
    document: doc,
    getManagedWindows() {
      return [matchingWindow];
    },
    readWindowState() {
      return {kind: 'about'};
    },
  });
  assert.deepEqual(resolvedById, {id: 'w1'});

  const resolvedByTitle = runtime.resolveStatusEntrySourceWindow({sourceTitle: 'About', sourceKind: 'about'}, {
    document: doc,
    getManagedWindows() {
      return [matchingWindow];
    },
    readWindowState() {
      return {kind: 'about'};
    },
  });
  assert.equal(resolvedByTitle, matchingWindow);

  const revealed = runtime.revealWindow(matchingWindow, {
    toggleMinimise(win, id) {
      toggled.push(id);
      win.dataset.minimised = '0';
    },
    focusWin(win) {
      focused.push(win.id);
    },
  });
  assert.equal(revealed, true);
  assert.deepEqual(toggled, ['w2']);
  assert.deepEqual(focused, ['w2']);
});

test('desktop runtime suppresses layout persistence and runs post-mutation hooks', () => {
  const flags = [];
  const events = [];
  const result = runtime.withSuppressedLayoutPersist(() => 'ok', {
    setSuppressWindowLayoutPersist(value) {
      flags.push(value);
    },
  });
  runtime.afterWindowLayoutMutation({
    persistWindowLayout() {
      events.push('persist');
    },
    redrawArrows() {
      events.push('redraw');
    },
    notifyLiveWindowUpdated() {
      events.push('notify');
    },
  });

  assert.equal(result, 'ok');
  assert.deepEqual(flags, [true, false]);
  assert.deepEqual(events, ['persist', 'redraw', 'notify']);
});
