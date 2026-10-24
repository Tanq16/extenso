import '../../lib/storage.js';
import '../../lib/match.js';
import '../../lib/messages.js';
import './module.js';
import { h, setStatus } from '../../ui/dom.js';
import { openOptions } from '../../ui/tabs.js';

const { storage, match, messages, modules } = globalThis.extenso;
const { normalize, rulesOf, withEnabled } = modules.declutter;

export async function render(container, tab) {
  let settings = normalize(await storage.getSettings('declutter'));
  const matching = () => rulesOf(settings).filter((rule) => match.matchesAny(rule.matches, tab?.url ?? ''));
  const rules = matching();
  const count = h('p', { className: 'muted', hidden: true });
  const status = h('p', { className: 'status' });

  const refresh = async () => {
    count.hidden = true;
    if (!settings.enabled || !matching().some((rule) => rule.enabled)) return;
    try {
      const { hidden, removed } = await messages.send('declutter', 'apply', { tabId: tab.id });
      count.textContent = `${hidden} hidden and ${removed} removed on this page.`;
      count.hidden = false;
    } catch (error) {
      console.error('[extenso] declutter count failed', error);
    }
  };

  const save = async (next) => {
    try {
      await storage.updateSettings('declutter', next);
      settings = next;
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
    await refresh();
  };

  const toggle = (checked, onchange) => {
    const input = h('input', { type: 'checkbox', className: 'toggle', checked, onchange: () => onchange(input.checked) });
    return input;
  };

  container.append(
    h('section', { className: 'card' },
      h('label', { className: 'row' }, 'Declutter pages', toggle(settings.enabled, (checked) => save({ ...settings, enabled: checked }))),
      rules.length
        ? h('ul', { className: 'list' }, rules.map((rule) => h('li', {},
          h('span', { className: 'grow truncate' }, rule.name),
          toggle(rule.enabled, (checked) => save(withEnabled(settings, rule.id, checked))),
        )))
        : h('p', { className: 'empty' }, 'No rules match this page.'),
      count,
      h('button', { type: 'button', onclick: () => openOptions('declutter') }, 'Manage rules'),
    ),
    status,
  );
  await refresh();
}
