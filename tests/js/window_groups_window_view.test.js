const test = require('node:test');
const assert = require('node:assert/strict');

const windowGroupsWindowView = require('../../static/js/window_groups_window_view.js');

test('window groups view renders empty linked-state message', () => {
  const view = windowGroupsWindowView.buildWindowGroupsWindowView({
    groups: [],
    visibleGroups: [],
    totalWindows: 0,
    visibleWindows: 0,
    largestGroupSize: 0,
    viewMode: 'linked',
    filtered: true,
  });

  assert.match(view.listHtml, /No linked window groups are currently open/);
  assert.equal(view.copyLabel, 'Copy Visible JSON');
});

test('window groups view renders group cards and meta text', () => {
  const groups = [{
    size: 2,
    focused: true,
    minimisedCount: 1,
    kinds: ['about', 'status-log'],
    primaryId: 'win-about',
    primaryTitle: 'About',
    titles: ['About', 'Status Log'],
    members: [
      {id: 'win-about', title: 'About', kind: 'about'},
      {id: 'win-status', title: 'Status Log', kind: 'status-log'},
    ],
  }];
  const view = windowGroupsWindowView.buildWindowGroupsWindowView({
    groups,
    visibleGroups: groups,
    totalWindows: 3,
    visibleWindows: 2,
    largestGroupSize: 2,
    viewMode: 'linked',
    filtered: true,
  });

  assert.match(view.metaText, /1 of 1 group shown/);
  assert.match(view.metaText, /largest group 2 windows/);
  assert.match(view.listHtml, /focused-group/);
  assert.match(view.listHtml, /data-group-seed-id="win-about"/);
  assert.match(view.listHtml, /data-window-id="win-status"/);
  assert.equal(view.raiseLargestDisabled, false);
});
