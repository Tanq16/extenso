(() => {
  const AHEAD = 0.5;
  const IMAGES = /var s='([^']*)';var ii=\[([^\]]*)\];_setImagesSrc/g;
  const MARK = 'data-extenso-page';

  const results = document.querySelector('#rso');
  const footer = document.querySelector('#botstuff');
  const link = document.querySelector('#pnnext');
  const pager = link?.closest('[role="navigation"]');
  if (!results || !footer || !pager) return;

  let next = link.href;
  let last = results;
  let loading = false;

  const known = new Set([...document.querySelectorAll('style')].flatMap((style) => [...style.sheet?.cssRules ?? []].map((rule) => rule.cssText)));

  const decode = (text) => text.replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  const newStyles = (doc) => {
    const sheet = new CSSStyleSheet();
    const rules = [];
    for (const style of doc.querySelectorAll('style:not(noscript style)')) {
      sheet.replaceSync(style.textContent);
      for (const { cssText } of sheet.cssRules) {
        if (known.has(cssText)) continue;
        known.add(cssText);
        rules.push(cssText);
      }
    }
    const style = document.createElement('style');
    style.textContent = rules.join('\n');
    return style;
  };

  const fetchPage = async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google answered ${response.status}.`);
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const fetched = doc.querySelector('#rso');
    if (!fetched) throw new Error('The next page has no results.');
    for (const [, source, ids] of html.matchAll(IMAGES)) {
      for (const [, id] of ids.matchAll(/'([^']+)'/g)) {
        fetched.querySelector(`#${CSS.escape(id)}`)?.setAttribute('src', decode(source));
      }
    }
    return { nodes: [newStyles(doc), ...fetched.childNodes], next: doc.querySelector('#pnnext')?.href };
  };

  const near = () => footer.getBoundingClientRect().top < innerHeight * (1 + AHEAD);

  const load = async () => {
    if (loading || !next || !near()) return;
    loading = true;
    try {
      const { nodes, next: following } = await fetchPage(next);
      const container = document.createElement('div');
      container.setAttribute(MARK, '');
      container.append(...nodes);
      last.after(container);
      last = container;
      next = following;
    } catch (error) {
      console.error('[extenso] continuous scroll stopped', error);
      link.href = next;
      pager.style.display = '';
      next = null;
    }
    loading = false;
    load();
  };

  pager.style.display = 'none';
  addEventListener('scroll', load, { passive: true });
  load();
})();
