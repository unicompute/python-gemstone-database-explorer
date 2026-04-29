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
