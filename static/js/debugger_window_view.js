(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DebuggerWindowView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function fallbackEscHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function fallbackEscAttr(value) {
    return fallbackEscHtml(value).replace(/"/g, '&quot;');
  }

  function buildDebuggerWindowHtml(id) {
    return `
    <div class="tab-strip">
      <div class="tab-item active" data-dtab="stack">Stack Trace</div>
      <div class="tab-item" data-dtab="tls">Thread Local Storage</div>
    </div>
    <div id="${id}-stack" style="display:flex;flex-direction:column;flex:1;overflow:hidden">
      <div class="dbg-summary" id="${id}-summary">
        <div class="dbg-summary-source hidden" id="${id}-summary-source"></div>
        <div class="dbg-summary-error hidden" id="${id}-summary-error"></div>
      </div>
      <div class="dbg-frames-pane" id="${id}-frames">
        <span class="spinner" style="margin:8px"></span>
      </div>
      <div class="dbg-action-bar">
        <button class="btn-dbg" id="${id}-proceed">Proceed</button>
        <button class="btn-dbg" id="${id}-step">Step</button>
        <button class="btn-dbg" id="${id}-stepinto">Step into</button>
        <button class="btn-dbg" id="${id}-stepover">Step over</button>
        <button class="btn-dbg" id="${id}-restart">Restart</button>
        <button class="btn-dbg" id="${id}-trim">Trim stack</button>
      </div>
      <div class="dbg-source-pane" id="${id}-srcp">
        <div class="dbg-source-meta hidden" id="${id}-srcmeta"></div>
        <pre class="dbg-source-code" id="${id}-src" tabindex="-1"></pre>
        <div class="dbg-self-bar">
          <span class="dbg-self-label">self:</span>
          <span class="dbg-self-val" id="${id}-selfval"></span>
        </div>
        <div class="dbg-var-row">
          <select id="${id}-vars"><option value="">— variables —</option></select>
          <span class="dbg-var-val" id="${id}-varval"></span>
        </div>
      </div>
    </div>
    <div id="${id}-tls" style="display:none;flex:1;overflow-y:auto;padding:6px">
      <span class="spinner" id="${id}-tls-spin"></span>
      <ul class="dbg-tls-list" id="${id}-tls-list"></ul>
    </div>
  `;
  }

  function buildDebuggerSummaryState(thread = {}) {
    const sourceText = String(thread.sourcePreview || '');
    const errorText = thread.exceptionText ? `⚑ ${thread.exceptionText}` : '';
    return {
      hidden: !sourceText && !errorText,
      sourceText,
      errorText,
    };
  }

  function isRubyFrameName(name = '') {
    const label = String(name || '');
    return label.includes('(Ruby)') || label.startsWith('Ruby');
  }

  function buildDebuggerFramesListHtml(frames = [], escHtml = fallbackEscHtml) {
    const safeEscHtml = typeof escHtml === 'function' ? escHtml : fallbackEscHtml;
    return (Array.isArray(frames) ? frames : []).map(frame => `
      <button type="button" class="dbg-frame-item" data-idx="${Number(frame.index)}">
        <span class="dbg-frame-icon${isRubyFrameName(frame.name) ? ' ruby' : ''}">${isRubyFrameName(frame.name) ? 'R' : 'S'}</span>
        ${safeEscHtml(frame.name || '')}
      </button>
    `).join('');
  }

  function fallbackSourceText(frameData = {}, thread = {}, frameIndex = 0) {
    return frameData.source
      || (frameIndex === 0 ? (thread.sourcePreview || '') : '')
      || frameData.methodName
      || '(no source)';
  }

  function computeDebuggerLineNumber(sourceText, sourceOffset) {
    const offset = Number(sourceOffset || 0);
    if (!(offset > 0) || !sourceText) return 0;
    let line = 1;
    for (let i = 0; i < Math.min(offset - 1, sourceText.length); i += 1) {
      const ch = sourceText[i];
      if (ch === '\n') {
        line += 1;
      } else if (ch === '\r') {
        line += 1;
        if (sourceText[i + 1] === '\n') i += 1;
      }
    }
    return line;
  }

  function buildDebuggerSourceView(frameData = {}, options = {}) {
    const escHtml = typeof options.escHtml === 'function' ? options.escHtml : fallbackEscHtml;
    const frameIndex = Number(options.frameIndex || 0);
    const thread = options.thread || {};
    const sourceText = fallbackSourceText(frameData, thread, frameIndex);
    const activeLine = Number(frameData.lineNumber || 0) || computeDebuggerLineNumber(sourceText, frameData.sourceOffset);
    const stepPoint = Number(frameData.stepPoint || 0);
    const sourceOffset = Number(frameData.sourceOffset || 0);
    const ipOffset = Number(frameData.ipOffset || 0);
    const metaBits = [];
    if (stepPoint > 0) metaBits.push(`Step ${stepPoint}`);
    if (activeLine > 0) metaBits.push(`Line ${activeLine}`);
    if (ipOffset > 0) metaBits.push(`PC ${ipOffset}`);
    if (sourceOffset > 0) metaBits.push(`Offset ${sourceOffset}`);

    const normalized = String(sourceText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized ? normalized.split('\n') : ['(no source)'];
    const sourceHtml = lines.map((line, lineIndex) => {
      const lineNumber = lineIndex + 1;
      const active = activeLine > 0 && lineNumber === activeLine ? ' active' : '';
      const marker = active ? '&#9654;' : '&nbsp;';
      const text = line.length ? escHtml(line) : '&nbsp;';
      return `<span class="dbg-source-line${active}" data-line="${lineNumber}"><span class="dbg-source-marker" aria-hidden="true">${marker}</span><span class="dbg-source-lno">${lineNumber}</span><span class="dbg-source-text">${text}</span></span>`;
    }).join('');

    return {
      sourceText,
      activeLine,
      metaText: metaBits.join(' • '),
      sourceHtml,
    };
  }

  function buildDebuggerVariableOptionsHtml(variables = [], escHtml = fallbackEscHtml) {
    const safeEscHtml = typeof escHtml === 'function' ? escHtml : fallbackEscHtml;
    const safeEscAttr = typeof escHtml === 'function'
      ? value => String(escHtml(value)).replace(/"/g, '&quot;')
      : fallbackEscAttr;
    const list = Array.isArray(variables) ? variables : [];
    return ['<option value="">— variables —</option>'].concat(list.map(variable => (
      `<option value="${safeEscAttr(variable.name || '')}">${safeEscHtml(`${variable.name || ''} = ${String(variable.value || '').slice(0, 40)}`)}</option>`
    ))).join('');
  }

  return {
    buildDebuggerWindowHtml,
    buildDebuggerSummaryState,
    isRubyFrameName,
    buildDebuggerFramesListHtml,
    fallbackSourceText,
    computeDebuggerLineNumber,
    buildDebuggerSourceView,
    buildDebuggerVariableOptionsHtml,
  };
});
