const test = require('node:test');
const assert = require('node:assert/strict');

const workspaceWindowView = require('../../static/js/workspace_window_view.js');

test('workspace window view builds expected shell html', () => {
  const html = workspaceWindowView.buildWorkspaceWindowHtml('ws');

  assert.match(html, /ws-wsh/);
  assert.match(html, /ws-wsc/);
  assert.match(html, /Ctrl\+Enter/);
  assert.match(html, /Transaction:/);
});

test('workspace window view supports MagLev Ruby workspace options', () => {
  const html = workspaceWindowView.buildWorkspaceWindowHtml('ruby', {
    placeholder: 'Ruby expression… (Ctrl+Enter)',
    showTransactionBar: false,
  });

  assert.match(html, /Ruby expression… \(Ctrl\+Enter\)/);
  assert.doesNotMatch(html, /Transaction:/);
});
