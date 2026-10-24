import '../../lib/messages.js';
import '../../lib/storage.js';
import './module.js';
import { h, icon, setStatus } from '../../ui/dom.js';

const { messages, storage } = globalThis.extenso;

const openDetails = () => chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });

export async function availabilityNotice() {
  const { available } = await messages.send('scripts', 'status');
  if (available) {
    const { synced } = await storage.getState('scripts');
    if (!synced) messages.send('core', 'sync').catch((error) => console.error('[extenso] scripts resync failed', error));
    return null;
  }
  return h('p', { className: 'status warning row' },
    h('span', { className: 'grow' }, 'Turn on "Allow User Scripts" on the extension\'s details page to run scripts.'),
    h('button', { type: 'button', className: 'small', onclick: openDetails }, icon('external-link'), 'Open details'),
  );
}

export function runButton(script, status, target) {
  const button = h('button', {
    type: 'button',
    className: 'small primary',
    onclick: async () => {
      button.disabled = true;
      try {
        const tab = await target();
        if (!tab) throw new Error('Open a web page to run the script on.');
        await messages.send('scripts', 'run', { id: script.id, tabId: tab.id });
        setStatus(status, `Ran ${script.name} on ${tab.title || tab.url}.`, 'success');
      } catch (error) {
        setStatus(status, error.message, 'error');
      } finally {
        button.disabled = false;
      }
    },
  }, icon('play'), 'Run');
  return button;
}
