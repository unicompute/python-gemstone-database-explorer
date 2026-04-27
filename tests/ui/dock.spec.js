const { test, expect } = require('@playwright/test');
const { launchDockApp, openDockLauncher, windowByTitle } = require('./helpers');

test('startup opens root/system windows and renders MaglevRecord custom tabs', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.win')).toHaveCount(2);
  await expect(page.locator('#taskbar-version')).toContainText('Explorer 1.0.0');
  await expect(page.locator('#taskbar-version')).toContainText('GemStone 3.7.5');

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

test('dock launcher opens, filters, launches windows, and focuses live windows', async ({ page }) => {
  await page.goto('/');

  const launcherBtn = page.locator('#taskbar-launcher-btn');
  const launcher = page.locator('#dock-launcher-panel');
  const workspaceDockBtn = page.locator('#taskbar-launch-workspace');
  const aboutDockBtn = page.locator('#taskbar-launch-about');

  await expect(workspaceDockBtn).toBeHidden();
  await expect(aboutDockBtn).toBeHidden();

  await launcherBtn.click();
  await expect(launcher).toBeVisible();
  await expect(launcher).toContainText('Pinned');
  await expect(launcher).toContainText('Open Windows');

  const search = launcher.locator('#dock-launcher-search');
  await search.fill('workspace');
  await expect(launcher.getByRole('button', { name: /^Workspace$/ }).first()).toBeVisible();
  await launcher.getByRole('button', { name: /^Workspace$/ }).first().click();

  await expect(launcher).toBeHidden();
  const workspace = windowByTitle(page, 'Workspace');
  await expect(workspace).toBeVisible();
  await expect(workspaceDockBtn).toBeVisible();

  await launchDockApp(page, 'About');
  await expect(windowByTitle(page, 'About')).toBeVisible();
  await expect(aboutDockBtn).toBeVisible();

  await launcherBtn.click();
  await expect(launcher).toBeVisible();
  await search.fill('workspace');
  await expect(launcher.getByRole('button', { name: /^Workspace$/ }).nth(1)).toBeVisible();
  await launcher.getByRole('button', { name: /^Workspace$/ }).nth(1).click();
  await expect(launcher).toBeHidden();
  await expect(workspace).toHaveClass(/focused/);

  await launcherBtn.click();
  await expect(launcher).toBeVisible();
  await page.locator('#desktop').click({ position: { x: 12, y: 12 } });
  await expect(launcher).toBeHidden();
});

test('dock launcher can pin and unpin apps with persistence', async ({ page }) => {
  await page.goto('/');

  let { launcher } = await openDockLauncher(page);
  const pinnedSection = launcher.locator('[data-launcher-section-key="pinned"]');
  const appsSection = launcher.locator('[data-launcher-section-key="apps"]');

  await expect(pinnedSection.getByRole('button', { name: 'About' })).toHaveCount(0);
  await expect(appsSection.getByRole('button', { name: 'About' })).toBeVisible();

  await appsSection.locator('[data-launcher-pin-command="open-about"]').click();

  await expect(pinnedSection.getByRole('button', { name: 'About' })).toBeVisible();
  await expect(appsSection.getByRole('button', { name: 'About' })).toHaveCount(0);

  await page.reload();

  ({ launcher } = await openDockLauncher(page));
  const restoredPinnedSection = launcher.locator('[data-launcher-section-key="pinned"]');
  const restoredAppsSection = launcher.locator('[data-launcher-section-key="apps"]');
  await expect(restoredPinnedSection.getByRole('button', { name: 'About' })).toBeVisible();

  await restoredPinnedSection.locator('[data-launcher-pin-command="open-about"]').click();

  await expect(restoredPinnedSection.getByRole('button', { name: 'About' })).toHaveCount(0);
  await expect(restoredAppsSection.getByRole('button', { name: 'About' })).toBeVisible();
});

test('grouped dock buttons show counts and cycle focus across windows of the same type', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Workspace');
  await launchDockApp(page, 'Workspace');

  const workspaceDockBtn = page.locator('#taskbar-launch-workspace');
  const workspaces = page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Workspace' }),
  });
  const firstWorkspace = workspaces.nth(0);
  const secondWorkspace = workspaces.nth(1);

  await expect(workspaces).toHaveCount(2);
  await expect(workspaceDockBtn).toBeVisible();
  await expect(workspaceDockBtn.locator('.taskbar-btn-count')).toHaveText('2');
  await expect(secondWorkspace).toHaveClass(/focused/);

  await workspaceDockBtn.click();
  await expect(firstWorkspace).toHaveClass(/focused/);

  await workspaceDockBtn.click();
  await expect(secondWorkspace).toHaveClass(/focused/);
});

test('grouped dock buttons expose context-menu actions for open window types', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Workspace');
  await launchDockApp(page, 'Workspace');

  const workspaceDockBtn = page.locator('#taskbar-launch-workspace');
  const menu = page.locator('#dock-context-menu');
  const workspaces = page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Workspace' }),
  });

  await workspaceDockBtn.click({ button: 'right' });
  await expect(menu).toBeVisible();
  await expect(menu).toContainText('Workspace');
  await expect(menu).toContainText('2 open windows');
  await expect(menu.getByRole('button', { name: 'Open Another' })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Raise All' })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Close All' })).toBeVisible();

  await menu.getByRole('button', { name: 'Open Another' }).click();
  await expect(menu).toBeHidden();
  await expect(workspaces).toHaveCount(3);
  await expect(workspaceDockBtn.locator('.taskbar-btn-count')).toHaveText('3');

  await workspaceDockBtn.click({ button: 'right' });
  await menu.getByRole('button', { name: 'Close All' }).click();
  await expect(menu).toBeHidden();
  await expect(workspaces).toHaveCount(0);
  await expect(workspaceDockBtn).toBeHidden();
});

test('grouped dock buttons show hover previews and can focus a specific window', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Workspace');
  await launchDockApp(page, 'Workspace');

  const workspaceDockBtn = page.locator('#taskbar-launch-workspace');
  const preview = page.locator('#dock-window-preview');
  const workspaces = page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: 'Workspace' }),
  });
  const firstWorkspace = workspaces.nth(0);
  const secondWorkspace = workspaces.nth(1);

  await expect(secondWorkspace).toHaveClass(/focused/);

  await workspaceDockBtn.hover();
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Workspace');
  await expect(preview).toContainText('2 open windows');
  await expect(preview.locator('.dock-window-preview-item')).toHaveCount(2);
  await expect(preview.locator('.dock-window-preview-item').nth(1)).toContainText('Focused');

  await preview.locator('.dock-window-preview-item').first().click();
  await expect(preview).toBeHidden();
  await expect(firstWorkspace).toHaveClass(/focused/);
});

test('dock launcher supports keyboard shortcuts and result navigation', async ({ page }) => {
  await page.goto('/');

  const launcher = page.locator('#dock-launcher-panel');
  const search = page.locator('#dock-launcher-search');
  const activeItem = launcher.locator('.dock-launcher-item.keyboard-active');

  await page.keyboard.press('/');
  await expect(launcher).toBeVisible();
  await expect(search).toBeFocused();

  await page.keyboard.type('browser');
  await expect(activeItem).toHaveAttribute('aria-label', 'Object Browser');

  await page.keyboard.press('ArrowDown');
  await expect(activeItem).toHaveAttribute('aria-label', 'Class Browser');

  await page.keyboard.press('Enter');
  await expect(launcher).toBeHidden();
  await expect(windowByTitle(page, 'Class Browser')).toBeVisible();

  await page.keyboard.press('Control+Space');
  await expect(launcher).toBeVisible();
  await expect(search).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(launcher).toBeHidden();
});

test('dock surfaces live halted-thread and status-error badges', async ({ page }) => {
  await page.goto('/');

  let { launcher } = await openDockLauncher(page);
  const haltedItem = launcher.locator('[data-launcher-command="open-halted-debugger"]').first();
  await expect(haltedItem).toContainText('Halted Threads');
  await expect(haltedItem.locator('[data-launcher-item-badge]')).toHaveText('1');

  await haltedItem.click();
  const debuggerWindow = windowByTitle(page, 'Debugger');
  await expect(debuggerWindow).toBeVisible();
  const debuggerDockBtn = page.locator('#taskbar-launch-debugger');
  await expect(debuggerDockBtn).toBeVisible();
  await expect(debuggerDockBtn.locator('.taskbar-btn-status-badge')).toHaveText('1');

  await launchDockApp(page, 'Status Log');
  await page.evaluate(() => { window.setStatus(false, 'dock badge failure'); });
  const statusLogDockBtn = page.locator('#taskbar-launch-status-log');
  await expect(statusLogDockBtn).toBeVisible();
  await expect(statusLogDockBtn.locator('.taskbar-btn-status-badge')).toHaveText('1');

  ({ launcher } = await openDockLauncher(page));
  const statusLogItem = launcher.locator('[data-launcher-command="open-status-log"]').first();
  await expect(statusLogItem.locator('[data-launcher-item-badge]')).toHaveText('1');
});

test('dock launcher exposes MagLev Ruby Workspace when the backend provides it', async ({ page }) => {
  await page.goto('/');

  const rubyWorkspaceDockBtn = page.locator('#taskbar-launch-ruby-workspace');
  await expect(rubyWorkspaceDockBtn).toBeHidden();

  await launchDockApp(page, 'Ruby Workspace');
  const rubyWorkspace = windowByTitle(page, 'Ruby Workspace');
  await expect(rubyWorkspace).toBeVisible();
  await expect(rubyWorkspaceDockBtn).toBeVisible();

  await rubyWorkspace.locator('.ws-code-area').fill('Object');
  await rubyWorkspace.getByRole('button', { name: 'Do it' }).click();
  await expect(rubyWorkspace).toContainText('=> Object');
});

test('dock launcher exposes MagLev report windows when the backend provides Ruby runtime surfaces', async ({ page }) => {
  await page.goto('/');

  const reportsDockBtn = page.locator('#taskbar-launch-maglev-report');
  await expect(reportsDockBtn).toBeHidden();

  await launchDockApp(page, 'Loaded Features Report');
  const loadedFeatures = windowByTitle(page, 'Loaded Features Report');
  await expect(loadedFeatures).toBeVisible();
  await expect(loadedFeatures).toContainText('app/models/user.rb');
  await expect(reportsDockBtn).toBeVisible();

  await launchDockApp(page, 'MagLev Finalizer Registry Report');
  const finalizerReport = windowByTitle(page, 'MagLev Finalizer Registry Report');
  await expect(finalizerReport).toBeVisible();
  await expect(finalizerReport).toContainText('aFinalizerRegistry(2)');
  await expect(reportsDockBtn.locator('.taskbar-btn-count')).toHaveText('2');
});
