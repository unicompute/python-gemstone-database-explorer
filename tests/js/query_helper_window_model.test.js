const test = require('node:test');
const assert = require('node:assert/strict');

const queryHelperWindowModel = require('../../static/js/query_helper_window_model.js');

test('query helper model returns runtime only for class browser windows', () => {
  const runtime = {ready: Promise.resolve()};
  const windowState = new Map([
    ['browser-1', {kind: 'class-browser', browserRuntime: runtime}],
    ['workspace-1', {kind: 'workspace', browserRuntime: {ready: Promise.resolve()}}],
  ]);

  assert.equal(
    queryHelperWindowModel.getClassBrowserRuntime('browser-1', windowState),
    runtime
  );
  assert.equal(
    queryHelperWindowModel.getClassBrowserRuntime('workspace-1', windowState),
    null
  );
  assert.equal(
    queryHelperWindowModel.getClassBrowserRuntime('missing', windowState),
    null
  );
});

test('query helper model resolves existing class browser runtime without reopening', async () => {
  let readyResolved = false;
  let opened = 0;
  const runtime = {
    ready: new Promise(resolve => {
      setImmediate(() => {
        readyResolved = true;
        resolve();
      });
    }),
  };
  const windowState = new Map([
    ['browser-1', {kind: 'class-browser', browserRuntime: runtime}],
  ]);

  const result = await queryHelperWindowModel.resolveClassBrowserRuntime(
    'browser-1',
    {className: 'Object'},
    {
      windowState,
      openClassBrowser() {
        opened += 1;
        return {id: 'browser-2'};
      },
    }
  );

  assert.equal(readyResolved, true);
  assert.equal(opened, 0);
  assert.equal(result.runtime, runtime);
  assert.equal(result.sourceWindowId, 'browser-1');
  assert.equal(result.created, false);
});

test('query helper model opens a new class browser runtime when the source browser is missing', async () => {
  let seenOptions = null;
  const runtime = {ready: Promise.resolve()};
  const windowState = new Map();

  const result = await queryHelperWindowModel.resolveClassBrowserRuntime(
    'missing-browser',
    {className: 'Behavior', meta: true},
    {
      windowState,
      openClassBrowser(options) {
        seenOptions = options;
        windowState.set('browser-2', {kind: 'class-browser', browserRuntime: runtime});
        return {id: 'browser-2'};
      },
    }
  );

  assert.deepEqual(seenOptions, {className: 'Behavior', meta: true});
  assert.equal(result.runtime, runtime);
  assert.equal(result.sourceWindowId, 'browser-2');
  assert.equal(result.created, true);
});

test('query helper model fails clearly when a new browser runtime is unavailable', async () => {
  await assert.rejects(
    queryHelperWindowModel.openClassBrowserRuntime(
      {className: 'Object'},
      {
        windowState: new Map(),
        openClassBrowser() {
          return {id: 'browser-3'};
        },
      }
    ),
    /Class Browser could not be opened/
  );
});
