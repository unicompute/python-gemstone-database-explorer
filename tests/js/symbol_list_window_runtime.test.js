const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/symbol_list_window_runtime.js');

test('buildSymbolListWindowState normalizes values', () => {
  assert.deepEqual(
    runtime.buildSymbolListWindowState({
      sessionChannel: 'symbol-list:1',
      user: 'DataCurator',
      dictionary: 'UserGlobals',
      key: 'MyKey',
    }),
    {
      kind: 'symbol-list',
      sessionChannel: 'symbol-list:1',
      user: 'DataCurator',
      dictionary: 'UserGlobals',
      key: 'MyKey',
    }
  );
});

test('sortSymbolListEntries sorts case-insensitively', () => {
  assert.deepEqual(
    runtime.sortSymbolListEntries(['zebra', 'Alpha', 'beta']),
    ['Alpha', 'beta', 'zebra']
  );
});
