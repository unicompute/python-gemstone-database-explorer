const test = require('node:test');
const assert = require('node:assert/strict');

const dockContextMenuView = require('../../static/js/dock_context_menu_view.js');

test('dock context menu view renders header and action items', () => {
  const html = dockContextMenuView.buildDockContextMenuHtml({
    title: 'Workspace',
    summary: '2 open windows',
    actions: [
      {command: 'open-another', label: 'Open Another', description: 'Launch another Workspace window'},
      {command: 'close-all', label: 'Close All', description: 'Close all 2 Workspace windows', destructive: true, disabled: true},
    ],
  });

  assert.match(html, /Workspace/);
  assert.match(html, /2 open windows/);
  assert.match(html, /data-dock-context-command="open-another"/);
  assert.match(html, /Launch another Workspace window/);
  assert.match(html, /destructive/);
  assert.match(html, /disabled/);
});
