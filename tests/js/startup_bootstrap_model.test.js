const test = require('node:test');
const assert = require('node:assert/strict');

const startupBootstrapModel = require('../../static/js/startup_bootstrap_model.js');

test('buildStartupRootState maps ids into startupIds and roots', () => {
  assert.deepEqual(
    startupBootstrapModel.buildStartupRootState({
      persistentRootId: 100,
      gemStoneSystemId: 200,
      globalsId: 300,
      defaultWorkspaceId: 400,
    }),
    {
      startupIds: {
        persistentRootId: 100,
        systemId: 200,
        globalsId: 300,
        defaultWorkspaceId: 400,
      },
      roots: {
        UserGlobals: 100,
        Globals: 300,
        System: 200,
        RubyWorkspace: 400,
      },
    }
  );
});

test('hasNonConnectionManagedWindows treats non-connection and unknown kinds as restorable windows', () => {
  const windows = [{id: 'connection'}, {id: 'workspace'}, {id: 'unknown'}];
  const stateMap = new Map([
    ['connection', {kind: 'connection'}],
    ['workspace', {kind: 'workspace'}],
    ['unknown', {}],
  ]);

  assert.equal(
    startupBootstrapModel.hasNonConnectionManagedWindows(
      windows,
      id => stateMap.get(id)
    ),
    true
  );
  assert.equal(
    startupBootstrapModel.hasNonConnectionManagedWindows(
      [{id: 'connection-only'}],
      () => ({kind: 'connection'})
    ),
    false
  );
});
