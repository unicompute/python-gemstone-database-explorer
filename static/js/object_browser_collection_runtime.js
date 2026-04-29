(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ObjectBrowserCollectionRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function renderError(ibody, message, escHtml) {
    ibody.innerHTML = `<p style="color:#f38ba8;padding:8px">${escHtml(String(message || 'error'))}</p>`;
  }

  async function renderInstances(ibody, renderToken, oop, deps = {}) {
    const {
      fetchInspectorTabData,
      objectApi,
      isActiveInspectorRender,
      getPage,
      setPage,
      nextInspectorRenderToken,
      buildPagedCollectionState,
      buildInstancesCollectionState,
      document,
      makeChip,
      escHtml,
    } = deps;
    ibody.innerHTML = '<span class="spinner"></span>';
    const PAGE = 20;
    try {
      const page = getPage();
      const offset = page * PAGE;
      const d = await fetchInspectorTabData(
        oop,
        'instances',
        { limit: PAGE, offset },
        () => objectApi(`/object/instances/${oop}?limit=${PAGE}&offset=${offset}`)
      );
      if (!isActiveInspectorRender(renderToken, 'instances', oop)) return;
      ibody.innerHTML = '';
      if (!d.success) {
        renderError(ibody, d.exception, escHtml);
        return;
      }
      if (!d.instances.length) {
        ibody.innerHTML = '<p style="color:#6c7086;padding:8px">(no instances)</p>';
        return;
      }
      const pageState = buildPagedCollectionState({
        page,
        pageSize: PAGE,
        offset: d.offset,
        total: Number.isFinite(d.total) ? d.total : d.instances.length,
        count: d.instances.length,
        hasMore: d.hasMore,
      });
      const renderState = buildInstancesCollectionState(d.instances || [], pageState);
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;height:100%';
      const tblWrap = document.createElement('div');
      tblWrap.className = 'instances-tbl-wrap';
      const tbl = document.createElement('table');
      tbl.className = 'dbtable';
      tbl.innerHTML = '<thead><tr><th>oop</th><th>Object</th><th>printString</th></tr></thead>';
      const tbody = document.createElement('tbody');
      renderState.rows.forEach(inst => {
        const tr = document.createElement('tr');
        const tdOop = document.createElement('td');
        tdOop.className = 'col-key';
        tdOop.style.fontFamily = 'monospace';
        tdOop.textContent = inst.oop;
        const tdObj = document.createElement('td');
        tdObj.className = 'col-val';
        tdObj.appendChild(makeChip(inst.chipText, inst.oop));
        const tdPs = document.createElement('td');
        tdPs.className = 'col-val';
        tdPs.style.color = '#6c7086';
        tdPs.textContent = inst.printText;
        tr.append(tdOop, tdObj, tdPs);
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      tblWrap.appendChild(tbl);
      wrap.appendChild(tblWrap);
      const pg = document.createElement('div');
      pg.className = 'inst-pagination';
      const info = document.createElement('span');
      info.style.cssText = 'font-size:10px;color:#6c7086';
      info.textContent = renderState.summaryText;
      pg.appendChild(info);
      const prevBtn = document.createElement('button');
      prevBtn.className = 'inst-page-btn';
      prevBtn.textContent = 'Previous';
      prevBtn.disabled = !pageState.canPrev;
      prevBtn.addEventListener('click', () => {
        if (page <= 0) return;
        setPage(page - 1);
        renderInstances(ibody, nextInspectorRenderToken(), oop, deps);
      });
      pg.appendChild(prevBtn);
      const pageBtn = document.createElement('button');
      pageBtn.className = 'inst-page-btn active';
      pageBtn.textContent = String(pageState.pageNumber);
      pageBtn.disabled = true;
      pg.appendChild(pageBtn);
      const nextBtn = document.createElement('button');
      nextBtn.className = 'inst-page-btn';
      nextBtn.textContent = 'Next';
      nextBtn.disabled = !pageState.canNext;
      nextBtn.addEventListener('click', () => {
        if (!d.hasMore) return;
        setPage(page + 1);
        renderInstances(ibody, nextInspectorRenderToken(), oop, deps);
      });
      pg.appendChild(nextBtn);
      wrap.appendChild(pg);
      ibody.appendChild(wrap);
    } catch (error) {
      renderError(ibody, error.message, escHtml);
    }
  }

  async function renderConstants(ibody, renderToken, oop, deps = {}) {
    const {
      fetchInspectorTabData,
      objectApi,
      isActiveInspectorRender,
      getPage,
      setPage,
      nextInspectorRenderToken,
      buildPagedCollectionState,
      buildConstantsCollectionState,
      document,
      makeValCellFromState,
      escHtml,
    } = deps;
    ibody.innerHTML = '<span class="spinner"></span>';
    const PAGE = 20;
    try {
      const page = getPage();
      const offset = page * PAGE;
      const d = await fetchInspectorTabData(
        oop,
        'constants',
        { limit: PAGE, offset },
        () => objectApi(`/object/constants/${oop}?limit=${PAGE}&offset=${offset}`)
      );
      if (!isActiveInspectorRender(renderToken, 'constants', oop)) return;
      ibody.innerHTML = '';
      if (!d.success) throw new Error(d.exception);
      if (!d.constants.length) {
        ibody.innerHTML = '<p style="color:#6c7086;padding:8px">(no constants)</p>';
        return;
      }
      const pageState = buildPagedCollectionState({
        page,
        pageSize: PAGE,
        offset: d.offset,
        total: Number.isFinite(d.total) ? d.total : d.constants.length,
        count: d.constants.length,
        hasMore: d.hasMore,
      });
      const renderState = buildConstantsCollectionState(d.constants || [], pageState);
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;height:100%';
      const tblWrap = document.createElement('div');
      tblWrap.className = 'instances-tbl-wrap';
      const tbl = document.createElement('table');
      tbl.className = 'dbtable';
      tbl.innerHTML = '<thead><tr><th>Name</th><th>Value</th></tr></thead>';
      const tbody = document.createElement('tbody');
      renderState.rows.forEach(constant => {
        const tr = document.createElement('tr');
        const tdKey = document.createElement('td');
        tdKey.className = 'col-key';
        tdKey.textContent = constant.key || '';
        tr.append(tdKey, makeValCellFromState(constant.value, constant.valueLabel));
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      tblWrap.appendChild(tbl);
      wrap.appendChild(tblWrap);
      const pg = document.createElement('div');
      pg.className = 'inst-pagination';
      const info = document.createElement('span');
      info.style.cssText = 'font-size:10px;color:#6c7086';
      info.textContent = renderState.summaryText;
      pg.appendChild(info);
      const prevBtn = document.createElement('button');
      prevBtn.className = 'inst-page-btn';
      prevBtn.textContent = 'Previous';
      prevBtn.disabled = !pageState.canPrev;
      prevBtn.addEventListener('click', () => {
        if (page <= 0) return;
        setPage(page - 1);
        renderConstants(ibody, nextInspectorRenderToken(), oop, deps);
      });
      pg.appendChild(prevBtn);
      const pageBtn = document.createElement('button');
      pageBtn.className = 'inst-page-btn active';
      pageBtn.textContent = String(pageState.pageNumber);
      pageBtn.disabled = true;
      pg.appendChild(pageBtn);
      const nextBtn = document.createElement('button');
      nextBtn.className = 'inst-page-btn';
      nextBtn.textContent = 'Next';
      nextBtn.disabled = !pageState.canNext;
      nextBtn.addEventListener('click', () => {
        if (!d.hasMore) return;
        setPage(page + 1);
        renderConstants(ibody, nextInspectorRenderToken(), oop, deps);
      });
      pg.appendChild(nextBtn);
      wrap.appendChild(pg);
      ibody.appendChild(wrap);
    } catch (error) {
      renderError(ibody, error.message, escHtml);
    }
  }

  async function renderModules(ibody, renderToken, oop, deps = {}) {
    const {
      fetchInspectorTabData,
      objectApi,
      isActiveInspectorRender,
      getPage,
      setPage,
      nextInspectorRenderToken,
      buildPagedCollectionState,
      buildModulesCollectionState,
      document,
      makeValCellFromState,
      escHtml,
    } = deps;
    ibody.innerHTML = '<span class="spinner"></span>';
    const PAGE = 20;
    try {
      const page = getPage();
      const offset = page * PAGE;
      const d = await fetchInspectorTabData(
        oop,
        'modules',
        { limit: PAGE, offset },
        () => objectApi(`/object/included-modules/${oop}?limit=${PAGE}&offset=${offset}`)
      );
      if (!isActiveInspectorRender(renderToken, 'modules', oop)) return;
      ibody.innerHTML = '';
      if (!d.success) {
        renderError(ibody, d.exception, escHtml);
        return;
      }
      if (!d.modules.length) {
        ibody.innerHTML = '<p style="color:#6c7086;padding:8px">(no included modules)</p>';
        return;
      }
      const pageState = buildPagedCollectionState({
        page,
        pageSize: PAGE,
        offset: d.offset,
        total: Number.isFinite(d.total) ? d.total : d.modules.length,
        count: d.modules.length,
        hasMore: d.hasMore,
      });
      const renderState = buildModulesCollectionState(d.modules || [], pageState);
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;height:100%';
      const tblWrap = document.createElement('div');
      tblWrap.className = 'instances-tbl-wrap';
      const tbl = document.createElement('table');
      tbl.className = 'dbtable';
      tbl.innerHTML = '<thead><tr><th>Included By</th><th>Module</th></tr></thead>';
      const tbody = document.createElement('tbody');
      renderState.rows.forEach(entry => {
        const tr = document.createElement('tr');
        tr.append(
          makeValCellFromState(entry.owner, entry.ownerLabel),
          makeValCellFromState(entry.module, entry.moduleLabel),
        );
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      tblWrap.appendChild(tbl);
      wrap.appendChild(tblWrap);
      const pg = document.createElement('div');
      pg.className = 'inst-pagination';
      const info = document.createElement('span');
      info.style.cssText = 'font-size:10px;color:#6c7086';
      info.textContent = renderState.summaryText;
      pg.appendChild(info);
      const prevBtn = document.createElement('button');
      prevBtn.className = 'inst-page-btn';
      prevBtn.textContent = 'Previous';
      prevBtn.disabled = !pageState.canPrev;
      prevBtn.addEventListener('click', () => {
        if (page <= 0) return;
        setPage(page - 1);
        renderModules(ibody, nextInspectorRenderToken(), oop, deps);
      });
      pg.appendChild(prevBtn);
      const pageBtn = document.createElement('button');
      pageBtn.className = 'inst-page-btn active';
      pageBtn.textContent = String(pageState.pageNumber);
      pageBtn.disabled = true;
      pg.appendChild(pageBtn);
      const nextBtn = document.createElement('button');
      nextBtn.className = 'inst-page-btn';
      nextBtn.textContent = 'Next';
      nextBtn.disabled = !pageState.canNext;
      nextBtn.addEventListener('click', () => {
        if (!d.hasMore) return;
        setPage(page + 1);
        renderModules(ibody, nextInspectorRenderToken(), oop, deps);
      });
      pg.appendChild(nextBtn);
      wrap.appendChild(pg);
      ibody.appendChild(wrap);
    } catch (error) {
      renderError(ibody, error.message, escHtml);
    }
  }

  return {
    renderInstances,
    renderConstants,
    renderModules,
  };
});
