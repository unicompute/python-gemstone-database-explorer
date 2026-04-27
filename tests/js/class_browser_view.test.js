const test = require('node:test');
const assert = require('node:assert/strict');

const classBrowserView = require('../../static/js/class_browser_view.js');

test('class browser view builds the shell html', () => {
  const html = classBrowserView.buildClassBrowserWindowHtml('cb');

  assert.match(html, /cb-find/);
  assert.match(html, /cb-menu-toggle/);
  assert.match(html, /Find ▾/);
  assert.match(html, /Filter dictionaries/);
  assert.match(html, /cb-query-scope/);
  assert.match(html, /cb-source-note/);
});

test('class browser action state reflects selection availability', () => {
  const emptyState = classBrowserView.buildClassBrowserActionState({});
  const fullState = classBrowserView.buildClassBrowserActionState({
    currentDict: 'Globals',
    currentClass: 'Object',
    currentProtocol: 'accessing',
    currentMethod: 'printString',
  });

  assert.equal(emptyState.renameDictionary.enabled, false);
  assert.equal(emptyState.inspectClass.enabled, false);
  assert.equal(emptyState.browseMethod.enabled, false);
  assert.equal(fullState.renameDictionary.enabled, true);
  assert.equal(fullState.inspectClass.enabled, true);
  assert.equal(fullState.renameCategory.enabled, true);
  assert.equal(fullState.browseMethod.enabled, true);
  assert.equal(fullState.versions.enabled, true);
});
