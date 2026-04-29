const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/workspace_window_runtime.js');

test('resolveWorkspaceTargetOop prefers resolver when present', () => {
  assert.equal(runtime.resolveWorkspaceTargetOop(11, () => 42), 42);
  assert.equal(runtime.resolveWorkspaceTargetOop(11, null), 11);
});

test('buildWorkspaceWindowState includes oop only when present', () => {
  assert.deepEqual(
    runtime.buildWorkspaceWindowState('workspace', '1+1', 'workspace:1', 99),
    {kind: 'workspace', draft: '1+1', sessionChannel: 'workspace:1', oop: 99}
  );
  assert.deepEqual(
    runtime.buildWorkspaceWindowState('ruby-workspace', '', 'ruby-workspace:1', 0),
    {kind: 'ruby-workspace', draft: '', sessionChannel: 'ruby-workspace:1'}
  );
});

test('hasInspectableWorkspaceResult requires a remote object target', () => {
  assert.equal(runtime.hasInspectableWorkspaceResult(null), false);
  assert.equal(runtime.hasInspectableWorkspaceResult({ basetype: 'object' }), false);
  assert.equal(runtime.hasInspectableWorkspaceResult({ oop: 15, basetype: 'object' }), true);
});

test('hasInspectableWorkspaceResult keeps inspectable live results even when basetype is leaf-like', () => {
  const isLeaf = basetype => basetype === 'string';
  assert.equal(
    runtime.hasInspectableWorkspaceResult({ oop: 15, basetype: 'string' }, isLeaf),
    false
  );
  assert.equal(
    runtime.hasInspectableWorkspaceResult({ oop: 15, basetype: 'string', availableTabs: ['code'] }, isLeaf),
    true
  );
  assert.equal(
    runtime.hasInspectableWorkspaceResult({ oop: 15, basetype: 'string', classBrowserTarget: { className: 'Object' } }, isLeaf),
    true
  );
});
