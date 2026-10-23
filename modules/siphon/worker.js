import '../../lib/storage.js';
import '../../lib/match.js';
import { syncContentScripts } from '../../lib/content-scripts.js';
import './module.js';

const { storage, match } = globalThis.extenso;
const ICON = 'icons/icon128.png';
const OFFSCREEN = 'modules/siphon/offscreen.html';

const SOURCES = {
  query: 'query',
  requestHeader: 'request.header',
  requestBody: 'request.body',
  responseHeader: 'response.header',
  responseBody: 'response.body',
  cookie: 'cookie',
  localStorage: 'localStorage',
  sessionStorage: 'sessionStorage',
};

const enabledRules = (settings) => (settings.enabled ? settings.rules.filter((rule) => rule.enabled !== false) : []);

const scopeMatches = (rule, url) => {
  if (!match.matchesAny([rule.scope?.pattern].filter(Boolean), url)) return false;
  if (!rule.scope?.urlRegex) return true;
  try {
    return new RegExp(rule.scope.urlRegex).test(url);
  } catch {
    return false;
  }
};

const pickJson = (root, path) => {
  let node = root;
  for (const part of path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
    if (node == null) return undefined;
    node = node[part];
  }
  return node;
};

const stringify = (value) =>
  value == null ? undefined : typeof value === 'object' ? JSON.stringify(value) : String(value);

const applyExtract = (value, extract) => {
  if (value == null) return undefined;
  const text = typeof value === 'string' ? value : stringify(value);
  const mode = extract?.mode ?? 'whole';
  if (mode === 'whole') return text;
  if (mode === 'regex') {
    try {
      const m = new RegExp(extract.regex).exec(text);
      return m ? (m.groups?.value ?? m[1] ?? m[0]) : undefined;
    } catch {
      return undefined;
    }
  }
  if (mode === 'json') {
    try {
      return stringify(pickJson(JSON.parse(text), extract.path ?? ''));
    } catch {
      return undefined;
    }
  }
  return text;
};

const queryValue = (url, key) => {
  const parsed = URL.parse(url);
  if (!parsed) return undefined;
  return key ? (parsed.searchParams.get(key) ?? undefined) : parsed.search.replace(/^\?/, '') || undefined;
};

const headerValue = (headers, key) => {
  if (!headers) return undefined;
  if (key) return headers.find((h) => h.name.toLowerCase() === key.toLowerCase())?.value;
  return headers.map((h) => `${h.name}: ${h.value}`).join('\n');
};

const bodyValue = (body, key) => {
  if (!body) return undefined;
  if (body.formData) {
    if (key) return body.formData[key]?.[0];
    return new URLSearchParams(
      Object.entries(body.formData).flatMap(([k, values]) => values.map((v) => [k, v])),
    ).toString();
  }
  if (body.raw?.length) {
    const text = body.raw.map((part) => (part.bytes ? new TextDecoder().decode(part.bytes) : '')).join('');
    if (!key) return text;
    try {
      return stringify(pickJson(JSON.parse(text), key));
    } catch {
      return new URLSearchParams(text).get(key) ?? undefined;
    }
  }
  return undefined;
};

let offscreenReady = null;
const ensureOffscreen = () => {
  offscreenReady ??= (async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN)],
    });
    if (!contexts.length) {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN,
        reasons: ['CLIPBOARD'],
        justification: 'Copy a captured value to the clipboard.',
      });
    }
  })().catch((error) => {
    offscreenReady = null;
    throw error;
  });
  return offscreenReady;
};

const copyToClipboard = async (value) => {
  await ensureOffscreen();
  await chrome.runtime.sendMessage({ target: 'offscreen-doc', type: 'copy-data-to-clipboard', data: value });
};

let queue = Promise.resolve();
const serialize = (task) => {
  queue = queue.then(task, task);
  return queue;
};

const record = (list, value, keep) => {
  if (list[0]?.value === value) return false;
  list.unshift({ value, at: Date.now() });
  const limit = keep?.mode === 'lastN' ? Math.max(1, keep.n || 1) : 1;
  list.length = Math.min(list.length, limit);
  return true;
};

const ingest = (sources, url, extractRaw) =>
  serialize(async () => {
    const settings = await storage.getSettings('siphon');
    const rules = enabledRules(settings).filter(
      (rule) => sources.includes(rule.source) && scopeMatches(rule, url),
    );
    if (!rules.length) return;
    const state = await storage.getState('siphon');
    state.captures ??= {};
    const hits = [];
    for (const rule of rules) {
      const value = applyExtract(extractRaw(rule), rule.extract);
      if (value == null || value === '') continue;
      const list = (state.captures[rule.id] ??= []);
      if (record(list, value, rule.keep)) hits.push({ rule, value });
    }
    if (!hits.length) return;
    await storage.setState('siphon', state);
    for (const { rule, value } of hits) {
      if (rule.on?.notify) {
        chrome.notifications.create({ type: 'basic', iconUrl: ICON, title: 'Siphon', message: `Captured ${rule.name}` });
      }
      if (rule.on?.copy) copyToClipboard(value).catch(() => {});
    }
  });

chrome.webRequest.onBeforeRequest.addListener(
  (details) =>
    void ingest([SOURCES.query, SOURCES.requestBody], details.url, (rule) =>
      rule.source === SOURCES.query ? queryValue(details.url, rule.key) : bodyValue(details.requestBody, rule.key),
    ),
  { urls: ['<all_urls>'] },
  ['requestBody'],
);

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) =>
    void ingest([SOURCES.requestHeader], details.url, (rule) => headerValue(details.requestHeaders, rule.key)),
  { urls: ['<all_urls>'] },
  ['requestHeaders', 'extraHeaders'],
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) =>
    void ingest([SOURCES.responseHeader], details.url, (rule) => headerValue(details.responseHeaders, rule.key)),
  { urls: ['<all_urls>'] },
  ['responseHeaders', 'extraHeaders'],
);

chrome.cookies.onChanged.addListener(({ cookie, removed }) => {
  if (removed) return;
  const host = cookie.domain.replace(/^\./, '');
  const url = `https://${host}${cookie.path || '/'}`;
  void ingest([SOURCES.cookie], url, (rule) =>
    !rule.key || rule.key === cookie.name ? cookie.value : undefined,
  );
});

const scriptsFor = (settings) => {
  const rules = enabledRules(settings);
  const matchesFor = (sources) => [
    ...new Set(rules.filter((rule) => sources.includes(rule.source)).map((rule) => rule.scope?.pattern).filter(Boolean)),
  ];
  const storageMatches = matchesFor([SOURCES.localStorage, SOURCES.sessionStorage]);
  const netMatches = matchesFor([SOURCES.responseBody]);
  return [
    storageMatches.length && {
      id: 'storage',
      matches: storageMatches,
      js: ['lib/messages.js', 'modules/siphon/content/storage.js'],
      runAt: 'document_idle',
    },
    netMatches.length && {
      id: 'net-relay',
      matches: netMatches,
      js: ['lib/messages.js', 'modules/siphon/content/net-relay.js'],
      runAt: 'document_start',
    },
    netMatches.length && {
      id: 'net-main',
      matches: netMatches,
      js: ['modules/siphon/page/net.js'],
      runAt: 'document_start',
      world: 'MAIN',
    },
  ].filter(Boolean);
};

export async function sync(settings) {
  await syncContentScripts('siphon', scriptsFor(settings));
}

const listCaptures = async () => {
  const [settings, state] = await Promise.all([storage.getSettings('siphon'), storage.getState('siphon')]);
  const captures = state.captures ?? {};
  return settings.rules.map((rule) => {
    const latest = captures[rule.id]?.[0];
    return {
      id: rule.id,
      name: rule.name,
      source: rule.source,
      key: rule.key ?? '',
      enabled: rule.enabled !== false,
      count: captures[rule.id]?.length ?? 0,
      value: latest?.value ?? null,
      at: latest?.at ?? null,
    };
  });
};

const clearCaptures = async ({ ruleId }) => {
  const state = await storage.getState('siphon');
  state.captures ??= {};
  if (ruleId) delete state.captures[ruleId];
  else state.captures = {};
  await storage.setState('siphon', state);
};

const addRule = async ({ rule }) => {
  const settings = await storage.getSettings('siphon');
  const saved = { id: crypto.randomUUID(), enabled: true, ...rule };
  await storage.setSettings('siphon', { ...settings, rules: [...settings.rules, saved] });
  return saved;
};

const ingestStorage = ({ url, local, session }) => {
  const maps = {
    [SOURCES.localStorage]: new Map(local ?? []),
    [SOURCES.sessionStorage]: new Map(session ?? []),
  };
  return ingest([SOURCES.localStorage, SOURCES.sessionStorage], url, (rule) =>
    rule.key ? maps[rule.source]?.get(rule.key) : undefined,
  );
};

const ingestResponse = ({ url, body }) =>
  ingest([SOURCES.responseBody], url, (rule) =>
    rule.key ? bodyValue({ raw: [{ bytes: new TextEncoder().encode(body).buffer }] }, rule.key) : body,
  );

export async function onMessage(message) {
  switch (message.action) {
    case 'list':
      return listCaptures();
    case 'clear':
      return clearCaptures(message);
    case 'addRule':
      return addRule(message);
    case 'storage':
      await ingestStorage(message);
      return true;
    case 'response':
      await ingestResponse(message);
      return true;
    default:
      throw new Error(`Unknown siphon action: ${message.action}`);
  }
}
