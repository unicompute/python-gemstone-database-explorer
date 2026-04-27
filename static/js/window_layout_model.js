(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WindowLayoutModel = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function sanitizeSelectionIndex(index, items) {
    const numeric = Number(index);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min((items?.length || 1) - 1, Math.round(numeric)));
  }

  function parsePixelValue(value, fallback = 0) {
    const numeric = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function buildWindowLayoutSnapshot(entries) {
    const windows = Array.isArray(entries) ? entries.slice() : [];
    return {
      version: 1,
      windows: windows.sort((left, right) => Number(left?.zIndex || 0) - Number(right?.zIndex || 0)),
    };
  }

  function hasRecoverableWindows(snapshot) {
    const windows = Array.isArray(snapshot?.windows) ? snapshot.windows : [];
    return windows.some(entry => entry && entry.kind !== 'connection');
  }

  function normalizeStoredWindowLayout(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (Array.isArray(value?.windows)) return value.windows.filter(Boolean);
    return [];
  }

  function chooseRecoverableWindowLayout(currentEntries, healthyEntries) {
    const normalizedHealthy = normalizeStoredWindowLayout(healthyEntries);
    if (normalizedHealthy.length) return normalizedHealthy;
    return normalizeStoredWindowLayout(currentEntries).filter(entry => entry && entry.kind !== 'connection');
  }

  function sortWindowLayoutEntries(entries) {
    return normalizeStoredWindowLayout(entries)
      .slice()
      .sort((left, right) => Number(left?.zIndex || 0) - Number(right?.zIndex || 0));
  }

  return {
    sanitizeSelectionIndex,
    parsePixelValue,
    buildWindowLayoutSnapshot,
    hasRecoverableWindows,
    normalizeStoredWindowLayout,
    chooseRecoverableWindowLayout,
    sortWindowLayoutEntries,
  };
});
