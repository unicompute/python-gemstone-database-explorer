const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/codegen_explorer_runtime.js');

test('codegen explorer maps GemStone selectors to Python names', () => {
  assert.equal(runtime.selectorToPythonName('status'), 'status');
  assert.equal(runtime.selectorToPythonName('markPaid:'), 'mark_paid');
  assert.equal(runtime.selectorToPythonName('findById:'), 'find_by_id');
  assert.equal(runtime.selectorToPythonName('from:to:'), 'from_to');
});

test('codegen explorer view exposes discovery, selection, and preview controls', () => {
  const html = runtime.buildCodegenExplorerHtml('codegen-1');

  assert.match(html, /codegen-1-dictionary/);
  assert.match(html, /codegen-1-classes/);
  assert.match(html, /codegen-1-methods/);
  assert.match(html, /codegen-1-category-filter/);
  assert.match(html, /codegen-1-source/);
  assert.match(html, /codegen-1-selection/);
  assert.match(html, /codegen-1-preview/);
  assert.match(html, /codegen-1-import/);
  assert.match(html, /codegen-1-export/);
});
