import '../../lib/storage.js';
import './module.js';
import { h } from '../../ui/dom.js';
import { openOptions } from '../../ui/tabs.js';

const { storage } = globalThis.extenso;

export async function render(container) {
  const { enabled, url } = await storage.getSettings('newtab');
  const toggle = h('input', {
    type: 'checkbox',
    className: 'toggle',
    checked: enabled,
    onchange: () => storage.updateSettings('newtab', { enabled: toggle.checked }),
  });
  container.append(
    h('section', { className: 'card' },
      h('label', { className: 'row' }, 'Redirect new tabs', toggle),
      url ? h('p', { className: 'mono truncate' }, url) : h('p', { className: 'empty' }, 'No redirect URL set.'),
      h('button', { type: 'button', onclick: () => openOptions('newtab') }, url ? 'Change URL' : 'Set URL'),
    ),
  );
}
