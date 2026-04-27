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
  assert.match(html, /Step into/);
  assert.match(html, /Restart/);
  assert.match(framesHtml, /data-idx="0"/);
  assert.match(framesHtml, /dbg-frame-icon ruby/);
});

test('debugger window view computes source lines and variable options', () => {
  const sourceView = debuggerWindowView.buildDebuggerSourceView({
    source: '1/0\nself halt',
    sourceOffset: 5,
    stepPoint: 3,
    ipOffset: 9,
  }, {
    frameIndex: 0,
  });
  const optionsHtml = debuggerWindowView.buildDebuggerVariableOptionsHtml([
    {name: 'alpha', value: '1234567890'},
  ]);

  assert.equal(sourceView.activeLine, 2);
  assert.match(sourceView.metaText, /Step 3/);
  assert.match(sourceView.metaText, /Line 2/);
  assert.match(sourceView.sourceHtml, /dbg-source-line active/);
  assert.match(sourceView.sourceHtml, /dbg-source-marker/);
  assert.match(optionsHtml, /— variables —/);
  assert.match(optionsHtml, /alpha = 1234567890/);
});

test('debugger window view prefers explicit line numbers for highlighting', () => {
  const sourceView = debuggerWindowView.buildDebuggerSourceView({
    source: 'line1\nline2\nline3',
    lineNumber: 3,
    sourceOffset: 0,
    stepPoint: 12,
  }, {
    frameIndex: 0,
  });

  assert.equal(sourceView.activeLine, 3);
  assert.match(sourceView.metaText, /Line 3/);
  assert.match(sourceView.sourceHtml, /data-line="3"/);
  assert.match(sourceView.sourceHtml, /&#9654;/);
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
