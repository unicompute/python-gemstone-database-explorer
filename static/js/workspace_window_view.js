(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.WorkspaceWindowView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function buildWorkspaceWindowHtml(id, options = {}) {
    const placeholder = String(options.placeholder || 'Smalltalk expression… (Ctrl+Enter)');
    const hint = String(options.hint || 'Ctrl+Enter');
    const showTransactionBar = options.showTransactionBar !== false;
    const transactionBar = showTransactionBar
      ? `
    <div class="txbar" style="flex-shrink:0">
      <span>Transaction:</span>
      <button class="btn-tx" id="${id}-abort">Abort</button>
      <button class="btn-tx" id="${id}-commit">Commit</button>
      <button class="btn-tx" id="${id}-continue" style="background:#4a90d9">Continue</button>
    </div>
  `
      : '';
    return `
    <div class="ws-history" id="${id}-wsh" style="flex:1;min-height:0;overflow-y:auto;padding:6px 10px;font-family:monospace;font-size:12px"></div>
    <div class="ws-input-row" style="flex-shrink:0">
      <textarea class="ws-code-area" id="${id}-wsc" placeholder="${placeholder}"></textarea>
      <div class="ws-controls">
        <button class="btn" id="${id}-doit">Do it</button>
        <button class="btn-ghost" id="${id}-clr">Clear</button>
        <span class="ws-hint">${hint}</span>
      </div>
    </div>
    ${transactionBar}
  `;
  }

  return {
    buildWorkspaceWindowHtml,
  };
});
