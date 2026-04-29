(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ConnectionWindowProfilesRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createConnectionWindowProfilesRuntime(deps = {}) {
    const {
      id,
      getLatestPreflight,
      getLatestStartupError,
      syncConnectionWindowState,
      renderConnection,
      refreshConnection,
      retryStartup,
    } = deps;

    function buildFixShell() {
      return deps.buildConnectionFixShell(getLatestPreflight());
    }

    function shouldAutoRecoverStartup() {
      return !deps.startupBootstrapped() || !!getLatestStartupError();
    }

    async function applyConnectionTargetAction(override, successLabel) {
      const normalized = deps.persistConnectionOverride(override);
      if (!normalized) {
        deps.setStatus(false, 'no connection target available');
        return false;
      }
      deps.setStatus(true, `${successLabel}: ${deps.summarizeConnectionOverride(normalized)}`);
      if (shouldAutoRecoverStartup()) {
        await retryStartup();
      } else {
        await refreshConnection();
      }
      return true;
    }

    async function copyNamedConnectionTargetShell(override, label) {
      const shell = deps.buildShellForOverride(override);
      if (!shell) {
        deps.setStatus(false, `no shell export available for ${label}`);
        return false;
      }
      try {
        await deps.copyTextToClipboard(shell);
        deps.setStatus(true, `copied shell for ${label}`);
        return true;
      } catch (e) {
        deps.setStatus(false, e.message);
        return false;
      }
    }

    function suggestedOverrideFromPayload(payload = getLatestPreflight()) {
      return deps.suggestedConnectionOverrideFromPayloadModel(payload, deps.sanitizeConnectionOverride);
    }

    function configuredOverrideSeed(payload = getLatestPreflight()) {
      return deps.buildConfiguredConnectionOverrideSeedModel(payload, deps.readConnectionOverride(), deps.sanitizeConnectionOverride);
    }

    function localStoneOverridesFromPayload(payload = getLatestPreflight()) {
      return deps.localStoneOverridesFromPayloadModel(payload);
    }

    function currentConnectionTargetOverride(payload = getLatestPreflight()) {
      return deps.currentConnectionTargetOverrideModel(payload, deps.readConnectionOverride(), deps.sanitizeConnectionOverride);
    }

    function favoriteProfileForOverride(override, profiles = deps.readFavoriteConnectionProfiles()) {
      return deps.favoriteProfileForOverrideModel(override, profiles, deps.connectionOverrideKey);
    }

    async function saveConnectionTargetAsFavorite(target, options = {}) {
      const normalized = deps.sanitizeConnectionOverride(target);
      if (!normalized) {
        deps.setStatus(false, 'no connection target available to save');
        return null;
      }
      const currentProfile = favoriteProfileForOverride(normalized);
      const baseName = currentProfile?.name || String(options.suggestedName || '').trim() || deps.defaultConnectionOverrideName(normalized);
      const baseNote = currentProfile?.note || String(options.suggestedNote || '').trim();
      const values = await deps.requestModal(currentProfile ? 'Rename Favorite Target' : 'Save Favorite Target', [{
        id: `${id}-favorite-name`,
        label: 'Name',
        value: baseName,
        placeholder: baseName,
      }, {
        id: `${id}-favorite-note`,
        label: 'Note',
        type: 'textarea',
        value: baseNote,
        placeholder: 'Optional note about this saved target',
      }], {
        okLabel: currentProfile ? 'Rename Favorite' : 'Save Favorite',
        message: options.message || 'Saved favorite targets stay available in the Connection window even after recents change.',
      });
      if (!values) return null;
      const profileName = String(values[`${id}-favorite-name`] || '').trim() || baseName;
      const profileNote = String(values[`${id}-favorite-note`] || '').trim();
      const saved = deps.addFavoriteConnectionProfile(normalized, profileName, profileNote);
      deps.setStatus(true, `${currentProfile ? 'renamed' : 'saved'} favorite target ${saved.name}: ${deps.summarizeConnectionOverride(saved.target)}`);
      deps.notifyLiveWindowUpdated();
      renderConnection(getLatestPreflight(), getLatestStartupError());
      return saved;
    }

    async function editFavoriteTargetProfile(favorite) {
      if (!favorite) {
        deps.setStatus(false, 'no favorite target available to edit');
        return null;
      }
      const current = deps.sanitizeConnectionOverride(favorite.target);
      if (!current) {
        deps.setStatus(false, 'favorite target is invalid');
        return null;
      }
      const values = await deps.requestModal(`Edit Favorite Target ${favorite.name}`, [
        {
          id: `${id}-edit-favorite-name`,
          label: 'Name',
          value: favorite.name || deps.defaultConnectionOverrideName(current),
          placeholder: favorite.name || deps.defaultConnectionOverrideName(current),
        },
        {
          id: `${id}-edit-favorite-note`,
          label: 'Note',
          type: 'textarea',
          value: favorite.note || '',
          placeholder: 'Optional note about this saved target',
        },
        {
          id: `${id}-edit-favorite-stone`,
          label: 'Stone',
          value: current.stone || '',
          placeholder: 'stone name',
        },
        {
          id: `${id}-edit-favorite-host`,
          label: 'Host',
          value: current.host || '',
          placeholder: 'host',
        },
        {
          id: `${id}-edit-favorite-netldi`,
          label: 'NetLDI',
          value: current.netldi || '',
          placeholder: 'netldi port or service',
        },
        {
          id: `${id}-edit-favorite-gem-service`,
          label: 'Gem Service',
          value: current.gemService || '',
          placeholder: 'gem service',
        },
      ], {
        okLabel: 'Save Favorite',
        message: 'Edit the saved target details without changing the active override.',
      });
      if (!values) return null;
      const nextTarget = deps.sanitizeConnectionOverride({
        stone: values[`${id}-edit-favorite-stone`] || '',
        host: values[`${id}-edit-favorite-host`] || '',
        netldi: values[`${id}-edit-favorite-netldi`] || '',
        gemService: values[`${id}-edit-favorite-gem-service`] || '',
      });
      if (!nextTarget) {
        deps.setStatus(false, 'favorite target must include at least one connection field');
        return null;
      }
      const nextName = String(values[`${id}-edit-favorite-name`] || '').trim() || favorite.name || deps.defaultConnectionOverrideName(nextTarget);
      const nextNote = String(values[`${id}-edit-favorite-note`] || '').trim();
      const updated = deps.updateFavoriteConnectionProfile(favorite.target, nextTarget, nextName, nextNote);
      if (!updated) {
        deps.setStatus(false, 'failed to update favorite target');
        return null;
      }
      deps.setStatus(true, `updated favorite target ${updated.name}: ${deps.summarizeConnectionOverride(updated.target)}`);
      deps.notifyLiveWindowUpdated();
      renderConnection(getLatestPreflight(), getLatestStartupError());
      return updated;
    }

    async function copyConnectionProfiles() {
      try {
        await deps.copyTextToClipboard(JSON.stringify(deps.buildConnectionProfileBundle(), null, 2));
        deps.setStatus(true, 'copied connection profiles');
      } catch (e) {
        deps.setStatus(false, e.message);
      }
    }

    function downloadConnectionProfiles() {
      const stamp = new Date().toISOString().replace(/[:]/g, '-');
      deps.downloadDataFile(`connection-profiles-${stamp}.json`, JSON.stringify(deps.buildConnectionProfileBundle(), null, 2), 'application/json;charset=utf-8');
      deps.setStatus(true, 'downloaded connection profiles');
    }

    async function applySuggestedOverride() {
      const override = suggestedOverrideFromPayload();
      if (!override) {
        deps.setStatus(false, 'no suggested target available');
        return;
      }
      await applyConnectionTargetAction(override, 'applied connection override');
    }

    async function saveSuggestedOverrideAsFavorite() {
      const override = suggestedOverrideFromPayload();
      if (!override) {
        deps.setStatus(false, 'no suggested target available');
        return;
      }
      await saveConnectionTargetAsFavorite(override, {
        suggestedName: deps.defaultConnectionOverrideName(override),
        message: 'Save or rename the current suggested target as a reusable favorite profile without changing the active override.',
      });
    }

    async function editOverride() {
      const seed = configuredOverrideSeed();
      const values = await deps.requestModal('Edit Connection Override', [
        {
          id: `${id}-override-stone`,
          label: 'Stone',
          value: seed.current?.stone || '',
          placeholder: seed.placeholders.stone || 'stone name',
        },
        {
          id: `${id}-override-host`,
          label: 'Host',
          value: seed.current?.host || '',
          placeholder: seed.placeholders.host || 'host',
        },
        {
          id: `${id}-override-netldi`,
          label: 'NetLDI',
          value: seed.current?.netldi || '',
          placeholder: seed.placeholders.netldi || 'netldi port or service',
        },
        {
          id: `${id}-override-gem-service`,
          label: 'Gem Service',
          value: seed.current?.gemService || '',
          placeholder: seed.placeholders.gemService || 'gem service',
        },
      ], {
        message: 'Leave fields blank to remove the browser-local override and fall back to the server environment.',
        okLabel: 'Apply Override',
      });
      if (!values) return;
      const override = {
        stone: values[`${id}-override-stone`] || '',
        host: values[`${id}-override-host`] || '',
        netldi: values[`${id}-override-netldi`] || '',
        gemService: values[`${id}-override-gem-service`] || '',
      };
      const normalized = deps.sanitizeConnectionOverride(override);
      if (!normalized) {
        deps.clearConnectionOverride();
        deps.setStatus(true, 'cleared connection override');
        await refreshConnection();
        return;
      }
      await applyConnectionTargetAction(normalized, 'applied connection override');
    }

    async function toggleFavoriteCurrentTarget() {
      const target = currentConnectionTargetOverride();
      if (!target) {
        deps.setStatus(false, 'no current target to save');
        return;
      }
      await saveConnectionTargetAsFavorite(target);
    }

    async function importConnectionProfilesFromModal(options = {}) {
      const replace = !!options.replace;
      const values = await deps.requestModal(replace ? 'Replace Connection Profiles' : 'Import Connection Profiles', [{
        id: `${id}-import-profiles-json`,
        label: 'Profile JSON',
        type: 'textarea',
        placeholder: '{"version":1,"favoriteProfiles":[...]}',
        value: '',
      }], {
        okLabel: replace ? 'Replace Profiles' : 'Import Profiles',
        message: replace
          ? 'Paste a connection profile bundle exported from Copy Profiles or Download Profiles. This replaces the current favorites, recents, default favorite, and last working target.'
          : 'Paste a connection profile bundle exported from Copy Profiles or Download Profiles. Imported favorites and recents are merged into the current browser state.',
      });
      if (!values) return;
      const raw = String(values[`${id}-import-profiles-json`] || '').trim();
      if (!raw) {
        deps.setStatus(false, 'no connection profile JSON provided');
        return;
      }
      try {
        const imported = replace
          ? deps.replaceConnectionProfileBundle(JSON.parse(raw))
          : deps.importConnectionProfileBundle(JSON.parse(raw));
        const defaultLabel = imported.defaultFavoriteProfile ? `; default ${imported.defaultFavoriteProfile.name}` : '';
        const verb = replace ? 'replaced' : 'imported';
        deps.setStatus(true, `${verb} ${imported.importedFavoriteCount} favorite target${imported.importedFavoriteCount === 1 ? '' : 's'} and ${imported.importedRecentCount} recent target${imported.importedRecentCount === 1 ? '' : 's'}${defaultLabel}`);
        deps.notifyLiveWindowUpdated();
        renderConnection(getLatestPreflight(), getLatestStartupError());
      } catch (e) {
        deps.setStatus(false, `profile import failed: ${e.message}`);
      }
    }

    async function clearOverrideAndRefresh() {
      deps.clearConnectionOverride();
      deps.setStatus(true, 'cleared connection override');
      await refreshConnection();
    }

    async function clearFavoriteProfilesWithConfirm() {
      const favorites = deps.readFavoriteConnectionProfiles();
      if (!favorites.length) {
        deps.setStatus(false, 'no favorite targets to clear');
        return;
      }
      const confirmed = await deps.requestConfirmModal('Clear Favorite Targets', `Forget all ${favorites.length} saved favorite target${favorites.length === 1 ? '' : 's'}?`, {
        okLabel: 'Clear Favorites',
      });
      if (!confirmed) return;
      deps.clearFavoriteConnectionProfiles();
      deps.setStatus(true, `cleared ${favorites.length} favorite target${favorites.length === 1 ? '' : 's'}`);
      deps.notifyLiveWindowUpdated();
      renderConnection(getLatestPreflight(), getLatestStartupError());
    }

    async function clearRecentTargetsWithConfirm() {
      const recents = deps.readRecentConnectionOverrides();
      if (!recents.length) {
        deps.setStatus(false, 'no recent targets to clear');
        return;
      }
      const confirmed = await deps.requestConfirmModal('Clear Recent Targets', `Forget all ${recents.length} recent target${recents.length === 1 ? '' : 's'}?`, {
        okLabel: 'Clear Recents',
      });
      if (!confirmed) return;
      deps.clearRecentConnectionOverrides();
      deps.setStatus(true, `cleared ${recents.length} recent target${recents.length === 1 ? '' : 's'}`);
      deps.notifyLiveWindowUpdated();
      renderConnection(getLatestPreflight(), getLatestStartupError());
    }

    async function clearLastWorkingTargetWithConfirm() {
      const saved = deps.readLastSuccessfulConnectionOverride();
      if (!saved) {
        deps.setStatus(false, 'no last working target to clear');
        return;
      }
      const confirmed = await deps.requestConfirmModal('Clear Last Working Target', `Forget the saved last working target ${deps.summarizeConnectionOverride(saved)}?`, {
        okLabel: 'Clear Last Working',
      });
      if (!confirmed) return;
      deps.clearLastSuccessfulConnectionOverride();
      deps.setStatus(true, `cleared last working target: ${deps.summarizeConnectionOverride(saved)}`);
      deps.notifyLiveWindowUpdated();
      renderConnection(getLatestPreflight(), getLatestStartupError());
    }

    return {
      buildFixShell,
      shouldAutoRecoverStartup,
      applyConnectionTargetAction,
      copyNamedConnectionTargetShell,
      suggestedOverrideFromPayload,
      configuredOverrideSeed,
      localStoneOverridesFromPayload,
      currentConnectionTargetOverride,
      favoriteProfileForOverride,
      saveConnectionTargetAsFavorite,
      editFavoriteTargetProfile,
      copyConnectionProfiles,
      downloadConnectionProfiles,
      applySuggestedOverride,
      saveSuggestedOverrideAsFavorite,
      editOverride,
      toggleFavoriteCurrentTarget,
      importConnectionProfilesFromModal,
      clearOverrideAndRefresh,
      clearFavoriteProfilesWithConfirm,
      clearRecentTargetsWithConfirm,
      clearLastWorkingTargetWithConfirm,
    };
  }

  return {
    createConnectionWindowProfilesRuntime,
  };
});
