const test = require('node:test');
const assert = require('node:assert/strict');

const windowLinksWindowView = require('../../static/js/window_links_window_view.js');

test('window links view renders empty related-state message', () => {
  const view = windowLinksWindowView.buildWindowLinksWindowView({
    allCount: 3,
    scopedCount: 0,
    links: [],
    linkType: 'all',
    viewMode: 'related',
    filtered: true,
  });

  assert.match(view.listHtml, /related to the source window/);
  assert.equal(view.copyLabel, 'Copy Visible JSON');
});

test('window links view renders active rows, missing endpoints, and meta text', () => {
  const view = windowLinksWindowView.buildWindowLinksWindowView({
    allCount: 3,
    scopedCount: 2,
    links: [
      {
        type: 'source',
        fromId: 'win-a',
        fromTitle: 'About',
        fromKind: 'about',
        fromAvailable: true,
        toId: 'win-b',
        toTitle: 'Status Log',
        toKind: 'status-log',
        toAvailable: false,
      },
    ],
    selectedIndex: 0,
    selectedMembersCount: 2,
    linkType: 'source',
    viewMode: 'related',
    sourceTitle: 'About',
    filtered: true,
  });

  assert.match(view.metaText, /1 of 2 links shown/);
  assert.match(view.metaText, /related to About/);
  assert.match(view.listHtml, /window-link-entry active/);
  assert.match(view.listHtml, /window-link-button/);
  assert.match(view.listHtml, /window-link-endpoint missing/);
  assert.equal(view.raiseSelectedDisabled, false);
});
