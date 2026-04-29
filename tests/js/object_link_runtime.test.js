const test = require('node:test');
const assert = require('node:assert/strict');

const runtime = require('../../static/js/object_link_runtime.js');

test('object link runtime resolves linked window positions away from overlapping source windows', () => {
  const linkRuntime = runtime.createObjectLinkRuntime({
    window: { innerWidth: 1280, innerHeight: 720 },
    document: {
      getElementById(id) {
        assert.equal(id, 'src-1');
        return {
          getBoundingClientRect() {
            return { left: 100, top: 100, right: 500, bottom: 400 };
          },
        };
      },
    },
    windowState: new Map([['src-1', { kind: 'generic' }]]),
  });

  const pos = linkRuntime.resolveLinkedWindowPosition({
    sourceWinId: 'src-1',
    x: 140,
    y: 120,
    width: 320,
    height: 240,
  });
  assert.ok(pos.x >= 0);
  assert.ok(pos.y >= 0);
  assert.notDeepEqual(pos, { x: 140, y: 120 });
});

test('object link runtime collects object links from class, superclass, and ivars', () => {
  const linkRuntime = runtime.createObjectLinkRuntime({
    isLeafBasetype(value) {
      return value === 'int';
    },
    shortLabel(text) {
      return String(text);
    },
  });

  const links = linkRuntime.collectObjectLinks({
    classObject: { oop: 1 },
    superclassObject: { oop: 2 },
    instVars: {
      1: [{ inspection: 'value' }, { oop: 3, basetype: 'obj' }],
      2: [{ inspection: 'leaf' }, { oop: 4, basetype: 'int' }],
    },
  }, 3);

  assert.deepEqual(links, [{ type: 'ref', label: 'value' }]);
});

test('object link runtime syncs auto arrows between related object windows', () => {
  const removed = [];
  const drawn = [];
  let redrawn = 0;
  const state = new Map([
    ['w1', {
      kind: 'object',
      object: {
        oop: 11,
        instVars: { 1: [{ inspection: 'child' }, { oop: 22, basetype: 'obj' }] },
      },
    }],
    ['w2', { kind: 'object', object: { oop: 22, instVars: {} } }],
  ]);
  const linkRuntime = runtime.createObjectLinkRuntime({
    windowState: state,
    isLeafBasetype() {
      return false;
    },
    shortLabel(text) {
      return String(text);
    },
    removeArrowsWhere(fn) {
      removed.push(fn({ auto: true, srcWinId: 'w1', dstWinId: 'w0' }));
    },
    drawArrow(src, dst, label, type, options) {
      drawn.push({ src, dst, label, type, auto: options.auto });
    },
    redrawArrows() {
      redrawn += 1;
    },
  });

  linkRuntime.syncObjectWindowArrows('w1');
  assert.equal(removed.length, 1);
  assert.deepEqual(drawn, [{ src: 'w1', dst: 'w2', label: 'child', type: 'ref', auto: true }]);
  assert.equal(redrawn, 1);
});
