const test = require('node:test');
const assert = require('node:assert/strict');

const queryHelperWindowView = require('../../static/js/query_helper_window_view.js');

test('query helper window view builds toolbar buttons and preview shell', () => {
  const html = queryHelperWindowView.buildQueryHelperWindowHtml({
    filterPlaceholder: 'Filter versions',
    initialTitle: 'Select a version',
    buttons: [
      {id: 'qv-load-version', label: 'Load Into Browser'},
      {id: 'qv-open-version', label: 'Open In Browser'},
      {id: 'qv-inspect-version', label: 'Inspect Version'},
    ],
  });

  assert.match(html, /Filter versions/);
  assert.match(html, /qv-load-version/);
  assert.match(html, /qv-open-version/);
  assert.match(html, /qv-preview/);
});
