const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../../static/js/class_browser_data_model.js');

test('class browser data model builds source and method requests', () => {
  const source = model.buildClassSourceRequest({
    currentDict: 'UserGlobals',
    currentClass: 'Object',
    currentMeta: true,
  }, 'printString');
  const methods = model.buildMethodsRequest({
    currentDict: 'UserGlobals',
    currentClass: 'Object',
    currentProtocol: 'accessing',
    currentMeta: false,
  });

  assert.deepEqual(source.cacheKeyParts, {
    dictionary: 'UserGlobals',
    class: 'Object',
    selector: 'printString',
    meta: 1,
  });
  assert.equal(source.sourceMode, 'method');
  assert.equal(source.sourceLabel, 'Object class >> printString');
  assert.deepEqual(methods.params, {
    dictionary: 'UserGlobals',
    class: 'Object',
    protocol: 'accessing',
    meta: 0,
  });
});

test('class browser data model normalizes pane selections', () => {
  assert.deepEqual(
    model.normalizeMethodsState(['a', 'b'], 'z'),
    {items: ['a', 'b'], currentMethod: null}
  );
  assert.deepEqual(
    model.normalizeProtocolsState([], 'printing'),
    {items: ['-- all --'], currentProtocol: '-- all --'}
  );
  assert.deepEqual(
    model.normalizeClassesState(['Object', 'Behavior'], 'Missing'),
    {items: ['Object', 'Behavior'], currentClass: 'Object'}
  );
  assert.deepEqual(
    model.normalizeDictionariesState(['Globals', 'UserGlobals'], 'Missing'),
    {items: ['Globals', 'UserGlobals'], currentDict: 'Globals'}
  );
});

test('class browser data model normalizes location matches and locate state', () => {
  assert.deepEqual(
    model.normalizeClassLocationMatches({dictionary: 'UserGlobals'}, 'Object'),
    [{className: 'Object', dictionary: 'UserGlobals'}]
  );
  assert.deepEqual(
    model.buildLocateClassState({
      className: 'Object',
      methodName: 'printString',
      meta: true,
      dictionary: 'UserGlobals',
    }),
    {
      currentMeta: true,
      currentDict: 'UserGlobals',
      currentClass: 'Object',
      currentProtocol: '-- all --',
      currentMethod: 'printString',
    }
  );
});

test('class browser data model builds category and selector query payloads', () => {
  const state = {
    currentDict: 'Globals',
    currentClass: 'Object',
    currentMeta: true,
  };
  const results = model.buildCategoryQueryResults(['printString'], state);
  const query = model.buildSelectorQueryRequest(state, 'implementors', 'printString', 'sub');
  const refs = model.buildReferenceQueryRequest(state, 'Object');

  assert.equal(results[0].label, 'Object class>>printString');
  assert.equal(query.mode, 'hierarchyImplementors');
  assert.equal(query.params.rootClassName, 'Object');
  assert.equal(query.params.hierarchyScope, 'sub');
  assert.equal(refs.params.mode, 'references');
});

test('class browser data model snapshots browser selection and rejects scoped queries without a class', () => {
  assert.deepEqual(
    model.snapshotBrowserSelection({
      currentDict: 'Globals',
      currentClass: 'Behavior',
      currentProtocol: 'accessing',
      currentMethod: 'yourself',
      currentMeta: false,
    }),
    {
      dict: 'Globals',
      className: 'Behavior',
      protocol: 'accessing',
      method: 'yourself',
      meta: false,
    }
  );
  assert.equal(
    model.buildSelectorQueryRequest({}, 'senders', 'printString', 'this').error,
    'Select a class first for hierarchy queries'
  );
});

test('class browser data model builds method text, hierarchy, and versions requests', () => {
  assert.deepEqual(
    model.buildMethodTextQueryRequest({
      currentDict: 'Globals',
      currentClass: 'Behavior',
      currentMeta: true,
    }, 'print'),
    {
      params: {
        selector: 'print',
        mode: 'methodText',
        rootClassName: 'Behavior',
        rootDictionary: 'Globals',
        meta: 1,
      },
    }
  );
  assert.deepEqual(
    model.buildHierarchyRequest({
      currentDict: 'Globals',
      currentClass: 'Behavior',
    }),
    {
      cacheKeyParts: {
        class: 'Behavior',
        dictionary: 'Globals',
      },
      params: {
        class: 'Behavior',
        dictionary: 'Globals',
      },
    }
  );
  assert.deepEqual(
    model.buildVersionsRequest({
      currentDict: 'Globals',
      currentClass: 'Behavior',
      currentMethod: 'printString',
      currentMeta: false,
    }),
    {
      cacheKeyParts: {
        class: 'Behavior',
        selector: 'printString',
        meta: 0,
        dictionary: 'Globals',
      },
      params: {
        class: 'Behavior',
        selector: 'printString',
        meta: 0,
        dictionary: 'Globals',
      },
    }
  );
});

test('class browser data model builds file-out and compile state', () => {
  assert.equal(
    model.buildFileOutRequest('method', {
      currentClass: 'Behavior',
      currentMethod: null,
      currentMeta: false,
    }).error,
    'Select a method first'
  );
  assert.deepEqual(
    model.buildFileOutRequest('class', {
      currentDict: 'Globals',
      currentClass: 'Behavior',
      currentMeta: true,
    }),
    {
      params: {
        mode: 'class',
        dictionary: 'Globals',
        class: 'Behavior',
        meta: 1,
      },
    }
  );
  assert.deepEqual(
    model.buildCompileRequest({
      currentDict: 'Globals',
      currentClass: 'Behavior',
      currentProtocol: '-- all --',
      currentMethod: '',
      currentMeta: true,
    }, 'foo ^self', 'method'),
    {
      className: 'Behavior',
      dictionary: 'Globals',
      category: 'as yet unclassified',
      selector: '',
      source: 'foo ^self',
      meta: true,
      sourceKind: 'method',
    }
  );
  assert.deepEqual(
    model.applyCompileResponse({
      currentClass: 'Behavior',
      currentProtocol: 'accessing',
      currentMethod: 'oldName',
      currentMeta: false,
    }, {
      selector: 'newName',
      category: 'printing',
      previousSelector: 'oldName',
      result: 'Compiled',
    }),
    {
      nextState: {
        currentProtocol: 'printing',
        currentMethod: 'newName',
        currentSourceMode: 'method',
      },
      compiledLabel: 'Behavior >> newName',
      compileStatus: 'Compiled (oldName → newName)',
    }
  );
});

test('class browser data model builds transaction specs', () => {
  assert.deepEqual(
    model.buildTransactionActionSpec('continue'),
    {
      path: '/transaction/continue',
      busyMessage: 'Continuing…',
      successMessage: 'Transaction continued',
    }
  );
  assert.equal(model.buildTransactionActionSpec('missing'), null);
});
