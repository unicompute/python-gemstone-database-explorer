const test = require('node:test');
const assert = require('node:assert/strict');

const debuggerWindowView = require('../../static/js/debugger_window_view.js');

test('debugger window view builds shell and frame list markup', () => {
  const html = debuggerWindowView.buildDebuggerWindowHtml('dbg');
  const framesHtml = debuggerWindowView.buildDebuggerFramesListHtml([
    {index: 0, name: 'Object>>printString'},
    {index: 1, name: 'RubyKernel(Ruby)>>puts'},
  ]);

  assert.match(html, /dbg-summary/);
  assert.match(html, /dbg-vars/);
  assert.match(html, /Refresh/);
  assert.match(html, /Step into/);
  assert.match(html, /Step out/);
  assert.match(html, /Restart/);
  assert.match(html, /Terminate/);
  assert.match(html, /Copy Stack/);
  assert.match(html, /Copy Source/);
  assert.match(framesHtml, /data-idx="0"/);
  assert.match(framesHtml, /dbg-frame-icon ruby/);
});

test('debugger window view computes source lines and variable options', () => {
  const sourceView = debuggerWindowView.buildDebuggerSourceView({
    source: '1/0\nself halt',
    sourceOffset: 5,
    stepPoint: 3,
    ipOffset: 9,
    status: 'suspended',
  }, {
    frameIndex: 0,
    framePosition: 2,
    frameCount: 4,
  });
  const optionsHtml = debuggerWindowView.buildDebuggerVariableOptionsHtml([
    {name: 'alpha', value: '1234567890'},
  ]);

  assert.equal(sourceView.activeLine, 2);
  assert.match(sourceView.metaText, /Frame 2\/4/);
  assert.match(sourceView.metaText, /Status suspended/);
  assert.match(sourceView.metaText, /Step 3/);
  assert.match(sourceView.metaText, /Line 2/);
  assert.match(sourceView.sourceHtml, /dbg-source-line active/);
  assert.match(sourceView.sourceHtml, /dbg-source-marker/);
  assert.match(sourceView.sourceHtml, /dbg-step-cursor/);
  assert.match(sourceView.sourceHtml, /S3/);
  assert.match(optionsHtml, /— variables —/);
  assert.match(optionsHtml, /alpha = 1234567890/);
});

test('debugger window view inserts an inline cursor at the next instruction', () => {
  const location = debuggerWindowView.computeDebuggerCursorLocation('1+1.\n1/0', 6);
  const sourceView = debuggerWindowView.buildDebuggerSourceView({
    source: '1+1.\n1/0',
    sourceOffset: 6,
    stepPoint: 1,
  }, {
    frameIndex: 0,
    framePosition: 1,
    frameCount: 1,
  });

  assert.deepEqual(location, {line: 2, column: 1});
  assert.deepEqual(sourceView.cursorLocation, {line: 2, column: 1});
  assert.match(sourceView.sourceHtml, /dbg-inline-cursor/);
  assert.match(sourceView.sourceHtml, /data-line="2"/);
  assert.match(sourceView.sourceHtml, /dbg-source-line active/);
  assert.match(sourceView.sourceHtml, /<span class="dbg-source-text"><span class="dbg-inline-cursor" aria-label="Next instruction">\|<\/span>1\/0<\/span>/);
});

test('debugger window view resolves active line and cursor from sourceOffsets when step data is richer than the flattened offset', () => {
  const sourceView = debuggerWindowView.buildDebuggerSourceView({
    source: '1+1.\n3*3.\n1/0',
    lineNumber: 1,
    sourceOffset: 0,
    sourceOffsets: [1, 5, 10, 11],
    stepPoint: 4,
  }, {
    frameIndex: 0,
    framePosition: 1,
    frameCount: 1,
  });

  assert.equal(debuggerWindowView.resolveDebuggerSourceOffset({
    sourceOffset: 0,
    sourceOffsets: [1, 5, 10, 11],
    stepPoint: 4,
  }), 11);
  assert.equal(sourceView.activeLine, 3);
  assert.deepEqual(sourceView.cursorLocation, {line: 3, column: 1});
  assert.match(sourceView.metaText, /Line 3/);
  assert.match(sourceView.metaText, /Offset 11/);
  assert.match(sourceView.sourceHtml, /<span class="dbg-source-line active" data-line="3">/);
  assert.match(sourceView.sourceHtml, /dbg-inline-cursor/);
});

test('debugger window view prefers explicit line numbers for highlighting', () => {
  const sourceView = debuggerWindowView.buildDebuggerSourceView({
    source: 'line1\nline2\nline3',
    lineNumber: 3,
    sourceOffset: 0,
    stepPoint: 12,
  }, {
    frameIndex: 0,
    framePosition: 3,
    frameCount: 5,
  });

  assert.equal(sourceView.activeLine, 3);
  assert.match(sourceView.metaText, /Frame 3\/5/);
  assert.match(sourceView.metaText, /Line 3/);
  assert.deepEqual(sourceView.cursorLocation, {line: 3, column: 1});
  assert.match(sourceView.sourceHtml, /data-line="3"/);
  assert.match(sourceView.sourceHtml, /dbg-inline-cursor/);
  assert.match(sourceView.sourceHtml, /S12/);
});

test('debugger window view clamps stale line numbers to the visible executed source', () => {
  const sourceView = debuggerWindowView.buildDebuggerSourceView({
    methodName: 'Executed code @4 line 7',
    isExecutedCode: true,
    source: '1+1.\n1/0',
    lineNumber: 7,
    sourceOffset: 0,
    stepPoint: 4,
  }, {
    frameIndex: 0,
    framePosition: 1,
    frameCount: 1,
  });

  assert.equal(sourceView.activeLine, 2);
  assert.deepEqual(sourceView.cursorLocation, {line: 2, column: 1});
  assert.match(sourceView.metaText, /Line 2/);
  assert.match(sourceView.sourceHtml, /data-line="2"/);
  assert.match(sourceView.sourceHtml, /dbg-inline-cursor/);
  assert.match(sourceView.sourceHtml, /<span class="dbg-source-line active" data-line="2">/);
});

test('debugger window view keeps the executed-code cursor on the current server step position', () => {
  const sourceView = debuggerWindowView.buildDebuggerSourceView({
    methodName: 'Executed code @3 line 3',
    isExecutedCode: true,
    source: '1+1.\n\n3*3. 6+5.\n\n0/0',
    lineNumber: 3,
    sourceOffset: 3,
    sourceOffsets: [1, 2, 3, 7],
    stepPoint: 3,
  }, {
    frameIndex: 0,
    framePosition: 1,
    frameCount: 6,
  });

  assert.equal(sourceView.activeLine, 1);
  assert.deepEqual(sourceView.cursorLocation, {line: 1, column: 3});
  assert.match(sourceView.metaText, /Step 3/);
  assert.match(sourceView.metaText, /Line 1/);
  assert.match(sourceView.sourceHtml, /<span class="dbg-source-line active" data-line="1">/);
  assert.match(sourceView.sourceHtml, /dbg-inline-cursor/);
});

test('debugger window view builds plain-text exports for stack and source', () => {
  const stackText = debuggerWindowView.buildDebuggerFramesExportText([
    {index: 0, name: 'Object>>haltedMethod'},
    {index: 1, name: 'Behavior>>helper'},
  ], 1);
  const sourceText = debuggerWindowView.buildDebuggerSourceExportText({
    source: '1+1.\n1/0',
    lineNumber: 2,
    stepPoint: 3,
  }, {
    frameIndex: 1,
    framePosition: 2,
    frameCount: 2,
  });

  assert.match(stackText, /^  Object>>haltedMethod/m);
  assert.match(stackText, /^> Behavior>>helper/m);
  assert.match(sourceText, /Frame 2\/2/);
  assert.match(sourceText, /Step 3/);
  assert.match(sourceText, /1\/0/);
});

test('debugger summary state falls back cleanly', () => {
  const hidden = debuggerWindowView.buildDebuggerSummaryState({});
  const visible = debuggerWindowView.buildDebuggerSummaryState({
    sourcePreview: '1/0',
    exceptionText: 'a ZeroDivide occurred',
  });

  assert.equal(hidden.hidden, true);
  assert.equal(visible.hidden, false);
  assert.equal(visible.sourceText, '1/0');
  assert.equal(visible.errorText, '⚑ a ZeroDivide occurred');
});
