(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ConnectionWindowController = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function bindEvent(node, type, handler) {
    if (!node || typeof node.addEventListener !== 'function' || typeof handler !== 'function') return;
    node.addEventListener(type, handler);
  }

  function forEachQuery(root, selector, handler) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll(selector).forEach(node => handler(node));
  }

  function datasetNumber(event, key) {
    return Number(event?.currentTarget?.dataset?.[key]);
  }

  function datasetString(event, key) {
    return String(event?.currentTarget?.dataset?.[key] || '').trim();
  }

  function bindConnectionWindowToolbarActions(buttons = {}, handlers = {}) {
    bindEvent(buttons.retryBtn, 'click', handlers.retryStartup);
    bindEvent(buttons.applyOverrideBtn, 'click', handlers.applySuggestedOverride);
    bindEvent(buttons.saveSuggestedFavoriteBtn, 'click', handlers.saveSuggestedOverrideAsFavorite);
    bindEvent(buttons.editOverrideBtn, 'click', handlers.editOverride);
    bindEvent(buttons.favoriteTargetBtn, 'click', handlers.toggleFavoriteCurrentTarget);
    bindEvent(buttons.importProfilesBtn, 'click', handlers.importConnectionProfilesFromModal);
    bindEvent(buttons.replaceProfilesBtn, 'click', handlers.replaceConnectionProfilesFromModal);
    bindEvent(buttons.clearFavoritesBtn, 'click', handlers.clearFavoriteProfilesWithConfirm);
    bindEvent(buttons.clearRecentsBtn, 'click', handlers.clearRecentTargetsWithConfirm);
    bindEvent(buttons.clearLastWorkingBtn, 'click', handlers.clearLastWorkingTargetWithConfirm);
    bindEvent(buttons.clearOverrideBtn, 'click', handlers.clearOverrideAndRefresh);
    bindEvent(buttons.refreshBtn, 'click', handlers.refreshConnection);
    bindEvent(buttons.copyFixBtn, 'click', handlers.copyFixShell);
    bindEvent(buttons.copyProfilesBtn, 'click', handlers.copyConnectionProfiles);
    bindEvent(buttons.downloadProfilesBtn, 'click', handlers.downloadConnectionProfiles);
    bindEvent(buttons.copyBtn, 'click', handlers.copyConnectionJson);
    bindEvent(buttons.downloadBtn, 'click', handlers.downloadConnectionJson);
  }

  function applyConnectionWindowToolbarState(buttons = {}, state = {}) {
    if (buttons.retryBtn) buttons.retryBtn.style.display = state.retryVisible ? '' : 'none';
    if (buttons.applyOverrideBtn) buttons.applyOverrideBtn.style.display = state.applyOverrideVisible ? '' : 'none';
    if (buttons.saveSuggestedFavoriteBtn) buttons.saveSuggestedFavoriteBtn.style.display = state.saveSuggestedFavoriteVisible ? '' : 'none';
    if (buttons.clearOverrideBtn) buttons.clearOverrideBtn.style.display = state.clearOverrideVisible ? '' : 'none';
    if (buttons.favoriteTargetBtn) {
      buttons.favoriteTargetBtn.style.display = state.favoriteTargetVisible ? '' : 'none';
      buttons.favoriteTargetBtn.textContent = state.favoriteTargetLabel || 'Save Target';
      buttons.favoriteTargetBtn.disabled = !!state.favoriteTargetDisabled;
    }
    if (buttons.clearFavoritesBtn) buttons.clearFavoritesBtn.style.display = state.clearFavoritesVisible ? '' : 'none';
    if (buttons.clearRecentsBtn) buttons.clearRecentsBtn.style.display = state.clearRecentsVisible ? '' : 'none';
    if (buttons.clearLastWorkingBtn) buttons.clearLastWorkingBtn.style.display = state.clearLastWorkingVisible ? '' : 'none';
    if (buttons.applyOverrideBtn) buttons.applyOverrideBtn.disabled = !!state.applyOverrideDisabled;
    if (buttons.saveSuggestedFavoriteBtn) buttons.saveSuggestedFavoriteBtn.disabled = !!state.saveSuggestedFavoriteDisabled;
    if (buttons.editOverrideBtn) buttons.editOverrideBtn.disabled = !!state.editOverrideDisabled;
    if (buttons.replaceProfilesBtn) buttons.replaceProfilesBtn.disabled = !!state.replaceProfilesDisabled;
    if (buttons.clearFavoritesBtn) buttons.clearFavoritesBtn.disabled = !!state.clearFavoritesDisabled;
    if (buttons.clearRecentsBtn) buttons.clearRecentsBtn.disabled = !!state.clearRecentsDisabled;
    if (buttons.clearLastWorkingBtn) buttons.clearLastWorkingBtn.disabled = !!state.clearLastWorkingDisabled;
    if (buttons.clearOverrideBtn) buttons.clearOverrideBtn.disabled = !!state.clearOverrideDisabled;
    if (buttons.copyFixBtn) buttons.copyFixBtn.disabled = !!state.copyFixDisabled;
  }

  function bindConnectionWindowCardActions(options = {}) {
    const cards = options.cards;
    const handlers = options.handlers || {};
    const normalizeConnectionCheckViewMode = typeof options.normalizeConnectionCheckViewMode === 'function'
      ? options.normalizeConnectionCheckViewMode
      : value => String(value || '').trim();

    forEachQuery(cards, '.connection-check-view-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onCheckViewMode?.(normalizeConnectionCheckViewMode(event?.currentTarget?.dataset?.checkViewMode)));
    });
    forEachQuery(cards, '.connection-favorite-override-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onFavoriteOverride?.(datasetNumber(event, 'favoriteIndex')));
    });
    forEachQuery(cards, '.connection-rename-favorite-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onRenameFavorite?.(datasetNumber(event, 'favoriteIndex')));
    });
    forEachQuery(cards, '.connection-edit-favorite-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onEditFavorite?.(datasetNumber(event, 'favoriteIndex')));
    });
    forEachQuery(cards, '.connection-copy-favorite-shell-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onCopyFavoriteShell?.(datasetNumber(event, 'favoriteIndex')));
    });
    forEachQuery(cards, '.connection-check-favorite-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onCheckFavorite?.(datasetNumber(event, 'favoriteIndex')));
    });
    forEachQuery(cards, '.connection-move-favorite-up-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onMoveFavoriteUp?.(datasetNumber(event, 'favoriteIndex')));
    });
    forEachQuery(cards, '.connection-move-favorite-down-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onMoveFavoriteDown?.(datasetNumber(event, 'favoriteIndex')));
    });
    forEachQuery(cards, '.connection-default-favorite-override-btn', btn => {
      bindEvent(btn, 'click', () => handlers.onDefaultFavoriteOverride?.());
    });
    forEachQuery(cards, '.connection-copy-default-favorite-shell-btn', btn => {
      bindEvent(btn, 'click', () => handlers.onCopyDefaultFavoriteShell?.());
    });
    forEachQuery(cards, '.connection-check-default-favorite-btn', btn => {
      bindEvent(btn, 'click', () => handlers.onCheckDefaultFavorite?.());
    });
    forEachQuery(cards, '.connection-clear-default-favorite-btn', btn => {
      bindEvent(btn, 'click', () => handlers.onClearDefaultFavorite?.());
    });
    forEachQuery(cards, '.connection-set-default-favorite-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onSetDefaultFavorite?.(datasetNumber(event, 'favoriteIndex')));
    });
    forEachQuery(cards, '.connection-forget-favorite-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onForgetFavorite?.(datasetNumber(event, 'favoriteIndex')));
    });
    forEachQuery(cards, '.connection-last-successful-override-btn', btn => {
      bindEvent(btn, 'click', () => handlers.onLastSuccessfulOverride?.());
    });
    forEachQuery(cards, '.connection-save-last-working-favorite-btn', btn => {
      bindEvent(btn, 'click', () => handlers.onSaveLastWorkingFavorite?.());
    });
    forEachQuery(cards, '.connection-copy-last-working-shell-btn', btn => {
      bindEvent(btn, 'click', () => handlers.onCopyLastWorkingShell?.());
    });
    forEachQuery(cards, '.connection-check-last-working-btn', btn => {
      bindEvent(btn, 'click', () => handlers.onCheckLastWorking?.());
    });
    forEachQuery(cards, '.connection-clear-last-working-btn', btn => {
      bindEvent(btn, 'click', () => handlers.onClearLastWorking?.());
    });
    forEachQuery(cards, '.connection-recent-override-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onRecentOverride?.(datasetNumber(event, 'recentIndex')));
    });
    forEachQuery(cards, '.connection-save-recent-favorite-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onSaveRecentFavorite?.(datasetNumber(event, 'recentIndex')));
    });
    forEachQuery(cards, '.connection-copy-recent-shell-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onCopyRecentShell?.(datasetNumber(event, 'recentIndex')));
    });
    forEachQuery(cards, '.connection-check-recent-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onCheckRecent?.(datasetNumber(event, 'recentIndex')));
    });
    forEachQuery(cards, '.connection-forget-recent-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onForgetRecent?.(datasetNumber(event, 'recentIndex')));
    });
    forEachQuery(cards, '.connection-local-stone-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onLocalStone?.(datasetString(event, 'stoneName')));
    });
    forEachQuery(cards, '.connection-save-local-stone-favorite-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onSaveLocalStoneFavorite?.(datasetString(event, 'stoneName')));
    });
    forEachQuery(cards, '.connection-copy-local-stone-shell-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onCopyLocalStoneShell?.(datasetString(event, 'stoneName')));
    });
    forEachQuery(cards, '.connection-check-local-stone-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onCheckLocalStone?.(datasetString(event, 'stoneName')));
    });
    forEachQuery(cards, '.connection-apply-check-result-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onApplyCheckResult?.(datasetNumber(event, 'checkIndex')));
    });
    forEachQuery(cards, '.connection-save-check-favorite-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onSaveCheckFavorite?.(datasetNumber(event, 'checkIndex')));
    });
    forEachQuery(cards, '.connection-copy-check-shell-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onCopyCheckShell?.(datasetNumber(event, 'checkIndex')));
    });
    forEachQuery(cards, '.connection-recheck-all-btn', btn => {
      bindEvent(btn, 'click', () => handlers.onRecheckAll?.());
    });
    forEachQuery(cards, '.connection-copy-checks-btn', btn => {
      bindEvent(btn, 'click', () => handlers.onCopyChecks?.());
    });
    forEachQuery(cards, '.connection-download-checks-btn', btn => {
      bindEvent(btn, 'click', () => handlers.onDownloadChecks?.());
    });
    forEachQuery(cards, '.connection-import-checks-btn', btn => {
      bindEvent(btn, 'click', () => handlers.onImportChecks?.());
    });
    forEachQuery(cards, '.connection-replace-checks-btn', btn => {
      bindEvent(btn, 'click', () => handlers.onReplaceChecks?.());
    });
    forEachQuery(cards, '.connection-recheck-failures-btn', btn => {
      bindEvent(btn, 'click', () => handlers.onRecheckFailures?.());
    });
    forEachQuery(cards, '.connection-recheck-stale-btn', btn => {
      bindEvent(btn, 'click', () => handlers.onRecheckStale?.());
    });
    forEachQuery(cards, '.connection-forget-check-btn', btn => {
      bindEvent(btn, 'click', event => handlers.onForgetCheck?.(datasetNumber(event, 'checkIndex')));
    });
    forEachQuery(cards, '.connection-clear-checks-btn', btn => {
      bindEvent(btn, 'click', () => handlers.onClearChecks?.());
    });
  }

  return {
    bindConnectionWindowToolbarActions,
    applyConnectionWindowToolbarState,
    bindConnectionWindowCardActions,
  };
});
