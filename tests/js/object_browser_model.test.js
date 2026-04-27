const test = require('node:test');
const assert = require('node:assert/strict');

const objectBrowserModel = require('../../static/js/object_browser_model.js');

test('object browser model resolves explicit class browser targets first', () => {
  const target = objectBrowserModel.getCodeTarget({
    oop: 300,
    inspection: 'aBehavior',
    classBrowserTarget: {
      oop: 410,
      className: 'Behavior',
      dictionary: 'Globals',
      meta: true,
      label: 'Behavior class',
    },
    classObject: {oop: 320, inspection: 'Metaclass3'},
  });

  assert.deepEqual(target, {
    oop: 410,
    label: 'Behavior class',
    className: 'Behavior',
    dictionary: 'Globals',
    meta: true,
  });
});

test('object browser model falls back to class or self targets when no explicit class browser target exists', () => {
  assert.deepEqual(
    objectBrowserModel.getCodeTarget({
      oop: 300,
      inspection: 'anObject',
      classObject: {oop: 320, inspection: 'Object'},
    }),
    {oop: 320, label: 'Object'}
  );

  assert.deepEqual(
    objectBrowserModel.getCodeTarget({
      oop: 301,
      inspection: 'Behavior',
      superclassObject: {oop: 100, inspection: 'Object'},
      classObject: {oop: 321, inspection: 'Metaclass3'},
    }),
    {oop: 301, label: 'Behavior'}
  );
});

test('object browser model derives current class browser targets from explicit targets and labels', () => {
  assert.deepEqual(
    objectBrowserModel.currentCodeBrowserTarget(
      {
        oop: 300,
        inspection: 'anObject',
        classBrowserTarget: {oop: 320, className: 'Behavior', dictionary: 'Globals', meta: false},
      },
      '',
      'printString'
    ),
    {
      oop: 320,
      label: 'Behavior',
      className: 'Behavior',
      dictionary: 'Globals',
      meta: false,
      method: 'printString',
    }
  );

  assert.deepEqual(
    objectBrowserModel.currentCodeBrowserTarget(
      {
        oop: 301,
        inspection: 'Behavior',
        classObject: {oop: 321, inspection: 'Behavior class'},
      },
      'Behavior class',
      '',
      'new'
    ),
    {className: 'Behavior', meta: true, method: 'new'}
  );
});

test('object browser model normalizes queries and object index urls', () => {
  assert.deepEqual(
    objectBrowserModel.normalizeObjectQuery({
      keep: 1,
      skipNull: null,
      skipEmpty: '',
      skipUndefined: undefined,
      keepFalse: false,
    }),
    {keep: 1, keepFalse: false}
  );

  assert.equal(
    objectBrowserModel.buildObjectIndexUrl(77, {foo: 'bar', empty: '', n: 3}),
    '/object/index/77?depth=2&foo=bar&n=3'
  );
});

test('object browser model resolves inspector tab captions and custom tab paging metadata', () => {
  const customTabs = [{id: 'attrs', caption: 'Attributes', rangeName: 'maglev', pageSize: '50'}];

  assert.deepEqual(objectBrowserModel.getAvailableInspectorTabs({availableTabs: ['instvars', 'attrs']}), ['instvars', 'attrs']);
  assert.equal(objectBrowserModel.getAvailableInspectorTabs({}).length, 1);
  assert.deepEqual(objectBrowserModel.getCustomTab(customTabs, 'attrs'), customTabs[0]);
  assert.equal(objectBrowserModel.getInspectorTabCaption('attrs', customTabs), 'Attributes');
  assert.equal(objectBrowserModel.getInspectorTabCaption('code', []), 'Code');
  assert.equal(objectBrowserModel.customTabRangeName(customTabs[0]), 'maglev');
  assert.equal(objectBrowserModel.customTabPageSize(customTabs[0]), 50);
  assert.deepEqual(objectBrowserModel.loadedEntryBounds({3: [], 1: [], 2: []}, 10), {from: 1, to: 3, count: 3});
  assert.deepEqual(
    objectBrowserModel.customTabRangeQuery({keep: 'x'}, customTabs[0], 11, 60),
    {keep: 'x', range_maglev_from: 11, range_maglev_to: 60}
  );
});
