(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.StatusLogWindowView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function fallbackEscHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildStatusLogListHtml(viewState = {}, helpers = {}) {
    const escHtml = helpers.escHtml || fallbackEscHtml;
    const resolveStatusEntrySourceWindow = typeof helpers.resolveStatusEntrySourceWindow === 'function'
      ? helpers.resolveStatusEntrySourceWindow
      : () => null;
    const formatStatusTimestamp = typeof helpers.formatStatusTimestamp === 'function'
      ? helpers.formatStatusTimestamp
      : value => String(value || '');
    const entries = Array.isArray(viewState.reversedEntries) ? viewState.reversedEntries : [];
    const totalCount = Number(viewState.totalCount || 0);

    if (!entries.length) {
      return `<div class="status-log-empty">${totalCount ? 'No status entries match the current filter.' : 'No status entries yet.'}</div>`;
    }

    return entries.map((entry, index) => {
      const sourceLabel = entry.sourceTitle || entry.sourceKind || 'Window';
      const sourceWindow = resolveStatusEntrySourceWindow(entry);
      const sourceHtml = (entry.sourceTitle || entry.sourceKind) ? `
            <div class="status-log-source">
              <span>Source</span>
              ${sourceWindow
                ? `<button type="button" class="status-log-source-badge status-log-source-button" data-source-entry-index="${index}">${escHtml(sourceLabel)}</button>`
                : `<span class="status-log-source-badge missing">${escHtml(sourceLabel)}</span><span class="status-log-source-note">Closed</span>`}
            </div>
          ` : '';
      return `
      <div class="status-log-entry ${entry.ok ? 'ok' : 'error'}">
        <div class="status-log-time">${escHtml(formatStatusTimestamp(entry.timestamp))}</div>
        <div class="status-log-message">
          ${sourceHtml}
          ${escHtml(entry.message)}${entry.count > 1 ? `<span class="status-log-count">×${entry.count}</span>` : ''}
        </div>
      </div>
    `;
    }).join('');
  }

  function buildStatusLogWindowView(viewState = {}, helpers = {}) {
    return {
      metaText: String(viewState.metaText || ''),
      copyLabel: String(viewState.copyLabel || 'Copy JSON'),
      downloadLabel: String(viewState.downloadLabel || 'Download JSON'),
      listHtml: buildStatusLogListHtml(viewState, helpers),
    };
  }

  return {
    buildStatusLogListHtml,
    buildStatusLogWindowView,
  };
});
