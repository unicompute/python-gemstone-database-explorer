const test = require('node:test');
const assert = require('node:assert/strict');

const aboutWindowController = require('../../static/js/about_window_controller.js');

class FakeButton {
  constructor() {
    this.disabled = false;
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  trigger(type = 'click') {
    const handler = this.listeners.get(type);
    if (handler) handler();
  }
}

test('bindAboutWindowToolbarActions wires about buttons to handlers', () => {
  let openedConnection = 0;
  let copied = 0;
  let refreshed = 0;
  const connectionBtn = new FakeButton();
  const copyBtn = new FakeButton();
  const refreshBtn = new FakeButton();

  aboutWindowController.bindAboutWindowToolbarActions({
    connectionBtn,
    copyBtn,
    refreshBtn,
  }, {
    openAboutConnection() { openedConnection += 1; },
    copyDiagnostics() { copied += 1; },
    refreshAboutInfo() { refreshed += 1; },
  });

  connectionBtn.trigger();
  copyBtn.trigger();
  refreshBtn.trigger();

  assert.equal(openedConnection, 1);
  assert.equal(copied, 1);
  assert.equal(refreshed, 1);
});

test('applyAboutWindowToolbarDisabledState toggles all provided buttons', () => {
  const buttons = {
    connectionBtn: new FakeButton(),
    copyBtn: new FakeButton(),
    downloadBtn: new FakeButton(),
  };

  aboutWindowController.applyAboutWindowToolbarDisabledState(buttons, true);
  assert.equal(buttons.connectionBtn.disabled, true);
  assert.equal(buttons.copyBtn.disabled, true);
  assert.equal(buttons.downloadBtn.disabled, true);

  aboutWindowController.applyAboutWindowToolbarDisabledState(buttons, false);
  assert.equal(buttons.connectionBtn.disabled, false);
  assert.equal(buttons.copyBtn.disabled, false);
  assert.equal(buttons.downloadBtn.disabled, false);
});
