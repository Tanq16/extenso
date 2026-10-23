import '../../lib/storage.js';
import '../../lib/match.js';
import './module.js';
import { h, setStatus } from '../../ui/dom.js';

const { storage, match, modules } = globalThis.extenso;
const { isSelector } = modules.declutter;

const lines = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean);

export async function render(container) {
  const settings = await storage.getSettings('declutter');
  const status = h('p', { className: 'status' });
  const list = h('ul', { className: 'list' });
  const empty = h('p', { className: 'empty' }, 'No rules yet.');
  const title = h('h2', { className: 'grow' });
  const name = h('input', { type: 'text', required: true, placeholder: 'Amazon sponsored results' });
  const matches = h('textarea', { className: 'code', spellcheck: false, placeholder: 'https://www.amazon.com/s?*' });
  const hide = h('textarea', { className: 'code', spellcheck: false, placeholder: '.AdHolder' });
  const remove = h('textarea', { className: 'code', spellcheck: false });
  let editing = null;

  const persist = async (message) => {
    try {
      await storage.updateSettings('declutter', { enabled: settings.enabled, rules: settings.rules });
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

  const open = (rule) => {
    editing = rule;
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
    if (editing) Object.assign(editing, rule);
    else settings.rules.push({ id: crypto.randomUUID(), enabled: true, ...rule });
    close();
    persist(`Saved ${rule.name}.`);
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
    list.replaceChildren(...settings.rules.map((rule) => h('li', {},
      toggle(rule.enabled, (checked) => {
        rule.enabled = checked;
        persist(`${rule.name} ${checked ? 'on' : 'off'}.`);
      }),
      h('span', {}, rule.name),
      h('span', { className: 'muted mono grow truncate' }, rule.matches.join('  ')),
      h('button', { type: 'button', className: 'small', onclick: () => open(rule) }, 'Edit'),
      h('button', {
        type: 'button',
        className: 'small danger',
        onclick: () => {
          settings.rules = settings.rules.filter((other) => other !== rule);
          if (editing === rule) close();
          persist(`Deleted ${rule.name}.`);
        },
      }, 'Delete'),
    )));
    list.hidden = !settings.rules.length;
    empty.hidden = !!settings.rules.length;
  };

  container.append(
    h('section', { className: 'card' },
      h('label', { className: 'row' }, 'Declutter pages', toggle(settings.enabled, (checked) => {
        settings.enabled = checked;
        persist(checked ? 'Declutter on.' : 'Declutter off.');
      })),
      list,
      empty,
      h('button', { type: 'button', className: 'primary', onclick: () => open(null) }, 'Add rule'),
    ),
    form,
    status,
  );
  draw();
}
