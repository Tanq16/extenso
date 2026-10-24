import '../lib/registry.js';
import '../lib/storage.js';
import { icon } from '../ui/dom.js';
import { ICONS } from '../ui/modules.js';
import { mountTabs, openOptions } from '../ui/tabs.js';

const { storage } = globalThis.extenso;

const activeTab = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  } catch {
    return undefined;
  }
};

const lastTab = async () => {
  try {
    return (await storage.getState('popup')).tab;
  } catch {
    return undefined;
  }
};

const [tab, initial] = await Promise.all([activeTab(), lastTab()]);
const entries = Object.entries(globalThis.extenso.modules).map(([name, { label }]) => ({
  id: name,
  label,
  icon: ICONS[name],
  render: async (panel) => (await import(`../modules/${name}/popup.js`)).render(panel, tab),
}));

const options = document.getElementById('open-options');
options.prepend(icon('settings'));
options.addEventListener('click', () => openOptions());
mountTabs(document.querySelector('nav'), document.querySelector('main'), entries, {
  initial,
  onSelect: (id) => storage.setState('popup', { tab: id }).catch((error) => console.error('[extenso] popup tab save failed', error)),
});
