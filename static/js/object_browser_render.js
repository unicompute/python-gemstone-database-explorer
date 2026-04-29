(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ObjectBrowserRender = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LEAF_BASETYPES = new Set([
    'boolean',
    'nilclass',
    'smallint',
    'largeint',
    'float',
    'char',
    'string',
    'symbol',
    'bytearray',
  ]);

  function isLeafBasetype(basetype) {
    return LEAF_BASETYPES.has(basetype);
  }

  function inspectionText(value, fallback = 'nil') {
    if (!value) return fallback;
    if (value.inspection) return value.inspection;
    if (value.oop != null) return `oop:${value.oop}`;
    return fallback;
  }

  function buildValueRenderState(value) {
    if (!value || value.basetype === 'nilclass') {
      return {kind: 'nil', text: 'nil'};
    }
    const text = inspectionText(value);
    if (isLeafBasetype(value.basetype) || value.oop == null) {
      return {kind: 'text', text};
    }
    if (value.basetype === 'hash') {
      return {kind: 'hash', text, oop: value.oop};
    }
    if (value.basetype === 'array') {
      return {kind: 'array', text, oop: value.oop};
    }
    return {kind: 'object', text, oop: value.oop};
  }

  function buildAssociationRenderState(entries, totalSize, emptyText = '(empty)', options = {}) {
    const showSummary = options.showSummary !== false;
    const rawEntries = entries && typeof entries === 'object' ? entries : {};
    const entryKeys = Object.keys(rawEntries);
    const rows = entryKeys.map((entryKey) => {
      const pair = rawEntries[entryKey] || [];
      const keyValue = pair[0] || null;
      const value = pair[1] || null;
      const keyText = inspectionText(keyValue);
      const keyIsChip = !!(keyValue?.oop != null && !isLeafBasetype(keyValue?.basetype));
      return {
        entryKey,
        key: {
          text: keyText,
          oop: keyValue?.oop ?? null,
          isChip: keyIsChip,
        },
        value: buildValueRenderState(value),
      };
    });
    return {
      isEmpty: !rows.length,
      emptyText,
      rows,
      summaryText: showSummary && totalSize > rows.length ? `${rows.length} of ${totalSize} entries` : '',
    };
  }

  function buildCustomTabRenderState(obj, customTab) {
    if (customTab?.kind === 'association-dict') {
      const entries = obj?.[customTab.field] || {};
      const totalSize = obj?.[customTab.sizeField] ?? Object.keys(entries).length;
      return {
        kind: 'association-dict',
        entries,
        totalSize,
        association: buildAssociationRenderState(entries, totalSize, '(empty)', {showSummary: false}),
      };
    }
    return {
      kind: 'unsupported',
      caption: customTab?.caption || customTab?.id || 'custom',
    };
  }

  function buildObjectCardState(obj) {
    const entries = obj?.instVars || {};
    const isDictLike = obj?.basetype === 'hash';
    const isArray = obj?.basetype === 'array';
    const rows = Object.entries(entries).map(([entryKey, pair]) => {
      const keyValue = pair[0] || null;
      const value = pair[1] || null;
      const keyText = keyValue?.inspection || `@${entryKey}`;
      const keyIsChip = !!(isDictLike && keyValue?.oop != null && !isLeafBasetype(keyValue?.basetype));
      return {
        entryKey,
        key: {
          text: keyText,
          oop: keyValue?.oop ?? null,
          isChip: keyIsChip,
        },
        value: buildValueRenderState(value),
      };
    });
    return {
      header: {
        basetype: obj?.basetype || 'object',
        className: obj?.classObject?.inspection || '',
        inspection: obj?.inspection || '',
        oopText: `oop:${obj?.oop}`,
      },
      hasTable: !!(obj?.loaded && rows.length),
      rows,
      keyColumnLabel: isDictLike ? 'Key' : (isArray ? '#' : 'Variable'),
      moreText: obj?.instVarsSize > rows.length ? `${rows.length} of ${obj.instVarsSize} entries` : '',
      classLink: obj?.classObject?.oop ? {
        oop: obj.classObject.oop,
        text: obj.classObject.inspection || `oop:${obj.classObject.oop}`,
      } : null,
    };
  }

  function buildPageSummaryText(pageState, noun) {
    return `${pageState.start}-${pageState.stop} of ${pageState.total} ${noun}`;
  }

  function buildInstancesCollectionState(instances, pageState) {
    const rows = (instances || []).map(inst => ({
      oop: inst.oop,
      chipText: String(inst.printString || '').slice(0, 40),
      printText: String(inst.printString || '').slice(0, 80),
    }));
    return {
      isEmpty: !rows.length,
      emptyText: '(no instances)',
      rows,
      summaryText: buildPageSummaryText(pageState, 'instances'),
    };
  }

  function buildConstantsCollectionState(constants, pageState) {
    const rows = (constants || []).map(constant => {
      const valueRef = constant.valueObject || {inspection: constant.value || '', basetype: 'string', oop: null};
      return {
        key: constant.key || '',
        value: buildValueRenderState(valueRef),
        valueLabel: constant.key || valueRef.inspection || 'constant',
      };
    });
    return {
      isEmpty: !rows.length,
      emptyText: '(no constants)',
      rows,
      summaryText: buildPageSummaryText(pageState, 'constants'),
    };
  }

  function buildModulesCollectionState(modules, pageState) {
    const rows = (modules || []).map(entry => ({
      owner: buildValueRenderState(entry.owner),
      ownerLabel: entry.owner?.inspection || 'owner',
      module: buildValueRenderState(entry.module),
      moduleLabel: entry.module?.inspection || 'module',
    }));
    return {
      isEmpty: !rows.length,
      emptyText: '(no included modules)',
      rows,
      summaryText: buildPageSummaryText(pageState, 'included modules'),
    };
  }

  return {
    buildValueRenderState,
    buildAssociationRenderState,
    buildCustomTabRenderState,
    buildObjectCardState,
    buildInstancesCollectionState,
    buildConstantsCollectionState,
    buildModulesCollectionState,
  };
});
