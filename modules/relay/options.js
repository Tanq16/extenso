import '../../lib/storage.js';
import '../../lib/messages.js';
import './module.js';
import { h, setStatus } from '../../ui/dom.js';
import { moduleCard } from '../../ui/modules.js';

const { storage, messages, modules } = globalThis.extenso;
const { payloads } = modules.relay;
const METHODS = ['POST', 'PUT', 'PATCH'];

const parseHeaders = (text) => {
  const headers = {};
  for (const line of text.split('\n').map((entry) => entry.trim()).filter(Boolean)) {
    const split = line.indexOf(':');
    const key = line.slice(0, split).trim();
    if (split < 1 || !key) throw new Error(`Headers need the form "Name: value": ${line}`);
    headers[key] = line.slice(split + 1).trim();
  }
  return headers;
};

const options = (values, labels = {}) => values.map((value) => h('option', { value }, labels[value] ?? value));

export async function render(container) {
  const settings = await storage.getSettings('relay');
  const status = h('p', { className: 'status' });
  const list = h('ul', { className: 'list' });
  const empty = h('p', { className: 'empty' }, 'No targets yet.');
  const title = h('h2', { className: 'grow' });
  const name = h('input', { type: 'text', required: true, placeholder: 'Local summarizer' });
  const url = h('input', { type: 'text', required: true, spellcheck: false, placeholder: 'http://127.0.0.1:8080/ingest' });
  const method = h('select', {}, options(METHODS));
  const payload = h('select', {}, options(Object.keys(payloads), payloads));
  const headers = h('textarea', { className: 'code', spellcheck: false, placeholder: 'Authorization: Bearer token' });
  let editing = null;

  const persist = async (message) => {
    try {
      await storage.updateSettings('relay', { targets: settings.targets });
      setStatus(status, message, 'success');
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
    draw();
  };

  const test = async (target, button) => {
    button.disabled = true;
    setStatus(status, `Testing ${target.name || target.url}...`, 'info');
    try {
      const code = await messages.send('relay', 'test', { target });
      setStatus(status, `${target.url} answered ${code}.`, 'success');
    } catch (error) {
      setStatus(status, error.message, 'error');
    } finally {
      button.disabled = false;
    }
  };

  const toggle = (checked, onchange) => {
    const input = h('input', { type: 'checkbox', className: 'toggle', checked, onchange: () => onchange(input.checked) });
    return input;
  };

  const open = (target) => {
    editing = target;
    title.textContent = target ? 'Edit target' : 'New target';
    name.value = target?.name ?? '';
    url.value = target?.url ?? '';
    method.value = target?.method ?? 'POST';
    payload.value = target?.payload ?? 'page';
    headers.value = Object.entries(target?.headers ?? {}).map(([key, value]) => `${key}: ${value}`).join('\n');
    form.hidden = false;
    name.focus();
  };

  const close = () => {
    editing = null;
    form.hidden = true;
  };

  const read = () => {
    const target = {
      name: name.value.trim(),
      url: url.value.trim(),
      method: method.value,
      payload: payload.value,
      headers: parseHeaders(headers.value),
    };
    if (!['http:', 'https:'].includes(URL.parse(target.url)?.protocol)) throw new Error('The URL must start with http:// or https://.');
    return target;
  };

  const save = (event) => {
    event.preventDefault();
    let target;
    try {
      target = read();
    } catch (error) {
      setStatus(status, error.message, 'error');
      return;
    }
    if (editing) Object.assign(editing, target);
    else settings.targets.push({ id: crypto.randomUUID(), enabled: true, ...target });
    close();
    persist(`Saved ${target.name}.`);
  };

  const testButton = h('button', {
    type: 'button',
    onclick: () => {
      try {
        test(read(), testButton);
      } catch (error) {
        setStatus(status, error.message, 'error');
      }
    },
  }, 'Test');

  const form = h('form', { className: 'card', hidden: true, onsubmit: save },
    h('div', { className: 'row' }, title, h('button', { type: 'button', className: 'small', onclick: close }, 'Cancel')),
    h('label', { className: 'field' }, 'Name', name),
    h('label', { className: 'field' }, 'URL', url),
    h('label', { className: 'field' }, 'Method', method),
    h('label', { className: 'field' }, 'Sends', payload),
    h('label', { className: 'field' }, 'Headers, one "Name: value" per line', headers),
    h('div', { className: 'row' }, h('button', { type: 'submit', className: 'primary' }, 'Save'), testButton),
  );

  const draw = () => {
    list.replaceChildren(...settings.targets.map((target) => {
      const button = h('button', { type: 'button', className: 'small', onclick: () => test(target, button) }, 'Test');
      return h('li', {},
        toggle(target.enabled, (checked) => {
          target.enabled = checked;
          persist(`${target.name} ${checked ? 'on' : 'off'}.`);
        }),
        h('span', {}, target.name),
        h('span', { className: 'muted mono grow truncate' }, `${target.method} ${target.url}`),
        h('span', { className: 'badge' }, payloads[target.payload]),
        button,
        h('button', { type: 'button', className: 'small', onclick: () => open(target) }, 'Edit'),
        h('button', {
          type: 'button',
          className: 'small danger',
          onclick: () => {
            settings.targets = settings.targets.filter((other) => other !== target);
            if (editing === target) close();
            persist(`Deleted ${target.name}.`);
          },
        }, 'Delete'),
      );
    }));
    list.hidden = !settings.targets.length;
    empty.hidden = !!settings.targets.length;
  };

  container.append(
    await moduleCard('relay'),
    h('section', { className: 'card' },
      list,
      empty,
      h('button', { type: 'button', className: 'primary', onclick: () => open(null) }, 'Add target'),
    ),
    form,
    status,
  );
  draw();
}
