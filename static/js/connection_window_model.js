(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ConnectionWindowModel = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CONNECTION_CHECK_VIEW_MODES = ['all', 'current', 'stale', 'failures', 'legacy'];

  function normalizeConnectionPayload(preflight, startupError = '') {
    if (!preflight || typeof preflight !== 'object') {
      return {
        success: false,
        status: 'error',
        exception: String(startupError || 'connection failed').trim(),
        connection: {configured: {}, probe: {}, suggestions: []},
      };
    }
    const connection = preflight.connection && typeof preflight.connection === 'object'
      ? preflight.connection
      : {};
    const configured = connection.configured && typeof connection.configured === 'object'
      ? connection.configured
      : {};
    const probe = connection.probe && typeof connection.probe === 'object'
      ? connection.probe
      : {};
    const suggestions = Array.isArray(connection.suggestions)
      ? connection.suggestions
      : [];
    return {
      ...preflight,
      status: String(preflight.status || (preflight.success ? 'ok' : 'error') || '').trim() || 'error',
      connection: {
        ...connection,
        configured,
        probe,
        suggestions,
      },
    };
  }

  function shellQuote(value) {
    const text = String(value ?? '');
    if (!text) return "''";
    return /[^A-Za-z0-9_./:@%+=,-]/.test(text)
      ? `'${text.replace(/'/g, `'\"'\"'`)}'`
      : text;
  }

  function buildConnectionPayload(options = {}) {
    const browserState = options.browserState && typeof options.browserState === 'object'
      ? options.browserState
      : {};
    return {
      generatedAt: new Date().toISOString(),
      startupError: String(options.latestStartupError || '').trim(),
      browserState: {
        override: browserState.override || null,
        lastSuccessfulOverride: browserState.lastSuccessfulOverride || null,
        favoriteProfiles: Array.isArray(browserState.favoriteProfiles) ? browserState.favoriteProfiles : [],
        defaultFavoriteProfile: browserState.defaultFavoriteProfile || null,
        recentOverrides: Array.isArray(browserState.recentOverrides) ? browserState.recentOverrides : [],
        profileBundle: browserState.profileBundle || {},
        connectionCheckResults: Array.isArray(browserState.connectionCheckResults) ? browserState.connectionCheckResults : [],
        connectionCheckViewMode: normalizeConnectionCheckViewMode(browserState.connectionCheckViewMode),
      },
      preflight: normalizeConnectionPayload(options.latestPreflight, options.latestStartupError),
    };
  }

  function buildFixShell(preflight) {
    const payload = normalizeConnectionPayload(preflight);
    const configured = payload.connection?.configured || {};
    const suggestions = Array.isArray(payload.connection?.suggestions)
      ? payload.connection.suggestions
      : [];
    const lines = [];
    const seen = new Set();
    const addLine = line => {
      const text = String(line || '').trim();
      if (!text || seen.has(text)) return;
      seen.add(text);
      lines.push(text);
    };

    suggestions.forEach(suggestion => {
      if (suggestion?.shell) {
        String(suggestion.shell)
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(Boolean)
          .forEach(addLine);
      }
      const env = suggestion?.env && typeof suggestion.env === 'object' ? suggestion.env : {};
      Object.entries(env).forEach(([name, value]) => addLine(`export ${name}=${shellQuote(value)}`));
    });

    if (!lines.length) {
      if (configured.stone) addLine(`export GS_STONE=${shellQuote(configured.stone)}`);
      if (configured.mode === 'netldi' && configured.host) addLine(`export GS_HOST=${shellQuote(configured.host)}`);
      if (configured.mode === 'netldi' && configured.netldi) addLine(`export GS_NETLDI=${shellQuote(configured.netldi)}`);
      if (configured.gemService) addLine(`export GS_GEM_SERVICE=${shellQuote(configured.gemService)}`);
    }

    return lines.join('\n');
  }

  function suggestedOverrideFromPayload(payload, sanitizeConnectionOverride) {
    const normalizedPayload = normalizeConnectionPayload(payload);
    const suggestions = Array.isArray(normalizedPayload.connection?.suggestions)
      ? normalizedPayload.connection.suggestions
      : [];
    for (const suggestion of suggestions) {
      const env = suggestion?.env && typeof suggestion.env === 'object' ? suggestion.env : {};
      const override = typeof sanitizeConnectionOverride === 'function'
        ? sanitizeConnectionOverride({
          stone: env.GS_STONE || '',
          host: env.GS_HOST || '',
          netldi: env.GS_NETLDI || '',
          gemService: env.GS_GEM_SERVICE || '',
        })
        : null;
      if (override) return override;
    }
    return null;
  }

  function configuredOverrideSeed(payload, browserOverride, sanitizeConnectionOverride) {
    const normalizedPayload = normalizeConnectionPayload(payload);
    const configured = normalizedPayload.connection?.configured || {};
    const current = typeof sanitizeConnectionOverride === 'function'
      ? sanitizeConnectionOverride(configured.override || browserOverride)
      : null;
    return {
      current,
      placeholders: {
        stone: String(current?.stone || '').trim() ? '' : String(configured.stone || '').trim(),
        host: String(current?.host || '').trim() ? '' : String(configured.host || '').trim(),
        netldi: String(current?.netldi || '').trim() ? '' : String(configured.netldi || '').trim(),
        gemService: String(current?.gemService || '').trim() ? '' : String(configured.gemService || '').trim(),
      },
    };
  }

  function localStoneOverridesFromPayload(payload) {
    const normalizedPayload = normalizeConnectionPayload(payload);
    const probeEntries = Array.isArray(normalizedPayload.connection?.probe?.entries)
      ? normalizedPayload.connection.probe.entries
      : [];
    const seen = new Set();
    return probeEntries
      .filter(entry => String(entry?.type || '').toLowerCase() === 'stone')
      .map(entry => String(entry?.name || '').trim())
      .filter(name => {
        if (!name || seen.has(name)) return false;
        seen.add(name);
        return true;
      })
      .map(name => ({
        label: name,
        override: {
          stone: name,
          host: '',
          netldi: '',
          gemService: '',
        },
      }));
  }

  function currentConnectionTargetOverride(payload, browserOverride, sanitizeConnectionOverride) {
    const normalizedPayload = normalizeConnectionPayload(payload);
    const configured = normalizedPayload.connection?.configured || {};
    const current = typeof sanitizeConnectionOverride === 'function'
      ? sanitizeConnectionOverride(configured.override || browserOverride)
      : null;
    if (current) return current;
    return typeof sanitizeConnectionOverride === 'function'
      ? sanitizeConnectionOverride({
        stone: configured.stone || '',
        host: configured.host || '',
        netldi: configured.netldi || '',
        gemService: configured.gemService || '',
      })
      : null;
  }

  function favoriteProfileForOverride(override, profiles = [], connectionOverrideKey) {
    const keyFor = typeof connectionOverrideKey === 'function'
      ? connectionOverrideKey
      : value => JSON.stringify(value || null);
    const key = keyFor(override);
    if (!key) return null;
    return (Array.isArray(profiles) ? profiles : []).find(item => keyFor(item?.target || null) === key) || null;
  }

  function normalizeConnectionCheckViewMode(mode) {
    const value = String(mode || '').trim().toLowerCase();
    return CONNECTION_CHECK_VIEW_MODES.includes(value) ? value : 'all';
  }

  function getVisibleConnectionCheckEntries(options = {}) {
    const payload = normalizeConnectionPayload(options.payload);
    const connectionCheckResults = Array.isArray(options.connectionCheckResults)
      ? options.connectionCheckResults
      : [];
    const describeConnectionCheckFreshness = typeof options.describeConnectionCheckFreshness === 'function'
      ? options.describeConnectionCheckFreshness
      : () => ({label: 'Current', status: 'current', stale: false, legacy: false, reason: ''});
    const viewMode = normalizeConnectionCheckViewMode(options.connectionCheckViewMode);
    const entries = connectionCheckResults.map((item, originalIndex) => ({
      item,
      originalIndex,
      freshness: describeConnectionCheckFreshness(item, payload),
    }));
    if (viewMode === 'current') {
      return entries.filter(entry => entry.freshness.status === 'current');
    }
    if (viewMode === 'stale') {
      return entries.filter(entry => entry.freshness.stale);
    }
    if (viewMode === 'failures') {
      return entries.filter(entry => !entry.item.success);
    }
    if (viewMode === 'legacy') {
      return entries.filter(entry => entry.freshness.legacy);
    }
    return entries;
  }

  function isFilteredConnectionChecksView(mode) {
    return normalizeConnectionCheckViewMode(mode) !== 'all';
  }

  function buildGslistSummary(probe, probeEntries) {
    if (probe?.available) {
      return `found ${probeEntries.length} service${probeEntries.length === 1 ? '' : 's'}`;
    }
    if (probe?.error) return probe.error;
    if (probe?.returnCode === null || probe?.returnCode === undefined) return 'unavailable';
    return `exit ${probe.returnCode}`;
  }

  function buildConnectionRows(options = {}) {
    const configured = options.configured || {};
    const availableStones = Array.isArray(options.availableStones) ? options.availableStones : [];
    const availableNetldis = Array.isArray(options.availableNetldis) ? options.availableNetldis : [];
    const gslistSummary = String(options.gslistSummary || '').trim();
    const summarizeConnectionOverride = typeof options.summarizeConnectionOverride === 'function'
      ? options.summarizeConnectionOverride
      : () => '—';
    const payload = normalizeConnectionPayload(options.payload, options.startupError);
    const rows = [
      ['Status', payload.status || (payload.success ? 'ok' : 'error')],
      ['Configured Stone', configured.stone || '—'],
      ['Stone Source', configured.stoneSource || '—'],
      ['Mode', configured.mode || '—'],
      ['Effective Target', configured.effectiveTarget || '—'],
      ['Host', configured.host || '—'],
      ['NetLDI', configured.netldi || '—'],
      ['Gem Service', configured.gemService || '—'],
      ['Username', configured.username || '—'],
      ['Password', configured.passwordSet ? 'set' : 'missing'],
      ['Override', summarizeConnectionOverride(options.override)],
      ['Local Stones', availableStones.length ? availableStones.join(', ') : '—'],
      ['Local NetLDI', availableNetldis.length ? availableNetldis.map(each => `${each.name}#${each.port}`).join(', ') : '—'],
      ['gslist', gslistSummary || '—'],
      ['Refreshed', new Date().toLocaleString()],
    ];
    const exception = String(payload.exception || options.startupError || '').trim();
    if (exception) rows.push(['Exception', exception]);
    return rows;
  }

  function buildConnectionRenderState(options = {}) {
    const sanitizeConnectionOverride = typeof options.sanitizeConnectionOverride === 'function'
      ? options.sanitizeConnectionOverride
      : value => value || null;
    const connectionOverrideKey = typeof options.connectionOverrideKey === 'function'
      ? options.connectionOverrideKey
      : value => JSON.stringify(value || null);
    const describeConnectionCheckFreshness = typeof options.describeConnectionCheckFreshness === 'function'
      ? options.describeConnectionCheckFreshness
      : () => ({label: 'Current', status: 'current', stale: false, legacy: false, reason: ''});
    const favoriteProfiles = Array.isArray(options.favoriteProfiles) ? options.favoriteProfiles : [];
    const defaultFavoriteProfile = options.defaultFavoriteProfile || null;
    const recentOverrides = Array.isArray(options.recentOverrides) ? options.recentOverrides : [];
    const connectionCheckResults = Array.isArray(options.connectionCheckResults) ? options.connectionCheckResults : [];
    const connectionCheckViewMode = normalizeConnectionCheckViewMode(options.connectionCheckViewMode);
    const payload = normalizeConnectionPayload(options.preflight, options.startupError);
    const configured = payload.connection?.configured || {};
    const override = sanitizeConnectionOverride(configured.override || options.browserOverride);
    const probe = payload.connection?.probe || {};
    const suggestions = Array.isArray(payload.connection?.suggestions)
      ? payload.connection.suggestions
      : [];
    const suggestedOverride = suggestedOverrideFromPayload(payload, sanitizeConnectionOverride);
    const localStoneOverrides = localStoneOverridesFromPayload(payload);
    const currentTargetOverride = currentConnectionTargetOverride(payload, options.browserOverride, sanitizeConnectionOverride);
    const lastSuccessfulOverride = options.lastSuccessfulOverride || null;
    const showLastSuccessfulOverride = !!lastSuccessfulOverride
      && connectionOverrideKey(lastSuccessfulOverride) !== connectionOverrideKey(override);
    const currentFavoriteProfile = favoriteProfileForOverride(currentTargetOverride, favoriteProfiles, connectionOverrideKey);
    const currentTargetIsFavorite = !!currentFavoriteProfile;
    const availableStones = Array.isArray(probe.availableStones) ? probe.availableStones : [];
    const availableNetldis = Array.isArray(probe.availableNetldis) ? probe.availableNetldis : [];
    const probeEntries = Array.isArray(probe.entries) ? probe.entries : [];
    const connectionCheckEntries = getVisibleConnectionCheckEntries({
      connectionCheckResults,
      payload,
      connectionCheckViewMode,
      describeConnectionCheckFreshness,
    });
    const allConnectionCheckEntries = connectionCheckResults.map(item => ({
      item,
      freshness: describeConnectionCheckFreshness(item, payload),
    }));
    const gslistSummary = buildGslistSummary(probe, probeEntries);
    const rows = buildConnectionRows({
      payload,
      configured,
      override,
      availableStones,
      availableNetldis,
      gslistSummary,
      startupError: options.startupError,
      summarizeConnectionOverride: options.summarizeConnectionOverride,
    });
    const okChecks = connectionCheckResults.filter(item => item?.success).length;
    const errorChecks = Math.max(0, connectionCheckResults.length - okChecks);
    const staleChecks = allConnectionCheckEntries.filter(entry => entry.freshness?.stale).length;
    const legacyChecks = allConnectionCheckEntries.filter(entry => entry.freshness?.legacy).length;
    return {
      payload,
      configured,
      override,
      probe,
      suggestions,
      suggestedOverride,
      localStoneOverrides,
      currentTargetOverride,
      lastSuccessfulOverride,
      showLastSuccessfulOverride,
      favoriteProfiles,
      defaultFavoriteProfile,
      currentFavoriteProfile,
      currentTargetIsFavorite,
      recentOverrides,
      availableStones,
      availableNetldis,
      probeEntries,
      connectionCheckEntries,
      allConnectionCheckEntries,
      gslistSummary,
      rows,
      fixShell: buildFixShell(payload),
      okChecks,
      errorChecks,
      staleChecks,
      legacyChecks,
      connectionCheckViewMode,
      isFilteredConnectionChecksView: isFilteredConnectionChecksView(connectionCheckViewMode),
    };
  }

  return {
    CONNECTION_CHECK_VIEW_MODES,
    normalizeConnectionPayload,
    shellQuote,
    buildConnectionPayload,
    buildFixShell,
    suggestedOverrideFromPayload,
    configuredOverrideSeed,
    localStoneOverridesFromPayload,
    currentConnectionTargetOverride,
    favoriteProfileForOverride,
    normalizeConnectionCheckViewMode,
    getVisibleConnectionCheckEntries,
    isFilteredConnectionChecksView,
    buildConnectionRows,
    buildConnectionRenderState,
  };
});
