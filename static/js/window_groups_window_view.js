(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WindowGroupsWindowView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function fallbackEscHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildWindowGroupsListHtml(viewState = {}, helpers = {}) {
    const escHtml = helpers.escHtml || fallbackEscHtml;
    const groups = Array.isArray(viewState.groups) ? viewState.groups : [];
    const visibleGroups = Array.isArray(viewState.visibleGroups) ? viewState.visibleGroups : [];
    const viewMode = viewState.viewMode === 'linked' ? 'linked' : 'all';

    if (!groups.length) {
      return `<div class="window-group-empty">${viewMode === 'linked' ? 'No linked window groups are currently open.' : 'No grouped windows are currently open.'}</div>`;
    }
    if (!visibleGroups.length) {
      return `<div class="window-group-empty">No window groups match the current filter.</div>`;
    }

    return visibleGroups.map((group, index) => {
      const subtitle = [
        `${group.size} windows`,
        group.focused ? 'focused' : '',
        group.minimisedCount ? `${group.minimisedCount} minimised` : '',
        (group.kinds || []).join(', '),
      ].filter(Boolean).join(' · ');
      const leadTitle = group.primaryTitle || group.titles?.[0] || `Group ${index + 1}`;
      const seedId = group.primaryId || group.members?.[0]?.id || '';
      return `
        <div class="window-group-card ${group.focused ? 'focused-group' : ''}">
          <div class="window-group-header">
            <div>
              <div class="window-group-title">${escHtml(leadTitle)}</div>
              <div class="window-group-subtitle">${escHtml(subtitle || 'window group')}</div>
            </div>
            <div class="status-log-controls">
              <button class="btn-ghost" data-group-seed-id="${escHtml(seedId)}">Raise Group</button>
              <button class="btn-ghost" data-close-group-seed-id="${escHtml(seedId)}">Close Group</button>
            </div>
          </div>
          <div class="window-group-members">
            ${(group.members || []).map(member => `
              <button type="button" class="window-group-member" data-window-id="${escHtml(member.id)}">
                <span>${escHtml(member.title || member.id)}</span>
                <span class="window-group-member-kind">${escHtml(member.kind || 'window')}</span>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  function buildWindowGroupsMetaText(viewState = {}) {
    const groups = Array.isArray(viewState.groups) ? viewState.groups : [];
    const visibleGroups = Array.isArray(viewState.visibleGroups) ? viewState.visibleGroups : [];
    const totalWindows = Number(viewState.totalWindows || 0);
    const visibleWindows = Number(viewState.visibleWindows || 0);
    const largestGroupSize = Number(viewState.largestGroupSize || 0);
    const viewMode = viewState.viewMode === 'linked' ? 'linked' : 'all';
    const scopeLabel = viewMode === 'linked' ? 'linked groups only' : 'including singletons';
    const exportLabel = viewState.filtered ? 'export targets current view' : 'export targets full set';
    return `${visibleGroups.length} of ${groups.length} group${groups.length === 1 ? '' : 's'} shown · ${visibleWindows} of ${totalWindows} window${totalWindows === 1 ? '' : 's'} visible · ${scopeLabel} · ${exportLabel} · largest group ${largestGroupSize} window${largestGroupSize === 1 ? '' : 's'}`;
  }

  function buildWindowGroupsWindowView(viewState = {}, helpers = {}) {
    const visibleGroups = Array.isArray(viewState.visibleGroups) ? viewState.visibleGroups : [];
    return {
      metaText: buildWindowGroupsMetaText(viewState),
      copyLabel: viewState.filtered ? 'Copy Visible JSON' : 'Copy JSON',
      downloadLabel: viewState.filtered ? 'Download Visible JSON' : 'Download JSON',
      raiseLargestDisabled: !visibleGroups.length,
      closeLargestDisabled: !visibleGroups.length,
      listHtml: buildWindowGroupsListHtml(viewState, helpers),
    };
  }

  return {
    buildWindowGroupsListHtml,
    buildWindowGroupsMetaText,
    buildWindowGroupsWindowView,
  };
});
