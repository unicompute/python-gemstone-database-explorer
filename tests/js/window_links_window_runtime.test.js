const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/window_links_window_runtime.js');

test('window links runtime mounts and raises the selected link group', () => {
  const states = [];
  let toolbarHandlers = null;
  const raised = [];
  const meta = {textContent: ''};
  const list = {
    innerHTML: '',
    querySelector() {
      return null;
    },
  };

  runtime.createWindowLinksWindowRuntime({
    id: 'links-1',
    options: {sourceWindowId: 'workspace-1'},
    filterInput: {value: '', addEventListener() {}},
    scope: {},
    viewScope: {},
    meta,
    list,
    buttons: {
      raiseSelectedBtn: {},
      closeSelectedBtn: {},
      copyBtn: {textContent: ''},
      downloadBtn: {textContent: ''},
      refreshBtn: {},
    },
    windowState: new Map([['workspace-1', {title: 'Workspace'}]]),
    upsertWindowState(id, state) {
      states.push({id, state});
    },
    collectOpenWindowSummaries() {
      return [{id: 'workspace-1', title: 'Workspace'}, {id: 'object-1', title: 'Object'}];
    },
    collectWindowLinkSummaries() {
      return [{fromId: 'workspace-1', toId: 'object-1', fromTitle: 'Workspace', toTitle: 'Object', type: 'source'}];
    },
    scopeWindowLinks(links) {
      return links;
    },
    filterWindowLinks(links) {
      return links;
    },
    isWindowLinksViewFiltered() {
      return false;
    },
    buildWindowLinksExportPayload() {
      return {};
    },
    buildWindowLinksWindowView() {
      return {
        metaText: '1 link',
        copyLabel: 'Copy JSON',
        downloadLabel: 'Download JSON',
        raiseSelectedDisabled: false,
        closeSelectedDisabled: false,
        listHtml: '<div>link rows</div>',
      };
    },
    applyWindowLinksToolbarState() {},
    bindWindowLinksToolbarActions(_buttons, handlers) {
      toolbarHandlers = handlers;
    },
    bindWindowLinkListActions() {},
    getRelatedWindowIds(seedId) {
      if (seedId === 'workspace-1' || seedId === 'object-1') return ['workspace-1', 'object-1'];
      return [];
    },
    sanitizeSelectionIndex(index) {
      return Number(index) || 0;
    },
    revealWindow() {},
    raiseWindowGroupByIds(memberIds, seedId) {
      raised.push({memberIds, seedId});
      return true;
    },
    closeWindowGroupByIds() {
      return false;
    },
    copyTextToClipboard() {
      return Promise.resolve();
    },
    downloadDataFile() {},
    setStatus() {},
    liveWindowRenderers: new Map(),
    notifyLiveWindowUpdated() {},
    arrows: [],
    documentObj: {
      getElementById(id) {
        return id === 'workspace-1' || id === 'object-1' ? {id} : null;
      },
    },
    escHtml(value) {
      return String(value ?? '');
    },
  }).mount();

  assert.equal(meta.textContent, '1 link');
  assert.equal(list.innerHTML, '<div>link rows</div>');
  assert.equal(states.at(-1).state.kind, 'window-links');

  toolbarHandlers.onRaiseSelected();
  assert.deepEqual(raised, [{
    memberIds: ['workspace-1', 'object-1'],
    seedId: 'object-1',
  }]);
});
