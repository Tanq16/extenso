import '../../lib/messages.js';
import '../../lib/storage.js';
import './module.js';
import { h, icon, setStatus } from '../../ui/dom.js';
import { moduleCard } from '../../ui/modules.js';

const DAY = 24 * 60 * 60 * 1000;
const { messages, storage, modules } = globalThis.extenso;

const expiry = (expiresAt) => {
  const days = Math.ceil((expiresAt - Date.now()) / DAY);
  if (days <= 0) return { text: 'Expired', type: 'warning' };
  return { text: days === 1 ? 'Expires in 1 day' : `Expires in ${days} days`, type: 'info' };
};

export async function render(container) {
  const general = h('p', { className: 'status' });
  const overridesStatus = h('p', { className: 'status' });
  const cacheStatus = h('p', { className: 'status' });
  const ttl = h('input', { type: 'number', className: 'narrow', min: 1, step: 1 });
  const overrides = h('ul', { className: 'list' });
  const noOverrides = h('p', { className: 'empty' }, 'No site overrides. Set one from the popup.');
  const cache = h('ul', { className: 'list' });
  const noCache = h('p', { className: 'empty' }, 'No sites detected as dark yet.');
  const clear = h('button', { type: 'button', className: 'small danger' }, icon('trash-2'), 'Clear all');

  const run = async (task, message, target) => {
    try {
      await task();
      setStatus(target, message, 'success');
    } catch (error) {
      setStatus(target, error.message, 'error');
    }
  };

  const remove = (label, task, message, target) => h('button', {
    type: 'button',
    className: 'small danger',
    'aria-label': label,
    onclick: () => run(task, message, target),
  }, icon('x'), 'Remove');

  const fill = (list, empty, items) => {
    list.replaceChildren(...items);
    list.hidden = !items.length;
    empty.hidden = Boolean(items.length);
  };

  const refresh = async () => {
    const [settings, state] = await Promise.all([storage.getSettings('dark'), storage.getState('dark')]);
    if (document.activeElement !== ttl) ttl.value = settings.ttlDays;

    fill(overrides, noOverrides, Object.entries(settings.sites).sort(([a], [b]) => a.localeCompare(b)).map(([host, mode]) => h('li', {},
      h('span', { className: 'grow mono truncate' }, host),
      h('span', { className: 'badge' }, modules.dark.modes[mode] ?? mode),
      remove(`Remove override for ${host}`, () => messages.send('dark', 'setSite', { host, mode: 'auto' }), `${host} is back to ${modules.dark.modes.auto}.`, overridesStatus),
    )));

    const hosts = Object.entries(state.hosts).sort(([a], [b]) => a.localeCompare(b));
    clear.hidden = !hosts.length;
    fill(cache, noCache, hosts.map(([host, expiresAt]) => {
      const { text, type } = expiry(expiresAt);
      return h('li', {},
        h('span', { className: 'grow mono truncate' }, host),
        h('span', { className: `badge ${type}` }, text),
        remove(`Forget ${host}`, () => messages.send('dark', 'forget', { host }), `${host} is checked again on the next visit.`, cacheStatus),
      );
    }));
  };

  ttl.addEventListener('change', () => {
    const days = Math.round(Number(ttl.value));
    if (!(days >= 1)) {
      setStatus(general, 'Enter at least 1 day.', 'error');
      return;
    }
    run(() => storage.updateSettings('dark', { ttlDays: days }), `Dark sites are checked again after ${days} days.`, general);
  });
  clear.addEventListener('click', () => run(() => messages.send('dark', 'clearCache'), 'Cleared the dark site cache.', cacheStatus));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[storage.settingsKey('dark')] || changes[storage.stateKey('dark')])) refresh();
  });

  container.append(
    await moduleCard('dark', general, h('label', { className: 'row' }, 'Days before a dark site is checked again', ttl)),
    h('section', { className: 'card' },
      h('h2', {}, 'Site overrides'),
      overrides,
      noOverrides,
      overridesStatus,
    ),
    h('section', { className: 'card' },
      h('div', { className: 'row' }, h('h2', { className: 'grow' }, 'Detected dark sites'), clear),
      h('p', { className: 'muted' }, 'These sites are left unthemed until their entry expires, then checked again before theming.'),
      cache,
      noCache,
      cacheStatus,
    ),
  );
  await refresh();
}
