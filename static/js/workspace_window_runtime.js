(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WorkspaceWindowRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function resolveWorkspaceTargetOop(targetOop, resolveTargetOop) {
    return typeof resolveTargetOop === 'function' ? resolveTargetOop() : targetOop;
  }

  function hasInspectableWorkspaceResult(resultValue, isLeafBasetype = () => false) {
    if (!resultValue || resultValue.oop == null) return false;
    if (!isLeafBasetype(resultValue.basetype)) return true;
    return !!(
      resultValue.defaultTab
      || (Array.isArray(resultValue.availableTabs) && resultValue.availableTabs.length)
      || (Array.isArray(resultValue.customTabs) && resultValue.customTabs.length)
      || resultValue.codeTarget
      || resultValue.classBrowserTarget
    );
  }

  function buildWorkspaceWindowState(kind, draft, sessionChannel, oop) {
    const nextState = {
      kind: String(kind || 'workspace'),
      draft: String(draft || ''),
      sessionChannel: String(sessionChannel || ''),
    };
    if (oop) nextState.oop = oop;
    return nextState;
  }

  function createFallbackWorkspaceChip(label, oop, winId, openLinkedObjectWindow) {
    if (typeof document === 'undefined' || oop == null) return null;
    const chip = document.createElement('span');
    chip.className = 'obj-chip';
    chip.draggable = true;

    const textNode = document.createElement('span');
    textNode.className = 'obj-chip-text';
    textNode.textContent = String(label || 'result');

    const caretNode = document.createElement('span');
    caretNode.className = 'obj-chip-caret';
    caretNode.textContent = '↗';

    chip.append(textNode, caretNode);

    const inspect = () => {
      openLinkedObjectWindow?.({
        oop,
        text: String(label || 'result'),
        sourceWinId: winId,
      });
    };

    chip.addEventListener('click', inspect);
    chip.addEventListener('dragstart', event => {
      chip.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/plain', JSON.stringify({
        oop,
        text: String(label || 'result'),
        srcWinId: winId,
        arrowType: 'ref',
        arrowLabel: '',
      }));
    });
    chip.addEventListener('dragend', () => chip.classList.remove('dragging'));

    return chip;
  }

  function buildInspectableWorkspaceChip(label, oop, winId, makeChip, openLinkedObjectWindow) {
    if (oop == null) return null;
    if (typeof makeChip === 'function') {
      try {
        const chip = makeChip(label, oop, winId);
        if (chip) return chip;
      } catch (_) {
        // Fall back to a minimal drag/open chip for live runtimes.
      }
    }
    return createFallbackWorkspaceChip(label, oop, winId, openLinkedObjectWindow);
  }

  function createWorkspaceWindowRuntime(config = {}) {
    const {
      id,
      body,
      kind = 'workspace',
      draft = '',
      placeholder,
      language = 'smalltalk',
      showTransactionBar = true,
      targetOop = null,
      resolveTargetOop = null,
      unavailableMessage = 'Not connected',
      persistedTargetOop = targetOop || null,
      sessionChannel = '',
      upsertWindowState = () => {},
      bindWorkspaceWindowActions = () => {},
      buildWorkspaceWindowHtml = () => '',
      workspaceApiEvaluate = async () => ({success: false}),
      workspaceApiTransaction = async () => ({success: false}),
      setStatus = () => {},
      maybeOpenEvalDebugger = () => {},
      isLeafBasetype = () => true,
      makeChip = () => null,
      openLinkedObjectWindow = () => {},
    } = config;

    let historyEl = null;
    let codeEl = null;

    function syncWorkspaceWindowState() {
      upsertWindowState(id, buildWorkspaceWindowState(
        kind,
        codeEl?.value || '',
        sessionChannel,
        persistedTargetOop,
      ));
    }

    async function txAction(route, successLabel) {
      try {
        const d = await workspaceApiTransaction(route);
        setStatus(d.success, d.success ? successLabel : d.exception);
      } catch (error) {
        setStatus(false, error.message);
      }
    }

    async function evaluateCurrentCode() {
      const code = String(codeEl?.value || '').trim();
      if (!code || !historyEl) return;

      const entry = document.createElement('div');
      entry.className = 'ws-entry';
      const codeNode = document.createElement('div');
      codeNode.className = 'ws-code';
      codeNode.textContent = code;
      const resultNode = document.createElement('div');
      resultNode.className = 'ws-result';
      const resultText = document.createElement('span');
      resultText.className = 'ws-result-text';
      resultText.textContent = '…';
      resultNode.appendChild(resultText);
      entry.append(codeNode, resultNode);
      historyEl.appendChild(entry);
      historyEl.scrollTop = historyEl.scrollHeight;

      const resolvedTargetOop = resolveWorkspaceTargetOop(targetOop, resolveTargetOop);
      if (!resolvedTargetOop) {
        resultNode.className = 'ws-result error';
        resultText.textContent = unavailableMessage;
        return;
      }

      try {
        if (typeof window !== 'undefined') {
          window.__lastWorkspaceEval = {
            code,
            phase: 'pending',
            targetOop: resolvedTargetOop,
            sessionChannel,
          };
        }
        const d = await workspaceApiEvaluate(resolvedTargetOop, {code, language, depth: 1});
        if (!d.success) {
          if (typeof window !== 'undefined') {
            window.__lastWorkspaceEval = {
              code,
              phase: 'done',
              success: false,
              exception: d.exception,
              response: d,
            };
          }
          resultNode.className = 'ws-result error';
          resultText.textContent = 'Error: ' + d.exception;
          return;
        }
        const [isExc, rv] = d.result;
        if (isExc) {
          if (typeof window !== 'undefined') {
            window.__lastWorkspaceEval = {
              code,
              phase: 'done',
              success: false,
              isException: true,
              result: rv,
              exception: rv?.exceptionText || rv?.inspection || 'Exception',
            };
          }
          resultNode.className = 'ws-result error';
          resultText.textContent = '⚑ ' + (rv.inspection || 'Exception');
          maybeOpenEvalDebugger(rv, code, id);
        } else {
          resultText.textContent = '=> ' + (rv.inspection || 'nil');
          const canInspect = hasInspectableWorkspaceResult(rv, isLeafBasetype);
          let chip = null;
          if (canInspect) {
            chip = buildInspectableWorkspaceChip(
              rv.inspection || 'result',
              rv.oop,
              id,
              makeChip,
              openLinkedObjectWindow,
            );
            if (chip) resultNode.appendChild(chip);
            const nav = document.createElement('span');
            nav.className = 'ws-nav';
            nav.textContent = 'inspect →';
            nav.addEventListener('click', () => openLinkedObjectWindow({
              oop: rv.oop,
              text: rv.inspection || 'result',
              sourceWinId: id,
            }));
            resultNode.appendChild(nav);
          }
          if (typeof window !== 'undefined') {
            window.__lastWorkspaceEval = {
              code,
              phase: 'done',
              success: true,
              isException: false,
              result: rv,
              canInspect,
              chipCreated: !!chip,
            };
          }
        }
      } catch (error) {
        if (typeof window !== 'undefined') {
          window.__lastWorkspaceEval = {
            code,
            phase: 'done',
            success: false,
            exception: error.message,
            errorName: error?.name,
            errorStatus: error?.status,
            errorUrl: error?.url,
            errorData: error?.data,
          };
        }
        resultNode.className = 'ws-result error';
        resultText.textContent = 'Error: ' + error.message;
      }

      historyEl.scrollTop = historyEl.scrollHeight;
      syncWorkspaceWindowState();
    }

    function mount() {
      body.style.cssText = 'display:flex;flex-direction:column;overflow:hidden;min-height:0';
      body.innerHTML = buildWorkspaceWindowHtml(id, {
        placeholder,
        showTransactionBar,
      });

      historyEl = body.querySelector(`#${id}-wsh`);
      codeEl = body.querySelector(`#${id}-wsc`);
      if (codeEl) codeEl.value = draft;
      syncWorkspaceWindowState();

      bindWorkspaceWindowActions({
        doitBtn: body.querySelector(`#${id}-doit`),
        clearBtn: body.querySelector(`#${id}-clr`),
        codeArea: codeEl,
        abortBtn: body.querySelector(`#${id}-abort`),
        commitBtn: body.querySelector(`#${id}-commit`),
        continueBtn: body.querySelector(`#${id}-continue`),
      }, {
        onDoIt: evaluateCurrentCode,
        onClear() {
          if (historyEl) historyEl.innerHTML = '';
          syncWorkspaceWindowState();
        },
        onInput: syncWorkspaceWindowState,
        onAbort: () => txAction('/transaction/abort', 'aborted'),
        onCommit: () => txAction('/transaction/commit', 'committed'),
        onContinue: () => txAction('/transaction/continue', 'continued'),
      });
    }

    return {
      mount,
      syncWorkspaceWindowState,
      evaluateCurrentCode,
    };
  }

  return {
    resolveWorkspaceTargetOop,
    hasInspectableWorkspaceResult,
    buildWorkspaceWindowState,
    createFallbackWorkspaceChip,
    createWorkspaceWindowRuntime,
  };
});
