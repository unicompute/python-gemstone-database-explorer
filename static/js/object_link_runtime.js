(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ObjectLinkRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createObjectLinkRuntime(deps = {}) {
    const documentNode = deps.document || globalThis.document;
    const windowNode = deps.window || globalThis;

    function shouldDrawManualArrow(sourceWinId) {
      if (!sourceWinId) return false;
      const source = deps.windowState?.get?.(sourceWinId);
      return !source || source.kind !== 'object';
    }

    function clampLinkedWindowPosition(x, y, width = 520, height = 480) {
      const maxX = Math.max(0, windowNode.innerWidth - width - 10);
      const maxY = Math.max(0, windowNode.innerHeight - height - 42);
      return {
        x: Math.max(0, Math.min(Math.round(x), maxX)),
        y: Math.max(0, Math.min(Math.round(y), maxY)),
      };
    }

    function positionLinkedWindowOutsideSource(sourceEl, width = 520, height = 480, seedX, seedY) {
      if (!sourceEl) {
        return (seedX !== undefined && seedY !== undefined)
          ? clampLinkedWindowPosition(seedX, seedY, width, height)
          : {};
      }
      const rect = sourceEl.getBoundingClientRect();
      const gap = 36;
      const fallbackX = seedX !== undefined ? seedX : rect.left + 28;
      const fallbackY = seedY !== undefined ? seedY : rect.top + 28;
      const candidates = [
        { x: rect.right + gap, y: fallbackY },
        { x: rect.left - width - gap, y: fallbackY },
        { x: fallbackX, y: rect.bottom + gap },
        { x: fallbackX, y: rect.top - height - gap },
      ];

      let best = null;
      let bestScore = -Infinity;
      for (const candidate of candidates) {
        const clamped = clampLinkedWindowPosition(candidate.x, candidate.y, width, height);
        const overflowPenalty = Math.abs(candidate.x - clamped.x) + Math.abs(candidate.y - clamped.y);
        const overlapsHorizontally = clamped.x < rect.right && clamped.x + width > rect.left;
        const overlapsVertically = clamped.y < rect.bottom && clamped.y + height > rect.top;
        const overlapPenalty = overlapsHorizontally && overlapsVertically ? 100000 : 0;
        const score = -(overflowPenalty + overlapPenalty);
        if (score > bestScore) {
          bestScore = score;
          best = clamped;
        }
      }
      return best || clampLinkedWindowPosition(fallbackX, fallbackY, width, height);
    }

    function resolveLinkedWindowPosition({ sourceWinId, x, y, width = 520, height = 480 }) {
      const sourceEl = sourceWinId ? documentNode.getElementById?.(sourceWinId) : null;
      const manualArrow = shouldDrawManualArrow(sourceWinId);
      if (!sourceEl) {
        return (x !== undefined && y !== undefined)
          ? clampLinkedWindowPosition(x, y, width, height)
          : {};
      }
      if (x === undefined || y === undefined) {
        return manualArrow
          ? positionLinkedWindowOutsideSource(sourceEl, width, height, x, y)
          : {};
      }
      const sourceRect = sourceEl.getBoundingClientRect();
      const overlapX = Math.max(0, Math.min(x + width, sourceRect.right) - Math.max(x, sourceRect.left));
      const overlapY = Math.max(0, Math.min(y + height, sourceRect.bottom) - Math.max(y, sourceRect.top));
      const overlapArea = overlapX * overlapY;
      const minVisibleThreshold = width * height * 0.08;
      if (manualArrow && overlapArea > minVisibleThreshold) {
        return positionLinkedWindowOutsideSource(sourceEl, width, height, x, y);
      }
      return clampLinkedWindowPosition(x, y, width, height);
    }

    function openLinkedObjectWindow({ oop, text, sourceWinId, arrowType = 'ref', arrowLabel = '', x, y }) {
      if (!oop) return null;
      const pos = resolveLinkedWindowPosition({ sourceWinId, x, y });
      const newWin = deps.openObjectBrowser?.(oop, text, pos.x, pos.y) || null;
      if (sourceWinId && newWin && shouldDrawManualArrow(sourceWinId)) {
        deps.drawArrow?.(sourceWinId, newWin.id, arrowLabel, arrowType);
      }
      return newWin;
    }

    function attachObjectButtonBehavior(el, { oop, text, sourceWinId, arrowType = 'ref', arrowLabel = '' } = {}) {
      if (!el || !oop) return el;
      el.dataset.objButton = '1';
      el.draggable = true;
      el.addEventListener('click', event => {
        event.stopPropagation();
        openLinkedObjectWindow({ oop, text, sourceWinId, arrowType, arrowLabel });
      });
      el.addEventListener('dragstart', event => {
        el.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('text/plain', JSON.stringify({
          oop,
          text,
          srcWinId: sourceWinId,
          arrowType,
          arrowLabel,
        }));
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      return el;
    }

    function collectObjectLinks(obj, targetOop) {
      if (!obj || targetOop == null) return [];
      const links = [];
      const pushLink = (type, label = '') => {
        const cleanLabel = deps.shortLabel?.(label, 48) || '';
        if (!links.some(link => link.type === type && link.label === cleanLabel)) {
          links.push({ type, label: cleanLabel });
        }
      };

      if (obj.classObject?.oop === targetOop) pushLink('class');
      if (obj.superclassObject?.oop === targetOop) pushLink('superclass');

      for (const [idx, pair] of Object.entries(obj.instVars || {})) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const [nameValue, value] = pair;
        const keyText = deps.shortLabel?.(nameValue?.inspection || idx, 24) || idx;

        if (obj.basetype === 'hash') {
          if (nameValue?.oop === targetOop && !deps.isLeafBasetype?.(nameValue?.basetype)) {
            pushLink('ref', `key ${keyText}`);
          }
          if (value?.oop === targetOop && !deps.isLeafBasetype?.(value?.basetype)) {
            pushLink('ref', keyText);
          }
          continue;
        }

        if (value?.oop === targetOop && !deps.isLeafBasetype?.(value?.basetype)) {
          pushLink('ref', keyText);
        }
      }
      return links;
    }

    function syncObjectWindowArrows(winId) {
      deps.removeArrowsWhere?.(arrow => arrow.auto && (arrow.srcWinId === winId || arrow.dstWinId === winId));

      const source = deps.windowState?.get?.(winId);
      if (!source || source.kind !== 'object' || !source.object?.oop) {
        deps.redrawArrows?.();
        return;
      }

      for (const [otherId, other] of deps.windowState?.entries?.() || []) {
        if (otherId === winId || other.kind !== 'object' || !other.object?.oop) continue;
        for (const link of collectObjectLinks(source.object, other.object.oop)) {
          deps.drawArrow?.(winId, otherId, link.label, link.type, { auto: true });
        }
        for (const link of collectObjectLinks(other.object, source.object.oop)) {
          deps.drawArrow?.(otherId, winId, link.label, link.type, { auto: true });
        }
      }

      deps.redrawArrows?.();
    }

    function bindDesktopDrop() {
      deps.desktop?.addEventListener?.('dragover', event => event.preventDefault());
      deps.desktop?.addEventListener?.('drop', event => {
        event.preventDefault();
        try {
          const data = JSON.parse(event.dataTransfer.getData('text/plain'));
          if (!data.oop) return;
          openLinkedObjectWindow({
            oop: data.oop,
            text: data.text,
            sourceWinId: data.srcWinId,
            arrowType: data.arrowType || 'ref',
            arrowLabel: data.arrowLabel || '',
            x: event.clientX - 200,
            y: event.clientY - 20,
          });
        } catch (_) {
          // ignore malformed drops
        }
      });
    }

    return {
      shouldDrawManualArrow,
      clampLinkedWindowPosition,
      positionLinkedWindowOutsideSource,
      resolveLinkedWindowPosition,
      openLinkedObjectWindow,
      attachObjectButtonBehavior,
      collectObjectLinks,
      syncObjectWindowArrows,
      bindDesktopDrop,
    };
  }

  return {
    createObjectLinkRuntime,
  };
});
