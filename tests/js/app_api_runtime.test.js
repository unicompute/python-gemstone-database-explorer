const test = require('node:test');
const assert = require('node:assert/strict');

const { createAppApiRuntime, exactWriteSessionChannel, escHtml } = require('../../static/js/app_api_runtime.js');

test('app api runtime exports core pure helpers', () => {
  assert.equal(exactWriteSessionChannel('workspace:1'), 'workspace:1-w');
  assert.equal(exactWriteSessionChannel('workspace:1-r'), 'workspace:1-w');
  assert.equal(exactWriteSessionChannel('workspace:1-w'), 'workspace:1-w');
  assert.equal(escHtml('<a&b>'), '&lt;a&amp;b&gt;');
});

test('app api runtime applies session and connection override headers', async () => {
  let capturedHeaders = null;
  const runtime = createAppApiRuntime({
    fetchImpl(_url, options) {
      capturedHeaders = options.headers;
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('{"ok":true}'),
      });
    },
    Headers,
    connectionOverrideHeadersFor() {
      return {'X-GS-STONE': 'gs64stone'};
    },
    getConnectionOverrideHeaders() {
      return {'X-GS-HOST': 'localhost'};
    },
  });

  await runtime.api('/version', {sessionChannel: 'workspace:1', connectionOverride: {stone: 'gs64stone'}});
  assert.equal(capturedHeaders.get('X-GS-Channel'), 'workspace:1');
  assert.equal(capturedHeaders.get('X-GS-STONE'), 'gs64stone');
  assert.equal(capturedHeaders.get('X-GS-HOST'), null);
});

test('app api runtime resolves preflight fallbacks from failed requests', async () => {
  const runtime = createAppApiRuntime({
    fetchImpl() {
      return Promise.resolve({
        ok: false,
        status: 503,
        text: () => Promise.resolve('service unavailable'),
      });
    },
    Headers,
  });

  const preflight = await runtime.resolveConnectionPreflight(new Error('outer'));
  assert.equal(preflight.success, false);
  assert.equal(preflight.status, 'error');
  assert.match(preflight.exception, /service unavailable|outer/);
});

test('app api runtime falls back to execCommand clipboard copy', async () => {
  let copied = false;
  const body = {
    appended: [],
    appendChild(node) {
      this.appended.push(node);
    },
  };
  const runtime = createAppApiRuntime({
    navigator: {},
    document: {
      body,
      createElement() {
        return {
          value: '',
          style: {},
          setAttribute() {},
          select() {},
          setSelectionRange() {},
          remove() {},
        };
      },
      execCommand(command) {
        copied = command === 'copy';
        return copied;
      },
    },
    window: {},
  });

  await runtime.copyTextToClipboard('hello');
  assert.equal(copied, true);
});
