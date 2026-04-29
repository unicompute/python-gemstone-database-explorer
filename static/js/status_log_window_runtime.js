(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.StatusLogWindowRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function readWindowStateEntry(windowState, windowId) {
    if (!windowState || !windowId) return null;
    if (typeof windowState.get === 'function') return windowState.get(windowId) || null;
    return windowState[windowId] || null;
  }

  function createStatusLogWindowRuntime(deps = {}) {
    const {
      id,
      options = {},
      filterInput,
      scope,
      meta,
      list,
      buttons = {},
      windowState,
      upsertWindowState,
      normalizeStatusLogLevel,
      getStatusHistory,
      buildStatusLogViewState,
      statusEntriesForExportModel,
      buildStatusLogWindowView,
      applyStatusLogToolbarState,
      bindStatusLogToolbarActions,
      bindStatusLogSourceButtons,
      resolveStatusEntrySourceWindow,
      formatStatusTimestampModel,
      revealWindow,
      clearStatusHistory,
      copyTextToClipboard,
      downloadDataFile,
      setStatus,
      liveWindowRenderers,
      escHtml,
    } = deps;

    let filterText = String(options.filterText || '');
    let level = normalizeStatusLogLevel(options.level);
    let sourceWindowId = options.sourceWindowId || null;

    function syncStatusLogWindowState() {
      const existingSourceWindowId = readWindowStateEntry(windowState, id)?.sourceWindowId || null;
      if (!sourceWindowId && existingSourceWindowId) sourceWindowId = existingSourceWindowId;
      upsertWindowState?.(id, {
        kind: 'status-log',
        filterText,
        level,
        sourceWindowId: sourceWindowId || null,
      });
    }

    function isFilteredStatusView() {
      return buildStatusLogViewState(getStatusHistory(), {filterText, level}).exportFiltered;
    }

    function statusEntriesForExport() {
      return statusEntriesForExportModel(getStatusHistory(), {filterText, level});
    }

    function renderStatusLog() {
      const viewState = buildStatusLogViewState(getStatusHistory(), {filterText, level});
      const view = buildStatusLogWindowView(viewState, {
        escHtml,
        resolveStatusEntrySourceWindow,
        formatStatusTimestamp: formatStatusTimestampModel,
      });
      if (meta) meta.textContent = view.metaText;
      if (list) list.innerHTML = view.listHtml;
      applyStatusLogToolbarState({
        filterInput,
        scope,
        copyBtn: buttons.copyBtn,
        downloadBtn: buttons.downloadBtn,
      }, {
        filterText,
        level,
        copyLabel: view.copyLabel,
        downloadLabel: view.downloadLabel,
      });
      bindStatusLogSourceButtons(list, {
        onSourceClick(entryIndex) {
          const entry = viewState.reversedEntries?.[entryIndex];
          const sourceWindow = resolveStatusEntrySourceWindow(entry);
          if (!sourceWindow) {
            renderStatusLog();
            return;
          }
          revealWindow(sourceWindow);
        },
      });
    }

    async function copyStatusHistory() {
      try {
        await copyTextToClipboard(JSON.stringify(statusEntriesForExport(), null, 2));
        setStatus(true, isFilteredStatusView() ? 'copied visible status history' : 'copied status history');
      } catch (error) {
        setStatus(false, error.message);
      }
    }

    function downloadStatusHistory() {
      const stamp = new Date().toISOString().replace(/[:]/g, '-');
      downloadDataFile(`status-history-${stamp}.json`, JSON.stringify(statusEntriesForExport(), null, 2), 'application/json;charset=utf-8');
      setStatus(true, isFilteredStatusView() ? 'downloaded visible status history' : 'downloaded status history');
    }

    function mount() {
      bindStatusLogToolbarActions({
        filterInput,
        scope,
        clearBtn: buttons.clearBtn,
        copyBtn: buttons.copyBtn,
        downloadBtn: buttons.downloadBtn,
      }, {
        onFilterInput() {
          filterText = filterInput?.value || '';
          syncStatusLogWindowState();
          renderStatusLog();
        },
        onLevelChange(nextLevel) {
          level = normalizeStatusLogLevel(nextLevel);
          syncStatusLogWindowState();
          renderStatusLog();
        },
        onClear() {
          clearStatusHistory();
          syncStatusLogWindowState();
          renderStatusLog();
        },
        onCopy: copyStatusHistory,
        onDownload: downloadStatusHistory,
      });
      liveWindowRenderers?.set?.(id, renderStatusLog);
      syncStatusLogWindowState();
      renderStatusLog();
      return {renderStatusLog};
    }

    return {
      mount,
      renderStatusLog,
    };
  }

  return {
    createStatusLogWindowRuntime,
  };
});
