(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.StatusLogWindowModel = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STATUS_LOG_LEVELS = ['all', 'ok', 'error'];

  function normalizeStatusLogLevel(level) {
    const value = String(level || '').trim().toLowerCase();
    return STATUS_LOG_LEVELS.includes(value) ? value : 'all';
  }

  function formatStatusTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '');
    return date.toLocaleString();
  }

  function filterStatusEntries(entries = [], options = {}) {
    const level = normalizeStatusLogLevel(options.level);
    const text = String(options.filterText || '').trim().toLowerCase();
    return (Array.isArray(entries) ? entries : []).filter(entry => {
      if (level === 'ok' && !entry?.ok) return false;
      if (level === 'error' && !!entry?.ok) return false;
      if (!text) return true;
      const haystacks = [
        entry?.message || '',
        entry?.sourceTitle || '',
        entry?.sourceKind || '',
      ];
      return haystacks.some(value => String(value).toLowerCase().includes(text));
    });
  }

  function isFilteredStatusView(options = {}) {
    return !!String(options.filterText || '').trim() || normalizeStatusLogLevel(options.level) !== 'all';
  }

  function statusEntriesForExport(entries = [], options = {}) {
    return isFilteredStatusView(options) ? filterStatusEntries(entries, options) : (Array.isArray(entries) ? entries : []);
  }

  function buildStatusLogMeta(filteredCount, totalCount, exportFiltered) {
    return `${filteredCount} of ${totalCount} entr${totalCount === 1 ? 'y' : 'ies'} shown · ${exportFiltered ? 'export targets current view' : 'export targets full history'}`;
  }

  function buildStatusLogViewState(entries = [], options = {}) {
    const level = normalizeStatusLogLevel(options.level);
    const filterText = String(options.filterText || '');
    const allEntries = Array.isArray(entries) ? entries : [];
    const filtered = filterStatusEntries(allEntries, {filterText, level});
    const reversedEntries = filtered.slice().reverse();
    const exportFiltered = isFilteredStatusView({filterText, level});
    return {
      level,
      filterText,
      totalCount: allEntries.length,
      filteredCount: filtered.length,
      filteredEntries: filtered,
      reversedEntries,
      exportFiltered,
      metaText: buildStatusLogMeta(filtered.length, allEntries.length, exportFiltered),
      copyLabel: exportFiltered ? 'Copy Visible JSON' : 'Copy JSON',
      downloadLabel: exportFiltered ? 'Download Visible JSON' : 'Download JSON',
    };
  }

  return {
    STATUS_LOG_LEVELS,
    normalizeStatusLogLevel,
    formatStatusTimestamp,
    filterStatusEntries,
    isFilteredStatusView,
    statusEntriesForExport,
    buildStatusLogMeta,
    buildStatusLogViewState,
  };
});
