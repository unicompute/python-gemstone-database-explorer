(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ObjectBrowserActionsRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createObjectBrowserActionsRuntime(deps = {}) {
    const state = () => deps.getState?.() || {};

    function syncWindowState() {
      const current = state();
      deps.upsertWindowState?.(deps.id, {
        kind: 'object',
        sessionChannel: deps.sessionChannel,
        object: current.currentObjData || null,
        objectOop: current.currentObjData?.oop ?? current.currentOop ?? deps.initialOop ?? null,
        objectLabel:
          current.history?.[current.history.length - 1]?.label ||
          current.currentObjData?.inspection ||
          deps.initialLabel ||
          '',
        currentTab: current.currentItab,
        compactMode: deps.compactMode,
        objectQuery: { ...(current.currentObjectQuery || {}) },
      });
    }

    function updateMethodBrowserActions() {
      const openBtn = deps.body?.querySelector?.(`#${deps.id}-mb-open-browser`);
      if (!openBtn) return;
      const current = state();
      const buttonState = deps.buildMethodBrowserButtonState?.(
        deps.currentCodeBrowserTarget?.(current.mbCurrentSelector)
      ) || { disabled: true, title: '' };
      openBtn.disabled = !!buttonState.disabled;
      openBtn.title = buttonState.title || '';
    }

    function activateItab(itabName) {
      const targetTab = deps.body?.querySelector?.(`#${deps.id}-itabs [data-itab="${itabName}"]`);
      if (!targetTab) return false;
      deps.body?.querySelectorAll?.('.inspector-tab')?.forEach?.((tab) => tab.classList.remove('active'));
      targetTab.classList.add('active');
      deps.setState?.({ currentItab: itabName });

      if (itabName === 'code') {
        deps.body?.querySelector?.(`#${deps.id}-mb`)?.classList?.remove('hidden');
        const current = state();
        const codeTarget = deps.getCodeTarget?.(current.currentObjData);
        if (codeTarget?.oop && current.mbClassOop !== codeTarget.oop) {
          deps.openMethodBrowser?.(codeTarget.oop, codeTarget.label);
        }
      } else {
        deps.body?.querySelector?.(`#${deps.id}-mb`)?.classList?.add('hidden');
      }
      updateMethodBrowserActions();
      syncWindowState();
      deps.showInspectorTab?.();
      return true;
    }

    function reloadCurrentObject({ query, preserveCurrentTab = true, invalidateCache = true } = {}) {
      const current = state();
      if (!current.currentOop) return Promise.resolve();
      if (invalidateCache) deps.clearInspectorTabCache?.(current.currentOop);
      const label =
        current.history?.[current.history.length - 1]?.label ||
        current.currentObjData?.inspection ||
        'object';
      return deps.loadObject?.(current.currentOop, label, {
        query: query === undefined ? current.currentObjectQuery : query,
        preserveCurrentTab,
        keepInstPage: true,
      });
    }

    async function evaluateCurrentObject() {
      const evalCode = deps.getEvalCode?.() || deps.evalCode;
      const evalRes = deps.getEvalRes?.() || deps.evalRes;
      const current = state();
      if (!evalCode || !evalRes || !current.currentOop) return;
      const evalOop = current.currentOop;
      const code = String(evalCode.value || '').trim();
      if (!code) return;
      evalRes.textContent = '';
      evalRes.className = 'eval-result';
      const spinner = deps.document?.createElement?.('span');
      if (spinner) {
        spinner.className = 'spinner';
        evalRes.appendChild(spinner);
      }
      try {
        const d = await deps.objectApiEvaluate?.(evalOop, { code, language: 'smalltalk', depth: 2 });
        evalRes.innerHTML = '';
        if (!d?.success) {
          evalRes.className = 'eval-result error';
          evalRes.textContent = `Error: ${d?.exception || 'unknown error'}`;
          return;
        }
        const [isException, resultValue] = d.result || [];
        if (isException) {
          evalRes.className = 'eval-result error';
          evalRes.textContent = `⚑ ${resultValue?.inspection || 'Exception'}`;
          deps.maybeOpenEvalDebugger?.(resultValue, code, deps.id);
          return;
        }

        evalRes.textContent = resultValue?.inspection || 'nil';
        const isLeaf = deps.isLeafBasetype?.(resultValue?.basetype);
        if (!isLeaf && resultValue?.oop) {
          const chip = deps.makeChip?.(resultValue.inspection || 'result', resultValue.oop, deps.id);
          if (chip) {
            evalRes.appendChild(deps.document.createTextNode(' '));
            evalRes.appendChild(chip);
          }
          const nav = deps.document?.createElement?.('a');
          if (nav) {
            nav.className = 'link-oop';
            nav.style.marginLeft = '8px';
            nav.textContent = 'Navigate →';
            nav.addEventListener('click', () => {
              const label = resultValue.inspection || 'result';
              const nextHistory = [...(state().history || []), { label, oop: resultValue.oop }];
              deps.setState?.({ history: nextHistory });
              deps.loadObject?.(resultValue.oop, label);
            });
            evalRes.appendChild(nav);
          }
        }
      } catch (error) {
        evalRes.innerHTML = '';
        evalRes.className = 'eval-result error';
        evalRes.textContent = `Error: ${error.message}`;
      } finally {
        deps.clearInspectorTabCache?.(evalOop);
      }
    }

    return {
      syncWindowState,
      updateMethodBrowserActions,
      activateItab,
      reloadCurrentObject,
      evaluateCurrentObject,
    };
  }

  return {
    createObjectBrowserActionsRuntime,
  };
});
