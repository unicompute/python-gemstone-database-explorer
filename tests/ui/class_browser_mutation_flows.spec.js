const { test, expect } = require('@playwright/test');
const { clickClassBrowserAction, launchDockApp, requestCount, submitModal, windowByTitle } = require('./helpers');

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
