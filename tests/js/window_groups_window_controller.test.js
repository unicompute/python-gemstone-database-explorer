const test = require('node:test');
const assert = require('node:assert/strict');

const windowGroupsWindowController = require('../../static/js/window_groups_window_controller.js');

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
    if (handler) handler({currentTarget: this, stopPropagation() {}});
  }

  classList = {
    toggle: (name, active) => {
      if (active) this.classSet.add(name);
      else this.classSet.delete(name);
    },
  };
}

test('window groups controller binds toolbar actions and group controls', () => {
  let filterCalls = 0;
  let viewMode = '';
  let memberId = '';
  let raisedSeed = '';
  const filterInput = new FakeNode();
  const scope = new FakeNode();
  const copyBtn = new FakeNode();
  const list = new FakeNode();
  scope.children['[data-view-mode]'] = [new FakeNode({viewMode: 'all'}), new FakeNode({viewMode: 'linked'})];
  list.children['[data-window-id]'] = [new FakeNode({windowId: 'win-about'})];
  list.children['[data-group-seed-id]'] = [new FakeNode({groupSeedId: 'win-about'})];
  list.children['[data-close-group-seed-id]'] = [new FakeNode({closeGroupSeedId: 'win-about'})];

  windowGroupsWindowController.bindWindowGroupsToolbarActions({
    filterInput,
    scope,
    copyBtn,
  }, {
    onFilterInput() { filterCalls += 1; },
    onViewModeChange(nextMode) { viewMode = nextMode; },
    onCopy() { filterCalls += 10; },
  });
  windowGroupsWindowController.bindWindowGroupListActions(list, {
    onMemberClick(id) { memberId = id; },
    onRaiseGroup(seedId) { raisedSeed = seedId; },
  });

  filterInput.trigger('input');
  scope.children['[data-view-mode]'][1].trigger('click');
  copyBtn.trigger();
  list.children['[data-window-id]'][0].trigger('click');
  list.children['[data-group-seed-id]'][0].trigger('click');

  assert.equal(filterCalls, 11);
  assert.equal(viewMode, 'linked');
  assert.equal(memberId, 'win-about');
  assert.equal(raisedSeed, 'win-about');
});

test('window groups controller applies button and scope state', () => {
  const filterInput = new FakeNode();
  const scope = new FakeNode();
  const raiseLargestBtn = new FakeNode();
  const closeLargestBtn = new FakeNode();
  const copyBtn = new FakeNode();
  const downloadBtn = new FakeNode();
  const allBtn = new FakeNode({viewMode: 'all'});
  const linkedBtn = new FakeNode({viewMode: 'linked'});
  scope.children['[data-view-mode]'] = [allBtn, linkedBtn];

  windowGroupsWindowController.applyWindowGroupsToolbarState({
    filterInput,
    scope,
    raiseLargestBtn,
    closeLargestBtn,
    copyBtn,
    downloadBtn,
  }, {
    filterText: 'about',
    viewMode: 'linked',
    raiseLargestDisabled: false,
    closeLargestDisabled: true,
    copyLabel: 'Copy Visible JSON',
    downloadLabel: 'Download Visible JSON',
  });

  assert.equal(filterInput.value, 'about');
  assert.equal(allBtn.classSet.has('active'), false);
  assert.equal(linkedBtn.classSet.has('active'), true);
  assert.equal(raiseLargestBtn.disabled, false);
  assert.equal(closeLargestBtn.disabled, true);
  assert.equal(copyBtn.textContent, 'Copy Visible JSON');
  assert.equal(downloadBtn.textContent, 'Download Visible JSON');
});
