(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ConnectionWindowView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function fallbackEscHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function checkViewModeLabel(mode) {
    const value = String(mode || '').trim().toLowerCase();
    if (value === 'current') return 'Current';
    if (value === 'stale') return 'Stale';
    if (value === 'failures') return 'Failures';
    if (value === 'legacy') return 'Legacy';
    return 'All';
  }

  function buildConnectionGridHtml(rows = [], escHtml = fallbackEscHtml) {
    return (Array.isArray(rows) ? rows : []).map(([key, value]) => `
      <div class="about-key">${escHtml(key)}</div>
      <div class="about-value">${escHtml(value || '—')}</div>
    `).join('');
  }

  function buildConnectionToolbarState(options = {}) {
    const renderState = options.renderState || {};
    const startupBootstrapped = !!options.startupBootstrapped;
    const latestStartupError = String(options.latestStartupError || '').trim();
    return {
      retryVisible: !startupBootstrapped || !!latestStartupError,
      applyOverrideVisible: !!renderState.suggestedOverride,
      saveSuggestedFavoriteVisible: !!renderState.suggestedOverride,
      clearOverrideVisible: !!renderState.override,
      favoriteTargetVisible: !!renderState.currentTargetOverride,
      favoriteTargetLabel: renderState.currentTargetIsFavorite ? 'Rename Favorite' : 'Save Target',
      clearFavoritesVisible: !!(renderState.favoriteProfiles || []).length,
      clearRecentsVisible: !!(renderState.recentOverrides || []).length,
      clearLastWorkingVisible: !!renderState.lastSuccessfulOverride,
      copyFixDisabled: !renderState.fixShell,
    };
  }

  function buildConnectionCardsHtml(renderState = {}, helpers = {}) {
    const escHtml = helpers.escHtml || fallbackEscHtml;
    const shortLabel = helpers.shortLabel || (value => String(value ?? '').trim());
    const summarizeConnectionOverride = helpers.summarizeConnectionOverride || (() => '—');
    const defaultConnectionOverrideName = helpers.defaultConnectionOverrideName || (() => 'Saved Target');
    const favoriteProfileForOverride = helpers.favoriteProfileForOverride || (() => null);
    const isDefaultFavoriteConnectionOverride = helpers.isDefaultFavoriteConnectionOverride || (() => false);

    const payload = renderState.payload || {};
    const latestStartupError = String(helpers.latestStartupError || '').trim();
    const favoriteProfiles = Array.isArray(renderState.favoriteProfiles) ? renderState.favoriteProfiles : [];
    const defaultFavoriteProfile = renderState.defaultFavoriteProfile || null;
    const recentOverrides = Array.isArray(renderState.recentOverrides) ? renderState.recentOverrides : [];
    const localStoneOverrides = Array.isArray(renderState.localStoneOverrides) ? renderState.localStoneOverrides : [];
    const probeEntries = Array.isArray(renderState.probeEntries) ? renderState.probeEntries : [];
    const probe = renderState.probe || {};
    const connectionCheckResults = Array.isArray(renderState.allConnectionCheckEntries)
      ? renderState.allConnectionCheckEntries.map(entry => entry.item).filter(Boolean)
      : [];
    const connectionCheckEntries = Array.isArray(renderState.connectionCheckEntries) ? renderState.connectionCheckEntries : [];
    const suggestions = Array.isArray(renderState.suggestions) ? renderState.suggestions : [];
    const lastSuccessfulOverride = renderState.lastSuccessfulOverride || null;
    const connectionCheckViewMode = String(renderState.connectionCheckViewMode || 'all').trim() || 'all';
    const isFilteredConnectionChecksView = !!renderState.isFilteredConnectionChecksView;

    const cardsHtml = [];
    if (latestStartupError) {
      cardsHtml.push(`
        <div style="border:1px solid #f38ba8;background:#1e1e2e;padding:10px;border-radius:8px">
          <div style="font-weight:600;color:#f38ba8;margin-bottom:4px">Startup failure</div>
          <div style="color:#cdd6f4;white-space:pre-wrap">${escHtml(latestStartupError)}</div>
        </div>
      `);
    }
    if (payload.exception) {
      cardsHtml.push(`
        <div style="border:1px solid #f38ba8;background:#1e1e2e;padding:10px;border-radius:8px">
          <div style="font-weight:600;color:#f38ba8;margin-bottom:4px">Latest exception</div>
          <div style="color:#cdd6f4;white-space:pre-wrap">${escHtml(payload.exception)}</div>
        </div>
      `);
    }
    if (renderState.fixShell) {
      cardsHtml.push(`
        <div style="border:1px solid #313244;background:#181825;padding:10px;border-radius:8px">
          <div style="font-weight:600;color:#cdd6f4;margin-bottom:6px">Suggested shell fix</div>
          <pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#a6e3a1">${escHtml(renderState.fixShell)}</pre>
        </div>
      `);
    }
    suggestions.forEach(suggestion => {
      cardsHtml.push(`
        <div style="border:1px solid #313244;background:#181825;padding:10px;border-radius:8px">
          <div style="font-weight:600;color:#cdd6f4;margin-bottom:4px">${escHtml(suggestion.title || suggestion.kind || 'Suggestion')}</div>
          ${suggestion.detail ? `<div style="color:#bac2de;white-space:pre-wrap">${escHtml(suggestion.detail)}</div>` : ''}
          ${suggestion.shell ? `<pre style="margin:8px 0 0;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#a6e3a1">${escHtml(suggestion.shell)}</pre>` : ''}
        </div>
      `);
    });
    if (defaultFavoriteProfile) {
      cardsHtml.push(`
        <div style="border:1px solid #313244;background:#181825;padding:10px;border-radius:8px">
          <div style="font-weight:600;color:#cdd6f4;margin-bottom:6px">Default Favorite Target</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
            <button class="btn-ghost connection-default-favorite-override-btn" type="button">Use Default Favorite Target ${escHtml(shortLabel(defaultFavoriteProfile.name || defaultConnectionOverrideName(defaultFavoriteProfile.target), 24))}</button>
            <button class="btn-ghost connection-copy-default-favorite-shell-btn" type="button">Copy Default Favorite Shell</button>
            <button class="btn-ghost connection-check-default-favorite-btn" type="button">Check Default Favorite</button>
            <button class="btn-ghost connection-clear-default-favorite-btn" type="button">Unset Default Favorite</button>
            <span style="font-size:12px;color:#bac2de">${escHtml(summarizeConnectionOverride(defaultFavoriteProfile.target))}</span>
            ${defaultFavoriteProfile.note ? `<span style="flex-basis:100%;font-size:12px;color:#a6adc8;white-space:pre-wrap">${escHtml(defaultFavoriteProfile.note)}</span>` : ''}
          </div>
        </div>
      `);
    }
    if (favoriteProfiles.length) {
      cardsHtml.push(`
        <div style="border:1px solid #313244;background:#181825;padding:10px;border-radius:8px">
          <div style="font-weight:600;color:#cdd6f4;margin-bottom:6px">Favorite Targets</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${favoriteProfiles.map((item, index) => `
              <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
                <button class="btn-ghost connection-favorite-override-btn" data-favorite-index="${index}" type="button">Use Favorite Target ${escHtml(shortLabel(item.name || defaultConnectionOverrideName(item.target), 24))}</button>
                <button class="btn-ghost connection-rename-favorite-btn" data-favorite-index="${index}" type="button">Rename Favorite Target ${escHtml(shortLabel(item.name || defaultConnectionOverrideName(item.target), 24))}</button>
                <button class="btn-ghost connection-edit-favorite-btn" data-favorite-index="${index}" type="button">Edit Favorite Target ${escHtml(shortLabel(item.name || defaultConnectionOverrideName(item.target), 24))}</button>
                <button class="btn-ghost connection-copy-favorite-shell-btn" data-favorite-index="${index}" type="button">Copy Favorite Shell ${escHtml(shortLabel(item.name || defaultConnectionOverrideName(item.target), 24))}</button>
                <button class="btn-ghost connection-check-favorite-btn" data-favorite-index="${index}" type="button">Check Favorite Target ${escHtml(shortLabel(item.name || defaultConnectionOverrideName(item.target), 18))}</button>
                ${index > 0 ? `<button class="btn-ghost connection-move-favorite-up-btn" data-favorite-index="${index}" type="button">Move Favorite Up ${escHtml(shortLabel(item.name || defaultConnectionOverrideName(item.target), 18))}</button>` : ''}
                ${index < favoriteProfiles.length - 1 ? `<button class="btn-ghost connection-move-favorite-down-btn" data-favorite-index="${index}" type="button">Move Favorite Down ${escHtml(shortLabel(item.name || defaultConnectionOverrideName(item.target), 18))}</button>` : ''}
                ${isDefaultFavoriteConnectionOverride(item.target)
                  ? `<span style="font-size:12px;color:#a6e3a1;border:1px solid #2f855a;background:#11111b;padding:4px 8px;border-radius:999px">Default Favorite</span>`
                  : `<button class="btn-ghost connection-set-default-favorite-btn" data-favorite-index="${index}" type="button">Set Default Favorite</button>`}
                <button class="btn-ghost connection-forget-favorite-btn" data-favorite-index="${index}" type="button">Forget Favorite Target ${escHtml(shortLabel(item.name || defaultConnectionOverrideName(item.target), 24))}</button>
                <span style="font-size:12px;color:#bac2de">${escHtml(summarizeConnectionOverride(item.target))}</span>
                ${item.note ? `<span style="flex-basis:100%;font-size:12px;color:#a6adc8;white-space:pre-wrap">${escHtml(item.note)}</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `);
    }
    if (renderState.showLastSuccessfulOverride && lastSuccessfulOverride) {
      const targetLabel = shortLabel(lastSuccessfulOverride.stone || lastSuccessfulOverride.host || lastSuccessfulOverride.netldi || 'override', 24);
      cardsHtml.push(`
        <div style="border:1px solid #313244;background:#181825;padding:10px;border-radius:8px">
          <div style="font-weight:600;color:#cdd6f4;margin-bottom:6px">Last Working Target</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
            <button class="btn-ghost connection-last-successful-override-btn" type="button">Use Last Working Target ${escHtml(targetLabel)}</button>
            <button class="btn-ghost connection-save-last-working-favorite-btn" type="button">${escHtml(
              favoriteProfileForOverride(lastSuccessfulOverride, favoriteProfiles)
                ? `Rename Last Working Favorite ${shortLabel(targetLabel, 18)}`
                : 'Save Last Working Target as Favorite'
            )}</button>
            <button class="btn-ghost connection-copy-last-working-shell-btn" type="button">Copy Last Working Shell</button>
            <button class="btn-ghost connection-check-last-working-btn" type="button">Check Last Working Target</button>
            <button class="btn-ghost connection-clear-last-working-btn" type="button">Forget Last Working Target</button>
            <span style="font-size:12px;color:#bac2de">${escHtml(summarizeConnectionOverride(lastSuccessfulOverride))}</span>
          </div>
        </div>
      `);
    }
    if (recentOverrides.length) {
      cardsHtml.push(`
        <div style="border:1px solid #313244;background:#181825;padding:10px;border-radius:8px">
          <div style="font-weight:600;color:#cdd6f4;margin-bottom:6px">Recent Targets</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${recentOverrides.map((item, index) => {
              const targetLabel = item.stone || item.host || item.netldi || 'override';
              return `
                <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
                  <button class="btn-ghost connection-recent-override-btn" data-recent-index="${index}" type="button">Use Recent Target ${escHtml(shortLabel(targetLabel, 24))}</button>
                  <button class="btn-ghost connection-save-recent-favorite-btn" data-recent-index="${index}" type="button">${escHtml(
                    favoriteProfileForOverride(item, favoriteProfiles)
                      ? `Rename Recent Favorite ${shortLabel(targetLabel, 18)}`
                      : `Save Recent Target ${shortLabel(targetLabel, 18)} as Favorite`
                  )}</button>
                  <button class="btn-ghost connection-copy-recent-shell-btn" data-recent-index="${index}" type="button">Copy Recent Shell ${escHtml(shortLabel(targetLabel, 18))}</button>
                  <button class="btn-ghost connection-check-recent-btn" data-recent-index="${index}" type="button">Check Recent Target ${escHtml(shortLabel(targetLabel, 18))}</button>
                  <button class="btn-ghost connection-forget-recent-btn" data-recent-index="${index}" type="button">Forget Recent Target ${escHtml(shortLabel(targetLabel, 18))}</button>
                  <span style="font-size:12px;color:#bac2de">${escHtml(summarizeConnectionOverride(item))}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `);
    }
    if (probeEntries.length) {
      cardsHtml.push(`
        <div style="border:1px solid #313244;background:#181825;padding:10px;border-radius:8px">
          <div style="font-weight:600;color:#cdd6f4;margin-bottom:6px">Local gslist probe</div>
          ${localStoneOverrides.length ? `
            <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px">
              ${localStoneOverrides.map(item => `
                <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
                  <button class="btn-ghost connection-local-stone-btn" data-stone-name="${escHtml(item.label)}" type="button">Use Local Stone ${escHtml(item.label)}</button>
                  <button class="btn-ghost connection-save-local-stone-favorite-btn" data-stone-name="${escHtml(item.label)}" type="button">${escHtml(
                    favoriteProfileForOverride(item.override, favoriteProfiles)
                      ? `Rename Local Stone Favorite ${item.label}`
                      : `Save Local Stone ${item.label} as Favorite`
                  )}</button>
                  <button class="btn-ghost connection-copy-local-stone-shell-btn" data-stone-name="${escHtml(item.label)}" type="button">Copy Local Stone Shell ${escHtml(item.label)}</button>
                  <button class="btn-ghost connection-check-local-stone-btn" data-stone-name="${escHtml(item.label)}" type="button">Check Local Stone ${escHtml(item.label)}</button>
                  <span style="font-size:12px;color:#bac2de">${escHtml(summarizeConnectionOverride(item.override))}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
          <pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#cdd6f4">${escHtml(
            probeEntries.map(entry => `${entry.type} ${entry.name} (${entry.status}) port ${entry.port}`).join('\n')
          )}</pre>
        </div>
      `);
    } else if (probe.error || probe.stderr) {
      cardsHtml.push(`
        <div style="border:1px solid #313244;background:#181825;padding:10px;border-radius:8px">
          <div style="font-weight:600;color:#cdd6f4;margin-bottom:6px">Local gslist probe</div>
          <div style="color:#bac2de;white-space:pre-wrap">${escHtml(probe.error || probe.stderr)}</div>
        </div>
      `);
    }

    cardsHtml.push(`
      <div style="border:1px solid #313244;background:#181825;padding:10px;border-radius:8px">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:6px">
          <div style="display:flex;flex-direction:column;gap:2px">
            <div style="font-weight:600;color:#cdd6f4">Target Checks</div>
            <div style="font-size:12px;color:#a6adc8">${connectionCheckResults.length} saved · ${renderState.okChecks || 0} ok · ${renderState.errorChecks || 0} error${renderState.staleChecks ? ` · ${renderState.staleChecks} stale` : ''}${renderState.legacyChecks ? ` · ${renderState.legacyChecks} legacy` : ''}</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
              ${['all', 'current', 'stale', 'failures', 'legacy'].map(mode => `
                <button class="btn-ghost connection-check-view-btn" data-check-view-mode="${mode}" type="button" style="${connectionCheckViewMode === mode ? 'border-color:#89dceb;color:#89dceb;' : ''}">${escHtml(checkViewModeLabel(mode))}</button>
              `).join('')}
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end">
            <button class="btn-ghost connection-import-checks-btn" type="button">Import Checks JSON</button>
            <button class="btn-ghost connection-replace-checks-btn" type="button">Replace Checks JSON</button>
            ${connectionCheckResults.length ? `<button class="btn-ghost connection-copy-checks-btn" type="button">${isFilteredConnectionChecksView ? 'Copy Visible Checks JSON' : 'Copy Checks JSON'}</button>` : ''}
            ${connectionCheckResults.length ? `<button class="btn-ghost connection-download-checks-btn" type="button">${isFilteredConnectionChecksView ? 'Download Visible Checks JSON' : 'Download Checks JSON'}</button>` : ''}
            ${connectionCheckResults.length ? `<button class="btn-ghost connection-recheck-all-btn" type="button">Recheck All</button>` : ''}
            ${connectionCheckResults.length ? `<button class="btn-ghost connection-recheck-failures-btn" type="button">Recheck Failures</button>` : ''}
            ${renderState.staleChecks ? `<button class="btn-ghost connection-recheck-stale-btn" type="button">Recheck Stale</button>` : ''}
            ${connectionCheckResults.length ? `<button class="btn-ghost connection-clear-checks-btn" type="button">Clear Checks</button>` : ''}
          </div>
        </div>
        ${renderState.staleChecks ? `<div style="font-size:12px;color:#f9e2af;margin-bottom:8px">Saved checks marked stale were recorded against an older probe or server config. Recheck them to refresh.</div>` : ''}
        ${isFilteredConnectionChecksView ? `<div style="font-size:12px;color:#a6adc8;margin-bottom:8px">Viewing ${connectionCheckEntries.length} ${escHtml(connectionCheckViewMode)} check${connectionCheckEntries.length === 1 ? '' : 's'} · export targets current view</div>` : ''}
        ${connectionCheckResults.length
          ? `${connectionCheckEntries.length
              ? `<div style="display:flex;flex-direction:column;gap:8px">
                  ${connectionCheckEntries.map(({item, freshness, originalIndex}) => `
                    <div style="border:1px solid #313244;background:#11111b;padding:8px;border-radius:8px;display:flex;flex-direction:column;gap:6px">
                      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
                        <span style="font-size:11px;border:1px solid ${item.success ? '#2f855a' : '#b91c1c'};color:${item.success ? '#a6e3a1' : '#f38ba8'};padding:2px 8px;border-radius:999px">${item.success ? 'OK' : 'Error'}</span>
                        <span style="font-size:11px;border:1px solid ${freshness.stale ? '#f9e2af' : (freshness.legacy ? '#6c7086' : '#89dceb')};color:${freshness.stale ? '#f9e2af' : (freshness.legacy ? '#bac2de' : '#89dceb')};padding:2px 8px;border-radius:999px">${escHtml(freshness.label)}</span>
                        <span style="font-size:12px;color:#cdd6f4;font-weight:600">${escHtml(item.label)}</span>
                        <button class="btn-ghost connection-apply-check-result-btn" data-check-index="${originalIndex}" type="button">Use Checked Target</button>
                        <button class="btn-ghost connection-save-check-favorite-btn" data-check-index="${originalIndex}" type="button">${escHtml(
                          favoriteProfileForOverride(item.target, favoriteProfiles)
                            ? `Rename Checked Favorite ${shortLabel(item.label, 18)}`
                            : `Save Checked Target ${shortLabel(item.label, 18)} as Favorite`
                        )}</button>
                        <button class="btn-ghost connection-copy-check-shell-btn" data-check-index="${originalIndex}" type="button">Copy Checked Shell</button>
                        <button class="btn-ghost connection-forget-check-btn" data-check-index="${originalIndex}" type="button">Forget Check</button>
                      </div>
                      <div style="font-size:12px;color:#bac2de">${escHtml(summarizeConnectionOverride(item.target))}</div>
                      <div style="font-size:12px;color:#a6adc8">Checked ${escHtml(new Date(item.checkedAt).toLocaleString())}${item.effectiveTarget ? ` · effective ${escHtml(item.effectiveTarget)}` : ''}${item.stoneSource ? ` · ${escHtml(item.stoneSource)}` : ''}</div>
                      ${freshness.reason ? `<div style="font-size:12px;color:${freshness.stale ? '#f9e2af' : '#a6adc8'}">${escHtml(freshness.reason)}</div>` : ''}
                      ${item.exception ? `<div style="font-size:12px;color:#f38ba8;white-space:pre-wrap">${escHtml(item.exception)}</div>` : ''}
                    </div>
                  `).join('')}
                </div>`
              : `<div style="font-size:12px;color:#a6adc8">No ${escHtml(connectionCheckViewMode)} target checks in the current view.</div>`}`
          : `<div style="font-size:12px;color:#a6adc8">${isFilteredConnectionChecksView ? `No ${escHtml(connectionCheckViewMode)} target checks in the current view.` : 'No saved target checks yet. Check a favorite, recent target, last working target, or local Stone to populate this list, or import a saved check bundle.'}</div>`}
      </div>
    `);

    return cardsHtml.join('');
  }

  function buildConnectionWindowView(options = {}) {
    const renderState = options.renderState || {};
    return {
      gridHtml: buildConnectionGridHtml(renderState.rows || [], options.escHtml || fallbackEscHtml),
      cardsHtml: buildConnectionCardsHtml(renderState, options),
      toolbarState: buildConnectionToolbarState({
        startupBootstrapped: !!options.startupBootstrapped,
        latestStartupError: options.latestStartupError,
        renderState,
      }),
    };
  }

  return {
    checkViewModeLabel,
    buildConnectionGridHtml,
    buildConnectionCardsHtml,
    buildConnectionToolbarState,
    buildConnectionWindowView,
  };
});
