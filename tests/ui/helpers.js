const { expect } = require('@playwright/test');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function windowByTitle(page, title) {
  return page.locator('.win').filter({
    has: page.locator('.win-title', { hasText: title }),
  }).last();
}

async function submitModal(page, value = null) {
  const overlay = page.locator('#modal-overlay');
  const title = page.locator('#modal-title');
  const fields = page.locator('#modal-fields').locator('input, textarea, select');
  await expect(overlay).toHaveClass(/visible/);
  const previousTitle = await title.textContent();
  const previousFieldCount = await fields.count();
  const values = Array.isArray(value) ? value : (value == null ? [] : [value]);
  const count = previousFieldCount;
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
    const currentFieldCount = await fields.count();
    return currentTitle !== previousTitle || currentFieldCount !== previousFieldCount ? 'replaced' : 'visible';
  }).not.toBe('visible');
}

async function requestCount(page, name) {
  const response = await page.request.get('/debug/request-counts');
  const data = await response.json();
  return data.counts?.[name] || 0;
}

async function openDockLauncher(page) {
  const launcherBtn = page.locator('#taskbar-launcher-btn');
  const launcher = page.locator('#dock-launcher-panel');
  await launcherBtn.click();
  await expect(launcher).toBeVisible();
  return { launcherBtn, launcher };
}

async function launchDockApp(page, name) {
  const { launcher } = await openDockLauncher(page);
  const search = launcher.locator('#dock-launcher-search');
  if (await search.count()) {
    await search.fill('');
  }
  const button = launcher.getByRole('button', { name: new RegExp(`^${escapeRegex(name)}$`) }).first();
  await expect(button).toBeVisible();
  await button.click();
  await expect(launcher).toBeHidden();
}

const CLASS_BROWSER_MENU_BY_ACTION = {
  'Find Class': 'Find',
  'Find Dictionary': 'Find',
  'Refresh': 'Find',
  'Add Dictionary': 'Dictionary',
  'Rename Dictionary': 'Dictionary',
  'Remove Dictionary': 'Dictionary',
  'Inspect Dictionary': 'Dictionary',
  'Add Class': 'Class',
  'Rename Class': 'Class',
  'Move Class': 'Class',
  'Remove Class': 'Class',
  'Browse Class': 'Class',
  'Hierarchy': 'Class',
  'Add Category': 'Category',
  'Rename Category': 'Category',
  'Remove Category': 'Category',
  'Browse Category': 'Category',
  'New Method': 'Method',
  'Browse Method': 'Method',
  'Move Method': 'Method',
  'Remove Method': 'Method',
  'Versions': 'Method',
  'Create Accessors': 'Method',
  'File Out': 'Method',
  'Inst Var': 'Variables',
  'Class Var': 'Variables',
  'Class Inst Var': 'Variables',
  'Rename Var': 'Variables',
  'Remove Var': 'Variables',
  'Senders': 'Query',
  'Implementors': 'Query',
  'References': 'Query',
  'Text Search': 'Query',
  'Inspect Class': 'Inspect',
  'Inspect Method': 'Inspect',
  'Inspect All Instances': 'Inspect',
  'Continue': 'Transaction',
  'Abort': 'Transaction',
  'Commit': 'Transaction',
};

async function resolveClassBrowserToolbar(root) {
  let toolbar = root.locator('.cb-toolbar');
  if (await toolbar.count()) return toolbar.first();
  return root;
}

async function openClassBrowserMenu(root, menuTitle) {
  const toolbar = await resolveClassBrowserToolbar(root);
  const menu = toolbar.locator(`.cb-menu[data-menu-title="${menuTitle}"]`).first();
  const panel = menu.locator('.cb-menu-panel');
  if (!(await panel.isVisible())) {
    await menu.locator('.cb-menu-toggle').click();
  }
  await expect(panel).toBeVisible();
  return menu;
}

async function clickClassBrowserAction(root, label) {
  const menuTitle = CLASS_BROWSER_MENU_BY_ACTION[label];
  if (!menuTitle) {
    await root.getByRole('button', { name: label, exact: true }).click();
    return;
  }
  const menu = await openClassBrowserMenu(root, menuTitle);
  await menu.getByRole('button', { name: label, exact: true }).click();
}

async function setClassBrowserMenuSelect(root, menuTitle, value) {
  const menu = await openClassBrowserMenu(root, menuTitle);
  await menu.locator('select').first().selectOption(value);
}

module.exports = {
  clickClassBrowserAction,
  launchDockApp,
  openDockLauncher,
  openClassBrowserMenu,
  requestCount,
  setClassBrowserMenuSelect,
  submitModal,
  windowByTitle,
};
