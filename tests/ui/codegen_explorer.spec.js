const { test, expect } = require('@playwright/test');
const {
  launchDockApp,
  requestCount,
  windowByTitle,
} = require('./helpers');

test('codegen explorer discovers classes and previews selected metadata', async ({ page }) => {
  await page.goto('/');

  await launchDockApp(page, 'Codegen Explorer');
  const explorer = windowByTitle(page, 'Codegen Explorer');
  await expect(explorer).toBeVisible();
  await expect(explorer.locator('[data-class-name="DemoRecord"]')).toBeVisible();

  await explorer.locator('[data-class-name="DemoRecord"]').click();
  await expect(explorer.locator('.codegen-method-row').filter({ hasText: 'name' })).toBeVisible();
  await explorer.locator('.codegen-method-row').filter({ hasText: 'name' }).locator('input').check();
  await explorer.getByRole('button', { name: 'Add Selected', exact: true }).click();

  await expect(explorer.locator('.codegen-selected-card')).toContainText('DemoRecord');
  await expect(explorer.locator('.codegen-selected-card')).toContainText('fields: name');

  await explorer.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(explorer.locator('.codegen-preview')).toHaveValue(/class DemoRecordProto\(Protocol\):/);
  await expect(explorer.locator('.codegen-preview')).toHaveValue(/demo_record\.py/);

  await explorer.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const downloaded = await page.evaluate(() => window.__lastDownloadedFile || null);
  expect(downloaded.filename).toBe('codegen-workbench.json');
  expect(JSON.parse(downloaded.text).classes[0].className).toBe('DemoRecord');

  expect(await requestCount(page, 'codegen.dictionaries')).toBe(1);
  expect(await requestCount(page, 'codegen.classes')).toBe(1);
  expect(await requestCount(page, 'codegen.class')).toBe(1);
  expect(await requestCount(page, 'codegen.preview')).toBe(1);
});
