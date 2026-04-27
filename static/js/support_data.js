(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SupportData = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_STATUS_HISTORY = 200;

  function sanitizeStatusHistoryEntry(entry, timestampFactory = () => new Date().toISOString()) {
    if (!entry || typeof entry !== 'object') return null;
    const message = String(entry.message ?? '').trim();
    if (!message) return null;
    return {
      timestamp: String(entry.timestamp || timestampFactory()),
      ok: !!entry.ok,
      message,
      count: Math.max(1, Number(entry.count) || 1),
      sourceWindowId: entry.sourceWindowId ? String(entry.sourceWindowId) : null,
      sourceTitle: String(entry.sourceTitle || '').trim(),
      sourceKind: String(entry.sourceKind || '').trim(),
    };
  }

  function normalizeStatusHistory(entries, timestampFactory) {
    if (!Array.isArray(entries)) return [];
    return entries
      .map(entry => sanitizeStatusHistoryEntry(entry, timestampFactory))
      .filter(Boolean)
      .slice(-MAX_STATUS_HISTORY);
  }

  function readStatusHistory(storage, storageKey, timestampFactory) {
    if (!storage || typeof storage.getItem !== 'function') return [];
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return normalizeStatusHistory(parsed, timestampFactory);
    } catch (_) {
      return [];
    }
  }

  function writeStatusHistory(entries, storage, storageKey) {
    if (!storage || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') return;
    const normalized = normalizeStatusHistory(entries);
    try {
      if (!normalized.length) storage.removeItem(storageKey);
      else storage.setItem(storageKey, JSON.stringify(normalized));
    } catch (_) {
      // ignore storage failures
    }
  }

  function appendStatusHistoryEntry(entries, payload, timestampFactory = () => new Date().toISOString()) {
    const list = normalizeStatusHistory(entries);
    const message = String(payload?.message ?? '').trim();
    if (!message) return list;
    const source = payload?.source && typeof payload.source === 'object' ? payload.source : {};
    const timestamp = String(payload?.timestamp || timestampFactory());
    const nextEntry = {
      timestamp,
      ok: !!payload?.ok,
      message,
      count: 1,
      sourceWindowId: source.sourceWindowId ? String(source.sourceWindowId) : null,
      sourceTitle: String(source.sourceTitle || '').trim(),
      sourceKind: String(source.sourceKind || '').trim(),
    };
    const last = list[list.length - 1];
    if (
      last &&
      last.ok === nextEntry.ok &&
      last.message === nextEntry.message &&
      (last.sourceWindowId || '') === (nextEntry.sourceWindowId || '') &&
      (last.sourceTitle || '') === (nextEntry.sourceTitle || '') &&
      (last.sourceKind || '') === (nextEntry.sourceKind || '')
    ) {
      last.timestamp = timestamp;
      last.count = Math.max(1, Number(last.count) || 1) + 1;
      return list.slice(-MAX_STATUS_HISTORY);
    }
    return [...list, nextEntry].slice(-MAX_STATUS_HISTORY);
  }

  function summarizeStatusHistory(entries, resolveSourceWindow = () => null) {
    const list = normalizeStatusHistory(entries);
    let ok = 0;
    let error = 0;
    let closedSources = 0;
    let latestError = null;
    list.forEach(entry => {
      if (entry.ok) ok += 1;
      else {
        error += 1;
        latestError = entry;
      }
      if ((entry.sourceTitle || entry.sourceKind) && !resolveSourceWindow(entry)) {
        closedSources += 1;
      }
    });
    return {
      total: list.length,
      ok,
      error,
      closedSources,
      latestError,
    };
  }

  function buildDiagnosticsSnapshot(payload = {}) {
    return {
      generatedAt: payload.generatedAt || new Date().toISOString(),
      server: payload.server || {},
      browser: payload.browser || {},
      connectionOverride: payload.connectionOverride || null,
      connectionOverrideHeaders: payload.connectionOverrideHeaders || {},
      lastSuccessfulConnectionOverride: payload.lastSuccessfulConnectionOverride || null,
      favoriteConnectionProfiles: Array.isArray(payload.favoriteConnectionProfiles) ? payload.favoriteConnectionProfiles : [],
      defaultFavoriteConnectionProfile: payload.defaultFavoriteConnectionProfile || null,
      recentConnectionOverrides: Array.isArray(payload.recentConnectionOverrides) ? payload.recentConnectionOverrides : [],
      statusHistory: normalizeStatusHistory(payload.statusHistory || []),
      error: String(payload.error || ''),
    };
  }

  function buildSupportBundle(payload = {}) {
    return {
      generatedAt: payload.generatedAt || new Date().toISOString(),
      diagnostics: payload.diagnostics || buildDiagnosticsSnapshot(payload.diagnosticsPayload || {}),
      connectionSummary: payload.connectionSummary || {},
      currentStatus: payload.currentStatus || {},
      taskbarVersion: String(payload.taskbarVersion || ''),
      statusSummary: payload.statusSummary || summarizeStatusHistory(payload.statusHistory || []),
      windowLayout: payload.windowLayout || {},
      openWindows: Array.isArray(payload.openWindows) ? payload.openWindows : [],
      windowLinks: Array.isArray(payload.windowLinks) ? payload.windowLinks : [],
      windowGroups: Array.isArray(payload.windowGroups) ? payload.windowGroups : [],
    };
  }

  return {
    MAX_STATUS_HISTORY,
    sanitizeStatusHistoryEntry,
    normalizeStatusHistory,
    readStatusHistory,
    writeStatusHistory,
    appendStatusHistoryEntry,
    summarizeStatusHistory,
    buildDiagnosticsSnapshot,
    buildSupportBundle,
  };
});
