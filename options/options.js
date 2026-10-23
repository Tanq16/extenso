import '../lib/registry.js';
import { mountTabs } from '../ui/tabs.js';
import { render as renderGeneral } from './general.js';

const entries = [
  ...Object.entries(globalThis.extenso.modules).map(([name, { label }]) => ({
    id: name,
    label,
    render: async (panel) => (await import(`../modules/${name}/options.js`)).render(panel),
  })),
  { id: 'general', label: 'General', render: renderGeneral },
];

mountTabs(document.querySelector('nav'), document.querySelector('main'), entries, {
  initial: location.hash.slice(1),
  onSelect: (id) => history.replaceState(null, '', `#${id}`),
});
