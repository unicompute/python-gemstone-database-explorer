(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ObjectChipRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function hasClass(el, name) {
    if (!el) return false;
    if (el.classList?.contains) return el.classList.contains(name);
    const parts = String(el.className || '').split(/\s+/).filter(Boolean);
    return parts.includes(name);
  }

  function setClass(el, name, enabled) {
    if (!el) return;
    if (el.classList?.toggle) {
      el.classList.toggle(name, enabled);
      return;
    }
    const parts = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
    if (enabled) parts.add(name);
    else parts.delete(name);
    el.className = Array.from(parts).join(' ');
  }

  function createObjectChipRuntime(deps = {}) {
    const documentNode = deps.document || globalThis.document;

    function makeChip(text, oop, winId, evalContext) {
      const wrap = documentNode.createElement('span');
      wrap.className = 'obj-chip';
      wrap.draggable = true;

      const textNode = documentNode.createElement('span');
      textNode.className = 'obj-chip-text';
      textNode.textContent = String(text || '');

      const caretNode = documentNode.createElement('span');
      caretNode.className = 'obj-chip-caret';
      caretNode.textContent = '▼';

      const dropdown = documentNode.createElement('div');
      dropdown.className = 'chip-dropdown';

      const labelEl = documentNode.createElement('div');
      labelEl.className = 'chip-dd-label';
      labelEl.textContent = String(text || '');

      const codeEl = documentNode.createElement('textarea');
      codeEl.className = 'chip-dd-code';
      codeEl.placeholder = 'self printString';

      const controls = documentNode.createElement('div');
      controls.className = 'chip-dd-controls';

      const smalltalkBtn = documentNode.createElement('button');
      smalltalkBtn.className = 'chip-dd-lang active';
      smalltalkBtn.dataset.lang = 'smalltalk';
      smalltalkBtn.textContent = 'Smalltalk';

      const rubyBtn = documentNode.createElement('button');
      rubyBtn.className = 'chip-dd-lang';
      rubyBtn.dataset.lang = 'ruby';
      rubyBtn.textContent = 'Ruby';

      const printBtn = documentNode.createElement('button');
      printBtn.className = 'btn';
      printBtn.textContent = 'Print it';

      const inspectBtn = documentNode.createElement('button');
      inspectBtn.className = 'btn-ghost';
      inspectBtn.textContent = 'Inspect →';

      const resultEl = documentNode.createElement('div');
      resultEl.className = 'chip-dd-result hidden';

      controls.appendChild(smalltalkBtn);
      controls.appendChild(rubyBtn);
      controls.appendChild(printBtn);
      controls.appendChild(inspectBtn);
      dropdown.appendChild(labelEl);
      dropdown.appendChild(codeEl);
      dropdown.appendChild(controls);
      dropdown.appendChild(resultEl);
      wrap.appendChild(textNode);
      wrap.appendChild(caretNode);
      wrap.appendChild(dropdown);

      let currentLanguage = 'smalltalk';

      function setLanguage(language) {
        currentLanguage = language === 'ruby' ? 'ruby' : 'smalltalk';
        setClass(smalltalkBtn, 'active', currentLanguage === 'smalltalk');
        setClass(rubyBtn, 'active', currentLanguage === 'ruby');
      }

      function closeDropdown() {
        setClass(dropdown, 'open', false);
      }

      function openInspectWindow() {
        if (!oop) return;
        closeDropdown();
        deps.openLinkedObjectWindow?.({
          oop,
          text,
          sourceWinId: winId,
        });
      }

      smalltalkBtn.addEventListener('click', event => {
        event.stopPropagation?.();
        setLanguage('smalltalk');
      });
      rubyBtn.addEventListener('click', event => {
        event.stopPropagation?.();
        setLanguage('ruby');
      });

      printBtn.addEventListener('click', async event => {
        event.stopPropagation?.();
        const code = String(codeEl.value || '').trim();
        if (!code || !oop) return;
        setClass(resultEl, 'hidden', false);
        setClass(resultEl, 'error', false);
        resultEl.textContent = '…';
        try {
          const data = await deps.apiEvaluate?.(oop, {
            code,
            language: currentLanguage,
            depth: 1,
            evalContext,
          });
          if (!data?.success) {
            setClass(resultEl, 'error', true);
            resultEl.textContent = `Error: ${data?.exception || 'Evaluation failed'}`;
            return;
          }
          const [isException, resultValue] = data.result || [];
          if (isException) {
            setClass(resultEl, 'error', true);
            resultEl.textContent = `⚑ ${resultValue?.inspection || 'Exception'}`;
            deps.maybeOpenEvalDebugger?.(resultValue, code, winId);
            return;
          }
          resultEl.textContent = resultValue?.inspection || 'nil';
        } catch (error) {
          setClass(resultEl, 'error', true);
          resultEl.textContent = error?.message || String(error || 'error');
        }
      });

      inspectBtn.addEventListener('click', event => {
        event.stopPropagation?.();
        openInspectWindow();
      });

      caretNode.addEventListener('click', event => {
        event.stopPropagation?.();
        setClass(dropdown, 'open', !hasClass(dropdown, 'open'));
      });

      documentNode.addEventListener?.(
        'click',
        event => {
          if (!wrap.contains?.(event.target)) closeDropdown();
        },
        { capture: true }
      );

      wrap.addEventListener('dragstart', event => {
        setClass(wrap, 'dragging', true);
        if (!event.dataTransfer) return;
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData(
          'text/plain',
          JSON.stringify({
            oop,
            text,
            srcWinId: winId,
            arrowType: 'ref',
            arrowLabel: '',
          })
        );
      });

      wrap.addEventListener('dragend', () => {
        setClass(wrap, 'dragging', false);
      });

      return wrap;
    }

    return {
      makeChip,
    };
  }

  return {
    createObjectChipRuntime,
  };
});
