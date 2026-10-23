import '../lib/registry.js';
import { mountTabs, openOptions } from '../ui/tabs.js';

const LAST_TAB = 'extenso.popup.tab';

const activeTab = async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  } catch {
    return undefined;
  }
};

const tab = await activeTab();
const entries = Object.entries(globalThis.extenso.modules).map(([name, { label }]) => ({
  id: name,
  label,
  render: async (panel) => (await import(`../modules/${name}/popup.js`)).render(panel, tab),
}));

document.getElementById('open-options').addEventListener('click', () => openOptions());
mountTabs(document.querySelector('nav'), document.querySelector('main'), entries, {
  initial: localStorage.getItem(LAST_TAB),
  onSelect: (id) => localStorage.setItem(LAST_TAB, id),
});
