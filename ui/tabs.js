import { h } from './dom.js';

export function mountTabs(nav, main, entries, { initial, onSelect } = {}) {
  const tabs = entries.map((entry) => {
    const button = h('button', { type: 'button', role: 'tab', id: `tab-${entry.id}` }, entry.label);
    const panel = h('section', { role: 'tabpanel', hidden: true, 'aria-labelledby': button.id });
    nav.append(button);
    main.append(panel);
    return { ...entry, button, panel, rendered: false };
  });

  const select = async (id) => {
    const target = tabs.find((tab) => tab.id === id) ?? tabs[0];
    for (const tab of tabs) {
      tab.button.setAttribute('aria-selected', String(tab === target));
      tab.panel.hidden = tab !== target;
    }
    onSelect?.(target.id);
    if (target.rendered) return;
    target.rendered = true;
    try {
      await target.render(target.panel);
    } catch (error) {
      console.error(`[extenso] ${target.id} render failed`, error);
      target.panel.append(h('p', { className: 'status error' }, error.message));
    }
  };

  nav.addEventListener('click', (event) => {
    const button = event.target.closest('[role="tab"]');
    if (button) select(button.id.slice('tab-'.length));
  });

  return select(initial);
}

export function openOptions(tab) {
  return chrome.tabs.create({ url: chrome.runtime.getURL(`options/options.html${tab ? `#${tab}` : ''}`) });
}
