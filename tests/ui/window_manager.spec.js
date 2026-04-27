const { test, expect } = require('@playwright/test');
const { launchDockApp, windowByTitle } = require('./helpers');

test('window manager commands tile, minimise, and restore persisted layouts', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Workspace');
  await launchDockApp(page, 'Web Browser');
  await expect(page.locator('.win')).toHaveCount(4);

  await page.getByRole('button', { name: 'Tile' }).click();
  const tiledWidth = await windowByTitle(page, 'Workspace').evaluate(el => Math.round(el.getBoundingClientRect().width));
  expect(tiledWidth).toBeGreaterThan(560);

  await page.reload();
  await expect(page.locator('.win')).toHaveCount(4);
  await expect(windowByTitle(page, 'Workspace')).toBeVisible();
  await expect(windowByTitle(page, 'Web Browser')).toBeVisible();
  const restoredWidth = await windowByTitle(page, 'Workspace').evaluate(el => Math.round(el.getBoundingClientRect().width));
  expect(restoredWidth).toBeGreaterThan(560);

  await page.getByRole('button', { name: 'Minimise All' }).click();
  await expect(page.locator('.win[data-minimised="1"]')).toHaveCount(4);

  await page.getByRole('button', { name: 'Reset Startup' }).click();
  await expect(page.locator('.win')).toHaveCount(2);
});
