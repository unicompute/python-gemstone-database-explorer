const { test, expect } = require('@playwright/test');
const {
  clickClassBrowserAction,
  launchDockApp,
  requestCount,
  setClassBrowserMenuSelect,
  submitModal,
  windowByTitle,
} = require('./helpers');

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
});
