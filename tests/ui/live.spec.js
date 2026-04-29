const { test, expect } = require('@playwright/test');
const { clickClassBrowserAction, launchDockApp, submitModal, windowByTitle } = require('./helpers');

test('startup opens the default browser windows against a live GemStone session', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.win')).toHaveCount(2);
  await expect(page.locator('.win').filter({ hasText: 'Abort Transaction' }).first()).toBeVisible();
  await expect(page.locator('#status-txt')).toContainText('connected');
});

test('workspace can evaluate Object and drag it into a linked inspector', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#status-txt')).toContainText('connected');

  await launchDockApp(page, 'Workspace');
  const workspace = windowByTitle(page, 'Workspace');
  await expect(workspace).toBeVisible();

  await workspace.locator('.ws-code-area').fill('Object');
  await workspace.getByRole('button', { name: 'Do it' }).click();

  await expect.poll(() => page.evaluate(() => {
    const last = window.__lastWorkspaceEval || null;
    if (!last || last.code !== 'Object') return 'pending';
    if (!last.success) return `error:${JSON.stringify(last)}`;
    if (!last.canInspect) return `not-inspectable:${JSON.stringify(last)}`;
    if (!last.chipCreated) return `no-chip:${JSON.stringify(last)}`;
    return 'ready';
  })).toBe('ready');

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
  await expect(page.locator('#status-txt')).toContainText('connected');

  await launchDockApp(page, 'Class Browser');
  const browser = windowByTitle(page, 'Class Browser');
  await expect(browser).toBeVisible();

  await clickClassBrowserAction(browser, 'Find Class');
  await submitModal(page, 'Object');
  await expect(browser.locator('.cb-source-note')).toContainText('Object');

  await clickClassBrowserAction(browser, 'Hierarchy');
  const hierarchy = windowByTitle(page, 'Object Hierarchy');
  await expect(hierarchy).toBeVisible();
  await expect(hierarchy).toContainText('Object');
});

test('workspace 1/0 opens a live debugger with an execution marker', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#status-txt')).toContainText('connected');

  await launchDockApp(page, 'Workspace');
  const workspace = windowByTitle(page, 'Workspace');
  await expect(workspace).toBeVisible();

  await workspace.locator('.ws-code-area').fill('1+1.\n1/0');
  await workspace.getByRole('button', { name: 'Do it' }).click();

  const debuggerWin = windowByTitle(page, 'Debugger');
  await expect(debuggerWin).toBeVisible();
  await expect(debuggerWin.locator('.dbg-summary-error')).toContainText('ZeroDivide');
  await expect(debuggerWin.locator('.dbg-frame-item')).not.toHaveCount(0);
  await expect(debuggerWin.locator('.dbg-frame-item').first()).toContainText(/SmallInteger\s*>>\s*\/|Executed code/i);
  await expect(debuggerWin.getByRole('button', { name: 'Step', exact: true })).toBeVisible();
  await expect(debuggerWin.getByRole('button', { name: 'Step into' })).toBeVisible();
  await expect(debuggerWin.getByRole('button', { name: 'Step over' })).toBeVisible();
  await expect(debuggerWin.getByRole('button', { name: 'Step out' })).toBeVisible();
  await expect(debuggerWin.getByRole('button', { name: 'Refresh' })).toBeVisible();
  await expect(debuggerWin.getByRole('button', { name: 'Restart' })).toBeVisible();
  await expect(debuggerWin.getByRole('button', { name: 'Terminate' })).toBeVisible();
  await expect(debuggerWin.locator('.dbg-source-line.active .dbg-source-text')).toContainText(/1\|\/0|1\/0|\/ aNumber/);
  await expect(debuggerWin.locator('.dbg-source-meta')).toContainText(/Step|Line|PC/);
  await expect(debuggerWin.locator('.dbg-source-line.active')).toHaveCount(1);
  await expect(debuggerWin.locator('.dbg-source-line.active .dbg-step-cursor')).toBeVisible();
  await expect(debuggerWin.locator('.dbg-source-line.active .dbg-inline-cursor')).toBeVisible();

  const executedCodeFrame = debuggerWin.locator('.dbg-frame-item').filter({ hasText: /Executed code/i }).first();
  await expect(executedCodeFrame).toBeVisible();
  await executedCodeFrame.click();
  await expect(debuggerWin.locator('.dbg-frame-item.active')).toContainText(/Executed code/i);
  await expect(debuggerWin.locator('.dbg-source-meta')).toContainText(/Line 2/);
  await debuggerWin.getByRole('button', { name: 'Copy Source' }).click();
  await expect.poll(() => page.evaluate(() => window.__lastCopiedText || '')).toContain('1/0');
  await expect.poll(() => page.evaluate(() => window.__lastCopiedText || '')).toMatch(/Frame .*Line 2/);
  await debuggerWin.getByRole('button', { name: 'Copy Stack' }).click();
  await expect.poll(() => page.evaluate(() => window.__lastCopiedText || '')).toMatch(/Executed code/i);

  await debuggerWin.getByRole('button', { name: 'Trim stack' }).click();
  await expect(debuggerWin.locator('.dbg-frame-item.active')).toContainText(/Executed code/i);
  await expect(debuggerWin.locator('.dbg-source-meta')).toContainText(/Line 2/);

  await debuggerWin.getByRole('button', { name: 'Restart' }).click();
  await expect(debuggerWin.locator('.dbg-frame-item.active')).toContainText('Executed code @1 line 1');
  await expect(debuggerWin.locator('.dbg-source-meta')).toContainText(/Line 1/);
  await expect(debuggerWin.locator('.dbg-source-line.active .dbg-inline-cursor')).toBeVisible();

  await debuggerWin.getByRole('button', { name: 'Restart' }).click();
  await expect(debuggerWin.locator('.dbg-frame-item.active')).toContainText('Executed code @1 line 1');
  await expect(debuggerWin.locator('.dbg-source-meta')).toContainText(/Line 1/);
  await expect(debuggerWin.locator('.dbg-source-line.active .dbg-inline-cursor')).toBeVisible();

  await debuggerWin.getByRole('button', { name: 'Step', exact: true }).click();
  await expect(debuggerWin.locator('.dbg-frame-item.active')).toContainText('Executed code @2 line 1');
  await expect(debuggerWin.locator('.dbg-source-meta')).toContainText(/Step 2/);
  await expect(debuggerWin.locator('.dbg-source-line.active .dbg-inline-cursor')).toBeVisible();

  await debuggerWin.getByRole('button', { name: 'Terminate' }).click();
  await expect(debuggerWin).toHaveCount(0);
});

test('multiple live debuggers stay independent across refresh restart and terminate', async ({ page }) => {
  test.setTimeout(90000);
  const clickDebuggerButton = async (windowLocator, name, options = {}) => {
    await windowLocator.getByRole('button', { name, ...options }).evaluate(button => button.click());
  };

  await page.goto('/');
  await expect(page.locator('#status-txt')).toContainText('connected');

  await launchDockApp(page, 'Workspace');
  const workspaces = page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Workspace' }),
  });
  await expect(workspaces).toHaveCount(1);
  const workspaceA = workspaces.nth(0);
  await workspaceA.locator('.ws-code-area').fill('1+1.\n1/0');
  await workspaceA.getByRole('button', { name: 'Do it' }).click();

  await launchDockApp(page, 'Workspace');
  await expect(workspaces).toHaveCount(2);
  const workspaceB = workspaces.nth(1);
  await workspaceB.locator('.ws-code-area').fill('3+3.\n1/0');
  await workspaceB.getByRole('button', { name: 'Do it' }).click();

  const debuggerWindows = page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Debugger' }),
  });
  await expect(debuggerWindows).toHaveCount(2);
  const debuggerA = debuggerWindows.filter({ hasText: '1+1.' }).last();
  const debuggerB = debuggerWindows.filter({ hasText: '3+3.' }).last();

  await expect(debuggerA).toBeVisible();
  await expect(debuggerB).toBeVisible();
  await expect(debuggerA.locator('.dbg-summary-source')).toContainText('1+1.');
  await expect(debuggerB.locator('.dbg-summary-source')).toContainText('3+3.');
  await expect(debuggerA.locator('.dbg-source-meta')).toContainText(/Line 2/);
  await expect(debuggerB.locator('.dbg-source-meta')).toContainText(/Line 2/);

  await clickDebuggerButton(debuggerA, 'Restart');
  await expect(debuggerA.locator('.dbg-frame-item.active')).toContainText('Executed code @1 line 1');
  await expect(debuggerA.locator('.dbg-source-meta')).toContainText(/Line 1/);
  await expect(debuggerA.locator('.dbg-source-line.active .dbg-inline-cursor')).toBeVisible();

  await clickDebuggerButton(debuggerA, 'Refresh');
  await expect(debuggerA.locator('.dbg-frame-item.active')).toContainText('Executed code @1 line 1');
  await expect(debuggerA.locator('.dbg-source-meta')).toContainText(/Step 1/);

  await clickDebuggerButton(debuggerA, 'Step', { exact: true });
  await expect(debuggerA.locator('.dbg-frame-item.active')).toContainText('Executed code @2 line 1');
  await expect(debuggerA.locator('.dbg-source-meta')).toContainText(/Step 2/);
  await expect(debuggerA.locator('.dbg-source-line.active .dbg-inline-cursor')).toBeVisible();

  await expect(debuggerB).toBeVisible();
  await clickDebuggerButton(debuggerB, 'Restart');
  await expect(debuggerB.locator('.dbg-frame-item.active')).toContainText('Executed code @1 line 1');
  await expect(debuggerB.locator('.dbg-source-line.active .dbg-inline-cursor')).toBeVisible();
  await clickDebuggerButton(debuggerB, 'Refresh');
  await expect(debuggerB.locator('.dbg-frame-item.active')).toContainText('Executed code @1 line 1');
  await expect(debuggerB.locator('.dbg-source-meta')).toContainText(/Step 1/);
  await clickDebuggerButton(debuggerB, 'Step over');
  await expect(debuggerB.locator('.dbg-frame-item.active')).toContainText('Executed code @2 line 1');
  await expect(debuggerB.locator('.dbg-source-meta')).toContainText(/Step 2/);
  await clickDebuggerButton(debuggerB, 'Restart');
  await expect(debuggerB.locator('.dbg-frame-item.active')).toContainText('Executed code @1 line 1');
  await expect(debuggerB.locator('.dbg-source-meta')).toContainText(/Step 1/);
  await expect(debuggerB.locator('.dbg-source-line.active .dbg-inline-cursor')).toBeVisible();
  await clickDebuggerButton(debuggerB, 'Step over');
  await expect(debuggerB.locator('.dbg-frame-item.active')).toContainText('Executed code @2 line 1');
  await expect(debuggerB.locator('.dbg-source-meta')).toContainText(/Step 2/);
  await expect(debuggerB.locator('.dbg-source-line.active .dbg-inline-cursor')).toBeVisible();

  await clickDebuggerButton(debuggerA, 'Refresh');
  await expect(debuggerA.locator('.dbg-frame-item.active')).toContainText('Executed code @2 line 1');
  await clickDebuggerButton(debuggerB, 'Refresh');
  await expect(debuggerB.locator('.dbg-frame-item.active')).toContainText('Executed code @2 line 1');

  await clickDebuggerButton(debuggerA, 'Terminate');
  await expect(debuggerA).toHaveCount(0);
  await expect(debuggerWindows).toHaveCount(1);

  await expect(debuggerB).toBeVisible();
  await expect(debuggerB.getByRole('button', { name: 'Refresh' })).toBeEnabled();
  await clickDebuggerButton(debuggerB, 'Refresh');
  await expect(debuggerB.locator('.dbg-frame-item.active')).toContainText('Executed code @2 line 1');
  await expect(debuggerB.locator('.dbg-source-meta')).toContainText(/Step 2/);

  await clickDebuggerButton(debuggerB, 'Terminate');
  await expect(debuggerB).toHaveCount(0);
  await expect(debuggerWindows).toHaveCount(0);
});

test('class browser can create a transient class in UserGlobals and abort it', async ({ page }) => {
  test.setTimeout(60000);
  const className = `CodexLive${Date.now()}`;

  await page.goto('/');
  await expect(page.locator('#status-txt')).toContainText('connected');

  await launchDockApp(page, 'Class Browser');
  const browser = windowByTitle(page, 'Class Browser');
  await expect(browser).toBeVisible();

  await browser.locator('.cb-list').first().getByText('UserGlobals').click();
  await clickClassBrowserAction(browser, 'Add Class');
  await submitModal(page, className);
  await expect(browser.locator('.cb-source-note')).toContainText(className);

  await clickClassBrowserAction(browser, 'New Method');
  await browser.locator('.cb-source').fill("greet\n  ^ 'hello from live ui'");
  await browser.getByRole('button', { name: 'Compile' }).click();
  await expect(browser.locator('.cb-status')).toContainText(/Compiled|Success|greet/);
  await expect(browser.locator('.cb-list').nth(1)).toContainText(className);

  await clickClassBrowserAction(browser, 'Abort');
  await expect(page.locator('#status-txt')).toContainText(/ok|aborted|connected/);

  await clickClassBrowserAction(browser, 'Refresh');
  await expect(browser.locator('.cb-list').nth(1).getByText(className)).toHaveCount(0);
});
