const test = require('node:test');
const assert = require('node:assert/strict');

const workspaceWindowController = require('../../static/js/workspace_window_controller.js');

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

test('workspace window controller binds actions and ctrl-enter submit', () => {
  let count = 0;
  const els = {
    doitBtn: new FakeNode(),
    clearBtn: new FakeNode(),
    codeArea: new FakeNode(),
    abortBtn: new FakeNode(),
    commitBtn: new FakeNode(),
    continueBtn: new FakeNode(),
  };

  workspaceWindowController.bindWorkspaceWindowActions(els, {
    onDoIt() { count += 1; },
    onClear() { count += 10; },
    onInput() { count += 100; },
    onAbort() { count += 1000; },
    onCommit() { count += 10000; },
    onContinue() { count += 100000; },
  });

  els.doitBtn.trigger('click');
  els.clearBtn.trigger('click');
  els.codeArea.trigger('input');
  els.codeArea.trigger('keydown', {ctrlKey: true, key: 'Enter'});
  els.abortBtn.trigger('click');
  els.commitBtn.trigger('click');
  els.continueBtn.trigger('click');

  assert.equal(count, 111112);
});
