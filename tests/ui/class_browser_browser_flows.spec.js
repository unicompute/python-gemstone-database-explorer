const { test, expect } = require('@playwright/test');
const {
  clickClassBrowserAction,
  launchDockApp,
  requestCount,
  submitModal,
  windowByTitle,
} = require('./helpers');

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
