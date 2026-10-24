(() => {
  if (globalThis.extenso.declutter) return;
  const { match, storage, modules } = globalThis.extenso;
  const { isSelector, rulesOf } = modules.declutter;
  const style = document.createElement('style');
  const moved = new Map();
  let hide = '';
  let remove = '';
  let moves = [];
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

  const observer = new MutationObserver((records) => {
    if (remove) {
      for (const { addedNodes } of records) {
        for (const node of addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && node.isConnected) sweep(node);
        }
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
    style.textContent = [
      ...hidden.map((selector) => `${selector} { display: none !important; }`),
      ...active.flatMap((rule) => rule.css ?? []),
    ].join('\n');
    observer.disconnect();
    restore();
    if (!remove && !moves.length) return;
    if (remove) sweep(document);
    relocate();
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
