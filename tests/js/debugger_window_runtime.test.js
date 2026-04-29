const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/debugger_window_runtime.js');

test('buildDebuggerWindowState normalizes tab and frame index', () => {
  assert.deepEqual(
    runtime.buildDebuggerWindowState({
      threadOop: 77,
      threadLabel: 'boom',
      currentTab: 'tls',
      frameIndex: '4',
      sourceWindowId: 'workspace-1',
      sessionChannel: 'debugger:1-w',
    }),
    {
      kind: 'debugger',
      sessionChannel: 'debugger:1-w',
      threadOop: 77,
      threadLabel: 'boom',
      currentTab: 'tls',
      frameIndex: 4,
      sourceWindowId: 'workspace-1',
    }
  );
});

test('buildDebuggerToolbarState disables mutation-sensitive actions while busy', () => {
  assert.deepEqual(
    runtime.buildDebuggerToolbarState({
      busy: true,
      hasFrames: true,
      currentFrameCanStep: true,
      threadOop: 44,
      currentFrameData: {
        source: '1/0',
        hasFrame: true,
        status: 'suspended',
        canProceed: true,
        canRestart: true,
        canTrim: true,
        canTerminate: true,
        canStep: true,
        canStepInto: true,
        canStepOver: true,
        canStepReturn: true,
      },
    }),
    {
      refreshDisabled: true,
      proceedDisabled: true,
      stepDisabled: true,
      stepIntoDisabled: true,
      stepOverDisabled: true,
      stepReturnDisabled: true,
      restartDisabled: true,
      trimDisabled: true,
      terminateDisabled: true,
      copyStackDisabled: false,
      copySourceDisabled: false,
    }
  );
});

test('buildDebuggerToolbarState keeps proceed/restart controls tied to the selected live frame', () => {
  assert.deepEqual(
    runtime.buildDebuggerToolbarState({
      busy: false,
      hasFrames: true,
      currentFrameCanStep: false,
      threadOop: 44,
      currentFrameData: {
        hasFrame: true,
        status: 'suspended',
        source: 'helper ^ #done',
        canProceed: true,
        canRestart: true,
        canTrim: true,
        canTerminate: true,
        canStep: false,
        canStepInto: false,
        canStepOver: false,
        canStepReturn: false,
      },
    }),
    {
      refreshDisabled: false,
      proceedDisabled: false,
      stepDisabled: true,
      stepIntoDisabled: true,
      stepOverDisabled: true,
      stepReturnDisabled: true,
      restartDisabled: false,
      trimDisabled: false,
      terminateDisabled: false,
      copyStackDisabled: false,
      copySourceDisabled: false,
    }
  );
});

test('buildDebuggerToolbarState disables frame actions when no selected frame is controllable', () => {
  assert.deepEqual(
    runtime.buildDebuggerToolbarState({
      busy: false,
      hasFrames: true,
      currentFrameCanStep: true,
      threadOop: 0,
      currentFrameData: {
        hasFrame: false,
        status: 'terminated',
        source: '',
      },
    }),
    {
      refreshDisabled: true,
      proceedDisabled: true,
      stepDisabled: true,
      stepIntoDisabled: true,
      stepOverDisabled: true,
      stepReturnDisabled: true,
      restartDisabled: true,
      trimDisabled: true,
      terminateDisabled: true,
      copyStackDisabled: false,
      copySourceDisabled: false,
    }
  );
});

test('preferredDebuggerFrame keeps the normalized top executed-code row selected at index 0', () => {
  const frames = [
    {
      index: 0,
      name: 'Executed code @5 line 5',
      className: '',
      selectorName: '',
      frameKey: 'method:Executed code @5 line 5',
      isExecutedCode: true,
    },
    {
      index: 7,
      name: 'Executed code @5 line 5',
      className: 'SigWorkspaceEvaluator',
      selectorName: 'sigWorkspaceDoIt',
      frameKey: 'class:SigWorkspaceEvaluator>>sigWorkspaceDoIt',
      isExecutedCode: true,
    },
  ];

  const selected = runtime.preferredDebuggerFrame(
    frames,
    0,
    {
      methodName: 'Executed code @5 line 5',
      className: 'SigWorkspaceEvaluator',
      selectorName: 'sigWorkspaceDoIt',
      frameKey: 'class:SigWorkspaceEvaluator>>sigWorkspaceDoIt',
      isExecutedCode: true,
    },
    {preferExecutedCode: true},
  );

  assert.equal(selected.index, 0);
});

test('buildDebuggerToolbarState only leaves terminate enabled while the process is running', () => {
  assert.deepEqual(
    runtime.buildDebuggerToolbarState({
      busy: false,
      hasFrames: true,
      currentFrameCanStep: true,
      threadOop: 44,
      currentFrameData: {
        hasFrame: true,
        status: 'running',
        source: '1/0',
        canProceed: false,
        canRestart: false,
        canTrim: false,
        canTerminate: true,
        canStep: false,
        canStepInto: false,
        canStepOver: false,
        canStepReturn: false,
      },
    }),
    {
      refreshDisabled: false,
      proceedDisabled: true,
      stepDisabled: true,
      stepIntoDisabled: true,
      stepOverDisabled: true,
      stepReturnDisabled: true,
      restartDisabled: true,
      trimDisabled: true,
      terminateDisabled: false,
      copyStackDisabled: false,
      copySourceDisabled: false,
    }
  );
});

test('preferredDebuggerFrame falls back to the first executed-code frame when no exact frame index exists', () => {
  assert.deepEqual(
    runtime.preferredDebuggerFrame([
      {index: 6, name: 'SmallInteger>>/'},
      {index: 5, name: 'Executed code @3 line 2'},
      {index: 4, name: 'Behavior>>helper'},
    ], 0),
    {index: 5, name: 'Executed code @3 line 2'}
  );
});

test('preferredDebuggerFrame prefers the first executed-code frame for the default top selection', () => {
  assert.deepEqual(
    runtime.preferredDebuggerFrame([
      {index: 0, name: 'SigWorkspaceEvaluator>>sigWorkspaceDoIt'},
      {index: 1, name: 'Executed code @2 line 1'},
      {index: 2, name: 'GsNMethod class>>_gsReturnToC'},
    ], 0),
    {index: 1, name: 'Executed code @2 line 1'}
  );
});

test('preferredDebuggerFrame can preserve the literal top frame when executed-code preference is disabled', () => {
  assert.deepEqual(
    runtime.preferredDebuggerFrame([
      {index: 0, name: 'Object>>stepInto1'},
      {index: 1, name: 'Executed code @2 line 1'},
      {index: 2, name: 'GsNMethod class>>_gsReturnToC'},
    ], 0, null, {preferExecutedCode: false}),
    {index: 0, name: 'Object>>stepInto1'}
  );
});

test('preferredDebuggerFrame preserves an exact selected frame when it exists', () => {
  assert.deepEqual(
    runtime.preferredDebuggerFrame([
      {index: 6, name: 'SmallInteger>>/'},
      {index: 5, name: 'Executed code @3 line 2'},
      {index: 4, name: 'Behavior>>helper'},
    ], 4),
    {index: 4, name: 'Behavior>>helper'}
  );
});

test('preferredDebuggerFrame preserves the same helper frame by identity when raw indexes shift', () => {
  const helperIdentity = runtime.buildDebuggerFrameIdentity({
    methodName: 'Behavior>>helper',
    className: 'Behavior',
    selectorName: 'helper',
    frameKey: 'Behavior>>helper',
    frameIndex: 5,
  });
  assert.deepEqual(
    runtime.preferredDebuggerFrame([
      {index: 1, name: 'Executed code @1 line 1', frameKey: 'executed:SigWorkspaceEvaluator>>sigWorkspaceDoIt', isExecutedCode: true},
      {index: 2, name: 'Behavior>>helper', className: 'Behavior', selectorName: 'helper', frameKey: 'Behavior>>helper'},
      {index: 3, name: 'GsNMethod class>>_gsReturnToC'},
    ], 5, helperIdentity),
    {index: 2, name: 'Behavior>>helper', className: 'Behavior', selectorName: 'helper', frameKey: 'Behavior>>helper'}
  );
});

test('preferredDebuggerFrame falls back to the nearest raw frame index when an exact match is gone', () => {
  assert.deepEqual(
    runtime.preferredDebuggerFrame([
      {index: 2, name: 'Executed code @1 line 1'},
      {index: 4, name: 'Behavior>>helper'},
      {index: 6, name: 'GsNMethod class>>_gsReturnToC'},
    ], 5),
    {index: 4, name: 'Behavior>>helper'}
  );
});

test('syncDebuggerFramesWithDetail updates the selected frame label from detail payload', () => {
  assert.deepEqual(
    runtime.syncDebuggerFramesWithDetail([
      {index: 0, name: 'Executed code @1 line 1'},
      {index: 1, name: 'GsNMethod class>>_gsReturnToC'},
    ], 0, {
      methodName: 'Executed code @2 line 1',
    }),
    [
      {
        index: 0,
        name: 'Executed code @2 line 1',
        className: '',
        selectorName: '',
        frameKey: 'executed-code',
        isExecutedCode: true,
      },
      {index: 1, name: 'GsNMethod class>>_gsReturnToC'},
    ]
  );
});

test('syncDebuggerFramesWithDetail carries richer frame identity metadata from the detail payload', () => {
  assert.deepEqual(
    runtime.syncDebuggerFramesWithDetail([
      {index: 3, name: 'Behavior>>helper'},
      {index: 4, name: 'GsNMethod class>>_gsReturnToC'},
    ], 3, {
      methodName: 'Behavior>>helper',
      className: 'Behavior',
      selectorName: 'helper',
      frameKey: 'Behavior>>helper',
      isExecutedCode: false,
    }),
    [
      {
        index: 3,
        name: 'Behavior>>helper',
        className: 'Behavior',
        selectorName: 'helper',
        frameKey: 'Behavior>>helper',
        isExecutedCode: false,
      },
      {index: 4, name: 'GsNMethod class>>_gsReturnToC'},
    ]
  );
});

test('syncDebuggerFramesWithDetail leaves the existing list untouched without a newer label', () => {
  const frames = [
    {index: 0, name: 'Executed code @1 line 1'},
    {index: 1, name: 'GsNMethod class>>_gsReturnToC'},
  ];
  assert.strictEqual(runtime.syncDebuggerFramesWithDetail(frames, 0, {methodName: ''}), frames);
});
