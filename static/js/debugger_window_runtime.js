(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DebuggerWindowRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function buildDebuggerWindowState({
    threadOop,
    threadLabel,
    currentTab,
    frameIndex,
    sourceWindowId,
    sessionChannel,
  } = {}) {
    return {
      kind: 'debugger',
      sessionChannel: String(sessionChannel || ''),
      threadOop,
      threadLabel: String(threadLabel || ''),
      currentTab: currentTab === 'tls' ? 'tls' : 'stack',
      frameIndex: Number.isFinite(Number(frameIndex)) ? Number(frameIndex) : 0,
      sourceWindowId: sourceWindowId || null,
    };
  }

  function buildDebuggerToolbarState({
    busy = false,
    hasFrames = false,
    currentFrameCanStep = false,
    currentFrameData = null,
    threadOop = 0,
  } = {}) {
    const hasCurrentFrame = !!currentFrameData && currentFrameData.hasFrame !== false;
    const frameStatus = String(currentFrameData?.status || '').trim().toLowerCase();
    const frameAllows = (key, fallback = false) => {
      if (!hasCurrentFrame) return false;
      if (Object.prototype.hasOwnProperty.call(currentFrameData || {}, key)) {
        return !!currentFrameData[key];
      }
      return !!fallback;
    };
    const statusAllows = (allowed = [], fallback = false) => {
      if (!hasCurrentFrame) return false;
      if (!frameStatus) return !!fallback;
      return allowed.includes(frameStatus);
    };
    const canStep = frameAllows('canStep', currentFrameCanStep);
    return {
      refreshDisabled: !!busy || !(Number(threadOop) > 0),
      proceedDisabled: !!busy || !statusAllows(['suspended'], hasCurrentFrame) || !frameAllows('canProceed', hasCurrentFrame),
      stepDisabled: !!busy || !statusAllows(['suspended'], hasCurrentFrame) || !canStep,
      stepIntoDisabled: !!busy || !statusAllows(['suspended'], hasCurrentFrame) || !frameAllows('canStepInto', canStep),
      stepOverDisabled: !!busy || !statusAllows(['suspended'], hasCurrentFrame) || !frameAllows('canStepOver', canStep),
      stepReturnDisabled: !!busy || !statusAllows(['suspended'], hasCurrentFrame) || !frameAllows('canStepReturn', canStep),
      restartDisabled: !!busy || !statusAllows(['suspended'], hasCurrentFrame) || !frameAllows('canRestart', hasCurrentFrame),
      trimDisabled: !!busy || !statusAllows(['suspended'], hasCurrentFrame && hasFrames) || !frameAllows('canTrim', hasCurrentFrame && hasFrames),
      terminateDisabled: !!busy || !statusAllows(['suspended', 'running'], hasCurrentFrame) || !frameAllows('canTerminate', hasCurrentFrame),
      copyStackDisabled: !hasFrames,
      copySourceDisabled: !currentFrameData,
    };
  }

  function isExecutedCodeFrameName(name) {
    return /Executed code\s*@/i.test(String(name || ''));
  }

  function buildDebuggerFrameIdentity(frameLike = {}, fallbackIndex = 0) {
    const methodName = String(frameLike?.methodName || frameLike?.name || '').trim();
    const className = String(frameLike?.className || '').trim();
    const selectorName = String(frameLike?.selectorName || '').trim();
    const explicitFrameKey = String(frameLike?.frameKey || '').trim();
    const isExecutedCode = frameLike?.isExecutedCode === true || isExecutedCodeFrameName(methodName);
    const frameKey = explicitFrameKey
      || (isExecutedCode
        ? ((className && selectorName) ? `executed:${className}>>${selectorName}` : 'executed-code')
        : ((className && selectorName) ? `${className}>>${selectorName}` : (methodName ? `name:${methodName}` : '')));
    const index = Number.isFinite(Number(frameLike?.index))
      ? Number(frameLike.index)
      : (Number.isFinite(Number(frameLike?.frameIndex)) ? Number(frameLike.frameIndex) : Number(fallbackIndex) || 0);
    return {
      frameKey,
      isExecutedCode,
      className,
      selectorName,
      methodName,
      index,
    };
  }

  function debuggerFrameMatchesIdentity(frame = {}, identity = null) {
    if (!identity) return false;
    const candidate = buildDebuggerFrameIdentity(frame);
    if (identity.frameKey && candidate.frameKey && identity.frameKey === candidate.frameKey) return true;
    if (identity.isExecutedCode && candidate.isExecutedCode) return true;
    if (identity.className && identity.selectorName) {
      return identity.className === candidate.className && identity.selectorName === candidate.selectorName;
    }
    return !!identity.methodName && identity.methodName === candidate.methodName;
  }

  function preferredDebuggerFrame(frames = [], requestedFrameIndex = 0, selectedIdentity = null, options = {}) {
    const list = Array.isArray(frames) ? frames : [];
    if (!list.length) return null;
    const requestedIndex = Number.isFinite(Number(requestedFrameIndex)) ? Number(requestedFrameIndex) : 0;
    const preferExecutedCode = options?.preferExecutedCode !== false;
    if (selectedIdentity) {
      const exactIdentityMatch = list.find(frame => debuggerFrameMatchesIdentity(frame, selectedIdentity));
      if (exactIdentityMatch) return exactIdentityMatch;
    }
    if (requestedIndex === 0) {
      return (preferExecutedCode ? list.find(frame => isExecutedCodeFrameName(frame?.name)) : null) || list[0];
    }
    const exact = list.find(frame => Number(frame?.index) === requestedIndex);
    if (exact) return exact;
    const numericFrames = list
      .map(frame => ({frame, index: Number(frame?.index)}))
      .filter(entry => Number.isFinite(entry.index));
    if (numericFrames.length) {
      numericFrames.sort((left, right) => {
        const distance = Math.abs(left.index - requestedIndex) - Math.abs(right.index - requestedIndex);
        if (distance !== 0) return distance;
        return left.index - right.index;
      });
      return numericFrames[0]?.frame || list[0];
    }
    return list[0];
  }

  function syncDebuggerFramesWithDetail(frames = [], frameIndex = 0, frameData = null) {
    const list = Array.isArray(frames) ? frames : [];
    const nextName = String(frameData?.methodName || '').trim();
    if (!list.length || !nextName) return list;
    const requestedIndex = Number.isFinite(Number(frameIndex)) ? Number(frameIndex) : 0;
    const nextIdentity = buildDebuggerFrameIdentity(frameData, requestedIndex);
    let changed = false;
    const nextFrames = list.map(frame => {
      if (Number(frame?.index) !== requestedIndex) return frame;
      if (
        String(frame?.name || '') === nextName
        && String(frame?.className || '') === nextIdentity.className
        && String(frame?.selectorName || '') === nextIdentity.selectorName
        && String(frame?.frameKey || '') === nextIdentity.frameKey
        && !!frame?.isExecutedCode === nextIdentity.isExecutedCode
      ) {
        return frame;
      }
      changed = true;
      return {
        ...frame,
        name: nextName,
        className: nextIdentity.className,
        selectorName: nextIdentity.selectorName,
        frameKey: nextIdentity.frameKey,
        isExecutedCode: nextIdentity.isExecutedCode,
      };
    });
    return changed ? nextFrames : list;
  }

  function createDebuggerWindowRuntime(config = {}) {
    const {
      id,
      win,
      body,
      thread = {},
      threadOop,
      threadLabel = '',
      initialTab = 'stack',
      initialFrameIndex = 0,
      sourceWindowId: initialSourceWindowId = null,
      sessionChannel = '',
      windowState,
      upsertWindowState = () => {},
      buildDebuggerWindowHtml = () => '',
      buildDebuggerSummaryState = () => ({hidden: true}),
      buildDebuggerFramesListHtml = () => '',
      buildDebuggerSourceView = () => ({metaText: '', sourceHtml: ''}),
      buildDebuggerFramesExportText = () => '',
      buildDebuggerSourceExportText = () => '',
      buildDebuggerVariableOptionsHtml = () => '',
      bindDebuggerTabActions = () => {},
      bindDebuggerToolbarActions = () => {},
      bindDebuggerKeyboardActions = () => {},
      bindDebuggerVariableSelector = () => {},
      bindDebuggerFrameListActions = () => {},
      applyDebuggerTabState = () => {},
      applyDebuggerFrameSelection = () => {},
      applyDebuggerToolbarState = () => {},
      debuggerApi = async () => ({success: false}),
      debuggerApiPost = async () => ({success: false}),
      copyTextToClipboard = async () => {},
      refreshHaltedThreadsBar = () => {},
      closeWindow = () => {},
      setStatus = () => {},
      makeChip = () => null,
      shortLabel = value => String(value || ''),
      isLeafBasetype = () => true,
      escHtml = value => String(value ?? ''),
    } = config;

    let currentThreadOop = Number(threadOop) || 0;
    let currentThreadLabel = String(threadLabel || '');
    let currentTab = initialTab === 'tls' ? 'tls' : 'stack';
    let currentFrameIdx = Number.isFinite(Number(initialFrameIndex)) ? Math.max(0, Number(initialFrameIndex)) : 0;
    let sourceWindowId = initialSourceWindowId || null;
    let frames = [];
    let currentFrameVars = [];
    let debuggerMutating = false;
    let debuggerLoadingFrames = false;
    let debuggerLoadingFrame = false;
    let currentFrameCanStep = false;
    let currentFrameData = null;
    let currentFrameIdentity = null;
    let pendingFrameSelectionStrategy = 'executed';

    const debuggerButtons = {};
    let summarySourceEl = null;
    let summaryErrorEl = null;
    let summaryEl = null;
    let framesEl = null;
    let srcMetaEl = null;
    let srcEl = null;
    let varsEl = null;
    let varvalEl = null;
    let selfEl = null;
    let tlsSpinEl = null;
    let tlsListEl = null;
    let tabStrip = null;

    function syncDebuggerWindowState() {
      const existingSourceWindowId = windowState?.get?.(id)?.sourceWindowId || null;
      if (!sourceWindowId && existingSourceWindowId) sourceWindowId = existingSourceWindowId;
      upsertWindowState(id, buildDebuggerWindowState({
        threadOop: currentThreadOop,
        threadLabel: currentThreadLabel,
        currentTab,
        frameIndex: currentFrameIdx,
        sourceWindowId,
        sessionChannel,
      }));
    }

    function updateDebuggerToolbarState() {
      applyDebuggerToolbarState(debuggerButtons, buildDebuggerToolbarState({
        busy: debuggerMutating || debuggerLoadingFrames || debuggerLoadingFrame,
        hasFrames: frames.length > 0,
        currentFrameCanStep,
        currentFrameData,
        threadOop: currentThreadOop,
      }));
    }

    function applyActionResultState(result = {}, fallbackFrameIndex = currentFrameIdx) {
      const nextThreadOop = Number(result?.threadOop || 0);
      const nextFrameIndex = Number(result?.frameIndex);
      if (nextThreadOop > 0 && nextThreadOop !== currentThreadOop) currentFrameIdentity = null;
      if (nextThreadOop > 0) currentThreadOop = nextThreadOop;
      currentFrameIdx = Number.isFinite(nextFrameIndex)
        ? Math.max(0, nextFrameIndex)
        : Math.max(0, Number.isFinite(Number(fallbackFrameIndex)) ? Number(fallbackFrameIndex) : currentFrameIdx);
      syncDebuggerWindowState();
    }

    async function withDebuggerMutation(fn) {
      if (debuggerMutating || debuggerLoadingFrames || debuggerLoadingFrame) return;
      debuggerMutating = true;
      updateDebuggerToolbarState();
      try {
        await fn();
      } finally {
        debuggerMutating = false;
        updateDebuggerToolbarState();
      }
    }

    function renderDebuggerValue(container, ref, fallbackText = '') {
      if (!container) return;
      container.innerHTML = '';
      const text = ref?.inspection || fallbackText || '';
      if (ref?.oop != null && !isLeafBasetype(ref.basetype)) {
        const chip = makeChip(shortLabel(text, 48) || `oop:${ref.oop}`, ref.oop, id);
        if (chip) {
          chip.title = text || `oop:${ref.oop}`;
          container.appendChild(chip);
          return;
        }
      }
      container.textContent = text;
      container.title = text;
    }

    function showDebuggerTab(name) {
      currentTab = name === 'tls' ? 'tls' : 'stack';
      applyDebuggerTabState(body, id, currentTab);
      if (currentTab === 'tls') loadTLS();
      syncDebuggerWindowState();
    }

    async function loadFallbackFrameWhenFramesMissing() {
      const fallbackIndex = Number.isFinite(Number(currentFrameIdx)) ? Math.max(0, Number(currentFrameIdx)) : 0;
      const d = await debuggerApi(`/debug/frame/${currentThreadOop}?index=${fallbackIndex}`);
      if (!d.success || d.hasFrame === false) return false;
      frames = [{index: fallbackIndex, name: d.methodName || `Frame ${fallbackIndex + 1}`}];
      if (framesEl) framesEl.innerHTML = buildDebuggerFramesListHtml(frames, escHtml);
      const targetEl = framesEl?.querySelector?.(`.dbg-frame-item[data-idx="${fallbackIndex}"]`) || null;
      if (targetEl) {
        await selectFrame(fallbackIndex, targetEl, true);
      } else {
        currentFrameCanStep = false;
      }
      return true;
    }

    async function loadFrames() {
      debuggerLoadingFrames = true;
      updateDebuggerToolbarState();
      if (framesEl) framesEl.innerHTML = '<span class="spinner" style="margin:8px"></span>';
      try {
        const d = await debuggerApi(`/debug/frames/${currentThreadOop}`);
        if (!d.success) throw new Error(d.exception);
        frames = Array.isArray(d.frames) ? d.frames : [];
        if (frames.length) {
          if (framesEl) framesEl.innerHTML = buildDebuggerFramesListHtml(frames, escHtml);
          const selectionStrategy = pendingFrameSelectionStrategy;
          pendingFrameSelectionStrategy = null;
          const targetFrame = preferredDebuggerFrame(frames, currentFrameIdx, currentFrameIdentity, {
            preferExecutedCode: selectionStrategy !== 'exact',
          });
          const targetEl = framesEl?.querySelector?.(`.dbg-frame-item[data-idx="${targetFrame.index}"]`) || null;
          if (targetEl) {
            await selectFrame(targetFrame.index, targetEl, true);
          } else {
            currentFrameCanStep = false;
          }
        } else {
          const loadedFallbackFrame = await loadFallbackFrameWhenFramesMissing().catch(() => false);
          if (!loadedFallbackFrame) {
            if (framesEl) framesEl.innerHTML = '<p style="color:#6c7086;padding:8px">(no stack frames)</p>';
            currentFrameCanStep = false;
            currentFrameData = null;
            srcMetaEl?.classList.add('hidden');
            if (srcMetaEl) srcMetaEl.textContent = '';
            if (srcEl) srcEl.textContent = thread.sourcePreview || '(no source)';
            if (varsEl) varsEl.innerHTML = '<option value="">— variables —</option>';
            currentFrameVars = [];
            renderDebuggerValue(varvalEl, null, '');
            renderDebuggerValue(selfEl, null, '');
          }
        }
      } catch (error) {
        currentFrameCanStep = false;
        currentFrameData = null;
        if (framesEl) framesEl.innerHTML = `<p style="color:#f38ba8;padding:8px">${escHtml(error.message)}</p>`;
      } finally {
        debuggerLoadingFrames = false;
        updateDebuggerToolbarState();
      }
    }

    function renderDebuggerSource(frameData, idx) {
      const framePosition = Math.max(0, frames.findIndex(frame => frame.index === idx)) + 1;
      const view = buildDebuggerSourceView(frameData, {
        thread,
        frameIndex: idx,
        framePosition,
        frameCount: frames.length,
        escHtml,
      });
      if (srcMetaEl) {
        srcMetaEl.textContent = view.metaText;
        srcMetaEl.classList.toggle('hidden', !view.metaText);
      }
      if (srcEl) {
        srcEl.innerHTML = view.sourceHtml;
        const activeLineEl = view.activeLine > 0 ? srcEl.querySelector(`.dbg-source-line[data-line="${view.activeLine}"]`) : null;
        if (activeLineEl) activeLineEl.scrollIntoView({block: 'nearest'});
        else srcEl.scrollTop = 0;
      }
    }

    async function selectFrame(idx, el, focusEl = false) {
      debuggerLoadingFrame = true;
      updateDebuggerToolbarState();
      currentFrameIdx = idx;
      syncDebuggerWindowState();
      applyDebuggerFrameSelection(framesEl, idx);
      if (el) {
        el.scrollIntoView({block: 'nearest'});
        if (focusEl) el.focus({preventScroll: true});
      }
      if (srcMetaEl) {
        srcMetaEl.classList.add('hidden');
        srcMetaEl.textContent = '';
      }
      if (srcEl) srcEl.textContent = 'Loading…';
      currentFrameData = null;
      currentFrameIdentity = null;
      if (varsEl) varsEl.innerHTML = '<option value="">— variables —</option>';
      currentFrameVars = [];
      renderDebuggerValue(varvalEl, null, '');
      renderDebuggerValue(selfEl, null, '');
      try {
        const d = await debuggerApi(`/debug/frame/${currentThreadOop}?index=${idx}`);
        if (!d.success) throw new Error(d.exception);
        currentFrameData = d;
        currentFrameIdentity = buildDebuggerFrameIdentity(d, idx);
        const syncedFrames = syncDebuggerFramesWithDetail(frames, idx, d);
        if (syncedFrames !== frames) {
          frames = syncedFrames;
          if (framesEl) {
            framesEl.innerHTML = buildDebuggerFramesListHtml(frames, escHtml);
            applyDebuggerFrameSelection(framesEl, idx);
            const refreshedEl = framesEl.querySelector(`.dbg-frame-item[data-idx="${idx}"]`);
            if (refreshedEl) {
              refreshedEl.scrollIntoView({block: 'nearest'});
              if (focusEl) refreshedEl.focus({preventScroll: true});
            }
          }
        }
        renderDebuggerSource(d, idx);
        renderDebuggerValue(selfEl, d.selfObject, d.selfPrintString || '');
        currentFrameVars = Array.isArray(d.variables) ? d.variables : [];
        if (varsEl) varsEl.innerHTML = buildDebuggerVariableOptionsHtml(currentFrameVars, escHtml);
        currentFrameCanStep = d.canStep !== false && d.hasFrame !== false && Number(d.stepPoint || 0) > 0;
      } catch (error) {
        currentFrameCanStep = false;
        currentFrameData = null;
        currentFrameIdentity = null;
        srcMetaEl?.classList.add('hidden');
        if (srcEl) srcEl.textContent = 'Error: ' + error.message;
      } finally {
        debuggerLoadingFrame = false;
        updateDebuggerToolbarState();
      }
    }

    async function loadTLS() {
      if (tlsSpinEl) tlsSpinEl.style.display = 'inline-block';
      if (tlsListEl) tlsListEl.innerHTML = '';
      try {
        const d = await debuggerApi(`/debug/thread-local/${currentThreadOop}`);
        if (tlsSpinEl) tlsSpinEl.style.display = 'none';
        if (!d.success) throw new Error(d.exception);
        if (!d.entries.length) {
          if (tlsListEl) tlsListEl.innerHTML = '<li style="color:#6c7086">(empty)</li>';
          return;
        }
        d.entries.forEach(entry => {
          const li = document.createElement('li');
          const keySpan = document.createElement('span');
          const valSpan = document.createElement('span');
          keySpan.className = 'tls-key';
          valSpan.className = 'tls-val';
          renderDebuggerValue(keySpan, entry.keyObject, entry.key || '');
          renderDebuggerValue(valSpan, entry.valueObject, entry.value || '');
          li.append(keySpan, valSpan);
          tlsListEl?.appendChild(li);
        });
      } catch (error) {
        if (tlsSpinEl) tlsSpinEl.style.display = 'none';
        if (tlsListEl) tlsListEl.innerHTML = `<li style="color:#f38ba8">${escHtml(error.message)}</li>`;
      }
    }

    function mount() {
      body.style.cssText = 'display:flex;flex-direction:column;overflow:hidden;min-height:0';
      body.innerHTML = buildDebuggerWindowHtml(id);

      tabStrip = body.querySelector('.tab-strip');
      summarySourceEl = body.querySelector(`#${id}-summary-source`);
      summaryErrorEl = body.querySelector(`#${id}-summary-error`);
      summaryEl = body.querySelector(`#${id}-summary`);
      framesEl = body.querySelector(`#${id}-frames`);
      srcMetaEl = body.querySelector(`#${id}-srcmeta`);
      srcEl = body.querySelector(`#${id}-src`);
      varsEl = body.querySelector(`#${id}-vars`);
      varvalEl = body.querySelector(`#${id}-varval`);
      selfEl = body.querySelector(`#${id}-selfval`);
      tlsSpinEl = body.querySelector(`#${id}-tls-spin`);
      tlsListEl = body.querySelector(`#${id}-tls-list`);
      debuggerButtons.proceedBtn = body.querySelector(`#${id}-proceed`);
      debuggerButtons.refreshBtn = body.querySelector(`#${id}-refresh`);
      debuggerButtons.stepBtn = body.querySelector(`#${id}-step`);
      debuggerButtons.stepIntoBtn = body.querySelector(`#${id}-stepinto`);
      debuggerButtons.stepOverBtn = body.querySelector(`#${id}-stepover`);
      debuggerButtons.stepReturnBtn = body.querySelector(`#${id}-stepreturn`);
      debuggerButtons.restartBtn = body.querySelector(`#${id}-restart`);
      debuggerButtons.trimBtn = body.querySelector(`#${id}-trim`);
      debuggerButtons.terminateBtn = body.querySelector(`#${id}-terminate`);
      debuggerButtons.copyStackBtn = body.querySelector(`#${id}-copystack`);
      debuggerButtons.copySourceBtn = body.querySelector(`#${id}-copysource`);

      const summaryState = buildDebuggerSummaryState(thread);
      if (summaryState.sourceText) {
        summarySourceEl.textContent = summaryState.sourceText;
        summarySourceEl.classList.remove('hidden');
      }
      if (summaryState.errorText) {
        summaryErrorEl.textContent = summaryState.errorText;
        summaryErrorEl.classList.remove('hidden');
      }
      if (summaryState.hidden) summaryEl.classList.add('hidden');

      bindDebuggerTabActions(tabStrip, {
        onTabChange: showDebuggerTab,
      });
      bindDebuggerToolbarActions(debuggerButtons, {
        async onRefresh() {
          await withDebuggerMutation(async () => {
            try {
              refreshHaltedThreadsBar();
              await loadFrames();
              if (currentTab === 'tls') await loadTLS();
              setStatus(true, 'refreshed');
            } catch (error) {
              await loadFrames().catch(() => {});
              setStatus(false, error.message);
            }
          });
        },
        async onProceed() {
          await withDebuggerMutation(async () => {
            try {
              const result = await debuggerApiPost(`/debug/proceed/${currentThreadOop}`, {});
              refreshHaltedThreadsBar();
              setStatus(true, result?.message || 'resumed');
              closeWindow(win, id);
            } catch (error) {
              setStatus(false, error.message);
            }
          });
        },
        async onStep() {
          await withDebuggerMutation(async () => {
            try {
              const result = await debuggerApiPost(`/debug/step/${currentThreadOop}`, {index: currentFrameIdx});
              applyActionResultState(result, currentFrameIdx);
              await loadFrames();
              setStatus(true, result?.message || 'stepped');
            } catch (error) {
              await loadFrames().catch(() => {});
              setStatus(false, error.message);
            }
          });
        },
        async onStepInto() {
          await withDebuggerMutation(async () => {
            try {
              const result = await debuggerApiPost(`/debug/step-into/${currentThreadOop}`, {index: currentFrameIdx});
              currentFrameIdentity = null;
              pendingFrameSelectionStrategy = 'exact';
              applyActionResultState(result, currentFrameIdx);
              await loadFrames();
              setStatus(true, result?.message || 'stepped into');
            } catch (error) {
              await loadFrames().catch(() => {});
              setStatus(false, error.message);
            }
          });
        },
        async onStepOver() {
          await withDebuggerMutation(async () => {
            try {
              const result = await debuggerApiPost(`/debug/step-over/${currentThreadOop}`, {index: currentFrameIdx});
              applyActionResultState(result, currentFrameIdx);
              await loadFrames();
              setStatus(true, result?.message || 'stepped over');
            } catch (error) {
              await loadFrames().catch(() => {});
              setStatus(false, error.message);
            }
          });
        },
        async onStepReturn() {
          await withDebuggerMutation(async () => {
            try {
              const result = await debuggerApiPost(`/debug/step-return/${currentThreadOop}`, {index: currentFrameIdx});
              currentFrameIdentity = null;
              pendingFrameSelectionStrategy = 'exact';
              applyActionResultState(result, currentFrameIdx - 1);
              await loadFrames();
              setStatus(true, result?.message || 'stepped out');
            } catch (error) {
              await loadFrames().catch(() => {});
              setStatus(false, error.message);
            }
          });
        },
        async onRestart() {
          await withDebuggerMutation(async () => {
            try {
              const result = await debuggerApiPost(`/debug/restart/${currentThreadOop}`, {index: currentFrameIdx});
              if (result?.completed) {
                refreshHaltedThreadsBar();
                setStatus(true, result?.message || 'restarted to completion');
                closeWindow(win, id);
                return;
              }
              currentFrameIdentity = null;
              pendingFrameSelectionStrategy = 'executed';
              applyActionResultState(result, 0);
              refreshHaltedThreadsBar();
              await loadFrames();
              setStatus(true, result?.message || 'restarted');
            } catch (error) {
              await loadFrames().catch(() => {});
              setStatus(false, error.message);
            }
          });
        },
        async onTrim() {
          await withDebuggerMutation(async () => {
            try {
              const result = await debuggerApiPost(`/debug/trim/${currentThreadOop}`, {index: currentFrameIdx});
              applyActionResultState(result, 0);
              await loadFrames();
              setStatus(true, result?.message || 'stack trimmed');
            } catch (error) {
              await loadFrames().catch(() => {});
              setStatus(false, error.message);
            }
          });
        },
        async onTerminate() {
          await withDebuggerMutation(async () => {
            try {
              const result = await debuggerApiPost(`/debug/terminate/${currentThreadOop}`, {});
              refreshHaltedThreadsBar();
              setStatus(true, result?.message || 'terminated');
              closeWindow(win, id);
            } catch (error) {
              await loadFrames().catch(() => {});
              setStatus(false, error.message);
            }
          });
        },
        async onCopyStack() {
          try {
            if (!frames.length) return;
            await copyTextToClipboard(buildDebuggerFramesExportText(frames, currentFrameIdx));
            setStatus(true, 'stack copied');
          } catch (error) {
            setStatus(false, error.message);
          }
        },
        async onCopySource() {
          try {
            if (!currentFrameData) return;
            const framePosition = Math.max(0, frames.findIndex(frame => frame.index === currentFrameIdx)) + 1;
            await copyTextToClipboard(buildDebuggerSourceExportText(currentFrameData, {
              thread,
              frameIndex: currentFrameIdx,
              framePosition,
              frameCount: frames.length,
              escHtml,
            }));
            setStatus(true, 'source copied');
          } catch (error) {
            setStatus(false, error.message);
          }
        },
      });
      bindDebuggerKeyboardActions(win, {
        onProceed: () => { if (!debuggerButtons.proceedBtn?.disabled) debuggerButtons.proceedBtn.click(); },
        onStep: () => { if (!debuggerButtons.stepBtn?.disabled) debuggerButtons.stepBtn.click(); },
        onStepInto: () => { if (!debuggerButtons.stepIntoBtn?.disabled) debuggerButtons.stepIntoBtn.click(); },
        onStepOver: () => { if (!debuggerButtons.stepOverBtn?.disabled) debuggerButtons.stepOverBtn.click(); },
        onStepReturn: () => { if (!debuggerButtons.stepReturnBtn?.disabled) debuggerButtons.stepReturnBtn.click(); },
        onRestart: () => { if (!debuggerButtons.restartBtn?.disabled) debuggerButtons.restartBtn.click(); },
        onTrim: () => { if (!debuggerButtons.trimBtn?.disabled) debuggerButtons.trimBtn.click(); },
        onTerminate: () => { if (!debuggerButtons.terminateBtn?.disabled) debuggerButtons.terminateBtn.click(); },
        onCopyStack: () => { if (!debuggerButtons.copyStackBtn?.disabled) debuggerButtons.copyStackBtn.click(); },
        onCopySource: () => { if (!debuggerButtons.copySourceBtn?.disabled) debuggerButtons.copySourceBtn.click(); },
      });
      bindDebuggerVariableSelector(varsEl, {
        onVariableChange(name) {
          if (!name) {
            renderDebuggerValue(varvalEl, null, '');
            return;
          }
          const selectedVar = currentFrameVars.find(v => v.name === name);
          renderDebuggerValue(varvalEl, selectedVar?.valueObject, selectedVar?.value || '');
        },
      });
      bindDebuggerFrameListActions(framesEl, {
        onFrameSelect(frameIndex, options = {}) {
          const frameEl = framesEl?.querySelector?.(`.dbg-frame-item[data-idx="${frameIndex}"]`) || null;
          if (!frameEl) return;
          selectFrame(frameIndex, frameEl, !!options.focus);
        },
      });

      syncDebuggerWindowState();
      showDebuggerTab(currentTab);
      updateDebuggerToolbarState();
      loadFrames();
    }

    return {
      mount,
      loadFrames,
    };
  }

  return {
    buildDebuggerWindowState,
    buildDebuggerToolbarState,
    buildDebuggerFrameIdentity,
    debuggerFrameMatchesIdentity,
    preferredDebuggerFrame,
    syncDebuggerFramesWithDetail,
    createDebuggerWindowRuntime,
  };
});
