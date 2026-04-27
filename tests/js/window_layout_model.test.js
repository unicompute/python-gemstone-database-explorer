const test = require('node:test');
const assert = require('node:assert/strict');

const windowLayoutModel = require('../../static/js/window_layout_model.js');

test('window layout model builds sorted snapshots and detects recoverable windows', () => {
  const snapshot = windowLayoutModel.buildWindowLayoutSnapshot([
    {kind: 'workspace', zIndex: 30, savedId: 'ws'},
    {kind: 'connection', zIndex: 10, savedId: 'conn'},
    {kind: 'about', zIndex: 20, savedId: 'about'},
  ]);

  assert.equal(snapshot.version, 1);
  assert.deepEqual(
    snapshot.windows.map(entry => entry.savedId),
    ['conn', 'about', 'ws']
  );
  assert.equal(windowLayoutModel.hasRecoverableWindows(snapshot), true);
  assert.equal(
    windowLayoutModel.hasRecoverableWindows({
      version: 1,
      windows: [{kind: 'connection', savedId: 'conn'}],
    }),
    false
  );
});

test('window layout model normalizes stored payloads and chooses recoverable layout', () => {
  const current = {
    version: 1,
    windows: [
      {kind: 'connection', savedId: 'conn'},
      {kind: 'workspace', savedId: 'ws'},
    ],
  };
  const healthy = {
    version: 1,
    windows: [
      {kind: 'about', savedId: 'about'},
    ],
  };

  assert.deepEqual(
    windowLayoutModel.normalizeStoredWindowLayout(current).map(entry => entry.savedId),
    ['conn', 'ws']
  );
  assert.deepEqual(windowLayoutModel.normalizeStoredWindowLayout(null), []);
  assert.deepEqual(
    windowLayoutModel.chooseRecoverableWindowLayout(current, healthy).map(entry => entry.savedId),
    ['about']
  );
  assert.deepEqual(
    windowLayoutModel.chooseRecoverableWindowLayout(current, null).map(entry => entry.savedId),
    ['ws']
  );
});

test('window layout model clamps selections and sorts restore entries', () => {
  assert.equal(windowLayoutModel.sanitizeSelectionIndex('2', [1, 2, 3, 4]), 2);
  assert.equal(windowLayoutModel.sanitizeSelectionIndex('99', [1, 2]), 1);
  assert.equal(windowLayoutModel.sanitizeSelectionIndex('-5', [1, 2]), 0);
  assert.equal(windowLayoutModel.parsePixelValue('420px', 0), 420);
  assert.equal(windowLayoutModel.parsePixelValue('', 7), 7);

  const sorted = windowLayoutModel.sortWindowLayoutEntries([
    {savedId: 'b', zIndex: 40},
    {savedId: 'a', zIndex: 10},
    {savedId: 'c', zIndex: 25},
  ]);
  assert.deepEqual(sorted.map(entry => entry.savedId), ['a', 'c', 'b']);
});
