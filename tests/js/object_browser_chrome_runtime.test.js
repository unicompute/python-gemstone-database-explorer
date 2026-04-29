const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/object_browser_chrome_runtime.js');

function createElement(tagName = 'div', ownerDocument = null) {
  const node = {
    tagName,
    ownerDocument,
    children: [],
    dataset: {},
    style: {},
    className: '',
    textContent: '',
    innerHTML: '',
    title: '',
    attributes: {},
    listeners: {},
    querySelectorAll() {
      return this.children.filter(child => child.tagName === 'button');
    },
    classList: {
      values: new Set(),
      toggle(name, enabled) {
        if (enabled) this.values.add(name);
        else this.values.delete(name);
      },
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    append(...items) {
      this.children.push(...items);
    },
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  if (!node.ownerDocument) node.ownerDocument = {createElement: tag => createElement(tag, node.ownerDocument)};
  return node;
}

test('object browser chrome populates roots and breadcrumb callbacks', () => {
  const document = {createElement: tag => createElement(tag, document)};
  const rootsUl = createElement('ul', document);
  const bc = createElement('div', document);
  const rootSelections = [];
  const crumbSelections = [];

  runtime.populateRootsList(rootsUl, {Globals: 10, UserGlobals: 20}, (label, oop) => {
    rootSelections.push({label, oop});
  });
  assert.equal(rootsUl.children.length, 2);
  rootsUl.children[1].listeners.click();
  assert.deepEqual(rootSelections, [{label: 'UserGlobals', oop: 20}]);

  runtime.renderBreadcrumb(bc, [{label: 'Globals', oop: 10}, {label: 'Object', oop: 30}], index => {
    crumbSelections.push(index);
  });
  assert.equal(bc.children.length, 3);
  bc.children[0].listeners.click();
  assert.deepEqual(crumbSelections, [0]);
});

test('object browser chrome control panel runs transactions and updates status', async () => {
  const document = {createElement: tag => createElement(tag, document)};
  const ibody = createElement('div', document);
  const calls = [];
  const statuses = [];
  let cleared = null;
  let refreshed = 0;

  runtime.renderControlPanel(ibody, {
    document,
    objectApi(url, opts) {
      calls.push({url, opts});
      if (url === '/transaction/persistent-mode' && !opts) {
        return Promise.resolve({success: true, persistent: true});
      }
      return Promise.resolve({success: true, result: 'done', persistent: false});
    },
    clearInspectorTabCache(oop) {
      cleared = oop;
    },
    getCurrentOop() {
      return 77;
    },
    setStatus(ok, message) {
      statuses.push({ok, message});
    },
    refreshHaltedThreadsBar() {
      refreshed += 1;
    },
  });

  const wrap = ibody.children[0];
  const row = wrap.children[0];
  const continueBtn = row.children[2];
  await continueBtn.listeners.click();

  assert.equal(calls[0].url, '/transaction/persistent-mode');
  assert.equal(calls[1].url, '/transaction/continue');
  assert.equal(cleared, 77);
  assert.deepEqual(statuses.at(-1), {ok: true, message: 'ok'});
  assert.equal(refreshed, 1);
});
