(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DockWindowPreviewView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildDockWindowPreviewHtml(state = {}) {
    const title = state.title || 'Windows';
    const summary = state.summary || '';
    const windows = Array.isArray(state.windows) ? state.windows : [];
    const itemsHtml = windows.length
      ? windows.map(item => `
        <button
          type="button"
          class="dock-window-preview-item${item.active ? ' active' : ''}"
          data-dock-preview-window-id="${escapeHtml(item.id || '')}"
        >
          <span class="dock-window-preview-item-title">${escapeHtml(item.title || '')}</span>
          ${item.description ? `<span class="dock-window-preview-item-description">${escapeHtml(item.description)}</span>` : ''}
          ${item.meta ? `<span class="dock-window-preview-item-meta">${escapeHtml(item.meta)}</span>` : ''}
        </button>
      `).join('')
      : '<div class="dock-window-preview-empty">No windows are open.</div>';

    return `
      <div class="dock-window-preview-header">
        <div class="dock-window-preview-title">${escapeHtml(title)}</div>
        ${summary ? `<div class="dock-window-preview-summary">${escapeHtml(summary)}</div>` : ''}
      </div>
      <div class="dock-window-preview-list">${itemsHtml}</div>
    `;
  }

  return {
    buildDockWindowPreviewHtml,
  };
});
