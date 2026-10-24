import '../../lib/storage.js';
import '../../lib/match.js';
import './module.js';
import { h, setStatus } from '../../ui/dom.js';
import { moduleCard } from '../../ui/modules.js';

const { storage, match } = globalThis.extenso;

const SOURCES = [
  { value: 'query', label: 'Query param', key: 'Query parameter', hint: 'token' },
  { value: 'request.header', label: 'Request header', key: 'Header name', hint: 'authorization' },
  { value: 'request.body', label: 'Request body', key: 'Form field or JSON key', hint: 'SAMLResponse' },
  { value: 'response.header', label: 'Response header', key: 'Header name', hint: 'x-session' },
  { value: 'response.body', label: 'Response body', key: 'JSON key (optional)', hint: 'access_token' },
  { value: 'cookie', label: 'Cookie', key: 'Cookie name', hint: 'sid' },
  { value: 'localStorage', label: 'localStorage', key: 'Storage key', hint: 'auth_token' },
  { value: 'sessionStorage', label: 'sessionStorage', key: 'Storage key', hint: 'auth_token' },
];

const meta = (source) => SOURCES.find((entry) => entry.value === source) ?? SOURCES[0];

const option = (value, label, selected) => h('option', { value, selected: value === selected }, label);

const blank = () => ({
  name: '',
  scope: { pattern: '', urlRegex: '' },
  source: 'query',
  key: '',
  extract: { mode: 'whole', regex: '', path: '' },
  keep: { mode: 'latest', n: 5 },
  on: { notify: false, copy: false },
});

function editor(rule, { onSave, onCancel }) {
  const status = h('p', { className: 'status' });
  const name = h('input', { type: 'text', value: rule.name, placeholder: 'AWS SAML' });
  const pattern = h('input', { type: 'text', value: rule.scope.pattern, placeholder: '*://*.okta.com/*', spellcheck: false });
  const urlRegex = h('input', { type: 'text', value: rule.scope.urlRegex ?? '', placeholder: 'Optional URL regex, e.g. /login', spellcheck: false });
  const source = h('select', {}, ...SOURCES.map((entry) => option(entry.value, entry.label, rule.source)));
  const keyLabel = h('span', {}, meta(rule.source).key);
  const key = h('input', { type: 'text', value: rule.key ?? '', placeholder: meta(rule.source).hint, spellcheck: false });
  const extractMode = h('select', {},
    option('whole', 'Whole value', rule.extract.mode),
    option('regex', 'Regex (group 1 or ?<value>)', rule.extract.mode),
    option('json', 'JSON path', rule.extract.mode),
  );
  const regex = h('input', { type: 'text', value: rule.extract.regex ?? '', placeholder: 'SAMLResponse=([^&]+)', spellcheck: false });
  const path = h('input', { type: 'text', value: rule.extract.path ?? '', placeholder: 'data.access_token', spellcheck: false });
  const regexField = h('label', { className: 'field' }, 'Regex', regex);
  const pathField = h('label', { className: 'field' }, 'JSON path', path);
  const keepMode = h('select', {},
    option('latest', 'Keep latest', rule.keep.mode),
    option('lastN', 'Keep last N', rule.keep.mode),
  );
  const keepN = h('input', { type: 'number', min: '1', value: String(rule.keep.n ?? 5) });
  const keepNField = h('label', { className: 'field' }, 'How many', keepN);
  const notify = h('input', { type: 'checkbox', checked: Boolean(rule.on.notify) });
  const copy = h('input', { type: 'checkbox', checked: Boolean(rule.on.copy) });

  const refresh = () => {
    keyLabel.textContent = meta(source.value).key;
    key.placeholder = meta(source.value).hint;
    regexField.hidden = extractMode.value !== 'regex';
    pathField.hidden = extractMode.value !== 'json';
    keepNField.hidden = keepMode.value !== 'lastN';
  };
  source.addEventListener('change', refresh);
  extractMode.addEventListener('change', refresh);
  keepMode.addEventListener('change', refresh);
  refresh();

  const save = (event) => {
    event.preventDefault();
    if (!name.value.trim()) return setStatus(status, 'Name is required.', 'error');
    if (!match.isValid(pattern.value.trim())) return setStatus(status, 'Scope must be a valid match pattern.', 'error');
    if (urlRegex.value.trim()) {
      try {
        new RegExp(urlRegex.value.trim());
      } catch (error) {
        return setStatus(status, `URL regex: ${error.message}`, 'error');
      }
    }
    onSave({
      ...rule,
      name: name.value.trim(),
      scope: { pattern: pattern.value.trim(), urlRegex: urlRegex.value.trim() },
      source: source.value,
      key: key.value.trim(),
      extract: { mode: extractMode.value, regex: regex.value, path: path.value },
      keep: { mode: keepMode.value, n: Math.max(1, Number(keepN.value) || 1) },
      on: { notify: notify.checked, copy: copy.checked },
    });
  };

  return h('form', { className: 'card', onsubmit: save },
    h('div', { className: 'row' },
      h('h2', { className: 'grow' }, rule.id ? 'Edit rule' : 'New rule'),
      h('button', { type: 'button', className: 'small', onclick: onCancel }, 'Cancel'),
      h('button', { type: 'submit', className: 'small primary' }, 'Save'),
    ),
    h('label', { className: 'field' }, 'Name', name),
    h('label', { className: 'field' }, 'Scope match pattern', pattern),
    h('label', { className: 'field' }, 'URL regex', urlRegex),
    h('label', { className: 'field' }, 'Source', source),
    h('label', { className: 'field' }, keyLabel, key),
    h('label', { className: 'field' }, 'Extract', extractMode),
    regexField,
    pathField,
    h('label', { className: 'field' }, 'Keep', keepMode),
    keepNField,
    h('label', { className: 'row' }, 'Notify on capture', notify),
    h('label', { className: 'row' }, 'Copy to clipboard on capture', copy),
    status,
  );
}

export async function render(container) {
  const status = h('p', { className: 'status' });
  const list = h('ul', { className: 'list' });
  const empty = h('p', { className: 'empty' }, 'No rules yet.');
  const slot = h('div', { className: 'stack' });

  const settings = await storage.getSettings('siphon');
  let rules = settings.rules;

  const persist = async (next, message) => {
    try {
      await storage.updateSettings('siphon', { rules: next });
      rules = next;
      if (message) setStatus(status, message, 'success');
      return true;
    } catch (error) {
      setStatus(status, error.message, 'error');
      return false;
    } finally {
      draw();
    }
  };

  const openEditor = (rule) => {
    slot.replaceChildren(
      editor(rule, {
        onCancel: () => slot.replaceChildren(),
        onSave: async (saved) => {
          const next = saved.id
            ? rules.map((item) => (item.id === saved.id ? saved : item))
            : [...rules, { ...saved, id: crypto.randomUUID(), enabled: true }];
          if (await persist(next, `Saved ${saved.name}.`)) slot.replaceChildren();
        },
      }),
    );
  };

  const draw = () => {
    list.replaceChildren(...rules.map((rule) => {
      const enable = h('input', {
        type: 'checkbox',
        className: 'toggle',
        checked: rule.enabled !== false,
        onchange: () => persist(rules.map((item) => (item.id === rule.id ? { ...item, enabled: enable.checked } : item))),
      });
      return h('li', {},
        enable,
        h('div', { className: 'grow stack' },
          h('div', { className: 'row' }, h('strong', {}, rule.name), h('span', { className: 'badge info' }, meta(rule.source).label)),
          h('span', { className: 'mono muted truncate' }, rule.scope.pattern),
        ),
        h('button', { type: 'button', className: 'small', onclick: () => openEditor(rule) }, 'Edit'),
        h('button', {
          type: 'button',
          className: 'small danger',
          onclick: () => persist(rules.filter((item) => item.id !== rule.id), `Deleted ${rule.name}.`),
        }, 'Delete'),
      );
    }));
    list.hidden = !rules.length;
    empty.hidden = Boolean(rules.length);
  };

  container.append(
    await moduleCard('siphon'),
    h('section', { className: 'card' },
      h('div', { className: 'row' },
        h('h2', { className: 'grow' }, 'Rules'),
        h('button', { type: 'button', className: 'small primary', onclick: () => openEditor(blank()) }, 'Add rule'),
      ),
      list,
      empty,
      status,
    ),
    slot,
  );
  draw();
}
