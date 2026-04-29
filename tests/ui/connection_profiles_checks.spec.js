const { test, expect } = require('@playwright/test');
const { launchDockApp, submitModal, windowByTitle } = require('./helpers');

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
