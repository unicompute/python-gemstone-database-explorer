const test = require('node:test');
const assert = require('node:assert/strict');

const statusLogWindowModel = require('../../static/js/status_log_window_model.js');

const sampleEntries = [
  {timestamp: '2026-04-26T10:00:00.000Z', ok: true, message: 'connected', sourceTitle: 'Connection', sourceKind: 'connection', count: 1},
  {timestamp: '2026-04-26T10:01:00.000Z', ok: false, message: 'about routed failure', sourceTitle: 'About', sourceKind: 'about', count: 2},
];

test('status log model filters entries by level and text', () => {
  const filtered = statusLogWindowModel.filterStatusEntries(sampleEntries, {
    filterText: 'about',
    level: 'error',
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].message, 'about routed failure');
});

test('status log model derives view state and export labels', () => {
  const viewState = statusLogWindowModel.buildStatusLogViewState(sampleEntries, {
    filterText: 'about',
    level: 'error',
  });
  assert.equal(viewState.filteredCount, 1);
  assert.equal(viewState.totalCount, 2);
  assert.equal(viewState.exportFiltered, true);
  assert.equal(viewState.copyLabel, 'Copy Visible JSON');
  assert.equal(viewState.downloadLabel, 'Download Visible JSON');
});

test('status log model export falls back to full history for unfiltered view', () => {
  const exported = statusLogWindowModel.statusEntriesForExport(sampleEntries, {
    filterText: '',
    level: 'all',
  });
  assert.equal(exported.length, 2);
  assert.equal(statusLogWindowModel.normalizeStatusLogLevel('weird'), 'all');
});
