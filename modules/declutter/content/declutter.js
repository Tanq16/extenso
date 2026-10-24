(() => {
  if (globalThis.extenso.declutter) return;
  const { match, storage, modules } = globalThis.extenso;
  const { isSelector, rulesOf } = modules.declutter;
  const style = document.createElement('style');
  let hide = '';
  let remove = '';
  let removed = 0;

  const sweep = (root) => {
    const targets = root.matches?.(remove) ? [root] : root.querySelectorAll(remove);
    for (const element of targets) {
      element.remove();
      removed += 1;
    }
  };

  const observer = new MutationObserver((records) => {
    for (const { addedNodes } of records) {
      for (const node of addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && node.isConnected) sweep(node);
      }
    }
  });

  const apply = (settings) => {
    const active = settings.enabled
      ? rulesOf(settings).filter((rule) => rule.enabled && match.matchesAny(rule.matches, location.href))
      : [];
    const hidden = active.flatMap((rule) => rule.hide).filter(isSelector);
    hide = hidden.join(', ');
    remove = active.flatMap((rule) => rule.remove).filter(isSelector).join(', ');
    style.textContent = hidden.map((selector) => `${selector} { display: none !important; }`).join('\n');
    observer.disconnect();
    if (!remove) return;
    sweep(document);
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
