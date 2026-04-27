(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WindowRestoreModel = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeId(value) {
    return String(value || '').trim();
  }

  function normalizeIdSet(existingWindowIds) {
    return new Set((Array.isArray(existingWindowIds) ? existingWindowIds : [])
      .map(normalizeId)
      .filter(Boolean));
  }

  function resolveRestoredSourceLinks(restoredIdMap, pendingSourceLinks, existingWindowIds) {
    const idSet = normalizeIdSet(existingWindowIds);
    const links = Array.isArray(pendingSourceLinks) ? pendingSourceLinks : [];
    const patches = [];

    links.forEach(link => {
      if (!link || typeof link !== 'object') return;
      const windowId = normalizeId(link.windowId);
      const sourceWindowId = normalizeId(link.sourceWindowId);
      if (!windowId || !sourceWindowId || !idSet.has(windowId)) return;
      const restoredSourceWindowId = normalizeId(
        restoredIdMap && typeof restoredIdMap.get === 'function'
          ? restoredIdMap.get(sourceWindowId)
          : sourceWindowId
      ) || sourceWindowId;
      if (!restoredSourceWindowId || !idSet.has(restoredSourceWindowId)) return;
      patches.push({
        windowId,
        sourceWindowId: restoredSourceWindowId,
      });
    });

    return patches;
  }

  return {
    resolveRestoredSourceLinks,
  };
});
