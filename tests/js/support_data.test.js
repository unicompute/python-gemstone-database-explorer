const test = require('node:test');
const assert = require('node:assert/strict');

const supportData = require('../../static/js/support_data.js');

function makeStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

test('status history appends repeated entries by incrementing count', () => {
  const entries = [];
  const source = {sourceWindowId: 'about', sourceTitle: 'About', sourceKind: 'about'};

  const once = supportData.appendStatusHistoryEntry(entries, {
    ok: false,
    message: 'connection failed',
    source,
    timestamp: '2026-04-26T10:00:00.000Z',
  });
  const twice = supportData.appendStatusHistoryEntry(once, {
    ok: false,
    message: 'connection failed',
    source,
    timestamp: '2026-04-26T10:00:05.000Z',
  });

  assert.equal(twice.length, 1);
  assert.equal(twice[0].count, 2);
  assert.equal(twice[0].timestamp, '2026-04-26T10:00:05.000Z');
});

test('status history summary counts ok, errors, and closed sources', () => {
  const history = [
    {ok: true, message: 'connected', sourceTitle: 'Connection', sourceKind: 'connection'},
    {ok: false, message: 'failed', sourceTitle: 'About', sourceKind: 'about'},
    {ok: false, message: 'failed again', sourceTitle: 'Closed', sourceKind: 'about'},
  ];

  const summary = supportData.summarizeStatusHistory(history, entry => {
    return entry.sourceTitle === 'Closed' ? null : {id: entry.sourceTitle};
  });

  assert.equal(summary.total, 3);
  assert.equal(summary.ok, 1);
  assert.equal(summary.error, 2);
  assert.equal(summary.closedSources, 1);
  assert.equal(summary.latestError.message, 'failed again');
});

test('status history storage round-trips normalized entries', () => {
  const storage = makeStorage();
  supportData.writeStatusHistory([
    {ok: true, message: 'connected', count: 2},
    null,
    {ok: false, message: 'failed', sourceTitle: 'About'},
  ], storage, 'status-key');

  const readBack = supportData.readStatusHistory(storage, 'status-key', () => '2026-04-26T10:01:00.000Z');
  assert.equal(readBack.length, 2);
  assert.equal(readBack[0].count, 2);
  assert.equal(readBack[1].sourceTitle, 'About');
});

test('diagnostics and support bundle builders preserve supplied snapshots', () => {
  const diagnostics = supportData.buildDiagnosticsSnapshot({
    generatedAt: '2026-04-26T10:02:00.000Z',
    server: {status: 'ok'},
    browser: {language: 'en-GB'},
    connectionOverride: {stone: 'seaside'},
    connectionOverrideHeaders: {'X-GS-Stone': 'seaside'},
    lastSuccessfulConnectionOverride: {stone: 'seaside'},
    favoriteConnectionProfiles: [{name: 'Primary', target: {stone: 'seaside'}}],
    defaultFavoriteConnectionProfile: {name: 'Primary', target: {stone: 'seaside'}},
    recentConnectionOverrides: [{stone: 'seaside'}],
    statusHistory: [{ok: true, message: 'connected'}],
    error: '',
  });

  const supportBundle = supportData.buildSupportBundle({
    generatedAt: '2026-04-26T10:03:00.000Z',
    diagnostics,
    connectionSummary: {effectiveTarget: 'seaside'},
    currentStatus: {ok: true, text: 'connected'},
    taskbarVersion: 'Explorer 1.0.0',
    statusSummary: {total: 1, ok: 1, error: 0, closedSources: 0, latestError: null},
    windowLayout: {version: 1, windows: []},
    openWindows: [{id: 'about'}],
    windowLinks: [{type: 'source', fromId: 'about', toId: 'status'}],
    windowGroups: [{primaryId: 'about', size: 2}],
  });

  assert.equal(diagnostics.generatedAt, '2026-04-26T10:02:00.000Z');
  assert.equal(diagnostics.connectionOverride.stone, 'seaside');
  assert.equal(supportBundle.generatedAt, '2026-04-26T10:03:00.000Z');
  assert.equal(supportBundle.diagnostics.server.status, 'ok');
  assert.equal(supportBundle.connectionSummary.effectiveTarget, 'seaside');
  assert.equal(supportBundle.windowLinks.length, 1);
});
