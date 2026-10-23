(() => {
  const dark = (globalThis.extenso ??= {}).dark ??= {};
  const engine = (dark.engine ??= {});
  const { isSameOrigin, getAbsoluteURL, getCSSBaseURL } = engine.util;
  const { IMPORT_REGEX, removeCSSComments, removeFontFaces, absolutizeURLs, parseImport, wrapImport } = engine.css;

  const TIMEOUT_MS = 10000;
  const MAX_IMPORT_DEPTH = 32;

  const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(id));
  });

  const readAsDataURL = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  const fetchSameOrigin = async (url, as) => {
    const response = await fetch(url, { cache: 'force-cache', signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Unable to load ${url}: ${response.status}`);
    return as === 'text' ? response.text() : readAsDataURL(await response.blob());
  };

  const fetchViaWorker = async (url, as) => {
    const request = globalThis.extenso.messages.send('dark', 'fetch', { url, as, timeoutMs: TIMEOUT_MS });
    const result = await withTimeout(request, TIMEOUT_MS + 1000);
    return as === 'text' ? result.text : result.dataURL;
  };

  const load = (url, as) => {
    if (url.startsWith('data:')) {
      return as === 'dataURL' ? Promise.resolve(url) : fetch(url).then((response) => response.text());
    }
    return isSameOrigin(url) ? fetchSameOrigin(url, as) : fetchViaWorker(url, as);
  };

  const textCache = new Map();
  const importCache = new Map();

  const loadText = (url) => {
    let promise = textCache.get(url);
    if (!promise) {
      promise = load(url, 'text');
      promise.catch(() => textCache.delete(url));
      textCache.set(url, promise);
    }
    return promise;
  };

  const loadDataURL = (url) => load(url, 'dataURL');

  const loadImport = (statement, basePath, chain) => {
    const { url, ...conditions } = parseImport(statement);
    const absolute = getAbsoluteURL(basePath, url);
    if (chain.has(absolute) || chain.size > MAX_IMPORT_DEPTH) return Promise.resolve('');
    let processed = importCache.get(absolute);
    if (!processed) {
      processed = loadText(absolute)
        .then((text) => inlineImports(text, getCSSBaseURL(absolute), new Set([...chain, absolute])))
        .catch((error) => {
          console.warn('[extenso] dark: import failed', absolute, error);
          return '';
        });
      importCache.set(absolute, processed);
    }
    return processed.then((text) => (text ? wrapImport(text, conditions) : ''));
  };

  const inlineImports = async (cssText, basePath, chain = new Set()) => {
    const text = absolutizeURLs(removeFontFaces(removeCSSComments(cssText)), basePath);
    const matches = [...text.matchAll(IMPORT_REGEX)];
    if (matches.length === 0) return text.trim();
    const firstBlock = text.indexOf('{');
    const imported = await Promise.all(matches.map((match) => (
      firstBlock >= 0 && firstBlock < match.index ? '' : loadImport(match[0], basePath, chain)
    )));
    let result = '';
    let last = 0;
    matches.forEach((match, i) => {
      result += text.slice(last, match.index) + imported[i];
      last = match.index + match[0].length;
    });
    return (result + text.slice(last)).trim();
  };

  const clearCaches = () => {
    textCache.clear();
    importCache.clear();
  };

  engine.network = { loadText, loadDataURL, inlineImports, clearCaches };
})();
