const test = require('node:test');
const assert = require('node:assert/strict');

const dockContextMenuController = require('../../static/js/dock_context_menu_controller.js');

class FakeNode {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.listeners = new Map();
    this.attributes = new Map();
    this.classes = new Set();
    this.disabled = false;
    this.parentTarget = null;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  contains(target) {
    return target === this || target === this.parentTarget;
  }

  trigger(type, event = {}) {
    const handler = this.listeners.get(type);
    if (handler) handler(event);
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

test('dock context menu controller binds open, command, outside-close, and escape actions', () => {
  let openedId = '';
  let command = '';
  let closed = 0;
  let escaped = 0;
  const triggerBtn = new FakeNode();
  triggerBtn.id = 'taskbar-launch-workspace';
  const menu = new FakeNode();
  const documentNode = new FakeNode();
  let open = true;

  dockContextMenuController.bindDockContextMenuActions({
    menu,
    documentNode,
    triggerButtons: [triggerBtn],
  }, {
    isOpen() { return open; },
    onOpen(btn) { openedId = btn.id; },
    onCommand(nextCommand) { command = nextCommand; },
    onClose() { closed += 1; open = false; },
    onEscape() { escaped += 1; open = false; },
  });

  triggerBtn.trigger('contextmenu', {preventDefault() {}});
  menu.trigger('click', {
    target: {
      closest(selector) {
        if (selector === '[data-dock-context-command]') {
          return {dataset: {dockContextCommand: 'raise-all'}, disabled: false};
        }
        return null;
      },
    },
  });
  documentNode.trigger('mousedown', {target: {}});
  open = true;
  documentNode.trigger('keydown', {key: 'Escape'});

  assert.equal(openedId, 'taskbar-launch-workspace');
  assert.equal(command, 'raise-all');
  assert.equal(closed, 1);
  assert.equal(escaped, 1);
});

test('dock context menu controller applies open state to the menu', () => {
  const menu = new FakeNode();

  dockContextMenuController.applyDockContextMenuState(menu, true);
  assert.equal(menu.attributes.get('aria-hidden'), 'false');
  assert.equal(menu.classes.has('open'), true);

  dockContextMenuController.applyDockContextMenuState(menu, false);
  assert.equal(menu.attributes.get('aria-hidden'), 'true');
  assert.equal(menu.classes.has('open'), false);
});
