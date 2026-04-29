(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DockSurfaceRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createDockSurfaceRuntime(deps = {}) {
    const documentNode = deps.document || globalThis.document;
    const windowNode = deps.window || globalThis;
    const taskbarWindowTypeButtons = Array.isArray(deps.taskbarWindowTypeButtons) ? deps.taskbarWindowTypeButtons : [];
    const dockContextMenu = deps.dockContextMenu || null;
    const dockWindowPreview = deps.dockWindowPreview || null;

    let dockContextMenuState = null;
    let dockWindowPreviewState = null;
    let dockWindowPreviewHideTimer = 0;

    function getTaskbarWindowKinds(btn) {
      return String(btn?.dataset?.windowKinds || '')
        .split(',')
        .map(kind => kind.trim())
        .filter(Boolean);
    }

    function getManagedWindowsByKinds(kinds = []) {
      const kindSet = new Set((Array.isArray(kinds) ? kinds : []).map(kind => String(kind || '').trim()).filter(Boolean));
      if (!kindSet.size) return [];
      return deps.getOrderedManagedWindows().filter(win => {
        const state = deps.readWindowState(win.id) || {};
        return kindSet.has(String(state.kind || '').trim());
      });
    }

    function buildTaskbarWindowTypeStatusBadge(btn) {
      const kinds = getTaskbarWindowKinds(btn);
      if (kinds.includes('debugger')) {
        const count = deps.getHaltedThreadCount?.() || 0;
        if (count > 0) return { text: String(count), title: `${count} halted thread${count === 1 ? '' : 's'}`, tone: 'error' };
      }
      if (kinds.includes('status-log')) {
        const count = deps.getStatusErrorCount?.() || 0;
        if (count > 0) return { text: String(count), title: `${count} status error${count === 1 ? '' : 's'}`, tone: 'error' };
      }
      return null;
    }

    function clearDockWindowPreviewHideTimer() {
      if (!dockWindowPreviewHideTimer) return;
      clearTimeout(dockWindowPreviewHideTimer);
      dockWindowPreviewHideTimer = 0;
    }

    function getDockWindowPreviewTriggerButton() {
      const buttonId = String(dockWindowPreviewState?.buttonId || '').trim();
      return buttonId ? documentNode.getElementById(buttonId) : null;
    }

    function isDockWindowPreviewOpen() {
      return !!dockWindowPreviewState?.open;
    }

    function buildDockWindowPreviewState(btn, position = {}) {
      if (!btn) return null;
      const baseLabel = String(btn.dataset.baseLabel || btn.textContent || 'Window').trim() || 'Window';
      const kinds = getTaskbarWindowKinds(btn);
      const matchingWindows = getManagedWindowsByKinds(kinds);
      if (!matchingWindows.length) return null;
      const rect = btn.getBoundingClientRect();
      return {
        open: true,
        buttonId: btn.id,
        left: Number.isFinite(Number(position.left)) ? Number(position.left) : rect.left,
        top: Number.isFinite(Number(position.top)) ? Number(position.top) : (rect.top - 8),
        title: baseLabel,
        summary: `${matchingWindows.length} open window${matchingWindows.length === 1 ? '' : 's'}`,
        windows: matchingWindows.map((win, index) => ({
          id: win.id,
          title: win.querySelector('.win-title')?.textContent?.trim() || baseLabel,
          description: `${baseLabel} ${index + 1}`,
          meta: win.classList.contains('focused') ? 'Focused' : (win.dataset.minimised === '1' ? 'Minimised' : 'Open'),
          active: win.classList.contains('focused'),
        })),
      };
    }

    function positionDockWindowPreview(left, top) {
      if (!dockWindowPreview) return;
      const width = dockWindowPreview.offsetWidth || 300;
      const height = dockWindowPreview.offsetHeight || 200;
      const clampedLeft = Math.max(8, Math.min(Math.round(left || 0), windowNode.innerWidth - width - 8));
      const clampedTop = Math.max(8, Math.min(Math.round(top || 0), windowNode.innerHeight - height - 48));
      dockWindowPreview.style.left = `${clampedLeft}px`;
      dockWindowPreview.style.top = `${clampedTop}px`;
    }

    function renderDockWindowPreview() {
      if (!dockWindowPreview) return;
      if (!dockWindowPreviewState?.open) {
        dockWindowPreview.innerHTML = '';
        deps.applyDockWindowPreviewState(dockWindowPreview, false);
        return;
      }
      const triggerBtn = getDockWindowPreviewTriggerButton();
      if (!triggerBtn || triggerBtn.style.display === 'none') {
        dockWindowPreviewState = null;
        dockWindowPreview.innerHTML = '';
        deps.applyDockWindowPreviewState(dockWindowPreview, false);
        return;
      }
      dockWindowPreviewState = buildDockWindowPreviewState(triggerBtn, dockWindowPreviewState);
      if (!dockWindowPreviewState) {
        dockWindowPreview.innerHTML = '';
        deps.applyDockWindowPreviewState(dockWindowPreview, false);
        return;
      }
      dockWindowPreview.innerHTML = deps.buildDockWindowPreviewHtml(dockWindowPreviewState);
      deps.applyDockWindowPreviewState(dockWindowPreview, true);
      positionDockWindowPreview(dockWindowPreviewState.left, dockWindowPreviewState.top);
    }

    function closeDockWindowPreview() {
      clearDockWindowPreviewHideTimer();
      if (!isDockWindowPreviewOpen()) return;
      dockWindowPreviewState = null;
      renderDockWindowPreview();
    }

    function scheduleDockWindowPreviewClose() {
      clearDockWindowPreviewHideTimer();
      dockWindowPreviewHideTimer = setTimeout(() => {
        dockWindowPreviewHideTimer = 0;
        closeDockWindowPreview();
      }, 140);
    }

    function openDockWindowPreview(btn) {
      if (!btn) return;
      clearDockWindowPreviewHideTimer();
      const rect = btn.getBoundingClientRect();
      dockWindowPreviewState = buildDockWindowPreviewState(btn, { left: rect.left, top: rect.top - 8 });
      if (!dockWindowPreviewState) {
        closeDockWindowPreview();
        return;
      }
      renderDockWindowPreview();
    }

    function getDockContextMenuTriggerButton() {
      const buttonId = String(dockContextMenuState?.buttonId || '').trim();
      return buttonId ? documentNode.getElementById(buttonId) : null;
    }

    function isDockContextMenuOpen() {
      return !!dockContextMenuState?.open;
    }

    function raiseTaskbarWindowKinds(kinds = []) {
      const windows = getManagedWindowsByKinds(kinds);
      if (!windows.length) return false;
      const seed = windows.find(win => win.classList.contains('focused'))?.id || windows[windows.length - 1]?.id || null;
      return deps.raiseWindowGroupByIds(windows.map(win => win.id), seed);
    }

    function closeTaskbarWindowKinds(kinds = []) {
      const windows = getManagedWindowsByKinds(kinds);
      if (!windows.length) return false;
      return deps.closeWindowGroupByIds(windows.map(win => win.id));
    }

    function buildDockContextMenuState(btn, position = {}) {
      if (!btn) return null;
      const baseLabel = String(btn.dataset.baseLabel || btn.textContent || 'Window').trim() || 'Window';
      const kinds = getTaskbarWindowKinds(btn);
      const matchingWindows = getManagedWindowsByKinds(kinds);
      const count = matchingWindows.length;
      const launchCommand = String(btn.dataset.launchCommand || '').trim();
      const rect = btn.getBoundingClientRect();
      return {
        open: true,
        buttonId: btn.id,
        left: Number.isFinite(Number(position.left)) ? Number(position.left) : rect.left,
        top: Number.isFinite(Number(position.top)) ? Number(position.top) : rect.top - 8,
        title: baseLabel,
        summary: `${count} open window${count === 1 ? '' : 's'}`,
        actions: [
          { command: 'open-another', label: 'Open Another', description: launchCommand ? `Launch another ${baseLabel} window` : `No launcher available for ${baseLabel}`, disabled: !launchCommand },
          { command: 'raise-all', label: 'Raise All', description: count ? `Bring all ${count} ${baseLabel} window${count === 1 ? '' : 's'} forward` : `No open ${baseLabel} windows`, disabled: !count },
          { command: 'close-all', label: 'Close All', description: count ? `Close all ${count} ${baseLabel} window${count === 1 ? '' : 's'}` : `No open ${baseLabel} windows`, disabled: !count, destructive: true },
        ],
        launchCommand,
        kinds,
      };
    }

    function positionDockContextMenu(left, top) {
      if (!dockContextMenu) return;
      const width = dockContextMenu.offsetWidth || 260;
      const height = dockContextMenu.offsetHeight || 180;
      const clampedLeft = Math.max(8, Math.min(Math.round(left || 0), windowNode.innerWidth - width - 8));
      const clampedTop = Math.max(8, Math.min(Math.round(top || 0), windowNode.innerHeight - height - 48));
      dockContextMenu.style.left = `${clampedLeft}px`;
      dockContextMenu.style.top = `${clampedTop}px`;
    }

    function renderDockContextMenu() {
      if (!dockContextMenu) return;
      if (!dockContextMenuState?.open) {
        dockContextMenu.innerHTML = '';
        deps.applyDockContextMenuState(dockContextMenu, false);
        return;
      }
      const triggerBtn = getDockContextMenuTriggerButton();
      if (!triggerBtn || triggerBtn.style.display === 'none') {
        dockContextMenuState = null;
        dockContextMenu.innerHTML = '';
        deps.applyDockContextMenuState(dockContextMenu, false);
        return;
      }
      dockContextMenuState = buildDockContextMenuState(triggerBtn, dockContextMenuState);
      if (!dockContextMenuState) return;
      dockContextMenu.innerHTML = deps.buildDockContextMenuHtml(dockContextMenuState);
      deps.applyDockContextMenuState(dockContextMenu, true);
      positionDockContextMenu(dockContextMenuState.left, dockContextMenuState.top);
    }

    function closeDockContextMenu() {
      if (!isDockContextMenuOpen()) return;
      dockContextMenuState = null;
      renderDockContextMenu();
    }

    function openDockContextMenu(btn, position = {}) {
      if (!btn) return;
      closeDockWindowPreview();
      dockContextMenuState = buildDockContextMenuState(btn, position);
      deps.setDockLauncherOpen(false);
      renderDockContextMenu();
    }

    function focusTaskbarWindowKindButton(btn) {
      if (!btn) return false;
      const kinds = getTaskbarWindowKinds(btn);
      const windows = getManagedWindowsByKinds(kinds);
      if (!windows.length) {
        const launchCommand = String(btn.dataset.launchCommand || '').trim();
        return launchCommand ? deps.runDockLauncherCommand(launchCommand) : false;
      }
      const focusedIndex = windows.findIndex(win => win.classList.contains('focused'));
      const target = focusedIndex >= 0 ? windows[(focusedIndex + 1) % windows.length] : windows[windows.length - 1];
      return deps.revealWindow(target);
    }

    function renderTaskbarWindowTypeButtons() {
      if (!taskbarWindowTypeButtons.length) return;
      taskbarWindowTypeButtons.forEach(btn => {
        const kinds = getTaskbarWindowKinds(btn);
        const matchingWindows = getManagedWindowsByKinds(kinds);
        const visible = matchingWindows.length > 0;
        const baseLabel = btn.dataset.baseLabel || btn.textContent?.trim() || 'Window';
        const labelEl = btn.querySelector('.taskbar-btn-label');
        const countEl = btn.querySelector('.taskbar-btn-count');
        const statusBadgeEl = btn.querySelector('.taskbar-btn-status-badge');
        const statusBadge = buildTaskbarWindowTypeStatusBadge(btn);
        if (labelEl) labelEl.textContent = baseLabel;
        if (countEl) countEl.textContent = String(matchingWindows.length);
        if (statusBadgeEl) {
          if (statusBadge) {
            statusBadgeEl.textContent = statusBadge.text;
            statusBadgeEl.title = statusBadge.title || '';
            statusBadgeEl.dataset.tone = statusBadge.tone || 'error';
            statusBadgeEl.classList.add('visible');
          } else {
            statusBadgeEl.textContent = '';
            statusBadgeEl.title = '';
            statusBadgeEl.dataset.tone = '';
            statusBadgeEl.classList.remove('visible');
          }
        }
        btn.title = visible
          ? `${baseLabel}: ${matchingWindows.length} open window${matchingWindows.length === 1 ? '' : 's'}${statusBadge ? ` · ${statusBadge.title}` : ''}`
          : '';
        btn.style.display = visible ? '' : 'none';
        btn.classList.toggle('active', matchingWindows.some(win => win.classList.contains('focused')));
      });
      if (isDockContextMenuOpen()) renderDockContextMenu();
      if (isDockWindowPreviewOpen()) renderDockWindowPreview();
    }

    function initialise() {
      taskbarWindowTypeButtons.forEach(btn => {
        if (!btn.querySelector('.taskbar-btn-status-badge')) {
          const badge = documentNode.createElement('span');
          badge.className = 'taskbar-btn-status-badge';
          badge.setAttribute('aria-hidden', 'true');
          btn.appendChild(badge);
        }
        btn.addEventListener('click', event => {
          event.preventDefault();
          closeDockContextMenu();
          closeDockWindowPreview();
          focusTaskbarWindowKindButton(btn);
        });
      });

      deps.bindDockContextMenuActions({
        menu: dockContextMenu,
        documentNode,
        triggerButtons: taskbarWindowTypeButtons,
      }, {
        isOpen() {
          return isDockContextMenuOpen();
        },
        onOpen(btn, event) {
          event.preventDefault?.();
          openDockContextMenu(btn, { left: event.clientX, top: event.clientY });
        },
        onCommand(command) {
          if (!dockContextMenuState) return;
          switch (command) {
            case 'open-another':
              if (dockContextMenuState.launchCommand) deps.runDockLauncherCommand(dockContextMenuState.launchCommand);
              break;
            case 'raise-all':
              raiseTaskbarWindowKinds(dockContextMenuState.kinds);
              break;
            case 'close-all':
              closeTaskbarWindowKinds(dockContextMenuState.kinds);
              break;
            default:
              return;
          }
          closeDockContextMenu();
        },
        onClose() {
          closeDockContextMenu();
        },
        onEscape(event) {
          event.preventDefault?.();
          closeDockContextMenu();
        },
      });

      deps.bindDockWindowPreviewActions({
        preview: dockWindowPreview,
        documentNode,
        triggerButtons: taskbarWindowTypeButtons,
      }, {
        isOpen() {
          return isDockWindowPreviewOpen();
        },
        onTriggerEnter(btn) {
          if (isDockContextMenuOpen()) return;
          if (deps.isDockLauncherOpen()) deps.setDockLauncherOpen(false);
          openDockWindowPreview(btn);
        },
        onTriggerLeave() {
          scheduleDockWindowPreviewClose();
        },
        onPreviewEnter() {
          clearDockWindowPreviewHideTimer();
        },
        onPreviewLeave() {
          scheduleDockWindowPreviewClose();
        },
        onWindowClick(windowId) {
          const win = documentNode.getElementById(String(windowId || ''));
          if (win) deps.revealWindow(win);
          closeDockWindowPreview();
        },
        onClose() {
          closeDockWindowPreview();
        },
        onEscape(event) {
          event.preventDefault?.();
          closeDockWindowPreview();
        },
      });
    }

    return {
      initialise,
      getTaskbarWindowKinds,
      getManagedWindowsByKinds,
      renderTaskbarWindowTypeButtons,
      closeDockContextMenu,
      closeDockWindowPreview,
      isDockContextMenuOpen,
    };
  }

  return {
    createDockSurfaceRuntime,
  };
});
