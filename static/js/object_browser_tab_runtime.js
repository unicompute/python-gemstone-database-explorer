(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ObjectBrowserTabRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function renderError(ibody, message, escHtml) {
    ibody.innerHTML = `<p style="color:#f38ba8;padding:8px">${escHtml(String(message || 'error'))}</p>`;
  }

  function appendRenderedValueChips(row, valueState, deps = {}) {
    const { assocChip, hashBraceChip, document } = deps;
    if (!valueState || valueState.kind === 'nil') {
      const nil = document.createElement('span');
      nil.style.cssText = 'color:#6c7086;font-family:monospace;font-size:11px';
      nil.textContent = 'nil';
      row.appendChild(nil);
      return;
    }
    if (valueState.kind === 'text') {
      const sp = document.createElement('span');
      sp.style.cssText = 'color:#a6e3a1;font-family:monospace;font-size:11px';
      sp.textContent = valueState.text;
      row.appendChild(sp);
      return;
    }
    if (valueState.kind === 'hash') {
      row.appendChild(hashBraceChip('{', valueState.oop));
      const ellipsis = document.createElement('span');
      ellipsis.style.cssText = 'color:#6c7086;font-size:11px;margin:0 2px';
      ellipsis.textContent = ' … ';
      row.appendChild(ellipsis);
      row.appendChild(hashBraceChip('}', valueState.oop));
      return;
    }
    if (valueState.kind === 'array') {
      row.appendChild(hashBraceChip('[', valueState.oop));
      const ellipsis = document.createElement('span');
      ellipsis.style.cssText = 'color:#6c7086;font-size:11px;margin:0 2px';
      ellipsis.textContent = ' … ';
      row.appendChild(ellipsis);
      row.appendChild(hashBraceChip(']', valueState.oop));
      return;
    }
    row.appendChild(assocChip(String(valueState.text || '').slice(0, 40), valueState.oop));
  }

  function renderAssociationPairs(ibody, renderState, deps = {}) {
    const { document, assocChip, appendRenderedValueChips: appendValueChips, escHtml } = deps;
    ibody.innerHTML = '';
    if (renderState.isEmpty) {
      ibody.innerHTML = `<p style="color:#6c7086;padding:8px">${escHtml(renderState.emptyText)}</p>`;
      return;
    }
    const wrap = document.createElement('div');
    for (const rowState of renderState.rows) {
      const row = document.createElement('div');
      row.className = 'assoc-row';

      if (rowState.key.isChip && rowState.key.oop) {
        row.appendChild(assocChip(rowState.key.text, rowState.key.oop));
      } else {
        const keyLabel = document.createElement('span');
        keyLabel.className = 'assoc-key-label';
        keyLabel.textContent = rowState.key.text;
        row.appendChild(keyLabel);
      }

      const arrow = document.createElement('span');
      arrow.className = 'assoc-arrow';
      arrow.textContent = ' => ';
      row.appendChild(arrow);

      appendValueChips(row, rowState.value);
      wrap.appendChild(row);
    }
    if (renderState.summaryText) {
      const more = document.createElement('div');
      more.className = 'more-row';
      more.textContent = renderState.summaryText;
      wrap.appendChild(more);
    }
    ibody.appendChild(wrap);
  }

  function makeValCellFromState(valueState, label, deps = {}) {
    const { document, makeChip, navigateToOop, buildValueRenderState } = deps;
    const td = document.createElement('td');
    td.className = 'col-val';
    const resolvedValue = valueState || buildValueRenderState(null);
    if (resolvedValue.kind === 'nil') {
      td.textContent = 'nil';
      return td;
    }
    if (resolvedValue.kind !== 'text' && resolvedValue.oop != null) {
      const chip = makeChip(resolvedValue.text, resolvedValue.oop);
      const nav = document.createElement('span');
      nav.className = 'ws-nav';
      nav.textContent = ' ↗';
      nav.style.fontSize = '10px';
      nav.addEventListener('click', () => navigateToOop(resolvedValue.oop, label || resolvedValue.text));
      td.append(chip, nav);
      return td;
    }
    td.textContent = resolvedValue.text;
    return td;
  }

  function renderCustomTab(ibody, obj, customTab, deps = {}) {
    const {
      buildCustomTabRenderState,
      renderAssociationPairs: renderPairs,
      appendCustomTabPager,
      escHtml,
    } = deps;
    const renderState = buildCustomTabRenderState(obj, customTab);
    if (renderState.kind === 'association-dict') {
      renderPairs(ibody, renderState.association);
      appendCustomTabPager(customTab, renderState.entries, renderState.totalSize);
      return;
    }
    ibody.innerHTML = `<p style="color:#f38ba8;padding:8px">Unsupported custom tab: ${escHtml(renderState.caption)}</p>`;
  }

  function renderObjectCard(obj, deps = {}) {
    const {
      document,
      buildObjectCardState,
      getCodeTarget,
      openMethodBrowser,
      navigateToOop,
      makeChip,
      makeValCellFromState: makeCell,
    } = deps;
    const renderState = buildObjectCardState(obj);
    const wrap = document.createElement('div');
    const card = document.createElement('div');
    card.className = 'obj-card';
    const hdr = document.createElement('div');
    hdr.className = 'obj-card-hdr';

    const bt = document.createElement('span');
    bt.className = 'basetype';
    bt.textContent = renderState.header.basetype;
    const cn = document.createElement('span');
    cn.className = 'class-name';
    const cname = renderState.header.className;
    cn.textContent = cname;
    const codeTarget = getCodeTarget(obj);
    if (cname && codeTarget?.oop) {
      cn.title = 'Browse methods';
      cn.addEventListener('click', () => openMethodBrowser(codeTarget.oop, codeTarget.label));
    }
    const ins = document.createElement('span');
    ins.className = 'inspection';
    ins.textContent = renderState.header.inspection;
    const oopSp = document.createElement('span');
    oopSp.className = 'oop';
    oopSp.textContent = renderState.header.oopText;
    hdr.append(bt, cn, ins, oopSp);
    card.appendChild(hdr);

    if (renderState.hasTable) {
      const tbl = document.createElement('table');
      tbl.className = 'dbtable';
      tbl.innerHTML = `<thead><tr><th>${renderState.keyColumnLabel}</th><th>Value</th></tr></thead>`;
      const tbody = document.createElement('tbody');
      for (const rowState of renderState.rows) {
        const tr = document.createElement('tr');
        const tdK = document.createElement('td');
        tdK.className = 'col-key';
        if (rowState.key.isChip && rowState.key.oop != null) {
          tdK.appendChild(makeChip(rowState.key.text, rowState.key.oop));
        } else {
          tdK.textContent = rowState.key.text;
        }
        const tdV = makeCell(rowState.value, rowState.key.text);
        tr.append(tdK, tdV);
        tbody.appendChild(tr);
      }
      tbl.appendChild(tbody);
      card.appendChild(tbl);
      if (renderState.moreText) {
        const more = document.createElement('div');
        more.className = 'more-row';
        more.textContent = renderState.moreText;
        card.appendChild(more);
      }
    }
    wrap.appendChild(card);

    if (renderState.classLink?.oop) {
      const cr = document.createElement('div');
      cr.className = 'class-row';
      const lbl = document.createElement('span');
      lbl.textContent = 'Class:';
      const aC = document.createElement('a');
      aC.className = 'link-oop';
      aC.textContent = renderState.classLink.text;
      aC.addEventListener('click', () => navigateToOop(renderState.classLink.oop, renderState.classLink.text || 'class'));
      const aM = document.createElement('a');
      aM.className = 'link-oop';
      aM.style.color = '#cba6f7';
      aM.textContent = 'Browse methods ›';
      aM.addEventListener('click', () => { if (codeTarget?.oop) openMethodBrowser(codeTarget.oop, codeTarget.label); });
      cr.append(lbl, aC, aM);
      wrap.appendChild(cr);
    }
    return wrap;
  }

  return {
    renderError,
    appendRenderedValueChips,
    renderAssociationPairs,
    makeValCellFromState,
    renderCustomTab,
    renderObjectCard,
  };
});
