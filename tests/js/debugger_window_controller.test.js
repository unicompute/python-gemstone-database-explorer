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
  const proceedBtn = new FakeNode();
  const stepBtn = new FakeNode();
  const stepIntoBtn = new FakeNode();
  const stepOverBtn = new FakeNode();
  const restartBtn = new FakeNode();
  const trimBtn = new FakeNode();
  const varsEl = new FakeNode();
  varsEl.value = 'temp';

  debuggerWindowController.bindDebuggerTabActions(tabStrip, {
    onTabChange(tab) { tabSeen = tab; },
  });
  debuggerWindowController.bindDebuggerToolbarActions({
    proceedBtn,
    stepBtn,
    stepIntoBtn,
    stepOverBtn,
    restartBtn,
    trimBtn,
  }, {
    onProceed() { events += 1; },
    onStep() { events += 5; },
    onStepInto() { events += 10; },
    onStepOver() { events += 100; },
    onRestart() { events += 500; },
    onTrim() { events += 1000; },
  });
  debuggerWindowController.bindDebuggerVariableSelector(varsEl, {
    onVariableChange(name) { variableSeen = name; },
  });

  tabStrip.dispatch('click', {target: {closest() { return {dataset: {dtab: 'tls'}}; }}});
  proceedBtn.dispatch('click');
  stepBtn.dispatch('click');
  stepIntoBtn.dispatch('click');
  stepOverBtn.dispatch('click');
  restartBtn.dispatch('click');
  trimBtn.dispatch('click');
  varsEl.dispatch('change');

  assert.equal(tabSeen, 'tls');
  assert.equal(events, 1616);
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
  const stepBtn = new FakeNode();
  const stepIntoBtn = new FakeNode();
  const stepOverBtn = new FakeNode();
  const restartBtn = new FakeNode();
  const trimBtn = new FakeNode();

  debuggerWindowController.applyDebuggerToolbarState({
    proceedBtn,
    stepBtn,
    stepIntoBtn,
    stepOverBtn,
    restartBtn,
    trimBtn,
  }, {
    proceedDisabled: true,
    stepDisabled: true,
    stepIntoDisabled: false,
    stepOverDisabled: true,
    restartDisabled: false,
    trimDisabled: true,
  });

  assert.equal(proceedBtn.disabled, true);
  assert.equal(stepBtn.disabled, true);
  assert.equal(stepIntoBtn.disabled, false);
  assert.equal(stepOverBtn.disabled, true);
  assert.equal(restartBtn.disabled, false);
  assert.equal(trimBtn.disabled, true);
});
