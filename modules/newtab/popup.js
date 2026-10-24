import '../../lib/storage.js';
import './module.js';
import { h } from '../../ui/dom.js';
import { moduleCard } from '../../ui/modules.js';
import { openOptions } from '../../ui/tabs.js';

const { storage } = globalThis.extenso;

export async function render(container) {
  const { url } = await storage.getSettings('newtab');
  container.append(
    await moduleCard('newtab'),
    h('section', { className: 'card' },
      url ? h('p', { className: 'mono truncate' }, url) : h('p', { className: 'empty' }, 'No redirect URL set.'),
      h('button', { type: 'button', onclick: () => openOptions('newtab') }, url ? 'Change URL' : 'Set URL'),
    ),
  );
}
