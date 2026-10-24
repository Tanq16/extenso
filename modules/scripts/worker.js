import '../../lib/storage.js';
import './module.js';
import { scriptId } from '../../lib/content-scripts.js';

const MENU = scriptId('scripts', 'run');
const MENU_ITEM = `${MENU}:`;
const PREFIX = scriptId('scripts', '');
const CONTEXTS = ['page', 'frame', 'selection', 'link', 'editable', 'image', 'video', 'audio'];
const { storage, modules } = globalThis.extenso;
const { scriptsOf, sourceOf } = modules.scripts;

const isAvailable = async () => {
  try {
    await chrome.userScripts.getScripts();
    return true;
  } catch {
    return false;
  }
};

const createMenu = (properties) => new Promise((resolve, reject) => {
  chrome.contextMenus.create(properties, () => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message));
    else resolve();
  });
});

const syncMenus = async (scripts) => {
  await chrome.contextMenus.remove(MENU).catch(() => {});
  if (!scripts.length) return;
  await createMenu({
    id: MENU,
    title: 'Run script',
    contexts: CONTEXTS,
    documentUrlPatterns: [...new Set(scripts.flatMap(({ matches }) => matches))],
  });
  for (const script of scripts) {
    try {
      await createMenu({
        id: MENU_ITEM + script.id,
        parentId: MENU,
        title: script.name,
        contexts: CONTEXTS,
        documentUrlPatterns: script.matches,
      });
    } catch (error) {
      console.error(`[extenso] scripts menu for ${script.name} failed`, error);
    }
  }
};

const syncRegistrations = async (scripts) => {
  const ids = (await chrome.userScripts.getScripts())
    .map(({ id }) => id)
    .filter((id) => id.startsWith(PREFIX));
  if (ids.length) await chrome.userScripts.unregister({ ids });
  const results = await Promise.allSettled(scripts.map(async (script) => chrome.userScripts.register([{
    id: PREFIX + script.id,
    matches: script.matches,
    js: [{ code: await sourceOf(script) }],
    runAt: script.runAt,
    world: script.world,
  }])));
  return Object.fromEntries(results.flatMap((result, index) =>
    result.status === 'rejected' ? [[scripts[index].id, result.reason?.message ?? String(result.reason)]] : []));
};

export async function sync(settings) {
  const active = settings.enabled
    ? scriptsOf(settings).filter((item) => item.enabled && item.matches.length && (item.file || item.code))
    : [];
  await syncMenus(active.filter((item) => item.trigger === 'manual'));
  const available = await isAvailable();
  const errors = available ? await syncRegistrations(active.filter((item) => item.trigger === 'auto')) : {};
  await storage.setState('scripts', { synced: available, errors });
}

// userScripts.execute leaves InjectionResult.error unset when the injected code throws or rejects.
const guard = (code) => `(async () => {
try {
${code}
;
return { ok: true };
} catch (error) {
return { error: String(error?.message ?? error) };
}
})()`;

const run = async (id, tabId) => {
  const settings = await storage.getSettings('scripts');
  if (!settings.enabled) throw new Error('Scripts are turned off.');
  const script = scriptsOf(settings).find((item) => item.id === id);
  if (!script) throw new Error('Script not found.');
  if (tabId == null) throw new Error('No tab to run on.');
  if (!(await isAvailable())) throw new Error('Turn on "Allow User Scripts" on the extension\'s details page.');
  const [injection] = await chrome.userScripts.execute({
    target: { tabId },
    js: [{ code: guard(await sourceOf(script)) }],
    world: script.world,
  });
  const outcome = injection?.error ?? injection?.result?.error;
  if (outcome) throw new Error(outcome);
  if (!injection?.result?.ok) throw new Error(`${script.name} did not run. Check it for syntax errors.`);
};

export async function onMessage({ action, id, tabId }) {
  if (action === 'status') return { available: await isAvailable() };
  if (action === 'run') return run(id, tabId);
  throw new Error(`Unknown scripts action: ${action}`);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const id = String(info.menuItemId);
  if (!id.startsWith(MENU_ITEM)) return;
  try {
    await run(id.slice(MENU_ITEM.length), tab?.id);
  } catch (error) {
    chrome.notifications.create(`${PREFIX}error`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'Script failed',
      message: error.message,
    }).catch((notifyError) => console.error('[extenso] scripts notification failed', notifyError));
  }
});
