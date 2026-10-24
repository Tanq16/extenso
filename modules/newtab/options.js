import '../../lib/storage.js';
import './module.js';
import { h, setStatus } from '../../ui/dom.js';
import { moduleCard } from '../../ui/modules.js';

const { storage } = globalThis.extenso;

const normalize = (value) => {
  const url = value.trim();
  return url && !/^[a-z][a-z\d+.-]*:\/\//i.test(url) ? `https://${url}` : url;
};

export async function render(container) {
  const { url } = await storage.getSettings('newtab');
  const status = h('p', { className: 'status' });
  const input = h('input', { type: 'text', value: url, placeholder: 'https://example.com', spellcheck: false });

  input.addEventListener('change', async () => {
    input.value = normalize(input.value);
    try {
      await storage.updateSettings('newtab', { url: input.value });
      setStatus(status, input.value ? `New tabs open ${input.value}.` : 'Redirect URL cleared.', 'success');
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
  });

  container.append(await moduleCard('newtab', status, h('label', { className: 'field' }, 'Redirect URL', input)));
}
