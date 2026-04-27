const test = require('node:test');
const assert = require('node:assert/strict');

const dockLauncherModel = require('../../static/js/dock_launcher_model.js');

class FakeStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

test('dock launcher model falls back to defaults and persists an empty pinned set', () => {
  const storage = new FakeStorage();
  const allowed = ['open-workspace', 'open-about'];

  assert.deepEqual(
    dockLauncherModel.readPinnedCommands(storage, undefined, allowed),
    ['open-workspace']
  );

  dockLauncherModel.writePinnedCommands([], storage, undefined, allowed);

  assert.deepEqual(
    dockLauncherModel.readPinnedCommands(storage, undefined, allowed),
    []
  );
});

test('dock launcher model toggles only allowed commands', () => {
  const allowed = ['open-workspace', 'open-about'];

  assert.deepEqual(
    dockLauncherModel.togglePinnedCommand(['open-workspace'], 'open-about', allowed),
    ['open-workspace', 'open-about']
  );
  assert.deepEqual(
    dockLauncherModel.togglePinnedCommand(['open-workspace', 'open-about'], 'open-about', allowed),
    ['open-workspace']
  );
  assert.deepEqual(
    dockLauncherModel.togglePinnedCommand(['open-workspace'], 'open-unknown', allowed),
    ['open-workspace']
  );
});
