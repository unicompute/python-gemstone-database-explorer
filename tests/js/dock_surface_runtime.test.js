const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/dock_surface_runtime.js');

function createClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(value) {
      values.add(value);
    },
    remove(value) {
      values.delete(value);
    },
    contains(value) {
      return values.has(value);
    },
    toggle(value, force) {
      if (force === undefined) {
        if (values.has(value)) values.delete(value);
        else values.add(value);
        return values.has(value);
      }
      if (force) values.add(value);
      else values.delete(value);
      return force;
    },
  };
}

function createTaskbarButton() {
  const labelEl = { textContent: '' };
  const countEl = { textContent: '' };
  const statusBadgeEl = {
    textContent: '',
    title: '',
    dataset: {},
    classList: createClassList(),
  };
  return {
    id: 'taskbar-debugger-btn',
    dataset: {
      windowKinds: 'debugger',
      baseLabel: 'Debugger',
    },
    style: {
      display: '',
    },
    title: '',
    classList: createClassList(),
    querySelector(selector) {
      if (selector === '.taskbar-btn-label') return labelEl;
      if (selector === '.taskbar-btn-count') return countEl;
      if (selector === '.taskbar-btn-status-badge') return statusBadgeEl;
      return null;
    },
    addEventListener() {},
    appendChild() {},
    getBoundingClientRect() {
      return {
        left: 12,
        top: 24,
      };
    },
    __labelEl: labelEl,
    __countEl: countEl,
    __statusBadgeEl: statusBadgeEl,
  };
}

test('dock surface runtime renders grouped taskbar buttons with counts and badges', () => {
  const button = createTaskbarButton();
  const win1 = {
    id: 'debugger-1',
    dataset: { minimised: '0' },
    classList: createClassList(['focused']),
    querySelector(selector) {
      return selector === '.win-title' ? { textContent: 'Debugger 1' } : null;
    },
  };
  const win2 = {
    id: 'debugger-2',
    dataset: { minimised: '1' },
    classList: createClassList(),
    querySelector(selector) {
      return selector === '.win-title' ? { textContent: 'Debugger 2' } : null;
    },
  };

  const dockSurfaceRuntime = runtime.createDockSurfaceRuntime({
    taskbarWindowTypeButtons: [button],
    getOrderedManagedWindows() {
      return [win1, win2];
    },
    readWindowState(id) {
      return id.startsWith('debugger-') ? { kind: 'debugger' } : {};
    },
    getHaltedThreadCount() {
      return 3;
    },
    getStatusErrorCount() {
      return 0;
    },
  });

  dockSurfaceRuntime.renderTaskbarWindowTypeButtons();

  assert.equal(button.__labelEl.textContent, 'Debugger');
  assert.equal(button.__countEl.textContent, '2');
  assert.equal(button.__statusBadgeEl.textContent, '3');
  assert.equal(button.__statusBadgeEl.title, '3 halted threads');
  assert.equal(button.__statusBadgeEl.dataset.tone, 'error');
  assert.equal(button.__statusBadgeEl.classList.contains('visible'), true);
  assert.equal(button.style.display, '');
  assert.equal(button.classList.contains('active'), true);
});
