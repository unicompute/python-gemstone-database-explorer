const test = require('node:test');
const assert = require('node:assert/strict');

const classBrowserController = require('../../static/js/class_browser_controller.js');

class FakeNode {
  constructor() {
    this.disabled = false;
    this.title = '';
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  trigger(type = 'click') {
    const handler = this.listeners.get(type);
    if (handler) handler({currentTarget: this});
  }
}

test('class browser controller binds toolbar actions', () => {
  let events = 0;
  const els = {
    find: new FakeNode(),
    findDictionary: new FakeNode(),
    addDictionary: new FakeNode(),
    renameDictionary: new FakeNode(),
    removeDictionary: new FakeNode(),
    addClass: new FakeNode(),
    renameClass: new FakeNode(),
    addCategory: new FakeNode(),
    renameCategory: new FakeNode(),
    addInstVar: new FakeNode(),
    addClassVar: new FakeNode(),
    addClassInstVar: new FakeNode(),
    renameVar: new FakeNode(),
    removeVar: new FakeNode(),
    moveClass: new FakeNode(),
    removeClass: new FakeNode(),
    refresh: new FakeNode(),
    browseClass: new FakeNode(),
    browseCategory: new FakeNode(),
    browseMethod: new FakeNode(),
    newMethod: new FakeNode(),
    moveMethod: new FakeNode(),
    removeMethod: new FakeNode(),
    removeCategory: new FakeNode(),
    hierarchy: new FakeNode(),
    versions: new FakeNode(),
    references: new FakeNode(),
    methodText: new FakeNode(),
    inspectDictionary: new FakeNode(),
    inspectClass: new FakeNode(),
    inspectMethod: new FakeNode(),
    inspectInstances: new FakeNode(),
    senders: new FakeNode(),
    implementors: new FakeNode(),
    fileOut: new FakeNode(),
    createAccessors: new FakeNode(),
    continueTx: new FakeNode(),
    abortTx: new FakeNode(),
    commit: new FakeNode(),
    compile: new FakeNode(),
    autoCommit: new FakeNode(),
    meta: new FakeNode(),
  };

  classBrowserController.bindClassBrowserToolbarActions(els, Object.fromEntries([
    'onFindClass',
    'onFindDictionary',
    'onAddDictionary',
    'onRenameDictionary',
    'onRemoveDictionary',
    'onAddClass',
    'onRenameClass',
    'onAddCategory',
    'onRenameCategory',
    'onAddInstVar',
    'onAddClassVar',
    'onAddClassInstVar',
    'onRenameVar',
    'onRemoveVar',
    'onMoveClass',
    'onRemoveClass',
    'onRefresh',
    'onBrowseClass',
    'onBrowseCategory',
    'onBrowseMethod',
    'onNewMethod',
    'onMoveMethod',
    'onRemoveMethod',
    'onRemoveCategory',
    'onHierarchy',
    'onVersions',
    'onReferences',
    'onMethodText',
    'onInspectDictionary',
    'onInspectClass',
    'onInspectMethod',
    'onInspectInstances',
    'onSenders',
    'onImplementors',
    'onFileOut',
    'onCreateAccessors',
    'onContinueTx',
    'onAbortTx',
    'onCommit',
    'onCompile',
    'onAutoCommitChange',
    'onMetaChange',
  ].map(name => [name, () => { events += 1; } ])));

  Object.values(els).forEach(node => node.trigger(node === els.autoCommit || node === els.meta ? 'change' : 'click'));
  assert.equal(events, 42);
});

test('class browser controller applies disabled state and titles', () => {
  const els = {
    renameDictionary: new FakeNode(),
    inspectClass: new FakeNode(),
    versions: new FakeNode(),
  };

  classBrowserController.applyClassBrowserActionState(els, {
    renameDictionary: {enabled: false, title: 'Select a dictionary first'},
    inspectClass: {enabled: true, title: ''},
    versions: {enabled: false, title: 'Select a method first'},
  });

  assert.equal(els.renameDictionary.disabled, true);
  assert.equal(els.renameDictionary.title, 'Select a dictionary first');
  assert.equal(els.inspectClass.disabled, false);
  assert.equal(els.inspectClass.title, '');
  assert.equal(els.versions.disabled, true);
  assert.equal(els.versions.title, 'Select a method first');
});
