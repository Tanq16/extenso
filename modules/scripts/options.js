import '../../lib/match.js';
import '../../lib/storage.js';
import './module.js';
import { h, icon, setStatus } from '../../ui/dom.js';
import { moduleCard } from '../../ui/modules.js';
import { availabilityNotice, runButton } from './ui.js';

const { match, storage } = globalThis.extenso;
const BOOKMARKLET = /^\s*javascript:/i;
const WEB_PAGE = /^(https?|file):/;

const blank = () => ({
  id: crypto.randomUUID(),
  name: '',
  enabled: true,
  code: '',
  trigger: 'manual',
  matches: ['<all_urls>'],
  world: 'USER_SCRIPT',
  runAt: 'document_idle',
});

const decode = (code) => {
  if (!BOOKMARKLET.test(code)) return code;
  const body = code.replace(BOOKMARKLET, '');
  try {
    return decodeURIComponent(body);
  } catch {
    return body;
  }
};

const select = (choices) => h('select', {}, choices.map(([value, label]) => h('option', { value }, label)));

const lastWebTab = async () => {
  const tabs = await chrome.tabs.query({ windowType: 'normal' });
  return tabs
    .filter((tab) => WEB_PAGE.test(tab.url ?? ''))
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
};

const mutate = async (change) => {
  const { items } = await storage.getSettings('scripts');
  await storage.updateSettings('scripts', { items: change(items) });
};

const replace = (items, script) => items.some((item) => item.id === script.id)
  ? items.map((item) => (item.id === script.id ? script : item))
  : [...items, script];

export async function render(container) {
  const status = h('p', { className: 'status' });
  const formStatus = h('p', { className: 'status' });
  const list = h('ul', { className: 'list' });
  const empty = h('p', { className: 'empty' }, 'No scripts yet.');
  const listCard = h('section', { className: 'card' },
    h('div', { className: 'row' },
      h('h2', { className: 'grow' }, 'Your scripts'),
      h('button', { type: 'button', className: 'small primary', onclick: () => open(blank(), 'New script') }, icon('plus'), 'New script'),
    ),
    list,
    empty,
    status,
  );
  let editing = null;

  const attempt = async (action, success) => {
    try {
      await action();
      if (success) setStatus(status, success, 'success');
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
  };

  const name = h('input', { type: 'text', placeholder: 'Untitled script', spellcheck: false });
  const code = h('textarea', {
    className: 'code',
    rows: 22,
    spellcheck: false,
    placeholder: 'Code, or a pasted javascript: bookmarklet URL',
    onchange: () => { code.value = decode(code.value); },
  });
  const trigger = select([['manual', 'Manual'], ['auto', 'Automatic']]);
  const world = select([['USER_SCRIPT', 'User script (isolated)'], ['MAIN', 'Main (page)']]);
  const runAt = select([['document_idle', 'Document idle'], ['document_end', 'Document end'], ['document_start', 'Document start']]);
  const matches = h('textarea', { className: 'code', rows: 3, spellcheck: false, placeholder: 'https://github.com/settings/*' });
  const title = h('h2', { className: 'grow' });
  trigger.addEventListener('change', () => { runAt.disabled = trigger.value !== 'auto'; });

  const refresh = async () => {
    const [settings, { errors }] = await Promise.all([storage.getSettings('scripts'), storage.getState('scripts')]);
    list.replaceChildren(...settings.items.map((script) => row(script, errors[script.id])));
    listCard.hidden = Boolean(editing);
    list.hidden = !settings.items.length;
    empty.hidden = settings.items.length > 0;
  };

  const open = (script, heading) => {
    editing = script;
    setStatus(status, '');
    setStatus(formStatus, '');
    title.textContent = heading;
    name.value = script.name;
    code.value = script.code;
    trigger.value = script.trigger;
    world.value = script.world;
    runAt.value = script.runAt;
    runAt.disabled = script.trigger !== 'auto';
    matches.value = script.matches.join('\n');
    form.hidden = false;
    listCard.hidden = true;
    name.focus();
  };

  const close = () => {
    editing = null;
    form.hidden = true;
    return refresh();
  };

  const submit = async (event) => {
    event.preventDefault();
    code.value = decode(code.value);
    const patterns = matches.value.split('\n').map((line) => line.trim()).filter(Boolean);
    const invalid = patterns.filter((pattern) => !match.isValid(pattern));
    if (!code.value.trim()) return setStatus(formStatus, 'Add the script\'s code.', 'error');
    if (!patterns.length) return setStatus(formStatus, 'Add at least one match pattern.', 'error');
    if (invalid.length) return setStatus(formStatus, `Invalid match pattern: ${invalid.join(', ')}`, 'error');
    const script = {
      ...editing,
      name: name.value.trim() || 'Untitled script',
      code: code.value,
      trigger: trigger.value,
      world: world.value,
      runAt: runAt.value,
      matches: patterns,
    };
    try {
      await mutate((items) => replace(items, script));
      await close();
      setStatus(status, `Saved ${script.name}.`, 'success');
    } catch (error) {
      setStatus(formStatus, error.message, 'error');
    }
  };

  const form = h('form', { className: 'card', hidden: true, onsubmit: submit },
    h('div', { className: 'row' },
      title,
      h('button', { type: 'button', className: 'small', onclick: close }, icon('x'), 'Cancel'),
      h('button', { type: 'submit', className: 'small primary' }, icon('check'), 'Save'),
    ),
    h('label', { className: 'field' }, 'Name', name),
    h('label', { className: 'field' }, 'Code', code),
    h('div', { className: 'row' },
      h('label', { className: 'field grow' }, 'Trigger', trigger),
      h('label', { className: 'field grow' }, 'World', world),
      h('label', { className: 'field grow' }, 'Run at (automatic only)', runAt),
    ),
    h('label', { className: 'field' }, 'Match patterns, one per line', matches),
    formStatus,
  );

  const row = (script, error) => {
    const toggle = h('input', {
      type: 'checkbox',
      className: 'toggle',
      checked: script.enabled,
      title: script.enabled ? 'Enabled' : 'Disabled',
      onchange: () => attempt(() => mutate((items) => replace(items, { ...script, enabled: toggle.checked }))),
    });
    const remove = h('button', {
      type: 'button',
      className: 'small danger',
      onclick: () => {
        if (remove.dataset.armed) return attempt(() => mutate((items) => items.filter((item) => item.id !== script.id)), `Deleted ${script.name}.`);
        remove.dataset.armed = 'true';
        remove.replaceChildren(icon('trash-2'), 'Confirm');
      },
      onblur: () => {
        delete remove.dataset.armed;
        remove.replaceChildren(icon('trash-2'), 'Delete');
      },
    }, icon('trash-2'), 'Delete');
    const duplicate = () => attempt(() => mutate((items) => items.toSpliced(
      items.findIndex((item) => item.id === script.id) + 1,
      0,
      { ...script, id: crypto.randomUUID(), name: `${script.name} copy` },
    )), `Duplicated ${script.name}.`);

    return h('li', {},
      toggle,
      h('div', { className: 'grow' },
        h('h3', { className: 'truncate' }, script.name),
        h('p', { className: 'muted mono truncate' }, script.matches.join('  ')),
      ),
      error && h('span', { className: 'badge error', title: error }, 'Not registered'),
      script.world === 'MAIN' && h('span', { className: 'badge' }, 'Main world'),
      h('span', { className: `badge ${script.trigger === 'auto' ? 'info' : ''}` }, script.trigger === 'auto' ? 'Automatic' : 'Manual'),
      runButton(script, status, lastWebTab),
      h('button', { type: 'button', className: 'small', onclick: () => open(script, 'Edit script') }, icon('pencil'), 'Edit'),
      h('button', { type: 'button', className: 'small', onclick: duplicate }, icon('copy-plus'), 'Duplicate'),
      remove,
    );
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (Object.hasOwn(changes, storage.settingsKey('scripts')) || Object.hasOwn(changes, storage.stateKey('scripts'))) refresh();
  });

  container.append(...[
    await moduleCard('scripts'),
    await availabilityNotice(),
    listCard,
    form,
  ].filter(Boolean));
  await refresh();
}
