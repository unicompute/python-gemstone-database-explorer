const { test, expect } = require('@playwright/test');
const { launchDockApp, requestCount, submitModal, windowByTitle } = require('./helpers');

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
