const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/window_arrow_runtime.js');

function createSvgNode(tagName) {
  return {
    tagName,
    attributes: {},
    children: [],
    textContent: '',
    parentNode: null,
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    querySelector(selector) {
      return this.children.find(child => child.tagName === selector) || null;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    getAttribute(name) {
      return this.attributes[name];
    },
    remove() {
      this.removed = true;
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    },
  };
}

test('window arrow runtime draws, dedupes, and removes arrows', () => {
  const arrowCanvas = createSvgNode('svg');
  arrowCanvas.getBoundingClientRect = () => ({ left: 0, top: 0 });
  const src = { getBoundingClientRect: () => ({ left: 10, top: 10, width: 80, height: 40 }) };
  const dst = { getBoundingClientRect: () => ({ left: 200, top: 120, width: 80, height: 40 }) };

  const arrowRuntime = runtime.createWindowArrowRuntime({
    arrowCanvas,
    document: {
      createElementNS(_ns, tagName) {
        return createSvgNode(tagName);
      },
      getElementById(id) {
        if (id === 'src') return src;
        if (id === 'dst') return dst;
        return null;
      },
    },
    shortLabel(text) {
      return String(text);
    },
  });

  const first = arrowRuntime.drawArrow('src', 'dst', 'link', 'ref');
  const second = arrowRuntime.drawArrow('src', 'dst', 'link', 'ref');

  assert.equal(first, second);
  assert.equal(arrowRuntime.getArrows().length, 1);
  assert.equal(first.path.getAttribute('marker-end'), 'url(#arr-head)');
  assert.ok(first.path.getAttribute('d').startsWith('M'));

  arrowRuntime.removeArrowsFor('src');
  assert.equal(arrowRuntime.getArrows().length, 0);
  assert.equal(first.g.removed, true);
});

test('window arrow runtime positions label text for sibling arrows', () => {
  const arrowCanvas = createSvgNode('svg');
  arrowCanvas.getBoundingClientRect = () => ({ left: 0, top: 0 });
  const src = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 30 }) };
  const dst = { getBoundingClientRect: () => ({ left: 220, top: 160, width: 100, height: 30 }) };

  const arrowRuntime = runtime.createWindowArrowRuntime({
    arrowCanvas,
    document: {
      createElementNS(_ns, tagName) {
        return createSvgNode(tagName);
      },
      getElementById(id) {
        if (id === 'left') return src;
        if (id === 'right') return dst;
        return null;
      },
    },
    shortLabel(text) {
      return String(text);
    },
  });

  const a = arrowRuntime.drawArrow('left', 'right', 'first', 'ref');
  const b = arrowRuntime.drawArrow('left', 'right', 'second', 'ref');
  arrowRuntime.redrawArrows();

  assert.notEqual(a.path.getAttribute('d'), b.path.getAttribute('d'));
  assert.equal(typeof a.txt.getAttribute('x'), 'number');
  assert.equal(typeof b.txt.getAttribute('y'), 'number');
});
