import '../../lib/match.js';
import '../../lib/storage.js';
import './module.js';
import { h, icon } from '../../ui/dom.js';
import { moduleCard } from '../../ui/modules.js';
import { openOptions } from '../../ui/tabs.js';
import { availabilityNotice, runScript } from './ui.js';

const { match, storage, modules } = globalThis.extenso;

export async function render(container, tab) {
  const settings = await storage.getSettings('scripts');
  const status = h('p', { className: 'status' });
  const scripts = modules.scripts.scriptsOf(settings).filter((item) =>
    item.enabled && item.trigger === 'manual' && match.matchesAny(item.matches, tab?.url ?? ''));
  const tiles = scripts.length
    ? h('div', { className: 'tiles' }, scripts.map((script) => h('button', {
      type: 'button',
      title: script.description ?? '',
      onclick: runScript(script, status, async () => tab),
    }, icon('play'), h('span', { className: 'truncate' }, script.name))))
    : h('p', { className: 'empty' }, 'No scripts for this page.');

  container.append(...[
    await moduleCard('scripts'),
    await availabilityNotice(),
    tiles,
    status,
    h('button', { type: 'button', onclick: () => openOptions('scripts') }, icon('external-link'), 'Manage scripts'),
  ].filter(Boolean));
}
