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
  const nameRow = explorer.locator('.codegen-method-row[data-selector="name"]');
  await expect(nameRow).toBeVisible();
  await nameRow.locator('input').check();
  await explorer.getByRole('button', { name: 'Add Selected', exact: true }).click();

  await expect(explorer.locator('.codegen-selected-card')).toContainText('DemoRecord');
  await expect(explorer.locator('.codegen-selected-card')).toContainText('fields: name');

  await explorer.locator('select[id$="-category-filter"]').selectOption('actions');
  await expect(explorer.locator('.codegen-method-row')).toHaveCount(1);
  const renameRow = explorer.locator('.codegen-method-row[data-selector="renameTo:"]');
  await expect(renameRow).toBeVisible();
  await renameRow.locator('input').check();
  await expect(explorer.locator('.codegen-source')).toContainText('renameTo: newName');
  await explorer.getByRole('button', { name: 'Add Selected', exact: true }).click();
  await explorer.locator('[data-field="pythonName"]').fill('rename_to_name');
  await explorer.locator('[data-field="argName"]').fill('new_name');
  await explorer.locator('[data-field="returnAnnotation"]').fill('str');

  await explorer.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(explorer.locator('.codegen-preview')).toHaveValue(/class DemoRecordProto\(Protocol\):/);
  await expect(explorer.locator('.codegen-preview')).toHaveValue(/def rename_to_name\(self, new_name: Any\) -> str: \.\.\./);
  await expect(explorer.locator('.codegen-preview')).toHaveValue(/demo_record\.py/);

  await explorer.getByRole('button', { name: 'Export JSON', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__lastDownloadedFile?.filename || '')).toBe('codegen-workbench.json');
  const downloaded = await page.evaluate(() => window.__lastDownloadedFile || null);
  expect(downloaded.filename).toBe('codegen-workbench.json');
  const exported = JSON.parse(downloaded.text);
  expect(exported.classes[0].className).toBe('DemoRecord');
  expect(exported.classes[0].methods[0].pythonName).toBe('rename_to_name');

  await explorer.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(explorer.locator('.codegen-selected-card')).toHaveCount(0);
  await explorer.locator('input[type="file"]').setInputFiles({
    name: 'codegen-workbench.json',
    mimeType: 'application/json',
    buffer: Buffer.from(downloaded.text),
  });
  await expect(explorer.locator('.codegen-selected-card')).toContainText('DemoRecord');
  await expect(explorer.locator('[data-field="pythonName"]')).toHaveValue('rename_to_name');

  expect(await requestCount(page, 'codegen.dictionaries')).toBe(1);
  expect(await requestCount(page, 'codegen.classes')).toBe(1);
  expect(await requestCount(page, 'codegen.class')).toBe(1);
  expect(await requestCount(page, 'codegen.source')).toBe(2);
  expect(await requestCount(page, 'codegen.preview')).toBe(1);
  expect(await requestCount(page, 'codegen.export-selection')).toBe(2);
});
