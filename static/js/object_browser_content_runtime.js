(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ObjectBrowserContentRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createObjectBrowserContentRuntime(deps = {}) {
    const state = () => deps.getState?.() || {};

    function appendRenderedValueChips(row, valueState) {
      return deps.appendObjectBrowserValueChips?.(row, valueState, {
        assocChip: deps.assocChip,
        hashBraceChip: deps.hashBraceChip,
        document: deps.document,
      });
    }

    function renderAssociationPairs(ibody, entries, totalSize, emptyText = '(empty)', options = {}) {
      const renderState = deps.buildAssociationRenderState?.(entries, totalSize, emptyText, options);
      return deps.renderObjectBrowserAssociationPairs?.(ibody, renderState, {
        document: deps.document,
        assocChip: deps.assocChip,
        appendRenderedValueChips,
        escHtml: deps.escHtml,
      });
    }

    function makeValCellFromState(valueState, label) {
      return deps.makeObjectBrowserValCellFromState?.(valueState, label, {
        document: deps.document,
        makeChip: (text, chipOop) => deps.makeChip?.(text, chipOop, deps.id),
        navigateToOop(oop, nextLabel) {
          const nextHistory = [...(state().history || []), { label: nextLabel, oop }];
          deps.setState?.({ history: nextHistory });
          deps.loadObject?.(oop, nextLabel);
        },
        buildValueRenderState: deps.buildValueRenderState,
      });
    }

    function makeValCell(valV, label) {
      return makeValCellFromState(deps.buildValueRenderState?.(valV), label);
    }

    function appendCustomTabPager(ibody, customTab, entries, totalSize) {
      const pager = deps.buildCustomTabPagerState?.(entries, totalSize, customTab);
      if (!pager?.showPager) return;

      const current = state();
      const label = current.history?.[current.history.length - 1]?.label || current.currentObjData?.inspection || 'object';
      const bar = deps.document.createElement('div');
      bar.className = 'inst-pagination';
      const info = deps.document.createElement('span');
      info.style.cssText = 'font-size:10px;color:#6c7086';
      info.textContent = pager.summaryText;
      bar.appendChild(info);

      const buildNavButton = (text, enabled, range) => {
        const button = deps.document.createElement('button');
        button.className = 'inst-page-btn';
        button.textContent = text;
        button.disabled = !enabled;
        button.addEventListener('click', () => {
          if (button.disabled) return;
          deps.loadObject?.(current.currentOop, label, {
            query: deps.customTabRangeQuery?.(current.currentObjectQuery, customTab, range.from, range.to),
            preserveCurrentTab: true,
            keepInstPage: true,
          });
        });
        return button;
      };

      bar.appendChild(buildNavButton('Prev', pager.canPrev, pager.prevRange));
      bar.appendChild(buildNavButton('Next', pager.canNext, pager.nextRange));
      bar.appendChild(buildNavButton('Load All', pager.canLoadAll, pager.allRange));
      ibody.appendChild(bar);
    }

    function renderCustomTab(ibody, obj, customTab) {
      return deps.renderObjectBrowserCustomTab?.(ibody, obj, customTab, {
        buildCustomTabRenderState: deps.buildCustomTabRenderState,
        renderAssociationPairs: (targetBody, renderState) =>
          deps.renderObjectBrowserAssociationPairs?.(targetBody, renderState, {
            document: deps.document,
            assocChip: deps.assocChip,
            appendRenderedValueChips,
            escHtml: deps.escHtml,
          }),
        appendCustomTabPager: (tab, entries, total) => appendCustomTabPager(ibody, tab, entries, total),
        escHtml: deps.escHtml,
      });
    }

    function renderCard(obj) {
      return deps.renderObjectBrowserCard?.(obj, {
        document: deps.document,
        buildObjectCardState: deps.buildObjectCardState,
        getCodeTarget: deps.getCodeTarget,
        openMethodBrowser: deps.openMethodBrowser,
        navigateToOop(oop, label) {
          const nextHistory = [...(state().history || []), { label, oop }];
          deps.setState?.({ history: nextHistory });
          deps.loadObject?.(oop, label);
        },
        makeChip: (text, chipOop) => deps.makeChip?.(text, chipOop, deps.id),
        makeValCellFromState,
      });
    }

    return {
      appendRenderedValueChips,
      renderAssociationPairs,
      makeValCellFromState,
      makeValCell,
      appendCustomTabPager,
      renderCustomTab,
      renderCard,
    };
  }

  return {
    createObjectBrowserContentRuntime,
  };
});
