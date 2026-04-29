const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/taskbar_state_runtime.js');

test('taskbar state runtime persists connection overrides and renders the badge', () => {
  let currentOverride = null;
  let uiChanged = 0;
  let liveUpdates = 0;
  let remembered = null;
  const button = {
    style: { display: '' },
    textContent: '',
    title: '',
  };

  const taskbarStateRuntime = runtime.createTaskbarStateRuntime({
    localStorage: {
      setItem(_key, value) {
        currentOverride = JSON.parse(value);
      },
      removeItem() {
        currentOverride = null;
      },
    },
    taskbarConnectionOverrideButton: button,
    connectionOverrideStorageKey: 'override',
    statusHistoryStorageKey: 'status-history',
    sanitizeConnectionOverride(override) {
      return override || null;
    },
    readConnectionOverride() {
      return currentOverride;
    },
    rememberRecentConnectionOverride(override) {
      remembered = override;
    },
    shortLabel(value) {
      return String(value);
    },
    readPersistedStatusHistory() {
      return [];
    },
    writePersistedStatusHistory() {},
    appendStatusHistoryEntry(entries) {
      return entries;
    },
    summarizeStatusHistory() {
      return {};
    },
    getLiveWindowRenderers() {
      return [() => {
        liveUpdates += 1;
      }];
    },
    onUiChanged() {
      uiChanged += 1;
    },
  });

  taskbarStateRuntime.persistConnectionOverride({
    stone: 'gs64stone',
    host: 'localhost',
  });

  assert.deepEqual(currentOverride, { stone: 'gs64stone', host: 'localhost' });
  assert.deepEqual(remembered, { stone: 'gs64stone', host: 'localhost' });
  assert.equal(button.style.display, '');
  assert.equal(button.textContent, 'Target gs64stone');
  assert.equal(button.title, 'stone=gs64stone · host=localhost');
  assert.equal(uiChanged, 1);
  assert.equal(liveUpdates, 1);
});

test('taskbar state runtime tracks halted threads and status history', () => {
  const persisted = [];
  let uiChanged = 0;
  const taskbarStateRuntime = runtime.createTaskbarStateRuntime({
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
      removeItem() {},
    },
    readPersistedStatusHistory() {
      return persisted.slice();
    },
    writePersistedStatusHistory(entries) {
      persisted.splice(0, persisted.length, ...entries);
    },
    appendStatusHistoryEntry(entries, entry) {
      return entries.concat([entry]);
    },
    summarizeStatusHistory(entries) {
      return {
        ok: entries.filter(entry => entry.ok).length,
        error: entries.filter(entry => !entry.ok).length,
      };
    },
    currentStatusSource() {
      return {
        sourceWindowId: 'workspace-1',
        sourceTitle: 'Workspace',
        sourceKind: 'workspace',
      };
    },
    onUiChanged() {
      uiChanged += 1;
    },
    getLiveWindowRenderers() {
      return [];
    },
  });

  taskbarStateRuntime.setLatestHaltedThreads([{ oop: 1 }, { oop: 2 }]);
  taskbarStateRuntime.recordStatusEntry(false, 'boom');
  taskbarStateRuntime.recordStatusEntry(true, 'ok');

  assert.equal(taskbarStateRuntime.getHaltedThreadCount(), 2);
  assert.deepEqual(taskbarStateRuntime.getStatusHistorySummary(), { ok: 1, error: 1 });
  assert.equal(uiChanged, 3);
});
