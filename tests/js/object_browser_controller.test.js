const test = require('node:test');
const assert = require('node:assert/strict');

const objectBrowserController = require('../../static/js/object_browser_controller.js');

class FakeNode {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  trigger(type, event = {}) {
    const handler = this.listeners.get(type);
    if (handler) handler(event);
  }
}

test('object browser controller binds core actions', () => {
  let calls = 0;
  const tabsStrip = new FakeNode();
  const tab = {dataset: {itab: 'code'}};
  const els = {
    tabsStrip,
    openBrowserBtn: new FakeNode(),
    closeMethodBrowserBtn: new FakeNode(),
    evalBtn: new FakeNode(),
    evalCode: new FakeNode(),
    abortBtn: new FakeNode(),
    commitBtn: new FakeNode(),
    continueBtn: new FakeNode(),
  };

  objectBrowserController.bindObjectBrowserCoreActions(els, {
    onActivateTab: tabId => {
      calls += 1;
      assert.equal(tabId, 'code');
    },
    onOpenClassBrowser: () => { calls += 1; },
    onCloseMethodBrowser: () => { calls += 1; },
    onEvaluate: () => { calls += 1; },
    onAbort: () => { calls += 1; },
    onCommit: () => { calls += 1; },
    onContinue: () => { calls += 1; },
  });

  tabsStrip.trigger('click', {target: {closest: selector => selector === '.inspector-tab' ? tab : null}});
  els.openBrowserBtn.trigger('click');
  els.closeMethodBrowserBtn.trigger('click');
  els.evalBtn.trigger('click');
  els.evalCode.trigger('keydown', {ctrlKey: true, key: 'Enter'});
  els.abortBtn.trigger('click');
  els.commitBtn.trigger('click');
  els.continueBtn.trigger('click');

  assert.equal(calls, 8);
});

test('object browser controller binds method browser category and selector actions', () => {
  let events = 0;
  const categoriesEl = new FakeNode();
  const selectorsEl = new FakeNode();

  objectBrowserController.bindObjectBrowserMethodBrowserActions({
    categoriesEl,
    selectorsEl,
  }, {
    onSelectCategory: category => {
      events += 1;
      assert.equal(category, 'accessing');
    },
    onSelectSelector: selector => {
      events += 1;
      assert.equal(selector, 'printString');
    },
    onOpenSelector: selector => {
      events += 1;
      assert.equal(selector, 'printString');
    },
  });

  categoriesEl.trigger('click', {target: {closest: selector => selector === '.mb-cat[data-category]' ? {dataset: {category: 'accessing'}} : null}});
  selectorsEl.trigger('click', {target: {closest: selector => selector === '.mb-sel[data-selector]' ? {dataset: {selector: 'printString'}} : null}});
  selectorsEl.trigger('dblclick', {target: {closest: selector => selector === '.mb-sel[data-selector]' ? {dataset: {selector: 'printString'}} : null}});

  assert.equal(events, 3);
});
