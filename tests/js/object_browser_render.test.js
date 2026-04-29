const test = require('node:test');
const assert = require('node:assert/strict');

const render = require('../../static/js/object_browser_render.js');

test('object browser render builds association rows and summary', () => {
  const state = render.buildAssociationRenderState({
    1: [{inspection: ':name', basetype: 'symbol'}, {inspection: 'Tariq', basetype: 'string'}],
    2: [{inspection: 'User', basetype: 'object', oop: 33}, {inspection: 'Array', basetype: 'array', oop: 44}],
  }, 3);

  assert.equal(state.isEmpty, false);
  assert.equal(state.rows[0].key.isChip, false);
  assert.equal(state.rows[1].key.isChip, true);
  assert.equal(state.rows[1].value.kind, 'array');
  assert.equal(state.summaryText, '2 of 3 entries');
});

test('object browser render builds custom tab render state', () => {
  const state = render.buildCustomTabRenderState({
    myEntries: {
      1: [{inspection: ':a', basetype: 'symbol'}, {inspection: '1', basetype: 'smallint'}],
    },
    myEntriesSize: 1,
  }, {
    kind: 'association-dict',
    field: 'myEntries',
    sizeField: 'myEntriesSize',
    caption: 'Custom',
  });

  assert.equal(state.kind, 'association-dict');
  assert.equal(state.association.rows.length, 1);
  assert.equal(state.association.summaryText, '');
});

test('object browser render builds card rows and class link', () => {
  const state = render.buildObjectCardState({
    basetype: 'hash',
    oop: 123,
    inspection: 'aDictionary',
    loaded: true,
    instVars: {
      1: [{inspection: 'User', basetype: 'object', oop: 9}, {inspection: 'Tariq', basetype: 'string'}],
    },
    instVarsSize: 2,
    classObject: {oop: 88, inspection: 'IdentityDictionary'},
  });

  assert.equal(state.header.basetype, 'hash');
  assert.equal(state.keyColumnLabel, 'Key');
  assert.equal(state.rows[0].key.isChip, true);
  assert.equal(state.rows[0].value.kind, 'text');
  assert.equal(state.moreText, '1 of 2 entries');
  assert.deepEqual(state.classLink, {oop: 88, text: 'IdentityDictionary'});
});

test('object browser render builds collection table states', () => {
  const pageState = {start: 1, stop: 2, total: 5};
  const instances = render.buildInstancesCollectionState([
    {oop: 11, printString: 'anObject'},
  ], pageState);
  const constants = render.buildConstantsCollectionState([
    {key: 'Foo', valueObject: {inspection: '123', basetype: 'smallint'}},
  ], pageState);
  const modules = render.buildModulesCollectionState([
    {
      owner: {inspection: 'Kernel', basetype: 'object', oop: 1},
      module: {inspection: 'Enumerable', basetype: 'object', oop: 2},
    },
  ], pageState);

  assert.equal(instances.summaryText, '1-2 of 5 instances');
  assert.equal(instances.rows[0].chipText, 'anObject');
  assert.equal(constants.rows[0].value.kind, 'text');
  assert.equal(modules.rows[0].owner.kind, 'object');
  assert.equal(modules.summaryText, '1-2 of 5 included modules');
});
