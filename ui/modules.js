import '../lib/storage.js';
import { h, setStatus } from './dom.js';

const SWITCHES = {
  newtab: 'Redirect new tabs',
  scripts: 'Run scripts',
  siphon: 'Capture values',
  dark: 'Theme pages dark',
  declutter: 'Declutter pages',
  relay: 'Relay to local servers',
};

export async function moduleCard(name, status = h('p', { className: 'status' }), ...fields) {
  const { storage, modules } = globalThis.extenso;
  const { label, defaults } = modules[name];
  const toggle = h('input', {
    type: 'checkbox',
    className: 'toggle',
    checked: (await storage.getSettings(name)).enabled,
    onchange: async () => {
      try {
        await storage.updateSettings(name, { enabled: toggle.checked });
        setStatus(status, `${label} ${toggle.checked ? 'on' : 'off'}.`, 'success');
      } catch (error) {
        toggle.checked = !toggle.checked;
        setStatus(status, error.message, 'error');
      }
    },
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    const next = changes[storage.settingsKey(name)]?.newValue;
    if (area === 'local' && next) toggle.checked = Boolean({ ...defaults.settings, ...next }.enabled);
  });

  return h('section', { className: 'card' }, h('label', { className: 'row' }, SWITCHES[name], toggle), ...fields, status);
}
