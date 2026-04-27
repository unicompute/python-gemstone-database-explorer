const test = require('node:test');
const assert = require('node:assert/strict');

const windowLinksWindowController = require('../../static/js/window_links_window_controller.js');

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

test('window links controller binds toolbar actions and endpoint handlers', () => {
  let filterCalls = 0;
  let linkType = '';
  let viewMode = '';
  let endpoint = null;
  const filterInput = new FakeNode();
  const scope = new FakeNode();
  const viewScope = new FakeNode();
  const copyBtn = new FakeNode();
  const list = new FakeNode();
  scope.children['[data-link-type]'] = [new FakeNode({linkType: 'all'}), new FakeNode({linkType: 'arrow'})];
  viewScope.children['[data-view-mode]'] = [new FakeNode({viewMode: 'all'}), new FakeNode({viewMode: 'related'})];
  list.children['[data-link-row-index]'] = [new FakeNode({linkRowIndex: '1'})];
  list.children['[data-link-index]'] = [new FakeNode({linkIndex: '1', linkEndpoint: 'to'})];

  windowLinksWindowController.bindWindowLinksToolbarActions({
    filterInput,
    scope,
    viewScope,
    copyBtn,
  }, {
    onFilterInput() { filterCalls += 1; },
    onLinkTypeChange(nextType) { linkType = nextType; },
    onViewModeChange(nextMode) { viewMode = nextMode; },
    onCopy() { filterCalls += 10; },
  });
  windowLinksWindowController.bindWindowLinkListActions(list, {
    onEndpointClick(payload) { endpoint = payload; },
  });

  filterInput.trigger('input');
  scope.children['[data-link-type]'][1].trigger('click');
  viewScope.children['[data-view-mode]'][1].trigger('click');
  copyBtn.trigger();
  list.children['[data-link-index]'][0].trigger('click');

  assert.equal(filterCalls, 11);
  assert.equal(linkType, 'arrow');
  assert.equal(viewMode, 'related');
  assert.deepEqual(endpoint, {index: 1, endpoint: 'to'});
});

test('window links controller applies button and scope state', () => {
  const filterInput = new FakeNode();
  const scope = new FakeNode();
  const viewScope = new FakeNode();
  const raiseSelectedBtn = new FakeNode();
  const closeSelectedBtn = new FakeNode();
  const copyBtn = new FakeNode();
  const downloadBtn = new FakeNode();
  const allBtn = new FakeNode({linkType: 'all'});
  const sourceBtn = new FakeNode({linkType: 'source'});
  const allModeBtn = new FakeNode({viewMode: 'all'});
  const relatedModeBtn = new FakeNode({viewMode: 'related'});
  scope.children['[data-link-type]'] = [allBtn, sourceBtn];
  viewScope.children['[data-view-mode]'] = [allModeBtn, relatedModeBtn];

  windowLinksWindowController.applyWindowLinksToolbarState({
    filterInput,
    scope,
    viewScope,
    raiseSelectedBtn,
    closeSelectedBtn,
    copyBtn,
    downloadBtn,
  }, {
    filterText: 'about',
    linkType: 'source',
    viewMode: 'related',
    hasSourceWindow: true,
    raiseSelectedDisabled: false,
    closeSelectedDisabled: true,
    copyLabel: 'Copy Visible JSON',
    downloadLabel: 'Download Visible JSON',
  });

  assert.equal(filterInput.value, 'about');
  assert.equal(sourceBtn.classSet.has('active'), true);
  assert.equal(allBtn.classSet.has('active'), false);
  assert.equal(relatedModeBtn.classSet.has('active'), true);
  assert.equal(relatedModeBtn.disabled, false);
  assert.equal(raiseSelectedBtn.disabled, false);
  assert.equal(closeSelectedBtn.disabled, true);
  assert.equal(copyBtn.textContent, 'Copy Visible JSON');
  assert.equal(downloadBtn.textContent, 'Download Visible JSON');
});
