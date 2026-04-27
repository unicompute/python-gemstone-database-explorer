const test = require('node:test');
const assert = require('node:assert/strict');

const statusLogWindowController = require('../../static/js/status_log_window_controller.js');

class FakeNode {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this.classSet = new Set();
    this.listeners = new Map();
    this.children = {};
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  querySelectorAll(selector) {
    return this.children[selector] || [];
  }

  trigger(type = 'click') {
    const handler = this.listeners.get(type);
    if (handler) {
      handler({currentTarget: this, stopPropagation() {}});
    }
  }

  classList = {
    toggle: (name, active) => {
      if (active) this.classSet.add(name);
      else this.classSet.delete(name);
    },
  };
}

test('status log controller binds toolbar actions and level changes', () => {
  let inputCalls = 0;
  let levelSeen = '';
  let copied = 0;
  const filterInput = new FakeNode();
  const clearBtn = new FakeNode();
  const copyBtn = new FakeNode();
  const downloadBtn = new FakeNode();
  const scope = new FakeNode();
  scope.children['[data-level]'] = [new FakeNode({level: 'all'}), new FakeNode({level: 'error'})];

  statusLogWindowController.bindStatusLogToolbarActions({
    filterInput,
    scope,
    clearBtn,
    copyBtn,
    downloadBtn,
  }, {
    onFilterInput() { inputCalls += 1; },
    onLevelChange(level) { levelSeen = level; },
    onClear() { copied += 10; },
    onCopy() { copied += 1; },
    onDownload() { copied += 100; },
  });

  filterInput.trigger('input');
  scope.children['[data-level]'][1].trigger('click');
  clearBtn.trigger();
  copyBtn.trigger();
  downloadBtn.trigger();

  assert.equal(inputCalls, 1);
  assert.equal(levelSeen, 'error');
  assert.equal(copied, 111);
});

test('status log controller applies scope/button state and source button handlers', () => {
  let sourceIndex = null;
  const filterInput = new FakeNode();
  const copyBtn = new FakeNode();
  const downloadBtn = new FakeNode();
  const scope = new FakeNode();
  const allBtn = new FakeNode({level: 'all'});
  const errorBtn = new FakeNode({level: 'error'});
  scope.children['[data-level]'] = [allBtn, errorBtn];
  const list = new FakeNode();
  list.children['[data-source-entry-index]'] = [new FakeNode({sourceEntryIndex: '2'})];

  statusLogWindowController.applyStatusLogToolbarState({
    filterInput,
    scope,
    copyBtn,
    downloadBtn,
  }, {
    filterText: 'about',
    level: 'error',
    copyLabel: 'Copy Visible JSON',
    downloadLabel: 'Download Visible JSON',
  });

  statusLogWindowController.bindStatusLogSourceButtons(list, {
    onSourceClick(index) { sourceIndex = index; },
  });
  list.children['[data-source-entry-index]'][0].trigger();

  assert.equal(filterInput.value, 'about');
  assert.equal(copyBtn.textContent, 'Copy Visible JSON');
  assert.equal(downloadBtn.textContent, 'Download Visible JSON');
  assert.equal(allBtn.classSet.has('active'), false);
  assert.equal(errorBtn.classSet.has('active'), true);
  assert.equal(sourceIndex, 2);
});
