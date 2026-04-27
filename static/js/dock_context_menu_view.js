(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DockContextMenuView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildDockContextMenuHtml(state = {}) {
    const title = state.title || 'Windows';
    const summary = state.summary || '';
    const actions = Array.isArray(state.actions) ? state.actions : [];
    const actionsHtml = actions.length
      ? actions.map(action => `
        <button
          type="button"
          class="dock-context-menu-item${action.destructive ? ' destructive' : ''}"
          data-dock-context-command="${escapeHtml(action.command || '')}"
          ${action.disabled ? 'disabled' : ''}
        >
          <span class="dock-context-menu-item-title">${escapeHtml(action.label || '')}</span>
          ${action.description ? `<span class="dock-context-menu-item-description">${escapeHtml(action.description)}</span>` : ''}
        </button>
      `).join('')
      : '<div class="dock-context-menu-empty">No actions available.</div>';

    return `
      <div class="dock-context-menu-header">
        <div class="dock-context-menu-title">${escapeHtml(title)}</div>
        ${summary ? `<div class="dock-context-menu-summary">${escapeHtml(summary)}</div>` : ''}
      </div>
      <div class="dock-context-menu-actions">${actionsHtml}</div>
    `;
  }

  return {
    buildDockContextMenuHtml,
  };
});
