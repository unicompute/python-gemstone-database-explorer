(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.TaskbarStateRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createTaskbarStateRuntime(deps = {}) {
    const storage = deps.localStorage || globalThis.localStorage;
    const button = deps.taskbarConnectionOverrideButton || null;
    let latestHaltedThreads = [];
    let statusHistory = readStatusHistory();

    function normalizeConnectionOverride(override) {
      return deps.sanitizeConnectionOverride?.(override) || null;
    }

    function readConnectionOverrideValue() {
      return deps.readConnectionOverride?.() || null;
    }

    function notifyLiveWindowRenderers() {
      (deps.getLiveWindowRenderers?.() || []).forEach(render => {
        try {
          render();
        } catch (_) {
          // ignore stale render hooks
        }
      });
    }

    function onUiChanged() {
      deps.onUiChanged?.();
    }

    function persistConnectionOverride(override) {
      const normalized = normalizeConnectionOverride(override);
      try {
        if (!normalized) storage.removeItem(deps.connectionOverrideStorageKey);
        else storage.setItem(deps.connectionOverrideStorageKey, JSON.stringify(normalized));
      } catch (_) {
        // ignore storage failures
      }
      if (normalized) deps.rememberRecentConnectionOverride?.(normalized);
      renderTaskbarConnectionOverride();
      notifyLiveWindowUpdated();
      return normalized;
    }

    function clearConnectionOverride() {
      persistConnectionOverride(null);
    }

    function connectionOverrideHeadersFor(override) {
      const normalized = normalizeConnectionOverride(override);
      if (!normalized) return {};
      const headers = {};
      if (normalized.stone) headers['X-GS-Stone'] = normalized.stone;
      if (normalized.host) headers['X-GS-Host'] = normalized.host;
      if (normalized.netldi) headers['X-GS-NetLDI'] = normalized.netldi;
      if (normalized.gemService) headers['X-GS-Gem-Service'] = normalized.gemService;
      return headers;
    }

    function buildShellForOverride(override) {
      const normalized = normalizeConnectionOverride(override);
      if (!normalized) return '';
      const quote = value => {
        const text = String(value ?? '');
        if (!text) return "''";
        return /[^A-Za-z0-9_./:@%+=,-]/.test(text)
          ? `'${text.replace(/'/g, `'\"'\"'`)}'`
          : text;
      };
      const lines = [];
      if (normalized.stone) lines.push(`export GS_STONE=${quote(normalized.stone)}`);
      if (normalized.host) lines.push(`export GS_HOST=${quote(normalized.host)}`);
      if (normalized.netldi) lines.push(`export GS_NETLDI=${quote(normalized.netldi)}`);
      if (normalized.gemService) lines.push(`export GS_GEM_SERVICE=${quote(normalized.gemService)}`);
      return lines.join('\n');
    }

    function getConnectionOverrideHeaders() {
      return connectionOverrideHeadersFor(readConnectionOverrideValue());
    }

    function summarizeConnectionOverride(override = null) {
      const normalized = normalizeConnectionOverride(override || readConnectionOverrideValue());
      if (!normalized) return '—';
      const parts = [];
      if (normalized.stone) parts.push(`stone=${normalized.stone}`);
      if (normalized.host) parts.push(`host=${normalized.host}`);
      if (normalized.netldi) parts.push(`netldi=${normalized.netldi}`);
      if (normalized.gemService) parts.push(`gemService=${normalized.gemService}`);
      return parts.join(' · ') || '—';
    }

    function renderTaskbarConnectionOverride() {
      if (!button) return;
      const override = normalizeConnectionOverride(readConnectionOverrideValue());
      if (!override) {
        button.style.display = 'none';
        button.textContent = '';
        button.title = '';
        return;
      }
      const target = override.stone || override.host || override.netldi || 'override';
      button.style.display = '';
      button.textContent = `Target ${deps.shortLabel?.(target, 18) || target}`;
      button.title = summarizeConnectionOverride(override);
    }

    function getLatestHaltedThreads() {
      return latestHaltedThreads.slice();
    }

    function setLatestHaltedThreads(threads) {
      latestHaltedThreads = Array.isArray(threads) ? threads.slice() : [];
      onUiChanged();
    }

    function getHaltedThreadCount() {
      return latestHaltedThreads.length;
    }

    function readStatusHistory() {
      return deps.readPersistedStatusHistory(storage, deps.statusHistoryStorageKey);
    }

    function persistStatusHistory() {
      deps.writePersistedStatusHistory(statusHistory, storage, deps.statusHistoryStorageKey);
    }

    function currentStatusSource() {
      return deps.currentStatusSource?.() || {
        sourceWindowId: null,
        sourceTitle: 'Desktop',
        sourceKind: 'desktop',
      };
    }

    function getStatusHistory() {
      return statusHistory.slice();
    }

    function getStatusHistorySummary(entries = null) {
      return deps.summarizeStatusHistory(
        Array.isArray(entries) ? entries : getStatusHistory(),
        deps.resolveStatusEntrySourceWindow
      );
    }

    function getStatusErrorCount() {
      return Number(getStatusHistorySummary().error || 0);
    }

    function clearStatusHistory() {
      statusHistory = [];
      persistStatusHistory();
      notifyStatusHistoryUpdated();
    }

    function recordStatusEntry(ok, msg) {
      statusHistory = deps.appendStatusHistoryEntry(statusHistory, {
        ok,
        message: msg,
        source: currentStatusSource(),
      });
      persistStatusHistory();
      notifyStatusHistoryUpdated();
    }

    function notifyStatusHistoryUpdated() {
      notifyLiveWindowRenderers();
      onUiChanged();
    }

    function notifyLiveWindowUpdated() {
      notifyLiveWindowRenderers();
      onUiChanged();
    }

    return {
      persistConnectionOverride,
      clearConnectionOverride,
      connectionOverrideHeadersFor,
      buildShellForOverride,
      getConnectionOverrideHeaders,
      summarizeConnectionOverride,
      renderTaskbarConnectionOverride,
      getLatestHaltedThreads,
      setLatestHaltedThreads,
      getHaltedThreadCount,
      getStatusHistory,
      getStatusHistorySummary,
      getStatusErrorCount,
      clearStatusHistory,
      recordStatusEntry,
      notifyStatusHistoryUpdated,
      notifyLiveWindowUpdated,
    };
  }

  return {
    createTaskbarStateRuntime,
  };
});
