const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/status_log_window_runtime.js');

test('status log runtime mounts, syncs state, and rerenders on level changes', () => {
  const states = [];
  let toolbarHandlers = null;
  let cleared = 0;
  const meta = {textContent: ''};
  const list = {innerHTML: ''};

  runtime.createStatusLogWindowRuntime({
    id: 'status-1',
    options: {filterText: 'warn', level: 'error', sourceWindowId: 'about-1'},
    filterInput: {value: '', addEventListener() {}},
    scope: {},
    meta,
    list,
    buttons: {
      clearBtn: {},
      copyBtn: {textContent: ''},
      downloadBtn: {textContent: ''},
    },
    windowState: new Map(),
    upsertWindowState(id, state) {
      states.push({id, state});
    },
    normalizeStatusLogLevel(level) {
      return level === 'ok' || level === 'error' ? level : 'all';
    },
    getStatusHistory() {
      return [{message: 'boom', ok: false}];
    },
    buildStatusLogViewState(_entries, state) {
      return {
        metaText: `${state.level}:${state.filterText}`,
        copyLabel: 'Copy JSON',
        downloadLabel: 'Download JSON',
        reversedEntries: [{message: 'boom', ok: false}],
        totalCount: 1,
        exportFiltered: state.level !== 'all' || !!state.filterText,
      };
    },
    statusEntriesForExportModel() {
      return [{message: 'boom'}];
    },
    buildStatusLogWindowView(viewState) {
      return {
        metaText: viewState.metaText,
        copyLabel: viewState.copyLabel,
        downloadLabel: viewState.downloadLabel,
        listHtml: '<div>status rows</div>',
      };
    },
    applyStatusLogToolbarState() {},
    bindStatusLogToolbarActions(_buttons, handlers) {
      toolbarHandlers = handlers;
    },
    bindStatusLogSourceButtons() {},
    resolveStatusEntrySourceWindow() {
      return null;
    },
    formatStatusTimestampModel() {
      return '';
    },
    revealWindow() {},
    clearStatusHistory() {
      cleared += 1;
    },
    copyTextToClipboard() {
      return Promise.resolve();
    },
    downloadDataFile() {},
    setStatus() {},
    liveWindowRenderers: new Map(),
    escHtml(value) {
      return String(value ?? '');
    },
  }).mount();

  assert.equal(meta.textContent, 'error:warn');
  assert.equal(list.innerHTML, '<div>status rows</div>');
  assert.equal(states.at(-1).state.kind, 'status-log');

  toolbarHandlers.onLevelChange('ok');
  assert.equal(meta.textContent, 'ok:warn');

  toolbarHandlers.onClear();
  assert.equal(cleared, 1);
});
