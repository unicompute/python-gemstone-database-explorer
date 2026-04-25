const { test, expect } = require('@playwright/test');
const { submitModal, windowByTitle } = require('./helpers');

async function requestCount(page, name) {
  const response = await page.request.get('/debug/request-counts');
  const data = await response.json();
  return data.counts?.[name] || 0;
}

test('startup opens root/system windows and renders MaglevRecord custom tabs', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.win')).toHaveCount(2);
  await expect(page.locator('#taskbar-version')).toContainText('Explorer 1.0.0');
  await expect(page.locator('#taskbar-version')).toContainText('GemStone 3.7.5');

  const root = page.locator('.win').filter({ hasText: 'aSymbolDictionary()' }).first();
  const system = page.locator('.win').filter({ hasText: 'Abort Transaction' }).first();
  await expect(root).toBeVisible();
  await expect(system).toBeVisible();
  await expect(system).toContainText('Abort Transaction');

  await root.locator('tr').filter({ hasText: ':DemoRecord' }).locator('.ws-nav').click();

  const record = page.locator('.win').filter({ hasText: 'a DemoRecord' }).first();
  await expect(record).toContainText('Attributes');
  await expect(record).toContainText("'Ada'");
  await record.getByRole('button', { name: 'Next' }).click();
  await expect(record).toContainText("'value-21'");
});

test('about window shows runtime metadata, exports a support bundle, and restores across reload', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'About' }).click();
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

  await page.getByRole('button', { name: 'About' }).click();
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

  await page.getByRole('button', { name: 'About' }).click();
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

  await page.getByRole('button', { name: 'About' }).click();
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

  await page.getByRole('button', { name: 'Status Log' }).click();
  const log = windowByTitle(page, 'Status Log');
  await expect(log).toBeVisible();
  await expect(log).toContainText('connected');
  await expect(log).toContainText('1 of 1 entry shown');
  await expect(log.locator('.status-log-source-badge').first()).toBeVisible();

  await page.getByRole('button', { name: 'About' }).click();
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

test('window manager commands tile, minimise, and restore persisted layouts', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Workspace' }).click();
  await page.getByRole('button', { name: 'Web Browser' }).click();
  await expect(page.locator('.win')).toHaveCount(4);

  await page.getByRole('button', { name: 'Tile' }).click();
  const tiledWidth = await windowByTitle(page, 'Workspace').evaluate(el => Math.round(el.getBoundingClientRect().width));
  expect(tiledWidth).toBeGreaterThan(560);

  await page.reload();
  await expect(page.locator('.win')).toHaveCount(4);
  await expect(windowByTitle(page, 'Workspace')).toBeVisible();
  await expect(windowByTitle(page, 'Web Browser')).toBeVisible();
  const restoredWidth = await windowByTitle(page, 'Workspace').evaluate(el => Math.round(el.getBoundingClientRect().width));
  expect(restoredWidth).toBeGreaterThan(560);

  await page.getByRole('button', { name: 'Minimise All' }).click();
  await expect(page.locator('.win[data-minimised="1"]')).toHaveCount(4);

  await page.getByRole('button', { name: 'Reset Startup' }).click();
  await expect(page.locator('.win')).toHaveCount(2);
});

test('symbol list and debugger persist across reload and close group only removes related windows', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Workspace' }).click();
  await page.getByRole('button', { name: 'Symbol List' }).click();

  const workspace = windowByTitle(page, 'Workspace');
  await workspace.locator('.ws-code-area').fill('1/0');
  await workspace.getByRole('button', { name: 'Do it' }).click();

  const debuggerWindow = windowByTitle(page, 'Debugger');
  const symbolList = windowByTitle(page, 'Symbol List Browser');
  await expect(debuggerWindow).toBeVisible();
  await expect(symbolList).toBeVisible();
  await expect(symbolList.locator('select')).toHaveValue('DataCurator');
  await expect(workspace.locator('.ws-code-area')).toHaveValue('1/0');

  await page.reload();

  const restoredWorkspace = windowByTitle(page, 'Workspace');
  const restoredDebugger = windowByTitle(page, 'Debugger');
  const restoredSymbolList = windowByTitle(page, 'Symbol List Browser');
  await expect(restoredWorkspace).toBeVisible();
  await expect(restoredDebugger).toBeVisible();
  await expect(restoredSymbolList).toBeVisible();
  await expect(restoredSymbolList.locator('select')).toHaveValue('DataCurator');
  await expect(restoredWorkspace.locator('.ws-code-area')).toHaveValue('1/0');

  const restoredWorkspaceId = await restoredWorkspace.evaluate(el => el.id);
  await page.evaluate(id => {
    const win = document.getElementById(id);
    if (win) focusWin(win);
  }, restoredWorkspaceId);
  await page.getByRole('button', { name: 'Close Group' }).click();

  await expect(page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Workspace' }),
  })).toHaveCount(0);
  await expect(page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Debugger' }),
  })).toHaveCount(0);
  await expect(windowByTitle(page, 'Symbol List Browser')).toBeVisible();
});

test('class browser helper windows persist across reload and keep load actions', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Class Browser' }).click();
  const browser = windowByTitle(page, 'Class Browser');
  const toolbar = browser.locator('.cb-toolbar');
  await expect(browser).toBeVisible();

  await toolbar.getByRole('button', { name: 'Find Class' }).click();
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await browser.locator('.cb-pane').nth(3).getByText('printString').click();

  await toolbar.getByRole('button', { name: 'Hierarchy' }).click();
  const hierarchyWin = windowByTitle(page, 'Object Hierarchy');
  await hierarchyWin.locator('.qv-item').filter({ hasText: /^ProtoObject$/ }).click();
  await hierarchyWin.locator('.qv-filter').fill('Proto');
  await expect(hierarchyWin.locator('.qv-preview')).toHaveValue(/ProtoObject/);

  await toolbar.getByRole('button', { name: 'Versions' }).click();
  const versionsWin = windowByTitle(page, 'Object >> printString Versions');
  await versionsWin.locator('.qv-filter').fill('version 1');
  await expect(versionsWin.locator('.qv-item')).toContainText('version 1');
  await expect(versionsWin.locator('.qv-preview')).toHaveValue(/version 1/);

  await toolbar.getByRole('button', { name: 'Implementors' }).click();
  const implementorsWin = windowByTitle(page, 'Implementors of selector');
  await implementorsWin.locator('.qv-item').filter({ hasText: 'Behavior>>printString' }).first().click();
  await implementorsWin.locator('.qv-filter').fill('Behavior');
  await expect(implementorsWin.locator('.qv-item.active')).toContainText('Behavior>>printString');

  await page.reload();

  const restoredBrowser = windowByTitle(page, 'Class Browser');
  const restoredHierarchyWin = windowByTitle(page, 'Object Hierarchy');
  const restoredVersionsWin = windowByTitle(page, 'Object >> printString Versions');
  const restoredImplementorsWin = windowByTitle(page, 'Implementors of selector');
  await expect(restoredBrowser).toBeVisible();
  await expect(restoredHierarchyWin).toBeVisible();
  await expect(restoredVersionsWin).toBeVisible();
  await expect(restoredImplementorsWin).toBeVisible();
  await expect(restoredHierarchyWin.locator('.qv-filter')).toHaveValue('Proto');
  await expect(restoredHierarchyWin.locator('.qv-item.active')).toContainText('ProtoObject');
  await expect(restoredVersionsWin.locator('.qv-filter')).toHaveValue('version 1');
  await expect(restoredVersionsWin.locator('.qv-item.active')).toContainText('version 1');
  await expect(restoredImplementorsWin.locator('.qv-filter')).toHaveValue('Behavior');
  await expect(restoredImplementorsWin.locator('.qv-item.active')).toContainText('Behavior>>printString');

  await restoredImplementorsWin.locator('.qv-item.active').click({ force: true });
  await restoredImplementorsWin.getByRole('button', { name: 'Load Into Browser' }).click({ force: true });
  await expect(restoredBrowser.locator('.cb-pane').nth(1).locator('.cb-item.active')).toContainText('Behavior');
  await expect(restoredBrowser.locator('.cb-source-note')).toContainText('Behavior >> printString');
});

test('versions window can reopen into a fresh class browser after the source browser closes', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Class Browser' }).click();
  const browser = windowByTitle(page, 'Class Browser');
  const toolbar = browser.locator('.cb-toolbar');
  await expect(browser).toBeVisible();

  await toolbar.getByRole('button', { name: 'Find Class' }).click();
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await browser.locator('.cb-pane').nth(3).getByText('printString').click();

  await toolbar.getByRole('button', { name: 'Versions' }).click();
  const versionsWin = windowByTitle(page, 'Object >> printString Versions');
  await versionsWin.locator('.qv-item').filter({ hasText: 'version 1' }).first().click();
  await expect(versionsWin.locator('.qv-preview')).toHaveValue(/version 1/);

  await browser.locator('.win-btn-close').click();
  await expect(page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Class Browser' }),
  })).toHaveCount(0);

  await versionsWin.getByRole('button', { name: 'Load Into Browser' }).click();

  const reopenedBrowser = windowByTitle(page, 'Class Browser');
  await expect(reopenedBrowser).toBeVisible();
  await expect(reopenedBrowser.locator('.cb-pane').nth(1).locator('.cb-item.active')).toContainText('Object');
  await expect(reopenedBrowser.locator('.cb-pane').nth(3).locator('.cb-item.active')).toContainText('printString');
  await expect(reopenedBrowser.locator('.cb-source-note')).toContainText('Object >> printString (version 1)');
  await expect(reopenedBrowser.locator('.cb-source')).toHaveValue(/version 1/);
});

test('versions window can compare with current source and inspect the selected version', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Class Browser' }).click();
  const browser = windowByTitle(page, 'Class Browser');
  const toolbar = browser.locator('.cb-toolbar');
  await expect(browser).toBeVisible();

  await toolbar.getByRole('button', { name: 'Find Class' }).click();
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await browser.locator('.cb-pane').nth(3).getByText('printString').click();

  await toolbar.getByRole('button', { name: 'Versions' }).click();
  const versionsWin = windowByTitle(page, 'Object >> printString Versions');
  await versionsWin.locator('.qv-item').filter({ hasText: 'version 1' }).first().click();

  await versionsWin.getByRole('button', { name: 'Compare With Current' }).click();
  await expect(versionsWin.locator('.qv-preview')).toHaveValue(/--- version 1/);
  await expect(versionsWin.locator('.qv-preview')).toHaveValue(/\+\+\+ Object >> printString/);
  await expect(versionsWin.locator('.qv-preview')).toHaveValue(/- \^ 'version 1'/);
  await expect(versionsWin.locator('.qv-preview')).toHaveValue(/\+ \^ 'Object'/);

  const beforeInspectCount = await page.locator('.win').count();
  await versionsWin.getByRole('button', { name: 'Inspect Version' }).click();
  await expect(page.locator('.win')).toHaveCount(beforeInspectCount + 1);
  const inspectedVersion = page.locator('.win').last();
  await expect(inspectedVersion.locator('.insp-titlebar-left [title]').first()).toHaveAttribute(
    'title',
    'aCompiledMethod(Object>>printString version 1)',
  );
});

test('method query open in browser retargets later load actions to the opened browser', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Class Browser' }).click();
  const originalBrowser = windowByTitle(page, 'Class Browser');
  const toolbar = originalBrowser.locator('.cb-toolbar');
  await expect(originalBrowser).toBeVisible();

  await toolbar.getByRole('button', { name: 'Find Class' }).click();
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await originalBrowser.locator('.cb-pane').nth(3).getByText('printString').click();

  await toolbar.getByRole('button', { name: 'Implementors' }).click();
  const implementorsWin = windowByTitle(page, 'Implementors of selector');
  await implementorsWin.locator('.qv-item').filter({ hasText: 'Behavior>>printString' }).first().click();
  await implementorsWin.getByRole('button', { name: 'Open In Browser' }).click();

  const classBrowsers = page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Class Browser' }),
  });
  await expect(classBrowsers).toHaveCount(2);
  await expect(classBrowsers.last().locator('.cb-source-note')).toContainText('Behavior >> printString');

  await originalBrowser.locator('.win-btn-close').click();
  await expect(classBrowsers).toHaveCount(1);

  await implementorsWin.locator('.qv-item').filter({ hasText: 'Object>>printString' }).first().click();
  await implementorsWin.getByRole('button', { name: 'Load Into Browser' }).click();

  await expect(classBrowsers).toHaveCount(1);
  const reusedBrowser = classBrowsers.first();
  await expect(reusedBrowser.locator('.cb-pane').nth(1).locator('.cb-item.active')).toContainText('Object');
  await expect(reusedBrowser.locator('.cb-source-note')).toContainText('Object >> printString');
});

test('versions window open in browser retargets later load actions to the opened browser', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Class Browser' }).click();
  const originalBrowser = windowByTitle(page, 'Class Browser');
  const toolbar = originalBrowser.locator('.cb-toolbar');
  await expect(originalBrowser).toBeVisible();

  await toolbar.getByRole('button', { name: 'Find Class' }).click();
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await originalBrowser.locator('.cb-pane').nth(3).getByText('printString').click();

  await toolbar.getByRole('button', { name: 'Versions' }).click();
  const versionsWin = windowByTitle(page, 'Object >> printString Versions');
  await versionsWin.locator('.qv-item').filter({ hasText: 'version 1' }).first().click();
  await versionsWin.getByRole('button', { name: 'Open In Browser' }).click();

  const classBrowsers = page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Class Browser' }),
  });
  await expect(classBrowsers).toHaveCount(2);
  await expect(classBrowsers.last().locator('.cb-source-note')).toContainText('Object >> printString (version 1)');

  await originalBrowser.locator('.win-btn-close').click();
  await expect(classBrowsers).toHaveCount(1);

  await versionsWin.getByRole('button', { name: 'Load Into Browser' }).click();

  await expect(classBrowsers).toHaveCount(1);
  const reusedBrowser = classBrowsers.first();
  await expect(reusedBrowser.locator('.cb-pane').nth(1).locator('.cb-item.active')).toContainText('Object');
  await expect(reusedBrowser.locator('.cb-pane').nth(3).locator('.cb-item.active')).toContainText('printString');
  await expect(reusedBrowser.locator('.cb-source-note')).toContainText('Object >> printString (version 1)');
});

test('helper windows can inspect selected methods and classes', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Class Browser' }).click();
  const browser = windowByTitle(page, 'Class Browser');
  const toolbar = browser.locator('.cb-toolbar');
  await expect(browser).toBeVisible();

  await toolbar.getByRole('button', { name: 'Find Class' }).click();
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await browser.locator('.cb-pane').nth(3).getByText('printString').click();

  await toolbar.getByRole('button', { name: 'Implementors' }).click();
  const implementorsWin = windowByTitle(page, 'Implementors of selector');
  await implementorsWin.locator('.qv-item').filter({ hasText: 'Object>>printString' }).first().click();
  const beforeMethodInspectCount = await page.locator('.win').count();
  await implementorsWin.getByRole('button', { name: 'Inspect Method' }).click();
  await expect(page.locator('.win')).toHaveCount(beforeMethodInspectCount + 1);
  const methodWindow = page.locator('.win').last();
  await expect(methodWindow.locator('.insp-titlebar-left [title]').first()).toHaveAttribute('title', 'aCompiledMethod(Object>>printString)');

  await toolbar.getByRole('button', { name: 'Hierarchy' }).click();
  const hierarchyWin = windowByTitle(page, 'Object Hierarchy');
  await hierarchyWin.locator('.qv-item').filter({ hasText: /^Object$/ }).click();
  const beforeClassInspectCount = await page.locator('.win').count();
  await hierarchyWin.getByRole('button', { name: 'Inspect Class' }).click();
  await expect(page.locator('.win')).toHaveCount(beforeClassInspectCount + 1);
  const classWindow = page.locator('.win').last();
  await expect(classWindow.locator('.insp-titlebar-left')).toContainText('Object');

  expect(await requestCount(page, 'class-browser.inspect-target')).toBe(2);
});

test('class browsers opened from object inspectors participate in close-group relationships', async ({ page }) => {
  await page.goto('/');

  const root = page.locator('.win').filter({ hasText: 'aSymbolDictionary()' }).first();
  await root.locator('tr').filter({ hasText: ':Object' }).locator('.ws-nav').click();

  const objectWindow = page.locator('.win').filter({
    has: page.locator('.insp-titlebar-left [title="Object"]'),
  }).last();
  await expect(objectWindow).toBeVisible();

  await objectWindow.getByText('Hierarchy').click();
  await objectWindow.locator('.hierarchy-tree').getByRole('button', { name: 'Object', exact: true }).click();

  const classBrowser = windowByTitle(page, 'Class Browser');
  await expect(classBrowser).toBeVisible();
  const beforeCloseCount = await page.locator('.win').count();

  await classBrowser.locator('.win-titlebar').click();
  await page.getByRole('button', { name: 'Close Group' }).click();

  await expect(page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Class Browser' }),
  })).toHaveCount(0);
  await expect(page.locator('.win').filter({
    has: page.locator('.insp-titlebar-left [title="Object"]'),
  })).toHaveCount(0);
  expect(await page.locator('.win').count()).toBeLessThan(beforeCloseCount);
});

test('system startup window keeps report tabs cached and persistent mode synced to backend state', async ({ page }) => {
  await page.goto('/');

  const system = page.locator('.win').filter({ hasText: 'Control Panel' }).first();
  await expect(system).toBeVisible();

  await system.getByText('Stone Version Report').click();
  await expect(system).toContainText('3.7.5');
  expect(await requestCount(page, 'object.stone-ver')).toBe(1);

  await system.getByText('Gem Version Report').click();
  await expect(system).toContainText('3.7.5');
  expect(await requestCount(page, 'object.gem-ver')).toBe(1);

  await system.getByText('Control Panel').click();
  const persistBtn = system.getByRole('button', { name: 'Persistent Mode' });
  await expect(persistBtn).not.toHaveClass(/active/);

  await persistBtn.click();
  await expect(system.locator('.cp-result')).toContainText('Persistent mode enabled');
  await expect(persistBtn).toHaveClass(/active/);

  await system.getByText('Stone Version Report').click();
  await system.getByText('Control Panel').click();
  await expect(persistBtn).toHaveClass(/active/);
  expect(await requestCount(page, 'object.stone-ver')).toBe(2);

  await persistBtn.click();
  await expect(system.locator('.cp-result')).toContainText('Persistent mode disabled');
  await expect(persistBtn).not.toHaveClass(/active/);
});

test('object inspector caches tab fetches between repeated visits', async ({ page }) => {
  await page.goto('/');

  const windows = page.locator('.win');
  await expect(windows).toHaveCount(2);
  const root = page.locator('.win').filter({ hasText: 'aSymbolDictionary()' }).first();
  const beforeCount = await windows.count();
  await root.locator('tr').filter({ hasText: ':Object' }).locator('.ws-nav').click();
  const afterCount = await windows.count();
  const browser = afterCount > beforeCount ? windows.last() : windows.first();
  await expect(browser).toContainText('Object');

  await browser.getByText('Constants').click();
  await expect(browser).toContainText('DependentsFields');
  expect(await requestCount(page, 'object.constants')).toBe(1);

  await browser.getByText('Hierarchy').click();
  await expect(browser.locator('.hierarchy-tree')).toContainText('ProtoObject');
  await expect(browser.locator('.hierarchy-tree')).toContainText('Globals');
  expect(await requestCount(page, 'object.hierarchy')).toBe(1);
  await browser.locator('.hierarchy-tree').getByRole('button', { name: 'Object', exact: true }).click();
  const classBrowsers = page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Class Browser' }),
  });
  await expect(classBrowsers).toHaveCount(1);
  expect(await requestCount(page, 'class-browser.class-location')).toBe(0);
  await classBrowsers.first().locator('.win-btn-close').click();
  await expect(classBrowsers).toHaveCount(0);

  await browser.getByText('Constants').click();
  await expect(browser).toContainText('DependentsFields');
  expect(await requestCount(page, 'object.constants')).toBe(1);
});

test('object inspector code tab caches method loads and opens the full class browser', async ({ page }) => {
  await page.goto('/');

  const windows = page.locator('.win');
  await expect(windows).toHaveCount(2);
  const root = page.locator('.win').filter({ hasText: 'aSymbolDictionary()' }).first();
  const beforeCount = await windows.count();
  await root.locator('tr').filter({ hasText: ':Object' }).locator('.ws-nav').click();
  const afterCount = await windows.count();
  const browser = afterCount > beforeCount ? windows.last() : windows.first();

  await expect(browser.locator('.mb-header')).toContainText('Object methods');
  expect(await requestCount(page, 'code.selectors')).toBe(1);

  await browser.locator('.mb-sel').filter({ hasText: 'printString' }).click();
  await expect(browser.locator('.mb-src textarea')).toHaveValue(/printString/);
  expect(await requestCount(page, 'code.source')).toBe(1);

  await browser.locator('.mb-sel').filter({ hasText: 'yourself' }).click();
  await expect(browser.locator('.mb-src textarea')).toHaveValue(/yourself/);
  expect(await requestCount(page, 'code.source')).toBe(2);

  await browser.locator('.mb-sel').filter({ hasText: 'printString' }).click();
  await expect(browser.locator('.mb-src textarea')).toHaveValue(/printString/);
  expect(await requestCount(page, 'code.source')).toBe(2);

  await browser.getByText('Constants').click();
  await browser.getByText('Code').click();
  expect(await requestCount(page, 'code.selectors')).toBe(1);

  const classLocationCount = await requestCount(page, 'class-browser.class-location');
  await browser.getByRole('button', { name: 'Open in Class Browser' }).click();
  const classBrowser = windowByTitle(page, 'Class Browser');
  await expect(classBrowser).toBeVisible();
  await expect(classBrowser.locator('.cb-source-note')).toContainText('Object >> printString');
  expect(await requestCount(page, 'class-browser.class-location')).toBe(classLocationCount);
});

test('workspace drag opens a linked window with a visible arrow', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Workspace' }).click();
  const workspace = windowByTitle(page, 'Workspace');
  await expect(workspace).toBeVisible();

  await workspace.locator('.ws-code-area').fill('Object');
  await workspace.getByRole('button', { name: 'Do it' }).click();

  const resultChip = workspace.locator('.ws-entry').last().locator('.obj-chip').filter({ hasText: 'Object' });
  await expect(resultChip).toBeVisible();

  await resultChip.dragTo(page.locator('#desktop'), {
    targetPosition: { x: 980, y: 300 },
  });

  await expect(page.locator('.win')).toHaveCount(4);
  await expect.poll(async () => page.locator('#arrow-canvas path').count()).toBeGreaterThan(0);
});

test('workspace eval exceptions auto-open the debugger', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Workspace' }).click();
  const workspace = windowByTitle(page, 'Workspace');
  await expect(workspace).toBeVisible();

  await workspace.locator('.ws-code-area').fill('1/0');
  await workspace.getByRole('button', { name: 'Do it' }).click();

  const debuggerWin = windowByTitle(page, 'Debugger');
  await expect(debuggerWin).toBeVisible();
  await expect(debuggerWin.locator('.dbg-summary-source')).toContainText('1/0');
  await expect(debuggerWin.locator('.dbg-summary-error')).toContainText('ZeroDivide occurred');
  await expect(debuggerWin.locator('.dbg-frame-item')).toHaveCount(3);
  await expect(debuggerWin.locator('.dbg-source-code')).toContainText('1/0');
  await expect(debuggerWin.locator('.dbg-source-meta')).toContainText('Step 1');
  await expect(workspace.locator('.ws-entry').last()).toContainText('ZeroDivide occurred');
});

test('object inspector constants expose inspectable object chips', async ({ page }) => {
  await page.goto('/');

  const windows = page.locator('.win');
  await expect(windows).toHaveCount(2);
  const root = page.locator('.win').filter({ hasText: 'aSymbolDictionary()' }).first();
  const beforeCount = await windows.count();
  await root.locator('tr').filter({ hasText: ':Object' }).locator('.ws-nav').click();
  const afterCount = await windows.count();
  const browser = afterCount > beforeCount ? windows.last() : windows.first();

  await browser.getByText('Constants').click();
  const behaviorChip = browser.locator('.obj-chip').filter({ hasText: 'Behavior' }).first();
  await expect(behaviorChip).toBeVisible();
  const behaviorRow = browser.locator('tr').filter({ hasText: 'Behavior' }).first();

  await behaviorRow.locator('.ws-nav').click();
  await expect(browser.locator('.insp-titlebar')).toContainText('Behavior');
  await expect(browser.locator('.mb-header')).toContainText('Behavior methods');
});

test('object inspector constants uses server-backed paging and caches visited pages', async ({ page }) => {
  await page.goto('/');

  const windows = page.locator('.win');
  await expect(windows).toHaveCount(2);
  const root = page.locator('.win').filter({ hasText: 'aSymbolDictionary()' }).first();
  const beforeCount = await windows.count();
  await root.locator('tr').filter({ hasText: ':Object' }).locator('.ws-nav').click();
  const afterCount = await windows.count();
  const browser = afterCount > beforeCount ? windows.last() : windows.first();

  await browser.getByText('Constants').click();
  await expect(browser).toContainText('1-20 of 25 constants');
  await expect(browser).toContainText('DependentsFields');
  expect(await requestCount(page, 'object.constants')).toBe(1);

  await browser.getByRole('button', { name: 'Next' }).click();
  await expect(browser).toContainText('21-25 of 25 constants');
  await expect(browser).toContainText('Feature19');
  expect(await requestCount(page, 'object.constants')).toBe(2);

  await browser.getByRole('button', { name: 'Previous' }).click();
  await expect(browser).toContainText('1-20 of 25 constants');
  await expect(browser).toContainText('DependentsFields');
  expect(await requestCount(page, 'object.constants')).toBe(2);
});

test('object inspector instances uses server-backed paging and caches visited pages', async ({ page }) => {
  await page.goto('/');

  const windows = page.locator('.win');
  await expect(windows).toHaveCount(2);
  const root = page.locator('.win').filter({ hasText: 'aSymbolDictionary()' }).first();
  const beforeCount = await windows.count();
  await root.locator('tr').filter({ hasText: ':Object' }).locator('.ws-nav').click();
  const afterCount = await windows.count();
  const browser = afterCount > beforeCount ? windows.last() : windows.first();

  await browser.getByText('Instances').click();
  await expect(browser).toContainText('1-20 of 45 instances');
  await expect(browser).toContainText('Object instance #1');
  expect(await requestCount(page, 'object.instances')).toBe(1);

  await browser.getByRole('button', { name: 'Next' }).click();
  await expect(browser).toContainText('21-40 of 45 instances');
  await expect(browser).toContainText('Object instance #21');
  expect(await requestCount(page, 'object.instances')).toBe(2);

  await browser.getByRole('button', { name: 'Previous' }).click();
  await expect(browser).toContainText('1-20 of 45 instances');
  await expect(browser).toContainText('Object instance #1');
  expect(await requestCount(page, 'object.instances')).toBe(2);
});

test('object inspector included modules uses server-backed paging with owner context', async ({ page }) => {
  await page.goto('/');

  const windows = page.locator('.win');
  await expect(windows).toHaveCount(2);
  const root = page.locator('.win').filter({ hasText: 'aSymbolDictionary()' }).first();
  const beforeCount = await windows.count();
  await root.locator('tr').filter({ hasText: ':Object' }).locator('.ws-nav').click();
  const afterCount = await windows.count();
  const browser = afterCount > beforeCount ? windows.last() : windows.first();

  await browser.getByText('Included Modules').click();
  await expect(browser).toContainText('1-20 of 25 included modules');
  await expect(browser).toContainText('Module1');
  expect(await requestCount(page, 'object.modules')).toBe(1);

  await browser.getByRole('button', { name: 'Next' }).click();
  await expect(browser).toContainText('21-25 of 25 included modules');
  await expect(browser).toContainText('Module21');
  await expect(browser).toContainText('Behavior');
  expect(await requestCount(page, 'object.modules')).toBe(2);

  await browser.getByRole('button', { name: 'Previous' }).click();
  await expect(browser).toContainText('1-20 of 25 included modules');
  await expect(browser).toContainText('Module1');
  expect(await requestCount(page, 'object.modules')).toBe(2);
});

test('halted thread bar opens debugger with stack and TLS actions', async ({ page }) => {
  await page.goto('/');

  const haltedBar = page.locator('#halted-threads-bar');
  await expect(haltedBar).toContainText('Halted:');
  const pill = haltedBar.locator('.thread-pill').first();
  await expect(pill).toContainText('1/0');
  await pill.click();

  const debuggerWin = windowByTitle(page, 'Debugger');
  await expect(debuggerWin).toBeVisible();
  await expect(debuggerWin.locator('.dbg-summary-source')).toContainText('1/0');
  await expect(debuggerWin.locator('.dbg-summary-error')).toContainText('ZeroDivide occurred');
  await expect(debuggerWin.locator('.dbg-frame-item')).toHaveCount(3);
  const sourceArea = debuggerWin.locator('.dbg-source-code');
  const sourceMeta = debuggerWin.locator('.dbg-source-meta');
  await expect(sourceArea).toContainText('1/0');
  await expect(sourceMeta).toContainText('Step 1');

  await expect
    .poll(() => page.evaluate(() => document.activeElement?.classList.contains('dbg-frame-item')))
    .toBe(true);
  await page.keyboard.press('ArrowDown');
  await expect(sourceArea).toContainText('helper');
  await expect(sourceMeta).toContainText('Line 2');
  await page.keyboard.press('ArrowUp');
  await expect(sourceArea).toContainText('1/0');

  await debuggerWin.locator('.dbg-frame-item').nth(1).click();
  await expect(sourceArea).toContainText('helper');
  await expect(debuggerWin.locator('.dbg-self-val')).toContainText('Behavior');
  const selfChip = debuggerWin.locator('.dbg-self-val .obj-chip');
  await expect(selfChip).toContainText('Behavior');
  const debuggerWindowCount = await page.locator('.win').count();
  await selfChip.locator('.obj-chip-caret').click();
  await selfChip.getByRole('button', { name: 'Inspect →' }).click();
  await expect(page.locator('.win')).toHaveCount(debuggerWindowCount + 1);
  await expect(page.locator('.win').last()).toContainText('Behavior');
  await expect.poll(async () => page.locator('#arrow-canvas path').count()).toBeGreaterThan(0);
  await debuggerWin.locator('select').selectOption('result');
  await expect(debuggerWin.locator('.dbg-var-val')).toContainText('#done');

  await debuggerWin.getByText('Thread Local Storage').click();
  await expect(debuggerWin.locator('.dbg-tls-list')).toContainText('#session');
  await expect(debuggerWin.locator('.dbg-tls-list')).toContainText("'debug-session'");

  await debuggerWin.getByText('Stack Trace').click();
  await debuggerWin.getByRole('button', { name: 'Step into' }).click();
  await expect(debuggerWin.locator('.dbg-frame-item')).toHaveCount(4);
  await expect(debuggerWin.locator('.dbg-frame-item').first()).toContainText('stepInto1');
  await expect(sourceArea).toContainText('stepInto1');

  await debuggerWin.getByRole('button', { name: 'Step over' }).click();
  await expect(sourceArea).toContainText('stepped over');

  await debuggerWin.locator('.dbg-frame-item').nth(1).click();
  await debuggerWin.getByRole('button', { name: 'Trim stack' }).click();
  await expect(debuggerWin.locator('.dbg-frame-item')).toHaveCount(2);

  await debuggerWin.getByRole('button', { name: 'Proceed' }).click();
  await expect(debuggerWin).toHaveCount(0);
  await expect(haltedBar.locator('.thread-pill')).toHaveCount(0);
});

test('symbol list uses modal add/remove flows for dictionaries and entries', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Symbol List' }).click();
  const browser = windowByTitle(page, 'Symbol List Browser');
  await expect(browser).toBeVisible();
  await expect(browser.locator('select option')).toHaveCount(2);
  await expect(browser.locator('select')).toHaveValue('DataCurator');

  const dictList = browser.locator('.sl-list').first();
  const entryList = browser.locator('.sl-list').nth(1);

  await browser.locator('.sl-col').first().getByRole('button', { name: '+' }).click();
  await submitModal(page, 'TmpUI');
  const tmpDict = dictList.locator('li').filter({ hasText: 'TmpUI' });
  await expect(tmpDict).toHaveCount(1);
  await tmpDict.click();

  await browser.locator('.sl-col').nth(1).getByRole('button', { name: '+' }).click();
  await submitModal(page, ['TempOop', 'Object']);
  const tmpEntry = entryList.locator('li').filter({ hasText: 'TempOop' });
  await expect(tmpEntry).toHaveCount(1);
  await tmpEntry.click();
  await expect(browser.locator('.sl-printstring')).toContainText('Object');
  await expect(browser.getByRole('button', { name: 'Inspect ›' })).toBeVisible();

  await tmpEntry.hover();
  await tmpEntry.locator('.sl-del').click();
  await submitModal(page);
  await expect(entryList.locator('li').filter({ hasText: 'TempOop' })).toHaveCount(0);

  await tmpDict.hover();
  await tmpDict.locator('.sl-del').click();
  await submitModal(page);
  await expect(dictList.locator('li').filter({ hasText: 'TmpUI' })).toHaveCount(0);
});

test('class browser caches repeated loads and refresh invalidates them', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Class Browser' }).click();
  const browser = windowByTitle(page, 'Class Browser');
  await expect(browser).toBeVisible();
  await expect(browser.locator('.cb-pane').nth(0)).toContainText('Globals');

  expect(await requestCount(page, 'class-browser.dictionaries')).toBe(1);
  expect(await requestCount(page, 'class-browser.classes')).toBe(1);

  await browser.getByRole('button', { name: 'Find Class' }).click();
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await expect(browser.locator('.cb-pane').nth(1)).toContainText('Object');
  const classesPane = browser.locator('.cb-pane').nth(1).locator('.cb-list');
  expect(await classesPane.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect.poll(async () => browser.locator('.cb-pane').nth(1).locator('.cb-item.active').evaluate(el => {
    const container = el.parentElement;
    if (!container) return false;
    const rowRect = el.getBoundingClientRect();
    const paneRect = container.getBoundingClientRect();
    return rowRect.top >= paneRect.top - 2 && rowRect.bottom <= paneRect.bottom + 2;
  })).toBe(true);
  expect(await requestCount(page, 'class-browser.dictionaries')).toBe(1);
  expect(await requestCount(page, 'class-browser.classes')).toBe(1);

  await browser.locator('.cb-pane').nth(3).getByText('printString').click();
  await browser.getByRole('button', { name: 'Versions' }).click();
  await expect(page.locator('.win').filter({ hasText: "version 1" }).last()).toBeVisible();
  expect(await requestCount(page, 'class-browser.versions')).toBe(1);

  await browser.getByRole('button', { name: 'Versions' }).click();
  expect(await requestCount(page, 'class-browser.versions')).toBe(1);

  await browser.getByRole('button', { name: 'Refresh' }).click();
  await expect.poll(async () => requestCount(page, 'class-browser.dictionaries')).toBe(2);
});

test('class browser supports inline filters and remembered pane widths', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Class Browser' }).click();
  const browser = windowByTitle(page, 'Class Browser');
  const classesPane = browser.locator('.cb-pane').nth(1);
  const classFilter = classesPane.locator('.cb-filter');
  await expect(browser).toBeVisible();
  await expect(classesPane).toContainText('AlphaClass01');

  await classFilter.fill('Proto');
  await expect(classesPane.locator('.cb-item')).toHaveCount(1);
  await expect(classesPane.locator('.cb-item').first()).toContainText('ProtoObject');
  expect(await requestCount(page, 'class-browser.classes')).toBe(1);

  await classFilter.fill('');
  const splitter = browser.locator('.cb-splitter').nth(1);
  const beforeBox = await classesPane.boundingBox();
  const splitterBox = await splitter.boundingBox();
  if (!beforeBox || !splitterBox) throw new Error('Class Browser splitter not visible');
  await page.mouse.move(splitterBox.x + splitterBox.width / 2, splitterBox.y + splitterBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(splitterBox.x + splitterBox.width / 2 + 60, splitterBox.y + splitterBox.height / 2, { steps: 6 });
  await page.mouse.up();
  const afterBox = await classesPane.boundingBox();
  if (!afterBox) throw new Error('Class Browser pane not visible after resize');
  expect(afterBox.width).toBeGreaterThan(beforeBox.width + 20);

  const storedWidths = await page.evaluate(() => JSON.parse(localStorage.getItem('python-gemstone-class-browser-pane-widths-v1') || '[]'));
  expect(storedWidths).toHaveLength(4);
  expect(storedWidths[1]).toBeGreaterThan(240);

  await browser.locator('.win-btn-close').click();
  await page.getByRole('button', { name: 'Class Browser' }).click();
  const reopened = windowByTitle(page, 'Class Browser');
  const reopenedClassesPane = reopened.locator('.cb-pane').nth(1);
  await expect(reopened).toBeVisible();
  await expect.poll(async () => (await reopenedClassesPane.boundingBox())?.width || 0).toBeGreaterThan(afterBox.width - 10);
});

test('class browser supports keyboard navigation and compile shortcut', async ({ page }) => {
  await page.goto('/');

  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.getByRole('button', { name: 'Class Browser' }).click();
  const browser = windowByTitle(page, 'Class Browser');
  const panes = browser.locator('.cb-pane');
  const classesList = panes.nth(1).locator('.cb-list');
  const methodsPane = panes.nth(3);

  await expect(browser).toBeVisible();
  await browser.getByRole('button', { name: 'Find Class' }).click();
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');

  await classesList.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => document.activeElement?.id || '')).toMatch(/-protocols$/);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => document.activeElement?.id || '')).toMatch(/-methods$/);
  await methodsPane.getByText('printString').click();
  await expect(browser.locator('.cb-source-note')).toContainText('Object >> printString');

  const source = browser.locator('.cb-source');
  await source.click();
  await source.fill("displayString\n^ 'Object'");
  await page.keyboard.press(`${modifier}+S`);
  await expect(browser.locator('.cb-status')).toContainText('printString → displayString');
  await expect(methodsPane).toContainText('displayString');
  await expect(methodsPane).not.toContainText('printString');
  await expect(browser.locator('.cb-source-note')).toContainText('Object >> displayString');
});

test('class browser supports add class and new method flow', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Class Browser' }).click();
  const browser = windowByTitle(page, 'Class Browser');
  const toolbar = browser.locator('.cb-toolbar');
  await expect(browser).toBeVisible();

  await browser.getByRole('button', { name: 'Find Class' }).click();
  await submitModal(page, 'Behavior');
  await expect(browser.locator('.cb-pane').nth(1).locator('.cb-item.active')).toContainText('Behavior');

  await toolbar.getByRole('button', { name: 'Add Class' }).click();
  await submitModal(page, 'WidgetThing');
  await expect(browser.locator('.cb-pane').nth(1).locator('.cb-item.active')).toContainText('WidgetThing');
  await expect(browser.locator('.cb-source')).toHaveValue(/Behavior subclass: #WidgetThing/);
  await expect(toolbar.getByRole('button', { name: 'Compile' })).toBeDisabled();
  expect(await requestCount(page, 'class-browser.add-class')).toBe(1);

  await toolbar.getByRole('button', { name: 'New Method' }).click();
  await expect(toolbar.getByRole('button', { name: 'Compile' })).toBeEnabled();
  await expect(browser.locator('.cb-source-note')).toContainText('WidgetThing >> (new method)');
  await browser.locator('.cb-source').fill("greet\n^ 'hi'");
  await toolbar.getByRole('button', { name: 'Compile' }).click();
  await expect(browser.locator('.cb-pane').nth(3)).toContainText('greet');
  await expect(browser.locator('.cb-source-note')).toContainText('WidgetThing >> greet');
  await expect(browser.locator('.cb-source')).toHaveValue(/^greet\b/);

  await toolbar.getByRole('button', { name: 'Browse Class' }).click();
  await expect(browser.locator('.cb-source')).toHaveValue(/Behavior subclass: #WidgetThing/);
  await expect(toolbar.getByRole('button', { name: 'Compile' })).toBeDisabled();
});

test('class browser supports class rename-move-remove and category-method actions', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Class Browser' }).click();
  const browser = windowByTitle(page, 'Class Browser');
  const panes = browser.locator('.cb-pane');
  const toolbar = browser.locator('.cb-toolbar');
  await expect(browser).toBeVisible();

  await toolbar.getByRole('button', { name: 'Find Class' }).click();
  await submitModal(page, 'DemoRecord');
  await expect(panes.nth(1).locator('.cb-item.active')).toContainText('DemoRecord');

  await toolbar.getByRole('button', { name: 'Rename Class', exact: true }).click();
  await submitModal(page, 'DemoThing');
  await expect(panes.nth(1).locator('.cb-item.active')).toContainText('DemoThing');
  await expect(browser.locator('.cb-source')).toHaveValue(/Object subclass: #DemoThing/);
  await expect(browser.locator('.cb-status')).toContainText('Renamed DemoRecord to DemoThing');
  expect(await requestCount(page, 'class-browser.rename-class')).toBe(1);

  await toolbar.getByRole('button', { name: 'Move Class', exact: true }).click();
  await submitModal(page, 'UserGlobals');
  await expect(panes.nth(0).locator('.cb-item.active')).toContainText('UserGlobals');
  await expect(panes.nth(1).locator('.cb-item.active')).toContainText('DemoThing');
  await expect(browser.locator('.cb-status')).toContainText('Moved DemoThing to UserGlobals');
  expect(await requestCount(page, 'class-browser.move-class')).toBe(1);

  await toolbar.getByRole('button', { name: 'Remove Class', exact: true }).click();
  await submitModal(page);
  await expect(panes.nth(1)).not.toContainText('DemoThing');
  await expect(browser.locator('.cb-status')).toContainText('Removed DemoThing');
  expect(await requestCount(page, 'class-browser.remove-class')).toBe(1);

  await toolbar.getByRole('button', { name: 'Find Class' }).click();
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await expect(panes.nth(1).locator('.cb-item.active')).toContainText('Object');

  await panes.nth(2).getByText('accessing').click();
  await toolbar.getByRole('button', { name: 'Remove Category', exact: true }).click();
  await submitModal(page);
  await expect(panes.nth(2).locator('.cb-item.active')).toContainText('as yet unclassified');
  await expect(panes.nth(3)).toContainText('yourself');
  await expect(browser.locator('.cb-status')).toContainText('Moved 1 method to as yet unclassified');
  expect(await requestCount(page, 'class-browser.remove-category')).toBe(1);

  await panes.nth(3).getByText('yourself').click();
  await toolbar.getByRole('button', { name: 'Move Method', exact: true }).click();
  await submitModal(page, 'utility');
  await expect(panes.nth(2).locator('.cb-item.active')).toContainText('utility');
  await expect(panes.nth(3)).toContainText('yourself');
  await expect(browser.locator('.cb-status')).toContainText('Moved yourself to utility');
  expect(await requestCount(page, 'class-browser.move-method')).toBe(1);

  await toolbar.getByRole('button', { name: 'Remove Method', exact: true }).click();
  await submitModal(page);
  await expect(panes.nth(3)).not.toContainText('yourself');
  await expect(browser.locator('.cb-status')).toContainText('Removed yourself');
  expect(await requestCount(page, 'class-browser.remove-method')).toBe(1);
});

test('class browser supports dictionary add-rename-remove actions', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Class Browser' }).click();
  const browser = windowByTitle(page, 'Class Browser');
  const panes = browser.locator('.cb-pane');
  const toolbar = browser.locator('.cb-toolbar');
  await expect(browser).toBeVisible();

  await toolbar.getByRole('button', { name: 'Add Dictionary', exact: true }).click();
  await submitModal(page, 'TmpUI');
  await expect(panes.nth(0).locator('.cb-item.active')).toContainText('TmpUI');
  await expect(browser.locator('.cb-status')).toContainText('Added TmpUI');
  expect(await requestCount(page, 'class-browser.add-dictionary')).toBe(1);

  await toolbar.getByRole('button', { name: 'Rename Dictionary', exact: true }).click();
  await submitModal(page, 'TmpUI2');
  await expect(panes.nth(0).locator('.cb-item.active')).toContainText('TmpUI2');
  await expect(browser.locator('.cb-status')).toContainText('Renamed TmpUI to TmpUI2');
  expect(await requestCount(page, 'class-browser.rename-dictionary')).toBe(1);

  await toolbar.getByRole('button', { name: 'Remove Dictionary', exact: true }).click();
  await submitModal(page);
  await expect(panes.nth(0)).not.toContainText('TmpUI2');
  await expect(browser.locator('.cb-status')).toContainText('Removed TmpUI2');
  expect(await requestCount(page, 'class-browser.remove-dictionary')).toBe(1);
});

test('class browser supports dictionary search and inspect actions', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Class Browser' }).click();
  const browser = windowByTitle(page, 'Class Browser');
  const panes = browser.locator('.cb-pane');
  const toolbar = browser.locator('.cb-toolbar');
  await expect(browser).toBeVisible();

  await toolbar.getByRole('button', { name: 'Find Dictionary', exact: true }).click();
  await submitModal(page, 'Kernel');
  await expect(panes.nth(0).locator('.cb-item.active')).toContainText('Kernel');
  await expect(panes.nth(1)).toContainText('SymbolDictionary');

  const initialWindowCount = await page.locator('.win').count();
  await toolbar.getByRole('button', { name: 'Inspect Dictionary', exact: true }).click();
  await expect(page.locator('.win')).toHaveCount(initialWindowCount + 1);
  const dictionaryWindow = page.locator('.win').last();
  await expect(dictionaryWindow.locator('.insp-titlebar-left')).toContainText('aSymbolDictionary()');
  expect(await requestCount(page, 'class-browser.inspect-target')).toBe(1);

  await toolbar.getByRole('button', { name: 'Find Class' }).click();
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await expect(panes.nth(1).locator('.cb-item.active')).toContainText('Object');
  await panes.nth(3).getByText('printString').click();

  const afterDictionaryInspectCount = await page.locator('.win').count();
  await toolbar.getByRole('button', { name: 'Inspect Class', exact: true }).click();
  await expect(page.locator('.win')).toHaveCount(afterDictionaryInspectCount + 1);
  const classWindow = page.locator('.win').last();
  await expect(classWindow.locator('.insp-titlebar-left')).toContainText('Object');

  const afterClassInspectCount = await page.locator('.win').count();
  await browser.locator('.win-titlebar').click();
  await toolbar.getByRole('button', { name: 'Inspect Method', exact: true }).click({ force: true });
  await expect(page.locator('.win')).toHaveCount(afterClassInspectCount + 1);
  const methodWindow = page.locator('.win').last();
  await expect(methodWindow.locator('.insp-titlebar-left [title]').first()).toHaveAttribute('title', 'aCompiledMethod(Object>>printString)');

  const afterMethodInspectCount = await page.locator('.win').count();
  await browser.locator('.win-titlebar').click();
  await toolbar.getByRole('button', { name: 'Inspect All Instances', exact: true }).click();
  await expect(page.locator('.win')).toHaveCount(afterMethodInspectCount + 1);
  const instancesWindow = page.locator('.win').last();
  await expect(instancesWindow.locator('.insp-titlebar-left')).toContainText('anArray(2)');
  await expect(instancesWindow).toContainText('a DemoRecord');
  expect(await requestCount(page, 'class-browser.inspect-target')).toBe(4);
});

test('class browser supports category add-rename and class structure edits', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Class Browser' }).click();
  const browser = windowByTitle(page, 'Class Browser');
  const panes = browser.locator('.cb-pane');
  const toolbar = browser.locator('.cb-toolbar');
  await expect(browser).toBeVisible();

  await toolbar.getByRole('button', { name: 'Find Class' }).click();
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await expect(panes.nth(1).locator('.cb-item.active')).toContainText('Object');

  await toolbar.getByRole('button', { name: 'Add Category', exact: true }).click();
  await submitModal(page, 'utility');
  await expect(panes.nth(2).locator('.cb-item.active')).toContainText('utility');
  await expect(browser.locator('.cb-status')).toContainText('Added category utility');
  expect(await requestCount(page, 'class-browser.add-category')).toBe(1);

  await toolbar.getByRole('button', { name: 'Rename Category', exact: true }).click();
  await submitModal(page, 'utility-renamed');
  await expect(panes.nth(2).locator('.cb-item.active')).toContainText('utility-renamed');
  await expect(browser.locator('.cb-status')).toContainText('Renamed utility to utility-renamed');
  expect(await requestCount(page, 'class-browser.rename-category')).toBe(1);

  await toolbar.getByRole('button', { name: 'Browse Class' }).click();
  await toolbar.getByRole('button', { name: 'Inst Var', exact: true }).click();
  await submitModal(page, 'slotOne');
  await expect(browser.locator('.cb-source')).toHaveValue(/instanceVariableNames: 'slotOne'/);
  await expect(browser.locator('.cb-status')).toContainText('Added instance variable slotOne');
  expect(await requestCount(page, 'class-browser.add-instance-variable')).toBe(1);

  await toolbar.getByRole('button', { name: 'Class Var', exact: true }).click();
  await submitModal(page, 'SharedState');
  await expect(browser.locator('.cb-source')).toHaveValue(/classVariableNames: 'SharedState'/);
  await expect(browser.locator('.cb-status')).toContainText('Added class variable SharedState');
  expect(await requestCount(page, 'class-browser.add-class-variable')).toBe(1);

  await toolbar.getByRole('button', { name: 'Class Inst Var', exact: true }).click();
  await submitModal(page, 'cachedState');
  await expect(browser.locator('.cb-source')).toHaveValue(/classInstanceVariableNames: 'cachedState'/);
  await expect(browser.locator('.cb-status')).toContainText('Added class instance variable cachedState');
  expect(await requestCount(page, 'class-browser.add-class-instance-variable')).toBe(1);

  await toolbar.getByRole('button', { name: 'Rename Var', exact: true }).click();
  await submitModal(page, ['instance:slotOne', 'slotRenamed']);
  await expect(browser.locator('.cb-source')).toHaveValue(/instanceVariableNames: 'slotRenamed'/);
  await expect(browser.locator('.cb-status')).toContainText('Renamed instance variable slotOne to slotRenamed');
  expect(await requestCount(page, 'class-browser.rename-instance-variable')).toBe(1);

  await toolbar.getByRole('button', { name: 'Rename Var', exact: true }).click();
  await submitModal(page, ['classInstance:cachedState', 'renamedCache']);
  await expect(browser.locator('.cb-source')).toHaveValue(/classInstanceVariableNames: 'renamedCache'/);
  await expect(browser.locator('.cb-status')).toContainText('Renamed class instance variable cachedState to renamedCache');
  expect(await requestCount(page, 'class-browser.rename-class-instance-variable')).toBe(1);

  await toolbar.getByRole('button', { name: 'Remove Var', exact: true }).click();
  await submitModal(page, 'class:SharedState');
  await submitModal(page);
  await expect(browser.locator('.cb-source')).toHaveValue(/classVariableNames: ''/);
  await expect(browser.locator('.cb-status')).toContainText('Removed class variable SharedState');
  expect(await requestCount(page, 'class-browser.remove-class-variable')).toBe(1);
});

test('class browser supports hierarchy queries, text search, file-out, accessors, and commit', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Class Browser' }).click();
  const initialBrowser = page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Class Browser' }),
  }).first();
  const browserId = await initialBrowser.getAttribute('id');
  if (!browserId) throw new Error('Class Browser window id missing');
  const browser = page.locator(`#${browserId}`);
  await expect(browser).toBeVisible();
  await expect(browser.locator('.cb-pane').nth(0)).toContainText('Globals');

  await browser.getByRole('button', { name: 'Find Class' }).click();
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await browser.locator('.cb-pane').nth(3).getByText('printString').click();
  const classLocationCount = await requestCount(page, 'class-browser.class-location');

  const toolbar = browser.locator('.cb-toolbar');
  const classBrowserCount = await page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Class Browser' }),
  }).count();
  await toolbar.getByRole('button', { name: 'Hierarchy' }).click();
  const hierarchyWin = windowByTitle(page, 'Object Hierarchy');
  await expect(hierarchyWin).toBeVisible();
  await expect(hierarchyWin.locator('.qv-item.active')).toContainText('Object');
  await expect(hierarchyWin.locator('.qv-preview')).toHaveValue(/Object subclass: #Object/);
  await hierarchyWin.locator('.qv-item').filter({ hasText: /^ProtoObject$/ }).click();
  await hierarchyWin.getByRole('button', { name: 'Load Into Browser' }).click();
  await expect(page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Class Browser' }),
  })).toHaveCount(classBrowserCount);
  await expect(browser.locator('.cb-pane').nth(1).locator('.cb-item.active')).toContainText('ProtoObject');
  await expect(browser.locator('.cb-source-note')).toContainText('ProtoObject');
  expect(await requestCount(page, 'class-browser.class-location')).toBe(classLocationCount);
  await page.locator('.taskbar-btn').filter({ hasText: /^Hierarchy$/ }).click();
  await hierarchyWin.getByRole('button', { name: 'Open In Browser' }).click({ force: true });
  const classBrowsers = page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Class Browser' }),
  });
  await expect(classBrowsers).toHaveCount(classBrowserCount + 1);
  expect(await requestCount(page, 'class-browser.class-location')).toBe(classLocationCount);
  await classBrowsers.last().locator('.win-btn-close').click();
  await expect(classBrowsers).toHaveCount(classBrowserCount);
  await hierarchyWin.locator('.win-btn-close').click();
  await browser.locator('.cb-pane').nth(1).locator('.cb-item').filter({ hasText: /^Object$/ }).click();
  await browser.locator('.cb-pane').nth(3).getByText('printString').click();

  await toolbar.getByRole('button', { name: 'Versions' }).click();
  const versionsWin = windowByTitle(page, 'Object >> printString Versions');
  await expect(versionsWin).toBeVisible();
  await expect(versionsWin.locator('.qv-preview')).toHaveValue(/version 1/);
  await versionsWin.locator('.qv-filter').fill('version 1');
  await expect(versionsWin.locator('.qv-item')).toContainText('version 1');
  await expect(versionsWin.locator('.qv-preview')).toHaveValue(/version 1/);
  await versionsWin.locator('.qv-list').focus();
  await page.keyboard.press('Enter');
  await expect(browser.locator('.cb-source')).toHaveValue(/version 1/);
  await expect(browser.locator('.cb-source-note')).toContainText('version 1');
  await versionsWin.locator('.win-btn-close').click({ force: true });
  await browser.locator('.cb-pane').nth(0).locator('.cb-item').filter({ hasText: /^Globals$/ }).click();
  await browser.locator('.cb-pane').nth(1).locator('.cb-item').filter({ hasText: /^Object$/ }).click();
  await browser.locator('.cb-pane').nth(3).getByText('printString').click();

  await toolbar.locator('select').nth(0).selectOption('sub');
  await toolbar.getByRole('button', { name: 'Implementors' }).click();
  const implementorsWin = windowByTitle(page, 'Implementors of selector');
  const behaviorResult = implementorsWin.locator('.qv-item').filter({ hasText: 'Behavior>>printString' }).first();
  await expect(behaviorResult).toBeVisible();
  await behaviorResult.click();
  await implementorsWin.getByRole('button', { name: 'Load Into Browser' }).click();
  await expect(browser.locator('.cb-pane').nth(1).locator('.cb-item.active')).toContainText('Behavior');
  await expect(browser.locator('.cb-source-note')).toContainText('Behavior >> printString');
  expect(await requestCount(page, 'class-browser.class-location')).toBe(classLocationCount);
  await implementorsWin.locator('.win-btn-close').click({ force: true });

  const queryCountBeforeMethodRefs = await requestCount(page, 'class-browser.query');
  await toolbar.getByRole('button', { name: 'References' }).click();
  const methodReferencesWin = windowByTitle(page, 'References to printString');
  await expect(methodReferencesWin.locator('.qv-item').filter({ hasText: 'Object>>referenceToPrintstring' }).first()).toBeVisible();
  expect(await requestCount(page, 'class-browser.query')).toBe(queryCountBeforeMethodRefs + 1);
  await methodReferencesWin.locator('.win-btn-close').click({ force: true });

  await toolbar.getByRole('button', { name: 'Text Search' }).click();
  await submitModal(page, 'printString');
  const textSearchWin = windowByTitle(page, 'Methods with "printString"');
  await expect(textSearchWin.locator('.qv-item').filter({ hasText: 'Object>>printString' }).first()).toBeVisible();
  await textSearchWin.locator('.win-btn-close').click({ force: true });

  await browser.locator('.cb-pane').nth(1).locator('.cb-item').filter({ hasText: /^Object$/ }).click();
  const queryCountBeforeClassRefs = await requestCount(page, 'class-browser.query');
  await toolbar.getByRole('button', { name: 'References' }).click();
  const classReferencesWin = windowByTitle(page, 'References to Object');
  await expect(classReferencesWin.locator('.qv-item').filter({ hasText: 'Object>>referenceToObject' }).first()).toBeVisible();
  expect(await requestCount(page, 'class-browser.query')).toBe(queryCountBeforeClassRefs + 1);
  await classReferencesWin.locator('.win-btn-close').click({ force: true });

  await browser.locator('.cb-pane').nth(2).locator('.cb-item').filter({ hasText: /^printing$/ }).click();
  await expect(browser.locator('.cb-pane').nth(3)).toContainText('printString');
  const methodsCountBeforeBrowseCategory = await requestCount(page, 'class-browser.methods');
  await toolbar.getByRole('button', { name: 'Browse Category' }).click();
  const browseCategoryWin = windowByTitle(page, 'Category printing in Object');
  await expect(browseCategoryWin.locator('.qv-item').filter({ hasText: 'Object>>printString' }).first()).toBeVisible();
  await expect(browseCategoryWin.locator('.qv-preview')).toHaveValue(/printString/);
  expect(await requestCount(page, 'class-browser.methods')).toBe(methodsCountBeforeBrowseCategory);
  await browseCategoryWin.getByRole('button', { name: 'Load Into Browser' }).click();
  await expect(browser.locator('.cb-source-note')).toContainText('Object >> printString');
  await browseCategoryWin.locator('.win-btn-close').click({ force: true });

  await browser.getByLabel('Class side').check();
  await expect(browser.locator('.cb-pane').nth(3)).toContainText('new');
  await browser.locator('.cb-pane').nth(3).getByText('new').click();
  await expect(browser.locator('.cb-source-note')).toContainText('Object class >> new');
  await toolbar.locator('select').nth(0).selectOption('this');
  await toolbar.getByRole('button', { name: 'Implementors' }).click();
  const classImplementorsWin = windowByTitle(page, 'Implementors of selector');
  const classNewResult = classImplementorsWin.locator('.qv-item').filter({ hasText: 'Object class>>new' }).first();
  await expect(classNewResult).toBeVisible();
  await classNewResult.click();
  await classImplementorsWin.getByRole('button', { name: 'Load Into Browser' }).click();
  await expect(browser.locator('.cb-source-note')).toContainText('Object class >> new');
  await classImplementorsWin.locator('.win-btn-close').click({ force: true });
  await browser.getByLabel('Class side').uncheck();
  await toolbar.locator('select').nth(0).selectOption('sub');

  await browser.locator('.cb-pane').nth(1).getByText('Behavior').click();
  await browser.locator('.cb-pane').nth(3).getByText('printString').click();
  await expect(browser.locator('.cb-source-note')).toContainText('Behavior >> printString');
  const classBrowserCountBeforeBrowseMethod = await page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Class Browser' }),
  }).count();
  await toolbar.getByRole('button', { name: 'Browse Method' }).click();
  const methodBrowsers = page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Class Browser' }),
  });
  await expect(methodBrowsers).toHaveCount(classBrowserCountBeforeBrowseMethod + 1);
  await expect(methodBrowsers.last().locator('.cb-source-note')).toContainText('Behavior >> printString');
  await methodBrowsers.last().locator('.win-btn-close').click();
  await expect(methodBrowsers).toHaveCount(classBrowserCountBeforeBrowseMethod);

  await toolbar.locator('select').nth(1).selectOption('method');
  const downloadPromise = page.waitForEvent('download');
  await toolbar.getByRole('button', { name: 'File Out' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Behavior-printString.st');

  const transactionCommitCountBeforeAuto = await requestCount(page, 'transaction.commit');
  await browser.getByLabel('Auto Commit').check();
  await expect(browser.locator('.cb-status')).toContainText('Auto Commit enabled');
  await browser.locator('.cb-source').fill("displayString\n^ self name");
  await toolbar.getByRole('button', { name: 'Compile' }).click();
  await expect(browser.locator('.cb-status')).toContainText('printString → displayString');
  await expect(browser.locator('.cb-status')).toContainText('transaction committed');
  expect(await requestCount(page, 'transaction.commit')).toBe(transactionCommitCountBeforeAuto + 1);
  await expect(browser.locator('.cb-pane').nth(3)).toContainText('displayString');
  await expect(browser.locator('.cb-pane').nth(3)).not.toContainText('printString');
  await expect(browser.locator('.cb-source-note')).toContainText('Behavior >> displayString');
  await expect(browser.locator('.cb-source')).toHaveValue(/displayString/);
  await browser.getByLabel('Auto Commit').uncheck();
  await expect(browser.locator('.cb-status')).toContainText('Auto Commit disabled');

  await toolbar.getByRole('button', { name: 'Create Accessors' }).click();
  await submitModal(page, 'name');
  await expect(browser.locator('.cb-pane').nth(3)).toContainText('name');
  await expect(browser.locator('.cb-pane').nth(3)).toContainText('name:');
  await expect(browser.locator('.cb-source-note')).toContainText('Behavior >> name');
  await expect(browser.locator('.cb-source')).toHaveValue(/^name\b/);

  const transactionContinueCountBefore = await requestCount(page, 'transaction.continue');
  await toolbar.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(browser.locator('.cb-status')).toContainText('Transaction continued');
  expect(await requestCount(page, 'transaction.continue')).toBe(transactionContinueCountBefore + 1);

  const transactionAbortCountBefore = await requestCount(page, 'transaction.abort');
  await toolbar.getByRole('button', { name: 'Abort', exact: true }).click();
  await expect(browser.locator('.cb-status')).toContainText('Transaction aborted');
  expect(await requestCount(page, 'transaction.abort')).toBe(transactionAbortCountBefore + 1);

  await toolbar.getByRole('button', { name: 'Commit' }).click();
  await expect(browser.locator('.cb-status')).toContainText('Transaction committed');
  expect(await requestCount(page, 'transaction.commit')).toBe(transactionCommitCountBeforeAuto + 2);
});
