(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WindowGroupsWindowRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function readWindowStateEntry(windowState, windowId) {
    if (!windowState || !windowId) return null;
    if (typeof windowState.get === 'function') return windowState.get(windowId) || null;
    return windowState[windowId] || null;
  }

  function createWindowGroupsWindowRuntime(deps = {}) {
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
      collectOpenWindowSummaries,
      collectWindowGroupSummaries,
      filterWindowGroups,
      isWindowGroupsViewFiltered,
      buildWindowGroupsExportPayload,
      buildWindowGroupsWindowView,
      applyWindowGroupsToolbarState,
      bindWindowGroupsToolbarActions,
      bindWindowGroupListActions,
      getRelatedWindowIds,
      revealWindow,
      raiseWindowGroupByIds,
      closeWindowGroupByIds,
      copyTextToClipboard,
      downloadDataFile,
      setStatus,
      liveWindowRenderers,
      notifyLiveWindowUpdated,
      arrows,
      documentObj = typeof document !== 'undefined' ? document : null,
      escHtml,
    } = deps;

    let sourceWindowId = options.sourceWindowId || null;
    let filterText = String(options.filterText || '');
    let viewMode = options.viewMode === 'linked' ? 'linked' : 'all';

    function syncWindowGroupsState() {
      const existingSourceWindowId = readWindowStateEntry(windowState, id)?.sourceWindowId || null;
      if (!sourceWindowId && existingSourceWindowId) sourceWindowId = existingSourceWindowId;
      upsertWindowState?.(id, {
        kind: 'window-groups',
        filterText,
        viewMode,
        sourceWindowId: sourceWindowId || null,
      });
    }

    function currentOpenWindows() {
      return collectOpenWindowSummaries();
    }

    function currentGroups() {
      return filterWindowGroups(collectWindowGroupSummaries(), {viewMode});
    }

    function filteredGroups() {
      return filterWindowGroups(collectWindowGroupSummaries(), {viewMode, filterText});
    }

    function buildWindowGroupsExport() {
      return buildWindowGroupsExportPayload(currentOpenWindows(), arrows, {
        filterText,
        viewMode,
      });
    }

    function renderWindowGroups() {
      const groups = currentGroups();
      const visibleGroups = filteredGroups();
      const totalWindows = collectOpenWindowSummaries().length;
      const visibleWindows = visibleGroups.reduce((sum, each) => sum + Number(each.size || 0), 0);
      const largestGroupSize = groups.reduce((max, each) => Math.max(max, Number(each.size || 0)), 0);
      const filtered = isWindowGroupsViewFiltered({filterText, viewMode});
      const view = buildWindowGroupsWindowView({
        groups,
        visibleGroups,
        totalWindows,
        visibleWindows,
        largestGroupSize,
        viewMode,
        filtered,
      }, {escHtml});
      if (meta) meta.textContent = view.metaText;
      if (list) list.innerHTML = view.listHtml;
      applyWindowGroupsToolbarState({
        filterInput,
        scope,
        raiseLargestBtn: buttons.raiseLargestBtn,
        closeLargestBtn: buttons.closeLargestBtn,
        copyBtn: buttons.copyBtn,
        downloadBtn: buttons.downloadBtn,
      }, {
        filterText,
        viewMode,
        raiseLargestDisabled: view.raiseLargestDisabled,
        closeLargestDisabled: view.closeLargestDisabled,
        copyLabel: view.copyLabel,
        downloadLabel: view.downloadLabel,
      });
      bindWindowGroupListActions(list, {
        onMemberClick(targetId) {
          const targetWin = targetId ? documentObj?.getElementById?.(String(targetId)) : null;
          if (!targetWin) {
            renderWindowGroups();
            return;
          }
          revealWindow(targetWin);
        },
        onRaiseGroup(seedId) {
          const normalizedSeedId = String(seedId || '').trim() || null;
          raiseWindowGroupByIds(getRelatedWindowIds(normalizedSeedId), normalizedSeedId);
        },
        onCloseGroup(seedId) {
          const normalizedSeedId = String(seedId || '').trim() || null;
          if (!normalizedSeedId) return;
          closeWindowGroupByIds(getRelatedWindowIds(normalizedSeedId), {excludeIds: [id]});
          renderWindowGroups();
        },
      });
    }

    async function copyWindowGroups() {
      try {
        await copyTextToClipboard(JSON.stringify(buildWindowGroupsExport(), null, 2));
        setStatus(true, isWindowGroupsViewFiltered({filterText, viewMode}) ? 'copied visible window groups' : 'copied window groups');
      } catch (error) {
        setStatus(false, error.message);
      }
    }

    function downloadWindowGroups() {
      const stamp = new Date().toISOString().replace(/[:]/g, '-');
      downloadDataFile(`window-groups-${stamp}.json`, JSON.stringify(buildWindowGroupsExport(), null, 2), 'application/json;charset=utf-8');
      setStatus(true, isWindowGroupsViewFiltered({filterText, viewMode}) ? 'downloaded visible window groups' : 'downloaded window groups');
    }

    function mount() {
      bindWindowGroupsToolbarActions({
        filterInput,
        scope,
        raiseLargestBtn: buttons.raiseLargestBtn,
        closeLargestBtn: buttons.closeLargestBtn,
        copyBtn: buttons.copyBtn,
        downloadBtn: buttons.downloadBtn,
        refreshBtn: buttons.refreshBtn,
      }, {
        onFilterInput() {
          filterText = filterInput?.value || '';
          syncWindowGroupsState();
          renderWindowGroups();
        },
        onViewModeChange(nextMode) {
          const normalizedNextMode = nextMode === 'linked' ? 'linked' : 'all';
          if (viewMode === normalizedNextMode) return;
          viewMode = normalizedNextMode;
          syncWindowGroupsState();
          renderWindowGroups();
        },
        onRaiseLargest() {
          const largest = filteredGroups()[0];
          if (!largest) return;
          const seedId = largest.primaryId || largest.members?.[0]?.id || null;
          raiseWindowGroupByIds(getRelatedWindowIds(seedId), seedId);
        },
        onCloseLargest() {
          const largest = filteredGroups()[0];
          if (!largest) return;
          const seedId = largest.primaryId || largest.members?.[0]?.id || null;
          closeWindowGroupByIds(getRelatedWindowIds(seedId), {excludeIds: [id]});
          renderWindowGroups();
        },
        onCopy: copyWindowGroups,
        onDownload: downloadWindowGroups,
        onRefresh: renderWindowGroups,
      });
      liveWindowRenderers?.set?.(id, renderWindowGroups);
      syncWindowGroupsState();
      renderWindowGroups();
      notifyLiveWindowUpdated?.();
      return {renderWindowGroups};
    }

    return {
      mount,
      renderWindowGroups,
    };
  }

  return {
    createWindowGroupsWindowRuntime,
  };
});
