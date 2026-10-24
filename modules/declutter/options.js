import '../../lib/storage.js';
import '../../lib/match.js';
import './module.js';
import { h, setStatus } from '../../ui/dom.js';

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
  const status = h('p', { className: 'status' });
  const sites = h('ul', { className: 'list' });
  const noSites = h('p', { className: 'empty' }, 'No sites turned off. Turn one off from the popup.');
  const builtins = h('div', { className: 'stack' });
  const list = h('ul', { className: 'list' });
  const empty = h('p', { className: 'empty' }, 'No rules yet.');
  const title = h('h2', { className: 'grow' });
  const name = h('input', { type: 'text', required: true, placeholder: 'Amazon sponsored results' });
  const matches = h('textarea', { className: 'code', spellcheck: false, placeholder: 'https://www.amazon.com/s?*' });
  const hide = h('textarea', { className: 'code', spellcheck: false, placeholder: '.AdHolder' });
  const remove = h('textarea', { className: 'code', spellcheck: false });
  let editing = null;

  const persist = async (next, message) => {
    try {
      await storage.updateSettings('declutter', next);
      settings = next;
      setStatus(status, message, 'success');
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
    draw();
  };

  const toggle = (checked, onchange) => {
    const input = h('input', { type: 'checkbox', className: 'toggle', checked, onchange: () => onchange(input.checked) });
    return input;
  };

  const ruleToggle = (rule) => toggle(rule.enabled, (checked) => persist(
    withEnabled(settings, rule.id, checked),
    `${rule.name} ${checked ? 'on' : 'off'}.`,
  ));

  const enabled = toggle(settings.enabled, (checked) => persist(
    { ...settings, enabled: checked },
    checked ? 'Declutter on.' : 'Declutter off.',
  ));

  const open = (rule) => {
    editing = rule?.id ?? null;
    title.textContent = rule ? 'Edit rule' : 'New rule';
    name.value = rule?.name ?? '';
    matches.value = rule?.matches.join('\n') ?? '';
    hide.value = rule?.hide.join('\n') ?? '';
    remove.value = rule?.remove.join('\n') ?? '';
    form.hidden = false;
    name.focus();
  };

  const close = () => {
    editing = null;
    form.hidden = true;
  };

  const save = (event) => {
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
      setStatus(status, problem, 'error');
      return;
    }
    const rules = editing
      ? settings.rules.map((other) => (other.id === editing ? { ...other, ...rule } : other))
      : [...settings.rules, { id: crypto.randomUUID(), enabled: true, ...rule }];
    close();
    persist({ ...settings, rules }, `Saved ${rule.name}.`);
  };

  const form = h('form', { className: 'card', hidden: true, onsubmit: save },
    h('div', { className: 'row' }, title, h('button', { type: 'button', className: 'small', onclick: close }, 'Cancel')),
    h('label', { className: 'field' }, 'Name', name),
    h('label', { className: 'field' }, 'Match patterns, one per line', matches),
    h('label', { className: 'field' }, 'Hide selectors, one per line', hide),
    h('label', { className: 'field' }, 'Remove selectors, one per line, for content that loads later', remove),
    h('button', { type: 'submit', className: 'primary' }, 'Save'),
  );

  const draw = () => {
    enabled.checked = settings.enabled;
    fill(sites, noSites, settings.disabledHosts.toSorted().map((host) => h('li', {},
      h('span', { className: 'grow mono truncate' }, host),
      h('button', {
        type: 'button',
        className: 'small',
        'aria-label': `Turn on Declutter for ${host}`,
        onclick: () => persist(
          { ...settings, disabledHosts: settings.disabledHosts.filter((other) => other !== host) },
          `Declutter on for ${host}.`,
        ),
      }, 'Turn on'),
    )));
    builtins.replaceChildren(...[...Map.groupBy(builtinsOf(settings), (rule) => rule.site)].map(([site, rules]) => h('div', { className: 'stack' },
      h('div', { className: 'row' },
        h('h3', {}, site),
        h('span', { className: 'badge' }, `${rules.filter((rule) => rule.enabled).length} of ${rules.length} on`)),
      h('ul', { className: 'list' }, rules.map((rule) => h('li', {},
        ruleToggle(rule),
        h('span', { className: 'grow' }, rule.name),
      ))),
    )));
    fill(list, empty, settings.rules.map((rule) => h('li', {},
      ruleToggle(rule),
      h('span', {}, rule.name),
      h('span', { className: 'muted mono grow truncate' }, rule.matches.join('  ')),
      h('button', { type: 'button', className: 'small', onclick: () => open(rule) }, 'Edit'),
      h('button', {
        type: 'button',
        className: 'small danger',
        onclick: () => {
          if (editing === rule.id) close();
          persist({ ...settings, rules: settings.rules.filter((other) => other.id !== rule.id) }, `Deleted ${rule.name}.`);
        },
      }, 'Delete'),
    )));
  };

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !Object.hasOwn(changes, storage.settingsKey('declutter'))) return;
    try {
      settings = normalize(await storage.getSettings('declutter'));
      draw();
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
  });

  container.append(
    h('section', { className: 'card' }, h('label', { className: 'row' }, 'Declutter pages', enabled)),
    h('section', { className: 'card' }, h('h2', {}, 'Sites turned off'), sites, noSites),
    h('section', { className: 'card' }, h('h2', {}, 'Built-in rules'), builtins),
    h('section', { className: 'card' },
      h('h2', {}, 'Your rules'),
      list,
      empty,
      h('button', { type: 'button', className: 'primary', onclick: () => open(null) }, 'Add rule'),
    ),
    form,
    status,
  );
  draw();
}
