import '../../lib/storage.js';
import './module.js';

const PREFIX = 'relay:';
const TIMEOUT_MS = 10000;
const TITLES = { page: 'Send page to', selection: 'Send selection to', link: 'Send link to' };
const SAMPLE_URL = 'https://example.com/';
const { storage } = globalThis.extenso;

const menuId = (target) => PREFIX + target.id;

const sample = (payload) => (payload === 'link'
  ? { url: SAMPLE_URL, pageUrl: SAMPLE_URL }
  : { url: SAMPLE_URL, title: 'Extenso relay test', text: 'Test message from Extenso.' });

const createMenu = (properties) => new Promise((resolve, reject) => {
  chrome.contextMenus.create(properties, () => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message));
    else resolve();
  });
});

const readPage = async (tabId, frameId, kind) => {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    args: [kind],
    func: (kind) => ({
      url: location.href,
      title: document.title,
      text: kind === 'selection' ? getSelection().toString() : document.body?.innerText ?? '',
    }),
  });
  return result;
};

const payloadFor = async ({ payload }, { tabId, frameId = 0, linkUrl, pageUrl, selectionText }) => {
  if (payload === 'link') return { url: linkUrl, pageUrl };
  const page = await readPage(tabId, frameId, payload);
  if (payload === 'selection') page.text ||= selectionText ?? '';
  if (payload === 'selection' && !page.text) throw new Error('Nothing is selected.');
  return page;
};

const post = async ({ url, method, headers }, body) => {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(error.name === 'TimeoutError'
      ? `${url} did not respond within ${TIMEOUT_MS / 1000} seconds.`
      : `Could not reach ${url}: ${error.message}`);
  }
  if (!response.ok) throw new Error(`${url} answered ${response.status} ${response.statusText}`.trim());
  return response.status;
};

const send = async (targetId, context) => {
  const { enabled, targets } = await storage.getSettings('relay');
  if (!enabled) throw new Error('Relay is off.');
  const target = targets.find(({ id }) => id === targetId);
  if (!target) throw new Error('That target no longer exists.');
  return { name: target.name, status: await post(target, await payloadFor(target, context)) };
};

export async function sync({ enabled, targets }) {
  const items = enabled ? targets.filter((target) => target.enabled) : [];
  const { menus } = await storage.getState('relay');
  const stale = new Set([...menus, ...items.map(menuId)]);
  await Promise.all([...stale].map((id) => chrome.contextMenus.remove(id).catch(() => {})));
  for (const target of items) {
    await createMenu({ id: menuId(target), title: `${TITLES[target.payload]} ${target.name}`, contexts: [target.payload] });
  }
  await storage.setState('relay', { menus: items.map(menuId) });
}

export async function onMessage({ action, targetId, tabId, url, target }) {
  if (action === 'send') return send(targetId, { tabId, linkUrl: url, pageUrl: url });
  if (action === 'test') return post(target, sample(target.payload));
  throw new Error(`Unknown relay action: ${action}`);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (typeof info.menuItemId !== 'string' || !info.menuItemId.startsWith(PREFIX)) return;
  let title;
  let message;
  try {
    const { name, status } = await send(info.menuItemId.slice(PREFIX.length), {
      tabId: tab.id,
      frameId: info.frameId,
      linkUrl: info.linkUrl,
      pageUrl: info.pageUrl,
      selectionText: info.selectionText,
    });
    title = `Sent to ${name}`;
    message = `The server answered ${status}.`;
  } catch (error) {
    title = 'Relay failed';
    message = error.message;
  }
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title,
      message,
    });
  } catch (error) {
    console.error('[extenso] relay notification failed', error);
  }
});
