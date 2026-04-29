const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/taskbar_runtime.js');

test('taskbar runtime builds shell exports from override', () => {
  const taskbarRuntime = runtime.createTaskbarRuntime({
    sanitizeConnectionOverride(override) {
      return override || null;
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
  });

  const shell = taskbarRuntime.buildShellForOverride({
    stone: 'gs64stone',
    host: 'local host',
    netldi: '50377',
    gemService: 'gemnetobject',
  });

  assert.equal(
    shell,
    "export GS_STONE=gs64stone\nexport GS_HOST='local host'\nexport GS_NETLDI=50377\nexport GS_GEM_SERVICE=gemnetobject"
  );
});

test('taskbar runtime tracks halted threads and status history', () => {
  const persisted = [];
  const taskbarRuntime = runtime.createTaskbarRuntime({
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
  });

  taskbarRuntime.setLatestHaltedThreads([{oop: 1}, {oop: 2}]);
  taskbarRuntime.recordStatusEntry(false, 'boom');
  taskbarRuntime.recordStatusEntry(true, 'ok');

  assert.equal(taskbarRuntime.getHaltedThreadCount(), 2);
  assert.deepEqual(taskbarRuntime.getStatusHistorySummary(), {ok: 1, error: 1});
});
