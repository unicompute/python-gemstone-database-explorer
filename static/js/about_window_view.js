(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AboutWindowView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function fallbackEscHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function browserSummary(browser = {}) {
    const viewport = browser?.viewport;
    const size = viewport ? `${viewport.width}×${viewport.height}` : '';
    const language = browser?.language || '';
    return [language, size].filter(Boolean).join(' · ');
  }

  function buildLatestErrorLabel(statusSummary = {}) {
    if (!statusSummary.latestError) return '—';
    return [
      statusSummary.latestError.message,
      statusSummary.latestError.sourceTitle || statusSummary.latestError.sourceKind || '',
    ].filter(Boolean).join(' · ');
  }

  function buildAboutRows(options = {}) {
    const data = options.data || {};
    const runtimeVersionInfo = options.runtimeVersionInfo || {};
    const browser = options.browser || {};
    const broker = options.broker || {};
    const configuredConnection = options.configuredConnection || {};
    const favoriteProfiles = Array.isArray(options.favoriteProfiles) ? options.favoriteProfiles : [];
    const defaultFavoriteProfile = options.defaultFavoriteProfile || null;
    const localStones = Array.isArray(options.localStones) ? options.localStones : [];
    const channelNames = String(options.channelNames || '').trim();
    const statusSummary = options.statusSummary || {};
    const errorText = String(options.errorText || '').trim();
    const latestErrorLabel = options.latestErrorLabel || buildLatestErrorLabel(statusSummary);
    const summarizeConnectionOverride = typeof options.summarizeConnectionOverride === 'function'
      ? options.summarizeConnectionOverride
      : () => '—';
    const defaultFavoriteLabel = defaultFavoriteProfile
      ? `${defaultFavoriteProfile.name} · ${summarizeConnectionOverride(defaultFavoriteProfile.target)}`
      : '—';

    const rows = [
      ['Explorer', data.app || runtimeVersionInfo.app || ''],
      ['Stone', data.stone || runtimeVersionInfo.stone || ''],
      ['Gem', data.gem || runtimeVersionInfo.gem || ''],
      ['Health', data.status || (errorText ? 'error' : 'unknown')],
      ['Python', data.runtime?.python || ''],
      ['Platform', data.runtime?.platform || ''],
      ['Connection Target', configuredConnection.effectiveTarget || '—'],
      ['Connection Source', configuredConnection.stoneSource || '—'],
      ['Connection Override', options.overrideSummary || '—'],
      ['Default Favorite', defaultFavoriteLabel],
      ['Saved Targets', String(favoriteProfiles.length)],
      ['Local Stones', localStones.length ? localStones.join(', ') : '—'],
      ['Broker Sessions', String(broker.managedSessionCount ?? 0)],
      ['Channels', channelNames || '—'],
      ['Auto Begin Default', broker.defaultAutoBegin === null || broker.defaultAutoBegin === undefined ? 'unset' : String(!!broker.defaultAutoBegin)],
      ['Browser', browserSummary(browser)],
      ['Open Windows', String(options.openWindowCount ?? 0)],
      ['Window Links', String(options.windowLinkCount ?? 0)],
      ['Window Groups', String(options.windowGroupCount ?? 0)],
      ['Largest Group', `${options.largestGroupSize || 0} window${Number(options.largestGroupSize || 0) === 1 ? '' : 's'}`],
      ['Status Entries', String(options.statusEntryCount ?? 0)],
      ['Status OK', String(statusSummary.ok ?? 0)],
      ['Status Errors', String(statusSummary.error ?? 0)],
      ['Closed Sources', String(statusSummary.closedSources ?? 0)],
      ['Latest Error', latestErrorLabel],
      ['Layout', 'Persisted per browser via localStorage'],
      ['Sessions', 'Window-scoped channel families over the shared GemStone broker'],
      ['Refreshed', options.refreshedLabel || new Date().toLocaleString()],
    ];
    if (errorText) rows.push(['Error', errorText]);
    return rows;
  }

  function buildAboutGridHtml(rows = [], escHtml = fallbackEscHtml) {
    return (Array.isArray(rows) ? rows : []).map(([key, value]) => `
      <div class="about-key">${escHtml(key)}</div>
      <div class="about-value">${escHtml(value || '—')}</div>
    `).join('');
  }

  function buildAboutWindowView(options = {}) {
    const rows = buildAboutRows(options);
    return {
      rows,
      gridHtml: buildAboutGridHtml(rows, options.escHtml || fallbackEscHtml),
    };
  }

  return {
    browserSummary,
    buildLatestErrorLabel,
    buildAboutRows,
    buildAboutGridHtml,
    buildAboutWindowView,
  };
});
