const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/maglev_report_window_runtime.js');

test('maglev report window runtime loads report text and updates title/state', async () => {
  const states = [];
  const titles = [];
  const preview = { textContent: '' };
  const body = {
    innerHTML: '',
    querySelector(selector) {
      if (selector === 'pre') return preview;
      return null;
    },
  };

  const report = runtime.createMaglevReportWindowRuntime({
    id: 'report-win',
    body,
    title: 'Initial Report',
    reportKey: 'load-path',
    api(url) {
      assert.equal(url, '/maglev/report/load-path');
      return Promise.resolve({
        title: 'Load Path',
        reportKey: 'load-path',
        text: 'line one\nline two',
      });
    },
    applyTitle(titleText) {
      titles.push(titleText);
    },
    upsertWindowState(id, state) {
      states.push({ id, state });
    },
  });

  report.mount();
  await report.load();

  assert.match(body.innerHTML, /qv-preview-text/);
  assert.equal(preview.textContent, 'line one\nline two');
  assert.deepEqual(titles, ['Load Path', 'Load Path']);
  assert.deepEqual(states.at(0), {
    id: 'report-win',
    state: {
      kind: 'maglev-report',
      reportKey: 'load-path',
      reportTitle: 'Initial Report',
    },
  });
  assert.deepEqual(states.at(-1), {
    id: 'report-win',
    state: {
      kind: 'maglev-report',
      reportKey: 'load-path',
      reportTitle: 'Load Path',
    },
  });
});
