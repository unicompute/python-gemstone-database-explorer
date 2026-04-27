const test = require('node:test');
const assert = require('node:assert/strict');

const dockLauncherView = require('../../static/js/dock_launcher_view.js');

test('dock launcher view filters sections by query', () => {
  const sections = [
    {title: 'Pinned', items: [
      {title: 'Workspace', description: 'Scratchpad'},
      {title: 'Class Browser', description: 'Browse classes'},
    ]},
    {title: 'Open Windows', items: [
      {title: 'About', description: 'about'},
    ]},
  ];

  const filtered = dockLauncherView.filterLauncherSections(sections, 'work');

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].items.length, 1);
  assert.equal(filtered[0].items[0].title, 'Workspace');
});

test('dock launcher view renders sections and visible items', () => {
  const {html, visibleItems, selectedIndex} = dockLauncherView.buildDockLauncherView({
    query: '',
    selectedIndex: 1,
    sections: [
      {
        key: 'pinned',
        title: 'Pinned',
        layout: 'grid',
        items: [
          {command: 'open-workspace', title: 'Workspace', description: 'Scratchpad', pinnable: true, pinned: true},
        ],
      },
      {
        key: 'open-windows',
        title: 'Open Windows',
        layout: 'list',
        items: [
          {command: 'focus-window', value: 'win-1', title: 'Workspace', meta: 'Focused', badgeText: '2', badgeTone: 'error'},
        ],
      },
    ],
  });

  assert.match(html, /Search apps and actions/);
  assert.match(html, /data-launcher-section-key="pinned"/);
  assert.match(html, /data-launcher-command="open-workspace"/);
  assert.match(html, /data-launcher-pin-command="open-workspace"/);
  assert.match(html, /data-launcher-index="1"/);
  assert.match(html, /keyboard-active/);
  assert.match(html, /data-launcher-command="focus-window"/);
  assert.match(html, /Focused/);
  assert.match(html, /data-launcher-item-badge="2"/);
  assert.match(html, /data-tone="error"/);
  assert.equal(visibleItems.length, 2);
  assert.equal(selectedIndex, 1);
});
