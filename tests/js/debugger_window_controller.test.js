const test = require('node:test');
const assert = require('node:assert/strict');

const debuggerWindowController = require('../../static/js/debugger_window_controller.js');

class FakeNode {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this.listeners = new Map();
    this.children = {};
    this.queries = {};
    this.classSet = new Set();
    this.style = {};
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  querySelectorAll(selector) {
    return this.children[selector] || [];
  }

  querySelector(selector) {
    return this.queries[selector] || null;
  }

  dispatch(type, event = {}) {
    const handler = this.listeners.get(type);
    if (handler) {
      handler({
        currentTarget: this,
        stopPropagation() {},
        ...event,
      });
    }
  }

  classList = {
    add: name => this.classSet.add(name),
    remove: name => this.classSet.delete(name),
    toggle: (name, active) => {
      if (active) this.classSet.add(name);
      else this.classSet.delete(name);
    },
  };
}

test('debugger controller binds toolbar, tab, and variable actions', () => {
  let tabSeen = '';
  let events = 0;
  let variableSeen = '';
  const tabStrip = new FakeNode();
  const refreshBtn = new FakeNode();
  const proceedBtn = new FakeNode();
  const stepBtn = new FakeNode();
  const stepIntoBtn = new FakeNode();
  const stepOverBtn = new FakeNode();
  const stepReturnBtn = new FakeNode();
  const restartBtn = new FakeNode();
  const trimBtn = new FakeNode();
  const terminateBtn = new FakeNode();
  const copyStackBtn = new FakeNode();
  const copySourceBtn = new FakeNode();
  const varsEl = new FakeNode();
  varsEl.value = 'temp';

  debuggerWindowController.bindDebuggerTabActions(tabStrip, {
    onTabChange(tab) { tabSeen = tab; },
  });
  debuggerWindowController.bindDebuggerToolbarActions({
    refreshBtn,
    proceedBtn,
    stepBtn,
    stepIntoBtn,
    stepOverBtn,
    stepReturnBtn,
    restartBtn,
    trimBtn,
    terminateBtn,
    copyStackBtn,
    copySourceBtn,
  }, {
    onRefresh() { events += 0.5; },
    onProceed() { events += 1; },
    onStep() { events += 5; },
    onStepInto() { events += 10; },
    onStepOver() { events += 100; },
    onStepReturn() { events += 200; },
    onRestart() { events += 500; },
    onTrim() { events += 1000; },
    onTerminate() { events += 2000; },
    onCopyStack() { events += 10000; },
    onCopySource() { events += 20000; },
  });
  debuggerWindowController.bindDebuggerVariableSelector(varsEl, {
    onVariableChange(name) { variableSeen = name; },
  });

  tabStrip.dispatch('click', {target: {closest() { return {dataset: {dtab: 'tls'}}; }}});
  refreshBtn.dispatch('click');
  proceedBtn.dispatch('click');
  stepBtn.dispatch('click');
  stepIntoBtn.dispatch('click');
  stepOverBtn.dispatch('click');
  stepReturnBtn.dispatch('click');
  restartBtn.dispatch('click');
  trimBtn.dispatch('click');
  terminateBtn.dispatch('click');
  copyStackBtn.dispatch('click');
  copySourceBtn.dispatch('click');
  varsEl.dispatch('change');

  assert.equal(tabSeen, 'tls');
  assert.equal(events, 33816.5);
  assert.equal(variableSeen, 'temp');
});

test('debugger controller navigates frames and applies tab/frame state', () => {
  const framesEl = new FakeNode();
  const stackTab = new FakeNode({dtab: 'stack'});
  const tlsTab = new FakeNode({dtab: 'tls'});
  const stackEl = new FakeNode();
  const tlsEl = new FakeNode();
  const body = new FakeNode();
  body.children['.tab-item'] = [stackTab, tlsTab];
  body.queries['#dbg-stack'] = stackEl;
  body.queries['#dbg-tls'] = tlsEl;

  const frame0 = new FakeNode({idx: '0'});
  const frame1 = new FakeNode({idx: '1'});
  const frame2 = new FakeNode({idx: '2'});
  framesEl.children['.dbg-frame-item'] = [frame0, frame1, frame2];

  let selected = null;
  debuggerWindowController.bindDebuggerFrameListActions(framesEl, {
    onFrameSelect(index) { selected = index; },
  });

  framesEl.dispatch('click', {target: {closest() { return frame1; }}});
  assert.equal(selected, 1);

  selected = null;
  framesEl.dispatch('keydown', {
    key: 'End',
    target: {closest() { return frame0; }},
    preventDefault() {},
  });
  assert.equal(selected, 2);

  debuggerWindowController.applyDebuggerFrameSelection(framesEl, 1);
  debuggerWindowController.applyDebuggerTabState(body, 'dbg', 'tls');

  assert.equal(frame0.classSet.has('active'), false);
  assert.equal(frame1.classSet.has('active'), true);
  assert.equal(frame2.classSet.has('active'), false);
  assert.equal(stackTab.classSet.has('active'), false);
  assert.equal(tlsTab.classSet.has('active'), true);
  assert.equal(stackEl.style.display, 'none');
  assert.equal(tlsEl.style.display, 'block');
});

test('debugger controller applies toolbar disabled state', () => {
  const proceedBtn = new FakeNode();
  const refreshBtn = new FakeNode();
  const stepBtn = new FakeNode();
  const stepIntoBtn = new FakeNode();
  const stepOverBtn = new FakeNode();
  const stepReturnBtn = new FakeNode();
  const restartBtn = new FakeNode();
  const trimBtn = new FakeNode();
  const terminateBtn = new FakeNode();
  const copyStackBtn = new FakeNode();
  const copySourceBtn = new FakeNode();

  debuggerWindowController.applyDebuggerToolbarState({
    refreshBtn,
    proceedBtn,
    stepBtn,
    stepIntoBtn,
    stepOverBtn,
    stepReturnBtn,
    restartBtn,
    trimBtn,
    terminateBtn,
    copyStackBtn,
    copySourceBtn,
  }, {
    refreshDisabled: false,
    proceedDisabled: true,
    stepDisabled: true,
    stepIntoDisabled: false,
    stepOverDisabled: true,
    stepReturnDisabled: false,
    restartDisabled: false,
    trimDisabled: true,
    terminateDisabled: false,
    copyStackDisabled: false,
    copySourceDisabled: true,
  });

  assert.equal(refreshBtn.disabled, false);
  assert.equal(proceedBtn.disabled, true);
  assert.equal(stepBtn.disabled, true);
  assert.equal(stepIntoBtn.disabled, false);
  assert.equal(stepOverBtn.disabled, true);
  assert.equal(stepReturnBtn.disabled, false);
  assert.equal(restartBtn.disabled, false);
  assert.equal(trimBtn.disabled, true);
  assert.equal(terminateBtn.disabled, false);
  assert.equal(copyStackBtn.disabled, false);
  assert.equal(copySourceBtn.disabled, true);
});

test('debugger controller binds keyboard shortcuts', () => {
  const root = new FakeNode();
  let events = '';

  debuggerWindowController.bindDebuggerKeyboardActions(root, {
    onRefresh() { events += 'f'; },
    onProceed() { events += 'p'; },
    onStep() { events += 's'; },
    onStepInto() { events += 'i'; },
    onStepOver() { events += 'o'; },
    onStepReturn() { events += 'u'; },
    onRestart() { events += 'r'; },
    onTrim() { events += 't'; },
    onTerminate() { events += 'x'; },
    onCopyStack() { events += 'l'; },
    onCopySource() { events += 'c'; },
  });

  for (const key of ['f', 'p', 's', 'i', 'o', 'u', 'r', 't', 'x', 'l', 'c']) {
    root.dispatch('keydown', {
      key,
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      preventDefault() {},
      target: { tagName: 'DIV', isContentEditable: false },
    });
  }

  root.dispatch('keydown', {
    key: 's',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    preventDefault() {},
    target: { tagName: 'DIV', isContentEditable: false },
  });
  root.dispatch('keydown', {
    key: 'p',
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    preventDefault() {},
    target: { tagName: 'INPUT', isContentEditable: false },
  });

  assert.equal(events, 'fpsiourtxlc');
});
