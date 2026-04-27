const test = require('node:test');
const assert = require('node:assert/strict');

const connectionStorage = require('../../static/js/connection_storage.js');

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

test('connection profile bundles merge and preserve default favorite state', () => {
  const storage = makeStorage();
  connectionStorage.addFavoriteConnectionProfile({stone: 'gs64stone'}, 'Primary', 'default target', storage);
  connectionStorage.addFavoriteConnectionProfile({stone: 'coral'}, 'Coral', '', storage);
  connectionStorage.setDefaultFavoriteConnectionOverride({stone: 'coral'}, storage);
  connectionStorage.rememberRecentConnectionOverride({stone: 'gs64stone'}, storage);

  const imported = connectionStorage.importConnectionProfileBundle({
    version: 1,
    favoriteProfiles: [
      {name: 'Seaside', target: {stone: 'seaside'}, note: 'healthy local stone'},
      {name: 'Coral', target: {stone: 'coral'}},
    ],
    defaultFavoriteKey: connectionStorage.connectionOverrideKey({stone: 'seaside'}),
    recentOverrides: [{stone: 'seaside'}],
    lastSuccessfulOverride: {stone: 'seaside'},
  }, storage);

  assert.equal(imported.importedFavoriteCount, 2);
  assert.equal(imported.favoriteCount, 3);
  assert.equal(imported.defaultFavoriteProfile.name, 'Seaside');
  assert.deepEqual(
    connectionStorage.readFavoriteConnectionProfiles(storage).map(item => item.name),
    ['Seaside', 'Coral', 'Primary']
  );
  assert.deepEqual(
    connectionStorage.readRecentConnectionOverrides(storage).map(item => item.stone),
    ['seaside', 'gs64stone']
  );
});

test('replace connection profile bundle clears prior state and rewrites defaults', () => {
  const storage = makeStorage();
  connectionStorage.addFavoriteConnectionProfile({stone: 'gs64stone'}, 'Primary', '', storage);
  connectionStorage.rememberRecentConnectionOverride({stone: 'coral'}, storage);
  connectionStorage.writeLastSuccessfulConnectionOverride({stone: 'coral'}, storage);

  const replaced = connectionStorage.replaceConnectionProfileBundle({
    version: 1,
    favoriteProfiles: [
      {name: 'Seaside', target: {stone: 'seaside'}, note: 'replacement'},
    ],
    defaultFavoriteKey: connectionStorage.connectionOverrideKey({stone: 'seaside'}),
    recentOverrides: [{stone: 'seaside'}],
    lastSuccessfulOverride: {stone: 'seaside'},
  }, storage);

  assert.equal(replaced.favoriteCount, 1);
  assert.equal(replaced.defaultFavoriteProfile.name, 'Seaside');
  assert.deepEqual(
    connectionStorage.readFavoriteConnectionProfiles(storage).map(item => item.name),
    ['Seaside']
  );
  assert.deepEqual(
    connectionStorage.readRecentConnectionOverrides(storage).map(item => item.stone),
    ['seaside']
  );
  assert.equal(connectionStorage.readLastSuccessfulConnectionOverride(storage).stone, 'seaside');
});

test('connection check bundles build, sanitize, and merge deterministically', () => {
  const existing = [
    {
      label: 'local stone seaside',
      target: {stone: 'seaside'},
      status: 'ok',
      checkedAt: '2026-04-26T07:00:00.000Z',
      effectiveTarget: 'seaside',
      stoneSource: 'request-override',
    },
  ];

  const bundle = connectionStorage.buildConnectionCheckBundle([
    existing[0],
    {
      label: 'recent target coral',
      target: {stone: 'coral'},
      status: 'error',
      checkedAt: '2026-04-26T07:01:00.000Z',
      exception: 'login failed',
    },
    null,
  ]);

  assert.equal(bundle.checks.length, 2);
  assert.deepEqual(bundle.checks.map(item => item.label), ['local stone seaside', 'recent target coral']);

  const merged = connectionStorage.mergeConnectionCheckBundle(existing, {
    version: 1,
    checks: [
      bundle.checks[1],
      bundle.checks[0],
      {...bundle.checks[0]},
    ],
  });

  assert.equal(merged.importedCheckCount, 2);
  assert.equal(merged.checkCount, 2);
  assert.deepEqual(merged.checks.map(item => item.label), ['recent target coral', 'local stone seaside']);

  const replaced = connectionStorage.mergeConnectionCheckBundle(existing, {
    version: 1,
    checks: [bundle.checks[1]],
  }, {replace: true});

  assert.equal(replaced.replaced, true);
  assert.deepEqual(replaced.checks.map(item => item.label), ['recent target coral']);
});

test('connection check freshness tracks environment shifts without treating alternate stones as stale', () => {
  const checked = connectionStorage.captureConnectionCheckResult({
    label: 'local stone seaside',
    target: {stone: 'seaside'},
    status: 'ok',
    checkedAt: '2026-04-26T08:00:00.000Z',
    effectiveTarget: 'seaside',
    stoneSource: 'request-override',
  }, {
    connection: {
      configured: {
        stone: 'seaside',
        host: 'localhost',
        netldi: '50377',
        gemService: 'gemnetobject',
        mode: 'local-stone-name',
      },
      probe: {
        availableStones: ['seaside'],
        availableNetldis: [{name: 'gs64ldi', port: '50377'}],
      },
    },
  });

  assert.ok(checked.environmentFingerprint);

  const current = connectionStorage.describeConnectionCheckFreshness(checked, {
    connection: {
      configured: {
        stone: 'gs64stone',
        host: 'localhost',
        netldi: '50377',
        gemService: 'gemnetobject',
        mode: 'local-stone-name',
      },
      probe: {
        availableStones: ['seaside'],
        availableNetldis: [{name: 'gs64ldi', port: '50377'}],
      },
    },
  });

  assert.equal(current.status, 'current');
  assert.equal(current.stale, false);

  const stale = connectionStorage.describeConnectionCheckFreshness(checked, {
    connection: {
      configured: {
        stone: 'gs64stone',
        host: 'remote-host',
        netldi: '60443',
        gemService: 'remote-gem',
        mode: 'netldi',
      },
      probe: {
        availableStones: ['coral'],
        availableNetldis: [{name: 'remoteNetldi', port: '60443'}],
      },
    },
  });

  assert.equal(stale.status, 'stale');
  assert.equal(stale.stale, true);
  assert.match(stale.reason, /local probe changed/);
  assert.match(stale.reason, /server config changed/);

  const legacy = connectionStorage.describeConnectionCheckFreshness({
    label: 'legacy check',
    target: {stone: 'seaside'},
    status: 'ok',
    checkedAt: '2026-04-26T08:01:00.000Z',
  }, {
    connection: {
      configured: {
        host: 'localhost',
        netldi: '50377',
        gemService: 'gemnetobject',
        mode: 'local-stone-name',
      },
      probe: {
        availableStones: ['seaside'],
        availableNetldis: [{name: 'gs64ldi', port: '50377'}],
      },
    },
  });

  assert.equal(legacy.status, 'legacy');
  assert.equal(legacy.legacy, true);
});
