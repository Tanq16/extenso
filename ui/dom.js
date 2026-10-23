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

export function setStatus(element, message, type = 'info') {
  element.textContent = message;
  element.className = `status ${type}`;
}
