const { test, expect } = require('@playwright/test');
const { launchDockApp, requestCount, submitModal, windowByTitle } = require('./helpers');

test('connection window shows stone-name preflight suggestions and restores across reload', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Connection');
  const connection = windowByTitle(page, 'Connection');
  await expect(connection).toBeVisible();
  await expect(connection).toContainText('gs64stone');
  await expect(connection).toContainText('seaside');
  await expect(connection).toContainText('local stone-name lookup');
  await expect(connection).toContainText('GS_NETLDI is ignored for local stone-name lookup');

  await page.evaluate(() => { window.__lastCopiedText = null; });
  await connection.getByRole('button', { name: 'Copy Fix Shell' }).click();
  await expect.poll(async () => {
    const copied = await page.evaluate(() => window.__lastCopiedText || '');
    return copied ? 'ready' : 'waiting';
  }).toBe('ready');
  expect(await page.evaluate(() => window.__lastCopiedText || '')).toContain('export GS_STONE=seaside');

  await page.evaluate(() => { window.__lastDownloadedFile = null; });
  await connection.getByRole('button', { name: 'Download JSON' }).click();
  await expect.poll(async () => {
    const download = await page.evaluate(() => window.__lastDownloadedFile || null);
    return download?.filename || '';
  }).toMatch(/^connection-preflight-.*\.json$/);
  const connectionDownload = JSON.parse(await page.evaluate(() => window.__lastDownloadedFile?.text || '{}'));
  expect(connectionDownload.preflight?.connection?.configured?.stone).toBe('gs64stone');
  expect(connectionDownload.preflight?.connection?.probe?.availableStones || []).toContain('seaside');

  await page.reload();
  const restoredConnection = windowByTitle(page, 'Connection');
  await expect(restoredConnection).toBeVisible();
  await expect(restoredConnection).toContainText('gs64stone');
  await expect(restoredConnection).toContainText('seaside');
});

test('connection window supports direct override editing and persists it across reload', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Connection');
  const connection = windowByTitle(page, 'Connection');
  await expect(connection).toBeVisible();

  await connection.getByRole('button', { name: 'Edit Override' }).click();
  await submitModal(page, ['seaside', '', '', '']);

  await expect(connection).toContainText('request-override');
  await expect(connection).toContainText('stone=seaside');
  const overrideBadge = page.locator('#taskbar-connection-override');
  await expect(overrideBadge).toBeVisible();
  await expect(overrideBadge).toContainText('Target seaside');

  await page.evaluate(() => { window.__lastDownloadedFile = null; });
  await connection.getByRole('button', { name: 'Download JSON' }).click();
  await expect.poll(async () => {
    const download = await page.evaluate(() => window.__lastDownloadedFile || null);
    return download?.filename || '';
  }).toMatch(/^connection-preflight-.*\.json$/);
  const connectionDownload = JSON.parse(await page.evaluate(() => window.__lastDownloadedFile?.text || '{}'));
  expect(connectionDownload.preflight?.connection?.configured?.stone).toBe('seaside');
  expect(connectionDownload.preflight?.connection?.configured?.stoneSource).toBe('request-override');
  expect(connectionDownload.preflight?.connection?.configured?.override?.stone).toBe('seaside');

  await page.reload();
  const restoredConnection = windowByTitle(page, 'Connection');
  await expect(restoredConnection).toBeVisible();
  await expect(restoredConnection).toContainText('request-override');
  await expect(restoredConnection).toContainText('stone=seaside');
  await expect(overrideBadge).toBeVisible();
  await expect(overrideBadge).toContainText('Target seaside');
  await expect(restoredConnection.getByRole('button', { name: 'Use Recent Target seaside' })).toBeVisible();

  await restoredConnection.getByRole('button', { name: 'Clear Override' }).click();
  await expect(overrideBadge).toBeHidden();
  await expect(restoredConnection).toContainText('gs64stone');

  await restoredConnection.getByRole('button', { name: 'Use Recent Target seaside' }).click();
  await expect(restoredConnection).toContainText('request-override');
  await expect(restoredConnection).toContainText('stone=seaside');
  await expect(overrideBadge).toBeVisible();
  await expect(overrideBadge).toContainText('Target seaside');
});

test('connection window can apply a local gslist stone directly', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Connection');
  const connection = windowByTitle(page, 'Connection');
  await expect(connection).toBeVisible();
  await expect(connection.getByRole('button', { name: 'Use Local Stone seaside' })).toBeVisible();

  await connection.getByRole('button', { name: 'Use Local Stone seaside' }).click();

  await expect(connection).toContainText('request-override');
  await expect(connection).toContainText('stone=seaside');
  await expect(connection).toContainText('Override');
  const overrideBadge = page.locator('#taskbar-connection-override');
  await expect(overrideBadge).toBeVisible();
  await expect(overrideBadge).toContainText('Target seaside');
});

test('connection window can restore the last working target after a bad override', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Connection');
  const connection = windowByTitle(page, 'Connection');
  await expect(connection).toBeVisible();

  await connection.getByRole('button', { name: 'Use Local Stone seaside' }).click();
  await expect(connection).toContainText('request-override');
  await expect(connection).toContainText('stone=seaside');

  await connection.getByRole('button', { name: 'Edit Override' }).click();
  await submitModal(page, ['coral', '', '', '']);

  await expect(connection).toContainText('error');
  await expect(connection).toContainText('stone=coral');
  await expect(connection.getByRole('button', { name: 'Use Last Working Target seaside' })).toBeVisible();

  await connection.getByRole('button', { name: 'Use Last Working Target seaside' }).click();

  await expect(connection).toContainText('request-override');
  await expect(connection).toContainText('stone=seaside');
  await expect(connection.getByRole('button', { name: 'Use Last Working Target seaside' })).toHaveCount(0);
  const overrideBadge = page.locator('#taskbar-connection-override');
  await expect(overrideBadge).toBeVisible();
  await expect(overrideBadge).toContainText('Target seaside');
});

test('connection window can save, reuse, and forget favorite targets', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Connection');
  const connection = windowByTitle(page, 'Connection');
  await expect(connection).toBeVisible();
  await expect(connection).toContainText('gs64stone');

  await connection.getByRole('button', { name: 'Save Local Stone seaside as Favorite' }).click();
  await submitModal(page, 'Local Seaside');
  await expect(connection).toContainText('gs64stone');
  await expect(connection.getByRole('button', { name: 'Use Default Favorite Target Local Seaside' })).toBeVisible();
  await expect(connection.getByRole('button', { name: 'Use Favorite Target Local Seaside' })).toBeVisible();

  await connection.getByRole('button', { name: 'Rename Favorite Target Local Seaside' }).click();
  await submitModal(page, 'Primary Seaside');
  await expect(connection.getByRole('button', { name: 'Rename Favorite' })).toBeVisible();
  await expect(connection.getByRole('button', { name: 'Use Default Favorite Target Primary Seaside' })).toBeVisible();
  await expect(connection.getByRole('button', { name: 'Use Favorite Target Primary Seaside' })).toBeVisible();
  await expect(connection.getByRole('button', { name: 'Forget Favorite Target Primary Seaside' })).toBeVisible();
  await expect(connection).toContainText('Default Favorite');

  await page.evaluate(() => { window.__lastDownloadedFile = null; });
  await connection.getByRole('button', { name: 'Download Profiles' }).click();
  await expect.poll(async () => {
    const download = await page.evaluate(() => window.__lastDownloadedFile || null);
    return download?.filename || '';
  }).toMatch(/^connection-profiles-.*\.json$/);
  const profileBundle = JSON.parse(await page.evaluate(() => window.__lastDownloadedFile?.text || '{}'));
  expect(profileBundle.favoriteProfiles?.[0]?.name).toBe('Primary Seaside');
  expect(profileBundle.defaultFavoriteKey).toBeTruthy();

  await connection.getByRole('button', { name: 'Use Default Favorite Target Primary Seaside' }).click();
  await expect(connection).toContainText('request-override');
  await expect(connection).toContainText('stone=seaside');

  await connection.getByRole('button', { name: 'Clear Override' }).click();
  await expect(connection).toContainText('gs64stone');
  await connection.getByRole('button', { name: 'Forget Favorite Target Primary Seaside' }).click();
  await expect(connection.getByRole('button', { name: 'Use Default Favorite Target Primary Seaside' })).toHaveCount(0);
  await expect(connection.getByRole('button', { name: 'Use Favorite Target Primary Seaside' })).toHaveCount(0);

  await connection.getByRole('button', { name: 'Import Profiles' }).click();
  await submitModal(page, JSON.stringify(profileBundle, null, 2));
  await expect(connection.getByRole('button', { name: 'Use Default Favorite Target Primary Seaside' })).toBeVisible();
  await expect(connection.getByRole('button', { name: 'Use Favorite Target Primary Seaside' })).toBeVisible();

  await connection.getByRole('button', { name: 'Use Default Favorite Target Primary Seaside' }).click();
  await expect(connection).toContainText('request-override');
  await expect(connection).toContainText('stone=seaside');

  await page.evaluate(() => { window.__lastDownloadedFile = null; });
  await connection.getByRole('button', { name: 'Download JSON' }).click();
  await expect.poll(async () => {
    const download = await page.evaluate(() => window.__lastDownloadedFile || null);
    return download?.filename || '';
  }).toMatch(/^connection-preflight-.*\.json$/);
  const connectionDownload = JSON.parse(await page.evaluate(() => window.__lastDownloadedFile?.text || '{}'));
  expect(connectionDownload.browserState?.defaultFavoriteProfile?.name).toBe('Primary Seaside');
  expect(connectionDownload.browserState?.favoriteProfiles?.length || 0).toBeGreaterThanOrEqual(1);

  await page.reload();
  const restoredConnection = windowByTitle(page, 'Connection');
  await expect(restoredConnection).toBeVisible();
  await expect(restoredConnection.getByRole('button', { name: 'Use Default Favorite Target Primary Seaside' })).toBeVisible();
  await expect(restoredConnection.getByRole('button', { name: 'Use Favorite Target Primary Seaside' })).toBeVisible();

  await restoredConnection.getByRole('button', { name: 'Forget Favorite Target Primary Seaside' }).click();
  await expect(restoredConnection.getByRole('button', { name: 'Use Default Favorite Target Primary Seaside' })).toHaveCount(0);
  await expect(restoredConnection.getByRole('button', { name: 'Use Favorite Target Primary Seaside' })).toHaveCount(0);
});

test('connection window can save recent and last-working targets as favorites without applying them', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Connection');
  const connection = windowByTitle(page, 'Connection');
  await expect(connection).toBeVisible();

  await connection.getByRole('button', { name: 'Use Local Stone seaside' }).click();
  await expect(connection).toContainText('request-override');
  await expect(connection).toContainText('stone=seaside');

  await connection.getByRole('button', { name: 'Clear Override' }).click();
  await expect(connection).toContainText('gs64stone');

  await connection.getByRole('button', { name: 'Save Recent Target seaside as Favorite' }).click();
  await submitModal(page, 'Recent Seaside');
  await expect(connection).toContainText('gs64stone');
  await expect(connection.getByRole('button', { name: 'Use Favorite Target Recent Seaside' })).toBeVisible();

  await connection.getByRole('button', { name: 'Use Favorite Target Recent Seaside' }).click();
  await expect(connection).toContainText('request-override');
  await expect(connection).toContainText('stone=seaside');

  await connection.getByRole('button', { name: 'Edit Override' }).click();
  await submitModal(page, ['coral', '', '', '']);
  await expect(connection).toContainText('error');
  await expect(connection).toContainText('stone=coral');
  await expect(connection.getByRole('button', { name: 'Rename Last Working Favorite seaside' })).toBeVisible();

  await connection.getByRole('button', { name: 'Rename Last Working Favorite seaside' }).click();
  await submitModal(page, 'Recovered Seaside');
  await expect(connection).toContainText('stone=coral');
  await expect(connection.getByRole('button', { name: 'Use Favorite Target Recovered Seaside' })).toBeVisible();
});

test('connection window supports cleanup actions for favorites, recents, and last working targets', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Connection');
  const connection = windowByTitle(page, 'Connection');
  await expect(connection).toBeVisible();

  await connection.getByRole('button', { name: 'Save Local Stone seaside as Favorite' }).click();
  await submitModal(page, 'Cleanup Seaside');
  await expect(connection.getByRole('button', { name: 'Use Favorite Target Cleanup Seaside' })).toBeVisible();

  await connection.getByRole('button', { name: 'Use Local Stone seaside' }).click();
  await expect(connection).toContainText('stone=seaside');
  await connection.getByRole('button', { name: 'Clear Override' }).click();
  await expect(connection).toContainText('gs64stone');
  await expect(connection.getByRole('button', { name: 'Use Recent Target seaside' })).toBeVisible();
  await expect(connection.getByRole('button', { name: 'Use Last Working Target seaside' })).toBeVisible();

  await connection.getByRole('button', { name: 'Forget Recent Target seaside' }).click();
  await expect(connection.getByRole('button', { name: 'Use Recent Target seaside' })).toHaveCount(0);
  await expect(connection.getByRole('button', { name: 'Use Last Working Target seaside' })).toBeVisible();

  await connection.getByRole('button', { name: 'Clear Favorites' }).click();
  await submitModal(page);
  await expect(connection.getByRole('button', { name: 'Use Favorite Target Cleanup Seaside' })).toHaveCount(0);

  await connection.getByRole('button', { name: 'Clear Last Working' }).click();
  await submitModal(page);
  await expect(connection.getByRole('button', { name: 'Use Last Working Target seaside' })).toHaveCount(0);
});

test('connection window can replace imported profiles instead of merging them', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Connection');
  const connection = windowByTitle(page, 'Connection');
  await expect(connection).toBeVisible();

  await connection.getByRole('button', { name: 'Save Local Stone seaside as Favorite' }).click();
  await submitModal(page, 'Primary Seaside');
  await connection.getByRole('button', { name: 'Use Local Stone seaside' }).click();
  await expect(connection).toContainText('stone=seaside');
  await connection.getByRole('button', { name: 'Clear Override' }).click();
  await expect(connection.getByRole('button', { name: 'Use Recent Target seaside' })).toBeVisible();
  await expect(connection.getByRole('button', { name: 'Use Last Working Target seaside' })).toBeVisible();

  const replacementBundle = JSON.stringify({
    version: 1,
    favoriteProfiles: [{
      name: 'Imported Coral',
      target: {stone: 'coral', host: '', netldi: '', gemService: ''},
    }],
    defaultFavoriteKey: JSON.stringify({stone: 'coral', host: '', netldi: '', gemService: ''}),
    recentOverrides: [{stone: 'coral', host: '', netldi: '', gemService: ''}],
    lastSuccessfulOverride: {stone: 'coral', host: '', netldi: '', gemService: ''},
  }, null, 2);

  await connection.getByRole('button', { name: 'Replace Profiles' }).click();
  await submitModal(page, replacementBundle);

  await expect(connection.getByRole('button', { name: 'Use Favorite Target Primary Seaside' })).toHaveCount(0);
  await expect(connection.getByRole('button', { name: 'Use Favorite Target Imported Coral' })).toBeVisible();
  await expect(connection.getByRole('button', { name: 'Use Default Favorite Target Imported Coral' })).toBeVisible();
  await expect(connection.getByRole('button', { name: 'Use Recent Target seaside' })).toHaveCount(0);
  await expect(connection.getByRole('button', { name: 'Use Recent Target coral' })).toBeVisible();
  await expect(connection.getByRole('button', { name: 'Use Last Working Target coral' })).toBeVisible();
});

test('connection window can edit saved favorite targets and copy shell exports from profile rows', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Connection');
  const connection = windowByTitle(page, 'Connection');
  await expect(connection).toBeVisible();
  await expect(connection).toContainText('gs64stone');

  await connection.getByRole('button', { name: 'Save Local Stone seaside as Favorite' }).click();
  await submitModal(page, ['Local Seaside', 'Local development stone']);
  await expect(connection.getByRole('button', { name: 'Use Favorite Target Local Seaside' })).toBeVisible();
  await expect(connection).toContainText('Local development stone');

  await connection.getByRole('button', { name: 'Edit Favorite Target Local Seaside' }).click();
  await submitModal(page, ['Coral Favorite', 'Remote failover target', 'coral', '', '', '']);
  await expect(connection).toContainText('gs64stone');
  await expect(connection.getByRole('button', { name: 'Use Favorite Target Local Seaside' })).toHaveCount(0);
  await expect(connection.getByRole('button', { name: 'Use Favorite Target Coral Favorite' })).toBeVisible();
  await expect(connection.getByRole('button', { name: 'Use Default Favorite Target Coral Favorite' })).toBeVisible();
  await expect(connection).toContainText('Remote failover target');

  await page.evaluate(() => { window.__lastCopiedText = null; });
  await connection.getByRole('button', { name: 'Copy Default Favorite Shell' }).click();
  await expect.poll(async () => {
    const copied = await page.evaluate(() => window.__lastCopiedText || '');
    return copied ? 'ready' : 'waiting';
  }).toBe('ready');
  expect(await page.evaluate(() => window.__lastCopiedText || '')).toContain('export GS_STONE=coral');

  await page.evaluate(() => { window.__lastDownloadedFile = null; });
  await connection.getByRole('button', { name: 'Download Profiles' }).click();
  await expect.poll(async () => {
    const download = await page.evaluate(() => window.__lastDownloadedFile || null);
    return download?.filename || '';
  }).toMatch(/^connection-profiles-.*\.json$/);
  const profileBundle = JSON.parse(await page.evaluate(() => window.__lastDownloadedFile?.text || '{}'));
  expect(profileBundle.favoriteProfiles?.[0]?.note).toBe('Remote failover target');

  await connection.getByRole('button', { name: 'Use Local Stone seaside' }).click();
  await expect(connection).toContainText('stone=seaside');
  await connection.getByRole('button', { name: 'Clear Override' }).click();
  await expect(connection).toContainText('gs64stone');

  await page.evaluate(() => { window.__lastCopiedText = null; });
  await connection.getByRole('button', { name: 'Copy Recent Shell seaside' }).click();
  await expect.poll(async () => {
    const copied = await page.evaluate(() => window.__lastCopiedText || '');
    return copied ? 'ready' : 'waiting';
  }).toBe('ready');
  expect(await page.evaluate(() => window.__lastCopiedText || '')).toContain('export GS_STONE=seaside');

  await page.reload();
  const restoredConnection = windowByTitle(page, 'Connection');
  await expect(restoredConnection.getByRole('button', { name: 'Use Favorite Target Coral Favorite' })).toBeVisible();
  await expect(restoredConnection).toContainText('Remote failover target');
});

test('connection window preserves manual favorite ordering across export and reload', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Connection');
  const connection = windowByTitle(page, 'Connection');
  await expect(connection).toBeVisible();

  await connection.getByRole('button', { name: 'Save Local Stone seaside as Favorite' }).click();
  await submitModal(page, 'Seaside A');

  await connection.getByRole('button', { name: 'Edit Override' }).click();
  await submitModal(page, ['coral', '', '', '']);
  await connection.getByRole('button', { name: 'Save Target' }).click();
  await submitModal(page, 'Coral B');

  let favoriteButtons = connection.locator('.connection-favorite-override-btn');
  await expect(favoriteButtons.nth(0)).toHaveText(/Use Favorite Target Coral B/);
  await expect(favoriteButtons.nth(1)).toHaveText(/Use Favorite Target Seaside A/);

  await connection.getByRole('button', { name: 'Move Favorite Down Coral B' }).click();
  favoriteButtons = connection.locator('.connection-favorite-override-btn');
  await expect(favoriteButtons.nth(0)).toHaveText(/Use Favorite Target Seaside A/);
  await expect(favoriteButtons.nth(1)).toHaveText(/Use Favorite Target Coral B/);

  await page.evaluate(() => { window.__lastDownloadedFile = null; });
  await connection.getByRole('button', { name: 'Download Profiles' }).click();
  await expect.poll(async () => {
    const download = await page.evaluate(() => window.__lastDownloadedFile || null);
    return download?.filename || '';
  }).toMatch(/^connection-profiles-.*\.json$/);
  const profileBundle = JSON.parse(await page.evaluate(() => window.__lastDownloadedFile?.text || '{}'));
  expect(profileBundle.favoriteProfiles?.map(item => item.name)).toEqual(['Seaside A', 'Coral B']);

  await page.reload();
  const restoredConnection = windowByTitle(page, 'Connection');
  favoriteButtons = restoredConnection.locator('.connection-favorite-override-btn');
  await expect(favoriteButtons.nth(0)).toHaveText(/Use Favorite Target Seaside A/);
  await expect(favoriteButtons.nth(1)).toHaveText(/Use Favorite Target Coral B/);
});

test('connection window can check saved targets without applying them and persist check results', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Connection');
  const connection = windowByTitle(page, 'Connection');
  await expect(connection).toBeVisible();
  await expect(connection).toContainText('gs64stone');

  await connection.getByRole('button', { name: 'Save Local Stone seaside as Favorite' }).click();
  await submitModal(page, ['Seaside Check', 'Healthy local stone']);
  await connection.getByRole('button', { name: 'Check Favorite Target Seaside Check' }).click();
  await expect(connection).toContainText('gs64stone');
  await expect(connection).toContainText('Target Checks');
  await expect(connection).toContainText('favorite target Seaside Check');
  await expect(connection).toContainText('effective seaside');

  await connection.getByRole('button', { name: 'Edit Override' }).click();
  await submitModal(page, ['coral', '', '', '']);
  await connection.getByRole('button', { name: 'Save Target' }).click();
  await submitModal(page, ['Coral Check', 'Expected failure']);
  await connection.getByRole('button', { name: 'Clear Override' }).click();
  await expect(connection).toContainText('gs64stone');
  await connection.getByRole('button', { name: 'Check Favorite Target Coral Check' }).click();
  await expect(connection).toContainText('favorite target Coral Check');
  await expect(connection).toContainText('Error');

  await page.reload();
  const restoredConnection = windowByTitle(page, 'Connection');
  await expect(restoredConnection).toContainText('favorite target Seaside Check');
  await expect(restoredConnection).toContainText('favorite target Coral Check');

  await restoredConnection.locator('.connection-apply-check-result-btn').nth(1).click();
  await expect(restoredConnection).toContainText('request-override');
  await expect(restoredConnection).toContainText('stone=seaside');

  await restoredConnection.getByRole('button', { name: 'Clear Checks' }).click();
  await submitModal(page);
  await expect(restoredConnection).toContainText('Target Checks');
  await expect(restoredConnection).toContainText('0 saved');
  await expect(restoredConnection).not.toContainText('favorite target Seaside Check');
  await expect(restoredConnection).not.toContainText('favorite target Coral Check');
});

test('connection window can save checked targets as favorites and bulk recheck them', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Connection');
  const connection = windowByTitle(page, 'Connection');
  await expect(connection).toBeVisible();

  await connection.getByRole('button', { name: 'Check Local Stone seaside' }).click();
  await expect(connection).toContainText('local stone seaside');
  await connection.locator('.connection-save-check-favorite-btn').first().click();
  await submitModal(page, ['Seaside From Check', 'Saved from target checks']);
  await expect(connection).toContainText('Use Favorite Target Seaside From Check');

  await connection.getByRole('button', { name: 'Edit Override' }).click();
  await submitModal(page, ['coral', '', '', '']);
  await connection.getByRole('button', { name: 'Clear Override' }).click();
  await expect(connection).toContainText('gs64stone');
  await connection.getByRole('button', { name: 'Check Recent Target coral' }).click();
  await expect(connection).toContainText('recent target coral');
  await expect(connection).toContainText('2 saved');

  const beforeFailureRecheck = await requestCount(page, 'connection.preflight');
  await connection.getByRole('button', { name: 'Recheck Failures' }).click();
  await expect.poll(() => requestCount(page, 'connection.preflight')).toBe(beforeFailureRecheck + 1);
  await expect(connection).toContainText('recent target coral');

  const beforeRecheckAll = await requestCount(page, 'connection.preflight');
  await connection.getByRole('button', { name: 'Recheck All' }).click();
  await expect.poll(() => requestCount(page, 'connection.preflight')).toBe(beforeRecheckAll + 2);
  await expect(connection).toContainText('Use Favorite Target Seaside From Check');
  await expect(connection).toContainText('recent target coral');
});

test('connection window can download, import, and replace target checks', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Connection');
  const connection = windowByTitle(page, 'Connection');
  await expect(connection).toBeVisible();

  await connection.getByRole('button', { name: 'Check Local Stone seaside' }).click();
  await expect(connection).toContainText('local stone seaside');

  await connection.getByRole('button', { name: 'Edit Override' }).click();
  await submitModal(page, ['coral', '', '', '']);
  await connection.getByRole('button', { name: 'Clear Override' }).click();
  await connection.getByRole('button', { name: 'Check Recent Target coral' }).click();
  await expect(connection).toContainText('recent target coral');

  await page.evaluate(() => { window.__lastDownloadedFile = null; });
  await connection.getByRole('button', { name: 'Download Checks JSON' }).click();
  await expect.poll(async () => {
    const download = await page.evaluate(() => window.__lastDownloadedFile || null);
    return download?.filename || '';
  }).toMatch(/^connection-checks-.*\.json$/);
  const bundle = JSON.parse(await page.evaluate(() => window.__lastDownloadedFile?.text || '{}'));
  expect(bundle.checks?.length).toBe(2);
  expect(bundle.checks?.map(item => item.label)).toEqual(['recent target coral', 'local stone seaside']);

  await connection.getByRole('button', { name: 'Clear Checks' }).click();
  await submitModal(page);
  await expect(connection).toContainText('Target Checks');
  await expect(connection).toContainText('0 saved');
  await expect(connection).not.toContainText('local stone seaside');
  await expect(connection).not.toContainText('recent target coral');

  await connection.getByRole('button', { name: 'Import Checks JSON' }).click();
  await submitModal(page, [JSON.stringify(bundle, null, 2)]);
  await expect(connection).toContainText('Target Checks');
  await expect(connection).toContainText('local stone seaside');
  await expect(connection).toContainText('recent target coral');

  await connection.getByRole('button', { name: 'Replace Checks JSON' }).click();
  await submitModal(page, [JSON.stringify({version: 1, checks: [bundle.checks[1]]}, null, 2)]);
  await expect(connection).toContainText('local stone seaside');
  await expect(connection).not.toContainText('recent target coral');
  await expect(connection).toContainText('1 saved');
});

test('connection window marks saved target checks stale when the environment changes', async ({ page }) => {
  await page.request.post('/debug/mock/connection-mode', { data: {} });
  try {
    await page.goto('/');

    await launchDockApp(page, 'Connection');
    const connection = windowByTitle(page, 'Connection');
    await expect(connection).toBeVisible();

    await connection.getByRole('button', { name: 'Check Local Stone seaside' }).click();
    await expect(connection).toContainText('local stone seaside');
    await expect(connection).toContainText('Current');
    await expect(connection).not.toContainText('1 stale');

    await page.request.post('/debug/mock/connection-mode', {
      data: {
        host: 'remote-host',
        netldi: '60443',
        availableStones: ['coral'],
        availableNetldis: [{ name: 'remoteNetldi', port: '60443' }],
      },
    });
    await connection.getByRole('button', { name: 'Refresh' }).click();

    await expect(connection).toContainText('remote-host');
    await expect(connection).toContainText('1 stale');
    await expect(connection).toContainText('Stale');
    await expect(connection).toContainText('local probe changed');
    await expect(connection).toContainText('server config changed');

    await connection.getByRole('button', { name: 'Stale', exact: true }).click();
    await expect(connection).toContainText('Viewing 1 stale check');
    await expect(connection).toContainText('Copy Visible Checks JSON');
    await expect(connection).not.toContainText('No stale target checks in the current view.');

    await page.reload();
    const restoredConnection = windowByTitle(page, 'Connection');
    await page.request.post('/debug/mock/connection-mode', {
      data: {
        host: 'remote-host',
        netldi: '60443',
        availableStones: ['coral'],
        availableNetldis: [{ name: 'remoteNetldi', port: '60443' }],
      },
    });
    await restoredConnection.getByRole('button', { name: 'Refresh' }).click();
    await expect(restoredConnection).toContainText('Viewing 1 stale check');
    await expect(restoredConnection).toContainText('remote-host');
    await expect(restoredConnection).toContainText('Recheck Stale');

    const beforeStaleRecheck = await requestCount(page, 'connection.preflight');
    await page.request.post('/debug/mock/connection-mode', { data: {} });
    await restoredConnection.getByRole('button', { name: 'Recheck Stale' }).click();
    await expect.poll(() => requestCount(page, 'connection.preflight')).toBe(beforeStaleRecheck + 2);
    await expect(restoredConnection).toContainText('0 stale');
    await expect(restoredConnection).toContainText('No stale target checks in the current view.');
  } finally {
    await page.request.post('/debug/mock/connection-mode', { data: {} });
  }
});

test('connection window can recover the desktop after a failed startup', async ({ page }) => {
  await page.goto('/');
  await launchDockApp(page, 'About');
  await expect(windowByTitle(page, 'About')).toBeVisible();

  await page.request.post('/debug/mock/connection-mode', {
    data: {idsFail: true, preflightSuccess: false},
  });
  await page.goto('/?boot=ids-fail');

  const connection = windowByTitle(page, 'Connection');
  await expect(connection).toBeVisible();
  await expect(connection).toContainText('mock startup login failed');
  await expect(connection.getByRole('button', { name: 'Retry Startup' })).toBeVisible();
  await expect(page.locator('.win')).toHaveCount(1);

  await page.request.post('/debug/mock/connection-mode', {
    data: {idsFail: false, preflightSuccess: true},
  });
  await connection.getByRole('button', { name: 'Retry Startup' }).click();

  await expect(page.locator('.win').filter({ has: page.locator('.win-title', { hasText: 'Connection' }) })).toHaveCount(0);
  await expect(page.locator('.win')).toHaveCount(3);
  await expect(page.locator('.win').filter({ hasText: 'aSymbolDictionary()' }).first()).toBeVisible();
  await expect(page.locator('.win').filter({ hasText: 'Abort Transaction' }).first()).toBeVisible();
  await expect(windowByTitle(page, 'About')).toBeVisible();
});

test('connection window can apply a suggested target override and recover without restart', async ({ page }) => {
  await page.goto('/?boot=ids-fail');

  const connection = windowByTitle(page, 'Connection');
  await expect(connection).toBeVisible();
  await expect(connection).toContainText('gs64stone');
  await expect(connection.getByRole('button', { name: 'Use Suggested Target' })).toBeVisible();

  await connection.getByRole('button', { name: 'Use Suggested Target' }).click();
  const overrideBadge = page.locator('#taskbar-connection-override');
  await expect(page.locator('.win').filter({ has: page.locator('.win-title', { hasText: 'Connection' }) })).toHaveCount(0);
  await expect(page.locator('.win').filter({ hasText: 'aSymbolDictionary()' }).first()).toBeVisible();
  await expect(page.locator('.win').filter({ hasText: 'Abort Transaction' }).first()).toBeVisible();
  await expect(overrideBadge).toBeVisible();
  await expect(overrideBadge).toContainText('Target seaside');

  await overrideBadge.click();
  const reopenedConnection = windowByTitle(page, 'Connection');
  await expect(reopenedConnection).toBeVisible();
  await expect(reopenedConnection).toContainText('request-override');
  await expect(reopenedConnection).toContainText('stone=seaside');
});

test('about window surfaces active connection override and exports it in the support bundle', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Connection');
  const connection = windowByTitle(page, 'Connection');
  await expect(connection).toBeVisible();
  await connection.getByRole('button', { name: 'Use Suggested Target' }).click();
  await expect(connection).toContainText('request-override');
  await expect(connection).toContainText('stone=seaside');

  await launchDockApp(page, 'About');
  const about = windowByTitle(page, 'About');
  await expect(about).toBeVisible();
  await expect(about).toContainText('Connection Target');
  await expect(about).toContainText('seaside');
  await expect(about).toContainText('Connection Source');
  await expect(about).toContainText('request-override');
  await expect(about).toContainText('Connection Override');
  await expect(about).toContainText('stone=seaside');

  await page.evaluate(() => { window.__lastDownloadedFile = null; });
  await about.getByRole('button', { name: 'Download Bundle' }).click();
  await expect.poll(async () => {
    const lastBundle = await page.evaluate(() => window.__lastDownloadedFile || null);
    return lastBundle?.filename || '';
  }).toMatch(/^support-bundle-.*\.json$/);
  const bundle = JSON.parse(await page.evaluate(() => window.__lastDownloadedFile?.text || '{}'));
  expect(bundle.connectionSummary?.effectiveTarget || '').toContain('seaside');
  expect(bundle.connectionSummary?.stoneSource || '').toBe('request-override');
  expect(bundle.connectionSummary?.override?.stone || '').toBe('seaside');
  expect(bundle.diagnostics?.server?.connection?.configured?.stone || '').toBe('seaside');
});
