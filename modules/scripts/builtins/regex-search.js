(() => {
  const NAME = 'extenso-regex';
  const HINT = 'Enter a pattern, or /pattern/flags.';
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA']);

  const toast = (message) => {
    document.getElementById('extenso-toast')?.remove();
    const element = document.createElement('div');
    element.id = 'extenso-toast';
    element.textContent = message;
    element.style.cssText = 'position:fixed;top:20px;left:20px;z-index:2147483647;padding:8px 16px;border-radius:6px;background:black;color:white;font:bold 14px sans-serif;pointer-events:none';
    document.documentElement.append(element);
    setTimeout(() => element.remove(), 3000);
  };

  if (CSS.highlights.has(NAME)) {
    CSS.highlights.delete(NAME);
    document.getElementById(NAME)?.remove();
    return;
  }

  let message = `Search the page with a regular expression. ${HINT}`;
  let input = '';
  let regex;
  while (!regex) {
    input = prompt(message, input);
    if (!input) return;
    const [, source, flags] = input.match(/^\/(.+)\/([a-z]*)$/) ?? [null, input, ''];
    try {
      regex = new RegExp(source, flags.includes('g') ? flags : `${flags}g`);
    } catch (error) {
      message = `${error.message}. ${HINT}`;
    }
  }

  const blockOf = (element) => {
    while (element !== document.body && ['inline', 'contents'].includes(getComputedStyle(element).display)) element = element.parentElement;
    return element;
  };

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: ({ parentElement }) => !SKIP.has(parentElement.tagName) && parentElement.checkVisibility({ visibilityProperty: true })
      ? NodeFilter.FILTER_ACCEPT
      : NodeFilter.FILTER_REJECT,
  });
  const runs = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const block = blockOf(node.parentElement);
    if (runs.at(-1)?.block !== block) runs.push({ block, nodes: [], starts: [], text: '' });
    const run = runs.at(-1);
    run.nodes.push(node);
    run.starts.push(run.text.length);
    run.text += node.data;
  }

  const point = ({ nodes, starts }, offset) => {
    const index = starts.findLastIndex((start) => start <= offset);
    return [nodes[index], offset - starts[index]];
  };
  const highlight = new Highlight();
  let first = null;
  for (const run of runs) {
    for (const match of run.text.matchAll(regex)) {
      if (!match[0]) continue;
      const range = new Range();
      range.setStart(...point(run, match.index));
      range.setEnd(...point(run, match.index + match[0].length));
      highlight.add(range);
      first ??= range;
    }
  }
  if (!first) return toast(`No matches for ${regex}`);

  const style = document.createElement('style');
  style.id = NAME;
  // Dark mode skips styles with this class, which keeps the highlight yellow on themed pages.
  style.className = 'darkreader';
  style.textContent = `::highlight(${NAME}) { background-color: yellow; color: black; }`;
  document.documentElement.append(style);
  CSS.highlights.set(NAME, highlight);
  first.startContainer.parentElement.scrollIntoView({ block: 'center' });
  toast(`${highlight.size} ${highlight.size === 1 ? 'match' : 'matches'}. Run again to clear.`);
})();
