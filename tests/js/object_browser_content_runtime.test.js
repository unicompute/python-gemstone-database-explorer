const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/object_browser_content_runtime.js');

function createElement(tagName = 'div', ownerDocument = null) {
  const node = {
    tagName,
    ownerDocument,
    children: [],
    textContent: '',
    className: '',
    style: {},
    disabled: false,
    listeners: {},
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
  };
  if (!ownerDocument) {
    node.ownerDocument = {
      createElement: tag => createElement(tag, node.ownerDocument),
    };
  }
  return node;
}

test('object browser content runtime appends pager buttons that reload object ranges', () => {
  const document = { createElement: tag => createElement(tag, document) };
  const ibody = createElement('div', document);
  const state = {
    currentOop: 70,
    currentObjData: { inspection: 'Thing' },
    currentObjectQuery: { depth: 2 },
    history: [{ label: 'Thing', oop: 70 }],
  };
  let loaded = null;

  const content = runtime.createObjectBrowserContentRuntime({
    document,
    getState() { return state; },
    loadObject(oop, label, options) { loaded = { oop, label, options }; },
    buildCustomTabPagerState() {
      return {
        showPager: true,
        summaryText: '1-20 of 40',
        canPrev: false,
        canNext: true,
        canLoadAll: true,
        prevRange: { from: 1, to: 20 },
        nextRange: { from: 21, to: 40 },
        allRange: { from: 1, to: 40 },
      };
    },
    customTabRangeQuery(query, customTab, from, to) {
      return { ...query, [`${customTab.id}_from`]: from, [`${customTab.id}_to`]: to };
    },
  });

  content.appendCustomTabPager(ibody, { id: 'custom' }, { 1: [] }, 40);
  const bar = ibody.children[0];
  const next = bar.children[2];
  next.listeners.click();

  assert.deepEqual(loaded, {
    oop: 70,
    label: 'Thing',
    options: {
      query: { depth: 2, custom_from: 21, custom_to: 40 },
      preserveCurrentTab: true,
      keepInstPage: true,
    },
  });
});

test('object browser content runtime makes object value cells navigate through history', () => {
  const document = {
    createElement: tag => createElement(tag, document),
  };
  const state = {
    history: [{ label: 'Root', oop: 1 }],
  };
  let loaded = null;

  const content = runtime.createObjectBrowserContentRuntime({
    id: 'obj-3',
    document,
    getState() { return state; },
    setState(patch) { Object.assign(state, patch); },
    loadObject(oop, label) { loaded = { oop, label }; },
    buildValueRenderState(value) { return value; },
    makeChip(text, oop) { return { text, oop }; },
    makeObjectBrowserValCellFromState(valueState, label, deps) {
      const td = document.createElement('td');
      const nav = document.createElement('span');
      nav.addEventListener('click', () => deps.navigateToOop(valueState.oop, label));
      td.append(nav);
      return td;
    },
  });

  const cell = content.makeValCellFromState({ kind: 'object', text: 'Child', oop: 5 }, 'Child');
  cell.children[0].listeners.click();

  assert.deepEqual(state.history, [{ label: 'Root', oop: 1 }, { label: 'Child', oop: 5 }]);
  assert.deepEqual(loaded, { oop: 5, label: 'Child' });
});
