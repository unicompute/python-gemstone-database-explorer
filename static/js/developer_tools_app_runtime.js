(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DeveloperToolsAppRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function parseMethodReference(ref) {
    if (ref && typeof ref === 'object' && !Array.isArray(ref)) {
      let className = String(ref.className || '').trim();
      const selector = String(ref.selector || '').trim();
      const meta = !!ref.meta;
      if (!className || !selector) return null;
      return {
        className,
        selector,
        meta,
        dictionary: String(ref.dictionary || '').trim(),
        label: String(ref.label || `${meta ? `${className} class` : className}>>${selector}`).trim(),
      };
    }
    const split = String(ref || '').indexOf('>>');
    if (split < 0) return null;
    let className = String(ref).slice(0, split).trim();
    const selector = String(ref).slice(split + 2).trim();
    const meta = className.endsWith(' class');
    if (meta) className = className.slice(0, -6).trim();
    return className && selector ? {
      className,
      selector,
      meta,
      dictionary: '',
      label: String(ref).trim(),
    } : null;
  }

  function parseHierarchyEntry(entry) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      return {
        className: String(entry.className || '').trim(),
        dictionary: String(entry.dictionary || '').trim(),
      };
    }
    return {
      className: String(entry || '').trim(),
      dictionary: '',
    };
  }

  function buildUnifiedLineDiff(leftText, rightText, { leftLabel = 'Selected', rightLabel = 'Current' } = {}) {
    const leftLines = String(leftText || '').split('\n');
    const rightLines = String(rightText || '').split('\n');
    const leftSize = leftLines.length;
    const rightSize = rightLines.length;
    const lcs = Array.from({ length: leftSize + 1 }, () => Array(rightSize + 1).fill(0));

    for (let li = leftSize - 1; li >= 0; li -= 1) {
      for (let ri = rightSize - 1; ri >= 0; ri -= 1) {
        lcs[li][ri] = leftLines[li] === rightLines[ri]
          ? lcs[li + 1][ri + 1] + 1
          : Math.max(lcs[li + 1][ri], lcs[li][ri + 1]);
      }
    }

    const rows = [];
    let li = 0;
    let ri = 0;
    while (li < leftSize && ri < rightSize) {
      if (leftLines[li] === rightLines[ri]) {
        rows.push(`  ${leftLines[li]}`);
        li += 1;
        ri += 1;
        continue;
      }
      if (lcs[li + 1][ri] >= lcs[li][ri + 1]) {
        rows.push(`- ${leftLines[li]}`);
        li += 1;
        continue;
      }
      rows.push(`+ ${rightLines[ri]}`);
      ri += 1;
    }
    while (li < leftSize) {
      rows.push(`- ${leftLines[li]}`);
      li += 1;
    }
    while (ri < rightSize) {
      rows.push(`+ ${rightLines[ri]}`);
      ri += 1;
    }

    const changed = rows.some(row => row.startsWith('- ') || row.startsWith('+ '));
    return [
      `--- ${leftLabel}`,
      `+++ ${rightLabel}`,
      changed ? null : '(no differences)',
      ...rows,
    ].filter(line => line !== null).join('\n');
  }

  function setupQueryWindowList({ listEl, filterInput, items, labelForItem, onSelectItem, onOpenItem, onActivateItem, defaultIndex = 0 }) {
    let currentItem = items[defaultIndex] || items[0] || null;
    const activateItem = typeof onActivateItem === 'function' ? onActivateItem : onOpenItem;

    function visibleItems() {
      const filterText = String(filterInput?.value || '').trim().toLowerCase();
      if (!filterText) return items.slice();
      return items.filter(item => String(labelForItem(item) || '').toLowerCase().includes(filterText));
    }

    function updateSelection(focusList = false) {
      let activeRow = null;
      listEl.querySelectorAll('.qv-item').forEach(row => {
        const isActive = row.dataset.itemKey === String(items.indexOf(currentItem));
        row.classList.toggle('active', isActive);
        if (isActive) activeRow = row;
      });
      if (activeRow) {
        activeRow.scrollIntoView({ block: 'nearest' });
        if (focusList) listEl.focus({ preventScroll: true });
      } else if (focusList) {
        listEl.focus({ preventScroll: true });
      }
      onSelectItem(currentItem, activeRow);
    }

    function render() {
      const visible = visibleItems();
      if (currentItem && !visible.includes(currentItem)) {
        currentItem = visible[0] || null;
      }
      listEl.innerHTML = '';
      if (!items.length) {
        listEl.innerHTML = '<div class="cb-empty">(empty)</div>';
        onSelectItem(null, null);
        return;
      }
      if (!visible.length) {
        listEl.innerHTML = '<div class="cb-empty">(no matches)</div>';
        onSelectItem(null, null);
        return;
      }
      visible.forEach(item => {
        const row = document.createElement('div');
        row.className = 'qv-item';
        row.dataset.itemKey = String(items.indexOf(item));
        row.textContent = labelForItem(item);
        row.title = row.textContent;
        row.addEventListener('click', () => {
          currentItem = item;
          updateSelection();
        });
        row.addEventListener('dblclick', () => {
          currentItem = item;
          updateSelection();
          onOpenItem?.(item);
        });
        listEl.appendChild(row);
      });
      updateSelection();
    }

    function selectRelative(delta) {
      const visible = visibleItems();
      if (!visible.length) return;
      let currentIndex = visible.indexOf(currentItem);
      if (currentIndex < 0) currentIndex = delta >= 0 ? -1 : visible.length;
      currentItem = visible[Math.max(0, Math.min(visible.length - 1, currentIndex + delta))];
      updateSelection(true);
    }

    function selectBoundary(boundary) {
      const visible = visibleItems();
      if (!visible.length) return;
      currentItem = boundary === 'last' ? visible[visible.length - 1] : visible[0];
      updateSelection(true);
    }

    filterInput?.addEventListener('input', render);
    filterInput?.addEventListener('keydown', event => {
      if (event.key === 'Escape' && filterInput.value) {
        event.preventDefault();
        filterInput.value = '';
        render();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        selectRelative(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        selectRelative(-1);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        selectBoundary('first');
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        selectBoundary('last');
        return;
      }
      if (event.key === 'Enter' && currentItem) {
        event.preventDefault();
        activateItem?.(currentItem);
      }
    });

    listEl.tabIndex = 0;
    listEl.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        selectRelative(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        selectRelative(-1);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        selectBoundary('first');
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        selectBoundary('last');
        return;
      }
      if (event.key === 'Enter' && currentItem) {
        event.preventDefault();
        activateItem?.(currentItem);
      }
    });

    render();
    return {
      getCurrentItem: () => currentItem,
      refresh: render,
    };
  }

  function createDeveloperToolsAppRuntime(deps = {}) {
    function openDebugger(threadOrOop, threadName, options = {}) {
      const thread = (threadOrOop && typeof threadOrOop === 'object')
        ? threadOrOop
        : { oop: threadOrOop, printString: threadName || '', exceptionText: '', sourcePreview: '' };
      const threadOop = thread.oop;
      const threadLabel = thread.sourcePreview || thread.exceptionText || thread.printString || '';
      const debuggerWidth = options.width || 660;
      const debuggerHeight = options.height || 600;
      const offsetPos = (options.x === undefined && options.y === undefined && options.sourceWindowId)
        ? deps.sourceRelativeWindowPosition(options.sourceWindowId, debuggerWidth, debuggerHeight, { dx: 34, dy: -22 })
        : null;
      const { win, body, id } = deps.createWindow({
        title: 'Debugger — ' + threadLabel.slice(0, 40),
        width: debuggerWidth,
        height: debuggerHeight,
        x: options.x !== undefined ? options.x : offsetPos?.x,
        y: options.y !== undefined ? options.y : offsetPos?.y,
        taskbarLabel: 'Debugger',
      });
      const sourceSessionChannel = options.sessionChannel || deps.windowState.get(options.sourceWindowId || '')?.sessionChannel || '';
      const sessionChannel = deps.exactWriteSessionChannel(sourceSessionChannel) || `debugger:${id}-w`;
      const debuggerApi = (url, opts = {}) => deps.api(url, { ...opts, sessionChannel });
      const debuggerApiPost = (url, requestBody = {}) => deps.apiPost(url, requestBody, { sessionChannel });
      deps.createDebuggerWindowRuntime({
        id,
        win,
        body,
        thread,
        threadOop,
        threadLabel,
        initialTab: options.currentTab,
        initialFrameIndex: options.frameIndex,
        sourceWindowId: options.sourceWindowId || null,
        sessionChannel,
        windowState: deps.windowState,
        upsertWindowState: deps.upsertWindowState,
        buildDebuggerWindowHtml: deps.buildDebuggerWindowHtml,
        buildDebuggerSummaryState: deps.buildDebuggerSummaryState,
        buildDebuggerFramesListHtml: deps.buildDebuggerFramesListHtml,
        buildDebuggerSourceView: deps.buildDebuggerSourceView,
        buildDebuggerFramesExportText: deps.buildDebuggerFramesExportText,
        buildDebuggerSourceExportText: deps.buildDebuggerSourceExportText,
        buildDebuggerVariableOptionsHtml: deps.buildDebuggerVariableOptionsHtml,
        bindDebuggerTabActions: deps.bindDebuggerTabActions,
        bindDebuggerToolbarActions: deps.bindDebuggerToolbarActions,
        bindDebuggerKeyboardActions: deps.bindDebuggerKeyboardActions,
        bindDebuggerVariableSelector: deps.bindDebuggerVariableSelector,
        bindDebuggerFrameListActions: deps.bindDebuggerFrameListActions,
        applyDebuggerTabState: deps.applyDebuggerTabState,
        applyDebuggerFrameSelection: deps.applyDebuggerFrameSelection,
        applyDebuggerToolbarState: deps.applyDebuggerToolbarState,
        debuggerApi,
        debuggerApiPost,
        copyTextToClipboard: deps.copyTextToClipboard,
        refreshHaltedThreadsBar: deps.refreshHaltedThreadsBar,
        closeWindow: deps.closeWindow,
        setStatus: deps.setStatus,
        makeChip: deps.makeChip,
        shortLabel: deps.shortLabel,
        isLeafBasetype: deps.isLeafBasetype,
        escHtml: deps.escHtml,
      }).mount();
      return win;
    }

    function openSymbolList(px, py, pw, ph) {
      const options = (px && typeof px === 'object' && !Array.isArray(px))
        ? px
        : { x: px, y: py, width: pw, height: ph };
      const { win, body, id } = deps.createWindow({
        title: 'Symbol List Browser',
        width: options.width || 480,
        height: options.height || 460,
        taskbarLabel: 'Symbol List',
        x: options.x,
        y: options.y,
      });
      const sessionChannel = `symbol-list:${id}`;
      const symbolListApi = (url, opts = {}) => deps.api(url, { ...opts, sessionChannel });
      const symbolListApiPost = (url, requestBody = {}) => deps.apiPost(url, requestBody, { sessionChannel });
      const symbolListApiTransaction = url => deps.apiTransaction(url, { sessionChannel });
      deps.createSymbolListWindowRuntime({
        id,
        body,
        options,
        sessionChannel,
        symbolListApi,
        symbolListApiPost,
        symbolListApiTransaction,
        upsertWindowState: deps.upsertWindowState,
        openLinkedObjectWindow: deps.openLinkedObjectWindow,
        makeChip: deps.makeChip,
        isLeafBasetype: deps.isLeafBasetype,
        setStatus: deps.setStatus,
        escHtml: deps.escHtml,
        requestModal: deps.requestModal,
        requestConfirmModal: deps.requestConfirmModal,
      }).mount();
      return win;
    }

    function openMethodQueryWindow(title, results, options = {}) {
      const canLoadResult = typeof options.onLoadResult === 'function' || !!options.sourceWindowId;
      const { win, body, id } = deps.createWindow({
        title,
        width: options.width || 760,
        height: options.height || 520,
        x: options.x,
        y: options.y,
        taskbarLabel: 'Method Query',
      });
      body.innerHTML = deps.buildQueryHelperWindowHtml({
        escHtml: deps.escHtml,
        filterPlaceholder: 'Filter results',
        initialTitle: 'Select a result',
        buttons: [
          canLoadResult ? { id: 'qv-load', label: options.loadLabel || 'Load Into Browser' } : null,
          { id: 'qv-open', label: 'Open In Browser' },
          { id: 'qv-inspect', label: 'Inspect Method' },
        ].filter(Boolean),
      });

      deps.createMethodQueryWindowRuntime({
        id,
        title,
        results,
        options,
        listEl: body.querySelector('.qv-list'),
        filterInput: body.querySelector('.qv-filter'),
        titleEl: body.querySelector('.qv-title'),
        previewEl: body.querySelector('.qv-preview'),
        buttons: {
          loadBtn: body.querySelector('#qv-load'),
          openBtn: body.querySelector('#qv-open'),
          inspectBtn: body.querySelector('#qv-inspect'),
        },
        windowState: deps.windowState,
        openClassBrowser: deps.openClassBrowser,
        apiWithParams: deps.apiWithParams,
        apiPost: deps.apiPost,
        parseMethodReference,
        openLinkedObjectWindow: deps.openLinkedObjectWindow,
        setStatus: deps.setStatus,
        setupQueryWindowList,
        upsertWindowState: deps.upsertWindowState,
        sanitizeSelectionIndex: deps.sanitizeSelectionIndex,
        bindQueryHelperToolbarActions: deps.bindQueryHelperToolbarActions,
        applyQueryHelperActionState: deps.applyQueryHelperActionState,
        resolveClassBrowserRuntime: deps.resolveClassBrowserRuntime,
      }).mount();
      return win;
    }

    function openHierarchyWindow(title, classes, options = {}) {
      const canLoadClass = typeof options.onLoadClass === 'function' || !!options.sourceWindowId;
      const { win, body, id } = deps.createWindow({
        title,
        width: options.width || 640,
        height: options.height || 480,
        x: options.x,
        y: options.y,
        taskbarLabel: 'Hierarchy',
      });
      body.innerHTML = deps.buildQueryHelperWindowHtml({
        escHtml: deps.escHtml,
        filterPlaceholder: 'Filter classes',
        initialTitle: 'Select a class',
        buttons: [
          canLoadClass ? { id: 'qv-load-class', label: options.loadLabel || 'Load Into Browser' } : null,
          { id: 'qv-open-class', label: 'Open In Browser' },
          { id: 'qv-inspect-class', label: 'Inspect Class' },
        ].filter(Boolean),
      });

      deps.createHierarchyWindowRuntime({
        id,
        title,
        classes,
        options,
        listEl: body.querySelector('.qv-list'),
        filterInput: body.querySelector('.qv-filter'),
        titleEl: body.querySelector('.qv-title'),
        previewEl: body.querySelector('.qv-preview'),
        buttons: {
          loadBtn: body.querySelector('#qv-load-class'),
          openBtn: body.querySelector('#qv-open-class'),
          inspectBtn: body.querySelector('#qv-inspect-class'),
        },
        windowState: deps.windowState,
        openClassBrowser: deps.openClassBrowser,
        apiWithParams: deps.apiWithParams,
        apiPost: deps.apiPost,
        parseHierarchyEntry,
        openLinkedObjectWindow: deps.openLinkedObjectWindow,
        setStatus: deps.setStatus,
        setupQueryWindowList,
        upsertWindowState: deps.upsertWindowState,
        sanitizeSelectionIndex: deps.sanitizeSelectionIndex,
        bindQueryHelperToolbarActions: deps.bindQueryHelperToolbarActions,
        applyQueryHelperActionState: deps.applyQueryHelperActionState,
        resolveClassBrowserRuntime: deps.resolveClassBrowserRuntime,
      }).mount();
      return win;
    }

    function openVersionsWindow(title, versions, options = {}) {
      const canLoadVersion = typeof options.onLoadVersion === 'function' || !!options.sourceWindowId;
      const canOpenVersionBrowser = !!String(options.versionContext?.className || '').trim();
      const canCompareVersion = canOpenVersionBrowser;
      const { win, body, id } = deps.createWindow({
        title,
        width: options.width || 760,
        height: options.height || 520,
        x: options.x,
        y: options.y,
        taskbarLabel: 'Versions',
      });
      body.innerHTML = deps.buildQueryHelperWindowHtml({
        escHtml: deps.escHtml,
        filterPlaceholder: 'Filter versions',
        initialTitle: 'Select a version',
        buttons: [
          canLoadVersion ? { id: 'qv-load-version', label: options.loadLabel || 'Load Into Browser' } : null,
          canOpenVersionBrowser ? { id: 'qv-open-version', label: 'Open In Browser' } : null,
          canCompareVersion ? { id: 'qv-compare-version', label: 'Compare With Current' } : null,
          { id: 'qv-inspect-version', label: 'Inspect Version' },
        ].filter(Boolean),
      });

      deps.createVersionsWindowRuntime({
        id,
        title,
        versions,
        options,
        listEl: body.querySelector('.qv-list'),
        filterInput: body.querySelector('.qv-filter'),
        titleEl: body.querySelector('.qv-title'),
        previewEl: body.querySelector('.qv-preview'),
        buttons: {
          loadBtn: body.querySelector('#qv-load-version'),
          openBtn: body.querySelector('#qv-open-version'),
          compareBtn: body.querySelector('#qv-compare-version'),
          inspectBtn: body.querySelector('#qv-inspect-version'),
        },
        windowState: deps.windowState,
        openClassBrowser: deps.openClassBrowser,
        setStatus: deps.setStatus,
        setupQueryWindowList,
        upsertWindowState: deps.upsertWindowState,
        sanitizeSelectionIndex: deps.sanitizeSelectionIndex,
        bindQueryHelperToolbarActions: deps.bindQueryHelperToolbarActions,
        applyQueryHelperActionState: deps.applyQueryHelperActionState,
        openLinkedObjectWindow: deps.openLinkedObjectWindow,
        buildUnifiedLineDiff,
        openClassBrowserRuntime: deps.openClassBrowserRuntime,
        resolveClassBrowserRuntime: deps.resolveClassBrowserRuntime,
      }).mount();
      return win;
    }

    return {
      openDebugger,
      openSymbolList,
      openMethodQueryWindow,
      openHierarchyWindow,
      openVersionsWindow,
      parseMethodReference,
      parseHierarchyEntry,
      buildUnifiedLineDiff,
      setupQueryWindowList,
    };
  }

  return {
    createDeveloperToolsAppRuntime,
    parseMethodReference,
    parseHierarchyEntry,
    buildUnifiedLineDiff,
    setupQueryWindowList,
  };
});
