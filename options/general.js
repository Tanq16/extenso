import { exportSettings, importSettings } from '../lib/transfer.js';
import { h, setStatus } from '../ui/dom.js';

export function render(container) {
  const status = h('p', { className: 'status' });

  const download = async () => {
    try {
      const data = await exportSettings();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      h('a', { href: url, download: `extenso-settings-${data.exportedAt.slice(0, 10)}.json` }).click();
      setTimeout(() => URL.revokeObjectURL(url));
      setStatus(status, `Exported ${Object.keys(data.settings).length} modules.`, 'success');
    } catch (error) {
      setStatus(status, `Export failed: ${error.message}`, 'error');
    }
  };

  const file = h('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
    onchange: async () => {
      const [selected] = file.files;
      file.value = '';
      if (!selected) return;
      try {
        const { imported, skipped } = await importSettings(JSON.parse(await selected.text()));
        const message = imported.length ? `Imported ${imported.join(', ')}.` : 'No modules imported.';
        setStatus(
          status,
          skipped.length ? `${message} Skipped unknown or invalid: ${skipped.join(', ')}.` : message,
          skipped.length ? 'warning' : 'success',
        );
      } catch (error) {
        setStatus(status, `Import failed: ${error.message}`, 'error');
      }
    },
  });

  container.append(
    h('section', { className: 'card' },
      h('h2', {}, 'Export settings'),
      h('p', { className: 'muted' }, 'Downloads every module\'s settings as one JSON file. Captures and caches are not included.'),
      h('button', { type: 'button', className: 'primary', onclick: download }, 'Export'),
    ),
    h('section', { className: 'card' },
      h('h2', {}, 'Import settings'),
      h('p', { className: 'muted' }, 'Replaces the settings of each module in the file. Modules missing from the file keep their current settings.'),
      h('button', { type: 'button', onclick: () => file.click() }, 'Choose file'),
      file,
    ),
    status,
  );
}
