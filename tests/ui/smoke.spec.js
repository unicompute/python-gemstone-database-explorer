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
  expect(await browser.locator('.cb-pane').nth(1).locator('.cb-item.active').evaluate(el => {
    const container = el.parentElement;
    if (!container) return false;
    const rowRect = el.getBoundingClientRect();
    const paneRect = container.getBoundingClientRect();
    return rowRect.top >= paneRect.top && rowRect.bottom <= paneRect.bottom;
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
  await toolbar.getByRole('button', { name: 'Inspect Method', exact: true }).click();
  await expect(page.locator('.win')).toHaveCount(afterClassInspectCount + 1);
  const methodWindow = page.locator('.win').last();
  await expect(methodWindow.locator('.insp-titlebar-left [title]').first()).toHaveAttribute('title', 'aCompiledMethod(Object>>printString)');

  const afterMethodInspectCount = await page.locator('.win').count();
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
  await versionsWin.getByRole('button', { name: 'Load Into Browser' }).click();
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

  await toolbar.locator('select').nth(1).selectOption('method');
  const downloadPromise = page.waitForEvent('download');
  await toolbar.getByRole('button', { name: 'File Out' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Behavior-printString.st');

  await browser.locator('.cb-source').fill("displayString\n^ self name");
  await toolbar.getByRole('button', { name: 'Compile' }).click();
  await expect(browser.locator('.cb-status')).toContainText('printString → displayString');
  await expect(browser.locator('.cb-pane').nth(3)).toContainText('displayString');
  await expect(browser.locator('.cb-pane').nth(3)).not.toContainText('printString');
  await expect(browser.locator('.cb-source-note')).toContainText('Behavior >> displayString');
  await expect(browser.locator('.cb-source')).toHaveValue(/displayString/);

  await toolbar.getByRole('button', { name: 'Create Accessors' }).click();
  await submitModal(page, 'name');
  await expect(browser.locator('.cb-pane').nth(3)).toContainText('name');
  await expect(browser.locator('.cb-pane').nth(3)).toContainText('name:');
  await expect(browser.locator('.cb-source-note')).toContainText('Behavior >> name');
  await expect(browser.locator('.cb-source')).toHaveValue(/^name\b/);

  await toolbar.getByRole('button', { name: 'Commit' }).click();
  await expect(browser.locator('.cb-status')).toContainText('Transaction committed');
});
