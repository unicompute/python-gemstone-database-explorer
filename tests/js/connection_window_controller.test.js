const test = require('node:test');
const assert = require('node:assert/strict');

const controller = require('../../static/js/connection_window_controller.js');

class FakeButton {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.style = {};
    this.disabled = false;
    this.textContent = '';
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  async trigger(type = 'click') {
    const handler = this.listeners.get(type);
    if (!handler) return;
    return handler({currentTarget: this});
  }
}

function makeCards(selectorMap) {
  return {
    querySelectorAll(selector) {
      return selectorMap[selector] || [];
    },
  };
}

test('bindConnectionWindowToolbarActions wires top-level buttons to handlers', async () => {
  let retried = 0;
  let refreshed = 0;
  let copied = 0;
  const retryBtn = new FakeButton();
  const refreshBtn = new FakeButton();
  const copyBtn = new FakeButton();

  controller.bindConnectionWindowToolbarActions({
    retryBtn,
    refreshBtn,
    copyBtn,
  }, {
    retryStartup() { retried += 1; },
    refreshConnection() { refreshed += 1; },
    copyConnectionJson() { copied += 1; },
  });

  await retryBtn.trigger();
  await refreshBtn.trigger();
  await copyBtn.trigger();

  assert.equal(retried, 1);
  assert.equal(refreshed, 1);
  assert.equal(copied, 1);
});

test('applyConnectionWindowToolbarState updates visibility, labels, and disabled state', () => {
  const buttons = {
    retryBtn: new FakeButton(),
    favoriteTargetBtn: new FakeButton(),
    clearFavoritesBtn: new FakeButton(),
    copyFixBtn: new FakeButton(),
  };

  controller.applyConnectionWindowToolbarState(buttons, {
    retryVisible: true,
    favoriteTargetVisible: true,
    favoriteTargetLabel: 'Rename Favorite',
    favoriteTargetDisabled: true,
    clearFavoritesVisible: false,
    clearFavoritesDisabled: true,
    copyFixDisabled: true,
  });

  assert.equal(buttons.retryBtn.style.display, '');
  assert.equal(buttons.favoriteTargetBtn.style.display, '');
  assert.equal(buttons.favoriteTargetBtn.textContent, 'Rename Favorite');
  assert.equal(buttons.favoriteTargetBtn.disabled, true);
  assert.equal(buttons.clearFavoritesBtn.style.display, 'none');
  assert.equal(buttons.clearFavoritesBtn.disabled, true);
  assert.equal(buttons.copyFixBtn.disabled, true);
});

test('bindConnectionWindowCardActions normalizes datasets and routes them to handlers', async () => {
  const seen = [];
  const cards = makeCards({
    '.connection-check-view-btn': [new FakeButton({checkViewMode: 'STALE'})],
    '.connection-favorite-override-btn': [new FakeButton({favoriteIndex: '2'})],
    '.connection-local-stone-btn': [new FakeButton({stoneName: ' seaside '})],
    '.connection-clear-checks-btn': [new FakeButton()],
  });

  controller.bindConnectionWindowCardActions({
    cards,
    normalizeConnectionCheckViewMode: mode => String(mode || '').trim().toLowerCase(),
    handlers: {
      onCheckViewMode(mode) { seen.push(['mode', mode]); },
      onFavoriteOverride(index) { seen.push(['favorite', index]); },
      onLocalStone(stone) { seen.push(['stone', stone]); },
      onClearChecks() { seen.push(['clear']); },
    },
  });

  await cards.querySelectorAll('.connection-check-view-btn')[0].trigger();
  await cards.querySelectorAll('.connection-favorite-override-btn')[0].trigger();
  await cards.querySelectorAll('.connection-local-stone-btn')[0].trigger();
  await cards.querySelectorAll('.connection-clear-checks-btn')[0].trigger();

  assert.deepEqual(seen, [
    ['mode', 'stale'],
    ['favorite', 2],
    ['stone', 'seaside'],
    ['clear'],
  ]);
});
