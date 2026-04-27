const test = require('node:test');
const assert = require('node:assert/strict');

const windowRestoreModel = require('../../static/js/window_restore_model.js');

test('window restore model resolves pending source links through restored ids', () => {
  const restoredIdMap = new Map([
    ['saved-about', 'live-about'],
    ['saved-status', 'live-status'],
  ]);

  const patches = windowRestoreModel.resolveRestoredSourceLinks(
    restoredIdMap,
    [
      {windowId: 'live-status', sourceWindowId: 'saved-about'},
      {windowId: 'live-query', sourceWindowId: 'saved-status'},
      {windowId: 'missing-win', sourceWindowId: 'saved-about'},
      {windowId: 'live-status', sourceWindowId: 'missing-source'},
    ],
    ['live-about', 'live-status', 'live-query']
  );

  assert.deepEqual(patches, [
    {windowId: 'live-status', sourceWindowId: 'live-about'},
    {windowId: 'live-query', sourceWindowId: 'live-status'},
  ]);
});

test('window restore model ignores malformed links and missing live sources', () => {
  const patches = windowRestoreModel.resolveRestoredSourceLinks(
    new Map([['saved-about', 'live-about']]),
    [
      null,
      {},
      {windowId: '', sourceWindowId: 'saved-about'},
      {windowId: 'live-status', sourceWindowId: ''},
      {windowId: 'live-status', sourceWindowId: 'saved-about'},
    ],
    ['live-status']
  );

  assert.deepEqual(patches, []);
});
