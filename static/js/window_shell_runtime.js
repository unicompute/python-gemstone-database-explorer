(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WindowShellRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createWindowShellRuntime(deps = {}) {
    const documentNode = deps.document || globalThis.document;
    const windowNode = deps.window || globalThis;
    let winCount = 0;
    let cascadeX = 30;
    let cascadeY = 30;
    const CASCADE_STEP = 36;
    const CASCADE_MAX_X = 400;
    const CASCADE_MAX_Y = 300;

    function clampAutoPosition(x, y, width, height) {
      return {
        x: Math.max(0, Math.min(x, Math.max(0, windowNode.innerWidth - width - 10))),
        y: Math.max(0, Math.min(y, Math.max(0, windowNode.innerHeight - height - 42))),
      };
    }

    function focusWin(win, options = {}) {
      if (!win) return;
      const { deferLiveUpdate = false } = options;
      documentNode.querySelectorAll?.('.win').forEach(w => w.classList.remove('focused'));
      win.classList.add('focused');
      win.style.zIndex = String(deps.nextZIndex?.() ?? 1);
      documentNode.querySelectorAll?.('.taskbar-btn').forEach(btn => btn.classList.remove('active'));
      const tb = documentNode.getElementById?.('tb-' + win.id);
      if (tb) tb.classList.add('active');
      deps.persistWindowLayout?.();
      if (deferLiveUpdate) {
        windowNode.setTimeout?.(() => deps.notifyLiveWindowUpdated?.(), 0);
      } else {
        deps.notifyLiveWindowUpdated?.();
      }
    }

    function closeWindow(win, id) {
      if (!win) return;
      deps.removeArrowsFor?.(id);
      deps.liveWindowRenderers?.delete?.(id);
      deps.windowState?.delete?.(id);
      win.remove?.();
      const tb = documentNode.getElementById?.('tb-' + id);
      tb?.remove?.();
      deps.persistWindowLayout?.();
      deps.notifyStatusHistoryUpdated?.();
      deps.notifyLiveWindowUpdated?.();
    }

    function toggleMinimise(win) {
      if (!win) return;
      const body = win.querySelector?.('.win-body');
      const res = win.querySelector?.('.win-resize');
      if (win.dataset.minimised === '1') {
        win.dataset.minimised = '0';
        if (body) body.style.display = '';
        if (res) res.style.display = '';
        win.style.height = win.dataset.savedH || '480px';
      } else {
        win.dataset.minimised = '1';
        win.dataset.savedH = win.style.height;
        if (body) body.style.display = 'none';
        if (res) res.style.display = 'none';
        win.style.height = '28px';
      }
      deps.redrawArrows?.();
      deps.persistWindowLayout?.();
      deps.notifyLiveWindowUpdated?.();
    }

    function makeDraggable(win) {
      const bar = win.querySelector?.('.win-titlebar');
      if (!bar) return;
      let originX;
      let originY;
      let startX;
      let startY;
      bar.addEventListener('mousedown', event => {
        if (event.target?.tagName === 'BUTTON' || event.target?.closest?.('[data-obj-button="1"]')) return;
        event.preventDefault();
        focusWin(win);
        startX = event.clientX;
        startY = event.clientY;
        originX = win.offsetLeft;
        originY = win.offsetTop;
        const move = moveEvent => {
          win.style.left = Math.max(0, originX + moveEvent.clientX - startX) + 'px';
          win.style.top = Math.max(0, originY + moveEvent.clientY - startY) + 'px';
          deps.redrawArrows?.();
        };
        const up = () => {
          documentNode.removeEventListener?.('mousemove', move);
          documentNode.removeEventListener?.('mouseup', up);
          deps.persistWindowLayout?.();
        };
        documentNode.addEventListener?.('mousemove', move);
        documentNode.addEventListener?.('mouseup', up);
      });
    }

    function makeResizable(win) {
      const handle = win.querySelector?.('.win-resize');
      if (!handle) return;
      let startX;
      let startY;
      let startW;
      let startH;
      handle.addEventListener('mousedown', event => {
        event.preventDefault();
        event.stopPropagation();
        startX = event.clientX;
        startY = event.clientY;
        startW = win.offsetWidth;
        startH = win.offsetHeight;
        const move = moveEvent => {
          win.style.width = Math.max(320, startW + moveEvent.clientX - startX) + 'px';
          win.style.height = Math.max(180, startH + moveEvent.clientY - startY) + 'px';
          deps.redrawArrows?.();
        };
        const up = () => {
          documentNode.removeEventListener?.('mousemove', move);
          documentNode.removeEventListener?.('mouseup', up);
          deps.persistWindowLayout?.();
        };
        documentNode.addEventListener?.('mousemove', move);
        documentNode.addEventListener?.('mouseup', up);
      });
    }

    function createWindow({ title, width = 640, height = 480, x, y, taskbarLabel }) {
      const id = 'win-' + (++winCount);
      const w = width;
      const h = height;
      let left;
      let top;
      if (x !== undefined && y !== undefined) {
        left = x;
        top = y;
      } else if (x !== undefined) {
        left = x;
        top = cascadeY;
      } else if (y !== undefined) {
        top = y;
        left = cascadeX;
      } else {
        left = cascadeX;
        top = cascadeY;
        cascadeX += CASCADE_STEP;
        cascadeY += CASCADE_STEP;
        if (cascadeX > CASCADE_MAX_X || cascadeY > CASCADE_MAX_Y) {
          cascadeX = 30;
          cascadeY = 30;
        }
      }
      if (x === undefined && y === undefined) {
        const clamped = clampAutoPosition(left, top, w, h);
        left = clamped.x;
        top = clamped.y;
      }

      const win = documentNode.createElement('div');
      win.className = 'win';
      win.id = id;
      win.style.cssText = `left:${left}px;top:${top}px;width:${w}px;height:${h}px;z-index:${deps.nextZIndex?.() ?? 1}`;
      win.innerHTML = `
        <div class="win-titlebar" data-win="${id}" id="${id}-titlebar">
          <button class="win-btn win-btn-close" title="Close">✕</button>
          <button class="win-btn win-btn-min" title="Minimise">–</button>
          <span class="win-title" id="${id}-title-text">${deps.escHtml?.(title) || ''}</span>
        </div>
        <div class="win-body"></div>
        <div class="win-resize" data-win="${id}"></div>
      `;

      deps.desktop?.appendChild?.(win);
      makeDraggable(win);
      makeResizable(win);
      focusWin(win);

      win.querySelector?.('.win-btn-close')?.addEventListener('click', () => closeWindow(win, id));
      win.querySelector?.('.win-btn-min')?.addEventListener('click', () => toggleMinimise(win, id));

      const tbBtn = documentNode.createElement('button');
      tbBtn.className = 'taskbar-btn';
      tbBtn.textContent = taskbarLabel || String(title || '').slice(0, 20);
      tbBtn.id = 'tb-' + id;
      tbBtn.addEventListener('click', () => {
        if (win.dataset.minimised === '1') toggleMinimise(win, id);
        focusWin(win);
      });
      if (deps.taskbarInsertBeforeEl?.parentNode) {
        deps.taskbarInsertBeforeEl.parentNode.insertBefore(tbBtn, deps.taskbarInsertBeforeEl);
      } else {
        deps.taskbarContainer?.appendChild?.(tbBtn);
      }

      win.addEventListener('mousedown', event => {
        const target = event.target instanceof Element ? event.target : null;
        const isInteractive = !!target?.closest?.('button, input, textarea, select, option, a, [role="button"], [contenteditable="true"], [data-obj-button="1"]');
        focusWin(win, { deferLiveUpdate: isInteractive });
      });

      deps.upsertWindowState?.(id, { kind: 'generic', title });
      deps.persistWindowLayout?.();
      deps.notifyStatusHistoryUpdated?.();
      deps.notifyLiveWindowUpdated?.();
      return { win, body: win.querySelector('.win-body'), id };
    }

    function sourceRelativeWindowPosition(sourceWindowId, width, height, options = {}) {
      const source = sourceWindowId ? documentNode.getElementById?.(String(sourceWindowId)) : null;
      if (!source) return null;
      const dx = Number.isFinite(Number(options.dx)) ? Number(options.dx) : 36;
      const dy = Number.isFinite(Number(options.dy)) ? Number(options.dy) : -24;
      const rect = source.getBoundingClientRect();
      const rawX = rect.left + dx;
      const rawY = rect.top + dy;
      return clampAutoPosition(rawX, rawY, width, height);
    }

    return {
      createWindow,
      sourceRelativeWindowPosition,
      focusWin,
      closeWindow,
      toggleMinimise,
      getCascadePosition() {
        return { x: cascadeX, y: cascadeY };
      },
      setCascadePosition(nextX, nextY) {
        cascadeX = Number(nextX) || 0;
        cascadeY = Number(nextY) || 0;
      },
      CASCADE_STEP,
      CASCADE_MAX_X,
      CASCADE_MAX_Y,
    };
  }

  return {
    createWindowShellRuntime,
  };
});
