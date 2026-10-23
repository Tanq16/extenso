import '../lib/registry.js';
import '../lib/storage.js';
import * as newtab from '../modules/newtab/worker.js';
import * as scripts from '../modules/scripts/worker.js';
import * as siphon from '../modules/siphon/worker.js';
import * as dark from '../modules/dark/worker.js';
import * as declutter from '../modules/declutter/worker.js';
import * as relay from '../modules/relay/worker.js';

const workers = new Map(Object.entries({ newtab, scripts, siphon, dark, declutter, relay }));
const { storage } = globalThis.extenso;
const queues = new Map();

const sync = (name) => {
  const run = async () => workers.get(name).sync?.(await storage.getSettings(name));
  const next = (queues.get(name) ?? Promise.resolve())
    .then(run)
    .catch((error) => console.error(`[extenso] ${name} sync failed`, error));
  queues.set(name, next);
  return next;
};

const syncAll = async () => {
  await Promise.all([...workers.keys()].map(sync));
};

const core = {
  async onMessage({ action }) {
    if (action === 'sync') return syncAll();
    throw new Error(`Unknown core action: ${action}`);
  },
};

chrome.runtime.onInstalled.addListener(syncAll);
chrome.runtime.onStartup.addListener(syncAll);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const name of workers.keys()) {
    if (Object.hasOwn(changes, storage.settingsKey(name))) sync(name);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = message?.module === 'core' ? core.onMessage : workers.get(message?.module)?.onMessage;
  if (!handler) return false;
  Promise.resolve()
    .then(() => handler(message, sender))
    .then(
      (result) => sendResponse({ ok: true, result }),
      (error) => sendResponse({ ok: false, error: error?.message ?? String(error) }),
    );
  return true;
});
