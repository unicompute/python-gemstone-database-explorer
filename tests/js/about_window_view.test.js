const test = require('node:test');
const assert = require('node:assert/strict');

const aboutWindowView = require('../../static/js/about_window_view.js');

test('buildAboutRows summarizes runtime, connection, and status fields', () => {
  const rows = aboutWindowView.buildAboutRows({
    data: {
      app: '1.0.0',
      stone: '3.7.5',
      gem: '3.7.5',
      status: 'ok',
      runtime: {python: '3.12.0', platform: 'darwin'},
    },
    browser: {
      language: 'en-GB',
      viewport: {width: 1440, height: 900},
    },
    broker: {
      managedSessionCount: 4,
      channels: [{name: 'workspace:1'}, {name: 'debugger:2'}],
      defaultAutoBegin: true,
    },
    configuredConnection: {
      effectiveTarget: 'gs64stone@localhost#50377',
      stoneSource: 'env',
    },
    overrideSummary: 'stone=gs64stone',
    favoriteProfiles: [{name: 'Primary'}],
    defaultFavoriteProfile: {name: 'Primary', target: {stone: 'gs64stone'}},
    localStones: ['gs64stone', 'seaside'],
    channelNames: 'workspace:1, debugger:2',
    statusSummary: {
      ok: 12,
      error: 2,
      closedSources: 1,
      latestError: {message: 'connection failed', sourceTitle: 'Connection'},
    },
    openWindowCount: 7,
    windowLinkCount: 5,
    windowGroupCount: 3,
    largestGroupSize: 4,
    statusEntryCount: 14,
    summarizeConnectionOverride: override => override?.stone ? `stone=${override.stone}` : '—',
    refreshedLabel: '2026-04-26 12:00',
  });

  assert.deepEqual(rows.find(([key]) => key === 'Explorer'), ['Explorer', '1.0.0']);
  assert.deepEqual(rows.find(([key]) => key === 'Connection Target'), ['Connection Target', 'gs64stone@localhost#50377']);
  assert.deepEqual(rows.find(([key]) => key === 'Browser'), ['Browser', 'en-GB · 1440×900']);
  assert.deepEqual(rows.find(([key]) => key === 'Saved Targets'), ['Saved Targets', '1']);
  assert.deepEqual(rows.find(([key]) => key === 'Latest Error'), ['Latest Error', 'connection failed · Connection']);
  assert.deepEqual(rows.find(([key]) => key === 'Largest Group'), ['Largest Group', '4 windows']);
});

test('buildAboutGridHtml escapes values for safe rendering', () => {
  const html = aboutWindowView.buildAboutGridHtml([
    ['Error', '<broken> & bad'],
  ]);

  assert.match(html, /&lt;broken&gt; &amp; bad/);
});

test('buildAboutWindowView returns rendered grid html', () => {
  const view = aboutWindowView.buildAboutWindowView({
    data: {app: '1.0.0'},
    runtimeVersionInfo: {},
    broker: {},
    configuredConnection: {},
    overrideSummary: '—',
    favoriteProfiles: [],
    statusSummary: {ok: 0, error: 0, closedSources: 0},
    openWindowCount: 0,
    windowLinkCount: 0,
    windowGroupCount: 0,
    largestGroupSize: 0,
    statusEntryCount: 0,
  });

  assert.ok(Array.isArray(view.rows));
  assert.match(view.gridHtml, /Explorer/);
});
