(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ClassBrowserView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function buildClassBrowserMenu({title, items = [], extra = ''}) {
    const body = items.filter(Boolean).join('') + extra;
    return `
      <div class="cb-menu" data-menu-title="${title}">
        <button type="button" class="btn-ghost cb-menu-toggle" aria-expanded="false">${title} ▾</button>
        <div class="cb-menu-panel" hidden>
          ${body}
        </div>
      </div>
    `;
  }

  function buildMenuButton(id, label) {
    return `<button type="button" class="btn-ghost cb-menu-item" id="${id}">${label}</button>`;
  }

  function buildClassBrowserWindowHtml(id) {
    return `
    <div class="cb-wrap">
      <div class="cb-toolbar">
        ${buildClassBrowserMenu({
          title: 'Find',
          items: [
            buildMenuButton(`${id}-find`, 'Find Class'),
            buildMenuButton(`${id}-find-dictionary`, 'Find Dictionary'),
            buildMenuButton(`${id}-refresh`, 'Refresh'),
          ],
        })}
        ${buildClassBrowserMenu({
          title: 'Dictionary',
          items: [
            buildMenuButton(`${id}-add-dictionary`, 'Add Dictionary'),
            buildMenuButton(`${id}-rename-dictionary`, 'Rename Dictionary'),
            buildMenuButton(`${id}-remove-dictionary`, 'Remove Dictionary'),
            buildMenuButton(`${id}-inspect-dictionary`, 'Inspect Dictionary'),
          ],
        })}
        ${buildClassBrowserMenu({
          title: 'Class',
          items: [
            buildMenuButton(`${id}-add-class`, 'Add Class'),
            buildMenuButton(`${id}-rename-class`, 'Rename Class'),
            buildMenuButton(`${id}-move-class`, 'Move Class'),
            buildMenuButton(`${id}-remove-class`, 'Remove Class'),
            buildMenuButton(`${id}-browse-class`, 'Browse Class'),
            buildMenuButton(`${id}-hierarchy`, 'Hierarchy'),
          ],
        })}
        ${buildClassBrowserMenu({
          title: 'Category',
          items: [
            buildMenuButton(`${id}-add-category`, 'Add Category'),
            buildMenuButton(`${id}-rename-category`, 'Rename Category'),
            buildMenuButton(`${id}-remove-category`, 'Remove Category'),
            buildMenuButton(`${id}-browse-category`, 'Browse Category'),
          ],
        })}
        ${buildClassBrowserMenu({
          title: 'Method',
          items: [
            buildMenuButton(`${id}-new-method`, 'New Method'),
            buildMenuButton(`${id}-browse-method`, 'Browse Method'),
            buildMenuButton(`${id}-move-method`, 'Move Method'),
            buildMenuButton(`${id}-remove-method`, 'Remove Method'),
            buildMenuButton(`${id}-versions`, 'Versions'),
            buildMenuButton(`${id}-create-accessors`, 'Create Accessors'),
          ],
          extra: `
            <div class="cb-menu-divider"></div>
            <label class="cb-inline cb-menu-inline">File Out
              <select class="cb-select" id="${id}-file-out-mode">
                <option value="class">Class</option>
                <option value="class-methods">Class Methods</option>
                <option value="dictionary">Dictionary</option>
                <option value="dictionary-methods">Dictionary Methods</option>
                <option value="method">Method</option>
              </select>
            </label>
            ${buildMenuButton(`${id}-file-out`, 'File Out')}
          `,
        })}
        ${buildClassBrowserMenu({
          title: 'Variables',
          items: [
            buildMenuButton(`${id}-add-inst-var`, 'Inst Var'),
            buildMenuButton(`${id}-add-class-var`, 'Class Var'),
            buildMenuButton(`${id}-add-class-inst-var`, 'Class Inst Var'),
            buildMenuButton(`${id}-rename-var`, 'Rename Var'),
            buildMenuButton(`${id}-remove-var`, 'Remove Var'),
          ],
        })}
        ${buildClassBrowserMenu({
          title: 'Query',
          items: [
            buildMenuButton(`${id}-senders`, 'Senders'),
            buildMenuButton(`${id}-implementors`, 'Implementors'),
            buildMenuButton(`${id}-references`, 'References'),
            buildMenuButton(`${id}-method-text`, 'Text Search'),
          ],
          extra: `
            <div class="cb-menu-divider"></div>
            <label class="cb-inline cb-menu-inline">Scope
              <select class="cb-select" id="${id}-query-scope">
                <option value="all">All Classes</option>
                <option value="full">Full Hierarchy</option>
                <option value="super">Superclasses</option>
                <option value="this">This Class</option>
                <option value="sub">Subclasses</option>
              </select>
            </label>
          `,
        })}
        ${buildClassBrowserMenu({
          title: 'Inspect',
          items: [
            buildMenuButton(`${id}-inspect-class`, 'Inspect Class'),
            buildMenuButton(`${id}-inspect-method`, 'Inspect Method'),
            buildMenuButton(`${id}-inspect-instances`, 'Inspect All Instances'),
          ],
        })}
        ${buildClassBrowserMenu({
          title: 'Transaction',
          items: [
            buildMenuButton(`${id}-continue-tx`, 'Continue'),
            buildMenuButton(`${id}-abort-tx`, 'Abort'),
            buildMenuButton(`${id}-commit`, 'Commit'),
          ],
        })}
        <button class="btn" id="${id}-compile">Compile</button>
        <label class="cb-meta"><input type="checkbox" id="${id}-auto-commit"> Auto Commit</label>
        <label class="cb-meta"><input type="checkbox" id="${id}-meta"> Class side</label>
      </div>
      <div class="cb-lists" id="${id}-lists">
        <div class="cb-pane">
          <div class="cb-pane-label">Dictionaries</div>
          <div class="cb-filter-wrap"><input class="cb-filter" id="${id}-dict-filter" placeholder="Filter dictionaries"></div>
          <div class="cb-list" id="${id}-dicts" tabindex="0" aria-label="Dictionaries list"></div>
        </div>
        <div class="cb-splitter" id="${id}-split-1" aria-hidden="true"></div>
        <div class="cb-pane">
          <div class="cb-pane-label">Classes</div>
          <div class="cb-filter-wrap"><input class="cb-filter" id="${id}-class-filter" placeholder="Filter classes"></div>
          <div class="cb-list" id="${id}-classes" tabindex="0" aria-label="Classes list"></div>
        </div>
        <div class="cb-splitter" id="${id}-split-2" aria-hidden="true"></div>
        <div class="cb-pane">
          <div class="cb-pane-label">Categories</div>
          <div class="cb-filter-wrap"><input class="cb-filter" id="${id}-protocol-filter" placeholder="Filter categories"></div>
          <div class="cb-list" id="${id}-protocols" tabindex="0" aria-label="Categories list"></div>
        </div>
        <div class="cb-splitter" id="${id}-split-3" aria-hidden="true"></div>
        <div class="cb-pane">
          <div class="cb-pane-label">Methods</div>
          <div class="cb-filter-wrap"><input class="cb-filter" id="${id}-method-filter" placeholder="Filter methods"></div>
          <div class="cb-list" id="${id}-methods" tabindex="0" aria-label="Methods list"></div>
        </div>
      </div>
      <div class="cb-source-wrap">
        <div class="cb-source-hdr">
          <span>Source</span>
          <span class="cb-source-note" id="${id}-source-note"></span>
        </div>
        <textarea class="cb-source" id="${id}-source" spellcheck="false"></textarea>
        <div class="cb-status" id="${id}-status">Loading…</div>
      </div>
    </div>
  `;
  }

  function buildClassBrowserActionState(options = {}) {
    const hasClass = !!options.currentClass;
    const hasDict = !!options.currentDict;
    const hasMethod = hasClass && !!options.currentMethod;
    const protocol = String(options.currentProtocol || '');
    const hasCategory = hasClass && !!protocol && protocol !== '-- all --';
    return {
      findDictionary: {enabled: true, title: ''},
      addDictionary: {enabled: true, title: ''},
      renameDictionary: {enabled: hasDict, title: hasDict ? '' : 'Select a dictionary first'},
      removeDictionary: {enabled: hasDict, title: hasDict ? '' : 'Select a dictionary first'},
      inspectDictionary: {enabled: hasDict, title: hasDict ? '' : 'Select a dictionary first'},
      inspectClass: {enabled: hasClass, title: hasClass ? '' : 'Select a class first'},
      inspectMethod: {enabled: hasMethod, title: hasMethod ? '' : 'Select a method first'},
      inspectInstances: {enabled: hasClass, title: hasClass ? '' : 'Select a class first'},
      renameClass: {enabled: hasClass, title: hasClass ? '' : 'Select a class first'},
      addCategory: {enabled: hasClass, title: hasClass ? '' : 'Select a class first'},
      renameCategory: {enabled: hasCategory, title: hasCategory ? '' : 'Select a category first'},
      addInstVar: {enabled: hasClass, title: hasClass ? '' : 'Select a class first'},
      addClassVar: {enabled: hasClass, title: hasClass ? '' : 'Select a class first'},
      addClassInstVar: {enabled: hasClass, title: hasClass ? '' : 'Select a class first'},
      renameVar: {enabled: hasClass, title: hasClass ? '' : 'Select a class first'},
      removeVar: {enabled: hasClass, title: hasClass ? '' : 'Select a class first'},
      moveClass: {enabled: hasClass, title: hasClass ? '' : 'Select a class first'},
      removeClass: {enabled: hasClass, title: hasClass ? '' : 'Select a class first'},
      browseClass: {enabled: hasClass, title: hasClass ? '' : 'Select a class first'},
      browseCategory: {enabled: hasCategory, title: hasCategory ? '' : 'Select a category first'},
      browseMethod: {enabled: hasMethod, title: hasMethod ? '' : 'Select a method first'},
      newMethod: {enabled: hasClass, title: hasClass ? '' : 'Select a class first'},
      moveMethod: {enabled: hasMethod, title: hasMethod ? '' : 'Select a method first'},
      removeMethod: {enabled: hasMethod, title: hasMethod ? '' : 'Select a method first'},
      removeCategory: {enabled: hasCategory, title: hasCategory ? '' : 'Select a category first'},
      hierarchy: {enabled: hasClass, title: hasClass ? '' : 'Select a class first'},
      versions: {enabled: hasMethod, title: hasMethod ? '' : 'Select a method first'},
    };
  }

  return {
    buildClassBrowserWindowHtml,
    buildClassBrowserActionState,
  };
});
