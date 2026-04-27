(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ConnectionStorage = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const connectionOverrideStorageKey = 'python-gemstone-connection-override-v1';
  const lastSuccessfulConnectionOverrideStorageKey = 'python-gemstone-last-successful-connection-override-v1';
  const favoriteConnectionOverridesStorageKey = 'python-gemstone-favorite-connection-overrides-v1';
  const defaultFavoriteConnectionOverrideStorageKey = 'python-gemstone-default-favorite-connection-override-v1';
  const recentConnectionOverridesStorageKey = 'python-gemstone-recent-connection-overrides-v1';

  function storageFor(storage) {
    const candidate = storage || (root && root.localStorage ? root.localStorage : null);
    if (
      candidate
      && typeof candidate.getItem === 'function'
      && typeof candidate.setItem === 'function'
      && typeof candidate.removeItem === 'function'
    ) {
      return candidate;
    }
    return null;
  }

  function sanitizeConnectionOverride(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const normalized = {
      stone: String(raw.stone || '').trim(),
      host: String(raw.host || '').trim(),
      netldi: String(raw.netldi || '').trim(),
      gemService: String(raw.gemService || '').trim(),
    };
    if (!normalized.stone && !normalized.host && !normalized.netldi && !normalized.gemService) return null;
    return normalized;
  }

  function readConnectionOverride(storage) {
    const actualStorage = storageFor(storage);
    if (!actualStorage) return null;
    try {
      const raw = actualStorage.getItem(connectionOverrideStorageKey);
      if (!raw) return null;
      return sanitizeConnectionOverride(JSON.parse(raw));
    } catch (_) {
      return null;
    }
  }

  function connectionOverrideKey(override) {
    const normalized = sanitizeConnectionOverride(override);
    if (!normalized) return '';
    return JSON.stringify(normalized);
  }

  function defaultConnectionOverrideName(override) {
    const normalized = sanitizeConnectionOverride(override);
    if (!normalized) return 'Saved Target';
    if (normalized.stone) return normalized.stone;
    if (normalized.host && normalized.netldi) return `${normalized.host}#${normalized.netldi}`;
    if (normalized.host) return normalized.host;
    if (normalized.netldi) return normalized.netldi;
    if (normalized.gemService) return normalized.gemService;
    return 'Saved Target';
  }

  function sanitizeFavoriteConnectionProfile(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const target = sanitizeConnectionOverride(
      raw.target
      || raw.override
      || ((raw.stone || raw.host || raw.netldi || raw.gemService) ? raw : null)
    );
    if (!target) return null;
    const fallbackName = defaultConnectionOverrideName(target);
    const name = String(raw.name || raw.label || fallbackName).trim() || fallbackName;
    const note = String(raw.note || raw.description || raw.notes || '').trim();
    return {name, target, note};
  }

  function favoriteConnectionProfileKey(profile) {
    return connectionOverrideKey(profile && profile.target ? profile.target : null);
  }

  function readRecentConnectionOverrides(storage) {
    const actualStorage = storageFor(storage);
    if (!actualStorage) return [];
    try {
      const raw = actualStorage.getItem(recentConnectionOverridesStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const seen = new Set();
      return parsed
        .map(item => sanitizeConnectionOverride(item))
        .filter(item => {
          const key = connectionOverrideKey(item);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 5);
    } catch (_) {
      return [];
    }
  }

  function readFavoriteConnectionProfiles(storage) {
    const actualStorage = storageFor(storage);
    if (!actualStorage) return [];
    try {
      const raw = actualStorage.getItem(favoriteConnectionOverridesStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const seen = new Set();
      return parsed
        .map(item => sanitizeFavoriteConnectionProfile(item))
        .filter(item => {
          const key = favoriteConnectionProfileKey(item);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 8);
    } catch (_) {
      return [];
    }
  }

  function writeRecentConnectionOverrides(overrides, storage) {
    const actualStorage = storageFor(storage);
    if (!actualStorage) return;
    try {
      if (!overrides.length) actualStorage.removeItem(recentConnectionOverridesStorageKey);
      else actualStorage.setItem(recentConnectionOverridesStorageKey, JSON.stringify(overrides));
    } catch (_) {
      // ignore storage failures
    }
  }

  function writeFavoriteConnectionProfiles(profiles, storage) {
    const actualStorage = storageFor(storage);
    if (!actualStorage) return;
    try {
      if (!profiles.length) actualStorage.removeItem(favoriteConnectionOverridesStorageKey);
      else actualStorage.setItem(favoriteConnectionOverridesStorageKey, JSON.stringify(profiles));
    } catch (_) {
      // ignore storage failures
    }
  }

  function readDefaultFavoriteConnectionProfileKey(storage) {
    const actualStorage = storageFor(storage);
    if (!actualStorage) return '';
    try {
      return String(actualStorage.getItem(defaultFavoriteConnectionOverrideStorageKey) || '').trim();
    } catch (_) {
      return '';
    }
  }

  function writeDefaultFavoriteConnectionProfileKey(key, storage) {
    const actualStorage = storageFor(storage);
    if (!actualStorage) return;
    const normalized = String(key || '').trim();
    try {
      if (!normalized) actualStorage.removeItem(defaultFavoriteConnectionOverrideStorageKey);
      else actualStorage.setItem(defaultFavoriteConnectionOverrideStorageKey, normalized);
    } catch (_) {
      // ignore storage failures
    }
  }

  function readDefaultFavoriteConnectionProfile(storage) {
    const key = readDefaultFavoriteConnectionProfileKey(storage);
    if (!key) return null;
    const found = readFavoriteConnectionProfiles(storage).find(item => favoriteConnectionProfileKey(item) === key) || null;
    if (found) return found;
    writeDefaultFavoriteConnectionProfileKey('', storage);
    return null;
  }

  function findFavoriteConnectionProfile(override, storage) {
    const key = connectionOverrideKey(override);
    if (!key) return null;
    return readFavoriteConnectionProfiles(storage).find(item => favoriteConnectionProfileKey(item) === key) || null;
  }

  function isFavoriteConnectionOverride(override, storage) {
    return !!findFavoriteConnectionProfile(override, storage);
  }

  function isDefaultFavoriteConnectionOverride(override, storage) {
    const key = connectionOverrideKey(override);
    if (!key) return false;
    return key === readDefaultFavoriteConnectionProfileKey(storage);
  }

  function setDefaultFavoriteConnectionOverride(override, storage) {
    const profile = findFavoriteConnectionProfile(override, storage);
    if (!profile) return null;
    writeDefaultFavoriteConnectionProfileKey(favoriteConnectionProfileKey(profile), storage);
    return profile;
  }

  function clearDefaultFavoriteConnectionOverride(storage) {
    writeDefaultFavoriteConnectionProfileKey('', storage);
  }

  function addFavoriteConnectionProfile(override, name, note, storage) {
    const normalized = sanitizeConnectionOverride(override);
    if (!normalized) return null;
    const profileName = String(name || '').trim() || defaultConnectionOverrideName(normalized);
    const profileNote = String(note || '').trim();
    const key = connectionOverrideKey(normalized);
    const nextProfile = {name: profileName, target: normalized, note: profileNote};
    const next = [nextProfile, ...readFavoriteConnectionProfiles(storage).filter(item => favoriteConnectionProfileKey(item) !== key)].slice(0, 8);
    writeFavoriteConnectionProfiles(next, storage);
    const currentDefaultKey = readDefaultFavoriteConnectionProfileKey(storage);
    if (!currentDefaultKey || !next.some(item => favoriteConnectionProfileKey(item) === currentDefaultKey)) {
      writeDefaultFavoriteConnectionProfileKey(key, storage);
    }
    return nextProfile;
  }

  function updateFavoriteConnectionProfile(originalOverride, nextOverride, name, note, storage) {
    const originalKey = connectionOverrideKey(originalOverride);
    const normalized = sanitizeConnectionOverride(nextOverride);
    if (!originalKey || !normalized) return null;
    const nextKey = connectionOverrideKey(normalized);
    const profileName = String(name || '').trim() || defaultConnectionOverrideName(normalized);
    const profileNote = String(note || '').trim();
    const profiles = readFavoriteConnectionProfiles(storage);
    const existingIndex = profiles.findIndex(item => favoriteConnectionProfileKey(item) === originalKey);
    const collisionIndex = profiles.findIndex(item => favoriteConnectionProfileKey(item) === nextKey);
    const insertIndex = existingIndex >= 0 ? existingIndex : Math.max(0, collisionIndex);
    const nextProfile = {name: profileName, target: normalized, note: profileNote};
    const filtered = profiles.filter(item => {
      const key = favoriteConnectionProfileKey(item);
      return key !== originalKey && key !== nextKey;
    });
    filtered.splice(Math.max(0, Math.min(insertIndex, filtered.length)), 0, nextProfile);
    const nextProfiles = filtered.slice(0, 8);
    writeFavoriteConnectionProfiles(nextProfiles, storage);
    const currentDefaultKey = readDefaultFavoriteConnectionProfileKey(storage);
    if (!currentDefaultKey || currentDefaultKey === originalKey || currentDefaultKey === nextKey || !nextProfiles.some(item => favoriteConnectionProfileKey(item) === currentDefaultKey)) {
      writeDefaultFavoriteConnectionProfileKey(nextKey, storage);
    }
    return nextProfile;
  }

  function removeFavoriteConnectionOverride(override, storage) {
    const key = connectionOverrideKey(override);
    if (!key) return;
    const next = readFavoriteConnectionProfiles(storage).filter(item => favoriteConnectionProfileKey(item) !== key);
    writeFavoriteConnectionProfiles(next, storage);
    const currentDefaultKey = readDefaultFavoriteConnectionProfileKey(storage);
    if (currentDefaultKey && (!next.length || currentDefaultKey === key || !next.some(item => favoriteConnectionProfileKey(item) === currentDefaultKey))) {
      writeDefaultFavoriteConnectionProfileKey(next[0] ? favoriteConnectionProfileKey(next[0]) : '', storage);
    }
  }

  function moveFavoriteConnectionOverride(override, delta, storage) {
    const key = connectionOverrideKey(override);
    if (!key) return null;
    const profiles = readFavoriteConnectionProfiles(storage);
    const index = profiles.findIndex(item => favoriteConnectionProfileKey(item) === key);
    if (index < 0) return null;
    const nextIndex = Math.max(0, Math.min(profiles.length - 1, index + Number(delta || 0)));
    if (nextIndex === index) return profiles[index] || null;
    const next = profiles.slice();
    const moved = next.splice(index, 1)[0];
    next.splice(nextIndex, 0, moved);
    writeFavoriteConnectionProfiles(next, storage);
    return moved || null;
  }

  function clearFavoriteConnectionProfiles(storage) {
    writeFavoriteConnectionProfiles([], storage);
    writeDefaultFavoriteConnectionProfileKey('', storage);
  }

  function rememberRecentConnectionOverride(override, storage) {
    const normalized = sanitizeConnectionOverride(override);
    if (!normalized) return;
    const key = connectionOverrideKey(normalized);
    const next = [normalized, ...readRecentConnectionOverrides(storage).filter(item => connectionOverrideKey(item) !== key)].slice(0, 5);
    writeRecentConnectionOverrides(next, storage);
  }

  function removeRecentConnectionOverride(override, storage) {
    const key = connectionOverrideKey(override);
    if (!key) return;
    writeRecentConnectionOverrides(readRecentConnectionOverrides(storage).filter(item => connectionOverrideKey(item) !== key), storage);
  }

  function clearRecentConnectionOverrides(storage) {
    writeRecentConnectionOverrides([], storage);
  }

  function readLastSuccessfulConnectionOverride(storage) {
    const actualStorage = storageFor(storage);
    if (!actualStorage) return null;
    try {
      const raw = actualStorage.getItem(lastSuccessfulConnectionOverrideStorageKey);
      if (!raw) return null;
      return sanitizeConnectionOverride(JSON.parse(raw));
    } catch (_) {
      return null;
    }
  }

  function writeLastSuccessfulConnectionOverride(override, storage) {
    const actualStorage = storageFor(storage);
    if (!actualStorage) return;
    const normalized = sanitizeConnectionOverride(override);
    try {
      if (!normalized) actualStorage.removeItem(lastSuccessfulConnectionOverrideStorageKey);
      else actualStorage.setItem(lastSuccessfulConnectionOverrideStorageKey, JSON.stringify(normalized));
    } catch (_) {
      // ignore storage failures
    }
  }

  function clearLastSuccessfulConnectionOverride(storage) {
    writeLastSuccessfulConnectionOverride(null, storage);
  }

  function rememberLastSuccessfulConnectionOverride(override, storage) {
    const normalized = sanitizeConnectionOverride(override);
    if (!normalized) return;
    writeLastSuccessfulConnectionOverride(normalized, storage);
    rememberRecentConnectionOverride(normalized, storage);
  }

  function buildConnectionProfileBundle(storage) {
    const favoriteProfiles = readFavoriteConnectionProfiles(storage);
    const defaultFavoriteKey = readDefaultFavoriteConnectionProfileKey(storage);
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      favoriteProfiles,
      defaultFavoriteKey: favoriteProfiles.some(item => favoriteConnectionProfileKey(item) === defaultFavoriteKey)
        ? defaultFavoriteKey
        : '',
      recentOverrides: readRecentConnectionOverrides(storage),
      lastSuccessfulOverride: readLastSuccessfulConnectionOverride(storage),
    };
  }

  function sanitizeConnectionCheckEnvironment(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const configured = raw.configured && typeof raw.configured === 'object' ? raw.configured : raw;
    const probe = raw.probe && typeof raw.probe === 'object' ? raw.probe : raw;
    const availableStones = Array.isArray(probe.availableStones)
      ? probe.availableStones
        .map(item => String(item || '').trim())
        .filter(Boolean)
        .filter((item, index, list) => list.indexOf(item) === index)
        .slice(0, 16)
      : [];
    const availableNetldis = Array.isArray(probe.availableNetldis)
      ? probe.availableNetldis
        .map(item => {
          if (!item || typeof item !== 'object') return null;
          const name = String(item.name || '').trim();
          const port = String(item.port || '').trim();
          if (!name && !port) return null;
          return {name, port};
        })
        .filter(Boolean)
        .filter((item, index, list) => list.findIndex(each => each.name === item.name && each.port === item.port) === index)
        .slice(0, 16)
      : [];
    const normalized = {
      host: String(configured.host || '').trim(),
      netldi: String(configured.netldi || '').trim(),
      gemService: String(configured.gemService || '').trim(),
      mode: String(configured.mode || '').trim(),
      availableStones,
      availableNetldis,
    };
    if (
      !normalized.host
      && !normalized.netldi
      && !normalized.gemService
      && !normalized.mode
      && !normalized.availableStones.length
      && !normalized.availableNetldis.length
    ) {
      return null;
    }
    return normalized;
  }

  function connectionCheckEnvironmentFingerprint(environment) {
    const normalized = sanitizeConnectionCheckEnvironment(environment);
    return normalized ? JSON.stringify(normalized) : '';
  }

  function connectionCheckEnvironmentFromPreflight(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const connection = raw.connection && typeof raw.connection === 'object' ? raw.connection : raw;
    return sanitizeConnectionCheckEnvironment({
      configured: connection.configured || raw.configured || {},
      probe: connection.probe || raw.probe || {},
    });
  }

  function sanitizeConnectionCheckResult(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const target = sanitizeConnectionOverride(raw.target || raw.override || null);
    if (!target) return null;
    const label = String(raw.label || defaultConnectionOverrideName(target)).trim() || defaultConnectionOverrideName(target);
    const status = String(raw.status || '').trim().toLowerCase() === 'ok' ? 'ok' : 'error';
    const checkedAt = String(raw.checkedAt || '').trim() || new Date().toISOString();
    const exception = String(raw.exception || '').trim();
    const effectiveTarget = String(raw.effectiveTarget || '').trim();
    const stoneSource = String(raw.stoneSource || '').trim();
    const environment = sanitizeConnectionCheckEnvironment(
      raw.environment
      || raw.connectionEnvironment
      || raw.environmentSummary
      || null
    );
    const environmentFingerprint = String(
      raw.environmentFingerprint
      || raw.connectionEnvironmentFingerprint
      || connectionCheckEnvironmentFingerprint(environment)
      || ''
    ).trim();
    return {
      label,
      target,
      status,
      success: status === 'ok',
      checkedAt,
      exception,
      effectiveTarget,
      stoneSource,
      environment,
      environmentFingerprint,
    };
  }

  function captureConnectionCheckResult(raw, preflight) {
    const base = sanitizeConnectionCheckResult(raw);
    if (!base) return null;
    const environment = connectionCheckEnvironmentFromPreflight(preflight);
    if (!environment) return base;
    return sanitizeConnectionCheckResult({
      ...base,
      environment,
      environmentFingerprint: connectionCheckEnvironmentFingerprint(environment),
    });
  }

  function buildConnectionCheckBundle(checks) {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      checks: Array.isArray(checks)
        ? checks.map(item => sanitizeConnectionCheckResult(item)).filter(Boolean)
        : [],
    };
  }

  function sanitizeConnectionCheckBundle(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const checks = Array.isArray(raw.checks || raw.connectionCheckResults)
      ? (raw.checks || raw.connectionCheckResults)
        .map(item => sanitizeConnectionCheckResult(item))
        .filter(Boolean)
        .filter((item, index, list) => list.findIndex(each => each.label === item.label && connectionOverrideKey(each.target) === connectionOverrideKey(item.target)) === index)
        .slice(0, 8)
      : [];
    return {
      version: Number(raw.version) || 1,
      generatedAt: String(raw.generatedAt || '').trim(),
      checks,
    };
  }

  function mergeConnectionCheckBundle(existingChecks, rawBundle, options) {
    const replace = !!(options && options.replace);
    const bundle = sanitizeConnectionCheckBundle(rawBundle);
    if (!bundle) throw new Error('invalid connection check bundle');
    const current = Array.isArray(existingChecks)
      ? existingChecks.map(item => sanitizeConnectionCheckResult(item)).filter(Boolean)
      : [];
    const nextChecks = replace
      ? bundle.checks
      : [
          ...bundle.checks,
          ...current.filter(item => !bundle.checks.some(each => each.label === item.label && connectionOverrideKey(each.target) === connectionOverrideKey(item.target))),
        ].slice(0, 8);
    return {
      importedCheckCount: bundle.checks.length,
      checkCount: nextChecks.length,
      replaced: replace,
      checks: nextChecks,
    };
  }

  function describeConnectionCheckFreshness(checkResult, currentPreflight) {
    const check = sanitizeConnectionCheckResult(checkResult);
    if (!check) {
      return {status: 'unknown', stale: false, legacy: false, label: 'Unknown', reason: ''};
    }
    const storedFingerprint = String(check.environmentFingerprint || '').trim();
    if (!storedFingerprint) {
      return {
        status: 'legacy',
        stale: false,
        legacy: true,
        label: 'Legacy',
        reason: 'saved before environment tracking was available',
      };
    }
    const currentEnvironment = connectionCheckEnvironmentFromPreflight(currentPreflight);
    const currentFingerprint = connectionCheckEnvironmentFingerprint(currentEnvironment);
    if (!currentFingerprint) {
      return {
        status: 'unknown',
        stale: false,
        legacy: false,
        label: 'Unknown',
        reason: 'current connection environment unavailable',
      };
    }
    if (storedFingerprint === currentFingerprint) {
      return {status: 'current', stale: false, legacy: false, label: 'Current', reason: ''};
    }
    const storedEnvironment = sanitizeConnectionCheckEnvironment(check.environment);
    const reasons = [];
    if (
      JSON.stringify(storedEnvironment?.availableStones || []) !== JSON.stringify(currentEnvironment?.availableStones || [])
      || JSON.stringify(storedEnvironment?.availableNetldis || []) !== JSON.stringify(currentEnvironment?.availableNetldis || [])
    ) {
      reasons.push('local probe changed');
    }
    if (
      String(storedEnvironment?.host || '') !== String(currentEnvironment?.host || '')
      || String(storedEnvironment?.netldi || '') !== String(currentEnvironment?.netldi || '')
      || String(storedEnvironment?.gemService || '') !== String(currentEnvironment?.gemService || '')
      || String(storedEnvironment?.mode || '') !== String(currentEnvironment?.mode || '')
    ) {
      reasons.push('server config changed');
    }
    return {
      status: 'stale',
      stale: true,
      legacy: false,
      label: 'Stale',
      reason: reasons.join(' · ') || 'connection environment changed',
    };
  }

  function sanitizeConnectionProfileBundle(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const favoriteProfiles = Array.isArray(raw.favoriteProfiles)
      ? raw.favoriteProfiles
        .map(item => sanitizeFavoriteConnectionProfile(item))
        .filter(Boolean)
        .filter((item, index, list) => list.findIndex(each => favoriteConnectionProfileKey(each) === favoriteConnectionProfileKey(item)) === index)
        .slice(0, 8)
      : [];
    const defaultFavoriteKey = String(raw.defaultFavoriteKey || '').trim();
    const recentOverrides = Array.isArray(raw.recentOverrides)
      ? raw.recentOverrides
        .map(item => sanitizeConnectionOverride(item))
        .filter(Boolean)
        .filter((item, index, list) => list.findIndex(each => connectionOverrideKey(each) === connectionOverrideKey(item)) === index)
        .slice(0, 5)
      : [];
    return {
      version: Number(raw.version) || 1,
      generatedAt: String(raw.generatedAt || '').trim(),
      favoriteProfiles,
      defaultFavoriteKey: favoriteProfiles.some(item => favoriteConnectionProfileKey(item) === defaultFavoriteKey)
        ? defaultFavoriteKey
        : '',
      recentOverrides,
      lastSuccessfulOverride: sanitizeConnectionOverride(raw.lastSuccessfulOverride),
    };
  }

  function importConnectionProfileBundle(rawBundle, storage) {
    const bundle = sanitizeConnectionProfileBundle(rawBundle);
    if (!bundle) throw new Error('invalid connection profile bundle');
    const existingFavorites = readFavoriteConnectionProfiles(storage);
    const existingRecents = readRecentConnectionOverrides(storage);
    const mergedFavorites = [
      ...bundle.favoriteProfiles,
      ...existingFavorites.filter(item => !bundle.favoriteProfiles.some(each => favoriteConnectionProfileKey(each) === favoriteConnectionProfileKey(item))),
    ].slice(0, 8);
    const mergedRecents = [
      ...bundle.recentOverrides,
      ...existingRecents.filter(item => !bundle.recentOverrides.some(each => connectionOverrideKey(each) === connectionOverrideKey(item))),
    ].slice(0, 5);
    writeFavoriteConnectionProfiles(mergedFavorites, storage);
    writeRecentConnectionOverrides(mergedRecents, storage);
    if (bundle.lastSuccessfulOverride) writeLastSuccessfulConnectionOverride(bundle.lastSuccessfulOverride, storage);
    const importedDefault = mergedFavorites.find(item => favoriteConnectionProfileKey(item) === bundle.defaultFavoriteKey) || null;
    if (importedDefault) writeDefaultFavoriteConnectionProfileKey(favoriteConnectionProfileKey(importedDefault), storage);
    else if (!readDefaultFavoriteConnectionProfileKey(storage) && mergedFavorites[0]) writeDefaultFavoriteConnectionProfileKey(favoriteConnectionProfileKey(mergedFavorites[0]), storage);
    return {
      favoriteCount: mergedFavorites.length,
      importedFavoriteCount: bundle.favoriteProfiles.length,
      recentCount: mergedRecents.length,
      importedRecentCount: bundle.recentOverrides.length,
      defaultFavoriteProfile: importedDefault || readDefaultFavoriteConnectionProfile(storage),
      lastSuccessfulOverride: bundle.lastSuccessfulOverride,
    };
  }

  function replaceConnectionProfileBundle(rawBundle, storage) {
    const bundle = sanitizeConnectionProfileBundle(rawBundle);
    if (!bundle) throw new Error('invalid connection profile bundle');
    writeFavoriteConnectionProfiles(bundle.favoriteProfiles, storage);
    writeRecentConnectionOverrides(bundle.recentOverrides, storage);
    if (bundle.lastSuccessfulOverride) writeLastSuccessfulConnectionOverride(bundle.lastSuccessfulOverride, storage);
    else clearLastSuccessfulConnectionOverride(storage);
    const importedDefault = bundle.favoriteProfiles.find(item => favoriteConnectionProfileKey(item) === bundle.defaultFavoriteKey) || null;
    if (importedDefault) writeDefaultFavoriteConnectionProfileKey(favoriteConnectionProfileKey(importedDefault), storage);
    else if (bundle.favoriteProfiles[0]) writeDefaultFavoriteConnectionProfileKey(favoriteConnectionProfileKey(bundle.favoriteProfiles[0]), storage);
    else writeDefaultFavoriteConnectionProfileKey('', storage);
    return {
      favoriteCount: bundle.favoriteProfiles.length,
      importedFavoriteCount: bundle.favoriteProfiles.length,
      recentCount: bundle.recentOverrides.length,
      importedRecentCount: bundle.recentOverrides.length,
      defaultFavoriteProfile: importedDefault || readDefaultFavoriteConnectionProfile(storage),
      lastSuccessfulOverride: bundle.lastSuccessfulOverride,
    };
  }

  return {
    connectionOverrideStorageKey,
    lastSuccessfulConnectionOverrideStorageKey,
    favoriteConnectionOverridesStorageKey,
    defaultFavoriteConnectionOverrideStorageKey,
    recentConnectionOverridesStorageKey,
    sanitizeConnectionOverride,
    readConnectionOverride,
    connectionOverrideKey,
    defaultConnectionOverrideName,
    sanitizeFavoriteConnectionProfile,
    favoriteConnectionProfileKey,
    readRecentConnectionOverrides,
    readFavoriteConnectionProfiles,
    writeRecentConnectionOverrides,
    writeFavoriteConnectionProfiles,
    readDefaultFavoriteConnectionProfileKey,
    writeDefaultFavoriteConnectionProfileKey,
    readDefaultFavoriteConnectionProfile,
    findFavoriteConnectionProfile,
    isFavoriteConnectionOverride,
    isDefaultFavoriteConnectionOverride,
    setDefaultFavoriteConnectionOverride,
    clearDefaultFavoriteConnectionOverride,
    addFavoriteConnectionProfile,
    updateFavoriteConnectionProfile,
    removeFavoriteConnectionOverride,
    moveFavoriteConnectionOverride,
    clearFavoriteConnectionProfiles,
    rememberRecentConnectionOverride,
    removeRecentConnectionOverride,
    clearRecentConnectionOverrides,
    readLastSuccessfulConnectionOverride,
    writeLastSuccessfulConnectionOverride,
    clearLastSuccessfulConnectionOverride,
    rememberLastSuccessfulConnectionOverride,
    buildConnectionProfileBundle,
    sanitizeConnectionCheckEnvironment,
    connectionCheckEnvironmentFingerprint,
    connectionCheckEnvironmentFromPreflight,
    sanitizeConnectionCheckResult,
    captureConnectionCheckResult,
    buildConnectionCheckBundle,
    sanitizeConnectionCheckBundle,
    mergeConnectionCheckBundle,
    describeConnectionCheckFreshness,
    sanitizeConnectionProfileBundle,
    importConnectionProfileBundle,
    replaceConnectionProfileBundle,
  };
});
