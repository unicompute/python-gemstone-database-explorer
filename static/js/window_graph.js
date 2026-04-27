(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WindowGraph = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeId(value) {
    return String(value || '').trim();
  }

  function normalizeWindow(windowSummary) {
    if (!windowSummary || typeof windowSummary !== 'object') return null;
    const id = normalizeId(windowSummary.id);
    if (!id) return null;
    return {
      id,
      title: String(windowSummary.title || '').trim(),
      kind: String(windowSummary.kind || '').trim(),
      minimised: !!windowSummary.minimised,
      focused: !!windowSummary.focused,
      zIndex: Number.isFinite(Number(windowSummary.zIndex)) ? Number(windowSummary.zIndex) : 0,
      sourceWindowId: normalizeId(windowSummary.sourceWindowId),
    };
  }

  function normalizeWindows(openWindows) {
    if (!Array.isArray(openWindows)) return [];
    return openWindows.map(normalizeWindow).filter(Boolean);
  }

  function normalizeArrow(arrow) {
    if (!arrow || typeof arrow !== 'object') return null;
    const srcWinId = normalizeId(arrow.srcWinId);
    const dstWinId = normalizeId(arrow.dstWinId);
    if (!srcWinId || !dstWinId || srcWinId === dstWinId) return null;
    return {srcWinId, dstWinId};
  }

  function normalizeArrows(arrows) {
    if (!Array.isArray(arrows)) return [];
    return arrows.map(normalizeArrow).filter(Boolean);
  }

  function sortWindowsByZIndex(windows) {
    return windows.slice().sort((left, right) => {
      const zDelta = Number(left.zIndex || 0) - Number(right.zIndex || 0);
      if (zDelta) return zDelta;
      return String(left.title || left.id).localeCompare(String(right.title || right.id));
    });
  }

  function getRelatedWindowIds(seedId, openWindows, arrows) {
    const normalizedSeedId = normalizeId(seedId);
    if (!normalizedSeedId) return [];
    const windows = normalizeWindows(openWindows);
    const normalizedArrows = normalizeArrows(arrows);
    const byId = new Map(windows.map(each => [each.id, each]));
    if (!byId.has(normalizedSeedId)) return [];
    const visited = new Set([normalizedSeedId]);
    const queue = [normalizedSeedId];
    while (queue.length) {
      const currentId = queue.shift();
      const connected = new Set();
      normalizedArrows.forEach(arrow => {
        if (arrow.srcWinId === currentId) connected.add(arrow.dstWinId);
        if (arrow.dstWinId === currentId) connected.add(arrow.srcWinId);
      });
      const currentWindow = byId.get(currentId);
      if (currentWindow?.sourceWindowId) connected.add(currentWindow.sourceWindowId);
      windows.forEach(otherWindow => {
        if (otherWindow.id !== currentId && otherWindow.sourceWindowId === currentId) {
          connected.add(otherWindow.id);
        }
      });
      connected.forEach(otherId => {
        if (!otherId || visited.has(otherId) || !byId.has(otherId)) return;
        visited.add(otherId);
        queue.push(otherId);
      });
    }
    return Array.from(visited);
  }

  function collectWindowLinkSummaries(openWindows, arrows) {
    const windows = normalizeWindows(openWindows);
    const normalizedArrows = normalizeArrows(arrows);
    const byId = new Map(windows.map(each => [each.id, each]));
    const links = [];
    const seen = new Set();

    function addLink(type, fromId, toId) {
      const normalizedFromId = normalizeId(fromId);
      const normalizedToId = normalizeId(toId);
      if (!normalizedFromId || !normalizedToId || normalizedFromId === normalizedToId) return;
      const from = byId.get(normalizedFromId);
      const to = byId.get(normalizedToId);
      if (!from || !to) return;
      const key = type === 'arrow'
        ? `${type}:${[normalizedFromId, normalizedToId].sort().join(':')}`
        : `${type}:${normalizedFromId}:${normalizedToId}`;
      if (seen.has(key)) return;
      seen.add(key);
      links.push({
        type,
        fromId: normalizedFromId,
        fromTitle: from.title || '',
        fromKind: from.kind || '',
        toId: normalizedToId,
        toTitle: to.title || '',
        toKind: to.kind || '',
      });
    }

    windows.forEach(each => {
      if (each.sourceWindowId) addLink('source', each.sourceWindowId, each.id);
    });
    normalizedArrows.forEach(arrow => addLink('arrow', arrow.srcWinId, arrow.dstWinId));

    return links.sort((left, right) => {
      const leftKey = `${left.type}:${left.fromTitle}:${left.toTitle}`;
      const rightKey = `${right.type}:${right.fromTitle}:${right.toTitle}`;
      return leftKey.localeCompare(rightKey);
    });
  }

  function collectWindowGroupSummaries(openWindows, arrows) {
    const windows = sortWindowsByZIndex(normalizeWindows(openWindows));
    const byId = new Map(windows.map(each => [each.id, each]));
    const visited = new Set();
    const groups = [];

    windows.forEach(each => {
      if (!each?.id || visited.has(each.id)) return;
      const memberIds = getRelatedWindowIds(each.id, windows, arrows).filter(id => byId.has(id));
      if (!memberIds.length) memberIds.push(each.id);
      memberIds.forEach(id => visited.add(id));
      const members = memberIds
        .map(id => byId.get(id))
        .filter(Boolean)
        .sort((left, right) => {
          const zDelta = Number(left.zIndex || 0) - Number(right.zIndex || 0);
          if (zDelta) return zDelta;
          return String(left.title || '').localeCompare(String(right.title || ''));
        });
      const memberIdSet = new Set(members.map(member => member.id));
      const primaryMember =
        members.find(member => !member.sourceWindowId || !memberIdSet.has(member.sourceWindowId)) ||
        members.find(member => member.focused) ||
        members[members.length - 1] ||
        members[0] ||
        null;
      const kinds = Array.from(new Set(members.map(member => member.kind).filter(Boolean)));
      groups.push({
        size: members.length,
        focused: members.some(member => member.focused),
        minimisedCount: members.filter(member => member.minimised).length,
        kinds,
        primaryId: primaryMember?.id || '',
        primaryTitle: primaryMember?.title || '',
        titles: members.map(member => member.title || member.id),
        members: members.map(member => ({
          id: member.id,
          title: member.title || '',
          kind: member.kind || '',
          minimised: !!member.minimised,
          focused: !!member.focused,
          sourceWindowId: member.sourceWindowId || null,
        })),
      });
    });

    return groups.sort((left, right) => {
      const sizeDelta = Number(right.size || 0) - Number(left.size || 0);
      if (sizeDelta) return sizeDelta;
      const focusDelta = Number(!!right.focused) - Number(!!left.focused);
      if (focusDelta) return focusDelta;
      return String(left.titles?.[0] || '').localeCompare(String(right.titles?.[0] || ''));
    });
  }

  function scopeWindowLinks(links, openWindows, arrows, options = {}) {
    const viewMode = options.viewMode === 'related' ? 'related' : 'all';
    if (viewMode !== 'related') return Array.isArray(links) ? links.slice() : [];
    const sourceWindowId = normalizeId(options.sourceWindowId);
    const relatedIds = new Set(getRelatedWindowIds(sourceWindowId, openWindows, arrows));
    if (sourceWindowId) relatedIds.add(sourceWindowId);
    if (!relatedIds.size) return [];
    return (Array.isArray(links) ? links : []).filter(link => relatedIds.has(link.fromId) || relatedIds.has(link.toId));
  }

  function filterWindowLinks(links, options = {}) {
    const filterText = String(options.filterText || '').trim().toLowerCase();
    const linkType = ['source', 'arrow'].includes(options.linkType) ? options.linkType : 'all';
    return (Array.isArray(links) ? links : []).filter(link => {
      if (linkType !== 'all' && link.type !== linkType) return false;
      if (!filterText) return true;
      const haystacks = [
        link.type || '',
        link.fromTitle || '',
        link.fromKind || '',
        link.toTitle || '',
        link.toKind || '',
      ];
      return haystacks.some(value => String(value).toLowerCase().includes(filterText));
    });
  }

  function isFilteredWindowLinksView(options = {}) {
    const viewMode = options.viewMode === 'related' ? 'related' : 'all';
    const linkType = ['source', 'arrow'].includes(options.linkType) ? options.linkType : 'all';
    return !!String(options.filterText || '').trim() || linkType !== 'all' || viewMode !== 'all';
  }

  function buildWindowLinksExport(openWindows, arrows, options = {}) {
    const allLinks = collectWindowLinkSummaries(openWindows, arrows);
    const scopedLinks = scopeWindowLinks(allLinks, openWindows, arrows, options);
    const visibleLinks = filterWindowLinks(scopedLinks, options);
    return {
      exportScope: isFilteredWindowLinksView(options) ? 'current-view' : 'full',
      linkType: ['source', 'arrow'].includes(options.linkType) ? options.linkType : 'all',
      viewMode: options.viewMode === 'related' ? 'related' : 'all',
      filterText: String(options.filterText || ''),
      sourceWindowId: normalizeId(options.sourceWindowId),
      sourceTitle: String(options.sourceTitle || '').trim(),
      totalLinks: allLinks.length,
      links: isFilteredWindowLinksView(options) ? visibleLinks : allLinks,
    };
  }

  function filterWindowGroups(groups, options = {}) {
    const viewMode = options.viewMode === 'linked' ? 'linked' : 'all';
    const filterText = String(options.filterText || '').trim().toLowerCase();
    let visibleGroups = Array.isArray(groups) ? groups.slice() : [];
    if (viewMode === 'linked') {
      visibleGroups = visibleGroups.filter(group => Number(group.size || 0) > 1);
    }
    if (!filterText) return visibleGroups;
    return visibleGroups.filter(group => {
      const haystacks = [
        group.primaryTitle || '',
        ...(Array.isArray(group.titles) ? group.titles : []),
        ...(Array.isArray(group.kinds) ? group.kinds : []),
      ];
      return haystacks.some(value => String(value).toLowerCase().includes(filterText));
    });
  }

  function isFilteredWindowGroupsView(options = {}) {
    const viewMode = options.viewMode === 'linked' ? 'linked' : 'all';
    return !!String(options.filterText || '').trim() || viewMode !== 'all';
  }

  function buildWindowGroupsExport(openWindows, arrows, options = {}) {
    const allGroups = collectWindowGroupSummaries(openWindows, arrows);
    const visibleGroups = filterWindowGroups(allGroups, options);
    return {
      exportScope: isFilteredWindowGroupsView(options) ? 'current-view' : 'full',
      viewMode: options.viewMode === 'linked' ? 'linked' : 'all',
      filterText: String(options.filterText || ''),
      totalGroups: allGroups.length,
      totalWindows: normalizeWindows(openWindows).length,
      groups: isFilteredWindowGroupsView(options) ? visibleGroups : allGroups,
    };
  }

  return {
    getRelatedWindowIds,
    collectWindowLinkSummaries,
    collectWindowGroupSummaries,
    scopeWindowLinks,
    filterWindowLinks,
    isFilteredWindowLinksView,
    buildWindowLinksExport,
    filterWindowGroups,
    isFilteredWindowGroupsView,
    buildWindowGroupsExport,
  };
});
