import '../../lib/match.js';
import '../../lib/storage.js';
import './module.js';
import { h } from '../../ui/dom.js';
import { openOptions } from '../../ui/tabs.js';
import { availabilityNotice, runButton } from './ui.js';

const { match, storage } = globalThis.extenso;

export async function render(container, tab) {
  const { enabled, items } = await storage.getSettings('scripts');
  const manage = h('button', { type: 'button', onclick: () => openOptions('scripts') }, 'Manage scripts');
  if (!enabled) {
    container.append(h('p', { className: 'empty' }, 'Scripts are turned off.'), manage);
    return;
  }

  const status = h('p', { className: 'status' });
  const scripts = items.filter((item) =>
    item.enabled && item.trigger === 'manual' && match.matchesAny(item.matches, tab?.url ?? ''));
  const list = scripts.length
    ? h('ul', { className: 'list' }, scripts.map((script) =>
      h('li', {}, h('span', { className: 'grow truncate' }, script.name), runButton(script, status, async () => tab))))
    : h('p', { className: 'empty' }, 'No scripts for this page.');

  container.append(...[await availabilityNotice(), list, status, manage].filter(Boolean));
}
