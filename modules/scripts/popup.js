import '../../lib/match.js';
import '../../lib/storage.js';
import './module.js';
import { h, icon } from '../../ui/dom.js';
import { moduleCard } from '../../ui/modules.js';
import { openOptions } from '../../ui/tabs.js';
import { availabilityNotice, runButton } from './ui.js';

const { match, storage } = globalThis.extenso;

export async function render(container, tab) {
  const { items } = await storage.getSettings('scripts');
  const status = h('p', { className: 'status' });
  const scripts = items.filter((item) =>
    item.enabled && item.trigger === 'manual' && match.matchesAny(item.matches, tab?.url ?? ''));
  const list = scripts.length
    ? h('ul', { className: 'list' }, scripts.map((script) =>
      h('li', {}, h('span', { className: 'grow truncate' }, script.name), runButton(script, status, async () => tab))))
    : h('p', { className: 'empty' }, 'No scripts for this page.');

  container.append(...[
    await moduleCard('scripts'),
    await availabilityNotice(),
    h('section', { className: 'card' }, h('h2', {}, 'Run on this page'), list, status),
    h('button', { type: 'button', onclick: () => openOptions('scripts') }, icon('external-link'), 'Manage scripts'),
  ].filter(Boolean));
}
