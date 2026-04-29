(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SymbolListWindowRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function buildSymbolListWindowState({sessionChannel = '', user = '', dictionary = '', key = ''} = {}) {
    return {
      kind: 'symbol-list',
      sessionChannel: String(sessionChannel || ''),
      user: String(user || ''),
      dictionary: String(dictionary || ''),
      key: String(key || ''),
    };
  }

  function sortSymbolListEntries(entries = []) {
    return (Array.isArray(entries) ? entries : []).slice().sort((a, b) => String(a).localeCompare(String(b), undefined, {sensitivity: 'base'}));
  }

  function buildSymbolListWindowHtml(id) {
    return `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-bottom:1px solid #313244;flex-shrink:0;background:#1e1e2e">
      <label style="font-size:11px;white-space:nowrap">Symbol List for</label>
      <select id="${id}-user" style="flex:1;background:#24273a;color:#cdd6f4;border:1px solid #45475a;border-radius:3px;padding:3px 6px;font-size:12px">
        <option>— loading —</option>
      </select>
    </div>
    <div class="sl-two-col" style="height:200px;border-bottom:1px solid #313244;flex-shrink:0">
      <div class="sl-col" style="width:200px;border-right:1px solid #313244">
        <div class="sl-col-header">
          <span class="sl-col-label">Dictionaries</span>
          <button class="sl-add-btn" id="${id}-add-dict">+</button>
        </div>
        <ul class="sl-list" id="${id}-dicts"></ul>
      </div>
      <div class="sl-col" style="flex:1">
        <div class="sl-col-header">
          <span class="sl-col-label">Entries</span>
          <button class="sl-add-btn" id="${id}-add-entry">+</button>
        </div>
        <ul class="sl-list" id="${id}-entries"></ul>
      </div>
    </div>
    <div class="sl-sel-row">
      <span class="sl-sel-label">Selection</span>
      <span class="sl-sel-val" id="${id}-selval"></span>
      <button class="btn-ghost hidden" id="${id}-inspect" style="margin-left:auto;font-size:10px">Inspect ›</button>
    </div>
    <div style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#6c7086;padding:4px 8px 2px;background:#1e1e2e">Keys / Values</div>
    <div style="flex:1;overflow-y:auto">
      <table class="dbtable" style="width:100%">
        <thead><tr><th>Key</th><th>Value</th></tr></thead>
        <tbody id="${id}-kv"></tbody>
      </table>
    </div>
    <div class="sl-preview">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#6c7086;padding:4px 8px 2px;background:#1e1e2e">PrintString</div>
      <div class="sl-printstring" id="${id}-ps"></div>
    </div>
    <div class="txbar">
      <span>Transaction:</span>
      <button class="btn-tx" id="${id}-abort">Abort</button>
      <button class="btn-tx" id="${id}-commit">Commit</button>
    </div>
  `;
  }

  function createSymbolListWindowRuntime(config = {}) {
    const {
      id,
      body,
      options = {},
      sessionChannel = '',
      symbolListApi = async () => ({success: false}),
      symbolListApiPost = async () => ({success: false}),
      symbolListApiTransaction = async () => ({success: false}),
      upsertWindowState = () => {},
      openLinkedObjectWindow = () => {},
      makeChip = () => null,
      isLeafBasetype = () => true,
      setStatus = () => {},
      escHtml = value => String(value ?? ''),
      requestModal = async () => null,
      requestConfirmModal = async () => false,
    } = config;

    let slUser = null;
    let slDict = null;
    let slKey = null;
    let slKeyOop = null;

    function syncSymbolListWindowState() {
      upsertWindowState(id, buildSymbolListWindowState({
        sessionChannel,
        user: slUser || '',
        dictionary: slDict || '',
        key: slKey || '',
      }));
    }

    function clearKV() {
      body.querySelector(`#${id}-selval`).textContent = '';
      body.querySelector(`#${id}-inspect`).classList.add('hidden');
      body.querySelector(`#${id}-kv`).innerHTML = '';
      body.querySelector(`#${id}-ps`).textContent = '';
    }

    async function selectEntry(key, liEl) {
      slKey = key;
      slKeyOop = null;
      body.querySelector(`#${id}-entries`).querySelectorAll('li').forEach(l => l.classList.remove('active'));
      liEl.classList.add('active');
      body.querySelector(`#${id}-selval`).textContent = key;
      body.querySelector(`#${id}-inspect`).classList.add('hidden');
      clearKV();
      syncSymbolListWindowState();
      const kv = body.querySelector(`#${id}-kv`);
      kv.innerHTML = '<tr><td colspan="2" style="color:#6c7086"><span class="spinner"></span> Loading…</td></tr>';
      try {
        const d = await symbolListApi(`/symbol-list/preview/${encodeURIComponent(slUser)}/${encodeURIComponent(slDict)}/${encodeURIComponent(key)}`);
        if (!d.success) throw new Error(d.exception);
        slKeyOop = d.oop || null;
        syncSymbolListWindowState();
        if (slKeyOop) body.querySelector(`#${id}-inspect`).classList.remove('hidden');
        body.querySelector(`#${id}-ps`).textContent = d.inspection || 'nil';
        kv.innerHTML = '';
        const pairs = Object.values(d.instVars || {});
        if (!pairs.length) {
          kv.innerHTML = '<tr><td colspan="2" style="color:#6c7086;font-style:italic">(no entries)</td></tr>';
          return;
        }
        for (const [nv, vv] of pairs) {
          const tr = document.createElement('tr');
          const tk = document.createElement('td');
          tk.className = 'col-key';
          tk.textContent = nv.inspection || '';
          const tv = document.createElement('td');
          tv.className = 'col-val';
          const isLeaf = isLeafBasetype(vv.basetype);
          if (!isLeaf && vv.oop) {
            const chip = makeChip(vv.inspection || `oop:${vv.oop}`, vv.oop, id);
            if (chip) tv.appendChild(chip);
          } else {
            tv.textContent = vv.inspection || 'nil';
          }
          tr.append(tk, tv);
          kv.appendChild(tr);
        }
        if (d.instVarsSize > pairs.length) {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td colspan="2" style="color:#6c7086;font-size:10px">${pairs.length} of ${d.instVarsSize}</td>`;
          kv.appendChild(tr);
        }
      } catch (error) {
        kv.innerHTML = `<tr><td colspan="2" style="color:#f38ba8">${escHtml(error.message)}</td></tr>`;
      }
    }

    function makeEntryItem(key) {
      const li = document.createElement('li');
      const sp = document.createElement('span');
      sp.className = 'sl-name';
      sp.textContent = key;
      const del = document.createElement('button');
      del.className = 'sl-del';
      del.textContent = '✕';
      del.addEventListener('click', async event => {
        event.stopPropagation();
        const confirmed = await requestConfirmModal('Remove Entry', `Remove "${key}"?`, {okLabel: 'Remove'});
        if (!confirmed) return;
        try {
          const r = await symbolListApiPost('/symbol-list/remove-entry', {user: slUser, dictionary: slDict, key});
          if (!r.success) throw new Error(r.exception);
          li.remove();
          if (slKey === key) {
            slKey = null;
            slKeyOop = null;
            clearKV();
            syncSymbolListWindowState();
          }
        } catch (error) {
          setStatus(false, 'Error: ' + error.message);
        }
      });
      li.append(sp, del);
      li.addEventListener('click', () => selectEntry(key, li));
      return li;
    }

    async function loadEntries(user, dict, preferredKey = '') {
      const ul = body.querySelector(`#${id}-entries`);
      ul.innerHTML = '<li style="color:#6c7086;cursor:default"><span class="spinner"></span></li>';
      try {
        const d = await symbolListApi(`/symbol-list/entries/${encodeURIComponent(user)}/${encodeURIComponent(dict)}`);
        if (!d.success) throw new Error(d.exception);
        ul.innerHTML = '';
        const sorted = sortSymbolListEntries(d.entries);
        let preferred = null;
        sorted.forEach(key => {
          const li = makeEntryItem(key);
          ul.appendChild(li);
          if (preferredKey && key === preferredKey) preferred = {key, li};
        });
        if (preferred) await selectEntry(preferred.key, preferred.li);
      } catch (error) {
        ul.innerHTML = `<li style="color:#f38ba8;cursor:default">${escHtml(error.message)}</li>`;
      }
    }

    async function selectDict(name, liEl, preferredKey = '') {
      slDict = name;
      slKey = null;
      slKeyOop = null;
      clearKV();
      body.querySelector(`#${id}-dicts`).querySelectorAll('li').forEach(l => l.classList.remove('active'));
      liEl.classList.add('active');
      syncSymbolListWindowState();
      await loadEntries(slUser, name, preferredKey);
    }

    function makeDictItem(name) {
      const li = document.createElement('li');
      const sp = document.createElement('span');
      sp.className = 'sl-name';
      sp.textContent = name;
      const del = document.createElement('button');
      del.className = 'sl-del';
      del.textContent = '✕';
      del.addEventListener('click', async event => {
        event.stopPropagation();
        const confirmed = await requestConfirmModal('Remove Dictionary', `Remove "${name}"?`, {okLabel: 'Remove'});
        if (!confirmed) return;
        try {
          const r = await symbolListApiPost('/symbol-list/remove-dictionary', {user: slUser, name});
          if (!r.success) throw new Error(r.exception);
          li.remove();
          if (slDict === name) {
            slDict = null;
            body.querySelector(`#${id}-entries`).innerHTML = '';
            clearKV();
            syncSymbolListWindowState();
          }
        } catch (error) {
          setStatus(false, 'Error: ' + error.message);
        }
      });
      li.append(sp, del);
      li.addEventListener('click', () => selectDict(name, li));
      return li;
    }

    async function loadDicts(user, preferredDict = '', preferredKey = '') {
      const ul = body.querySelector(`#${id}-dicts`);
      ul.innerHTML = '<li style="color:#6c7086;cursor:default"><span class="spinner"></span></li>';
      try {
        const d = await symbolListApi(`/symbol-list/dictionaries/${encodeURIComponent(user)}`);
        if (!d.success) throw new Error(d.exception);
        ul.innerHTML = '';
        let first = null;
        let preferred = null;
        for (const name of d.dictionaries) {
          const li = makeDictItem(name);
          ul.appendChild(li);
          if (!first) first = {li, name};
          if (preferredDict && name === preferredDict) preferred = {li, name};
        }
        const selection = preferred || first;
        if (selection) selectDict(selection.name, selection.li, preferredKey);
      } catch (error) {
        ul.innerHTML = `<li style="color:#f38ba8;cursor:default">${escHtml(error.message)}</li>`;
      }
    }

    async function loadUsers() {
      const sel = body.querySelector(`#${id}-user`);
      sel.innerHTML = '<option>— loading —</option>';
      try {
        const d = await symbolListApi('/symbol-list/users');
        if (!d.success) throw new Error(d.exception);
        sel.innerHTML = '';
        d.users.forEach(user => {
          const option = document.createElement('option');
          option.value = user;
          option.textContent = user;
          sel.appendChild(option);
        });
        if (d.users.length) {
          const pref = 'DataCurator';
          const preferredUser = options.user && d.users.includes(options.user) ? options.user : null;
          slUser = preferredUser || (d.users.includes(pref) ? pref : d.users[0]);
          sel.value = slUser;
          syncSymbolListWindowState();
          await loadDicts(slUser, options.dictionary || '', options.key || '');
        }
      } catch (error) {
        sel.innerHTML = `<option>${escHtml(error.message)}</option>`;
      }
    }

    async function promptAddDictionary() {
      if (!slUser) {
        setStatus(false, 'Select a user first');
        return;
      }
      const vals = await requestModal('Add Dictionary', [{
        label: 'Name',
        id: 'm-dn',
        type: 'input',
        placeholder: 'MyDictionary',
      }]);
      const name = String(vals?.['m-dn'] || '').trim();
      if (!name) return;
      const r = await symbolListApiPost('/symbol-list/add-dictionary', {user: slUser, name});
      if (!r.success) throw new Error(r.exception);
      await loadDicts(slUser, name);
    }

    async function promptAddEntry() {
      if (!slUser || !slDict) {
        setStatus(false, 'Select a dictionary first');
        return;
      }
      const vals = await requestModal('Add Entry', [
        {label: 'Key', id: 'm-ek', type: 'input', placeholder: 'myKey'},
        {label: 'Value (Smalltalk)', id: 'm-ev', type: 'textarea', placeholder: 'nil'},
      ]);
      const key = String(vals?.['m-ek'] || '').trim();
      const value = String(vals?.['m-ev'] || '').trim() || 'nil';
      if (!key) return;
      const r = await symbolListApiPost('/symbol-list/add-entry', {
        user: slUser,
        dictionary: slDict,
        key,
        value,
      });
      if (!r.success) throw new Error(r.exception);
      await loadEntries(slUser, slDict, key);
    }

    function mount() {
      body.innerHTML = buildSymbolListWindowHtml(id);

      body.querySelector(`#${id}-inspect`).addEventListener('click', () => {
        if (!slKeyOop) return;
        openLinkedObjectWindow({oop: slKeyOop, text: slKey || 'object', sourceWinId: id});
      });
      body.querySelector(`#${id}-abort`).addEventListener('click', async () => {
        try {
          const d = await symbolListApiTransaction('/transaction/abort');
          setStatus(d.success, d.success ? 'aborted' : d.exception);
          if (d.success && slUser) loadDicts(slUser);
        } catch (error) {
          setStatus(false, error.message);
        }
      });
      body.querySelector(`#${id}-commit`).addEventListener('click', async () => {
        try {
          const d = await symbolListApiTransaction('/transaction/commit');
          setStatus(d.success, d.success ? 'committed' : d.exception);
        } catch (error) {
          setStatus(false, error.message);
        }
      });
      body.querySelector(`#${id}-add-dict`).addEventListener('click', () => {
        promptAddDictionary().catch(error => setStatus(false, 'Error: ' + error.message));
      });
      body.querySelector(`#${id}-add-entry`).addEventListener('click', () => {
        promptAddEntry().catch(error => setStatus(false, 'Error: ' + error.message));
      });
      body.querySelector(`#${id}-user`).addEventListener('change', async () => {
        slUser = body.querySelector(`#${id}-user`).value;
        slDict = null;
        slKey = null;
        slKeyOop = null;
        body.querySelector(`#${id}-dicts`).innerHTML = '';
        body.querySelector(`#${id}-entries`).innerHTML = '';
        clearKV();
        syncSymbolListWindowState();
        if (slUser) await loadDicts(slUser);
      });

      syncSymbolListWindowState();
      loadUsers();
    }

    return {
      mount,
      loadUsers,
      loadDicts,
    };
  }

  return {
    buildSymbolListWindowState,
    sortSymbolListEntries,
    createSymbolListWindowRuntime,
  };
});
