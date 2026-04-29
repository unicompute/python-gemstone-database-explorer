(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ObjectBrowserModel = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const BUILTIN_ITAB_CAPTIONS = {
    instvars: 'Instance Variables',
    constants: 'Constants',
    modules: 'Included Modules',
    code: 'Code',
    hierarchy: 'Hierarchy',
    instances: 'Instances',
    'stone-ver': 'Stone Version Report',
    'gem-ver': 'Gem Version Report',
    control: 'Control Panel',
  };

  function normalizeCodeTarget(target, fallbackOop = null, fallbackLabel = '') {
    if (!target || typeof target !== 'object') return null;
    const className = String(target.className || '').trim();
    const meta = !!target.meta;
    const label = String(
      target.label || (className ? `${className}${meta ? ' class' : ''}` : fallbackLabel || '')
    ).trim();
    return {
      oop: Number.isFinite(target.oop) ? target.oop : fallbackOop,
      label,
      className,
      dictionary: String(target.dictionary || '').trim(),
      meta,
    };
  }

  function parseClassBrowserTarget(ref) {
    let className = String(ref || '').trim();
    if (!className) return null;
    let meta = false;
    if (className.endsWith(' class')) {
      meta = true;
      className = className.slice(0, -6).trim();
    }
    return className ? {className, meta} : null;
  }

  function getCodeTarget(obj) {
    if (!obj?.oop) return null;
    const explicitTarget = normalizeCodeTarget(
      obj.classBrowserTarget,
      obj.superclassObject?.oop ? obj.oop : (obj.classObject?.oop ?? obj.oop),
      obj.superclassObject?.oop
        ? (obj.inspection || 'class')
        : (obj.classObject?.inspection || obj.inspection || 'object')
    );
    if (explicitTarget?.oop) return explicitTarget;
    if (obj.superclassObject?.oop) {
      return {oop: obj.oop, label: obj.inspection || 'class'};
    }
    if (obj.classObject?.oop) {
      return {oop: obj.classObject.oop, label: obj.classObject.inspection || 'class'};
    }
    return {oop: obj.oop, label: obj.inspection || 'object'};
  }

  function currentCodeBrowserTarget(currentObjData, mbClassName = '', mbCurrentSelector = '', selector = mbCurrentSelector) {
    const target = getCodeTarget(currentObjData);
    const parsed = target?.className ? target : parseClassBrowserTarget(target?.label || mbClassName || '');
    if (!parsed) return null;
    return selector ? {...parsed, method: selector} : parsed;
  }

  function normalizeObjectQuery(query) {
    const normalized = {};
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      normalized[key] = value;
    });
    return normalized;
  }

  function buildObjectIndexUrl(oop, query = {}) {
    const qs = new URLSearchParams({depth: '2'});
    Object.entries(normalizeObjectQuery(query)).forEach(([key, value]) => qs.set(key, String(value)));
    return `/object/index/${oop}?${qs.toString()}`;
  }

  function buildMethodBrowserButtonState(target = null) {
    if (!target) {
      return {
        disabled: true,
        title: 'Open the current method in Class Browser',
      };
    }
    return {
      disabled: false,
      title: target.method
        ? `Open ${target.className}${target.meta ? ' class' : ''} >> ${target.method}`
        : `Open ${target.className}${target.meta ? ' class' : ''}`,
    };
  }

  function getAvailableInspectorTabs(obj) {
    if (Array.isArray(obj?.availableTabs) && obj.availableTabs.length) return obj.availableTabs;
    return ['instvars'];
  }

  function getCustomTab(customTabs, tabId) {
    return (customTabs || []).find(tab => tab.id === tabId) || null;
  }

  function getInspectorTabCaption(tabId, customTabs, captions = BUILTIN_ITAB_CAPTIONS) {
    const custom = getCustomTab(customTabs, tabId);
    return custom?.caption || captions[tabId] || tabId;
  }

  function resolveInspectorTab(currentTab, obj) {
    const availableTabs = getAvailableInspectorTabs(obj);
    const defaultTab = obj?.defaultTab;
    const resolvedTab = availableTabs.includes(currentTab)
      ? currentTab
      : ((defaultTab && availableTabs.includes(defaultTab)) ? defaultTab : (availableTabs[0] || 'instvars'));
    return {
      availableTabs,
      resolvedTab,
      showTabs: availableTabs.length > 1,
      showMethodBrowser: resolvedTab === 'code',
    };
  }

  function buildObjectLoadStartState(oop, query = null, options = {}) {
    const keepInstPage = !!options.keepInstPage;
    return {
      currentOop: oop,
      currentObjData: null,
      currentObjectQuery: query === null ? {} : normalizeObjectQuery(query),
      mbClassName: '',
      mbCurrentCategory: null,
      mbCurrentSelector: null,
      constantPage: keepInstPage ? null : 0,
      instPage: keepInstPage ? null : 0,
      modulePage: keepInstPage ? null : 0,
    };
  }

  function chooseRequestedInspectorTab(currentTab, obj, options = {}) {
    const preferredInitialTab = options.preferredInitialTab || '';
    const preserveCurrentTab = !!options.preserveCurrentTab;
    return preferredInitialTab || (preserveCurrentTab ? currentTab : obj?.defaultTab) || currentTab;
  }

  function customTabRangeName(customTab) {
    return customTab?.rangeName || customTab?.id || 'custom';
  }

  function customTabPageSize(customTab) {
    const pageSize = parseInt(customTab?.pageSize, 10);
    return Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20;
  }

  function loadedEntryBounds(entries, totalSize) {
    const keys = Object.keys(entries || {})
      .map(n => parseInt(n, 10))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (!keys.length) return {from: totalSize ? 1 : 0, to: 0, count: 0};
    return {from: keys[0], to: keys[keys.length - 1], count: keys.length};
  }

  function customTabRangeQuery(currentObjectQuery, customTab, from, to) {
    const rangeName = customTabRangeName(customTab);
    return normalizeObjectQuery({
      ...(currentObjectQuery || {}),
      [`range_${rangeName}_from`]: from,
      [`range_${rangeName}_to`]: to,
    });
  }

  function buildPagedCollectionState({page = 0, pageSize = 20, offset, total = 0, count = 0, hasMore = false} = {}) {
    const safePage = Math.max(0, Number(page) || 0);
    const safePageSize = Math.max(1, Number(pageSize) || 20);
    const safeOffset = Number.isFinite(Number(offset)) ? Math.max(0, Number(offset)) : safePage * safePageSize;
    const safeCount = Math.max(0, Number(count) || 0);
    const safeTotal = Math.max(0, Number(total) || safeCount);
    const start = safeCount ? safeOffset + 1 : 0;
    const stop = safeCount ? safeOffset + safeCount : 0;
    return {
      page: safePage,
      pageSize: safePageSize,
      total: safeTotal,
      count: safeCount,
      offset: safeOffset,
      start,
      stop,
      pageNumber: safePage + 1,
      canPrev: safePage > 0,
      canNext: !!hasMore,
    };
  }

  function buildCustomTabPagerState(entries, totalSize, customTab) {
    const total = Math.max(0, Number(totalSize) || 0);
    const bounds = loadedEntryBounds(entries, total);
    const pageSize = customTabPageSize(customTab);
    const showPager = !!total && !(bounds.count >= total && total <= pageSize);
    const nextFrom = bounds.to + 1;
    const nextTo = Math.min(total, nextFrom + pageSize - 1);
    const prevFrom = Math.max(1, bounds.from - pageSize);
    const prevTo = Math.min(total, prevFrom + pageSize - 1);
    return {
      bounds,
      pageSize,
      total,
      showPager,
      summaryText: bounds.count >= total ? `All ${total} entries` : `${bounds.from}-${bounds.to} of ${total}`,
      canPrev: bounds.from > 1,
      canNext: !!bounds.count && bounds.to < total,
      canLoadAll: bounds.count < total,
      prevRange: {from: prevFrom, to: prevTo},
      nextRange: {from: nextFrom, to: nextTo},
      allRange: {from: 1, to: total},
    };
  }

  return {
    BUILTIN_ITAB_CAPTIONS,
    normalizeCodeTarget,
    parseClassBrowserTarget,
    getCodeTarget,
    currentCodeBrowserTarget,
    normalizeObjectQuery,
    buildObjectIndexUrl,
    buildMethodBrowserButtonState,
    getAvailableInspectorTabs,
    getCustomTab,
    getInspectorTabCaption,
    resolveInspectorTab,
    buildObjectLoadStartState,
    chooseRequestedInspectorTab,
    customTabRangeName,
    customTabPageSize,
    loadedEntryBounds,
    customTabRangeQuery,
    buildPagedCollectionState,
    buildCustomTabPagerState,
  };
});
