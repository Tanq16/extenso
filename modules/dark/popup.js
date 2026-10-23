import { h } from '../../ui/dom.js';

export function render(container, tab) {
  container.append(h('p', { className: 'empty' }, 'Nothing here yet.'));
}
