import '../../lib/messages.js';
import '../../lib/storage.js';
import './module.js';
import { h, setStatus } from '../../ui/dom.js';

const DAY = 24 * 60 * 60 * 1000;
const { messages, storage, modules } = globalThis.extenso;

const expiry = (expiresAt) => {
  const days = Math.ceil((expiresAt - Date.now()) / DAY);
  if (days <= 0) return { text: 'Expired', type: 'warning' };
  return { text: days === 1 ? 'Expires in 1 day' : `Expires in ${days} days`, type: 'info' };
};

export async function render(container) {
  const status = h('p', { className: 'status' });
  const toggle = h('input', { type: 'checkbox', className: 'toggle' });
  const ttl = h('input', { type: 'number', min: 1, step: 1 });
  const overrides = h('ul', { className: 'list' });
  const noOverrides = h('p', { className: 'empty' }, 'No site overrides. Set one from the popup.');
  const cache = h('ul', { className: 'list' });
  const noCache = h('p', { className: 'empty' }, 'No sites detected as dark yet.');
  const clear = h('button', { type: 'button', className: 'danger' }, 'Clear all');

  const run = async (task, message) => {
    try {
      await task();
      setStatus(status, message, 'success');
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
  };

  const remove = (label, task, message) => h('button', {
    type: 'button',
    className: 'small danger',
    'aria-label': label,
    onclick: () => run(task, message),
  }, 'Remove');

  const fill = (list, empty, items) => {
    list.replaceChildren(...items);
    list.hidden = !items.length;
    empty.hidden = Boolean(items.length);
  };

  const refresh = async () => {
    const [settings, state] = await Promise.all([storage.getSettings('dark'), storage.getState('dark')]);
    toggle.checked = settings.enabled;
    if (document.activeElement !== ttl) ttl.value = settings.ttlDays;

    fill(overrides, noOverrides, Object.entries(settings.sites).sort(([a], [b]) => a.localeCompare(b)).map(([host, mode]) => h('li', {},
      h('span', { className: 'grow mono truncate' }, host),
      h('span', { className: 'badge' }, modules.dark.modes[mode] ?? mode),
      remove(`Remove override for ${host}`, () => messages.send('dark', 'setSite', { host, mode: 'auto' }), `${host} is back to ${modules.dark.modes.auto}.`),
    )));

    const hosts = Object.entries(state.hosts).sort(([a], [b]) => a.localeCompare(b));
    clear.hidden = !hosts.length;
    fill(cache, noCache, hosts.map(([host, expiresAt]) => {
      const { text, type } = expiry(expiresAt);
      return h('li', {},
        h('span', { className: 'grow mono truncate' }, host),
        h('span', { className: `badge ${type}` }, text),
        remove(`Forget ${host}`, () => messages.send('dark', 'forget', { host }), `${host} is checked again on the next visit.`),
      );
    }));
  };

  toggle.addEventListener('change', () => run(
    () => storage.updateSettings('dark', { enabled: toggle.checked }),
    toggle.checked ? 'Dark mode on for new page loads.' : 'Dark mode off.',
  ));
  ttl.addEventListener('change', () => {
    const days = Math.round(Number(ttl.value));
    if (!(days >= 1)) {
      setStatus(status, 'Enter at least 1 day.', 'error');
      return;
    }
    run(() => storage.updateSettings('dark', { ttlDays: days }), `Dark sites are checked again after ${days} days.`);
  });
  clear.addEventListener('click', () => run(() => messages.send('dark', 'clearCache'), 'Cleared the dark site cache.'));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[storage.settingsKey('dark')] || changes[storage.stateKey('dark')])) refresh();
  });

  container.append(
    h('section', { className: 'card' },
      h('h2', {}, 'Dark mode'),
      h('label', { className: 'row' }, 'Theme pages', toggle),
      h('label', { className: 'field' }, 'Days before a dark site is checked again', ttl),
    ),
    h('section', { className: 'card' },
      h('h2', {}, 'Site overrides'),
      overrides,
      noOverrides,
    ),
    h('section', { className: 'card' },
      h('h2', {}, 'Detected dark sites'),
      h('p', { className: 'muted' }, 'These sites are left unthemed until their entry expires, then checked again before theming.'),
      cache,
      noCache,
      clear,
    ),
    status,
  );
  await refresh();
}
