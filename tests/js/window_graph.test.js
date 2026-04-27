const test = require('node:test');
const assert = require('node:assert/strict');

const windowGraph = require('../../static/js/window_graph.js');

function sampleWindows() {
  return [
    {id: 'about', title: 'About', kind: 'about', zIndex: 10},
    {id: 'status', title: 'Status Log', kind: 'status-log', sourceWindowId: 'about', zIndex: 20},
    {id: 'groups', title: 'Window Groups', kind: 'window-groups', sourceWindowId: 'about', zIndex: 30},
    {id: 'object', title: 'Object', kind: 'object', zIndex: 40},
    {id: 'connection', title: 'Connection', kind: 'connection', zIndex: 50},
  ];
}

function sampleArrows() {
  return [
    {srcWinId: 'status', dstWinId: 'object'},
  ];
}

test('window graph derives related ids, link summaries, and group summaries deterministically', () => {
  const relatedIds = windowGraph.getRelatedWindowIds('about', sampleWindows(), sampleArrows());
  assert.deepEqual(new Set(relatedIds), new Set(['about', 'status', 'groups', 'object']));

  const links = windowGraph.collectWindowLinkSummaries(sampleWindows(), sampleArrows());
  assert.deepEqual(
    links.map(link => [link.type, link.fromId, link.toId]),
    [
      ['arrow', 'status', 'object'],
      ['source', 'about', 'status'],
      ['source', 'about', 'groups'],
    ]
  );

  const groups = windowGraph.collectWindowGroupSummaries(sampleWindows(), sampleArrows());
  assert.equal(groups.length, 2);
  assert.equal(groups[0].primaryId, 'about');
  assert.equal(groups[0].size, 4);
  assert.deepEqual(groups[0].titles, ['About', 'Status Log', 'Window Groups', 'Object']);
  assert.equal(groups[1].primaryId, 'connection');
  assert.equal(groups[1].size, 1);
});

test('window link export scopes related links and filtered views', () => {
  const payload = windowGraph.buildWindowLinksExport(sampleWindows(), sampleArrows(), {
    viewMode: 'related',
    sourceWindowId: 'about',
    sourceTitle: 'About',
    linkType: 'source',
    filterText: 'status',
  });

  assert.equal(payload.exportScope, 'current-view');
  assert.equal(payload.totalLinks, 3);
  assert.equal(payload.viewMode, 'related');
  assert.equal(payload.sourceTitle, 'About');
  assert.deepEqual(
    payload.links.map(link => [link.type, link.fromId, link.toId]),
    [['source', 'about', 'status']]
  );
});

test('window group export filters linked groups and keeps full totals', () => {
  const payload = windowGraph.buildWindowGroupsExport(sampleWindows(), sampleArrows(), {
    viewMode: 'linked',
    filterText: 'about',
  });

  assert.equal(payload.exportScope, 'current-view');
  assert.equal(payload.totalGroups, 2);
  assert.equal(payload.totalWindows, 5);
  assert.equal(payload.groups.length, 1);
  assert.equal(payload.groups[0].primaryId, 'about');
  assert.equal(payload.groups[0].size, 4);
});
