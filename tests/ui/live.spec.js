const { test, expect } = require('@playwright/test');
const { submitModal, windowByTitle } = require('./helpers');

test('startup opens the default browser windows against a live GemStone session', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.win')).toHaveCount(2);
  await expect(page.locator('.win').filter({ hasText: 'Abort Transaction' }).first()).toBeVisible();
  await expect(page.locator('#status-txt')).toContainText('connected');
});

test('workspace can evaluate Object and drag it into a linked inspector', async ({ page }) => {
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

test('class browser can locate Object and open its hierarchy report', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Class Browser' }).click();
  const browser = windowByTitle(page, 'Class Browser');
  await expect(browser).toBeVisible();

  await browser.getByRole('button', { name: 'Find Class' }).click();
  await submitModal(page, 'Object');
  await expect(browser.locator('.cb-source-note')).toContainText('Object');

  await browser.getByRole('button', { name: 'Hierarchy' }).click();
  const hierarchy = page.locator('.win').filter({ hasText: 'ProtoObject' }).last();
  await expect(hierarchy).toBeVisible();
  await expect(hierarchy.locator('textarea')).toContainText('Object');
});

test('workspace 1/0 opens a live debugger with an execution marker', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Workspace' }).click();
  const workspace = windowByTitle(page, 'Workspace');
  await expect(workspace).toBeVisible();

  await workspace.locator('.ws-code-area').fill('1/0');
  await workspace.getByRole('button', { name: 'Do it' }).click();

  const debuggerWin = windowByTitle(page, 'Debugger');
  await expect(debuggerWin).toBeVisible();
  await expect(debuggerWin.locator('.dbg-summary-error')).toContainText('ZeroDivide');
  await expect(debuggerWin.locator('.dbg-source-code')).toContainText('1/0');
  await expect(debuggerWin.locator('.dbg-source-meta')).toContainText(/Step|Line|PC/);
  await expect(debuggerWin.locator('.dbg-source-line.active')).toHaveCount(1);

  await debuggerWin.getByRole('button', { name: 'Proceed' }).click();
  await expect(debuggerWin).toHaveCount(0);
});

test('class browser can create a transient class in UserGlobals and abort it', async ({ page }) => {
  test.setTimeout(60000);
  const className = `CodexLive${Date.now()}`;

  await page.goto('/');

  await page.getByRole('button', { name: 'Class Browser' }).click();
  const browser = windowByTitle(page, 'Class Browser');
  await expect(browser).toBeVisible();

  await browser.locator('.cb-list').first().getByText('UserGlobals').click();
  await browser.getByRole('button', { name: 'Add Class' }).click();
  await submitModal(page, className);
  await expect(browser.locator('.cb-source-note')).toContainText(className);

  await browser.getByRole('button', { name: 'New Method' }).click();
  await browser.locator('.cb-source').fill("greet\n  ^ 'hello from live ui'");
  await browser.getByRole('button', { name: 'Compile' }).click();
  await expect(browser.locator('.cb-status')).toContainText(/Compiled|Success|greet/);
  await expect(browser.locator('.cb-list').nth(1)).toContainText(className);

  const system = page.locator('.win').filter({ hasText: 'Abort Transaction' }).first();
  await system.getByRole('button', { name: 'Abort Transaction' }).click();
  await expect(page.locator('#status-txt')).toContainText(/ok|aborted|connected/);

  await browser.getByRole('button', { name: 'Refresh' }).click();
  await expect(browser.locator('.cb-list').nth(1).getByText(className)).toHaveCount(0);
});
