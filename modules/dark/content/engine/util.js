(() => {
  const dark = (globalThis.extenso ??= {}).dark ??= {};
  const engine = (dark.engine ??= {});

  const scale = (x, inLow, inHigh, outLow, outHigh) => (x - inLow) * (outHigh - outLow) / (inHigh - inLow) + outLow;
  const clamp = (x, min, max) => Math.min(max, Math.max(min, x));

  const getMatches = (regex, input, group = 0) => {
    const matches = [];
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(input))) matches.push(match[group]);
    return matches;
  };

  const getParenthesesRange = (input, searchStart = 0) => {
    let depth = 0;
    let start = -1;
    for (let i = searchStart; i < input.length; i++) {
      const c = input[i];
      if (c === '(') {
        if (depth === 0) start = i;
        depth++;
      } else if (c === ')' && depth > 0) {
        depth--;
        if (depth === 0) return { start, end: i + 1 };
      }
    }
    return null;
  };

  const escapeRegExp = (input) => input.replace(/[\^$.*+?()[\]{}|\-\\]/g, '\\$&');

  const throttle = (callback) => {
    let frameId = null;
    let pending = false;
    let lastArgs = [];
    const throttled = (...args) => {
      lastArgs = args;
      if (frameId) {
        pending = true;
        return;
      }
      callback(...lastArgs);
      frameId = requestAnimationFrame(() => {
        frameId = null;
        if (pending) {
          pending = false;
          callback(...lastArgs);
        }
      });
    };
    throttled.cancel = () => {
      cancelAnimationFrame(frameId);
      frameId = null;
      pending = false;
    };
    return throttled;
  };

  const FRAME_BUDGET_MS = 1000 / 60;

  const createFrameQueue = () => {
    let tasks = [];
    let frameId = null;
    const run = () => {
      frameId = null;
      const start = performance.now();
      let task;
      while ((task = tasks.shift())) {
        task();
        if (tasks.length && performance.now() - start >= FRAME_BUDGET_MS) {
          frameId = requestAnimationFrame(run);
          return;
        }
      }
    };
    return {
      add(task) {
        tasks.push(task);
        frameId ??= requestAnimationFrame(run);
      },
      cancel() {
        tasks = [];
        cancelAnimationFrame(frameId);
        frameId = null;
      },
    };
  };

  const urlCache = new Map();
  let anchor = null;

  const parseURL = (url, base = null) => {
    const key = base ? `${url};${base}` : url;
    let parsed = urlCache.get(key);
    if (parsed) return parsed;
    if (base) {
      parsed = new URL(url, base);
    } else {
      anchor ??= document.createElement('a');
      anchor.href = url;
      parsed = new URL(anchor.href);
    }
    urlCache.set(key, parsed);
    return parsed;
  };

  const getAbsoluteURL = (base, relative) => {
    if (/^data\\?:/.test(relative)) return relative;
    if (relative.startsWith('//')) return `${location.protocol}${relative}`;
    return parseURL(relative, parseURL(base).href).href;
  };

  const getCSSBaseURL = (url) => {
    const parsed = parseURL(url);
    return `${parsed.origin}${parsed.pathname.replace(/\?.*$/, '').replace(/(\/)([^/]+)$/, '$1')}`;
  };

  const isSameOrigin = (url) => {
    try {
      return new URL(url).origin === location.origin;
    } catch {
      return false;
    }
  };

  const isRelativeHrefOnAbsolutePath = (href) => {
    if (href.startsWith('data:')) return true;
    const url = parseURL(href);
    return url.origin === location.origin && url.pathname === location.pathname;
  };

  const clearCaches = () => urlCache.clear();

  const EVENTS = {
    hello: '__extenso_dark__proxyHello',
    install: '__extenso_dark__proxyInstall',
    cleanUp: '__extenso_dark__proxyCleanUp',
    updateSheet: '__extenso_dark__updateSheet',
    adoptedSheetsChange: '__extenso_dark__adoptedSheetsChange',
    adoptedSheetChange: '__extenso_dark__adoptedSheetChange',
    adoptedDeclarationChange: '__extenso_dark__adoptedDeclarationChange',
    shadowAttaching: '__extenso_dark__shadowAttaching',
    addUndefinedResolver: '__extenso_dark__addUndefinedResolver',
    isDefined: '__extenso_dark__isDefined',
  };

  engine.util = {
    EVENTS,
    scale,
    clamp,
    getMatches,
    getParenthesesRange,
    escapeRegExp,
    throttle,
    createFrameQueue,
    getAbsoluteURL,
    getCSSBaseURL,
    isSameOrigin,
    isRelativeHrefOnAbsolutePath,
    clearCaches,
  };
})();
