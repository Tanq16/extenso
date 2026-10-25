import '../../lib/messages.js';
import '../../lib/storage.js';
import './module.js';
import { h, icon, setStatus } from '../../ui/dom.js';
import { moduleCard } from '../../ui/modules.js';
import { openOptions } from '../../ui/tabs.js';

const HINTS = {
  auto: 'Themes the site unless it is already dark.',
  dynamic: 'Always rewrites the site\'s colors to dark.',
  filter: 'Inverts colors but not images, for sites that Always breaks.',
  off: 'Leaves the site alone.',
};
const { messages, storage, modules } = globalThis.extenso;

const pageOf = (tab) => {
  const url = URL.parse(tab?.url ?? '');
  return url && ['http:', 'https:'].includes(url.protocol) ? url : null;
};

const detection = (expiresAt) => {
  if (expiresAt > Date.now()) return `Detected as dark. Left alone until ${new Date(expiresAt).toLocaleDateString()}.`;
  if (expiresAt !== undefined) return 'Detected as dark before. Checked again on the next visit before theming.';
  return '';
};

export async function render(container, tab) {
  const page = pageOf(tab);
  const status = h('p', { className: 'status' });
  const modes = h('div', { className: 'tabs', role: 'listbox', 'aria-label': 'Mode for this site' });
  const hint = h('p', { className: 'muted' });
  const summary = h('p', { className: 'muted' });
  const forget = h('button', { type: 'button', className: 'small', hidden: true }, icon('refresh-cw'), 'Check again');
  const detail = h('div', { className: 'row' }, summary, forget);
  const manage = h('button', { type: 'button', onclick: () => openOptions('dark') }, icon('external-link'), 'Manage sites');

  const refresh = async () => {
    if (!page) return;
    const [settings, state] = await Promise.all([storage.getSettings('dark'), storage.getState('dark')]);
    const mode = settings.sites[page.hostname] ?? 'auto';
    const expiresAt = mode === 'auto' ? state.hosts[page.hostname] : undefined;
    for (const button of modes.children) button.setAttribute('aria-selected', String(button.value === mode));
    hint.textContent = HINTS[mode];
    summary.textContent = mode === 'auto' ? detection(expiresAt) : '';
    detail.hidden = !summary.textContent;
    forget.hidden = expiresAt === undefined;
  };

  const act = async (action, payload, message) => {
    try {
      await messages.send('dark', action, { host: page.hostname, ...payload });
      await refresh();
      setStatus(status, message, 'success');
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
  };

  modes.append(...Object.entries(modules.dark.modes).map(([value, label]) => h('button', {
    type: 'button',
    role: 'option',
    value,
    onclick: () => act('setSite', { mode: value }, `${page.hostname} set to ${label}. Reloaded its tabs.`),
  }, label)));
  forget.addEventListener('click', async () => {
    await act('forget', {}, `${page.hostname} is checked again on the next load.`);
    try {
      if (tab?.id !== undefined) await chrome.tabs.reload(tab.id);
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
  });

  container.append(
    await moduleCard('dark'),
    page
      ? h('section', { className: 'card' },
        h('h2', { className: 'truncate' }, page.hostname),
        modes,
        hint,
        detail,
        status)
      : h('p', { className: 'empty' }, 'Open a web page to set its dark mode.'),
    manage,
  );
  await refresh();
}
