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
        <button class="btn-dbg" id="${id}-refresh" title="Alt+F">Refresh</button>
        <button class="btn-dbg" id="${id}-proceed" title="Alt+P">Proceed</button>
        <button class="btn-dbg" id="${id}-step" title="Alt+S">Step</button>
        <button class="btn-dbg" id="${id}-stepinto" title="Alt+I">Step into</button>
        <button class="btn-dbg" id="${id}-stepover" title="Alt+O">Step over</button>
        <button class="btn-dbg" id="${id}-stepreturn" title="Alt+U">Step out</button>
        <button class="btn-dbg" id="${id}-restart" title="Alt+R">Restart</button>
        <button class="btn-dbg" id="${id}-trim" title="Alt+T">Trim stack</button>
        <button class="btn-dbg" id="${id}-terminate" title="Alt+X">Terminate</button>
        <button class="btn-dbg" id="${id}-copystack" title="Alt+L">Copy Stack</button>
        <button class="btn-dbg" id="${id}-copysource" title="Alt+C">Copy Source</button>
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

  function computeDebuggerCursorLocation(sourceText, sourceOffset) {
    const offset = Number(sourceOffset || 0);
    const text = String(sourceText || '');
    if (!(offset > 0) || !text) return null;
    const normalizedOffset = Math.min(offset, text.length + 1);
    let line = 1;
    let column = 1;
    for (let i = 0; i < normalizedOffset - 1 && i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '\n') {
        line += 1;
        column = 1;
      } else if (ch === '\r') {
        line += 1;
        column = 1;
        if (text[i + 1] === '\n') i += 1;
      } else {
        column += 1;
      }
    }
    return {line, column};
  }

  function resolveDebuggerSourceOffset(frameData = {}) {
    const stepPoint = Number(frameData.stepPoint || 0);
    const sourceOffsets = Array.isArray(frameData.sourceOffsets) ? frameData.sourceOffsets : [];
    if (stepPoint > 0 && sourceOffsets.length) {
      const clampedIndex = Math.min(stepPoint, sourceOffsets.length) - 1;
      const mappedOffset = Number(sourceOffsets[clampedIndex] || 0);
      if (mappedOffset > 0) return mappedOffset;
    }
    return Number(frameData.sourceOffset || 0);
  }

  function isExecutedCodeFrame(frameData = {}) {
    if (frameData.isExecutedCode === true) return true;
    const methodName = String(frameData.methodName || '');
    if (/^Executed code @/i.test(methodName)) return true;
    const className = String(frameData.className || '');
    const selectorName = String(frameData.selectorName || '');
    const sourceText = String(frameData.source || '');
    return className === 'SigWorkspaceEvaluator'
      && selectorName.startsWith('sigWorkspace')
      && !!sourceText
      && !sourceText.includes('^ [');
  }

  function resolveDebuggerSourceOffsetForStepPoint(frameData = {}, stepPoint = 0) {
    const sourceOffsets = Array.isArray(frameData.sourceOffsets) ? frameData.sourceOffsets : [];
    const point = Number(stepPoint || 0);
    if (!(point > 0) || !sourceOffsets.length) return 0;
    const clampedIndex = Math.min(point, sourceOffsets.length) - 1;
    const mappedOffset = Number(sourceOffsets[clampedIndex] || 0);
    return mappedOffset > 0 ? mappedOffset : 0;
  }

  function debuggerStatementBoundaryExists(sourceText, startOffset, endOffset) {
    const text = String(sourceText || '');
    const start = Number(startOffset || 0);
    const end = Number(endOffset || 0);
    if (!text || !(start > 0) || !(end > 0) || start >= end) return false;
    let inComment = false;
    let inString = false;
    let current = Math.max(1, start);
    const limit = Math.min(end, text.length);
    while (current <= limit) {
      const ch = text[current - 1];
      if (inComment) {
        if (ch === '"') inComment = false;
      } else if (inString) {
        if (ch === '\'') inString = false;
      } else if (ch === '"') {
        inComment = true;
      } else if (ch === '\'') {
        inString = true;
      } else if (ch === '.') {
        return true;
      }
      current += 1;
    }
    return false;
  }

  function debuggerStepPointStartsNewStatement(frameData = {}, stepPoint = 0, sourceText = '') {
    const point = Number(stepPoint || 0);
    if (!(point > 1)) return true;
    const currentOffset = resolveDebuggerSourceOffsetForStepPoint(frameData, point);
    const previousOffset = resolveDebuggerSourceOffsetForStepPoint(frameData, point - 1);
    if (!(currentOffset > 0) || !(previousOffset > 0)) return false;
    const currentLocation = computeDebuggerCursorLocation(sourceText, currentOffset);
    const previousLocation = computeDebuggerCursorLocation(sourceText, previousOffset);
    if (!currentLocation || !previousLocation) return false;
    if (currentLocation.line !== previousLocation.line) return true;
    return debuggerStatementBoundaryExists(sourceText, previousOffset, currentOffset - 1);
  }

  function debuggerNextStatementCursorLocation(frameData = {}, stepPoint = 0, sourceText = '') {
    const sourceOffsets = Array.isArray(frameData.sourceOffsets) ? frameData.sourceOffsets : [];
    let nextStep = Number(stepPoint || 0) + 1;
    while (nextStep <= sourceOffsets.length) {
      if (debuggerStepPointStartsNewStatement(frameData, nextStep, sourceText)) {
        const nextOffset = resolveDebuggerSourceOffsetForStepPoint(frameData, nextStep);
        const nextLocation = computeDebuggerCursorLocation(sourceText, nextOffset);
        if (nextLocation) return nextLocation;
      }
      nextStep += 1;
    }
    return null;
  }

  function clampDebuggerLineNumber(lineNumber, sourceText) {
    const resolved = Number(lineNumber || 0);
    const normalized = String(sourceText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized ? normalized.split('\n') : ['(no source)'];
    if (!(resolved > 0)) return 0;
    return Math.max(1, Math.min(lines.length, resolved));
  }

  function debuggerExecutableCursorColumnForLine(lineText = '') {
    const text = String(lineText || '');
    const size = text.length;
    let index = 0;
    while (index < size) {
      while (index < size && /\s/.test(text[index])) index += 1;
      if (index >= size) return 0;
      if (text[index] === '"') {
        index += 1;
        while (index < size && text[index] !== '"') index += 1;
        if (index < size) index += 1;
        continue;
      }
      return index + 1;
    }
    return 0;
  }

  function debuggerExecutableLineNumberNear(lineNumber, lines = []) {
    const resolved = Number(lineNumber || 0);
    if (!(resolved > 0) || !Array.isArray(lines) || !lines.length) return 0;
    const startIndex = Math.max(1, Math.min(resolved, lines.length));
    for (let index = startIndex - 1; index < lines.length; index += 1) {
      if (debuggerExecutableCursorColumnForLine(lines[index]) > 0) return index + 1;
    }
    for (let index = startIndex - 2; index >= 0; index -= 1) {
      if (debuggerExecutableCursorColumnForLine(lines[index]) > 0) return index + 1;
    }
    return 0;
  }

  function resolveDebuggerSourceLocation(frameData = {}, sourceText = '') {
    const normalized = String(sourceText || '');
    const lines = normalized ? normalized.split('\n') : [''];
    const stepPoint = Number(frameData.stepPoint || 0);
    const resolvedSourceOffset = resolveDebuggerSourceOffset(frameData);
    let cursorLocation = computeDebuggerCursorLocation(normalized, resolvedSourceOffset);
    if (isExecutedCodeFrame(frameData) && stepPoint > 1 && !debuggerStepPointStartsNewStatement(frameData, stepPoint, normalized)) {
      const nextLocation = debuggerNextStatementCursorLocation(frameData, stepPoint, normalized);
      if (nextLocation) cursorLocation = nextLocation;
    }
    let rawLine = cursorLocation ? cursorLocation.line : 0;
    if (!(rawLine > 0)) rawLine = Number(frameData.lineNumber || 0);
    let resolvedLine = isExecutedCodeFrame(frameData)
      ? debuggerExecutableLineNumberNear(rawLine, lines)
      : rawLine;
    if (!(resolvedLine > 0) && rawLine > 0) resolvedLine = rawLine;
    if (!(resolvedLine > 0)) return null;
    let cursorColumn = 1;
    if (isExecutedCodeFrame(frameData)) {
      const executableColumn = debuggerExecutableCursorColumnForLine(lines[resolvedLine - 1] || '');
      cursorColumn = executableColumn > 0 ? executableColumn : 1;
      if (cursorLocation && cursorLocation.line === resolvedLine) {
        cursorColumn = Math.max(cursorColumn, Number(cursorLocation.column || 1));
      }
    } else if (cursorLocation && cursorLocation.line === resolvedLine) {
      cursorColumn = Number(cursorLocation.column || 1);
    }
    return {line: resolvedLine, column: cursorColumn};
  }

  function buildDebuggerSourceTextHtml(lineText, cursorColumn, escHtml = fallbackEscHtml) {
    const safeEscHtml = typeof escHtml === 'function' ? escHtml : fallbackEscHtml;
    const text = String(lineText || '');
    if (!(Number(cursorColumn) > 0)) return text.length ? safeEscHtml(text) : '&nbsp;';
    const splitAt = Math.max(0, Math.min(text.length, Number(cursorColumn) - 1));
    const before = safeEscHtml(text.slice(0, splitAt));
    const after = safeEscHtml(text.slice(splitAt));
    return `${before}<span class="dbg-inline-cursor" aria-label="Next instruction">|</span>${after || ''}`;
  }

  function buildDebuggerSourceView(frameData = {}, options = {}) {
    const escHtml = typeof options.escHtml === 'function' ? options.escHtml : fallbackEscHtml;
    const frameIndex = Number(options.frameIndex || 0);
    const thread = options.thread || {};
    const sourceText = fallbackSourceText(frameData, thread, frameIndex);
    const normalized = String(sourceText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized ? normalized.split('\n') : ['(no source)'];
    const resolvedSourceOffset = resolveDebuggerSourceOffset(frameData);
    const resolvedSourceLocation = resolveDebuggerSourceLocation(frameData, normalized);
    const rawActiveLine = (resolvedSourceLocation && resolvedSourceLocation.line)
      || Number(frameData.lineNumber || 0)
      || computeDebuggerLineNumber(sourceText, resolvedSourceOffset)
      || computeDebuggerLineNumber(sourceText, frameData.sourceOffset);
    const activeLine = clampDebuggerLineNumber(rawActiveLine, normalized);
    const stepPoint = Number(frameData.stepPoint || 0);
    const sourceOffset = resolvedSourceOffset;
    const ipOffset = Number(frameData.ipOffset || 0);
    const status = String(frameData.status || '').trim().toLowerCase();
    const framePosition = Number(options.framePosition || 0);
    const frameCount = Number(options.frameCount || 0);
    const metaBits = [];
    if (framePosition > 0 && frameCount > 0) metaBits.push(`Frame ${framePosition}/${frameCount}`);
    if (status) metaBits.push(`Status ${status}`);
    if (stepPoint > 0) metaBits.push(`Step ${stepPoint}`);
    if (activeLine > 0) metaBits.push(`Line ${activeLine}`);
    if (ipOffset > 0) metaBits.push(`PC ${ipOffset}`);
    if (sourceOffset > 0) metaBits.push(`Offset ${sourceOffset}`);

    let cursorLocation = resolvedSourceLocation || computeDebuggerCursorLocation(normalized, sourceOffset);
    if (!cursorLocation && activeLine > 0 && stepPoint > 0) {
      cursorLocation = {line: activeLine, column: 1};
    }
    const sourceHtml = lines.map((line, lineIndex) => {
      const lineNumber = lineIndex + 1;
      const active = activeLine > 0 && lineNumber === activeLine ? ' active' : '';
      const cursorColumn = cursorLocation && cursorLocation.line === lineNumber ? cursorLocation.column : 0;
      const marker = active
        ? `<span class="dbg-step-cursor" aria-label="Current step">${stepPoint > 0 ? escHtml(`S${stepPoint}`) : '&#9654;'}</span>`
        : '<span class="dbg-step-cursor-spacer" aria-hidden="true">&nbsp;</span>';
      const text = buildDebuggerSourceTextHtml(line, cursorColumn, escHtml);
      return `<span class="dbg-source-line${active}" data-line="${lineNumber}"><span class="dbg-source-marker" aria-hidden="true">${marker}</span><span class="dbg-source-lno">${lineNumber}</span><span class="dbg-source-text">${text}</span></span>`;
    }).join('');

    return {
      sourceText,
      activeLine,
      cursorLocation,
      metaText: metaBits.join(' • '),
      sourceHtml,
    };
  }

  function buildDebuggerFramesExportText(frames = [], activeFrameIndex = 0) {
    return (Array.isArray(frames) ? frames : []).map((frame, pos) => {
      const marker = Number(frame.index) === Number(activeFrameIndex) ? '>' : ' ';
      return `${marker} ${String(frame.name || `frame ${pos}`)}`;
    }).join('\n');
  }

  function buildDebuggerSourceExportText(frameData = {}, options = {}) {
    const view = buildDebuggerSourceView(frameData, options);
    return view.metaText ? `${view.metaText}\n${view.sourceText}` : view.sourceText;
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
    computeDebuggerCursorLocation,
    resolveDebuggerSourceOffset,
    isExecutedCodeFrame,
    resolveDebuggerSourceOffsetForStepPoint,
    debuggerStatementBoundaryExists,
    debuggerStepPointStartsNewStatement,
    debuggerNextStatementCursorLocation,
    clampDebuggerLineNumber,
    debuggerExecutableCursorColumnForLine,
    debuggerExecutableLineNumberNear,
    resolveDebuggerSourceLocation,
    buildDebuggerSourceTextHtml,
    buildDebuggerSourceView,
    buildDebuggerFramesExportText,
    buildDebuggerSourceExportText,
    buildDebuggerVariableOptionsHtml,
  };
});
