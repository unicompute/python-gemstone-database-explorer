(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ConnectionWindowChecksRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createConnectionWindowChecksRuntime(deps = {}) {
    const {
      id,
      getLatestPreflight,
      setLatestPreflight,
      getLatestStartupError,
      getConnectionCheckResults,
      setConnectionCheckResults,
      getConnectionCheckViewMode,
      setConnectionCheckViewMode,
      syncConnectionWindowState,
      renderConnection,
    } = deps;

    function rememberConnectionCheckResult(result) {
      const sanitized = deps.sanitizeConnectionCheckResult(result);
      if (!sanitized) return null;
      const key = deps.connectionOverrideKey(sanitized.target);
      setConnectionCheckResults([
        sanitized,
        ...getConnectionCheckResults().filter(item => !(item.label === sanitized.label && deps.connectionOverrideKey(item.target) === key)),
      ].slice(0, 8));
      syncConnectionWindowState();
      return sanitized;
    }

    function removeConnectionCheckResult(result) {
      const sanitized = deps.sanitizeConnectionCheckResult(result);
      if (!sanitized) return;
      const key = deps.connectionOverrideKey(sanitized.target);
      setConnectionCheckResults(getConnectionCheckResults().filter(item => !(item.label === sanitized.label && deps.connectionOverrideKey(item.target) === key)));
      syncConnectionWindowState();
    }

    function clearConnectionCheckResults() {
      setConnectionCheckResults([]);
      syncConnectionWindowState();
    }

    async function checkConnectionTargetPreflight(target, label) {
      const normalized = deps.sanitizeConnectionOverride(target);
      if (!normalized) {
        deps.setStatus(false, `no target available to check for ${label}`);
        return null;
      }
      try {
        const data = await deps.api('/connection/preflight', {
          connectionOverride: normalized,
        });
        const result = rememberConnectionCheckResult(deps.captureConnectionCheckResult({
          label,
          target: normalized,
          status: data?.success ? 'ok' : 'error',
          checkedAt: new Date().toISOString(),
          exception: data?.exception || '',
          effectiveTarget: data?.connection?.configured?.effectiveTarget || '',
          stoneSource: data?.connection?.configured?.stoneSource || '',
        }, data));
        if (data?.success) {
          deps.setStatus(true, `checked ${label}: ok`);
        } else {
          deps.setStatus(false, `checked ${label}: ${data?.exception || 'connection failed'}`);
        }
        renderConnection(getLatestPreflight(), getLatestStartupError());
        return result;
      } catch (e) {
        const result = rememberConnectionCheckResult(deps.captureConnectionCheckResult({
          label,
          target: normalized,
          status: 'error',
          checkedAt: new Date().toISOString(),
          exception: e.message || 'connection failed',
        }, getLatestPreflight()));
        deps.setStatus(false, `checked ${label}: ${e.message}`);
        renderConnection(getLatestPreflight(), getLatestStartupError());
        return result;
      }
    }

    async function recheckConnectionTargetResults(options = {}) {
      const failuresOnly = !!options.failuresOnly;
      const staleOnly = !!options.staleOnly;
      const selected = getConnectionCheckResults().filter(item => {
        if (!item) return false;
        if (failuresOnly && item.success) return false;
        if (staleOnly && !deps.describeConnectionCheckFreshness(item, getLatestPreflight()).stale) return false;
        return true;
      });
      if (!selected.length) {
        deps.setStatus(false, staleOnly
          ? 'no stale target checks to recheck'
          : (failuresOnly ? 'no failing target checks to recheck' : 'no target checks to recheck'));
        return [];
      }
      let okCount = 0;
      let errorCount = 0;
      for (const item of selected) {
        const result = await checkConnectionTargetPreflight(item.target, item.label);
        if (result?.success) okCount += 1;
        else errorCount += 1;
      }
      if (staleOnly) {
        try {
          setLatestPreflight(await deps.resolveConnectionPreflight());
        } catch (_) {
          // keep the last rendered preflight if the current target cannot be refreshed
        }
      }
      deps.setStatus(errorCount === 0, `rechecked ${selected.length} target check${selected.length === 1 ? '' : 's'}: ${okCount} ok${errorCount ? `, ${errorCount} error` : ''}`);
      renderConnection(getLatestPreflight(), getLatestStartupError());
      return selected;
    }

    function getVisibleConnectionCheckEntries(payload = getLatestPreflight()) {
      return deps.getVisibleConnectionCheckEntriesModel({
        connectionCheckResults: getConnectionCheckResults(),
        payload,
        connectionCheckViewMode: getConnectionCheckViewMode(),
        describeConnectionCheckFreshness: deps.describeConnectionCheckFreshness,
      });
    }

    function isFilteredConnectionChecksView() {
      return deps.isFilteredConnectionChecksViewModel(getConnectionCheckViewMode());
    }

    async function copyConnectionChecks() {
      if (!getConnectionCheckResults().length) {
        deps.setStatus(false, 'no target checks to copy');
        return;
      }
      try {
        const entries = getVisibleConnectionCheckEntries(getLatestPreflight());
        await deps.copyTextToClipboard(JSON.stringify(deps.buildConnectionCheckBundle(entries.map(entry => entry.item)), null, 2));
        deps.setStatus(true, `copied ${isFilteredConnectionChecksView() ? 'visible' : 'saved'} target checks`);
      } catch (e) {
        deps.setStatus(false, e.message);
      }
    }

    function downloadConnectionChecks() {
      if (!getConnectionCheckResults().length) {
        deps.setStatus(false, 'no target checks to download');
        return;
      }
      const stamp = new Date().toISOString().replace(/[:]/g, '-');
      const entries = getVisibleConnectionCheckEntries(getLatestPreflight());
      deps.downloadDataFile(`connection-checks-${stamp}.json`, JSON.stringify(deps.buildConnectionCheckBundle(entries.map(entry => entry.item)), null, 2), 'application/json;charset=utf-8');
      deps.setStatus(true, `downloaded ${isFilteredConnectionChecksView() ? 'visible' : 'saved'} target checks`);
    }

    async function importConnectionChecksFromModal(options = {}) {
      const replace = !!options.replace;
      const values = await deps.requestModal(replace ? 'Replace Target Checks' : 'Import Target Checks', [{
        id: `${id}-import-checks-json`,
        label: 'Check JSON',
        type: 'textarea',
        placeholder: '{"version":1,"checks":[...]}',
        value: '',
      }], {
        okLabel: replace ? 'Replace Checks' : 'Import Checks',
        message: replace
          ? 'Paste a target-check bundle exported from Copy Checks JSON or Download Checks JSON. This replaces the current saved target checks.'
          : 'Paste a target-check bundle exported from Copy Checks JSON or Download Checks JSON. Imported checks are merged into the current saved target checks.',
      });
      if (!values) return;
      const raw = String(values[`${id}-import-checks-json`] || '').trim();
      if (!raw) {
        deps.setStatus(false, 'no target check JSON provided');
        return;
      }
      try {
        const imported = deps.mergeConnectionCheckBundle(getConnectionCheckResults(), JSON.parse(raw), {replace});
        setConnectionCheckResults(imported.checks);
        syncConnectionWindowState();
        const verb = replace ? 'replaced' : 'imported';
        deps.setStatus(true, `${verb} ${imported.importedCheckCount} target check${imported.importedCheckCount === 1 ? '' : 's'}; ${imported.checkCount} saved`);
        deps.notifyLiveWindowUpdated();
        renderConnection(getLatestPreflight(), getLatestStartupError());
      } catch (e) {
        deps.setStatus(false, `target check import failed: ${e.message}`);
      }
    }

    return {
      rememberConnectionCheckResult,
      removeConnectionCheckResult,
      clearConnectionCheckResults,
      checkConnectionTargetPreflight,
      recheckConnectionTargetResults,
      getVisibleConnectionCheckEntries,
      isFilteredConnectionChecksView,
      copyConnectionChecks,
      downloadConnectionChecks,
      importConnectionChecksFromModal,
      setConnectionCheckViewMode,
    };
  }

  return {
    createConnectionWindowChecksRuntime,
  };
});
