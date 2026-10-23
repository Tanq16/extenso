import '../../lib/storage.js';
import './module.js';
import { h, setStatus } from '../../ui/dom.js';

const { storage } = globalThis.extenso;

const normalize = (value) => {
  const url = value.trim();
  return url && !/^[a-z][a-z\d+.-]*:\/\//i.test(url) ? `https://${url}` : url;
};

export async function render(container) {
  const { enabled, url } = await storage.getSettings('newtab');
  const status = h('p', { className: 'status' });
  const toggle = h('input', {
    type: 'checkbox',
    className: 'toggle',
    checked: enabled,
    onchange: async () => {
      try {
        await storage.updateSettings('newtab', { enabled: toggle.checked });
        setStatus(status, toggle.checked ? 'Redirect on.' : 'Redirect off.', 'success');
      } catch (error) {
        setStatus(status, error.message, 'error');
      }
    },
  });
  const input = h('input', { type: 'text', value: url, placeholder: 'https://example.com', spellcheck: false });

  const save = async (event) => {
    event.preventDefault();
    input.value = normalize(input.value);
    try {
      await storage.updateSettings('newtab', { url: input.value });
      setStatus(status, 'Saved.', 'success');
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
  };

  container.append(
    h('form', { className: 'card', onsubmit: save },
      h('h2', {}, 'New tab redirect'),
      h('label', { className: 'row' }, 'Redirect new tabs', toggle),
      h('label', { className: 'field' }, 'Redirect URL', input),
      h('button', { type: 'submit', className: 'primary' }, 'Save'),
    ),
    status,
  );
}
