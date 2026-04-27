(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DockLauncherModel = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const pinnedStorageKey = 'python-gemstone-dock-launcher-pinned-v1';
  const defaultPinnedCommands = [
    'open-workspace',
    'open-class-browser',
    'open-object-browser',
    'open-symbol-list',
    'open-connection',
  ];

  function normalizeAllowedCommands(allowedCommands = []) {
    return Array.from(new Set(
      (Array.isArray(allowedCommands) ? allowedCommands : [])
        .map(command => String(command || '').trim())
        .filter(Boolean)
    ));
  }

  function normalizePinnedCommands(commands = [], allowedCommands = []) {
    const allowed = normalizeAllowedCommands(allowedCommands);
    const allowedSet = new Set(allowed);
    return Array.from(new Set(
      (Array.isArray(commands) ? commands : [])
        .map(command => String(command || '').trim())
        .filter(command => !!command && (!allowedSet.size || allowedSet.has(command)))
    ));
  }

  function getDefaultPinnedCommands(allowedCommands = [], defaults = defaultPinnedCommands) {
    const allowed = normalizeAllowedCommands(allowedCommands);
    const normalizedDefaults = normalizePinnedCommands(defaults, allowed);
    if (normalizedDefaults.length) return normalizedDefaults;
    return allowed.slice(0, Math.min(5, allowed.length));
  }

  function readPinnedCommands(storage, storageKey = pinnedStorageKey, allowedCommands = [], defaults = defaultPinnedCommands) {
    const fallback = getDefaultPinnedCommands(allowedCommands, defaults);
    try {
      const raw = storage?.getItem?.(storageKey);
      if (raw == null) return fallback;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return fallback;
      return normalizePinnedCommands(parsed, allowedCommands);
    } catch (_) {
      return fallback;
    }
  }

  function writePinnedCommands(commands, storage, storageKey = pinnedStorageKey, allowedCommands = []) {
    const normalized = normalizePinnedCommands(commands, allowedCommands);
    try {
      storage?.setItem?.(storageKey, JSON.stringify(normalized));
    } catch (_) {
      // Ignore localStorage failures in restricted/private browser modes.
    }
    return normalized;
  }

  function togglePinnedCommand(commands = [], command, allowedCommands = []) {
    const normalizedCommand = String(command || '').trim();
    if (!normalizedCommand) return normalizePinnedCommands(commands, allowedCommands);
    const current = normalizePinnedCommands(commands, allowedCommands);
    const allowed = normalizeAllowedCommands(allowedCommands);
    if (allowed.length && !allowed.includes(normalizedCommand)) return current;
    if (current.includes(normalizedCommand)) {
      return current.filter(each => each !== normalizedCommand);
    }
    return [...current, normalizedCommand];
  }

  return {
    pinnedStorageKey,
    defaultPinnedCommands,
    normalizePinnedCommands,
    getDefaultPinnedCommands,
    readPinnedCommands,
    writePinnedCommands,
    togglePinnedCommand,
  };
});
