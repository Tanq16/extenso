import '../../lib/messages.js';
import './module.js';
import { h, setStatus } from '../../ui/dom.js';
import { moduleCard } from '../../ui/modules.js';
import { openOptions } from '../../ui/tabs.js';

const { messages } = globalThis.extenso;

const when = (at) => (at ? new Date(at).toLocaleString() : '');

const preview = (value) => (value.length > 80 ? `${value.slice(0, 80)}…` : value);

export async function render(container) {
  const status = h('p', { className: 'status' });
  const list = h('ul', { className: 'list' });
  const empty = h('p', { className: 'empty' }, 'Nothing captured yet.');

  const copy = async (button, value) => {
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = 'Copied';
      setTimeout(() => (button.textContent = 'Copy'), 1200);
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
  };

  const draw = async () => {
    const rows = await messages.send('siphon', 'list');
    const captured = rows.filter((row) => row.value != null);
    list.replaceChildren(...captured.map((row) => h('li', {},
      h('div', { className: 'grow stack' },
        h('div', { className: 'row' },
          h('strong', {}, row.name),
          h('span', { className: 'muted' }, when(row.at)),
        ),
        h('span', { className: 'mono muted truncate' }, preview(row.value)),
      ),
      h('button', { type: 'button', className: 'small', onclick: (event) => copy(event.target, row.value) }, 'Copy'),
    )));
    list.hidden = !captured.length;
    empty.hidden = Boolean(captured.length);
  };

  const clearAll = async () => {
    try {
      await messages.send('siphon', 'clear', {});
      await draw();
      setStatus(status, 'Cleared.', 'success');
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
  };

  container.append(
    await moduleCard('siphon'),
    h('section', { className: 'card' },
      h('div', { className: 'row' },
        h('h2', {}, 'Captured'),
        h('div', { className: 'row' },
          h('button', { type: 'button', className: 'small', onclick: () => openOptions('siphon') }, 'Rules'),
          h('button', { type: 'button', className: 'small danger', onclick: clearAll }, 'Clear'),
        ),
      ),
      list,
      empty,
    ),
    status,
  );
  await draw();
}
