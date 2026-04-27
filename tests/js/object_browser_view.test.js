const test = require('node:test');
const assert = require('node:assert/strict');

const objectBrowserView = require('../../static/js/object_browser_view.js');

test('object browser view builds full shell html', () => {
  const html = objectBrowserView.buildObjectBrowserWindowHtml('obj');

  assert.match(html, /obj-roots/);
  assert.match(html, /obj-eval-btn/);
  assert.match(html, /obj-mb-open-browser/);
  assert.match(html, /Select a root object to begin/);
});

test('object browser view builds compact shell html', () => {
  const html = objectBrowserView.buildObjectBrowserWindowHtml('obj', {compactMode: true});

  assert.doesNotMatch(html, /obj-roots/);
  assert.doesNotMatch(html, /obj-eval-btn/);
  assert.match(html, /obj-mb-close/);
  assert.match(html, /Loading object/);
});

test('object browser view renders inspector tabs with active and dim state', () => {
  const html = objectBrowserView.buildInspectorTabsHtml(
    ['instvars', 'control'],
    'control',
    tabId => tabId === 'instvars' ? 'Instance Variables' : 'Control Panel',
    'control'
  );

  assert.match(html, /data-itab="instvars"/);
  assert.match(html, /Instance Variables/);
  assert.match(html, /class="inspector-tab active dim"/);
});

test('object browser view renders method browser categories and selectors safely', () => {
  const categories = objectBrowserView.buildMethodBrowserCategoriesHtml(['', 'accessing'], 'accessing');
  const selectors = objectBrowserView.buildMethodBrowserSelectorsHtml(['printString', 'size<'], 'size<');

  assert.match(categories, /\(uncategorized\)/);
  assert.match(categories, /data-category="accessing"/);
  assert.match(selectors, /data-selector="size&lt;"/);
  assert.match(selectors, /class="mb-sel active"/);
});
