(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ObjectBrowserChromeRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function renderError(ibody, message, escHtml) {
    ibody.innerHTML = `<p style="color:#f38ba8;padding:8px">${escHtml(String(message || 'error'))}</p>`;
  }

  function buildTitlebarChip(text, oop, icon, deps = {}) {
    const { document, escHtml, attachObjectButtonBehavior, sourceWinId } = deps;
    const sp = document.createElement('span');
    sp.style.cssText = 'display:inline-flex;align-items:center;gap:2px;background:#2a2a3a;border:1px solid #45475a;border-radius:3px;padding:0 5px 0 4px;font-size:10px;font-family:monospace;cursor:pointer;white-space:nowrap;color:#cdd6f4;';
    sp.innerHTML = (icon ? `<span style="font-size:9px;color:#a6adc8">${icon}</span>` : '') + escHtml(String(text || '').slice(0, 30)) + '<span style="color:#6c7086;font-size:8px;margin-left:2px">▼</span>';
    sp.title = String(text || '');
    attachObjectButtonBehavior?.(sp, { oop, text, sourceWinId });
    return sp;
  }

  function prepareTitlebar(win, id, deps = {}) {
    const { document } = deps;
    const titlebar = win.querySelector(`#${id}-titlebar`);
    if (!titlebar) return;
    titlebar.className = 'insp-titlebar';
    titlebar.querySelector(`#${id}-title-text`)?.remove?.();
    let tbLeft = titlebar.querySelector(`#${id}-tb-left`);
    let tbRight = titlebar.querySelector(`#${id}-tb-right`);
    if (!tbLeft) {
      tbLeft = document.createElement('div');
      tbLeft.className = 'insp-titlebar-left';
      tbLeft.id = `${id}-tb-left`;
      titlebar.appendChild(tbLeft);
    }
    if (!tbRight) {
      tbRight = document.createElement('div');
      tbRight.className = 'insp-titlebar-right';
      tbRight.id = `${id}-tb-right`;
      titlebar.appendChild(tbRight);
    }
    tbLeft.innerHTML = '<span style="color:#6c7086;font-size:10px;font-style:italic">Object Browser</span>';
    tbRight.innerHTML = '';
  }

  function updateTitlebar(win, id, obj, deps = {}) {
    const left = win.querySelector(`#${id}-tb-left`);
    const right = win.querySelector(`#${id}-tb-right`);
    if (!left || !right) return;
    left.innerHTML = '';
    right.innerHTML = '';
    if (!obj) {
      left.innerHTML = '<span style="color:#6c7086;font-size:10px;font-style:italic">Object Browser</span>';
      return;
    }
    left.appendChild(buildTitlebarChip(obj.inspection || 'self', obj.oop, '▤', deps));
    if (obj.classObject?.oop) {
      const lt = deps.document.createElement('span');
      lt.className = 'insp-sep';
      lt.textContent = ' < ';
      left.appendChild(lt);
      left.appendChild(buildTitlebarChip(obj.classObject.inspection || 'class', obj.classObject.oop, '▤', deps));
    }
    const oopSp = deps.document.createElement('span');
    oopSp.className = 'insp-oop';
    oopSp.textContent = ` <0x${(obj.oop || 0).toString(16)}>`;
    left.appendChild(oopSp);
    if (obj.classObject?.oop) {
      const sep1 = deps.document.createElement('span');
      sep1.className = 'insp-sep';
      sep1.textContent = ':: ';
      right.appendChild(sep1);
      right.appendChild(buildTitlebarChip(obj.inspection || 'self', obj.oop, '▤', deps));
      const sep2 = deps.document.createElement('span');
      sep2.className = 'insp-sep';
      sep2.textContent = ' :: ';
      right.appendChild(sep2);
      right.appendChild(buildTitlebarChip(obj.classObject.inspection || 'class', obj.classObject.oop, '▤', deps));
    }
  }

  function populateRootsList(rootsUl, roots = {}, onSelectRoot) {
    if (!rootsUl) return;
    rootsUl.innerHTML = '';
    Object.entries(roots || {}).forEach(([label, oop]) => {
      const li = rootsUl.ownerDocument.createElement('li');
      li.textContent = label;
      li.dataset.oop = oop;
      li.addEventListener('click', () => onSelectRoot?.(label, oop));
      rootsUl.appendChild(li);
    });
  }

  function renderBreadcrumb(container, history = [], onSelectIndex) {
    if (!container) return;
    container.innerHTML = '';
    history.forEach((item, index) => {
      if (index > 0) {
        const sep = container.ownerDocument.createElement('span');
        sep.className = 'sep';
        sep.textContent = ' › ';
        container.appendChild(sep);
      }
      const crumb = container.ownerDocument.createElement('span');
      crumb.className = 'crumb' + (index === history.length - 1 ? ' cur' : '');
      crumb.textContent = item.label || `#${item.oop}`;
      if (index < history.length - 1) {
        crumb.addEventListener('click', () => onSelectIndex?.(index, item));
      }
      container.appendChild(crumb);
    });
  }

  function renderControlPanel(ibody, deps = {}) {
    const {
      document,
      objectApi,
      clearInspectorTabCache,
      getCurrentOop,
      setStatus,
      refreshHaltedThreadsBar,
    } = deps;
    const wrap = document.createElement('div');
    wrap.className = 'control-panel';
    const resDiv = document.createElement('div');
    resDiv.className = 'cp-result';
    const row = document.createElement('div');
    row.className = 'cp-row';
    const btnAbort = document.createElement('button');
    btnAbort.className = 'btn-tx';
    btnAbort.textContent = 'Abort Transaction';
    const btnCommit = document.createElement('button');
    btnCommit.className = 'btn-tx';
    btnCommit.textContent = 'Commit Transaction';
    const btnCont = document.createElement('button');
    btnCont.className = 'btn-tx';
    btnCont.style.background = '#4a90d9';
    btnCont.textContent = 'Continue Transaction';
    const btnPersist = document.createElement('button');
    btnPersist.className = 'btn-tx';
    btnPersist.style.background = '#45475a';
    btnPersist.textContent = 'Persistent Mode';

    function setPersistentButtonState(enabled) {
      btnPersist.classList.toggle('active', !!enabled);
      btnPersist.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }

    async function syncPersistentMode() {
      try {
        const d = await objectApi('/transaction/persistent-mode');
        if (d.success) setPersistentButtonState(!!d.persistent);
      } catch (_) {
        // ignore background sync failures
      }
    }

    async function cpAction(url, method = 'GET', bodyData, options = {}) {
      const { afterSuccess } = options;
      row.querySelectorAll('button').forEach(btn => { btn.disabled = true; });
      resDiv.className = 'cp-result visible loading';
      resDiv.textContent = 'Working…';
      try {
        const requestOptions = method === 'POST'
          ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyData || {}) }
          : undefined;
        const d = await objectApi(url, requestOptions);
        resDiv.className = 'cp-result visible' + (d.success ? '' : ' error');
        resDiv.textContent = d.success ? (d.result || 'ok') : `Error: ${d.exception || ''}`;
        if (d.success) {
          clearInspectorTabCache?.(getCurrentOop?.());
          if (typeof d.persistent === 'boolean') setPersistentButtonState(d.persistent);
          if (afterSuccess) await afterSuccess(d);
        }
        setStatus?.(d.success, d.success ? 'ok' : d.exception || 'error');
        return d;
      } catch (error) {
        resDiv.className = 'cp-result visible error';
        resDiv.textContent = error.message;
        return null;
      } finally {
        row.querySelectorAll('button').forEach(btn => { btn.disabled = false; });
      }
    }

    btnAbort.addEventListener('click', () => cpAction('/transaction/abort', 'POST', {}, {
      async afterSuccess() {
        await syncPersistentMode();
      },
    }));
    btnCommit.addEventListener('click', () => cpAction('/transaction/commit', 'POST', {}, {
      async afterSuccess() {
        await syncPersistentMode();
      },
    }));
    btnCont.addEventListener('click', () => cpAction('/transaction/continue', 'POST', {}, {
      async afterSuccess() {
        refreshHaltedThreadsBar?.();
        await syncPersistentMode();
      },
    }));
    btnPersist.addEventListener('click', async () => {
      const active = btnPersist.classList.contains('active');
      await cpAction('/transaction/persistent-mode', 'POST', { enable: !active });
    });

    syncPersistentMode();
    row.append(btnAbort, btnCommit, btnCont, btnPersist);
    wrap.append(row, resDiv);
    ibody.appendChild(wrap);
  }

  return {
    prepareTitlebar,
    updateTitlebar,
    populateRootsList,
    renderBreadcrumb,
    renderControlPanel,
    renderError,
  };
});
