import './registry.js';
import './storage.js';
import './messages.js';

const VERSION = 1;
const { storage, messages, modules } = globalThis.extenso;

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

export async function exportSettings() {
  return {
    version: VERSION,
    exportedAt: new Date().toISOString(),
    settings: await storage.getAllSettings(),
  };
}

export async function importSettings(data) {
  if (data?.version !== VERSION) throw new Error(`Unsupported export version: ${data?.version}`);
  if (!isObject(data.settings)) throw new Error('The file has no settings object.');
  const entries = Object.entries(data.settings);
  const accepted = entries.filter(([name, value]) => Object.hasOwn(modules, name) && isObject(value));
  await chrome.storage.local.set(
    Object.fromEntries(accepted.map(([name, value]) => [storage.settingsKey(name), value])),
  );
  await messages.send('core', 'sync');
  const imported = accepted.map(([name]) => name);
  return { imported, skipped: entries.map(([name]) => name).filter((name) => !imported.includes(name)) };
}
