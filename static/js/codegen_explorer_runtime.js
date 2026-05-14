(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.CodegenExplorerRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function selectorToPythonName(selector) {
    const text = String(selector || '').trim();
    const parts = text.split(':').filter(Boolean);
    const base = (parts.length > 1 || text.includes(':')) ? parts.join('_') : (parts[0] || text);
    return base
      .replace(/(.)([A-Z][a-z]+)/g, '$1_$2')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^0-9A-Za-z_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'method';
  }

  function makeSelectionKey(dictionary, className) {
    return `${String(dictionary || '').trim()}::${String(className || '').trim()}`;
  }

  function methodKey(method) {
    return `${method.meta ? 'class' : 'instance'}::${method.selector}`;
  }

  function buildCodegenExplorerHtml(id) {
    return `
      <div class="codegen-wrap">
        <div class="codegen-toolbar">
          <button class="btn" id="${id}-refresh">Refresh</button>
          <button class="btn-ghost" id="${id}-add">Add Selected</button>
          <button class="btn-ghost" id="${id}-preview">Preview</button>
          <button class="btn-ghost" id="${id}-import">Import JSON</button>
          <button class="btn-ghost" id="${id}-export">Export JSON</button>
          <button class="btn-ghost" id="${id}-copy-protocol">Copy Protocol</button>
          <label class="cb-meta"><input type="checkbox" id="${id}-async" checked> Async wrappers</label>
          <input type="file" id="${id}-import-file" accept="application/json,.json" hidden>
        </div>
        <div class="codegen-main">
          <section class="codegen-column codegen-discovery">
            <div class="codegen-field">
              <label>Dictionary</label>
              <select id="${id}-dictionary" class="cb-select"></select>
            </div>
            <div class="codegen-field">
              <label>Class filter</label>
              <input id="${id}-class-filter" class="cb-filter" placeholder="Filter classes">
            </div>
            <div id="${id}-classes" class="codegen-list" tabindex="0"></div>
          </section>
          <section class="codegen-column codegen-methods">
            <div class="codegen-method-toolbar">
              <label class="cb-meta"><input type="checkbox" id="${id}-class-side"> Class side</label>
              <span id="${id}-class-title" class="codegen-muted">No class selected</span>
            </div>
            <div class="codegen-field">
              <label>Method filter</label>
              <input id="${id}-method-filter" class="cb-filter" placeholder="Filter selectors">
            </div>
            <div class="codegen-field">
              <label>Protocol</label>
              <select id="${id}-category-filter" class="cb-select"></select>
            </div>
            <div id="${id}-methods" class="codegen-list codegen-method-list" tabindex="0"></div>
            <div class="codegen-source-wrap">
              <div class="codegen-source-head">
                <span>Source</span>
                <span id="${id}-source-label" class="codegen-muted">Select a selector</span>
              </div>
              <pre id="${id}-source" class="codegen-source"></pre>
            </div>
          </section>
          <section class="codegen-column codegen-selection">
            <div class="codegen-selection-head">
              <span>Selection</span>
              <button class="btn-ghost" id="${id}-clear">Clear</button>
            </div>
            <div id="${id}-selection" class="codegen-selected-list"></div>
          </section>
        </div>
        <div class="codegen-preview-wrap">
          <div class="codegen-preview-head">
            <span>Preview</span>
            <span id="${id}-status" class="codegen-muted">Select methods, then preview generated files.</span>
          </div>
          <textarea id="${id}-preview-text" class="codegen-preview" spellcheck="false"></textarea>
        </div>
      </div>
    `;
  }

  function createCodegenExplorerRuntime(deps = {}) {
    function openCodegenExplorer(options = {}) {
      const { win, body, id } = deps.createWindow({
        title: 'Codegen Explorer',
        width: options.width || 980,
        height: options.height || 700,
        x: options.x,
        y: options.y,
        taskbarLabel: 'Codegen',
      });
      const sessionChannel = deps.exactWriteSessionChannel(`codegen:${id}`);
      const api = (url, opts = {}) => deps.api(url, { ...opts, sessionChannel });
      const apiWithParams = (url, params = {}) => deps.apiWithParams(url, params, { sessionChannel });
      const apiPost = (url, requestBody = {}) => deps.apiPost(url, requestBody, { sessionChannel });
      const state = {
        dictionaries: [],
        classes: [],
        classDetails: null,
        selectedClassName: String(options.className || '').trim(),
        selectedDictionary: String(options.dictionary || '').trim(),
        selectedCategory: '',
        selectedMethods: new Set(),
        selections: new Map(),
        sourceCache: new Map(),
        moduleName: 'gemstone_codegen_preview_protocols',
        lastPreview: null,
      };

      deps.upsertWindowState?.(id, {
        kind: 'codegen-explorer',
        title: 'Codegen Explorer',
        sessionChannel,
        dictionary: state.selectedDictionary,
        className: state.selectedClassName,
      });

      body.innerHTML = buildCodegenExplorerHtml(id);
      const els = {
        refresh: body.querySelector(`#${id}-refresh`),
        add: body.querySelector(`#${id}-add`),
        preview: body.querySelector(`#${id}-preview`),
        importSelection: body.querySelector(`#${id}-import`),
        importFile: body.querySelector(`#${id}-import-file`),
        exportJson: body.querySelector(`#${id}-export`),
        copyProtocol: body.querySelector(`#${id}-copy-protocol`),
        async: body.querySelector(`#${id}-async`),
        dictionary: body.querySelector(`#${id}-dictionary`),
        classFilter: body.querySelector(`#${id}-class-filter`),
        classes: body.querySelector(`#${id}-classes`),
        classSide: body.querySelector(`#${id}-class-side`),
        classTitle: body.querySelector(`#${id}-class-title`),
        methodFilter: body.querySelector(`#${id}-method-filter`),
        categoryFilter: body.querySelector(`#${id}-category-filter`),
        methods: body.querySelector(`#${id}-methods`),
        sourceLabel: body.querySelector(`#${id}-source-label`),
        source: body.querySelector(`#${id}-source`),
        clear: body.querySelector(`#${id}-clear`),
        selection: body.querySelector(`#${id}-selection`),
        status: body.querySelector(`#${id}-status`),
        previewText: body.querySelector(`#${id}-preview-text`),
      };

      function setStatus(message, isError = false) {
        if (els.status) {
          els.status.textContent = message;
          els.status.dataset.state = isError ? 'error' : 'ok';
        }
        deps.setStatus?.(message, isError ? 'error' : 'ok');
      }

      function selectionPayload() {
        return {
          moduleName: state.moduleName || 'gemstone_codegen_preview_protocols',
          async: !!els.async?.checked,
          classes: Array.from(state.selections.values()).map(selection => ({
            className: selection.className,
            protocolName: selection.protocolName,
            dictionary: selection.dictionary,
            fields: Array.from(selection.fields).sort(),
            methods: Array.from(selection.methods.values()),
            classMethods: Array.from(selection.classMethods.values()),
          })),
        };
      }

      function sideMethods() {
        const details = state.classDetails || {};
        const source = els.classSide?.checked ? details.classMethods : details.instanceMethods;
        return Array.isArray(source) ? source : [];
      }

      function currentMethods() {
        const source = sideMethods();
        const filter = String(els.methodFilter?.value || '').trim().toLowerCase();
        const category = String(els.categoryFilter?.value || state.selectedCategory || '').trim();
        return source.filter(method => {
          if (category && String(method.category || '') !== category) return false;
          if (!filter) return true;
          return [method.selector, method.category, method.pythonName].join(' ').toLowerCase().includes(filter);
        });
      }

      function renderDictionaries() {
        const selected = state.selectedDictionary || state.dictionaries[0] || '';
        els.dictionary.innerHTML = state.dictionaries
          .map(name => `<option value="${escapeHtml(name)}"${name === selected ? ' selected' : ''}>${escapeHtml(name)}</option>`)
          .join('');
        state.selectedDictionary = selected;
      }

      function renderClasses() {
        const filter = String(els.classFilter?.value || '').trim().toLowerCase();
        const classes = state.classes.filter(item => !filter || item.className.toLowerCase().includes(filter));
        els.classes.innerHTML = classes.length
          ? classes.map(item => `
              <button type="button" class="codegen-row${item.className === state.selectedClassName ? ' active' : ''}" data-class-name="${escapeHtml(item.className)}">
                <span>${escapeHtml(item.className)}</span>
                <small>${escapeHtml(item.dictionary || state.selectedDictionary)}</small>
              </button>
            `).join('')
          : '<div class="cb-empty">(no classes)</div>';
      }

      function renderMethods() {
        const details = state.classDetails;
        const className = String(details?.className || state.selectedClassName || '').trim();
        const side = els.classSide?.checked ? 'class' : 'instance';
        els.classTitle.textContent = className ? `${className} ${side} side` : 'No class selected';
        renderCategoryFilter();
        const methods = currentMethods();
        els.methods.innerHTML = methods.length
          ? methods.map(method => {
              const key = methodKey({ ...method, meta: side === 'class' });
              const checked = state.selectedMethods.has(key) ? ' checked' : '';
              const argText = Number(method.argCount || 0) === 1 ? '1 arg' : `${Number(method.argCount || 0)} args`;
              return `
                <label class="codegen-method-row" data-method-key="${escapeHtml(key)}" data-selector="${escapeHtml(method.selector)}">
                  <input type="checkbox" data-method-key="${escapeHtml(key)}" data-selector="${escapeHtml(method.selector)}"${checked}>
                  <span>${escapeHtml(method.selector)}</span>
                  <small>${escapeHtml(method.category || '')} / ${escapeHtml(method.pythonName || selectorToPythonName(method.selector))} / ${argText}</small>
                </label>
              `;
            }).join('')
          : '<div class="cb-empty">(no methods)</div>';
      }

      function renderCategoryFilter() {
        if (!els.categoryFilter) return;
        const categories = Array.from(new Set(
          sideMethods().map(method => String(method.category || '').trim()).filter(Boolean)
        )).sort((left, right) => left.localeCompare(right));
        const current = categories.includes(state.selectedCategory) ? state.selectedCategory : '';
        state.selectedCategory = current;
        els.categoryFilter.innerHTML = [
          `<option value=""${current ? '' : ' selected'}>All protocols</option>`,
          ...categories.map(category => (
            `<option value="${escapeHtml(category)}"${category === current ? ' selected' : ''}>${escapeHtml(category)}</option>`
          )),
        ].join('');
      }

      function renderSelection() {
        const selections = Array.from(state.selections.values());
        if (!selections.length) {
          els.selection.innerHTML = '<div class="cb-empty">(nothing selected)</div>';
          return;
        }
        els.selection.innerHTML = selections.map(selection => {
          const selectionKey = makeSelectionKey(selection.dictionary, selection.className);
          const fields = Array.from(selection.fields).sort();
          const methods = Array.from(selection.methods.values());
          const classMethods = Array.from(selection.classMethods.values());
          return `
            <div class="codegen-selected-card">
              <div class="codegen-selected-title">
                <span>${escapeHtml(selection.className)}</span>
                <button type="button" class="btn-ghost" data-remove-selection="${escapeHtml(selectionKey)}">Remove</button>
              </div>
              <div class="codegen-selected-meta">${escapeHtml(selection.dictionary || '(symbol list)')} / ${escapeHtml(selection.protocolName)}</div>
              <div class="codegen-selected-items">
                ${fields.length ? `<div>fields: ${escapeHtml(fields.join(', '))}</div>` : ''}
                ${renderMethodEditors(selectionKey, 'instance', methods)}
                ${renderMethodEditors(selectionKey, 'class', classMethods)}
              </div>
            </div>
          `;
        }).join('');
      }

      function renderMethodEditors(selectionKey, side, methods) {
        if (!methods.length) return '';
        return `
          <div class="codegen-selected-group">${side === 'class' ? 'class methods' : 'methods'}</div>
          ${methods.map(method => {
            const argNames = Array.isArray(method.argNames) ? method.argNames : [];
            return `
              <div class="codegen-method-editor">
                <div class="codegen-method-editor-selector">${escapeHtml(method.selector)}</div>
                <label>
                  <span>Python</span>
                  <input class="codegen-edit-input" data-edit-method="1" data-selection-key="${escapeHtml(selectionKey)}" data-side="${side}" data-selector="${escapeHtml(method.selector)}" data-field="pythonName" value="${escapeHtml(method.pythonName || selectorToPythonName(method.selector))}">
                </label>
                ${argNames.map((argName, index) => `
                  <label>
                    <span>Arg ${index + 1}</span>
                    <input class="codegen-edit-input" data-edit-method="1" data-selection-key="${escapeHtml(selectionKey)}" data-side="${side}" data-selector="${escapeHtml(method.selector)}" data-field="argName" data-arg-index="${index}" value="${escapeHtml(argName)}">
                  </label>
                `).join('')}
                <label>
                  <span>Returns</span>
                  <input class="codegen-edit-input" data-edit-method="1" data-selection-key="${escapeHtml(selectionKey)}" data-side="${side}" data-selector="${escapeHtml(method.selector)}" data-field="returnAnnotation" value="${escapeHtml(method.returnAnnotation || 'Any')}">
                </label>
              </div>
            `;
          }).join('')}
        `;
      }

      function renderAll() {
        renderDictionaries();
        renderClasses();
        renderMethods();
        renderSelection();
      }

      function clearMethodSource(message = 'Select a selector') {
        if (els.sourceLabel) els.sourceLabel.textContent = message;
        if (els.source) els.source.textContent = '';
      }

      async function loadDictionaries() {
        setStatus('Loading dictionaries...');
        const data = await api('/codegen/dictionaries');
        if (!data.success) throw new Error(data.exception || 'failed to load dictionaries');
        state.dictionaries = Array.isArray(data.dictionaries) ? data.dictionaries : [];
        if (!state.selectedDictionary) state.selectedDictionary = state.dictionaries[0] || '';
        renderDictionaries();
        await loadClasses();
      }

      async function loadClasses() {
        const dictionary = String(els.dictionary?.value || state.selectedDictionary || '').trim();
        if (!dictionary) return;
        state.selectedDictionary = dictionary;
        deps.upsertWindowState?.(id, { dictionary: state.selectedDictionary });
        setStatus(`Loading classes from ${dictionary}...`);
        const data = await apiWithParams('/codegen/classes', { dictionary });
        if (!data.success) throw new Error(data.exception || 'failed to load classes');
        state.classes = Array.isArray(data.classes) ? data.classes : [];
        if (state.selectedClassName && !state.classes.some(item => item.className === state.selectedClassName)) {
          state.selectedClassName = '';
          state.classDetails = null;
        }
        renderClasses();
        if (state.selectedClassName) await loadClassDetails(state.selectedClassName);
        setStatus(`Loaded ${state.classes.length} class${state.classes.length === 1 ? '' : 'es'}`);
      }

      async function loadClassDetails(className) {
        state.selectedClassName = String(className || '').trim();
        state.selectedMethods.clear();
        clearMethodSource();
        if (!state.selectedClassName) return;
        deps.upsertWindowState?.(id, {
          dictionary: state.selectedDictionary,
          className: state.selectedClassName,
        });
        setStatus(`Loading ${state.selectedClassName} methods...`);
        const data = await apiWithParams('/codegen/class', {
          dictionary: state.selectedDictionary,
          class: state.selectedClassName,
        });
        if (!data.success) throw new Error(data.exception || 'failed to load class');
        state.classDetails = data;
        renderAll();
        clearMethodSource();
        setStatus(`Loaded ${state.selectedClassName}`);
      }

      function addSelectedMethods() {
        const details = state.classDetails;
        if (!details?.className) {
          setStatus('Select a class first', true);
          return;
        }
        const key = makeSelectionKey(details.dictionary || state.selectedDictionary, details.className);
        const selection = state.selections.get(key) || {
          className: details.className,
          protocolName: `${details.className}Proto`,
          dictionary: details.dictionary || state.selectedDictionary,
          fields: new Set(),
          methods: new Map(),
          classMethods: new Map(),
        };
        const side = els.classSide?.checked ? 'class' : 'instance';
        const methodsByKey = new Map(
          currentMethods().map(method => [methodKey({ ...method, meta: side === 'class' }), method])
        );
        state.selectedMethods.forEach(key => {
          const method = methodsByKey.get(key);
          if (!method) return;
          if (side === 'instance' && method.propertyCandidate) {
            selection.fields.add(method.pythonName || selectorToPythonName(method.selector));
            return;
          }
          const target = side === 'class' ? selection.classMethods : selection.methods;
          const selector = String(method.selector || '').trim();
          target.set(selector, {
            selector,
            pythonName: method.pythonName || selectorToPythonName(selector),
            argNames: Array.from({ length: Number(method.argCount || 0) }, (_, index) => `arg${index + 1}`),
            returnAnnotation: 'Any',
          });
        });
        if (selection.fields.size || selection.methods.size || selection.classMethods.size) {
          state.selections.set(key, selection);
          state.selectedMethods.clear();
          state.lastPreview = null;
          renderAll();
          setStatus(`Added ${selection.className} to codegen selection`);
        } else {
          setStatus('Check at least one selector first', true);
        }
      }

      async function loadMethodSource(selector, meta) {
        const className = String(state.selectedClassName || '').trim();
        const dictionary = String(state.selectedDictionary || '').trim();
        const normalizedSelector = String(selector || '').trim();
        if (!className || !normalizedSelector) {
          clearMethodSource();
          return;
        }
        const cacheKey = `${dictionary}::${className}::${meta ? '1' : '0'}::${normalizedSelector}`;
        if (els.sourceLabel) els.sourceLabel.textContent = `${className}${meta ? ' class' : ''} >> ${normalizedSelector}`;
        if (state.sourceCache.has(cacheKey)) {
          if (els.source) els.source.textContent = state.sourceCache.get(cacheKey);
          return;
        }
        if (els.source) els.source.textContent = 'Loading source...';
        const data = await apiWithParams('/codegen/source', {
          dictionary,
          class: className,
          selector: normalizedSelector,
          meta: meta ? '1' : '0',
        });
        if (!data.success) throw new Error(data.exception || 'failed to load source');
        const source = String(data.source || '');
        state.sourceCache.set(cacheKey, source);
        if (els.source) els.source.textContent = source || '(source unavailable)';
      }

      function applySelection(selection) {
        state.moduleName = String(selection.moduleName || 'gemstone_codegen_preview_protocols').trim() || 'gemstone_codegen_preview_protocols';
        if (els.async) els.async.checked = selection.async !== false;
        state.selections.clear();
        (Array.isArray(selection.classes) ? selection.classes : []).forEach(classSpec => {
          const className = String(classSpec.className || '').trim();
          if (!className) return;
          const dictionary = String(classSpec.dictionary || '').trim();
          const key = makeSelectionKey(dictionary, className);
          state.selections.set(key, {
            className,
            protocolName: String(classSpec.protocolName || `${className}Proto`).trim() || `${className}Proto`,
            dictionary,
            fields: new Set(Array.isArray(classSpec.fields) ? classSpec.fields : []),
            methods: new Map((Array.isArray(classSpec.methods) ? classSpec.methods : []).map(method => [
              String(method.selector || '').trim(),
              {
                selector: String(method.selector || '').trim(),
                pythonName: String(method.pythonName || selectorToPythonName(method.selector)).trim(),
                argNames: Array.isArray(method.argNames) ? method.argNames.map(name => String(name || '').trim()) : [],
                returnAnnotation: String(method.returnAnnotation || 'Any').trim() || 'Any',
              },
            ]).filter(([selector]) => selector)),
            classMethods: new Map((Array.isArray(classSpec.classMethods) ? classSpec.classMethods : []).map(method => [
              String(method.selector || '').trim(),
              {
                selector: String(method.selector || '').trim(),
                pythonName: String(method.pythonName || selectorToPythonName(method.selector)).trim(),
                argNames: Array.isArray(method.argNames) ? method.argNames.map(name => String(name || '').trim()) : [],
                returnAnnotation: String(method.returnAnnotation || 'Any').trim() || 'Any',
              },
            ]).filter(([selector]) => selector)),
          });
        });
        state.lastPreview = null;
        if (els.previewText) els.previewText.value = '';
        renderSelection();
      }

      async function importSelectionFile(file) {
        if (!file) return;
        const text = await file.text();
        const parsed = JSON.parse(text);
        const payload = parsed && typeof parsed === 'object' && parsed.selection ? parsed.selection : parsed;
        const data = await apiPost('/codegen/export-selection', payload);
        if (!data.success) throw new Error(data.exception || 'import failed');
        applySelection(data.selection || {});
        setStatus(`Imported ${state.selections.size} codegen selection${state.selections.size === 1 ? '' : 's'}`);
      }

      async function preview() {
        const payload = selectionPayload();
        if (!payload.classes.length) {
          setStatus('Add at least one class to preview', true);
          return;
        }
        setStatus('Generating preview...');
        const data = await apiPost('/codegen/preview', payload);
        if (!data.success) throw new Error(data.exception || 'preview failed');
        state.lastPreview = data;
        const files = Array.isArray(data.files) ? data.files : [];
        const renderedFiles = files
          .map(file => `# ${file.path}\n${file.source}`)
          .join('\n\n');
        els.previewText.value = [
          '# Protocol draft',
          data.protocolSource || '',
          '# Generated package preview',
          renderedFiles,
        ].join('\n\n').trim() + '\n';
        setStatus(`Previewed ${files.length} generated file${files.length === 1 ? '' : 's'}`);
      }

      async function exportSelection() {
        const payload = selectionPayload();
        if (!payload.classes.length) {
          setStatus('Add at least one class to export', true);
          return;
        }
        const data = await apiPost('/codegen/export-selection', payload);
        if (!data.success) throw new Error(data.exception || 'export failed');
        deps.downloadDataFile?.(
          'codegen-workbench.json',
          data.json || JSON.stringify(data.selection || payload, null, 2),
          'application/json'
        );
        setStatus('Exported codegen-workbench.json');
      }

      async function copyProtocol() {
        if (!state.lastPreview) {
          await preview();
        }
        const source = String(state.lastPreview?.protocolSource || '').trim();
        if (!source) return;
        deps.copyTextToClipboard?.(source);
        setStatus('Copied Protocol draft');
      }

      els.refresh?.addEventListener('click', () => loadDictionaries().catch(error => setStatus(String(error.message || error), true)));
      els.dictionary?.addEventListener('change', () => loadClasses().catch(error => setStatus(String(error.message || error), true)));
      els.classFilter?.addEventListener('input', renderClasses);
      els.methodFilter?.addEventListener('input', renderMethods);
      els.categoryFilter?.addEventListener('change', () => {
        state.selectedCategory = String(els.categoryFilter?.value || '');
        state.selectedMethods.clear();
        renderMethods();
      });
      els.classSide?.addEventListener('change', () => {
        state.selectedCategory = '';
        state.selectedMethods.clear();
        renderMethods();
        clearMethodSource();
      });
      els.add?.addEventListener('click', addSelectedMethods);
      els.preview?.addEventListener('click', () => preview().catch(error => setStatus(String(error.message || error), true)));
      els.importSelection?.addEventListener('click', () => els.importFile?.click());
      els.importFile?.addEventListener('change', () => {
        importSelectionFile(els.importFile.files?.[0]).catch(error => setStatus(String(error.message || error), true));
        els.importFile.value = '';
      });
      els.exportJson?.addEventListener('click', () => exportSelection().catch(error => setStatus(String(error.message || error), true)));
      els.copyProtocol?.addEventListener('click', () => copyProtocol().catch(error => setStatus(String(error.message || error), true)));
      els.clear?.addEventListener('click', () => {
        state.selections.clear();
        state.lastPreview = null;
        els.previewText.value = '';
        renderSelection();
        setStatus('Cleared codegen selection');
      });
      els.classes?.addEventListener('click', event => {
        const row = event.target?.closest?.('[data-class-name]');
        if (!row) return;
        loadClassDetails(row.dataset.className).catch(error => setStatus(String(error.message || error), true));
      });
      els.methods?.addEventListener('click', event => {
        if (event.target?.closest?.('input[type="checkbox"]')) return;
        const row = event.target?.closest?.('.codegen-method-row');
        if (!row) return;
        loadMethodSource(row.dataset.selector, !!els.classSide?.checked).catch(error => setStatus(String(error.message || error), true));
      });
      els.methods?.addEventListener('change', event => {
        const input = event.target?.closest?.('[data-method-key]');
        if (!input) return;
        if (input.checked) state.selectedMethods.add(input.dataset.methodKey);
        else state.selectedMethods.delete(input.dataset.methodKey);
        loadMethodSource(input.dataset.selector, !!els.classSide?.checked).catch(error => setStatus(String(error.message || error), true));
      });
      els.selection?.addEventListener('click', event => {
        const button = event.target?.closest?.('[data-remove-selection]');
        if (!button) return;
        state.selections.delete(button.dataset.removeSelection);
        state.lastPreview = null;
        renderSelection();
      });
      els.selection?.addEventListener('input', event => {
        const input = event.target?.closest?.('[data-edit-method]');
        if (!input) return;
        const selection = state.selections.get(input.dataset.selectionKey);
        if (!selection) return;
        const methods = input.dataset.side === 'class' ? selection.classMethods : selection.methods;
        const method = methods.get(input.dataset.selector);
        if (!method) return;
        const field = input.dataset.field;
        if (field === 'pythonName') method.pythonName = input.value;
        if (field === 'returnAnnotation') method.returnAnnotation = input.value;
        if (field === 'argName') {
          const index = Number(input.dataset.argIndex || 0);
          method.argNames[index] = input.value;
        }
        state.lastPreview = null;
      });

      renderAll();
      loadDictionaries().catch(error => setStatus(String(error.message || error), true));
      return win;
    }

    return {
      openCodegenExplorer,
    };
  }

  return {
    buildCodegenExplorerHtml,
    selectorToPythonName,
    createCodegenExplorerRuntime,
  };
});
