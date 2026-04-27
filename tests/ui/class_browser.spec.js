const { test, expect } = require('@playwright/test');
const {
  clickClassBrowserAction,
  launchDockApp,
  requestCount,
  setClassBrowserMenuSelect,
  submitModal,
  windowByTitle,
} = require('./helpers');

test('class browser helper windows persist across reload without auto-restoring the class browser', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Class Browser');
  const browser = windowByTitle(page, 'Class Browser');
  const toolbar = browser.locator('.cb-toolbar');
  await expect(browser).toBeVisible();

  await clickClassBrowserAction(toolbar, 'Find Class');
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await browser.locator('.cb-pane').nth(3).getByText('printString').click();

  await clickClassBrowserAction(toolbar, 'Hierarchy');
  const hierarchyWin = windowByTitle(page, 'Object Hierarchy');
  await hierarchyWin.locator('.qv-item').filter({ hasText: /^ProtoObject$/ }).click();
  await hierarchyWin.locator('.qv-filter').fill('Proto');
  await expect(hierarchyWin.locator('.qv-preview')).toHaveValue(/ProtoObject/);

  await clickClassBrowserAction(toolbar, 'Versions');
  const versionsWin = windowByTitle(page, 'Object >> printString Versions');
  await versionsWin.locator('.qv-filter').fill('version 1');
  await expect(versionsWin.locator('.qv-item')).toContainText('version 1');
  await expect(versionsWin.locator('.qv-preview')).toHaveValue(/version 1/);

  await clickClassBrowserAction(toolbar, 'Implementors');
  const implementorsWin = windowByTitle(page, 'Implementors of selector');
  await implementorsWin.locator('.qv-item').filter({ hasText: 'Behavior>>printString' }).first().click();
  await implementorsWin.locator('.qv-filter').fill('Behavior');
  await expect(implementorsWin.locator('.qv-item.active')).toContainText('Behavior>>printString');

  await page.reload();

  const restoredHierarchyWin = windowByTitle(page, 'Object Hierarchy');
  const restoredVersionsWin = windowByTitle(page, 'Object >> printString Versions');
  const restoredImplementorsWin = windowByTitle(page, 'Implementors of selector');
  await expect(page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Class Browser' }),
  })).toHaveCount(0);
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
  const restoredBrowser = windowByTitle(page, 'Class Browser');
  await expect(restoredBrowser).toBeVisible();
  await expect(restoredBrowser.locator('.cb-pane').nth(1).locator('.cb-item.active')).toContainText('Behavior');
  await expect(restoredBrowser.locator('.cb-source-note')).toContainText('Behavior >> printString');
});

test('versions window can reopen into a fresh class browser after the source browser closes', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Class Browser');
  const browser = windowByTitle(page, 'Class Browser');
  const toolbar = browser.locator('.cb-toolbar');
  await expect(browser).toBeVisible();

  await clickClassBrowserAction(toolbar, 'Find Class');
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await browser.locator('.cb-pane').nth(3).getByText('printString').click();

  await clickClassBrowserAction(toolbar, 'Versions');
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

  await launchDockApp(page, 'Class Browser');
  const browser = windowByTitle(page, 'Class Browser');
  const toolbar = browser.locator('.cb-toolbar');
  await expect(browser).toBeVisible();

  await clickClassBrowserAction(toolbar, 'Find Class');
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await browser.locator('.cb-pane').nth(3).getByText('printString').click();

  await clickClassBrowserAction(toolbar, 'Versions');
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

  await launchDockApp(page, 'Class Browser');
  const originalBrowser = windowByTitle(page, 'Class Browser');
  const toolbar = originalBrowser.locator('.cb-toolbar');
  await expect(originalBrowser).toBeVisible();

  await clickClassBrowserAction(toolbar, 'Find Class');
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await originalBrowser.locator('.cb-pane').nth(3).getByText('printString').click();

  await clickClassBrowserAction(toolbar, 'Implementors');
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

  await launchDockApp(page, 'Class Browser');
  const originalBrowser = windowByTitle(page, 'Class Browser');
  const toolbar = originalBrowser.locator('.cb-toolbar');
  await expect(originalBrowser).toBeVisible();

  await clickClassBrowserAction(toolbar, 'Find Class');
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await originalBrowser.locator('.cb-pane').nth(3).getByText('printString').click();

  await clickClassBrowserAction(toolbar, 'Versions');
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

  await launchDockApp(page, 'Class Browser');
  const browser = windowByTitle(page, 'Class Browser');
  const toolbar = browser.locator('.cb-toolbar');
  await expect(browser).toBeVisible();

  await clickClassBrowserAction(toolbar, 'Find Class');
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await browser.locator('.cb-pane').nth(3).getByText('printString').click();

  await clickClassBrowserAction(toolbar, 'Implementors');
  const implementorsWin = windowByTitle(page, 'Implementors of selector');
  await implementorsWin.locator('.qv-item').filter({ hasText: 'Object>>printString' }).first().click();
  const beforeMethodInspectCount = await page.locator('.win').count();
  await implementorsWin.getByRole('button', { name: 'Inspect Method' }).click();
  await expect(page.locator('.win')).toHaveCount(beforeMethodInspectCount + 1);
  const methodWindow = page.locator('.win').last();
  await expect(methodWindow.locator('.insp-titlebar-left [title]').first()).toHaveAttribute('title', 'aCompiledMethod(Object>>printString)');

  await clickClassBrowserAction(toolbar, 'Hierarchy');
  const hierarchyWin = windowByTitle(page, 'Object Hierarchy');
  await hierarchyWin.locator('.qv-item').filter({ hasText: /^Object$/ }).click();
  const beforeClassInspectCount = await page.locator('.win').count();
  await hierarchyWin.getByRole('button', { name: 'Inspect Class' }).click();
  await expect(page.locator('.win')).toHaveCount(beforeClassInspectCount + 1);
  const classWindow = page.locator('.win').last();
  await expect(classWindow.locator('.insp-titlebar-left')).toContainText('Object');

  expect(await requestCount(page, 'class-browser.inspect-target')).toBe(2);
});

test('class browser caches repeated loads and refresh invalidates them', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Class Browser');
  const browser = windowByTitle(page, 'Class Browser');
  await expect(browser).toBeVisible();
  await expect(browser.locator('.cb-pane').nth(0)).toContainText('Globals');

  expect(await requestCount(page, 'class-browser.dictionaries')).toBe(1);
  expect(await requestCount(page, 'class-browser.classes')).toBe(1);

  await clickClassBrowserAction(browser, 'Find Class');
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
  await clickClassBrowserAction(browser, 'Versions');
  await expect(page.locator('.win').filter({ hasText: "version 1" }).last()).toBeVisible();
  expect(await requestCount(page, 'class-browser.versions')).toBe(1);

  await clickClassBrowserAction(browser, 'Versions');
  expect(await requestCount(page, 'class-browser.versions')).toBe(1);

  await clickClassBrowserAction(browser, 'Refresh');
  await expect.poll(async () => requestCount(page, 'class-browser.dictionaries')).toBe(2);
});

test('class browser supports inline filters and remembered pane widths', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Class Browser');
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
  await launchDockApp(page, 'Class Browser');
  const reopened = windowByTitle(page, 'Class Browser');
  const reopenedClassesPane = reopened.locator('.cb-pane').nth(1);
  await expect(reopened).toBeVisible();
  await expect.poll(async () => (await reopenedClassesPane.boundingBox())?.width || 0).toBeGreaterThan(afterBox.width - 10);
});

test('class browser supports keyboard navigation and compile shortcut', async ({ page }) => {
  await page.goto('/');

  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await launchDockApp(page, 'Class Browser');
  const browser = windowByTitle(page, 'Class Browser');
  const panes = browser.locator('.cb-pane');
  const classesList = panes.nth(1).locator('.cb-list');
  const methodsPane = panes.nth(3);

  await expect(browser).toBeVisible();
  await clickClassBrowserAction(browser, 'Find Class');
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

  await launchDockApp(page, 'Class Browser');
  const browser = windowByTitle(page, 'Class Browser');
  const toolbar = browser.locator('.cb-toolbar');
  await expect(browser).toBeVisible();

  await clickClassBrowserAction(browser, 'Find Class');
  await submitModal(page, 'Behavior');
  await expect(browser.locator('.cb-pane').nth(1).locator('.cb-item.active')).toContainText('Behavior');

  await clickClassBrowserAction(toolbar, 'Add Class');
  await submitModal(page, 'WidgetThing');
  await expect(browser.locator('.cb-pane').nth(1).locator('.cb-item.active')).toContainText('WidgetThing');
  await expect(browser.locator('.cb-source')).toHaveValue(/Behavior subclass: #WidgetThing/);
  await expect(toolbar.getByRole('button', { name: 'Compile' })).toBeDisabled();
  expect(await requestCount(page, 'class-browser.add-class')).toBe(1);

  await clickClassBrowserAction(toolbar, 'New Method');
  await expect(toolbar.getByRole('button', { name: 'Compile' })).toBeEnabled();
  await expect(browser.locator('.cb-source-note')).toContainText('WidgetThing >> (new method)');
  await browser.locator('.cb-source').fill("greet\n^ 'hi'");
  await toolbar.getByRole('button', { name: 'Compile' }).click();
  await expect(browser.locator('.cb-pane').nth(3)).toContainText('greet');
  await expect(browser.locator('.cb-source-note')).toContainText('WidgetThing >> greet');
  await expect(browser.locator('.cb-source')).toHaveValue(/^greet\b/);

  await clickClassBrowserAction(toolbar, 'Browse Class');
  await expect(browser.locator('.cb-source')).toHaveValue(/Behavior subclass: #WidgetThing/);
  await expect(toolbar.getByRole('button', { name: 'Compile' })).toBeDisabled();
});

test('class browser supports class rename-move-remove and category-method actions', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Class Browser');
  const browser = windowByTitle(page, 'Class Browser');
  const panes = browser.locator('.cb-pane');
  const toolbar = browser.locator('.cb-toolbar');
  await expect(browser).toBeVisible();

  await clickClassBrowserAction(toolbar, 'Find Class');
  await submitModal(page, 'DemoRecord');
  await expect(panes.nth(1).locator('.cb-item.active')).toContainText('DemoRecord');

  await clickClassBrowserAction(toolbar, 'Rename Class');
  await submitModal(page, 'DemoThing');
  await expect(panes.nth(1).locator('.cb-item.active')).toContainText('DemoThing');
  await expect(browser.locator('.cb-source')).toHaveValue(/Object subclass: #DemoThing/);
  await expect(browser.locator('.cb-status')).toContainText('Renamed DemoRecord to DemoThing');
  expect(await requestCount(page, 'class-browser.rename-class')).toBe(1);

  await clickClassBrowserAction(toolbar, 'Move Class');
  await submitModal(page, 'UserGlobals');
  await expect(panes.nth(0).locator('.cb-item.active')).toContainText('UserGlobals');
  await expect(panes.nth(1).locator('.cb-item.active')).toContainText('DemoThing');
  await expect(browser.locator('.cb-status')).toContainText('Moved DemoThing to UserGlobals');
  expect(await requestCount(page, 'class-browser.move-class')).toBe(1);

  await clickClassBrowserAction(toolbar, 'Remove Class');
  await submitModal(page);
  await expect(panes.nth(1)).not.toContainText('DemoThing');
  await expect(browser.locator('.cb-status')).toContainText('Removed DemoThing');
  expect(await requestCount(page, 'class-browser.remove-class')).toBe(1);

  await clickClassBrowserAction(toolbar, 'Find Class');
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await expect(panes.nth(1).locator('.cb-item.active')).toContainText('Object');

  await panes.nth(2).getByText('accessing').click();
  await clickClassBrowserAction(toolbar, 'Remove Category');
  await submitModal(page);
  await expect(panes.nth(2).locator('.cb-item.active')).toContainText('as yet unclassified');
  await expect(panes.nth(3)).toContainText('yourself');
  await expect(browser.locator('.cb-status')).toContainText('Moved 1 method to as yet unclassified');
  expect(await requestCount(page, 'class-browser.remove-category')).toBe(1);

  await panes.nth(3).getByText('yourself').click();
  await clickClassBrowserAction(toolbar, 'Move Method');
  await submitModal(page, 'utility');
  await expect(panes.nth(2).locator('.cb-item.active')).toContainText('utility');
  await expect(panes.nth(3)).toContainText('yourself');
  await expect(browser.locator('.cb-status')).toContainText('Moved yourself to utility');
  expect(await requestCount(page, 'class-browser.move-method')).toBe(1);

  await clickClassBrowserAction(toolbar, 'Remove Method');
  await submitModal(page);
  await expect(panes.nth(3)).not.toContainText('yourself');
  await expect(browser.locator('.cb-status')).toContainText('Removed yourself');
  expect(await requestCount(page, 'class-browser.remove-method')).toBe(1);
});

test('class browser supports dictionary add-rename-remove actions', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Class Browser');
  const browser = windowByTitle(page, 'Class Browser');
  const panes = browser.locator('.cb-pane');
  const toolbar = browser.locator('.cb-toolbar');
  await expect(browser).toBeVisible();

  await clickClassBrowserAction(toolbar, 'Add Dictionary');
  await submitModal(page, 'TmpUI');
  await expect(panes.nth(0).locator('.cb-item.active')).toContainText('TmpUI');
  await expect(browser.locator('.cb-status')).toContainText('Added TmpUI');
  expect(await requestCount(page, 'class-browser.add-dictionary')).toBe(1);

  await clickClassBrowserAction(toolbar, 'Rename Dictionary');
  await submitModal(page, 'TmpUI2');
  await expect(panes.nth(0).locator('.cb-item.active')).toContainText('TmpUI2');
  await expect(browser.locator('.cb-status')).toContainText('Renamed TmpUI to TmpUI2');
  expect(await requestCount(page, 'class-browser.rename-dictionary')).toBe(1);

  await clickClassBrowserAction(toolbar, 'Remove Dictionary');
  await submitModal(page);
  await expect(panes.nth(0)).not.toContainText('TmpUI2');
  await expect(browser.locator('.cb-status')).toContainText('Removed TmpUI2');
  expect(await requestCount(page, 'class-browser.remove-dictionary')).toBe(1);
});

test('class browser supports dictionary search and inspect actions', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Class Browser');
  const browser = windowByTitle(page, 'Class Browser');
  const panes = browser.locator('.cb-pane');
  const toolbar = browser.locator('.cb-toolbar');
  await expect(browser).toBeVisible();

  await clickClassBrowserAction(toolbar, 'Find Dictionary');
  await submitModal(page, 'Kernel');
  await expect(panes.nth(0).locator('.cb-item.active')).toContainText('Kernel');
  await expect(panes.nth(1)).toContainText('SymbolDictionary');

  const initialWindowCount = await page.locator('.win').count();
  await clickClassBrowserAction(toolbar, 'Inspect Dictionary');
  await expect(page.locator('.win')).toHaveCount(initialWindowCount + 1);
  const dictionaryWindow = page.locator('.win').last();
  await expect(dictionaryWindow.locator('.insp-titlebar-left')).toContainText('aSymbolDictionary()');
  expect(await requestCount(page, 'class-browser.inspect-target')).toBe(1);

  await clickClassBrowserAction(toolbar, 'Find Class');
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await expect(panes.nth(1).locator('.cb-item.active')).toContainText('Object');
  await panes.nth(3).getByText('printString').click();

  const afterDictionaryInspectCount = await page.locator('.win').count();
  await clickClassBrowserAction(toolbar, 'Inspect Class');
  await expect(page.locator('.win')).toHaveCount(afterDictionaryInspectCount + 1);
  const classWindow = page.locator('.win').last();
  await expect(classWindow.locator('.insp-titlebar-left')).toContainText('Object');

  const afterClassInspectCount = await page.locator('.win').count();
  await browser.locator('.win-titlebar').click();
  await clickClassBrowserAction(toolbar, 'Inspect Method');
  await expect(page.locator('.win')).toHaveCount(afterClassInspectCount + 1);
  const methodWindow = page.locator('.win').last();
  await expect(methodWindow.locator('.insp-titlebar-left [title]').first()).toHaveAttribute('title', 'aCompiledMethod(Object>>printString)');

  const afterMethodInspectCount = await page.locator('.win').count();
  await browser.locator('.win-titlebar').click();
  await clickClassBrowserAction(toolbar, 'Inspect All Instances');
  await expect(page.locator('.win')).toHaveCount(afterMethodInspectCount + 1);
  const instancesWindow = page.locator('.win').last();
  await expect(instancesWindow.locator('.insp-titlebar-left')).toContainText('anArray(2)');
  await expect(instancesWindow).toContainText('a DemoRecord');
  expect(await requestCount(page, 'class-browser.inspect-target')).toBe(4);
});

test('class browser supports category add-rename and class structure edits', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Class Browser');
  const browser = windowByTitle(page, 'Class Browser');
  const panes = browser.locator('.cb-pane');
  const toolbar = browser.locator('.cb-toolbar');
  await expect(browser).toBeVisible();

  await clickClassBrowserAction(toolbar, 'Find Class');
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await expect(panes.nth(1).locator('.cb-item.active')).toContainText('Object');

  await clickClassBrowserAction(toolbar, 'Add Category');
  await submitModal(page, 'utility');
  await expect(panes.nth(2).locator('.cb-item.active')).toContainText('utility');
  await expect(browser.locator('.cb-status')).toContainText('Added category utility');
  expect(await requestCount(page, 'class-browser.add-category')).toBe(1);

  await clickClassBrowserAction(toolbar, 'Rename Category');
  await submitModal(page, 'utility-renamed');
  await expect(panes.nth(2).locator('.cb-item.active')).toContainText('utility-renamed');
  await expect(browser.locator('.cb-status')).toContainText('Renamed utility to utility-renamed');
  expect(await requestCount(page, 'class-browser.rename-category')).toBe(1);

  await clickClassBrowserAction(toolbar, 'Browse Class');
  await clickClassBrowserAction(toolbar, 'Inst Var');
  await submitModal(page, 'slotOne');
  await expect(browser.locator('.cb-source')).toHaveValue(/instanceVariableNames: 'slotOne'/);
  await expect(browser.locator('.cb-status')).toContainText('Added instance variable slotOne');
  expect(await requestCount(page, 'class-browser.add-instance-variable')).toBe(1);

  await clickClassBrowserAction(toolbar, 'Class Var');
  await submitModal(page, 'SharedState');
  await expect(browser.locator('.cb-source')).toHaveValue(/classVariableNames: 'SharedState'/);
  await expect(browser.locator('.cb-status')).toContainText('Added class variable SharedState');
  expect(await requestCount(page, 'class-browser.add-class-variable')).toBe(1);

  await clickClassBrowserAction(toolbar, 'Class Inst Var');
  await submitModal(page, 'cachedState');
  await expect(browser.locator('.cb-source')).toHaveValue(/classInstanceVariableNames: 'cachedState'/);
  await expect(browser.locator('.cb-status')).toContainText('Added class instance variable cachedState');
  expect(await requestCount(page, 'class-browser.add-class-instance-variable')).toBe(1);

  await clickClassBrowserAction(toolbar, 'Rename Var');
  await submitModal(page, ['instance:slotOne', 'slotRenamed']);
  await expect(browser.locator('.cb-source')).toHaveValue(/instanceVariableNames: 'slotRenamed'/);
  await expect(browser.locator('.cb-status')).toContainText('Renamed instance variable slotOne to slotRenamed');
  expect(await requestCount(page, 'class-browser.rename-instance-variable')).toBe(1);

  await clickClassBrowserAction(toolbar, 'Rename Var');
  await submitModal(page, ['classInstance:cachedState', 'renamedCache']);
  await expect(browser.locator('.cb-source')).toHaveValue(/classInstanceVariableNames: 'renamedCache'/);
  await expect(browser.locator('.cb-status')).toContainText('Renamed class instance variable cachedState to renamedCache');
  expect(await requestCount(page, 'class-browser.rename-class-instance-variable')).toBe(1);

  await clickClassBrowserAction(toolbar, 'Remove Var');
  await submitModal(page, 'class:SharedState');
  await submitModal(page);
  await expect(browser.locator('.cb-source')).toHaveValue(/classVariableNames: ''/);
  await expect(browser.locator('.cb-status')).toContainText('Removed class variable SharedState');
  expect(await requestCount(page, 'class-browser.remove-class-variable')).toBe(1);
});

test('class browser supports hierarchy queries, text search, file-out, accessors, and commit', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Class Browser');
  const initialBrowser = page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Class Browser' }),
  }).first();
  const browserId = await initialBrowser.getAttribute('id');
  if (!browserId) throw new Error('Class Browser window id missing');
  const browser = page.locator(`#${browserId}`);
  await expect(browser).toBeVisible();
  await expect(browser.locator('.cb-pane').nth(0)).toContainText('Globals');

  await clickClassBrowserAction(browser, 'Find Class');
  await submitModal(page, 'Object');
  await submitModal(page, 'Globals');
  await browser.locator('.cb-pane').nth(3).getByText('printString').click();
  const classLocationCount = await requestCount(page, 'class-browser.class-location');

  const toolbar = browser.locator('.cb-toolbar');
  const classBrowserCount = await page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Class Browser' }),
  }).count();
  await clickClassBrowserAction(toolbar, 'Hierarchy');
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

  await clickClassBrowserAction(toolbar, 'Versions');
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

  await setClassBrowserMenuSelect(toolbar, 'Query', 'sub');
  await clickClassBrowserAction(toolbar, 'Implementors');
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
  await clickClassBrowserAction(toolbar, 'References');
  const methodReferencesWin = windowByTitle(page, 'References to printString');
  await expect(methodReferencesWin.locator('.qv-item').filter({ hasText: 'Object>>referenceToPrintstring' }).first()).toBeVisible();
  expect(await requestCount(page, 'class-browser.query')).toBe(queryCountBeforeMethodRefs + 1);
  await methodReferencesWin.locator('.win-btn-close').click({ force: true });

  await clickClassBrowserAction(toolbar, 'Text Search');
  await submitModal(page, 'printString');
  const textSearchWin = windowByTitle(page, 'Methods with "printString"');
  await expect(textSearchWin.locator('.qv-item').filter({ hasText: 'Object>>printString' }).first()).toBeVisible();
  await textSearchWin.locator('.win-btn-close').click({ force: true });

  await browser.locator('.cb-pane').nth(1).locator('.cb-item').filter({ hasText: /^Object$/ }).click();
  const queryCountBeforeClassRefs = await requestCount(page, 'class-browser.query');
  await clickClassBrowserAction(toolbar, 'References');
  const classReferencesWin = windowByTitle(page, 'References to Object');
  await expect(classReferencesWin.locator('.qv-item').filter({ hasText: 'Object>>referenceToObject' }).first()).toBeVisible();
  expect(await requestCount(page, 'class-browser.query')).toBe(queryCountBeforeClassRefs + 1);
  await classReferencesWin.locator('.win-btn-close').click({ force: true });

  await browser.locator('.cb-pane').nth(2).locator('.cb-item').filter({ hasText: /^printing$/ }).click();
  await expect(browser.locator('.cb-pane').nth(3)).toContainText('printString');
  const methodsCountBeforeBrowseCategory = await requestCount(page, 'class-browser.methods');
  await clickClassBrowserAction(toolbar, 'Browse Category');
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
  await setClassBrowserMenuSelect(toolbar, 'Query', 'this');
  await clickClassBrowserAction(toolbar, 'Implementors');
  const classImplementorsWin = windowByTitle(page, 'Implementors of selector');
  const classNewResult = classImplementorsWin.locator('.qv-item').filter({ hasText: 'Object class>>new' }).first();
  await expect(classNewResult).toBeVisible();
  await classNewResult.click();
  await classImplementorsWin.getByRole('button', { name: 'Load Into Browser' }).click();
  await expect(browser.locator('.cb-source-note')).toContainText('Object class >> new');
  await classImplementorsWin.locator('.win-btn-close').click({ force: true });
  await browser.getByLabel('Class side').uncheck();
  await setClassBrowserMenuSelect(toolbar, 'Query', 'sub');

  await browser.locator('.cb-pane').nth(1).getByText('Behavior').click();
  await browser.locator('.cb-pane').nth(3).getByText('printString').click();
  await expect(browser.locator('.cb-source-note')).toContainText('Behavior >> printString');
  const classBrowserCountBeforeBrowseMethod = await page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Class Browser' }),
  }).count();
  await clickClassBrowserAction(toolbar, 'Browse Method');
  const methodBrowsers = page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Class Browser' }),
  });
  await expect(methodBrowsers).toHaveCount(classBrowserCountBeforeBrowseMethod + 1);
  await expect(methodBrowsers.last().locator('.cb-source-note')).toContainText('Behavior >> printString');
  await methodBrowsers.last().locator('.win-btn-close').click();
  await expect(methodBrowsers).toHaveCount(classBrowserCountBeforeBrowseMethod);

  await setClassBrowserMenuSelect(toolbar, 'Method', 'method');
  const downloadPromise = page.waitForEvent('download');
  await clickClassBrowserAction(toolbar, 'File Out');
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

  await clickClassBrowserAction(toolbar, 'Create Accessors');
  await submitModal(page, 'name');
  await expect(browser.locator('.cb-pane').nth(3)).toContainText('name');
  await expect(browser.locator('.cb-pane').nth(3)).toContainText('name:');
  await expect(browser.locator('.cb-source-note')).toContainText('Behavior >> name');
  await expect(browser.locator('.cb-source')).toHaveValue(/^name\b/);

  const transactionContinueCountBefore = await requestCount(page, 'transaction.continue');
  await clickClassBrowserAction(toolbar, 'Continue');
  await expect(browser.locator('.cb-status')).toContainText('Transaction continued');
  expect(await requestCount(page, 'transaction.continue')).toBe(transactionContinueCountBefore + 1);

  const transactionAbortCountBefore = await requestCount(page, 'transaction.abort');
  await clickClassBrowserAction(toolbar, 'Abort');
  await expect(browser.locator('.cb-status')).toContainText('Transaction aborted');
  expect(await requestCount(page, 'transaction.abort')).toBe(transactionAbortCountBefore + 1);

  await clickClassBrowserAction(toolbar, 'Commit');
  await expect(browser.locator('.cb-status')).toContainText('Transaction committed');
  expect(await requestCount(page, 'transaction.commit')).toBe(transactionCommitCountBeforeAuto + 2);
});
