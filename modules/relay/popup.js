import '../../lib/storage.js';
import '../../lib/messages.js';
import './module.js';
import { h, setStatus } from '../../ui/dom.js';
import { moduleCard } from '../../ui/modules.js';
import { openOptions } from '../../ui/tabs.js';

const { storage, messages, modules } = globalThis.extenso;
const { payloads } = modules.relay;

export async function render(container, tab) {
  const settings = await storage.getSettings('relay');
  const targets = settings.targets.filter((target) => target.enabled);
  const status = h('p', { className: 'status' });

  const send = async (target, button) => {
    button.disabled = true;
    setStatus(status, `Sending to ${target.name}...`, 'info');
    try {
      const { status: code } = await messages.send('relay', 'send', { targetId: target.id, tabId: tab?.id, url: tab?.url });
      setStatus(status, `Sent to ${target.name}. The server answered ${code}.`, 'success');
    } catch (error) {
      setStatus(status, error.message, 'error');
    } finally {
      button.disabled = false;
    }
  };

  container.append(
    await moduleCard('relay'),
    h('section', { className: 'card' },
      targets.length
        ? h('ul', { className: 'list' }, targets.map((target) => {
          const button = h('button', { type: 'button', className: 'small primary', onclick: () => send(target, button) }, 'Send');
          return h('li', {},
            h('span', { className: 'grow truncate' }, target.name),
            h('span', { className: 'badge' }, payloads[target.payload]),
            button,
          );
        }))
        : h('p', { className: 'empty' }, 'No targets enabled.'),
      h('button', { type: 'button', onclick: () => openOptions('relay') }, 'Manage targets'),
    ),
    status,
  );
}
