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
