(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WindowLinksWindowRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function readWindowStateEntry(windowState, windowId) {
    if (!windowState || !windowId) return null;
    if (typeof windowState.get === 'function') return windowState.get(windowId) || null;
    return windowState[windowId] || null;
  }

  function createWindowLinksWindowRuntime(deps = {}) {
    const {
      id,
      options = {},
      filterInput,
      scope,
      viewScope,
      meta,
      list,
      buttons = {},
      windowState,
      upsertWindowState,
      collectOpenWindowSummaries,
      collectWindowLinkSummaries,
      scopeWindowLinks,
      filterWindowLinks,
      isWindowLinksViewFiltered,
      buildWindowLinksExportPayload,
      buildWindowLinksWindowView,
      applyWindowLinksToolbarState,
      bindWindowLinksToolbarActions,
      bindWindowLinkListActions,
      getRelatedWindowIds,
      sanitizeSelectionIndex,
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
    let linkType = ['all', 'source', 'arrow'].includes(options.linkType) ? options.linkType : 'all';
    let viewMode = options.viewMode === 'related' ? 'related' : 'all';
    let selectedIndex = Number.isFinite(Number(options.selectedIndex)) ? Math.max(0, Number(options.selectedIndex)) : 0;

    function syncWindowLinksState() {
      const existingSourceWindowId = readWindowStateEntry(windowState, id)?.sourceWindowId || null;
      if (!sourceWindowId && existingSourceWindowId) sourceWindowId = existingSourceWindowId;
      upsertWindowState?.(id, {
        kind: 'window-links',
        filterText,
        linkType,
        viewMode,
        selectedIndex,
        sourceWindowId: sourceWindowId || null,
      });
    }

    function currentOpenWindows() {
      return collectOpenWindowSummaries();
    }

    function currentLinks() {
      const openWindows = currentOpenWindows();
      return scopeWindowLinks(collectWindowLinkSummaries(), openWindows, arrows, {
        viewMode,
        sourceWindowId,
      });
    }

    function filteredLinks() {
      return filterWindowLinks(currentLinks(), {filterText, linkType});
    }

    function buildWindowLinksExport() {
      const openWindows = currentOpenWindows();
      const sourceTitle = openWindows.find(each => each.id === sourceWindowId)?.title || '';
      return buildWindowLinksExportPayload(openWindows, arrows, {
        filterText,
        linkType,
        viewMode,
        sourceWindowId: sourceWindowId || null,
        sourceTitle,
      });
    }

    function currentSelectedLink(links = filteredLinks()) {
      if (!Array.isArray(links) || !links.length) return null;
      selectedIndex = sanitizeSelectionIndex(selectedIndex, links);
      return links[selectedIndex] || null;
    }

    function selectedLinkMemberIds(link) {
      if (!link) return [];
      const related = new Set();
      [link.fromId, link.toId].forEach(linkedId => {
        getRelatedWindowIds(linkedId).forEach(each => {
          if (each && each !== id) related.add(each);
        });
      });
      return Array.from(related);
    }

    function selectWindowLink(index, links = filteredLinks()) {
      const nextIndex = sanitizeSelectionIndex(index, links);
      if (selectedIndex === nextIndex && list?.querySelector?.('.window-link-entry.active')) return;
      selectedIndex = nextIndex;
      syncWindowLinksState();
      renderWindowLinks();
    }

    function renderWindowLinks() {
      const allLinks = collectWindowLinkSummaries();
      const scopedLinks = currentLinks();
      const links = filteredLinks();
      const selectedLink = currentSelectedLink(links);
      const selectedMembers = selectedLinkMemberIds(selectedLink);
      const sourceTitle = readWindowStateEntry(windowState, sourceWindowId || '')?.title || sourceWindowId || 'source window';
      const filtered = isWindowLinksViewFiltered({filterText, linkType, viewMode});
      const view = buildWindowLinksWindowView({
        allCount: allLinks.length,
        scopedCount: scopedLinks.length,
        links: links.map(link => ({
          ...link,
          fromAvailable: !!documentObj?.getElementById?.(link.fromId),
          toAvailable: !!documentObj?.getElementById?.(link.toId),
        })),
        selectedIndex,
        selectedMembersCount: selectedMembers.length,
        linkType,
        viewMode,
        sourceTitle,
        filtered,
      }, {escHtml});
      if (meta) meta.textContent = view.metaText;
      if (list) list.innerHTML = view.listHtml;
      applyWindowLinksToolbarState({
        filterInput,
        scope,
        viewScope,
        raiseSelectedBtn: buttons.raiseSelectedBtn,
        closeSelectedBtn: buttons.closeSelectedBtn,
        copyBtn: buttons.copyBtn,
        downloadBtn: buttons.downloadBtn,
      }, {
        filterText,
        linkType,
        viewMode,
        hasSourceWindow: !!sourceWindowId,
        raiseSelectedDisabled: view.raiseSelectedDisabled,
        closeSelectedDisabled: view.closeSelectedDisabled,
        copyLabel: view.copyLabel,
        downloadLabel: view.downloadLabel,
      });
      bindWindowLinkListActions(list, {
        onSelectRow(index) {
          selectWindowLink(index, links);
        },
        onEndpointClick({index, endpoint}) {
          selectWindowLink(index, links);
          const link = links[index];
          const targetId = endpoint === 'from' ? link?.fromId : link?.toId;
          const targetWin = targetId ? documentObj?.getElementById?.(targetId) : null;
          if (!targetWin) {
            renderWindowLinks();
            return;
          }
          revealWindow(targetWin);
        },
      });
    }

    async function copyWindowLinks() {
      try {
        await copyTextToClipboard(JSON.stringify(buildWindowLinksExport(), null, 2));
        setStatus(true, isWindowLinksViewFiltered({filterText, linkType, viewMode}) ? 'copied visible window links' : 'copied window links');
      } catch (error) {
        setStatus(false, error.message);
      }
    }

    function downloadWindowLinks() {
      const stamp = new Date().toISOString().replace(/[:]/g, '-');
      downloadDataFile(`window-links-${stamp}.json`, JSON.stringify(buildWindowLinksExport(), null, 2), 'application/json;charset=utf-8');
      setStatus(true, isWindowLinksViewFiltered({filterText, linkType, viewMode}) ? 'downloaded visible window links' : 'downloaded window links');
    }

    function mount() {
      bindWindowLinksToolbarActions({
        filterInput,
        scope,
        viewScope,
        raiseSelectedBtn: buttons.raiseSelectedBtn,
        closeSelectedBtn: buttons.closeSelectedBtn,
        copyBtn: buttons.copyBtn,
        downloadBtn: buttons.downloadBtn,
        refreshBtn: buttons.refreshBtn,
      }, {
        onFilterInput() {
          filterText = filterInput?.value || '';
          syncWindowLinksState();
          renderWindowLinks();
        },
        onLinkTypeChange(nextType) {
          const normalizedNextType = ['source', 'arrow'].includes(nextType) ? nextType : 'all';
          if (linkType === normalizedNextType) return;
          linkType = normalizedNextType;
          syncWindowLinksState();
          renderWindowLinks();
        },
        onViewModeChange(nextMode) {
          const normalizedNextMode = nextMode === 'related' ? 'related' : 'all';
          if (viewMode === normalizedNextMode) return;
          viewMode = normalizedNextMode;
          syncWindowLinksState();
          renderWindowLinks();
        },
        onRaiseSelected() {
          const link = currentSelectedLink();
          const memberIds = selectedLinkMemberIds(link);
          if (!link || !memberIds.length) return;
          const seedId = memberIds.includes(link.toId) ? link.toId : (memberIds.includes(link.fromId) ? link.fromId : memberIds[0]);
          if (raiseWindowGroupByIds(memberIds, seedId)) {
            setStatus(true, 'raised selected window link group');
          }
        },
        onCloseSelected() {
          const link = currentSelectedLink();
          const memberIds = selectedLinkMemberIds(link);
          if (!link || !memberIds.length) return;
          if (closeWindowGroupByIds(memberIds, {excludeIds: [id]})) {
            setStatus(true, 'closed selected window link group');
            renderWindowLinks();
          }
        },
        onCopy: copyWindowLinks,
        onDownload: downloadWindowLinks,
        onRefresh: renderWindowLinks,
      });
      liveWindowRenderers?.set?.(id, renderWindowLinks);
      syncWindowLinksState();
      renderWindowLinks();
      notifyLiveWindowUpdated?.();
      return {renderWindowLinks};
    }

    return {
      mount,
      renderWindowLinks,
    };
  }

  return {
    createWindowLinksWindowRuntime,
  };
});
