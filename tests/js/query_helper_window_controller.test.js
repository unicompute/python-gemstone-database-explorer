const test = require('node:test');
const assert = require('node:assert/strict');

const queryHelperWindowController = require('../../static/js/query_helper_window_controller.js');

class FakeNode {
  constructor() {
    this.disabled = false;
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

test('query helper controller binds toolbar actions', () => {
  let count = 0;
  const buttons = {
    loadBtn: new FakeNode(),
    openBtn: new FakeNode(),
    compareBtn: new FakeNode(),
    inspectBtn: new FakeNode(),
  };

  queryHelperWindowController.bindQueryHelperToolbarActions(buttons, {
    onLoad() { count += 1; },
    onOpen() { count += 10; },
    onCompare() { count += 100; },
    onInspect() { count += 1000; },
  });

  buttons.loadBtn.trigger();
  buttons.openBtn.trigger();
  buttons.compareBtn.trigger();
  buttons.inspectBtn.trigger();

  assert.equal(count, 1111);
});

test('query helper controller applies button disabled state', () => {
  const buttons = {
    loadBtn: new FakeNode(),
    openBtn: new FakeNode(),
    compareBtn: new FakeNode(),
    inspectBtn: new FakeNode(),
  };

  queryHelperWindowController.applyQueryHelperActionState(buttons, {
    loadDisabled: true,
    openDisabled: false,
    compareDisabled: true,
    inspectDisabled: false,
  });

  assert.equal(buttons.loadBtn.disabled, true);
  assert.equal(buttons.openBtn.disabled, false);
  assert.equal(buttons.compareBtn.disabled, true);
  assert.equal(buttons.inspectBtn.disabled, false);
});
