(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ClassBrowserModel = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_PANE_WIDTHS = [160, 220, 180, 220];
  const PANE_MIN_WIDTHS = [120, 160, 140, 180];
  const PANE_ORDER = ['dicts', 'classes', 'protocols', 'methods'];

  function hierarchyScopeLabel(scope) {
    return ({
      all: 'All Classes',
      full: 'Full Hierarchy',
      super: 'Superclasses',
      this: 'This Class',
      sub: 'Subclasses',
    })[scope] || 'Full Hierarchy';
  }

  function initialActivePaneKey(state = {}) {
    return state.currentMethod ? 'methods' : (state.currentClass ? 'classes' : 'dicts');
  }

  function normalizeFilterText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function getVisiblePaneItems(items = [], filterText = '') {
    const normalizedFilter = normalizeFilterText(filterText);
    const allItems = Array.isArray(items) ? items.slice() : [];
    return normalizedFilter
      ? allItems.filter(item => String(item).toLowerCase().includes(normalizedFilter))
      : allItems;
  }

  function clampPaneWidths(widths, options = {}) {
    const defaultWidths = Array.isArray(options.defaultWidths) ? options.defaultWidths : DEFAULT_PANE_WIDTHS;
    const minWidths = Array.isArray(options.minWidths) ? options.minWidths : PANE_MIN_WIDTHS;
    const next = Array.isArray(widths) ? widths.slice(0, 4) : [];
    while (next.length < 4) next.push(defaultWidths[next.length]);
    return next.map((width, index) => {
      const numeric = Number(width);
      return Number.isFinite(numeric)
        ? Math.max(minWidths[index], Math.round(numeric))
        : defaultWidths[index];
    });
  }

  function parseStoredPaneWidths(raw, options = {}) {
    const defaultWidths = Array.isArray(options.defaultWidths) ? options.defaultWidths : DEFAULT_PANE_WIDTHS;
    try {
      if (!raw) return [...defaultWidths];
      return clampPaneWidths(JSON.parse(raw), options);
    } catch (_) {
      return [...defaultWidths];
    }
  }

  function buildBrowserCacheKey(name, keyParts) {
    return `${name}:${JSON.stringify(keyParts || {})}`;
  }

  function nextPaneKey(fromKey, delta, paneOrder = PANE_ORDER) {
    const currentIndex = Math.max(0, paneOrder.indexOf(fromKey));
    const nextIndex = Math.max(0, Math.min(paneOrder.length - 1, currentIndex + delta));
    return paneOrder[nextIndex];
  }

  function currentPaneItem(items = [], active, filterText = '') {
    const visibleItems = getVisiblePaneItems(items, filterText);
    if (!visibleItems.length) return null;
    return visibleItems.includes(active) ? active : visibleItems[0];
  }

  function relativePaneItem(items = [], active, filterText = '', delta = 0) {
    const visibleItems = getVisiblePaneItems(items, filterText);
    if (!visibleItems.length) return null;
    let currentIndex = visibleItems.indexOf(active);
    if (currentIndex < 0) currentIndex = delta >= 0 ? -1 : visibleItems.length;
    const nextIndex = Math.max(0, Math.min(visibleItems.length - 1, currentIndex + delta));
    return visibleItems[nextIndex];
  }

  function boundaryPaneItem(items = [], filterText = '', boundary = 'first') {
    const visibleItems = getVisiblePaneItems(items, filterText);
    if (!visibleItems.length) return null;
    return boundary === 'last' ? visibleItems[visibleItems.length - 1] : visibleItems[0];
  }

  function filterMatchesValue(filterText, value) {
    const normalizedFilter = normalizeFilterText(filterText);
    return !normalizedFilter || String(value || '').toLowerCase().includes(normalizedFilter);
  }

  return {
    DEFAULT_PANE_WIDTHS,
    PANE_MIN_WIDTHS,
    PANE_ORDER,
    hierarchyScopeLabel,
    initialActivePaneKey,
    normalizeFilterText,
    getVisiblePaneItems,
    clampPaneWidths,
    parseStoredPaneWidths,
    buildBrowserCacheKey,
    nextPaneKey,
    currentPaneItem,
    relativePaneItem,
    boundaryPaneItem,
    filterMatchesValue,
  };
});
