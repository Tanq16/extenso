import '../../lib/messages.js';
import '../../lib/storage.js';
import './module.js';
import './content/sites.js';
import { h, setStatus } from '../../ui/dom.js';
import { openOptions } from '../../ui/tabs.js';

const MODES = [['auto', 'Auto'], ['dynamic', 'Dynamic'], ['filter', 'Filter'], ['off', 'Off']];
const { messages, storage, dark } = globalThis.extenso;

const pageOf = (tab) => {
  const url = URL.parse(tab?.url ?? '');
  return url && ['http:', 'https:'].includes(url.protocol) ? url : null;
};

const describe = async (page, mode, expiresAt) => {
  if (mode === 'dynamic') return 'Always themed with the dynamic engine.';
  if (mode === 'filter') return 'Always themed by inverting the page.';
  if (mode === 'off') return 'Never themed.';
  if (expiresAt > Date.now()) return `Detected as dark. Left alone until ${new Date(expiresAt).toLocaleDateString()}.`;
  if (expiresAt !== undefined) return 'Detected as dark before. Checked again on the next visit before theming.';
  if (await dark.sites.isDarkSite(page.href)) return 'Known dark site. Left alone.';
  return 'Themed unless the page turns out to be dark.';
};

export async function render(container, tab) {
  const page = pageOf(tab);
  const status = h('p', { className: 'status' });
  const toggle = h('input', {
    type: 'checkbox',
    className: 'toggle',
    onchange: async () => {
      try {
        await storage.updateSettings('dark', { enabled: toggle.checked });
        setStatus(status, toggle.checked ? 'Dark mode on for new page loads.' : 'Dark mode off.', 'success');
      } catch (error) {
        setStatus(status, error.message, 'error');
      }
    },
  });
  const modes = h('div', { className: 'tabs', role: 'listbox', 'aria-label': 'Mode for this site' });
  const summary = h('p', { className: 'muted' });
  const forget = h('button', { type: 'button', className: 'small', hidden: true }, 'Check again');
  const manage = h('button', { type: 'button', onclick: () => openOptions('dark') }, 'Manage sites');

  const refresh = async () => {
    const [settings, state] = await Promise.all([storage.getSettings('dark'), storage.getState('dark')]);
    toggle.checked = settings.enabled;
    if (!page) return;
    const mode = settings.sites[page.hostname] ?? 'auto';
    const expiresAt = mode === 'auto' ? state.hosts[page.hostname] : undefined;
    for (const button of modes.children) button.setAttribute('aria-selected', String(button.value === mode));
    summary.textContent = await describe(page, mode, expiresAt);
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

  modes.append(...MODES.map(([value, label]) => h('button', {
    type: 'button',
    role: 'option',
    value,
    onclick: () => act('setSite', { mode: value }, `${label} for ${page.hostname}. Reloaded its tabs.`),
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
    h('section', { className: 'card' }, h('label', { className: 'row' }, 'Dark mode', toggle)),
    page
      ? h('section', { className: 'card' },
        h('h2', { className: 'truncate' }, page.hostname),
        modes,
        h('div', { className: 'row' }, summary, forget))
      : h('p', { className: 'empty' }, 'Open a web page to set its dark mode.'),
    status,
    manage,
  );
  await refresh();
}
