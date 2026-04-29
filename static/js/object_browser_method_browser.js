(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ObjectBrowserMethodBrowser = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  async function openMethodBrowser(classOop, className, deps = {}) {
    const {
      body,
      id,
      fetchMethodBrowserCached,
      objectApi,
      buildMethodBrowserCategoriesHtml,
      buildMethodBrowserSelectorsHtml,
      findSelectorCategory,
      escHtml,
      updateMethodBrowserActions,
      getState,
      setState,
    } = deps;
    const mb = body.querySelector(`#${id}-mb`);
    mb.classList.remove('hidden');
    body.querySelector(`#${id}-mb-class`).textContent = className + ' methods';
    const catsEl = body.querySelector(`#${id}-mb-cats`);
    const selsEl = body.querySelector(`#${id}-mb-sels`);
    const srcEl = body.querySelector(`#${id}-mb-src`);
    const statusEl = body.querySelector(`#${id}-mb-status`);
    const previous = getState();
    const preserveSelection = previous.mbClassOop === classOop && previous.mbClassName === className;
    const preferredSelector = preserveSelection ? previous.mbCurrentSelector : null;
    const preferredCategory = preserveSelection ? previous.mbCurrentCategory : null;
    catsEl.innerHTML = '<div class="mb-cat" style="color:#6c7086"><span class="spinner"></span></div>';
    selsEl.innerHTML = '';
    srcEl.value = '';
    setState({
      mbClassOop: classOop,
      mbClassName: className,
      mbCurrentCategory: preserveSelection ? previous.mbCurrentCategory : null,
      mbCurrentSelector: preserveSelection ? previous.mbCurrentSelector : null,
    });
    updateMethodBrowserActions();
    try {
      const mbData = await fetchMethodBrowserCached('selectors', { classOop }, async () => {
        const d = await objectApi(`/code/selectors/${classOop}`);
        if (!d.success) throw new Error(d.exception);
        return d.result || {};
      });
      setState({ mbData });
      const cats = Object.keys(mbData).sort();
      if (!cats.length) {
        catsEl.innerHTML = buildMethodBrowserCategoriesHtml([], '');
        statusEl.textContent = className + ' — 0 categories';
        return;
      }

      async function loadSelectorSource(selector) {
        try {
          setState({ mbCurrentSelector: selector });
          updateMethodBrowserActions();
          selsEl.innerHTML = buildMethodBrowserSelectorsHtml(
            (mbData[getState().mbCurrentCategory] || []),
            getState().mbCurrentSelector,
          );
          srcEl.value = '';
          statusEl.textContent = `${className} >> ${selector} …`;
          const source = await fetchMethodBrowserCached('source', { classOop, selector }, async () => {
            const d = await objectApi(`/code/code/${classOop}?selector=${encodeURIComponent(selector)}`);
            if (!d.success) throw new Error(d.exception);
            return d.result || '';
          });
          srcEl.value = source;
          statusEl.textContent = `${className} >> ${selector}`;
        } catch (error) {
          srcEl.value = `Error: ${error.message}`;
          statusEl.textContent = `${className} >> ${selector} (error)`;
        }
      }

      async function selectCategory(category) {
        setState({ mbCurrentCategory: category });
        catsEl.innerHTML = buildMethodBrowserCategoriesHtml(cats, getState().mbCurrentCategory);
        const selectors = Array.isArray(mbData[category]) ? mbData[category] : [];
        let nextSelector = selectors.includes(getState().mbCurrentSelector) ? getState().mbCurrentSelector : null;
        if (!nextSelector && preferredSelector && selectors.includes(preferredSelector)) nextSelector = preferredSelector;
        if (!nextSelector) nextSelector = selectors[0] || null;
        setState({ mbCurrentSelector: nextSelector });
        selsEl.innerHTML = buildMethodBrowserSelectorsHtml(selectors, getState().mbCurrentSelector);
        updateMethodBrowserActions();
        if (nextSelector) await loadSelectorSource(nextSelector);
        else {
          srcEl.value = '';
          statusEl.textContent = `${className} — ${category} (0 selectors)`;
        }
      }

      deps.selectCategory(selectCategory);
      deps.selectSelector(async selector => {
        if (!selector) return;
        await loadSelectorSource(selector);
      });
      deps.openSelector(async selector => {
        if (!selector) return;
        setState({ mbCurrentSelector: selector });
        updateMethodBrowserActions();
        deps.openCurrentCodeInClassBrowser(selector);
      });

      const initialCategory = (preferredCategory && cats.includes(preferredCategory))
        ? preferredCategory
        : (preferredSelector ? (findSelectorCategory(mbData, preferredSelector) || cats[0]) : cats[0]);
      await selectCategory(initialCategory);
    } catch (error) {
      catsEl.innerHTML = `<div class="cb-empty" style="color:#f38ba8">${escHtml(error.message)}</div>`;
      selsEl.innerHTML = '';
      srcEl.value = '';
      statusEl.textContent = `${className} (error)`;
      setState({ mbData: {} });
    }
  }

  return {
    openMethodBrowser,
  };
});
