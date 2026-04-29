const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/desktop_status_runtime.js');

function createElement(tagName = 'div') {
  return {
    tagName,
    id: '',
    className: '',
    textContent: '',
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    querySelector(selector) {
      if (selector === '.win-title') return this.__titleEl || null;
      return null;
    },
  };
}

test('desktop status runtime records status and resolves the focused source window', () => {
  const focusedWindow = createElement('div');
  focusedWindow.id = 'win-1';
  focusedWindow.__titleEl = { textContent: ' About ' };
  const statusDotEl = createElement('span');
  const statusTextEl = createElement('span');
  const entries = [];

  const statusRuntime = runtime.createDesktopStatusRuntime({
    document: {
      querySelector(selector) {
        assert.equal(selector, '.win.focused');
        return focusedWindow;
      },
    },
    statusDotEl,
    statusTextEl,
    readWindowState(id) {
      assert.equal(id, 'win-1');
      return { kind: 'about' };
    },
    recordStatusEntry(ok, msg) {
      entries.push({ ok, msg });
    },
  });

  assert.deepEqual(statusRuntime.currentStatusSource(), {
    sourceWindowId: 'win-1',
    sourceTitle: 'About',
    sourceKind: 'about',
  });

  statusRuntime.setStatus(false, 'failed');
  assert.equal(statusDotEl.className, 'error');
  assert.equal(statusTextEl.textContent, 'failed');
  assert.deepEqual(entries, [{ ok: false, msg: 'failed' }]);
});

test('desktop status runtime loads and renders runtime version information', async () => {
  const taskbarVersionEl = createElement('span');
  let loaded = null;

  const statusRuntime = runtime.createDesktopStatusRuntime({
    taskbarVersionEl,
    async fetchVersion() {
      return { success: true, app: '2.0', stone: '3.7.4.3' };
    },
    onRuntimeVersionLoaded(value) {
      loaded = value;
    },
  });

  const result = await statusRuntime.loadRuntimeVersionInfo();
  assert.equal(taskbarVersionEl.textContent, 'Explorer 2.0 · GemStone 3.7.4.3');
  assert.equal(loaded.app, '2.0');
  assert.equal(result.stone, '3.7.4.3');
});
