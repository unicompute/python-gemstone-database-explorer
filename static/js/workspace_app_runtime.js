(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WorkspaceAppRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function readRoots(readRootsFn) {
    return typeof readRootsFn === 'function' ? (readRootsFn() || {}) : {};
  }

  function readStartupIds(readStartupIdsFn) {
    return typeof readStartupIdsFn === 'function' ? (readStartupIdsFn() || {}) : {};
  }

  function createWorkspaceAppRuntime(deps = {}) {
    function openExpressionWorkspace(options = {}) {
      const {
        kind = 'workspace',
        title = 'Workspace',
        taskbarLabel = title,
        width = 520,
        height = 440,
        x,
        y,
        draft = '',
        placeholder,
        language = 'smalltalk',
        showTransactionBar = true,
        targetOop = null,
        resolveTargetOop = null,
        unavailableMessage = 'Not connected',
        sessionChannelPrefix = kind,
      } = options;
      const { win, body, id } = deps.createWindow({
        title,
        width,
        height,
        x,
        y,
        taskbarLabel,
      });
      const sessionChannel = `${sessionChannelPrefix}:${id}`;
      const workspaceApiEvaluate = (oop, payload = {}) => deps.apiEvaluate(oop, payload, { sessionChannel });
      const workspaceApiTransaction = url => deps.apiTransaction(url, { sessionChannel });
      deps.createWorkspaceWindowRuntime({
        id,
        body,
        kind,
        draft,
        placeholder,
        language,
        showTransactionBar,
        targetOop,
        resolveTargetOop,
        unavailableMessage,
        persistedTargetOop: targetOop || options.oop || null,
        sessionChannel,
        upsertWindowState: deps.upsertWindowState,
        bindWorkspaceWindowActions: deps.bindWorkspaceWindowActions,
        buildWorkspaceWindowHtml: deps.buildWorkspaceWindowHtml,
        workspaceApiEvaluate,
        workspaceApiTransaction,
        setStatus: deps.setStatus,
        maybeOpenEvalDebugger: deps.maybeOpenEvalDebugger,
        isLeafBasetype: deps.isLeafBasetype,
        makeChip: deps.makeChip,
        openLinkedObjectWindow: deps.openLinkedObjectWindow,
      }).mount();
      return win;
    }

    function openWorkspace(options = {}) {
      return openExpressionWorkspace({
        ...options,
        kind: 'workspace',
        title: 'Workspace',
        taskbarLabel: 'Workspace',
        width: options.width || 520,
        height: options.height || 440,
        placeholder: 'Smalltalk expression… (Ctrl+Enter)',
        language: 'smalltalk',
        showTransactionBar: true,
        sessionChannelPrefix: 'workspace',
        unavailableMessage: 'Not connected',
        resolveTargetOop: () => {
          const roots = readRoots(deps.readRoots);
          return roots.Globals || roots.UserGlobals;
        },
      });
    }

    function openRubyWorkspace(options = {}) {
      return openExpressionWorkspace({
        ...options,
        kind: 'ruby-workspace',
        title: 'Ruby Workspace',
        taskbarLabel: 'Ruby Workspace',
        width: options.width || 560,
        height: options.height || 420,
        placeholder: 'Ruby expression… (Ctrl+Enter)',
        language: 'ruby',
        showTransactionBar: false,
        sessionChannelPrefix: 'ruby-workspace',
        unavailableMessage: 'Ruby Workspace not available on this stone',
        targetOop: options.oop
          || readStartupIds(deps.readStartupIds).defaultWorkspaceId
          || readRoots(deps.readRoots).RubyWorkspace
          || 0,
      });
    }

    function openMaglevReportWindow(reportKey, options = {}) {
      const reportDef = deps.maglevReportDefs[String(reportKey || '').trim()] || null;
      const title = options.title || reportDef?.title || 'MagLev Report';
      const { win, body, id } = deps.createWindow({
        title,
        width: options.width || 620,
        height: options.height || 420,
        x: options.x,
        y: options.y,
        taskbarLabel: 'MagLev Reports',
      });
      deps.createMaglevReportWindowRuntime({
        id,
        body,
        title,
        reportKey: String(reportKey || '').trim(),
        api: deps.api,
        upsertWindowState: deps.upsertWindowState,
        applyTitle(titleText) {
          const titleEl = win.querySelector('.win-title');
          if (titleEl) titleEl.textContent = titleText;
        },
      }).mount();
      return win;
    }

    function openWebBrowser(initialUrl, options = {}) {
      const { win, body, id } = deps.createWindow({
        title: 'Web Browser',
        width: options.width || 700,
        height: options.height || 520,
        x: options.x,
        y: options.y,
        taskbarLabel: 'Web Browser',
      });
      const defaultUrl = initialUrl || options.url || 'https://pandas.pydata.org';
      deps.createWebBrowserWindowRuntime({
        id,
        body,
        defaultUrl,
        escHtml: deps.escHtml,
        upsertWindowState: deps.upsertWindowState,
      }).mount();
      return win;
    }

    function openTextWindow(title, text, taskbarLabel = 'Report', px, py, pw = 560, ph = 380) {
      const { body } = deps.createWindow({
        title,
        width: pw,
        height: ph,
        x: px,
        y: py,
        taskbarLabel,
      });
      body.innerHTML = '<textarea class="qv-preview" readonly></textarea>';
      const textArea = body.querySelector('textarea');
      if (textArea) textArea.value = text || '';
    }

    return {
      openExpressionWorkspace,
      openWorkspace,
      openRubyWorkspace,
      openMaglevReportWindow,
      openWebBrowser,
      openTextWindow,
    };
  }

  return {
    createWorkspaceAppRuntime,
  };
});
