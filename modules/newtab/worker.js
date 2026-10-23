import '../../lib/storage.js';
import './module.js';

const NEW_TAB = 'chrome://newtab/';
const { storage } = globalThis.extenso;

chrome.tabs.onCreated.addListener(async (tab) => {
  if (tab.pendingUrl !== NEW_TAB && tab.url !== NEW_TAB) return;
  try {
    const { enabled, url } = await storage.getSettings('newtab');
    if (enabled && url) await chrome.tabs.update(tab.id, { url });
  } catch (error) {
    console.error('[extenso] newtab redirect failed', error);
  }
});
