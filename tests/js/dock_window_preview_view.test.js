const test = require('node:test');
const assert = require('node:assert/strict');

const dockWindowPreviewView = require('../../static/js/dock_window_preview_view.js');

test('dock window preview view renders window items and active state', () => {
  const html = dockWindowPreviewView.buildDockWindowPreviewHtml({
    title: 'Workspace',
    summary: '2 open windows',
    windows: [
      {id: 'win-1', title: 'Workspace', description: 'Workspace 1', meta: 'Focused', active: true},
      {id: 'win-2', title: 'Workspace', description: 'Workspace 2', meta: 'Open'},
    ],
  });

  assert.match(html, /Workspace/);
  assert.match(html, /2 open windows/);
  assert.match(html, /data-dock-preview-window-id="win-1"/);
  assert.match(html, /Workspace 1/);
  assert.match(html, /Focused/);
  assert.match(html, /dock-window-preview-item active/);
});
