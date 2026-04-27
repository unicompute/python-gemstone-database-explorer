const test = require('node:test');
const assert = require('node:assert/strict');

const dockLauncherController = require('../../static/js/dock_launcher_controller.js');

class FakeNode {
  constructor() {
    this.listeners = new Map();
    this.classes = new Set();
    this.attributes = new Map();
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  trigger(type, event = {}) {
    const handler = this.listeners.get(type);
    if (handler) handler(event);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  get classList() {
    return {
      toggle: (name, enabled) => {
        if (enabled) this.classes.add(name);
        else this.classes.delete(name);
      },
    };
  }
}

test('dock launcher controller binds toggle, filter, command, submit, and escape actions', () => {
  let events = 0;
  const toggleBtn = new FakeNode();
  const panel = new FakeNode();
  const documentNode = new FakeNode();

  dockLauncherController.bindDockLauncherActions({toggleBtn, panel, documentNode}, {
    onToggle: () => { events += 1; },
    onShortcutOpen: () => { events += 1; },
    onPinToggle: command => {
      events += 1;
      assert.equal(command, 'open-about');
    },
    onCommand: (command, value) => {
      events += 1;
      assert.equal(command, 'focus-window');
      assert.equal(value, 'win-1');
    },
    onFilter: value => {
      events += 1;
      assert.equal(value, 'work');
    },
    onMove: key => {
      events += 1;
      assert.equal(key, 'ArrowDown');
    },
    onSubmit: value => {
      events += 1;
      assert.equal(value, 'work');
    },
    onEscape: () => { events += 1; },
  });

  documentNode.trigger('keydown', {
    key: '/',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    defaultPrevented: false,
    target: {closest: () => null},
  });
  toggleBtn.trigger('click', {preventDefault() {}});
  panel.trigger('click', {target: {closest: selector => selector === '[data-launcher-pin-command]' ? {dataset: {launcherPinCommand: 'open-about'}} : null}});
  panel.trigger('click', {target: {closest: selector => selector === '[data-launcher-command]' ? {dataset: {launcherCommand: 'focus-window', launcherValue: 'win-1'}} : null}});
  panel.trigger('input', {target: {closest: selector => selector === '.dock-launcher-search' ? {value: 'work'} : null}});
  panel.trigger('keydown', {key: 'ArrowDown', target: {closest: selector => selector === '.dock-launcher-search' ? {value: 'work'} : null}});
  panel.trigger('keydown', {key: 'Enter', target: {closest: selector => selector === '.dock-launcher-search' ? {value: 'work'} : null}});
  panel.trigger('keydown', {key: 'Escape', target: {closest: () => null}});

  assert.equal(events, 8);
});

test('dock launcher controller applies open state to button and panel', () => {
  const toggleBtn = new FakeNode();
  const panel = new FakeNode();

  dockLauncherController.applyDockLauncherState(toggleBtn, panel, true);
  assert.equal(toggleBtn.attributes.get('aria-expanded'), 'true');
  assert.equal(panel.attributes.get('aria-hidden'), 'false');
  assert.equal(toggleBtn.classes.has('active'), true);
  assert.equal(panel.classes.has('open'), true);

  dockLauncherController.applyDockLauncherState(toggleBtn, panel, false);
  assert.equal(toggleBtn.attributes.get('aria-expanded'), 'false');
  assert.equal(panel.attributes.get('aria-hidden'), 'true');
  assert.equal(toggleBtn.classes.has('active'), false);
  assert.equal(panel.classes.has('open'), false);
});
