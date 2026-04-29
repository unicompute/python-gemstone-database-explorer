(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WindowArrowRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createSvgNode(documentNode, tagName) {
    return documentNode.createElementNS('http://www.w3.org/2000/svg', tagName);
  }

  function createWindowArrowRuntime(deps = {}) {
    const documentNode = deps.document || globalThis.document;
    const arrowCanvas = deps.arrowCanvas || documentNode?.getElementById?.('arrow-canvas') || null;
    const arrows = [];

    function updateArrow(entry) {
      const sw = documentNode?.getElementById?.(entry.srcWinId);
      const dw = documentNode?.getElementById?.(entry.dstWinId);
      if (!sw || !dw || !arrowCanvas) {
        entry.g?.remove?.();
        return;
      }
      const sr = sw.getBoundingClientRect();
      const dr = dw.getBoundingClientRect();
      const cr = arrowCanvas.getBoundingClientRect();
      const sx = sr.left - cr.left + sr.width / 2;
      const sy = sr.top - cr.top + sr.height;
      const dx = dr.left - cr.left + dr.width / 2;
      const dy = dr.top - cr.top;
      const siblings = arrows.filter(
        arrow => arrow.srcWinId === entry.srcWinId && arrow.dstWinId === entry.dstWinId
      );
      const siblingIndex = siblings.indexOf(entry);
      const spread = (siblingIndex - (siblings.length - 1) / 2) * 24;
      const cx1 = sx + spread;
      const cy1 = sy + 40;
      const cx2 = dx + spread;
      const cy2 = dy - 40;
      entry.path.setAttribute('d', `M${sx},${sy} C${cx1},${cy1} ${cx2},${cy2} ${dx},${dy}`);
      if (entry.txt) {
        const mx = (sx + dx) / 2 + spread * 0.35;
        const my = (sy + dy) / 2 - 6 - Math.abs(spread) * 0.15;
        entry.txt.setAttribute('x', mx);
        entry.txt.setAttribute('y', my);
        entry.txt.setAttribute('text-anchor', 'middle');
      }
    }

    function drawArrow(srcWinId, dstWinId, label = '', type = 'ref', { auto = false } = {}) {
      if (!arrowCanvas || !documentNode) return null;
      const cleanLabel = deps.shortLabel?.(label, 48) || String(label || '');
      const existing = arrows.find(
        arrow =>
          arrow.srcWinId === srcWinId &&
          arrow.dstWinId === dstWinId &&
          arrow.type === type &&
          arrow.label === cleanLabel &&
          arrow.auto === auto
      );
      if (existing) return existing;

      const g = createSvgNode(documentNode, 'g');
      const path = createSvgNode(documentNode, 'path');
      const colors = {
        ref: '#6c7086',
        class: '#9b59bb',
        superclass: '#346789',
        error: '#c50b0b',
      };
      const color = colors[type] || '#6c7086';
      const markerMap = {
        ref: 'arr-head',
        class: 'arr-head',
        superclass: 'arr-head-blue',
        error: 'arr-head-red',
      };
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', type === 'superclass' ? '2' : '1.5');
      path.setAttribute('fill', 'none');
      if (type !== 'superclass') path.setAttribute('stroke-dasharray', '6 3');
      path.setAttribute('marker-end', `url(#${markerMap[type] || 'arr-head'})`);
      g.appendChild(path);

      let txt = null;
      if (cleanLabel) {
        txt = createSvgNode(documentNode, 'text');
        txt.setAttribute('fill', color);
        txt.setAttribute('font-size', '9');
        txt.setAttribute('font-family', 'monospace');
        txt.textContent = cleanLabel;
        g.appendChild(txt);
      }

      arrowCanvas.appendChild(g);
      const entry = { srcWinId, dstWinId, label: cleanLabel, type, auto, g, path, txt };
      arrows.push(entry);
      updateArrow(entry);
      return entry;
    }

    function redrawArrows() {
      arrows.forEach(updateArrow);
    }

    function removeArrowsWhere(predicate) {
      for (let index = arrows.length - 1; index >= 0; index -= 1) {
        if (predicate(arrows[index])) {
          arrows[index].g?.remove?.();
          arrows.splice(index, 1);
        }
      }
    }

    function removeArrowsFor(winId) {
      removeArrowsWhere(arrow => arrow.srcWinId === winId || arrow.dstWinId === winId);
    }

    function getArrows() {
      return arrows;
    }

    return {
      drawArrow,
      redrawArrows,
      removeArrowsWhere,
      removeArrowsFor,
      getArrows,
    };
  }

  return {
    createWindowArrowRuntime,
  };
});
