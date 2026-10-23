import '../../lib/match.js';
import './module.js';
import { syncContentScripts } from '../../lib/content-scripts.js';

const FILES = ['lib/storage.js', 'lib/match.js', 'modules/declutter/module.js', 'modules/declutter/content/declutter.js'];
const { match } = globalThis.extenso;

export async function sync({ enabled, rules }) {
  const patterns = enabled ? rules.filter((rule) => rule.enabled).flatMap((rule) => rule.matches) : [];
  const matches = [...new Set(patterns)].filter(match.isValid);
  await syncContentScripts('declutter', matches.length
    ? [{ id: 'rules', matches, js: FILES, runAt: 'document_start' }]
    : []);
}

export async function onMessage({ action, tabId }) {
  if (action !== 'apply') throw new Error(`Unknown declutter action: ${action}`);
  await chrome.scripting.executeScript({ target: { tabId }, files: FILES });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => globalThis.extenso.declutter.refresh(),
  });
  return result;
}
