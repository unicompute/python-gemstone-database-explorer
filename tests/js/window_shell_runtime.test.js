const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/window_shell_runtime.js');

test('window shell runtime computes source-relative positions within viewport bounds', () => {
  const shell = runtime.createWindowShellRuntime({
    document: {
      getElementById(id) {
        assert.equal(id, 'source-1');
        return {
          getBoundingClientRect() {
            return { left: 120, top: 80, right: 420, bottom: 260 };
          },
        };
      },
    },
    window: {
      innerWidth: 800,
      innerHeight: 600,
    },
  });

  assert.deepEqual(
    shell.sourceRelativeWindowPosition('source-1', 320, 240, { dx: 40, dy: -10 }),
    { x: 160, y: 70 },
  );
});

test('window shell runtime tracks cascade state', () => {
  const shell = runtime.createWindowShellRuntime();
  assert.deepEqual(shell.getCascadePosition(), { x: 30, y: 30 });
  shell.setCascadePosition(88, 96);
  assert.deepEqual(shell.getCascadePosition(), { x: 88, y: 96 });
  assert.equal(shell.CASCADE_STEP, 36);
});

test('window shell runtime toggles minimised state and notifies dependents', () => {
  const events = [];
  const win = {
    dataset: { minimised: '1', savedH: '440px' },
    style: { height: '28px' },
    querySelector(selector) {
      if (selector === '.win-body' || selector === '.win-resize') return { style: { display: 'none' } };
      return null;
    },
  };
  const shell = runtime.createWindowShellRuntime({
    redrawArrows() {
      events.push('redraw');
    },
    persistWindowLayout() {
      events.push('persist');
    },
    notifyLiveWindowUpdated() {
      events.push('notify');
    },
  });

  shell.toggleMinimise(win, 'win-1');
  assert.equal(win.dataset.minimised, '0');
  assert.equal(win.style.height, '440px');
  assert.deepEqual(events, ['redraw', 'persist', 'notify']);
});
