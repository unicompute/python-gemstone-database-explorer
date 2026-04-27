const { test, expect } = require('@playwright/test');
const { launchDockApp, windowByTitle } = require('./helpers');

test('about window shows runtime metadata, exports a support bundle, and restores across reload', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'About');
  const about = windowByTitle(page, 'About');
  await expect(about).toBeVisible();
  await expect(about).toContainText('GemStone Database Explorer');
  await expect(about).toContainText('Explorer');
  await expect(about).toContainText('1.0.0');
  await expect(about).toContainText('Health');
  await expect(about).toContainText('ok');
  await expect(about).toContainText('Window-scoped channel families');
  await page.evaluate(() => { window.setStatus(false, 'about routed failure'); });
  await expect(about).toContainText('Status Errors');
  await expect(about).toContainText('about routed failure');
  await about.getByRole('button', { name: 'Errors Only' }).click();
  const errorLog = windowByTitle(page, 'Status Log');
  await expect(errorLog).toBeVisible();
  await expect(errorLog.getByRole('button', { name: 'Errors' })).toHaveClass(/active/);
  await expect(errorLog).toContainText('about routed failure');
  await expect(errorLog).not.toContainText('connected');

  await page.reload();

  const restoredAbout = windowByTitle(page, 'About');
  const restoredErrorLog = windowByTitle(page, 'Status Log');
  await expect(restoredAbout).toBeVisible();
  await expect(restoredErrorLog).toBeVisible();
  await expect(restoredAbout).toContainText('Explorer');
  await expect(restoredAbout).toContainText('1.0.0');
  await expect(restoredAbout).toContainText('ok');
  await expect(restoredAbout).toContainText('about routed failure');
  await expect(restoredAbout).toContainText('Window Links');
  await expect(restoredAbout).toContainText('Window Groups');
  await expect(restoredAbout).toContainText('Largest Group');
  await expect(restoredErrorLog.getByRole('button', { name: 'Errors' })).toHaveClass(/active/);
  await expect(restoredErrorLog).toContainText('about routed failure');
  await restoredAbout.locator('.win-title').click();
  await page.evaluate(() => { window.__lastCopiedText = null; });
  await restoredAbout.getByRole('button', { name: 'Copy Bundle' }).click();
  await expect.poll(async () => {
    const copied = await page.evaluate(() => window.__lastCopiedText || '');
    return copied ? 'ready' : 'waiting';
  }).toBe('ready');
  const copiedBundle = JSON.parse(await page.evaluate(() => window.__lastCopiedText || '{}'));
  expect(copiedBundle.statusSummary?.error || 0).toBeGreaterThan(0);
  expect(copiedBundle.statusSummary?.latestError?.message || '').toContain('about routed failure');
  expect(copiedBundle.taskbarVersion || '').toContain('Explorer');
  expect(Array.isArray(copiedBundle.windowLinks)).toBe(true);
  expect(copiedBundle.windowLinks.some(each => each.type === 'source' && each.fromTitle === 'About' && each.toTitle === 'Status Log')).toBe(true);
  expect(Array.isArray(copiedBundle.windowGroups)).toBe(true);
  const copiedAboutGroup = copiedBundle.windowGroups.find(each => (each.titles || []).includes('About') && (each.titles || []).includes('Status Log'));
  expect(copiedAboutGroup).toBeTruthy();
  expect(copiedAboutGroup?.size || 0).toBeGreaterThanOrEqual(2);
  await restoredAbout.getByRole('button', { name: 'Download JSON' }).click();
  await expect.poll(async () => {
    const lastDownload = await page.evaluate(() => window.__lastDownloadedFile || null);
    return lastDownload ? 'ready' : 'waiting';
  }).toBe('ready');
  const lastDownload = await page.evaluate(() => window.__lastDownloadedFile || null);
  expect(lastDownload?.filename || '').toMatch(/^diagnostics-.*\.json$/);
  expect(lastDownload?.text || '').toContain('"sessionBroker"');
  expect(lastDownload?.text || '').toContain('"browser"');

  await page.evaluate(() => { window.__lastDownloadedFile = null; });
  await restoredAbout.getByRole('button', { name: 'Download Bundle' }).click();
  await expect.poll(async () => {
    const lastBundle = await page.evaluate(() => window.__lastDownloadedFile || null);
    return lastBundle?.filename || '';
  }).toMatch(/^support-bundle-.*\.json$/);
  const lastBundle = await page.evaluate(() => window.__lastDownloadedFile || null);
  const bundle = JSON.parse(lastBundle?.text || '{}');
  expect(Array.isArray(bundle.openWindows)).toBe(true);
  expect(bundle.openWindows.some(each => each.title === 'About')).toBe(true);
  expect(bundle.openWindows.some(each => each.title === 'Status Log' && each.sourceWindowId)).toBe(true);
  expect(bundle.currentStatus?.text || '').toContain('downloaded diagnostics');
  expect(bundle.windowLayout?.windows?.length || 0).toBeGreaterThan(0);
  expect(Array.isArray(bundle.windowLinks)).toBe(true);
  expect(bundle.windowLinks.some(each => each.type === 'source' && each.fromTitle === 'About' && each.toTitle === 'Status Log')).toBe(true);
  expect(Array.isArray(bundle.windowGroups)).toBe(true);
  const downloadedAboutGroup = bundle.windowGroups.find(each => (each.titles || []).includes('About') && (each.titles || []).includes('Status Log'));
  expect(downloadedAboutGroup).toBeTruthy();
  expect(downloadedAboutGroup?.size || 0).toBeGreaterThanOrEqual(2);
  expect(bundle.diagnostics?.server?.sessionBroker).toBeTruthy();
  expect(bundle.statusSummary?.error || 0).toBeGreaterThan(0);
  expect(bundle.taskbarVersion || '').toContain('Explorer');
});

test('window groups window filters linked groups, raises related windows, closes a selected group, and restores state', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'About');
  const about = windowByTitle(page, 'About');
  await expect(about).toBeVisible();
  await page.evaluate(() => { window.setStatus(false, 'grouped support failure'); });
  await about.getByRole('button', { name: 'Errors Only' }).click();
  const statusLog = windowByTitle(page, 'Status Log');
  await expect(statusLog).toBeVisible();
  await about.locator('.win-title').click();
  await about.getByRole('button', { name: 'Window Groups' }).click();
  const groups = windowByTitle(page, 'Window Groups');
  await expect(groups).toBeVisible();
  await expect(groups).toContainText('About');
  await expect(groups).toContainText('Status Log');
  await groups.getByRole('button', { name: 'Linked Only' }).click();
  await expect(groups).toContainText('1 of 1 group shown');
  await expect(groups).toContainText('linked groups only');
  await expect(groups).toContainText('export targets current view');
  await expect(groups.locator('.window-group-card')).toHaveCount(1);
  await groups.getByPlaceholder('Filter groups').fill('status');
  await expect(groups).toContainText('1 of 1 group shown');
  await expect(groups.locator('.window-group-card')).toHaveCount(1);
  await expect(groups.getByRole('button', { name: 'Download Visible JSON' })).toBeVisible();
  await page.evaluate(() => { window.__lastDownloadedFile = null; });
  await groups.getByRole('button', { name: 'Download Visible JSON' }).click();
  await expect.poll(async () => {
    const lastDownload = await page.evaluate(() => window.__lastDownloadedFile || null);
    return lastDownload?.filename || '';
  }).toMatch(/^window-groups-.*\.json$/);
  const downloadedGroups = JSON.parse(await page.evaluate(() => window.__lastDownloadedFile?.text || '{}'));
  expect(downloadedGroups.exportScope).toBe('current-view');
  expect(downloadedGroups.viewMode).toBe('linked');
  expect(downloadedGroups.filterText).toBe('status');
  expect(Array.isArray(downloadedGroups.groups)).toBe(true);
  expect(downloadedGroups.groups).toHaveLength(1);
  expect(downloadedGroups.groups[0]?.titles || []).toEqual(expect.arrayContaining(['About', 'Status Log']));
  expect(downloadedGroups.groups[0]?.titles || []).not.toContain('aSymbolDictionary()');
  expect(downloadedGroups.groups[0]?.titles || []).not.toContain('a System');
  await about.locator('.win-btn-min').click();
  await expect(about).toHaveAttribute('data-minimised', '1');
  const aboutGroup = groups.locator('.window-group-card').filter({ hasText: 'About' }).first();
  await aboutGroup.getByRole('button', { name: 'Raise Group' }).click();
  await expect(about).not.toHaveAttribute('data-minimised', '1');
  await expect(about).toHaveClass(/focused/);
  await page.locator('.taskbar-btn').filter({ hasText: 'Window Groups' }).click();
  await expect(groups).toHaveClass(/focused/);
  await groups.locator('.window-group-card').filter({ hasText: 'About' }).first()
    .locator('.window-group-member').filter({ hasText: 'Status Log' }).click();
  await expect(statusLog).toHaveClass(/focused/);

  await page.locator('.taskbar-btn').filter({ hasText: 'Window Groups' }).click();
  await expect(groups).toHaveClass(/focused/);
  await groups.locator('.window-group-card').filter({ hasText: 'About' }).first()
    .getByRole('button', { name: 'Close Group' }).click();
  await expect(page.locator('.win').filter({ has: page.locator('.win-title', { hasText: 'About' }) })).toHaveCount(0);
  await expect(page.locator('.win').filter({ has: page.locator('.win-title', { hasText: 'Status Log' }) })).toHaveCount(0);
  await expect(groups).toBeVisible();

  await page.reload();
  const restoredGroups = windowByTitle(page, 'Window Groups');
  await expect(restoredGroups).toBeVisible();
  await expect(restoredGroups.getByPlaceholder('Filter groups')).toHaveValue('status');
  await expect(restoredGroups.getByRole('button', { name: 'Linked Only' })).toHaveClass(/active/);
  await expect(restoredGroups).toContainText('linked groups only');
  await expect(restoredGroups.getByRole('button', { name: 'Download Visible JSON' })).toBeVisible();
});

test('window links window filters related source links, reveals endpoints, exports JSON, and restores state', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'About');
  const about = windowByTitle(page, 'About');
  await expect(about).toBeVisible();
  await page.evaluate(() => { window.setStatus(false, 'linked support failure'); });
  await about.getByRole('button', { name: 'Errors Only' }).click();
  const statusLog = windowByTitle(page, 'Status Log');
  await expect(statusLog).toBeVisible();
  await about.locator('.win-title').click();
  await about.getByRole('button', { name: 'Window Links' }).click();
  const links = windowByTitle(page, 'Window Links');
  await expect(links).toBeVisible();
  await expect(links).toContainText('About');
  await expect(links).toContainText('Status Log');
  await expect(links.getByRole('button', { name: 'Related Only' })).toHaveClass(/active/);
  await expect(links).toContainText('related to About');
  await links.getByRole('button', { name: 'Source' }).click();
  await links.getByPlaceholder('Filter links').fill('status');
  await expect(links).toContainText(/1 of 2 links shown/);
  await expect(links).toContainText('source links only');
  await expect(links).toContainText('export targets current view');
  await expect(links.locator('.window-link-entry')).toHaveCount(1);
  await page.evaluate(() => {
    const target = [...document.querySelectorAll('.win')]
      .find(each => each.querySelector('.win-title')?.textContent?.trim() === 'Status Log');
    target?.querySelector('.win-btn-min')?.click();
  });
  await expect(statusLog).toHaveAttribute('data-minimised', '1');
  await links.getByRole('button', { name: 'Raise Selected Group' }).click();
  await expect(statusLog).not.toHaveAttribute('data-minimised', '1');
  await expect(statusLog).toHaveClass(/focused/);
  await page.evaluate(() => {
    const target = [...document.querySelectorAll('.win')]
      .find(each => each.querySelector('.win-title')?.textContent?.trim() === 'Status Log');
    target?.querySelector('.win-btn-min')?.click();
  });
  await expect(statusLog).toHaveAttribute('data-minimised', '1');
  await page.evaluate(() => {
    const win = [...document.querySelectorAll('.win')]
      .find(each => each.querySelector('.win-title')?.textContent?.trim() === 'Window Links');
    const btn = [...(win?.querySelectorAll('[data-link-endpoint="to"]') || [])]
      .find(each => (each.textContent || '').includes('Status Log'));
    btn?.click();
  });
  await expect(statusLog).not.toHaveAttribute('data-minimised', '1');
  await page.locator('.taskbar-btn').filter({ hasText: 'Window Links' }).click();
  await expect(links).toHaveClass(/focused/);
  await expect(links.locator('.window-link-entry.active')).toHaveCount(1);
  await page.evaluate(() => { window.__lastDownloadedFile = null; });
  await links.getByRole('button', { name: 'Download Visible JSON' }).click();
  await expect.poll(async () => {
    const lastDownload = await page.evaluate(() => window.__lastDownloadedFile || null);
    return lastDownload?.filename || '';
  }).toMatch(/^window-links-.*\.json$/);
  const downloadedLinks = JSON.parse(await page.evaluate(() => window.__lastDownloadedFile?.text || '{}'));
  expect(downloadedLinks.exportScope).toBe('current-view');
  expect(downloadedLinks.linkType).toBe('source');
  expect(downloadedLinks.viewMode).toBe('related');
  expect(downloadedLinks.filterText).toBe('status');
  expect(downloadedLinks.sourceTitle).toBe('About');
  expect(Array.isArray(downloadedLinks.links)).toBe(true);
  expect(downloadedLinks.links).toHaveLength(1);
  expect(downloadedLinks.links[0]?.fromTitle).toBe('About');
  expect(downloadedLinks.links[0]?.toTitle).toBe('Status Log');

  await page.reload();
  const restoredLinks = windowByTitle(page, 'Window Links');
  await expect(restoredLinks).toBeVisible();
  await expect(restoredLinks.getByPlaceholder('Filter links')).toHaveValue('status');
  await expect(restoredLinks.getByRole('button', { name: 'Source' })).toHaveClass(/active/);
  await expect(restoredLinks.getByRole('button', { name: 'Related Only' })).toHaveClass(/active/);
  await expect(restoredLinks).toContainText('related to About');
  await expect(restoredLinks).toContainText('source links only');
  await expect(restoredLinks.locator('.window-link-entry.active')).toHaveCount(1);
  await expect(restoredLinks.getByRole('button', { name: 'Download Visible JSON' })).toBeVisible();
});

test('window links can close the selected linked group while keeping the helper window open', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'About');
  const about = windowByTitle(page, 'About');
  await page.evaluate(() => { window.setStatus(false, 'linked support failure'); });
  await about.getByRole('button', { name: 'Errors Only' }).click();
  const statusLog = windowByTitle(page, 'Status Log');
  await about.locator('.win-title').click();
  await about.getByRole('button', { name: 'Window Links' }).click();
  const links = windowByTitle(page, 'Window Links');
  await links.getByRole('button', { name: 'Source' }).click();
  await links.getByPlaceholder('Filter links').fill('status');
  await expect(links.locator('.window-link-entry')).toHaveCount(1);

  await links.getByRole('button', { name: 'Close Selected Group' }).click();

  await expect(windowByTitle(page, 'About')).toHaveCount(0);
  await expect(windowByTitle(page, 'Status Log')).toHaveCount(0);
  await expect(links).toBeVisible();
  await expect(links).toContainText('No window links are currently related to the source window.');
});

test('status log filters entries, exports JSON, and restores across reload', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Status Log');
  const log = windowByTitle(page, 'Status Log');
  await expect(log).toBeVisible();
  await expect(log).toContainText('connected');
  await expect(log).toContainText('1 of 1 entry shown');
  await expect(log.locator('.status-log-source-badge').first()).toBeVisible();

  await launchDockApp(page, 'About');
  const about = windowByTitle(page, 'About');
  await expect(about).toBeVisible();
  await page.evaluate(() => { window.setStatus(false, 'source tagged failure'); });
  await expect(log).toContainText('source tagged failure');
  const latestSourceBadge = log.locator('.status-log-entry').first().locator('.status-log-source-badge');
  await expect(latestSourceBadge).toContainText('About');
  await about.locator('.win-btn-min').click();
  await expect(about).toHaveAttribute('data-minimised', '1');
  await log.locator('.win-title').click();
  await latestSourceBadge.click();
  await expect(about).not.toHaveAttribute('data-minimised', '1');
  await expect(about).toHaveClass(/focused/);
  await about.locator('.win-btn-close').click();
  await expect(log.locator('.status-log-entry').first().locator('.status-log-source-note')).toContainText('Closed');
  await log.locator('.win-title').click();
  await log.locator('.status-log-filter').fill('about');
  await expect(log).toContainText('1 of 2 entries shown');
  await log.getByRole('button', { name: 'Errors' }).click();
  await expect(log).toContainText('1 of 2 entries shown');
  await expect(log).toContainText('source tagged failure');
  await expect(log.locator('.status-log-source-badge')).toContainText('About');
  await expect(log.locator('.status-log-source-note')).toContainText('Closed');
  await expect(log).not.toContainText('connected');
  await expect(log.getByRole('button', { name: 'Copy Visible JSON' })).toBeVisible();
  await expect(log.getByRole('button', { name: 'Download Visible JSON' })).toBeVisible();

  await log.getByRole('button', { name: 'Download Visible JSON' }).click();
  await expect.poll(async () => {
    const lastDownload = await page.evaluate(() => window.__lastDownloadedFile || null);
    return lastDownload ? 'ready' : 'waiting';
  }).toBe('ready');
  await expect(log.locator('.status-log-meta')).toContainText('1 of 3 entries shown');
  await expect(log.locator('.status-log-meta')).toContainText('export targets current view');
  const lastDownload = await page.evaluate(() => window.__lastDownloadedFile || null);
  expect(lastDownload?.filename || '').toMatch(/^status-history-.*\.json$/);
  expect(lastDownload?.text || '').toContain('source tagged failure');
  expect(lastDownload?.text || '').toContain('"sourceTitle": "About"');
  expect(lastDownload?.text || '').not.toContain('connected');

  await page.reload();

  const restoredLog = windowByTitle(page, 'Status Log');
  await expect(restoredLog).toBeVisible();
  await expect(restoredLog.locator('.status-log-filter')).toHaveValue('about');
  await expect(restoredLog.locator('.status-log-meta')).toContainText(/1 of \d+ entr/);
  await expect(restoredLog.locator('.status-log-meta')).toContainText('export targets current view');
  await expect(restoredLog).toContainText('source tagged failure');
  await expect(restoredLog.locator('.status-log-entry').first().locator('.status-log-source-badge')).toContainText('About');
  await expect(restoredLog.locator('.status-log-entry').first().locator('.status-log-source-note')).toContainText('Closed');
  await expect(restoredLog).not.toContainText('connected');
  await expect(restoredLog.getByRole('button', { name: 'Errors' })).toHaveClass(/active/);
  await expect(restoredLog.getByRole('button', { name: 'Download Visible JSON' })).toBeVisible();
});
