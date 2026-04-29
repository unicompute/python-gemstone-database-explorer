const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/object_chip_runtime.js');

function createElement(tagName = 'div', ownerDocument = null) {
  const node = {
    tagName,
    ownerDocument,
    parentNode: null,
    children: [],
    dataset: {},
    style: {},
    className: '',
    textContent: '',
    value: '',
    placeholder: '',
    draggable: false,
    listeners: {},
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    contains(target) {
      let current = target;
      while (current) {
        if (current === this) return true;
        current = current.parentNode;
      }
      return false;
    },
  };
  if (!ownerDocument) {
    node.ownerDocument = {
      createElement: nextTag => createElement(nextTag, node.ownerDocument),
      addEventListener() {},
    };
  }
  return node;
}

test('object chip runtime evaluates code and inspects linked objects', async () => {
  const documentRef = {
    listeners: {},
    createElement(tagName) {
      return createElement(tagName, documentRef);
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
  };
  const inspectCalls = [];
  const evalCalls = [];

  const chipRuntime = runtime.createObjectChipRuntime({
    document: documentRef,
    async apiEvaluate(oop, payload) {
      evalCalls.push({ oop, payload });
      return { success: true, result: [false, { inspection: '42' }] };
    },
    openLinkedObjectWindow(payload) {
      inspectCalls.push(payload);
    },
  });

  const chip = chipRuntime.makeChip('Object', 123, 'win-1');
  const dropdown = chip.children[2];
  const codeEl = dropdown.children[1];
  const controls = dropdown.children[2];
  const caret = chip.children[1];
  const printBtn = controls.children[2];
  const inspectBtn = controls.children[3];
  const resultEl = dropdown.children[3];

  caret.listeners.click({ stopPropagation() {} });
  assert.equal(dropdown.className.includes('open'), true);

  codeEl.value = 'self printString';
  await printBtn.listeners.click({ stopPropagation() {} });
  assert.deepEqual(evalCalls, [{
    oop: 123,
    payload: {
      code: 'self printString',
      language: 'smalltalk',
      depth: 1,
      evalContext: undefined,
    },
  }]);
  assert.equal(resultEl.textContent, '42');

  inspectBtn.listeners.click({ stopPropagation() {} });
  assert.deepEqual(inspectCalls, [{
    oop: 123,
    text: 'Object',
    sourceWinId: 'win-1',
  }]);
});
