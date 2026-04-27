const { test, expect } = require('@playwright/test');
const { launchDockApp, windowByTitle } = require('./helpers');

test('symbol list persists across reload while debugger does not auto-restore on startup', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Workspace');
  await launchDockApp(page, 'Symbol List');

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
  const restoredSymbolList = windowByTitle(page, 'Symbol List Browser');
  await expect(restoredWorkspace).toBeVisible();
  await expect(page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Debugger' }),
  })).toHaveCount(0);
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
  await expect(windowByTitle(page, 'Symbol List Browser')).toBeVisible();
});

test('workspace eval exceptions auto-open the debugger', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Workspace');
  const workspace = windowByTitle(page, 'Workspace');
  await expect(workspace).toBeVisible();

  await workspace.locator('.ws-code-area').fill('1/0');
  await workspace.getByRole('button', { name: 'Do it' }).click();

  const debuggerWin = windowByTitle(page, 'Debugger');
  await expect(debuggerWin).toBeVisible();
  const workspaceBox = await workspace.boundingBox();
  const debuggerBox = await debuggerWin.boundingBox();
  expect(workspaceBox).not.toBeNull();
  expect(debuggerBox).not.toBeNull();
  expect(debuggerBox.x).toBeGreaterThan(workspaceBox.x);
  expect(debuggerBox.y).toBeLessThan(workspaceBox.y);
  await expect(debuggerWin.locator('.dbg-summary-source')).toContainText('1/0');
  await expect(debuggerWin.locator('.dbg-summary-error')).toContainText('ZeroDivide occurred');
  await expect(debuggerWin.locator('.dbg-frame-item')).toHaveCount(3);
  await expect(debuggerWin.locator('.dbg-source-code')).toContainText('1/0');
  await expect(debuggerWin.locator('.dbg-source-meta')).toContainText('Step 1');
  await expect(debuggerWin.locator('.dbg-source-line.active')).toHaveCount(1);
  await expect(debuggerWin.locator('.dbg-source-line.active .dbg-source-marker')).toContainText('▶');
  await expect(workspace.locator('.ws-entry').last()).toContainText('ZeroDivide occurred');
});

test('debugger restart uses the selected stack frame as the restart target', async ({ page }) => {
  await page.goto('/');

  const haltedBar = page.locator('#halted-threads-bar');
  await haltedBar.locator('.thread-pill').first().click();

  const debuggerWin = windowByTitle(page, 'Debugger');
  await expect(debuggerWin).toBeVisible();

  const sourceArea = debuggerWin.locator('.dbg-source-code');
  const sourceMeta = debuggerWin.locator('.dbg-source-meta');

  await expect(sourceArea).toContainText('1/0');
  await debuggerWin.locator('.dbg-frame-item').nth(1).click();
  await expect(debuggerWin.locator('.dbg-frame-item.active')).toContainText('Behavior>>helper');
  await expect(sourceArea).toContainText('helper');
  await expect(sourceMeta).toContainText('Line 2');

  await debuggerWin.getByRole('button', { name: 'Restart' }).click();
  await expect(debuggerWin.locator('.dbg-frame-item.active')).toContainText('Behavior>>helper');
  await expect(sourceArea).toContainText('helper');
  await expect(sourceMeta).toContainText('Line 2');
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
  await expect(debuggerWin.getByRole('button', { name: 'Step', exact: true })).toBeVisible();
  await expect(debuggerWin.getByRole('button', { name: 'Step into' })).toBeVisible();
  await expect(debuggerWin.getByRole('button', { name: 'Step over' })).toBeVisible();
  await expect(debuggerWin.getByRole('button', { name: 'Restart' })).toBeVisible();
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
  await expect(debuggerWin.locator('.dbg-source-line.active')).toHaveAttribute('data-line', '2');
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
  await debuggerWin.getByRole('button', { name: 'Step', exact: true }).click();
  await expect(debuggerWin.locator('.dbg-frame-item')).toHaveCount(4);
  await expect(debuggerWin.locator('.dbg-frame-item').first()).toContainText('stepInto1');
  await expect(sourceArea).toContainText('stepInto1');

  await debuggerWin.getByRole('button', { name: 'Restart' }).click();
  await expect(debuggerWin.locator('.dbg-frame-item')).toHaveCount(3);
  await expect(debuggerWin.locator('.dbg-frame-item').first()).toContainText('Object>>haltedMethod');
  await expect(sourceArea).toContainText('1/0');

  await debuggerWin.getByRole('button', { name: 'Step into' }).click();
  await expect(debuggerWin.locator('.dbg-frame-item')).toHaveCount(4);
  await expect(debuggerWin.locator('.dbg-frame-item').first()).toContainText('stepInto1');
  await expect(sourceArea).toContainText('stepInto1');

  await debuggerWin.getByRole('button', { name: 'Step over' }).click();
  await expect(sourceArea).toContainText('stepped over');

  const trimTarget = debuggerWin.locator('.dbg-frame-item').filter({ hasText: 'Object>>haltedMethod' }).first();
  await trimTarget.click();
  await expect(debuggerWin.locator('.dbg-frame-item.active')).toContainText('Object>>haltedMethod');
  await debuggerWin.getByRole('button', { name: 'Trim stack' }).click();
  await expect(debuggerWin.locator('.dbg-frame-item')).toHaveCount(3);
  await expect(debuggerWin.locator('.dbg-frame-item.active')).toContainText('Object>>haltedMethod');
  await expect(sourceArea).toContainText('1/0');

  await debuggerWin.getByRole('button', { name: 'Proceed' }).click();
  await expect(debuggerWin).toHaveCount(0);
  await expect(haltedBar.locator('.thread-pill')).toHaveCount(0);
});
