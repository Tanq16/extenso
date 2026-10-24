import '../../lib/storage.js';
import '../../lib/match.js';
import './module.js';
import { h, icon, setStatus } from '../../ui/dom.js';
import { moduleCard } from '../../ui/modules.js';

const { storage, match, modules } = globalThis.extenso;
const { isSelector, normalize, builtinsOf, withEnabled } = modules.declutter;

const lines = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean);

const fill = (list, empty, items) => {
  list.replaceChildren(...items);
  list.hidden = !items.length;
  empty.hidden = Boolean(items.length);
};

export async function render(container) {
  let settings = normalize(await storage.getSettings('declutter'));
  const rulesStatus = h('p', { className: 'status' });
  const formStatus = h('p', { className: 'status' });
  const sitesStatus = h('p', { className: 'status' });
  const sites = h('ul', { className: 'list' });
  const noSites = h('p', { className: 'empty' }, 'No sites turned off. Turn one off from the popup.');
  const list = h('ul', { className: 'list' });
  const empty = h('p', { className: 'empty' }, 'No rules yet.');
  const title = h('h2', { className: 'grow' });
  const name = h('input', { type: 'text', required: true, placeholder: 'Amazon sponsored results' });
  const matches = h('textarea', { className: 'code', spellcheck: false, placeholder: 'https://www.amazon.com/s?*' });
  const hide = h('textarea', { className: 'code', spellcheck: false, placeholder: '.AdHolder' });
  const remove = h('textarea', { className: 'code', spellcheck: false });
  let editing = null;

  const persist = async (patch, message, status) => {
    try {
      settings = normalize(await storage.updateSettings('declutter', patch));
      setStatus(status, message, 'success');
      return true;
    } catch (error) {
      setStatus(status, error.message, 'error');
      return false;
    } finally {
      draw();
    }
  };

  const toggle = (checked, onchange) => {
    const input = h('input', { type: 'checkbox', className: 'toggle', checked, onchange: () => onchange(input.checked) });
    return input;
  };

  const ruleToggle = (rule, status) => toggle(rule.enabled, (checked) => {
    const { builtins, rules } = withEnabled(settings, rule.id, checked);
    return persist({ builtins, rules }, `${rule.name} ${checked ? 'on' : 'off'}.`, status);
  });

  const groups = [...Map.groupBy(builtinsOf(settings), (rule) => rule.site)].map(([site, rules]) => {
    const status = h('p', { className: 'status' });
    const badge = h('span');
    const inputs = new Map(rules.map((rule) => [rule.id, ruleToggle(rule, status)]));
    return {
      badge,
      inputs,
      element: h('details', { className: 'group' },
        h('summary', {}, icon('chevron-right'), h('h3', { className: 'grow' }, site), badge),
        h('ul', { className: 'list' }, rules.map((rule) => h('li', {}, inputs.get(rule.id), h('span', { className: 'grow' }, rule.name)))),
        status,
      ),
    };
  });

  const open = (rule) => {
    editing = rule?.id ?? null;
    title.textContent = rule ? 'Edit rule' : 'New rule';
    name.value = rule?.name ?? '';
    matches.value = rule?.matches.join('\n') ?? '';
    hide.value = rule?.hide.join('\n') ?? '';
    remove.value = rule?.remove.join('\n') ?? '';
    setStatus(formStatus, '');
    form.hidden = false;
    name.focus();
  };

  const close = () => {
    editing = null;
    form.hidden = true;
  };

  const save = async (event) => {
    event.preventDefault();
    const rule = {
      name: name.value.trim(),
      matches: lines(matches.value),
      hide: lines(hide.value),
      remove: lines(remove.value),
    };
    const badPatterns = rule.matches.filter((pattern) => !match.isValid(pattern));
    const badSelectors = [...rule.hide, ...rule.remove].filter((selector) => !isSelector(selector));
    const problem = (!rule.matches.length && 'Add at least one match pattern.')
      || (badPatterns.length && `Invalid match patterns: ${badPatterns.join(', ')}`)
      || (!rule.hide.length && !rule.remove.length && 'Add at least one selector to hide or remove.')
      || (badSelectors.length && `Invalid selectors: ${badSelectors.join(', ')}`);
    if (problem) {
      setStatus(formStatus, problem, 'error');
      return;
    }
    const rules = editing
      ? settings.rules.map((other) => (other.id === editing ? { ...other, ...rule } : other))
      : [...settings.rules, { id: crypto.randomUUID(), enabled: true, ...rule }];
    if (await persist({ rules }, `Saved ${rule.name}.`, rulesStatus)) close();
  };

  const form = h('form', { className: 'card', hidden: true, onsubmit: save },
    h('div', { className: 'row' },
      title,
      h('button', { type: 'button', className: 'small', onclick: close }, icon('x'), 'Cancel'),
      h('button', { type: 'submit', className: 'small primary' }, icon('check'), 'Save'),
    ),
    h('label', { className: 'field' }, 'Name', name),
    h('label', { className: 'field' }, 'Match patterns, one per line', matches),
    h('label', { className: 'field' }, 'Hide selectors, one per line', hide),
    h('label', { className: 'field' }, 'Remove selectors, one per line, for content that loads later', remove),
    formStatus,
  );

  const draw = () => {
    fill(list, empty, settings.rules.map((rule) => h('li', {},
      ruleToggle(rule, rulesStatus),
      h('span', {}, rule.name),
      h('span', { className: 'muted mono grow truncate' }, rule.matches.join('  ')),
      h('button', { type: 'button', className: 'small', onclick: () => open(rule) }, icon('pencil'), 'Edit'),
      h('button', {
        type: 'button',
        className: 'small danger',
        onclick: () => {
          if (editing === rule.id) close();
          persist({ rules: settings.rules.filter((other) => other.id !== rule.id) }, `Deleted ${rule.name}.`, rulesStatus);
        },
      }, icon('trash-2'), 'Delete'),
    )));
    const enabled = new Map(builtinsOf(settings).map((rule) => [rule.id, rule.enabled]));
    for (const { badge, inputs } of groups) {
      for (const [id, input] of inputs) input.checked = enabled.get(id);
      const on = [...inputs.keys()].filter((id) => enabled.get(id)).length;
      badge.className = on ? 'badge info' : 'badge';
      badge.textContent = `${on} of ${inputs.size} on`;
    }
    fill(sites, noSites, settings.disabledHosts.toSorted().map((host) => h('li', {},
      h('span', { className: 'grow mono truncate' }, host),
      h('button', {
        type: 'button',
        className: 'small',
        'aria-label': `Turn on Declutter for ${host}`,
        onclick: () => persist(
          { disabledHosts: settings.disabledHosts.filter((other) => other !== host) },
          `Declutter on for ${host}.`,
          sitesStatus,
        ),
      }, icon('power'), 'Turn on'),
    )));
  };

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !Object.hasOwn(changes, storage.settingsKey('declutter'))) return;
    try {
      settings = normalize(await storage.getSettings('declutter'));
      draw();
    } catch (error) {
      setStatus(rulesStatus, error.message, 'error');
    }
  });

  container.append(
    await moduleCard('declutter'),
    h('section', { className: 'card' },
      h('div', { className: 'row' },
        h('h2', { className: 'grow' }, 'Your rules'),
        h('button', { type: 'button', className: 'small primary', onclick: () => open(null) }, icon('plus'), 'Add rule'),
      ),
      list,
      empty,
      rulesStatus,
    ),
    form,
    h('section', { className: 'card' }, h('h2', {}, 'Built-in rules'), h('div', { className: 'list' }, groups.map(({ element }) => element))),
    h('section', { className: 'card' }, h('h2', {}, 'Sites turned off'), sites, noSites, sitesStatus),
  );
  draw();
}
