const { test, expect } = require('@playwright/test');
const { launchDockApp, requestCount, submitModal, windowByTitle } = require('./helpers');

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

  await launchDockApp(page, 'Workspace');
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

test('symbol list uses modal add/remove flows for dictionaries and entries', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Symbol List');
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
