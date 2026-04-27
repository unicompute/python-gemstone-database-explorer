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

  return {
    BUILTIN_ITAB_CAPTIONS,
    normalizeCodeTarget,
    parseClassBrowserTarget,
    getCodeTarget,
    currentCodeBrowserTarget,
    normalizeObjectQuery,
    buildObjectIndexUrl,
    getAvailableInspectorTabs,
    getCustomTab,
    getInspectorTabCaption,
    customTabRangeName,
    customTabPageSize,
    loadedEntryBounds,
    customTabRangeQuery,
  };
});
