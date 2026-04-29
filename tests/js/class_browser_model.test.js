const test = require('node:test');
const assert = require('node:assert/strict');

const classBrowserModel = require('../../static/js/class_browser_model.js');

test('class browser model normalizes filters and visible items', () => {
  assert.equal(classBrowserModel.normalizeFilterText('  Obj '), 'obj');
  assert.deepEqual(
    classBrowserModel.getVisiblePaneItems(['Object', 'Behavior', 'ProtoObject'], 'obj'),
    ['Object', 'ProtoObject']
  );
  assert.equal(classBrowserModel.filterMatchesValue('obj', 'ProtoObject'), true);
  assert.equal(classBrowserModel.filterMatchesValue('obj', 'Behavior'), false);
});

test('class browser model clamps and parses pane widths', () => {
  assert.deepEqual(
    classBrowserModel.clampPaneWidths([100, 999, 'bad', 50]),
    [120, 999, 180, 180]
  );
  assert.deepEqual(
    classBrowserModel.parseStoredPaneWidths('[140,240,200,260]'),
    [140, 240, 200, 260]
  );
  assert.deepEqual(
    classBrowserModel.parseStoredPaneWidths('not json'),
    classBrowserModel.DEFAULT_PANE_WIDTHS
  );
});

test('class browser model derives pane navigation and item selection', () => {
  const items = ['Alpha', 'Beta', 'Gamma'];

  assert.equal(classBrowserModel.initialActivePaneKey({currentClass: 'Object'}), 'classes');
  assert.equal(classBrowserModel.nextPaneKey('classes', 1), 'protocols');
  assert.equal(classBrowserModel.currentPaneItem(items, 'Beta', ''), 'Beta');
  assert.equal(classBrowserModel.currentPaneItem(items, 'Missing', ''), 'Alpha');
  assert.equal(classBrowserModel.relativePaneItem(items, 'Beta', '', 1), 'Gamma');
  assert.equal(classBrowserModel.relativePaneItem(items, 'Missing', '', 1), 'Alpha');
  assert.equal(classBrowserModel.boundaryPaneItem(items, '', 'last'), 'Gamma');
});

test('class browser model builds stable cache keys and hierarchy labels', () => {
  assert.equal(
    classBrowserModel.buildBrowserCacheKey('methods', {class: 'Object', meta: 1}),
    'methods:{"class":"Object","meta":1}'
  );
  assert.equal(classBrowserModel.hierarchyScopeLabel('sub'), 'Subclasses');
  assert.equal(classBrowserModel.hierarchyScopeLabel('unknown'), 'Full Hierarchy');
});
