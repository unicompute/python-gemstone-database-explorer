const test = require('node:test');
const assert = require('node:assert/strict');

const statusLogWindowView = require('../../static/js/status_log_window_view.js');

test('status log view renders empty state and filtered labels', () => {
  const view = statusLogWindowView.buildStatusLogWindowView({
    totalCount: 0,
    reversedEntries: [],
    metaText: '0 of 0 entries shown',
    copyLabel: 'Copy JSON',
    downloadLabel: 'Download JSON',
  });

  assert.equal(view.metaText, '0 of 0 entries shown');
  assert.match(view.listHtml, /No status entries yet/);
});

test('status log view renders source badges and count markers', () => {
  const view = statusLogWindowView.buildStatusLogWindowView({
    totalCount: 2,
    reversedEntries: [
      {
        timestamp: '2026-04-26T10:01:00.000Z',
        ok: false,
        message: 'about routed failure',
        sourceTitle: 'About',
        sourceKind: 'about',
        count: 2,
      },
    ],
    metaText: '1 of 2 entries shown',
    copyLabel: 'Copy Visible JSON',
    downloadLabel: 'Download Visible JSON',
  }, {
    resolveStatusEntrySourceWindow(entry) {
      return entry.sourceTitle === 'About' ? {id: 'win-about'} : null;
    },
    formatStatusTimestamp() {
      return '26/04/2026, 11:01:00';
    },
  });

  assert.match(view.listHtml, /status-log-source-button/);
  assert.match(view.listHtml, /×2/);
  assert.match(view.listHtml, /26\/04\/2026, 11:01:00/);
  assert.equal(view.copyLabel, 'Copy Visible JSON');
});
