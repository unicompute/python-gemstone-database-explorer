const test = require('node:test');
const assert = require('node:assert/strict');

const connectionWindowView = require('../../static/js/connection_window_view.js');

test('buildConnectionGridHtml escapes keys and values', () => {
  const html = connectionWindowView.buildConnectionGridHtml([
    ['Configured Stone', 'gs64stone'],
    ['Exception', '<bad> & broken'],
  ]);

  assert.match(html, /Configured Stone/);
  assert.match(html, /gs64stone/);
  assert.match(html, /&lt;bad&gt; &amp; broken/);
});

test('buildConnectionToolbarState derives visibility and labels from render state', () => {
  const toolbarState = connectionWindowView.buildConnectionToolbarState({
    startupBootstrapped: false,
    latestStartupError: 'login failed',
    renderState: {
      suggestedOverride: {stone: 'seaside'},
      override: {stone: 'gs64stone'},
      currentTargetOverride: {stone: 'gs64stone'},
      currentTargetIsFavorite: true,
      favoriteProfiles: [{name: 'Primary'}],
      recentOverrides: [{stone: 'seaside'}],
      lastSuccessfulOverride: {stone: 'seaside'},
      fixShell: 'export GS_STONE=seaside',
    },
  });

  assert.equal(toolbarState.retryVisible, true);
  assert.equal(toolbarState.applyOverrideVisible, true);
  assert.equal(toolbarState.clearOverrideVisible, true);
  assert.equal(toolbarState.favoriteTargetLabel, 'Rename Favorite');
  assert.equal(toolbarState.clearFavoritesVisible, true);
  assert.equal(toolbarState.clearRecentsVisible, true);
  assert.equal(toolbarState.clearLastWorkingVisible, true);
  assert.equal(toolbarState.copyFixDisabled, false);
});

test('buildConnectionWindowView renders connection cards and filtered target checks', () => {
  const html = connectionWindowView.buildConnectionWindowView({
    startupBootstrapped: true,
    latestStartupError: 'startup blocked',
    escHtml: value => String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;'),
    shortLabel: (value, max = 32) => {
      const text = String(value ?? '').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    },
    summarizeConnectionOverride: override => override?.stone ? `stone=${override.stone}` : '—',
    defaultConnectionOverrideName: override => override?.stone || 'Saved Target',
    favoriteProfileForOverride: override => override?.stone === 'seaside' ? {name: 'Seaside'} : null,
    isDefaultFavoriteConnectionOverride: override => override?.stone === 'gs64stone',
    renderState: {
      rows: [
        ['Status', 'error'],
        ['Configured Stone', 'gs64stone'],
      ],
      payload: {exception: 'could not connect'},
      fixShell: 'export GS_STONE=seaside',
      suggestions: [{title: 'Use local stone', detail: 'switch to seaside'}],
      favoriteProfiles: [{name: 'Primary', target: {stone: 'gs64stone'}, note: 'main'}],
      defaultFavoriteProfile: {name: 'Primary', target: {stone: 'gs64stone'}, note: 'main'},
      showLastSuccessfulOverride: true,
      lastSuccessfulOverride: {stone: 'seaside'},
      recentOverrides: [{stone: 'seaside'}],
      localStoneOverrides: [{label: 'seaside', override: {stone: 'seaside'}}],
      probeEntries: [{type: 'stone', name: 'seaside', status: 'OK', port: '52185'}],
      probe: {available: true},
      allConnectionCheckEntries: [{item: {success: true}}],
      connectionCheckEntries: [{
        item: {
          label: 'checked seaside',
          target: {stone: 'seaside'},
          success: true,
          checkedAt: '2026-04-26T10:00:00.000Z',
          effectiveTarget: 'seaside',
          stoneSource: 'request-override',
        },
        freshness: {label: 'Current', stale: false, legacy: false, reason: '', status: 'current'},
        originalIndex: 0,
      }],
      okChecks: 1,
      errorChecks: 0,
      staleChecks: 0,
      legacyChecks: 0,
      connectionCheckViewMode: 'current',
      isFilteredConnectionChecksView: true,
    },
  });

  assert.match(html.gridHtml, /Configured Stone/);
  assert.match(html.cardsHtml, /Startup failure/);
  assert.match(html.cardsHtml, /Latest exception/);
  assert.match(html.cardsHtml, /Default Favorite Target/);
  assert.match(html.cardsHtml, /Favorite Targets/);
  assert.match(html.cardsHtml, /Last Working Target/);
  assert.match(html.cardsHtml, /Recent Targets/);
  assert.match(html.cardsHtml, /Local gslist probe/);
  assert.match(html.cardsHtml, /Target Checks/);
  assert.match(html.cardsHtml, /Download Visible Checks JSON/);
  assert.equal(html.toolbarState.favoriteTargetLabel, 'Save Target');
});
