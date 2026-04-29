(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ClassBrowserWriteActions = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createClassBrowserWriteActions(deps = {}) {
    const state = () => deps.getState();
    const setState = patch => deps.setState(patch || {});

    async function addDictionary() {
      const name = await deps.requestTextModal('Add Dictionary', 'New dictionary name', '', 'TmpUI');
      if (!name) return;
      deps.setBrowserStatus('Adding dictionary…');
      try {
        const d = await deps.browserApiPost('/class-browser/add-dictionary', {name});
        if (!d.success) throw new Error(d.exception || 'Dictionary creation failed');
        deps.clearBrowserCache();
        setState({
          currentDict: d.dictionary || name,
          currentClass: null,
          currentProtocol: '-- all --',
          currentMethod: null,
          currentSourceMode: 'classDefinition',
        });
        deps.ensureFilterShowsValue(deps.els.dictFilter, state().currentDict);
        await deps.loadDictionaries();
        await deps.finalizeBrowserWrite(d.result || `Added ${state().currentDict}`);
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function renameDictionary() {
      const current = state();
      if (!current.currentDict) {
        deps.setBrowserStatus('Select a dictionary first', 'error');
        return;
      }
      const oldName = current.currentDict;
      const nextName = await deps.requestTextModal('Rename Dictionary', 'Rename dictionary to', oldName, oldName);
      if (!nextName || nextName === oldName) return;
      deps.setBrowserStatus('Renaming dictionary…');
      try {
        const d = await deps.browserApiPost('/class-browser/rename-dictionary', {
          dictionary: oldName,
          targetDictionary: nextName,
        });
        if (!d.success) throw new Error(d.exception || 'Dictionary rename failed');
        deps.clearBrowserCache();
        setState({
          currentDict: d.dictionary || nextName,
        });
        deps.ensureFilterShowsValue(deps.els.dictFilter, state().currentDict);
        deps.ensureFilterShowsValue(deps.els.classFilter, state().currentClass);
        await deps.loadDictionaries();
        await deps.finalizeBrowserWrite(d.result || `Renamed ${oldName} to ${state().currentDict}`);
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function removeDictionary() {
      const current = state();
      if (!current.currentDict) {
        deps.setBrowserStatus('Select a dictionary first', 'error');
        return;
      }
      const dictionary = current.currentDict;
      const confirmed = await deps.requestConfirmModal('Remove Dictionary', `Remove "${dictionary}" from your symbol list?`, {okLabel: 'Remove'});
      if (!confirmed) return;
      deps.setBrowserStatus('Removing dictionary…');
      try {
        const d = await deps.browserApiPost('/class-browser/remove-dictionary', {dictionary});
        if (!d.success) throw new Error(d.exception || 'Dictionary removal failed');
        deps.clearBrowserCache();
        setState({
          currentDict: null,
          currentClass: null,
          currentProtocol: '-- all --',
          currentMethod: null,
          currentSourceMode: 'classDefinition',
        });
        await deps.loadDictionaries();
        await deps.finalizeBrowserWrite(d.result || `Removed ${dictionary}`);
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function addClass() {
      const current = state();
      const targetDict = current.currentDict || 'UserGlobals';
      const superclassName = current.currentClass || 'Object';
      const className = await deps.requestTextModal('Add Class', `New class name in ${targetDict} < ${superclassName}`, '', 'NewClass');
      if (!className) return;
      deps.setBrowserStatus('Creating class…');
      try {
        const d = await deps.browserApiPost('/class-browser/add-class', {
          className,
          dictionary: targetDict,
          superclassName,
          superclassDictionary: current.currentClass ? (current.currentDict || '') : '',
        });
        if (!d.success) throw new Error(d.exception || 'Class creation failed');
        deps.clearBrowserCache();
        deps.setMetaChecked(false);
        setState({
          currentDict: d.dictionary || targetDict,
          currentClass: d.className || className,
          currentProtocol: '-- all --',
          currentMethod: null,
          currentSourceMode: 'classDefinition',
        });
        deps.ensureFilterShowsValue(deps.els.dictFilter, state().currentDict);
        deps.ensureFilterShowsValue(deps.els.classFilter, state().currentClass);
        await deps.loadDictionaries();
        await deps.finalizeBrowserWrite(d.result || `Created ${state().currentClass} in ${state().currentDict}`);
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function renameClass() {
      const current = state();
      if (!current.currentClass || !current.currentDict) {
        deps.setBrowserStatus('Select a class first', 'error');
        return;
      }
      const oldClassName = current.currentClass;
      const targetClassName = await deps.requestTextModal('Rename Class', `Rename ${oldClassName} to`, oldClassName, oldClassName);
      if (!targetClassName || targetClassName === oldClassName) return;
      deps.setBrowserStatus('Renaming class…');
      try {
        const d = await deps.browserApiPost('/class-browser/rename-class', {
          className: oldClassName,
          dictionary: current.currentDict,
          targetClassName,
        });
        if (!d.success) throw new Error(d.exception || 'Class rename failed');
        deps.clearBrowserCache();
        setState({
          currentClass: d.className || targetClassName,
          currentDict: d.dictionary || current.currentDict,
        });
        deps.ensureFilterShowsValue(deps.els.dictFilter, state().currentDict);
        deps.ensureFilterShowsValue(deps.els.classFilter, state().currentClass);
        await deps.loadDictionaries();
        await deps.finalizeBrowserWrite(d.result || `Renamed ${oldClassName} to ${state().currentClass}`);
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function addCategory() {
      const current = state();
      if (!current.currentClass) {
        deps.setBrowserStatus('Select a class first', 'error');
        return;
      }
      const category = await deps.requestTextModal(
        'Add Category',
        `New category for ${current.currentMeta ? `${current.currentClass} class` : current.currentClass}`,
        '',
        'new-category'
      );
      if (!category) return;
      deps.setBrowserStatus('Adding category…');
      try {
        const d = await deps.browserApiPost('/class-browser/add-category', {
          className: current.currentClass,
          dictionary: current.currentDict || '',
          category,
          meta: current.currentMeta,
        });
        if (!d.success) throw new Error(d.exception || 'Category creation failed');
        deps.clearBrowserCache();
        setState({
          currentProtocol: d.category || category,
          currentMethod: null,
          currentSourceMode: 'classDefinition',
        });
        deps.ensureFilterShowsValue(deps.els.protocolFilter, state().currentProtocol);
        await deps.loadProtocols();
        await deps.finalizeBrowserWrite(d.result || `Added category ${state().currentProtocol}`);
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function renameCategory() {
      const current = state();
      if (!current.currentClass || !current.currentProtocol || current.currentProtocol === '-- all --') {
        deps.setBrowserStatus('Select a category first', 'error');
        return;
      }
      const oldCategory = current.currentProtocol;
      const targetCategory = await deps.requestTextModal('Rename Category', `Rename ${oldCategory} to`, oldCategory, oldCategory);
      if (!targetCategory || targetCategory === oldCategory) return;
      deps.setBrowserStatus('Renaming category…');
      try {
        const d = await deps.browserApiPost('/class-browser/rename-category', {
          className: current.currentClass,
          dictionary: current.currentDict || '',
          category: oldCategory,
          targetCategory,
          meta: current.currentMeta,
        });
        if (!d.success) throw new Error(d.exception || 'Category rename failed');
        deps.clearBrowserCache();
        setState({ currentProtocol: d.category || targetCategory });
        deps.ensureFilterShowsValue(deps.els.protocolFilter, state().currentProtocol);
        deps.ensureFilterShowsValue(deps.els.methodFilter, state().currentMethod);
        await deps.loadProtocols();
        await deps.finalizeBrowserWrite(d.result || `Renamed ${oldCategory} to ${state().currentProtocol}`);
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function addClassVariable(route, title, message, placeholder) {
      const current = state();
      if (!current.currentClass) {
        deps.setBrowserStatus('Select a class first', 'error');
        return;
      }
      const variableName = await deps.requestTextModal(title, message, '', placeholder);
      if (!variableName) return;
      deps.setBrowserStatus(`${title}…`);
      try {
        const d = await deps.browserApiPost(route, {
          className: current.currentClass,
          dictionary: current.currentDict || '',
          variableName,
        });
        if (!d.success) throw new Error(d.exception || `${title} failed`);
        deps.clearBrowserCache();
        deps.setMetaChecked(false);
        setState({
          currentProtocol: '-- all --',
          currentMethod: null,
          currentSourceMode: 'classDefinition',
        });
        deps.ensureFilterShowsValue(deps.els.classFilter, current.currentClass);
        await deps.loadProtocols();
        await deps.finalizeBrowserWrite(d.result || `${title} succeeded`);
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    function parseDefinitionVariableNames(source, fieldName) {
      const match = String(source || '').match(new RegExp(`${fieldName}:\\s*'([^']*)'`));
      if (!match) return [];
      return String(match[1] || '').trim().split(/\s+/).filter(Boolean);
    }

    async function fetchClassVariableEntries() {
      const current = state();
      if (!current.currentClass) return [];
      const params = {class: current.currentClass, meta: 0};
      if (current.currentDict) params.dictionary = current.currentDict;
      const d = await deps.browserApiWithParams('/class-browser/source', params);
      if (!d.success) throw new Error(d.exception || 'Unable to load class definition');
      const source = d.source || '';
      return [
        ...parseDefinitionVariableNames(source, 'instanceVariableNames').map(name => ({
          key: `instance:${name}`,
          kind: 'instance',
          name,
          label: `Instance — ${name}`,
        })),
        ...parseDefinitionVariableNames(source, 'classVariableNames').map(name => ({
          key: `class:${name}`,
          kind: 'class',
          name,
          label: `Class — ${name}`,
        })),
        ...parseDefinitionVariableNames(source, 'classInstanceVariableNames').map(name => ({
          key: `classInstance:${name}`,
          kind: 'classInstance',
          name,
          label: `Class Instance — ${name}`,
        })),
      ];
    }

    async function renameVariable() {
      const current = state();
      if (!current.currentClass) {
        deps.setBrowserStatus('Select a class first', 'error');
        return;
      }
      try {
        const variables = await fetchClassVariableEntries();
        if (!variables.length) {
          deps.setBrowserStatus('No variables available', 'error');
          return;
        }
        const values = await deps.requestModal('Rename Variable', [
          {
            label: 'Variable',
            id: 'variable-key',
            type: 'select',
            options: variables.map(variable => ({value: variable.key, label: variable.label})),
            value: variables[0].key,
          },
          {
            label: 'New name',
            id: 'target-name',
            type: 'input',
            placeholder: variables[0].name,
            value: variables[0].name,
          },
        ], {okLabel: 'Rename'});
        if (!values) return;
        const selected = variables.find(variable => variable.key === values['variable-key']);
        const targetName = String(values['target-name'] || '').trim();
        if (!selected || !targetName || targetName === selected.name) return;
        const route = ({
          instance: '/class-browser/rename-instance-variable',
          class: '/class-browser/rename-class-variable',
          classInstance: '/class-browser/rename-class-instance-variable',
        })[selected.kind];
        if (!route) throw new Error('unsupported variable type');
        deps.setBrowserStatus('Renaming variable…');
        const d = await deps.browserApiPost(route, {
          className: current.currentClass,
          dictionary: current.currentDict || '',
          variableName: selected.name,
          targetVariableName: targetName,
        });
        if (!d.success) throw new Error(d.exception || 'Variable rename failed');
        deps.clearBrowserCache();
        deps.setMetaChecked(false);
        setState({
          currentProtocol: '-- all --',
          currentMethod: null,
          currentSourceMode: 'classDefinition',
        });
        deps.ensureFilterShowsValue(deps.els.classFilter, current.currentClass);
        await deps.loadProtocols();
        await deps.finalizeBrowserWrite(d.result || `Renamed ${selected.name} to ${targetName}`);
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function removeVariable() {
      const current = state();
      if (!current.currentClass) {
        deps.setBrowserStatus('Select a class first', 'error');
        return;
      }
      try {
        const variables = await fetchClassVariableEntries();
        if (!variables.length) {
          deps.setBrowserStatus('No variables available', 'error');
          return;
        }
        const selectedKey = await deps.requestSelectModal(
          'Remove Variable',
          'Variable',
          variables.map(variable => ({value: variable.key, label: variable.label})),
          variables[0].key,
          {okLabel: 'Remove'}
        );
        if (!selectedKey) return;
        const selected = variables.find(variable => variable.key === selectedKey);
        if (!selected) return;
        const confirmed = await deps.requestConfirmModal('Remove Variable', `Remove "${selected.name}"?`, {okLabel: 'Remove'});
        if (!confirmed) return;
        const route = ({
          instance: '/class-browser/remove-instance-variable',
          class: '/class-browser/remove-class-variable',
          classInstance: '/class-browser/remove-class-instance-variable',
        })[selected.kind];
        if (!route) throw new Error('unsupported variable type');
        deps.setBrowserStatus('Removing variable…');
        const d = await deps.browserApiPost(route, {
          className: current.currentClass,
          dictionary: current.currentDict || '',
          variableName: selected.name,
        });
        if (!d.success) throw new Error(d.exception || 'Variable removal failed');
        deps.clearBrowserCache();
        deps.setMetaChecked(false);
        setState({
          currentProtocol: '-- all --',
          currentMethod: null,
          currentSourceMode: 'classDefinition',
        });
        deps.ensureFilterShowsValue(deps.els.classFilter, current.currentClass);
        await deps.loadProtocols();
        await deps.finalizeBrowserWrite(d.result || `Removed ${selected.name}`);
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function moveClass() {
      const current = state();
      if (!current.currentClass || !current.currentDict) {
        deps.setBrowserStatus('Select a class first', 'error');
        return;
      }
      try {
        const dictionariesResponse = await deps.fetchBrowserCached('dictionaries', {}, () => deps.browserApi('/class-browser/dictionaries'));
        if (!dictionariesResponse.success) throw new Error(dictionariesResponse.exception);
        const options = (dictionariesResponse.dictionaries || [])
          .filter(name => name !== current.currentDict)
          .map(name => ({value: name, label: name}));
        if (!options.length) {
          deps.setBrowserStatus('No other dictionary is available', 'error');
          return;
        }
        const selected = await deps.requestSelectModal('Move Class', `Move ${current.currentClass} from ${current.currentDict} to`, options, options[0]?.value || '', {okLabel: 'Move'});
        if (!selected || selected === current.currentDict) return;
        deps.setBrowserStatus('Moving class…');
        const d = await deps.browserApiPost('/class-browser/move-class', {
          className: current.currentClass,
          dictionary: current.currentDict,
          targetDictionary: selected,
        });
        if (!d.success) throw new Error(d.exception || 'Class move failed');
        deps.clearBrowserCache();
        setState({
          currentDict: d.dictionary || selected,
          currentClass: d.className || current.currentClass,
          currentProtocol: '-- all --',
          currentMethod: null,
          currentSourceMode: 'classDefinition',
        });
        deps.ensureFilterShowsValue(deps.els.dictFilter, state().currentDict);
        deps.ensureFilterShowsValue(deps.els.classFilter, state().currentClass);
        await deps.loadDictionaries();
        await deps.finalizeBrowserWrite(d.result || `Moved ${state().currentClass} to ${state().currentDict}`);
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function removeClass() {
      const current = state();
      if (!current.currentClass || !current.currentDict) {
        deps.setBrowserStatus('Select a class first', 'error');
        return;
      }
      const confirmed = await deps.requestConfirmModal('Remove Class', `Remove "${current.currentClass}" from the system?`, {okLabel: 'Remove'});
      if (!confirmed) return;
      deps.setBrowserStatus('Removing class…');
      try {
        const d = await deps.browserApiPost('/class-browser/remove-class', {
          className: current.currentClass,
          dictionary: current.currentDict,
        });
        if (!d.success) throw new Error(d.exception || 'Class removal failed');
        deps.clearBrowserCache();
        setState({
          currentClass: null,
          currentProtocol: '-- all --',
          currentMethod: null,
          currentSourceMode: 'classDefinition',
        });
        await deps.loadDictionaries();
        await deps.finalizeBrowserWrite(d.result || `Removed ${current.currentClass}`);
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function moveMethod() {
      const current = state();
      if (!current.currentClass || !current.currentMethod) {
        deps.setBrowserStatus('Select a method first', 'error');
        return;
      }
      const currentCategory = current.currentProtocol === '-- all --' ? 'as yet unclassified' : current.currentProtocol;
      const targetCategory = await deps.requestTextModal('Move Method', `Move ${current.currentMethod} to category`, currentCategory, 'as yet unclassified', {okLabel: 'Move'});
      if (!targetCategory || targetCategory === currentCategory) return;
      deps.setBrowserStatus('Moving method…');
      try {
        const d = await deps.browserApiPost('/class-browser/move-method', {
          className: current.currentClass,
          dictionary: current.currentDict || '',
          selector: current.currentMethod,
          category: targetCategory,
          meta: current.currentMeta,
        });
        if (!d.success) throw new Error(d.exception || 'Method move failed');
        deps.clearBrowserCache();
        setState({
          currentProtocol: d.category || targetCategory,
          currentMethod: d.selector || current.currentMethod,
        });
        deps.ensureFilterShowsValue(deps.els.protocolFilter, state().currentProtocol);
        deps.ensureFilterShowsValue(deps.els.methodFilter, state().currentMethod);
        await deps.loadProtocols();
        await deps.finalizeBrowserWrite(d.result || `Moved ${state().currentMethod} to ${state().currentProtocol}`);
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function removeMethod() {
      const current = state();
      if (!current.currentClass || !current.currentMethod) {
        deps.setBrowserStatus('Select a method first', 'error');
        return;
      }
      const confirmed = await deps.requestConfirmModal(
        'Remove Method',
        `Remove "${current.currentMethod}" from ${current.currentMeta ? `${current.currentClass} class` : current.currentClass}?`,
        {okLabel: 'Remove'}
      );
      if (!confirmed) return;
      deps.setBrowserStatus('Removing method…');
      try {
        const d = await deps.browserApiPost('/class-browser/remove-method', {
          className: current.currentClass,
          dictionary: current.currentDict || '',
          selector: current.currentMethod,
          meta: current.currentMeta,
        });
        if (!d.success) throw new Error(d.exception || 'Method removal failed');
        deps.clearBrowserCache();
        setState({ currentMethod: null });
        await deps.loadProtocols();
        await deps.finalizeBrowserWrite(d.result || `Removed ${current.currentMethod}`);
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function removeCategory() {
      const current = state();
      if (!current.currentClass || !current.currentProtocol || current.currentProtocol === '-- all --') {
        deps.setBrowserStatus('Select a category first', 'error');
        return;
      }
      const category = current.currentProtocol;
      const selectedMethod = current.currentMethod;
      const confirmed = await deps.requestConfirmModal(
        'Remove Category',
        `Remove "${category}" and move its methods to "as yet unclassified"?`,
        {okLabel: 'Move Methods'}
      );
      if (!confirmed) return;
      deps.setBrowserStatus('Removing category…');
      try {
        const d = await deps.browserApiPost('/class-browser/remove-category', {
          className: current.currentClass,
          dictionary: current.currentDict || '',
          category,
          meta: current.currentMeta,
        });
        if (!d.success) throw new Error(d.exception || 'Category removal failed');
        deps.clearBrowserCache();
        setState({
          currentProtocol: d.category || 'as yet unclassified',
          currentMethod: selectedMethod,
        });
        deps.ensureFilterShowsValue(deps.els.protocolFilter, state().currentProtocol);
        deps.ensureFilterShowsValue(deps.els.methodFilter, state().currentMethod);
        await deps.loadProtocols();
        await deps.finalizeBrowserWrite(d.result || `Moved methods from ${category}`);
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    function startNewMethod() {
      const current = state();
      if (!current.currentClass) {
        deps.setBrowserStatus('Select a class first', 'error');
        return;
      }
      setState({
        currentMethod: null,
        currentSourceMode: 'newMethod',
      });
      deps.syncSourceMode();
      deps.setActiveRow(deps.els.methods, null);
      deps.els.source.value = '';
      deps.setSourceNote(current.currentMeta ? `${current.currentClass} class >> (new method)` : `${current.currentClass} >> (new method)`);
      const targetProtocol = current.currentProtocol === '-- all --' ? 'as yet unclassified' : current.currentProtocol;
      deps.setBrowserStatus(`Enter a new method for ${targetProtocol}`, 'ok');
      deps.els.source.focus();
    }

    async function createAccessors() {
      const current = state();
      if (!current.currentClass) {
        deps.setBrowserStatus('Select a class first', 'error');
        return;
      }
      const variableName = await deps.requestTextModal('Create Accessors', 'Variable name', '', 'name');
      if (!variableName) return;
      deps.setBrowserStatus('Creating accessors…');
      try {
        const d = await deps.browserApiPost('/class-browser/create-accessors', {
          className: current.currentClass,
          dictionary: current.currentDict || '',
          variableName,
        });
        if (!d.success) throw new Error(d.exception || 'Accessor generation failed');
        const getterSelector = String(d.getterSelector || variableName).trim();
        const accessorCategory = String(d.category || 'accessing').trim() || 'accessing';
        deps.clearBrowserCache();
        deps.setMetaChecked(false);
        setState({
          currentProtocol: accessorCategory,
          currentMethod: getterSelector || null,
        });
        deps.ensureFilterShowsValue(deps.els.protocolFilter, state().currentProtocol);
        deps.ensureFilterShowsValue(deps.els.methodFilter, state().currentMethod);
        await deps.loadProtocols();
        await deps.finalizeBrowserWrite(d.result || 'Accessors created');
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    async function runTransaction(action) {
      const spec = deps.buildTransactionActionSpec(action);
      await deps.runBrowserTransaction(spec.path, spec.busyMessage, spec.successMessage);
    }

    async function compileSource() {
      const current = state();
      if (!current.currentClass) {
        deps.setBrowserStatus('Select a class first', 'error');
        return;
      }
      const request = deps.buildCompileRequest(
        {
          currentDict: current.currentDict,
          currentClass: current.currentClass,
          currentProtocol: current.currentProtocol,
          currentMethod: current.currentMethod,
          currentMeta: deps.els.meta.checked,
        },
        deps.els.source.value,
        current.currentSourceMode === 'classDefinition' ? 'classDefinition' : 'method'
      );
      deps.setBrowserStatus('Compiling…');
      try {
        const d = await deps.browserApiPost('/class-browser/compile', request);
        if (!d.success) throw new Error(d.exception || 'Compilation failed');
        const compileResult = deps.applyCompileResponse({
          currentClass: current.currentClass,
          currentProtocol: current.currentProtocol,
          currentMethod: current.currentMethod,
          currentMeta: deps.els.meta.checked,
        }, d);
        deps.clearBrowserCache();
        setState(compileResult.nextState);
        deps.ensureFilterShowsValue(deps.els.protocolFilter, state().currentProtocol);
        deps.ensureFilterShowsValue(deps.els.methodFilter, state().currentMethod);
        await deps.loadProtocols();
        if (state().currentMethod) deps.setSourceNote(compileResult.compiledLabel);
        await deps.finalizeBrowserWrite(compileResult.compileStatus);
      } catch (error) {
        deps.setBrowserStatus(error.message, 'error');
        deps.setStatus(false, error.message);
      }
    }

    return {
      addDictionary,
      renameDictionary,
      removeDictionary,
      addClass,
      renameClass,
      addCategory,
      renameCategory,
      addClassVariable,
      renameVariable,
      removeVariable,
      moveClass,
      removeClass,
      moveMethod,
      removeMethod,
      removeCategory,
      startNewMethod,
      createAccessors,
      runTransaction,
      compileSource,
      commitSession: () => runTransaction('commit'),
      abortSession: () => runTransaction('abort'),
      continueSession: () => runTransaction('continue'),
    };
  }

  return {
    createClassBrowserWriteActions,
  };
});
