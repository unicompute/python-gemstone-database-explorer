const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/window_groups_window_runtime.js');

test('window groups runtime mounts and raises the largest visible group', () => {
  const states = [];
  let toolbarHandlers = null;
  const raised = [];
  const meta = {textContent: ''};
  const list = {innerHTML: ''};
  const groups = [
    {
      primaryId: 'workspace-1',
      primaryTitle: 'Workspace',
      size: 2,
      members: [{id: 'workspace-1'}, {id: 'object-1'}],
    },
  ];

  runtime.createWindowGroupsWindowRuntime({
    id: 'groups-1',
    options: {viewMode: 'all'},
    filterInput: {value: '', addEventListener() {}},
    scope: {},
    meta,
    list,
    buttons: {
      raiseLargestBtn: {},
      closeLargestBtn: {},
      copyBtn: {textContent: ''},
      downloadBtn: {textContent: ''},
      refreshBtn: {},
    },
    windowState: new Map(),
    upsertWindowState(id, state) {
      states.push({id, state});
    },
    collectOpenWindowSummaries() {
      return [{id: 'workspace-1'}, {id: 'object-1'}];
    },
    collectWindowGroupSummaries() {
      return groups;
    },
    filterWindowGroups() {
      return groups;
    },
    isWindowGroupsViewFiltered() {
      return false;
    },
    buildWindowGroupsExportPayload() {
      return {};
    },
    buildWindowGroupsWindowView() {
      return {
        metaText: '1 group',
        copyLabel: 'Copy JSON',
        downloadLabel: 'Download JSON',
        raiseLargestDisabled: false,
        closeLargestDisabled: false,
        listHtml: '<div>group rows</div>',
      };
    },
    applyWindowGroupsToolbarState() {},
    bindWindowGroupsToolbarActions(_buttons, handlers) {
      toolbarHandlers = handlers;
    },
    bindWindowGroupListActions() {},
    getRelatedWindowIds(seedId) {
      return seedId ? ['workspace-1', 'object-1'] : [];
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
    escHtml(value) {
      return String(value ?? '');
    },
  }).mount();

  assert.equal(meta.textContent, '1 group');
  assert.equal(list.innerHTML, '<div>group rows</div>');
  assert.equal(states.at(-1).state.kind, 'window-groups');

  toolbarHandlers.onRaiseLargest();
  assert.deepEqual(raised, [{
    memberIds: ['workspace-1', 'object-1'],
    seedId: 'workspace-1',
  }]);
});
