const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/web_browser_window_runtime.js');

function makeEventNode(initial = {}) {
  const handlers = {};
  return {
    ...initial,
    addEventListener(type, handler) {
      handlers[type] = handler;
    },
    fire(type, event = {}) {
      handlers[type]?.(event);
    },
  };
}

test('web browser window runtime mounts, navigates, and persists URL state', () => {
  const states = [];
  const urlInput = makeEventNode({ value: 'https://initial.example' });
  const iframe = makeEventNode({ src: 'https://initial.example' });
  const goBtn = makeEventNode();
  const reloadBtn = makeEventNode();
  const body = {
    style: {},
    innerHTML: '',
    querySelector(selector) {
      if (selector === '#wb-url') return urlInput;
      if (selector === '#wb-iframe') return iframe;
      if (selector === '#wb-go') return goBtn;
      if (selector === '#wb-reload') return reloadBtn;
      return null;
    },
  };

  const browser = runtime.createWebBrowserWindowRuntime({
    id: 'wb',
    body,
    defaultUrl: 'https://initial.example',
    escHtml: value => String(value),
    upsertWindowState(id, state) {
      states.push({ id, state });
    },
  });

  browser.mount();
  urlInput.value = 'https://next.example';
  goBtn.fire('click');
  reloadBtn.fire('click');

  assert.match(body.style.cssText, /display:flex/);
  assert.match(body.innerHTML, /https:\/\/initial\.example/);
  assert.equal(iframe.src, 'https://next.example');
  assert.deepEqual(states.at(-1), {
    id: 'wb',
    state: { kind: 'web-browser', url: 'https://next.example' },
  });
});
