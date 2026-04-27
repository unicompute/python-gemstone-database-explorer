(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DockLauncherView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function filterLauncherSections(sections = [], query = '') {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    if (!normalizedQuery) {
      return sections.map(section => ({...section, items: Array.isArray(section.items) ? section.items.slice() : []}));
    }
    return sections.map(section => {
      const items = (Array.isArray(section.items) ? section.items : []).filter(item => {
        const haystack = [
          item.title,
          item.description,
          item.meta,
          item.keywords,
          section.title,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(normalizedQuery);
      });
      return {...section, items};
    }).filter(section => section.items.length);
  }

  function buildLauncherItemHtml(item, layout, index, selectedIndex) {
    const command = item.command || '';
    const value = item.value == null ? '' : String(item.value);
    const classes = ['dock-launcher-item', `dock-launcher-item-${layout}`];
    if (item.active) classes.push('active');
    if (item.muted) classes.push('muted');
    if (index === selectedIndex) classes.push('keyboard-active');
    const shellClasses = ['dock-launcher-item-shell', `dock-launcher-item-shell-${layout}`];
    const pinTitle = item.title ? `${item.pinned ? 'Unpin' : 'Pin'} ${item.title}` : (item.pinned ? 'Unpin app' : 'Pin app');
    const badgeTone = String(item.badgeTone || '').trim() || 'info';
    const badgeText = item.badgeText == null ? '' : String(item.badgeText).trim();
    const badgeHtml = badgeText
      ? `<span class="dock-launcher-item-badge" data-launcher-item-badge="${escapeHtml(badgeText)}" data-tone="${escapeHtml(badgeTone)}">${escapeHtml(badgeText)}</span>`
      : '';
    return `
      <div
        class="${shellClasses.join(' ')}"
        data-launcher-item-command="${escapeHtml(command)}"
      >
        <button
          type="button"
          class="${classes.join(' ')}"
          data-launcher-command="${escapeHtml(command)}"
          data-launcher-value="${escapeHtml(value)}"
          data-launcher-index="${escapeHtml(index)}"
          aria-label="${escapeHtml(item.title || '')}"
          aria-current="${index === selectedIndex ? 'true' : 'false'}"
        >
          <span class="dock-launcher-item-title-row"><span class="dock-launcher-item-title">${escapeHtml(item.title || '')}</span>${badgeHtml}</span>
          ${item.description ? `<span class="dock-launcher-item-description">${escapeHtml(item.description)}</span>` : ''}
          ${item.meta ? `<span class="dock-launcher-item-meta">${escapeHtml(item.meta)}</span>` : ''}
        </button>
        ${item.pinnable ? `
          <button
            type="button"
            class="dock-launcher-item-pin${item.pinned ? ' active' : ''}"
            data-launcher-pin-command="${escapeHtml(command)}"
            aria-label="${item.pinned ? 'Unpin app' : 'Pin app'}"
            title="${escapeHtml(pinTitle)}"
          >${item.pinned ? '★' : '☆'}</button>
        ` : ''}
      </div>
    `;
  }

  function buildSectionHtml(section, selectedIndex, startIndex) {
    const items = Array.isArray(section.items) ? section.items : [];
    const layout = section.layout === 'list' ? 'list' : 'grid';
    const sectionBody = items.length
      ? `<div class="dock-launcher-${layout}">${items.map((item, index) => buildLauncherItemHtml(item, layout, startIndex + index, selectedIndex)).join('')}</div>`
      : `<div class="dock-launcher-empty">${escapeHtml(section.emptyText || 'No items')}</div>`;
    return `
      <section class="dock-launcher-section" data-launcher-section-key="${escapeHtml(section.key || '')}">
        <div class="dock-launcher-section-title">${escapeHtml(section.title || '')}</div>
        ${sectionBody}
      </section>
    `;
  }

  function buildDockLauncherView(state = {}) {
    const query = String(state.query || '');
    const filteredSections = filterLauncherSections(state.sections || [], query);
    const hasQuery = !!query.trim();
    const visibleItems = filteredSections.flatMap(section => section.items || []);
    const selectedIndex = visibleItems.length
      ? Math.max(0, Math.min(Number.isFinite(Number(state.selectedIndex)) ? Number(state.selectedIndex) : 0, visibleItems.length - 1))
      : -1;
    let nextOffset = 0;
    const renderedSections = filteredSections
      .filter(section => section.items.length || (!hasQuery && section.emptyText))
      .map(section => {
        const html = buildSectionHtml(section, selectedIndex, nextOffset);
        nextOffset += Array.isArray(section.items) ? section.items.length : 0;
        return html;
      });
    const summaryText = hasQuery
      ? `${visibleItems.length} result${visibleItems.length === 1 ? '' : 's'} for "${query.trim()}"`
      : `${visibleItems.length} launcher items`;

    return {
      html: `
        <div class="dock-launcher-header">
          <div class="dock-launcher-title-wrap">
            <div class="dock-launcher-title">Start</div>
            <div class="dock-launcher-subtitle">Search apps, actions, and open windows</div>
          </div>
          <div class="dock-launcher-summary">${escapeHtml(summaryText)}</div>
        </div>
        <div class="dock-launcher-search-wrap">
          <input
            id="dock-launcher-search"
            class="dock-launcher-search"
            type="text"
            value="${escapeHtml(query)}"
            placeholder="Search apps and actions"
            autocomplete="off"
            spellcheck="false"
          >
        </div>
        <div class="dock-launcher-content">
          ${renderedSections.length ? renderedSections.join('') : '<div class="dock-launcher-empty dock-launcher-empty-global">No matches. Try another search.</div>'}
        </div>
        <div class="dock-launcher-footer">Arrow keys move through results. Enter launches the selection. Ctrl+Space or / opens the menu. Esc closes it.</div>
      `,
      visibleItems,
      selectedIndex,
    };
  }

  return {
    filterLauncherSections,
    buildDockLauncherView,
  };
});
