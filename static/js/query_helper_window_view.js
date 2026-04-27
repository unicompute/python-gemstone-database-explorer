(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.QueryHelperWindowView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function fallbackEscHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function renderToolbarButton(button) {
    if (!button || !button.id) return '';
    return `<button class="btn-ghost" id="${button.id}" disabled>${(button.escHtml || fallbackEscHtml)(button.label || '')}</button>`;
  }

  function buildQueryHelperWindowHtml(options = {}) {
    const escHtml = options.escHtml || fallbackEscHtml;
    const buttons = Array.isArray(options.buttons) ? options.buttons : [];
    return `
    <div class="qv-wrap">
      <div class="qv-side">
        <div class="qv-filter-wrap"><input class="qv-filter" placeholder="${escHtml(options.filterPlaceholder || 'Filter results')}"></div>
        <div class="qv-list"></div>
      </div>
      <div class="qv-main">
        <div class="qv-toolbar">
          <span class="qv-title">${escHtml(options.initialTitle || 'Select a result')}</span>
          ${buttons.map(button => renderToolbarButton({...button, escHtml})).join('')}
        </div>
        <textarea class="qv-preview" readonly></textarea>
      </div>
    </div>
  `;
  }

  return {
    buildQueryHelperWindowHtml,
  };
});
