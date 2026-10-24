export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2), value);
    else if (key in element) element[key] = value;
    else element.setAttribute(key, value);
  }
  element.append(...children.flat().filter((child) => child != null && child !== false));
  return element;
}

export function icon(name) {
  return h('span', { className: 'icon', 'aria-hidden': 'true', style: `--icon: url("/third_party/lucide/icons/${name}.svg")` });
}

export function group(title, rows, status) {
  const badge = h('span');
  const element = h('details', { className: 'group' },
    h('summary', {}, icon('chevron-right'), h('h3', { className: 'grow' }, title), badge),
    h('ul', { className: 'list' }, rows),
    status,
  );
  const count = (on, total) => {
    badge.className = on ? 'badge info' : 'badge';
    badge.textContent = `${on} of ${total} on`;
  };
  return { element, count };
}

export function setStatus(element, message, type = 'info') {
  element.textContent = message;
  element.className = `status ${type}`;
}
