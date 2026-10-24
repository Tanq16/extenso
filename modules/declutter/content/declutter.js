(() => {
  if (globalThis.extenso.declutter) return;
  const { match, storage, modules } = globalThis.extenso;
  const { isSelector, rulesOf } = modules.declutter;
  const style = document.createElement('style');
  const moved = new Map();
  const sized = new Set();
  const columns = new WeakMap();
  let hide = '';
  let remove = '';
  let moves = [];
  let masonry = '';
  let removed = 0;

  const sweep = (root) => {
    const targets = root.matches?.(remove) ? [root] : root.querySelectorAll(remove);
    for (const element of targets) {
      element.remove();
      removed += 1;
    }
  };

  const relocate = () => {
    for (const { selector, to } of moves) {
      const element = document.querySelector(selector);
      const target = document.querySelector(to);
      if (!element || !target || target.firstElementChild === element || element.contains(target)) continue;
      if (!moved.has(element)) {
        const placeholder = document.createComment('');
        element.before(placeholder);
        moved.set(element, placeholder);
      }
      target.prepend(element);
    }
  };

  const restore = () => {
    for (const [element, placeholder] of moved) {
      if (moves.some(({ selector }) => element.matches(selector))) continue;
      placeholder.replaceWith(element);
      moved.delete(element);
    }
  };

  const place = (grid) => {
    const { display, gridAutoRows, gridTemplateColumns, rowGap } = getComputedStyle(grid);
    const items = [...grid.children].filter((element) => element.matches(masonry));
    const track = parseFloat(gridAutoRows);
    if (display !== 'grid' || !track) return items.map((element) => [element, '', '']);
    const gap = parseFloat(rowGap) || 0;
    const count = gridTemplateColumns.split(' ').length;
    const reflow = columns.get(grid) !== count;
    columns.set(grid, count);
    const bottoms = Array(count).fill(0);
    return items.flatMap((element) => {
      const { display: shown, gridColumnStart, gridColumnEnd } = getComputedStyle(element);
      if (shown === 'none') return [];
      const rows = Math.max(1, Math.ceil((element.getBoundingClientRect().height + gap) / (track + gap)));
      if (gridColumnEnd !== 'auto') {
        bottoms.fill(Math.max(...bottoms) + rows);
        return [[element, `${gridColumnStart} / ${gridColumnEnd}`, `span ${rows}`]];
      }
      const column = (!reflow && parseInt(gridColumnStart, 10)) || bottoms.indexOf(Math.min(...bottoms)) + 1;
      bottoms[column - 1] += rows;
      return [[element, String(column), `span ${rows}`]];
    });
  };

  const sizer = new ResizeObserver((entries) => {
    const grids = new Set();
    for (const { target } of entries) {
      if (target.isConnected) {
        grids.add(target.parentElement);
        continue;
      }
      sizer.unobserve(target);
      sized.delete(target);
    }
    const placements = [...grids].flatMap(place);
    for (const [element, column, span] of placements) {
      element.style.gridColumn = column;
      element.style.gridRowEnd = span;
    }
  });

  const size = (root) => {
    for (const element of [...(root.matches?.(masonry) ? [root] : []), ...root.querySelectorAll(masonry)]) {
      if (sized.has(element)) continue;
      sized.add(element);
      sizer.observe(element);
    }
  };

  const unsize = () => {
    sizer.disconnect();
    for (const element of sized) {
      element.style.removeProperty('grid-column');
      element.style.removeProperty('grid-row-end');
    }
    sized.clear();
  };

  const inherit = ([added], [replaced]) => {
    if (!replaced.style?.gridColumn || !added.matches?.(masonry)) return;
    added.style.gridColumn = replaced.style.gridColumn;
    added.style.gridRowEnd = replaced.style.gridRowEnd;
  };

  const observer = new MutationObserver((records) => {
    for (const { addedNodes, removedNodes } of records) {
      if (masonry && addedNodes.length === 1 && removedNodes.length === 1) inherit(addedNodes, removedNodes);
      for (const node of addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (remove && node.isConnected) sweep(node);
        if (masonry && node.isConnected) size(node);
      }
    }
    relocate();
  });

  const apply = (settings) => {
    const active = settings.enabled && !settings.disabledHosts.includes(location.hostname)
      ? rulesOf(settings).filter((rule) => rule.enabled && match.matchesAny(rule.matches, location.href))
      : [];
    const hidden = active.flatMap((rule) => rule.hide).filter(isSelector);
    hide = hidden.join(', ');
    remove = active.flatMap((rule) => rule.remove).filter(isSelector).join(', ');
    moves = active.flatMap((rule) => rule.move ?? []).filter(({ selector, to }) => isSelector(selector) && isSelector(to));
    masonry = active.flatMap((rule) => rule.masonry ?? []).filter(isSelector).join(', ');
    style.textContent = [
      ...hidden.map((selector) => `${selector} { display: none !important; }`),
      ...active.flatMap((rule) => rule.css ?? []),
    ].join('\n');
    observer.disconnect();
    restore();
    unsize();
    if (!remove && !moves.length && !masonry) return;
    if (remove) sweep(document);
    relocate();
    if (masonry) size(document);
    observer.observe(document, { childList: true, subtree: true });
  };

  const refresh = async () => {
    try {
      apply(await storage.getSettings('declutter'));
    } catch (error) {
      style.textContent = '';
      throw error;
    }
    return { hidden: hide ? document.querySelectorAll(hide).length : 0, removed };
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.hasOwn(changes, storage.settingsKey('declutter'))) refresh();
  });

  if (document.readyState === 'loading') style.textContent = 'html { opacity: 0 !important; }';
  document.documentElement.append(style);
  globalThis.extenso.declutter = { refresh };
  refresh();
})();
