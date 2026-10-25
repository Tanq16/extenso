import '../../lib/storage.js';
import './module.js';
import { scriptId, syncContentScripts } from '../../lib/content-scripts.js';
import { isolated, main } from './engine-files.js';
import { lookup } from './sites.js';

const DAY = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT = 10_000;
const SHARED = {
  matches: ['*://*/*'],
  runAt: 'document_start',
  allFrames: true,
  matchOriginAsFallback: true,
};
const SCRIPTS = [
  ...(main.length ? [{ ...SHARED, id: 'main', js: main, world: 'MAIN' }] : []),
  {
    ...SHARED,
    id: 'content',
    world: 'ISOLATED',
    js: [
      'lib/storage.js',
      'lib/messages.js',
      'modules/dark/module.js',
      'modules/dark/content/detector.js',
      'modules/dark/content/filter.js',
      ...isolated,
      'modules/dark/content/controller.js',
    ],
  },
];
const { storage, modules } = globalThis.extenso;

let queue = Promise.resolve();
const serialize = (task) => {
  const next = queue.then(task);
  queue = next.catch(() => {});
  return next;
};

const signature = (scripts) => JSON.stringify(scripts
  .map(({ id, js, world, runAt, matches, allFrames, matchOriginAsFallback }) =>
    ({ id, js, world: world ?? 'ISOLATED', runAt, matches, allFrames, matchOriginAsFallback }))
  .sort((a, b) => a.id.localeCompare(b.id)));

export async function sync({ enabled }) {
  const wanted = enabled ? SCRIPTS : [];
  const prefix = scriptId('dark', '');
  const registered = (await chrome.scripting.getRegisteredContentScripts())
    .filter(({ id }) => id.startsWith(prefix))
    .map((script) => ({ ...script, id: script.id.slice(prefix.length) }));
  if (signature(registered) !== signature(wanted)) await syncContentScripts('dark', wanted);
}

const hostOf = (value) => {
  if (typeof value !== 'string' || !value || /[/:\s]/.test(value)) throw new Error('A host name is required.');
  return value.toLowerCase();
};

const reloadHost = async (host) => {
  const tabs = await chrome.tabs.query({ url: `*://${host}/*` });
  await Promise.allSettled(tabs.map((tab) => chrome.tabs.reload(tab.id)));
};

const setSite = (host, mode) => serialize(async () => {
  if (!Object.hasOwn(modules.dark.modes, mode)) throw new Error(`Unknown mode: ${mode}`);
  const { sites } = await storage.getSettings('dark');
  const next = { ...sites };
  if (mode === 'auto') delete next[host];
  else next[host] = mode;
  await storage.updateSettings('dark', { sites: next });
  await reloadHost(host);
});

const updateHosts = (change) => serialize(async () => {
  const [{ ttlDays }, { hosts }] = await Promise.all([storage.getSettings('dark'), storage.getState('dark')]);
  await storage.updateState('dark', { hosts: change({ ...hosts }, Date.now() + ttlDays * DAY) });
});

const urlOf = (value) => {
  if (typeof value !== 'string' || !URL.canParse(value)) throw new Error('A URL is required.');
  return value;
};

const encode = (bytes) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

const fetchResource = async ({ url, as = 'text', timeoutMs = FETCH_TIMEOUT }) => {
  const target = URL.parse(url);
  if (!target || !['http:', 'https:'].includes(target.protocol)) throw new Error(`Refusing to fetch ${url}`);
  if (as !== 'text' && as !== 'dataURL') throw new Error(`Unknown fetch format: ${as}`);
  const response = await fetch(target.href, { credentials: 'omit', signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  if (as === 'text') return { text: await response.text() };
  const type = (response.headers.get('content-type') ?? 'application/octet-stream').replace(/\s+/g, '');
  return { dataURL: `data:${type};base64,${encode(new Uint8Array(await response.arrayBuffer()))}` };
};

export async function onMessage(message) {
  switch (message.action) {
    case 'fetch':
      return fetchResource(message);
    case 'lookup':
      return lookup(urlOf(message.frame));
    case 'remember':
      return updateHosts((hosts, expiresAt) => ({ ...hosts, [hostOf(message.host)]: expiresAt }));
    case 'forget':
      return updateHosts((hosts) => {
        delete hosts[hostOf(message.host)];
        return hosts;
      });
    case 'clearCache':
      return updateHosts(() => ({}));
    case 'setSite':
      return setSite(hostOf(message.host), message.mode);
    default:
      throw new Error(`Unknown dark action: ${message.action}`);
  }
}
