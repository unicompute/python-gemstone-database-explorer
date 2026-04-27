(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DebuggerWindowController = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function bindEvent(node, type, handler) {
    if (!node || typeof node.addEventListener !== 'function' || typeof handler !== 'function') return;
    node.addEventListener(type, handler);
  }

  function forEachQuery(root, selector, handler) {
    if (!root || typeof root.querySelectorAll !== 'function' || typeof handler !== 'function') return;
    root.querySelectorAll(selector).forEach(node => handler(node));
  }

  function closestTarget(node, selector) {
    if (!node) return null;
    if (typeof node.closest === 'function') return node.closest(selector);
    let current = node;
    while (current) {
      if (typeof current.matches === 'function' && current.matches(selector)) return current;
      current = current.parentNode || null;
    }
    return null;
  }

  function frameIndexes(framesEl) {
    if (!framesEl || typeof framesEl.querySelectorAll !== 'function') return [];
    return Array.from(framesEl.querySelectorAll('.dbg-frame-item'))
      .map(node => Number(node.dataset.idx))
      .filter(Number.isFinite);
  }

  function bindDebuggerTabActions(tabStrip, handlers = {}) {
    bindEvent(tabStrip, 'click', event => {
      const tab = closestTarget(event.target, '.tab-item');
      if (!tab) return;
      handlers.onTabChange?.(tab.dataset.dtab || 'stack');
    });
  }

  function bindDebuggerToolbarActions(buttons = {}, handlers = {}) {
    bindEvent(buttons.proceedBtn, 'click', handlers.onProceed);
    bindEvent(buttons.stepBtn, 'click', handlers.onStep);
    bindEvent(buttons.stepIntoBtn, 'click', handlers.onStepInto);
    bindEvent(buttons.stepOverBtn, 'click', handlers.onStepOver);
    bindEvent(buttons.restartBtn, 'click', handlers.onRestart);
    bindEvent(buttons.trimBtn, 'click', handlers.onTrim);
  }

  function bindDebuggerVariableSelector(selectEl, handlers = {}) {
    bindEvent(selectEl, 'change', () => handlers.onVariableChange?.(selectEl.value || ''));
  }

  function bindDebuggerFrameListActions(framesEl, handlers = {}) {
    bindEvent(framesEl, 'click', event => {
      const frameEl = closestTarget(event.target, '.dbg-frame-item');
      if (!frameEl) return;
      handlers.onFrameSelect?.(Number(frameEl.dataset.idx), {focus: true});
    });
    bindEvent(framesEl, 'keydown', event => {
      const frameEl = closestTarget(event.target, '.dbg-frame-item');
      if (!frameEl) return;
      const indexes = frameIndexes(framesEl);
      const currentIndex = Number(frameEl.dataset.idx);
      const currentPos = indexes.findIndex(index => index === currentIndex);
      if (currentPos < 0) return;
      let nextIndex = null;
      if (event.key === 'ArrowDown') {
        nextIndex = indexes[Math.min(indexes.length - 1, currentPos + 1)];
      } else if (event.key === 'ArrowUp') {
        nextIndex = indexes[Math.max(0, currentPos - 1)];
      } else if (event.key === 'Home') {
        nextIndex = indexes[0];
      } else if (event.key === 'End') {
        nextIndex = indexes[indexes.length - 1];
      }
      if (!Number.isFinite(nextIndex)) return;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      handlers.onFrameSelect?.(nextIndex, {focus: true});
    });
  }

  function applyDebuggerTabState(body, id, currentTab = 'stack') {
    forEachQuery(body, '.tab-item', tab => {
      tab.classList.toggle('active', tab.dataset.dtab === currentTab);
    });
    const stackEl = body?.querySelector?.(`#${id}-stack`);
    const tlsEl = body?.querySelector?.(`#${id}-tls`);
    if (stackEl) stackEl.style.display = currentTab === 'stack' ? 'flex' : 'none';
    if (tlsEl) tlsEl.style.display = currentTab === 'tls' ? 'block' : 'none';
  }

  function applyDebuggerFrameSelection(framesEl, frameIndex) {
    forEachQuery(framesEl, '.dbg-frame-item', node => {
      node.classList.toggle('active', Number(node.dataset.idx) === Number(frameIndex));
    });
  }

  function applyDebuggerToolbarState(buttons = {}, state = {}) {
    if (buttons.proceedBtn) buttons.proceedBtn.disabled = !!state.proceedDisabled;
    if (buttons.stepBtn) buttons.stepBtn.disabled = !!state.stepDisabled;
    if (buttons.stepIntoBtn) buttons.stepIntoBtn.disabled = !!state.stepIntoDisabled;
    if (buttons.stepOverBtn) buttons.stepOverBtn.disabled = !!state.stepOverDisabled;
    if (buttons.restartBtn) buttons.restartBtn.disabled = !!state.restartDisabled;
    if (buttons.trimBtn) buttons.trimBtn.disabled = !!state.trimDisabled;
  }

  return {
    bindDebuggerTabActions,
    bindDebuggerToolbarActions,
    bindDebuggerVariableSelector,
    bindDebuggerFrameListActions,
    applyDebuggerTabState,
    applyDebuggerFrameSelection,
    applyDebuggerToolbarState,
  };
});
