(() => {
  const SKIP = 'script, style, noscript, template, svg, canvas, iframe, object, embed, video, audio, input, select, textarea, button, nav, aside, footer, [aria-hidden="true"]';

  const selection = getSelection();
  const range = selection.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : null;
  const largest = (selector) => [...document.querySelectorAll(selector)]
    .filter((element) => element.checkVisibility() || getComputedStyle(element).display === 'contents')
    .sort((a, b) => b.textContent.length - a.textContent.length)[0];
  const root = range?.commonAncestorContainer ?? largest('article') ?? largest('main, [role="main"]') ?? document.body;

  const escape = (text) => text.replace(/[\\`*_[\]<]/g, '\\$&');
  const flat = (text) => text.replace(/\s+/g, ' ').trim();
  const wrap = (mark, text) => (text.trim() ? `${mark}${text.trim()}${mark}` : text);
  const url = (href) => href.replaceAll('(', '%28').replaceAll(')', '%29');
  const fence = (text, min) => '`'.repeat([...text.matchAll(/`+/g)].reduce((length, [run]) => Math.max(length, run.length + 1), min));
  const inRange = (node) => !range || range.intersectsNode(node);
  const textOf = (node) => {
    let text = node.data;
    if (node === range?.endContainer) text = text.slice(0, range.endOffset);
    if (node === range?.startContainer) text = text.slice(range.startOffset);
    return text;
  };
  const raw = (node) => {
    if (!inRange(node)) return '';
    return node.nodeType === Node.TEXT_NODE ? textOf(node) : [...node.childNodes].map(raw).join('');
  };
  const children = (node) => (node.localName === 'slot' ? node.assignedNodes({ flatten: true }) : ((!range && node.shadowRoot) || node).childNodes);

  const list = (node) => {
    const items = [...node.children].filter((child) => child.tagName === 'LI').map((item, index) => {
      const body = convert(item).trim().replace(/\n\s*\n/g, '\n');
      const marker = node.tagName === 'OL' ? `${node.start + index}.` : '-';
      return body && `${marker} ${body.replaceAll('\n', `\n${' '.repeat(marker.length + 1)}`)}`;
    });
    return `\n\n${items.filter(Boolean).join('\n')}\n\n`;
  };

  const table = (node) => {
    const rows = [...node.rows].filter(inRange).map((row) => [...row.cells].map((cell) => flat(convert(cell)).replaceAll('|', '\\|')));
    const width = Math.max(0, ...rows.map((row) => row.length));
    if (!width) return '';
    const line = (cells) => `| ${Array.from({ length: width }, (_, index) => cells[index] ?? '').join(' | ')} |`;
    return `\n\n${[line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n')}\n\n`;
  };

  const convert = (node) => {
    if (!inRange(node)) return '';
    if (node.nodeType === Node.TEXT_NODE) return escape(textOf(node).replace(/\s+/g, ' '));
    if (node.nodeType !== Node.ELEMENT_NODE || (node !== root && node.matches(SKIP))) return '';
    const { display, visibility } = getComputedStyle(node);
    if (display === 'none' || visibility !== 'visible') return '';
    const content = () => [...children(node)].map(convert).join('');
    const tag = node.tagName;
    if (/^H[1-6]$/.test(tag)) return `\n\n${'#'.repeat(Number(tag[1]))} ${flat(content())}\n\n`;
    switch (tag) {
      case 'BR': return '  \n';
      case 'HR': return '\n\n---\n\n';
      case 'IMG': {
        const src = node.currentSrc || node.src;
        return src.startsWith('http') ? `![${escape(flat(node.alt))}](${url(src)})` : escape(node.alt);
      }
      case 'PRE': {
        const text = raw(node).replace(/\n$/, '');
        const ticks = fence(text, 3);
        const language = (node.querySelector('code') ?? node).className.match(/language-(\S+)/)?.[1] ?? '';
        return `\n\n${ticks}${language}\n${text}\n${ticks}\n\n`;
      }
      case 'CODE': {
        const text = raw(node).replace(/\s+/g, ' ');
        const ticks = fence(text, 1);
        const pad = /^`|`$/.test(text) ? ' ' : '';
        return text.trim() ? `${ticks}${pad}${text}${pad}${ticks}` : '';
      }
      case 'A': {
        const text = content();
        if (!/^(https?|mailto|tel):/.test(node.href)) return text;
        const label = text.includes('\n') ? escape(flat(node.innerText)) : text.trim();
        return label && `[${label}](${url(node.href)})`;
      }
      case 'STRONG': case 'B': return wrap('**', content());
      case 'EM': case 'I': return wrap('*', content());
      case 'DEL': case 'S': return wrap('~~', content());
      case 'UL': case 'OL': return list(node);
      case 'TABLE': return table(node);
      case 'BLOCKQUOTE': return `\n\n${content().trim().replace(/^/gm, '> ')}\n\n`;
    }
    const text = content();
    return display.startsWith('inline') || display === 'contents' ? text : `\n\n${text.trim()}\n\n`;
  };

  const body = convert(root).replace(/^[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!body) throw new Error('Found no text to copy.');
  const title = range || root.querySelector('h1') ? '' : `# ${escape(document.title)}\n\n`;
  const markdown = range ? body : `${title}${body}\n\nSource: ${location.href}`;

  let copied = false;
  const onCopy = (event) => {
    event.stopImmediatePropagation();
    event.preventDefault();
    event.clipboardData.setData('text/plain', markdown);
    copied = true;
  };
  addEventListener('copy', onCopy, true);
  // navigator.clipboard.writeText rejects while the page is unfocused, as it is when this runs from the popup.
  document.execCommand('copy');
  removeEventListener('copy', onCopy, true);
  if (!copied) throw new Error('Could not copy to the clipboard.');

  document.getElementById('extenso-toast')?.remove();
  const toast = document.createElement('div');
  toast.id = 'extenso-toast';
  toast.textContent = `Copied the ${range ? 'selection' : 'page'} as Markdown.`;
  toast.style.cssText = 'position:fixed;top:20px;left:20px;z-index:2147483647;padding:8px 16px;border-radius:6px;background:black;color:white;font:bold 14px sans-serif;pointer-events:none';
  document.documentElement.append(toast);
  setTimeout(() => toast.remove(), 3000);
})();
