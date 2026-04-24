const { expect } = require('@playwright/test');

function windowByTitle(page, title) {
  return page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: title }),
  }).last();
}

async function submitModal(page, value = null) {
  const overlay = page.locator('#modal-overlay');
  const title = page.locator('#modal-title');
  await expect(overlay).toHaveClass(/visible/);
  const previousTitle = await title.textContent();
  const values = Array.isArray(value) ? value : (value == null ? [] : [value]);
  const fields = page.locator('#modal-fields').locator('input, textarea, select');
  const count = await fields.count();
  for (let index = 0; index < Math.min(values.length, count); index += 1) {
    const field = fields.nth(index);
    const tagName = await field.evaluate(el => el.tagName.toLowerCase());
    if (tagName === 'select') {
      await field.selectOption(String(values[index]));
    } else {
      await field.fill(values[index]);
    }
  }
  await page.locator('#modal-ok').click();
  await expect.poll(async () => {
    const overlayClass = await overlay.getAttribute('class') || '';
    if (!/visible/.test(overlayClass)) return 'closed';
    const currentTitle = await title.textContent();
    return currentTitle !== previousTitle ? 'replaced' : 'visible';
  }).not.toBe('visible');
}

module.exports = {
  submitModal,
  windowByTitle,
};
