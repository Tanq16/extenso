import '../../lib/storage.js';
import '../../lib/match.js';
import '../../lib/messages.js';
import './module.js';
import { h, setStatus } from '../../ui/dom.js';
import { moduleCard } from '../../ui/modules.js';
import { openOptions } from '../../ui/tabs.js';

const { storage, match, messages, modules } = globalThis.extenso;
const { normalize, rulesOf, withEnabled } = modules.declutter;

const hostOf = (tab) => {
  const url = URL.parse(tab?.url ?? '');
  return url && ['http:', 'https:'].includes(url.protocol) ? url.hostname : null;
};

export async function render(container, tab) {
  const host = hostOf(tab);
  let settings = normalize(await storage.getSettings('declutter'));
  const matching = () => rulesOf(settings).filter((rule) => match.matchesAny(rule.matches, tab?.url ?? ''));
  const rules = matching();
  const count = h('p', { className: 'muted', hidden: true });
  const status = h('p', { className: 'status' });

  const refresh = async () => {
    count.hidden = true;
    if (!settings.enabled || settings.disabledHosts.includes(host) || !matching().some((rule) => rule.enabled)) return;
    try {
      const { hidden, removed } = await messages.send('declutter', 'apply', { tabId: tab.id });
      count.textContent = `${hidden} hidden and ${removed} removed on this page.`;
      count.hidden = false;
    } catch (error) {
      console.error('[extenso] declutter count failed', error);
    }
  };

  const save = async (patch) => {
    try {
      settings = normalize(await storage.updateSettings('declutter', patch));
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
  };

  const toggle = (checked, onchange) => {
    const input = h('input', { type: 'checkbox', className: 'toggle', checked, onchange: () => onchange(input.checked) });
    return input;
  };

  const setSite = (checked) => {
    const others = settings.disabledHosts.filter((other) => other !== host);
    return save({ disabledHosts: checked ? others : [...others, host] });
  };

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !Object.hasOwn(changes, storage.settingsKey('declutter'))) return;
    settings = normalize(await storage.getSettings('declutter'));
    await refresh();
  });

  container.append(
    await moduleCard('declutter'),
    h('section', { className: 'card' },
      host && h('h2', { className: 'truncate' }, host),
      host && h('label', { className: 'row' }, 'Declutter this site', toggle(!settings.disabledHosts.includes(host), setSite)),
      rules.length
        ? h('ul', { className: 'list' }, rules.map((rule) => h('li', {},
          h('span', { className: 'grow truncate' }, rule.name),
          toggle(rule.enabled, (checked) => {
            const { builtins, rules: custom } = withEnabled(settings, rule.id, checked);
            return save({ builtins, rules: custom });
          }),
        )))
        : h('p', { className: 'empty' }, 'No rules match this page.'),
      count,
      status,
    ),
    h('button', { type: 'button', onclick: () => openOptions('declutter') }, 'Manage rules'),
  );
  await refresh();
}
