const test = require('node:test');
const assert = require('node:assert/strict');

const dockWindowPreviewController = require('../../static/js/dock_window_preview_controller.js');

class FakeNode {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.listeners = new Map();
    this.attributes = new Map();
    this.classes = new Set();
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

test('dock window preview controller binds trigger, click, close, and escape actions', () => {
  let openedId = '';
  let closed = 0;
  let clickedId = '';
  let escaped = 0;
  const triggerBtn = new FakeNode();
  triggerBtn.id = 'taskbar-launch-workspace';
  const preview = new FakeNode();
  const documentNode = new FakeNode();
  let open = true;

  dockWindowPreviewController.bindDockWindowPreviewActions({
    preview,
    documentNode,
    triggerButtons: [triggerBtn],
  }, {
    isOpen() { return open; },
    onTriggerEnter(btn) { openedId = btn.id; },
    onTriggerLeave() { closed += 1; },
    onPreviewEnter() { closed += 10; },
    onPreviewLeave() { closed += 100; },
    onWindowClick(windowId) { clickedId = windowId; },
    onClose() { closed += 1000; open = false; },
    onEscape() { escaped += 1; open = false; },
  });

  triggerBtn.trigger('mouseenter', {});
  triggerBtn.trigger('mouseleave', {});
  preview.trigger('mouseenter', {});
  preview.trigger('mouseleave', {});
  preview.trigger('click', {
    target: {
      closest(selector) {
        if (selector === '[data-dock-preview-window-id]') {
          return {dataset: {dockPreviewWindowId: 'win-1'}};
        }
        return null;
      },
    },
  });
  documentNode.trigger('mousedown', {target: {}});
  open = true;
  documentNode.trigger('keydown', {key: 'Escape'});

  assert.equal(openedId, 'taskbar-launch-workspace');
  assert.equal(clickedId, 'win-1');
  assert.equal(closed, 1111);
  assert.equal(escaped, 1);
});

test('dock window preview controller applies open state to preview', () => {
  const preview = new FakeNode();

  dockWindowPreviewController.applyDockWindowPreviewState(preview, true);
  assert.equal(preview.attributes.get('aria-hidden'), 'false');
  assert.equal(preview.classes.has('open'), true);

  dockWindowPreviewController.applyDockWindowPreviewState(preview, false);
  assert.equal(preview.attributes.get('aria-hidden'), 'true');
  assert.equal(preview.classes.has('open'), false);
});
