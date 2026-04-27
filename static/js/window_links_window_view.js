(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WindowLinksWindowView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function fallbackEscHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildWindowLinksListHtml(viewState = {}, helpers = {}) {
    const escHtml = helpers.escHtml || fallbackEscHtml;
    const links = Array.isArray(viewState.links) ? viewState.links : [];
    const selectedIndex = Number.isFinite(Number(viewState.selectedIndex)) ? Number(viewState.selectedIndex) : 0;
    const viewMode = viewState.viewMode === 'related' ? 'related' : 'all';
    const scopedCount = Number(viewState.scopedCount || 0);
    const allCount = Number(viewState.allCount || 0);

    if (!scopedCount) {
      return `<div class="status-log-empty">${viewMode === 'related' ? 'No window links are currently related to the source window.' : (allCount ? 'No window links match the current view.' : 'No window links are currently open.')}</div>`;
    }
    if (!links.length) {
      return `<div class="status-log-empty">No window links match the current filter.</div>`;
    }

    return links.map((link, index) => {
      const fromHtml = link.fromAvailable
        ? `<button type="button" class="window-link-endpoint window-link-button" data-link-endpoint="from" data-link-index="${index}"><span>${escHtml(link.fromTitle || link.fromId)}</span><span class="window-link-kind">${escHtml(link.fromKind || 'window')}</span></button>`
        : `<span class="window-link-endpoint missing"><span>${escHtml(link.fromTitle || link.fromId)}</span><span class="window-link-kind">${escHtml(link.fromKind || 'window')}</span></span>`;
      const toHtml = link.toAvailable
        ? `<button type="button" class="window-link-endpoint window-link-button" data-link-endpoint="to" data-link-index="${index}"><span>${escHtml(link.toTitle || link.toId)}</span><span class="window-link-kind">${escHtml(link.toKind || 'window')}</span></button>`
        : `<span class="window-link-endpoint missing"><span>${escHtml(link.toTitle || link.toId)}</span><span class="window-link-kind">${escHtml(link.toKind || 'window')}</span></span>`;
      return `
        <div class="window-link-entry ${selectedIndex === index ? 'active' : ''}" data-link-row-index="${index}" tabindex="0">
          <div class="window-link-route">
            ${fromHtml}
            <span class="window-link-type">${escHtml(link.type || 'link')}</span>
            ${toHtml}
          </div>
          <div class="window-link-subtitle">
            <span>${escHtml(link.fromTitle || link.fromId || 'Window')}</span>
            <span>→</span>
            <span>${escHtml(link.toTitle || link.toId || 'Window')}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function buildWindowLinksMetaText(viewState = {}) {
    const links = Array.isArray(viewState.links) ? viewState.links : [];
    const scopedCount = Number(viewState.scopedCount || 0);
    const linkType = ['source', 'arrow'].includes(viewState.linkType) ? viewState.linkType : 'all';
    const viewMode = viewState.viewMode === 'related' ? 'related' : 'all';
    const sourceTitle = String(viewState.sourceTitle || '').trim() || 'source window';
    const scopeLabel = viewMode === 'related' ? `related to ${sourceTitle}` : 'across all windows';
    const exportLabel = viewState.filtered ? 'export targets current view' : 'export targets full set';
    return `${links.length} of ${scopedCount} link${scopedCount === 1 ? '' : 's'} shown · ${linkType === 'all' ? 'all link types' : `${linkType} links only`} · ${scopeLabel} · ${exportLabel}`;
  }

  function buildWindowLinksWindowView(viewState = {}, helpers = {}) {
    return {
      metaText: buildWindowLinksMetaText(viewState),
      copyLabel: viewState.filtered ? 'Copy Visible JSON' : 'Copy JSON',
      downloadLabel: viewState.filtered ? 'Download Visible JSON' : 'Download JSON',
      raiseSelectedDisabled: !(Number(viewState.selectedMembersCount || 0) > 0),
      closeSelectedDisabled: !(Number(viewState.selectedMembersCount || 0) > 0),
      listHtml: buildWindowLinksListHtml(viewState, helpers),
    };
  }

  return {
    buildWindowLinksListHtml,
    buildWindowLinksMetaText,
    buildWindowLinksWindowView,
  };
});
