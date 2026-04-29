(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AppApiRuntime = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function escHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function exactWriteSessionChannel(channel = '') {
    const value = String(channel || '').trim();
    if (!value) return '';
    if (value.endsWith('-w')) return value;
    if (value.endsWith('-r')) return `${value.slice(0, -2)}-w`;
    return `${value}-w`;
  }

  function buildConnectionFailure(inner, outer) {
    return {
      success: false,
      status: 'error',
      exception: inner?.message || outer?.message || 'connection failed',
      connection: {
        configured: {},
        probe: {},
        suggestions: [],
      },
    };
  }

  function createAppApiRuntime(deps = {}) {
    const fetchImpl = deps.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const HeadersCtor = deps.Headers || (typeof Headers === 'function' ? Headers : null);
    const navigatorRef = deps.navigator || (typeof navigator !== 'undefined' ? navigator : null);
    const documentRef = deps.document || (typeof document !== 'undefined' ? document : null);
    const windowRef = deps.window || (typeof window !== 'undefined' ? window : null);
    const BlobCtor = deps.Blob || (typeof Blob === 'function' ? Blob : null);
    const URLRef = deps.URL || (typeof URL !== 'undefined' ? URL : null);
    const timerApi = deps.timerApi || globalThis;

    async function api(url, opts) {
      if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
      if (typeof HeadersCtor !== 'function') throw new Error('Headers unavailable');
      const {
        sessionChannel = '',
        connectionOverride = undefined,
        skipConnectionOverride = false,
        ...fetchOpts
      } = opts || {};
      const headers = new HeadersCtor(fetchOpts.headers || {});
      if (sessionChannel) headers.set('X-GS-Channel', String(sessionChannel));
      const connectionHeaders = connectionOverride !== undefined
        ? (deps.connectionOverrideHeadersFor?.(connectionOverride) || {})
        : (skipConnectionOverride ? {} : (deps.getConnectionOverrideHeaders?.() || {}));
      Object.entries(connectionHeaders).forEach(([key, value]) => {
        if (value) headers.set(key, value);
      });
      if (Array.from(headers.keys()).length) fetchOpts.headers = headers;
      const response = await fetchImpl(url, fetchOpts);
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (_) {
        data = null;
      }
      if (!response.ok) {
        const detail = data?.exception || data?.error || text || `HTTP ${response.status}`;
        const error = new Error(detail);
        error.data = data;
        error.status = response.status;
        error.url = url;
        throw error;
      }
      return data;
    }

    async function apiPost(url, body, options = {}) {
      return api(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
        sessionChannel: options.sessionChannel || '',
      });
    }

    async function apiEvaluate(oop, {code, language = 'smalltalk', depth = 2, ranges = {}} = {}, options = {}) {
      return apiPost(`/object/evaluate/${oop}`, {code, language, depth, ranges}, options);
    }

    async function apiTransaction(url, options = {}) {
      return apiPost(url, {}, options);
    }

    function apiWithParams(url, params = {}, options = {}) {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        qs.set(key, String(value));
      });
      const suffix = qs.toString();
      return api(suffix ? `${url}?${suffix}` : url, {sessionChannel: options.sessionChannel || ''});
    }

    async function resolveConnectionPreflight(error = null) {
      if (error?.data?.preflight) return error.data.preflight;
      try {
        const data = await api('/connection/preflight');
        if (data) return data;
      } catch (inner) {
        if (inner?.data) return inner.data;
        return buildConnectionFailure(inner, error);
      }
      return buildConnectionFailure(null, error);
    }

    async function copyTextToClipboard(text) {
      const value = String(text ?? '');
      if (navigatorRef?.clipboard && typeof navigatorRef.clipboard.writeText === 'function') {
        try {
          await navigatorRef.clipboard.writeText(value);
          if (windowRef) windowRef.__lastCopiedText = value;
          return true;
        } catch (_) {
          // Fall back to execCommand below when clipboard API is present but unavailable.
        }
      }
      if (!documentRef) throw new Error('Clipboard unavailable');
      const area = documentRef.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', 'readonly');
      area.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
      documentRef.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, area.value.length);
      let copied = false;
      try {
        copied = documentRef.execCommand('copy');
      } finally {
        area.remove();
      }
      if (!copied) throw new Error('Clipboard unavailable');
      if (windowRef) windowRef.__lastCopiedText = value;
      return true;
    }

    function downloadDataFile(filename, text, mimeType = 'text/plain;charset=utf-8') {
      if (!documentRef || !BlobCtor || !URLRef) throw new Error('Download unavailable');
      if (windowRef) {
        windowRef.__lastDownloadedFile = {
          filename: String(filename || ''),
          text: String(text || ''),
        };
      }
      const blob = new BlobCtor([text], {type: mimeType});
      const url = URLRef.createObjectURL(blob);
      const link = documentRef.createElement('a');
      link.href = url;
      link.download = String(filename || 'export.txt').replace(/[\\/:*?"<>|]+/g, '-');
      documentRef.body.appendChild(link);
      link.click();
      link.remove();
      timerApi.setTimeout(() => URLRef.revokeObjectURL(url), 0);
    }

    async function loadRuntimeVersionInfo() {
      return deps.loadRuntimeVersionInfo?.();
    }

    return {
      escHtml,
      api,
      apiPost,
      apiEvaluate,
      apiTransaction,
      exactWriteSessionChannel,
      apiWithParams,
      resolveConnectionPreflight,
      copyTextToClipboard,
      downloadDataFile,
      loadRuntimeVersionInfo,
    };
  }

  return {
    escHtml,
    exactWriteSessionChannel,
    createAppApiRuntime,
  };
});
