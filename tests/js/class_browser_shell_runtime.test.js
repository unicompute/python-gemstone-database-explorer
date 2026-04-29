const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/class_browser_shell_runtime.js');

test('class browser shell runtime de-duplicates cached browser loads', async () => {
  const shell = runtime.createClassBrowserShellRuntime({
    els: {},
    buildBrowserCacheKey(name, parts) {
      return `${name}:${parts.join('|')}`;
    },
  });

  let calls = 0;
  let resolveLoader;
  const loaderPromise = new Promise(resolve => {
    resolveLoader = resolve;
  });

  const first = shell.fetchBrowserCached('source', ['Object', 'foo'], async () => {
    calls += 1;
    return loaderPromise;
  });
  const second = shell.fetchBrowserCached('source', ['Object', 'foo'], async () => {
    calls += 1;
    return 'other';
  });

  resolveLoader('loaded source');

  assert.equal(await first, 'loaded source');
  assert.equal(await second, 'loaded source');
  assert.equal(calls, 1);
});

test('class browser shell runtime loads class source and updates source status', async () => {
  const source = {
    value: '',
    readOnly: false,
    classList: {
      toggle() {},
    },
  };
  const compile = {
    disabled: false,
    title: '',
  };
  const sourceNote = { textContent: '' };
  const status = { textContent: '', className: '' };
  let currentSourceMode = 'classDefinition';

  const shell = runtime.createClassBrowserShellRuntime({
    els: { source, compile, sourceNote, status },
    getState() {
      return {
        currentClass: 'Behavior',
        currentDict: 'Globals',
        currentMeta: false,
        currentMethod: 'foo',
        currentProtocol: '-- all --',
        currentSourceMode,
      };
    },
    setState(patch = {}) {
      if (Object.prototype.hasOwnProperty.call(patch, 'currentSourceMode')) {
        currentSourceMode = patch.currentSourceMode;
      }
    },
    buildClassSourceRequest() {
      return {
        sourceMode: 'methodSource',
        sourceLabel: 'Behavior>>foo',
        cacheKeyParts: ['Behavior', 'foo'],
        params: { className: 'Behavior', method: 'foo' },
      };
    },
    browserApiWithParams: async () => ({ success: true, source: 'foo ^42' }),
    buildBrowserCacheKey(name, parts) {
      return `${name}:${parts.join('|')}`;
    },
    buildClassBrowserActionState() {
      return {};
    },
    applyClassBrowserActionState() {},
    upsertWindowState() {},
    setStatus() {},
  });

  await shell.loadClassSource('foo');

  assert.equal(source.value, 'foo ^42');
  assert.equal(sourceNote.textContent, 'Behavior>>foo');
  assert.equal(status.textContent, 'Behavior>>foo');
  assert.equal(status.className, 'cb-status ok');
  assert.equal(compile.disabled, false);
});
