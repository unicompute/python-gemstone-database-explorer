const test = require('node:test');
const assert = require('node:assert/strict');

const connectionWindowModel = require('../../static/js/connection_window_model.js');

function sanitizeConnectionOverride(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const normalized = {
    stone: String(raw.stone || '').trim(),
    host: String(raw.host || '').trim(),
    netldi: String(raw.netldi || '').trim(),
    gemService: String(raw.gemService || '').trim(),
  };
  if (!normalized.stone && !normalized.host && !normalized.netldi && !normalized.gemService) return null;
  return normalized;
}

function connectionOverrideKey(override) {
  const normalized = sanitizeConnectionOverride(override);
  return normalized ? JSON.stringify(normalized) : '';
}

test('buildFixShell prefers suggestion shell/env lines and de-duplicates them', () => {
  const shell = connectionWindowModel.buildFixShell({
    connection: {
      configured: {
        stone: 'gs64stone',
        host: 'localhost',
        netldi: '50377',
        gemService: 'gemnetobject',
        mode: 'netldi',
      },
      suggestions: [
        {
          shell: 'export GS_STONE=seaside\nexport GS_HOST=localhost',
          env: {
            GS_STONE: 'seaside',
            GS_HOST: 'localhost',
            GS_NETLDI: '50377',
          },
        },
      ],
    },
  });

  assert.equal(
    shell,
    'export GS_STONE=seaside\nexport GS_HOST=localhost\nexport GS_NETLDI=50377'
  );
});

test('buildConnectionPayload preserves browser state and synthesizes a fallback preflight', () => {
  const payload = connectionWindowModel.buildConnectionPayload({
    latestStartupError: 'login failed',
    browserState: {
      override: {stone: 'gs64stone'},
      favoriteProfiles: [{name: 'Primary', target: {stone: 'gs64stone'}}],
      recentOverrides: [{stone: 'seaside'}],
      connectionCheckResults: [{label: 'recent target seaside', target: {stone: 'seaside'}, success: true}],
      connectionCheckViewMode: 'stale',
    },
  });

  assert.equal(payload.startupError, 'login failed');
  assert.equal(payload.browserState.connectionCheckViewMode, 'stale');
  assert.equal(payload.browserState.favoriteProfiles[0].name, 'Primary');
  assert.equal(payload.preflight.status, 'error');
  assert.equal(payload.preflight.exception, 'login failed');
});

test('buildConnectionRenderState derives rows, target resolution, and filtered checks', () => {
  const describeConnectionCheckFreshness = item => ({
    label: item.label.includes('legacy') ? 'Legacy' : (item.success ? 'Current' : 'Stale'),
    status: item.success ? 'current' : 'stale',
    stale: !item.success,
    legacy: item.label.includes('legacy'),
    reason: item.success ? '' : 'server config changed',
  });

  const renderState = connectionWindowModel.buildConnectionRenderState({
    preflight: {
      success: false,
      exception: 'could not connect',
      connection: {
        configured: {
          stone: 'gs64stone',
          stoneSource: 'env',
          mode: 'netldi',
          effectiveTarget: 'gs64stone@localhost#50377',
          host: 'localhost',
          netldi: '50377',
          gemService: 'gemnetobject',
          username: 'tariq',
          passwordSet: true,
        },
        probe: {
          available: true,
          entries: [
            {type: 'stone', name: 'seaside', status: 'OK', port: '52185'},
            {type: 'netldi', name: 'gs64ldi', status: 'OK', port: '50377'},
          ],
          availableStones: ['seaside'],
          availableNetldis: [{name: 'gs64ldi', port: '50377'}],
        },
        suggestions: [
          {
            env: {
              GS_STONE: 'seaside',
              GS_HOST: 'localhost',
              GS_NETLDI: '50377',
            },
          },
        ],
      },
    },
    startupError: 'startup blocked',
    browserOverride: {stone: 'gs64stone'},
    lastSuccessfulOverride: {stone: 'seaside'},
    favoriteProfiles: [
      {name: 'Primary', target: {stone: 'gs64stone'}},
      {name: 'Seaside', target: {stone: 'seaside'}},
    ],
    defaultFavoriteProfile: {name: 'Primary', target: {stone: 'gs64stone'}},
    recentOverrides: [{stone: 'seaside'}],
    connectionCheckResults: [
      {label: 'checked seaside', target: {stone: 'seaside'}, success: true, checkedAt: '2026-04-26T10:00:00.000Z'},
      {label: 'legacy coral', target: {stone: 'coral'}, success: false, checkedAt: '2026-04-26T10:01:00.000Z'},
    ],
    connectionCheckViewMode: 'failures',
    sanitizeConnectionOverride,
    connectionOverrideKey,
    describeConnectionCheckFreshness,
    summarizeConnectionOverride: override => {
      const normalized = sanitizeConnectionOverride(override);
      return normalized ? `stone=${normalized.stone}` : '—';
    },
  });

  assert.equal(renderState.suggestedOverride.stone, 'seaside');
  assert.equal(renderState.currentTargetOverride.stone, 'gs64stone');
  assert.equal(renderState.currentFavoriteProfile.name, 'Primary');
  assert.equal(renderState.showLastSuccessfulOverride, true);
  assert.equal(renderState.gslistSummary, 'found 2 services');
  assert.equal(renderState.rows.find(([key]) => key === 'Configured Stone')[1], 'gs64stone');
  assert.equal(renderState.rows.at(-1)[0], 'Exception');
  assert.equal(renderState.connectionCheckEntries.length, 1);
  assert.equal(renderState.connectionCheckEntries[0].item.label, 'legacy coral');
  assert.equal(renderState.isFilteredConnectionChecksView, true);
  assert.equal(renderState.staleChecks, 1);
  assert.equal(renderState.legacyChecks, 1);
});
