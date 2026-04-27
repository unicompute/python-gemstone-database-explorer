(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ObjectBrowserView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, '&quot;');
  }

  function buildMethodBrowserHtml(id) {
    return `
      <div id="${id}-mb" class="hidden" style="width:300px;border-left:1px solid #313244;display:flex;flex-direction:column;background:#181825;flex-shrink:0">
        <div class="mb-header">
          <span id="${id}-mb-class">Methods</span>
          <button class="mb-action" id="${id}-mb-open-browser">Class Browser</button>
          <button class="mb-close" id="${id}-mb-close">✕</button>
        </div>
        <div class="mb-split">
          <div class="mb-cats" id="${id}-mb-cats"></div>
          <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
            <div class="mb-sels" id="${id}-mb-sels"></div>
            <div class="mb-src">
              <textarea id="${id}-mb-src" readonly placeholder="Select a method…"></textarea>
              <div class="mb-statusbar" id="${id}-mb-status">No method selected</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function buildCompactObjectBrowserHtml(id) {
    return `
    <div style="display:flex;flex:1;min-height:0;overflow:hidden">
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
        <div class="inspector-strip" id="${id}-itabs" style="display:none"></div>
        <div class="inspector-body" id="${id}-ibody">
          <p style="color:#6c7086;padding:12px">Loading object…</p>
        </div>
      </div>
      ${buildMethodBrowserHtml(id)}
    </div>
  `;
  }

  function buildFullObjectBrowserHtml(id) {
    return `
    <div style="display:flex;flex:1;min-height:0;overflow:hidden">
      <div class="win-sidebar">
        <h2>Roots</h2>
        <ul class="sidebar-list" id="${id}-roots"></ul>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
        <div class="breadcrumb" id="${id}-bc"></div>
        <div style="display:flex;flex:1;overflow:hidden">
          <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
            <div class="inspector-strip" id="${id}-itabs" style="display:none"></div>
            <div class="inspector-body" id="${id}-ibody">
              <p style="color:#6c7086;padding:12px">Select a root object to begin.</p>
            </div>
          </div>
          ${buildMethodBrowserHtml(id)}
        </div>
        <div class="eval-panel">
          <label>Evaluate</label>
          <textarea class="eval-code" id="${id}-eval-code" placeholder="self printString"></textarea>
          <div class="eval-controls">
            <button class="btn" id="${id}-eval-btn">Evaluate</button>
            <span class="eval-result-wrap"><span class="eval-result" id="${id}-eval-res"></span></span>
          </div>
        </div>
        <div class="txbar">
          <span>Transaction:</span>
          <button class="btn-tx" id="${id}-abort">Abort</button>
          <button class="btn-tx" id="${id}-commit">Commit</button>
          <button class="btn-tx" id="${id}-continue" style="background:#4a90d9">Continue</button>
          <span id="${id}-tx-res" class="txbar-result hidden"></span>
        </div>
      </div>
    </div>
  `;
  }

  function buildObjectBrowserWindowHtml(id, options = {}) {
    return options.compactMode ? buildCompactObjectBrowserHtml(id) : buildFullObjectBrowserHtml(id);
  }

  function buildInspectorTabsHtml(tabIds = [], currentTab = '', captionFor = () => '', dimTabId = 'control') {
    return tabIds.map(tabId => {
      const classes = ['inspector-tab'];
      if (tabId === currentTab) classes.push('active');
      if (tabId === dimTabId) classes.push('dim');
      return `<div class="${classes.join(' ')}" data-itab="${escapeAttr(tabId)}">${escapeHtml(captionFor(tabId) || tabId)}</div>`;
    }).join('');
  }

  function buildMethodBrowserCategoriesHtml(categories = [], activeCategory = '') {
    if (!categories.length) {
      return '<div class="mb-cat" style="color:#6c7086">(no methods)</div>';
    }
    return categories.map(category => {
      const classes = ['mb-cat'];
      if (category === activeCategory) classes.push('active');
      const label = category || '(uncategorized)';
      return `<div class="${classes.join(' ')}" data-category="${escapeAttr(category)}">${escapeHtml(label)}</div>`;
    }).join('');
  }

  function buildMethodBrowserSelectorsHtml(selectors = [], activeSelector = '') {
    return selectors.map(selector => {
      const classes = ['mb-sel'];
      if (selector === activeSelector) classes.push('active');
      return `<div class="${classes.join(' ')}" data-selector="${escapeAttr(selector)}">${escapeHtml(selector)}</div>`;
    }).join('');
  }

  return {
    buildObjectBrowserWindowHtml,
    buildInspectorTabsHtml,
    buildMethodBrowserCategoriesHtml,
    buildMethodBrowserSelectorsHtml,
  };
});
