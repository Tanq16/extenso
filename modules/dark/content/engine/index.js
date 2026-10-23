(() => {
  const dark = (globalThis.extenso ??= {}).dark ??= {};
  const engine = (dark.engine ??= {});
  const { EVENTS } = engine.util;
  const { isDOMReady, addDOMReadyListener, removeDOMReadyListener, cleanReadyListeners, iterateShadowHosts, removeNode, watchForNodePosition } = engine.dom;
  const { getManageableStyles, manageStyle, setIgnoredCSSURLs, cleanLoadingLinks } = engine.styleManager;
  const { canHaveAdoptedStyleSheets, getSourceSheets, createAdoptedStyleSheetOverride } = engine.adopted;
  const { INLINE_STYLE_SELECTOR, getInlineOverrideStyle, overrideInlineStyle, watchForInlineStyles, stopWatchingForInlineStyles, restoreInlineStyles } = engine.inline;
  const { getUserAgentStyle, getFallbackStyle, getInvertStyle, getVariablesStyle, replaceCSSTemplates } = engine.modify;
  const store = engine.variables.store;

  const SHADOW_STYLE_CLASSES = ['darkreader--inline', 'darkreader--override', 'darkreader--invert'];

  let running = false;
  let fixKey = null;
  let fix = null;
  let styleManagers = new Map();
  let adoptedManagers = new Map();
  let shadowRoots = new Set();
  let loadingStyles = new Set();
  let loadingCounter = 0;
  let staticStyles = new Map();
  let positionWatchers = new Map();
  const cleaners = [];

  const getStaticStyle = (className, root) => {
    if (!staticStyles.has(root)) staticStyles.set(root, new Map());
    const styles = staticStyles.get(root);
    let style = root.querySelector(`.${className}`) ?? styles.get(className);
    if (!style) {
      style = document.createElement('style');
      style.classList.add('darkreader', className);
      style.media = 'screen';
    }
    styles.set(className, style);
    return style;
  };

  const injectStaticStyles = () => {
    let last = null;
    const inject = (name, text, position, onRestore) => {
      const style = getStaticStyle(`darkreader--${name}`, document);
      style.textContent = text;
      const prev = position === 'beginning' ? last : document.head.lastChild;
      document.head.insertBefore(style, prev ? prev.nextSibling : document.head.firstChild);
      if (position === 'beginning') last = style;
      positionWatchers.get(name)?.stop();
      positionWatchers.set(name, watchForNodePosition(style, 'head', onRestore));
      return style;
    };
    inject('fallback', getFallbackStyle(true), 'beginning');
    inject('user-agent', getUserAgentStyle(window.self !== window.top), 'beginning');
    inject('invert', getInvertStyle(fix.invert), 'beginning');
    inject('inline', getInlineOverrideStyle(), 'beginning');
    inject('variables', getVariablesStyle(), 'beginning');
    inject('root-vars', '', 'beginning');
    inject('override', replaceCSSTemplates(fix.css), 'ending');
  };

  const injectShadowStaticStyles = (root) => {
    const texts = [getInlineOverrideStyle(), replaceCSSTemplates(fix.css), getInvertStyle(fix.invert)];
    let prev = null;
    SHADOW_STYLE_CLASSES.forEach((className, i) => {
      const style = getStaticStyle(className, root);
      style.textContent = texts[i];
      root.insertBefore(style, prev ? prev.nextSibling : root.firstChild);
      prev = style;
    });
    shadowRoots.add(root);
  };

  const createShadowStaticStyles = (root) => {
    const wasEmpty = root.firstChild === null;
    injectShadowStaticStyles(root);
    if (!wasEmpty) return;
    const observer = new MutationObserver((mutations) => {
      observer.disconnect();
      const removedOurs = mutations.some(({ removedNodes }) => [...removedNodes].some((node) => (
        node.nodeName === 'STYLE' && SHADOW_STYLE_CLASSES.some((className) => node.classList.contains(className))
      )));
      if (removedOurs && running) injectShadowStaticStyles(root);
    });
    observer.observe(root, { childList: true });
    cleaners.push(() => observer.disconnect());
  };

  const cleanFallbackStyle = () => {
    const fallback = staticStyles.get(document)?.get('darkreader--fallback') ?? document.querySelector('.darkreader--fallback');
    if (fallback) fallback.textContent = '';
  };

  const updateRootVars = () => {
    const style = getStaticStyle('darkreader--root-vars', document);
    const text = store.getRootVarsText();
    const { sheet } = style;
    if (!sheet) {
      style.textContent = text;
      return;
    }
    if (sheet.cssRules.length > 0) sheet.deleteRule(0);
    sheet.insertRule(text);
  };

  const createManager = (element) => {
    const loadingId = ++loadingCounter;
    const loadingStart = () => {
      if (isDOMReady() && document.visibilityState === 'visible') return;
      loadingStyles.add(loadingId);
      const fallback = getStaticStyle('darkreader--fallback', document);
      if (!fallback.textContent) fallback.textContent = getFallbackStyle(false);
    };
    const loadingEnd = () => {
      loadingStyles.delete(loadingId);
      if (loadingStyles.size === 0 && isDOMReady()) cleanFallbackStyle();
    };
    const update = () => {
      if (!running) return;
      const details = manager.details({ secondRound: true });
      if (!details) return;
      store.addRulesForMatching(details.rules);
      store.matchVariablesAndDependents();
      manager.render(fix.ignoreImageAnalysis);
    };
    const manager = manageStyle(element, { update, loadingStart, loadingEnd });
    styleManagers.set(element, manager);
    return manager;
  };

  const removeManager = (element) => {
    styleManagers.get(element)?.destroy();
    styleManagers.delete(element);
  };

  const collectDetails = (managers) => {
    managers
      .map((manager) => manager.details({ secondRound: false }))
      .filter((details) => details && details.rules.length > 0)
      .forEach((details) => store.addRulesForMatching(details.rules));
  };

  const handleAdoptedStyleSheets = (node) => {
    if (!canHaveAdoptedStyleSheets(node) || adoptedManagers.has(node)) return;
    getSourceSheets(node).forEach((sheet) => store.addRulesForMatching(sheet.cssRules));
    const manager = createAdoptedStyleSheetOverride(node);
    adoptedManagers.set(node, manager);
    manager.render(fix.ignoreImageAnalysis);
    manager.watch((sheets) => {
      sheets.forEach((sheet) => store.addRulesForMatching(sheet.cssRules));
      store.matchVariablesAndDependents();
      manager.render(fix.ignoreImageAnalysis);
    });
  };

  const overrideInline = (element) => overrideInlineStyle(element, fix.ignoreInlineStyle, fix.ignoreImageAnalysis);

  const createDynamicStyleOverrides = () => {
    const newManagers = getManageableStyles(document).filter((style) => !styleManagers.has(style)).map(createManager);
    collectDetails(newManagers);
    store.matchVariablesAndDependents();
    store.setOnRootVariableChange(updateRootVars);
    updateRootVars();
    styleManagers.forEach((manager) => manager.render(fix.ignoreImageAnalysis));
    if (loadingStyles.size === 0) cleanFallbackStyle();
    newManagers.forEach((manager) => manager.watch());

    const inlineElements = [...document.querySelectorAll(INLINE_STYLE_SELECTOR)];
    iterateShadowHosts(document.documentElement, (_, root) => {
      createShadowStaticStyles(root);
      inlineElements.push(...root.querySelectorAll(INLINE_STYLE_SELECTOR));
    });
    inlineElements.forEach(overrideInline);
    handleAdoptedStyleSheets(document);
    store.matchVariablesAndDependents();
  };

  const onDOMReady = () => {
    if (loadingStyles.size === 0) cleanFallbackStyle();
  };

  const watchForUpdates = () => {
    engine.watch.watchForStyleChanges([...styleManagers.keys()], ({ created, updated, removed, moved }) => {
      removed.forEach(removeManager);
      const newManagers = [...created, ...updated, ...moved].filter((style) => !styleManagers.has(style)).map(createManager);
      collectDetails(newManagers);
      store.matchVariablesAndDependents();
      newManagers.forEach((manager) => manager.render(fix.ignoreImageAnalysis));
      newManagers.forEach((manager) => manager.watch());
      moved.filter((style) => styleManagers.has(style)).forEach((style) => styleManagers.get(style).restore());
    }, (root) => {
      createShadowStaticStyles(root);
      handleAdoptedStyleSheets(root);
    });

    watchForInlineStyles((element) => {
      overrideInline(element);
      if (element === document.documentElement && element.getAttribute('style')?.includes('--')) {
        store.matchVariablesAndDependents();
        updateRootVars();
      }
    }, (root) => {
      createShadowStaticStyles(root);
      root.querySelectorAll(INLINE_STYLE_SELECTOR).forEach(overrideInline);
    });

    addDOMReadyListener(onDOMReady);
  };

  const runDynamicStyle = () => {
    if (!running) return;
    createDynamicStyleOverrides();
    watchForUpdates();
  };

  const requestProxy = () => document.dispatchEvent(new CustomEvent(EVENTS.install));
  const onProxyHello = () => {
    if (running) requestProxy();
  };

  const onHeadReady = () => {
    if (document.querySelector('meta[name="darkreader-lock"]')) {
      stop();
      return;
    }
    document.documentElement.setAttribute('data-darkreader-mode', 'dynamic');
    document.documentElement.setAttribute('data-darkreader-scheme', 'dark');
    injectStaticStyles();
    requestProxy();
    if (document.visibilityState !== 'hidden') {
      runDynamicStyle();
      return;
    }
    const onVisible = () => {
      if (document.visibilityState === 'hidden') return;
      document.removeEventListener('visibilitychange', onVisible);
      runDynamicStyle();
    };
    document.addEventListener('visibilitychange', onVisible);
    cleaners.push(() => document.removeEventListener('visibilitychange', onVisible));
  };

  const normalizeFix = (input = {}) => ({
    invert: input.invert ?? [],
    css: input.css ?? '',
    ignoreInlineStyle: input.ignoreInlineStyle ?? [],
    ignoreImageAnalysis: input.ignoreImageAnalysis ?? [],
    ignoreCSSUrl: input.ignoreCSSUrl ?? [],
  });

  const start = (input) => {
    const next = normalizeFix(input);
    const key = JSON.stringify(next);
    if (running && key === fixKey) return;
    if (running) stop();
    running = true;
    fix = next;
    fixKey = key;
    setIgnoredCSSURLs(fix.ignoreCSSUrl);
    document.addEventListener(EVENTS.hello, onProxyHello);

    if (document.head) {
      onHeadReady();
      return;
    }
    const fallback = getStaticStyle('darkreader--fallback', document);
    fallback.textContent = getFallbackStyle(true);
    document.documentElement.append(fallback);
    const headObserver = new MutationObserver(() => {
      if (!document.head) return;
      headObserver.disconnect();
      onHeadReady();
    });
    headObserver.observe(document, { childList: true, subtree: true });
    cleaners.push(() => headObserver.disconnect());
  };

  const stop = () => {
    if (!running) return;
    running = false;
    fixKey = null;
    document.dispatchEvent(new CustomEvent(EVENTS.cleanUp));
    document.removeEventListener(EVENTS.hello, onProxyHello);

    styleManagers.forEach((manager) => manager.pause());
    positionWatchers.forEach((watcher) => watcher.stop());
    engine.watch.stopWatchingForStyleChanges();
    stopWatchingForInlineStyles();
    removeDOMReadyListener(onDOMReady);
    cleanReadyListeners();
    cleaners.splice(0).forEach((clean) => clean());

    [...styleManagers.keys()].forEach(removeManager);
    adoptedManagers.forEach((manager) => manager.destroy());
    const roots = [document, ...shadowRoots];
    roots.forEach((root) => root.querySelectorAll('.darkreader').forEach(removeNode));
    staticStyles.forEach((styles) => styles.forEach(removeNode));
    restoreInlineStyles(roots);
    document.documentElement.removeAttribute('data-darkreader-mode');
    document.documentElement.removeAttribute('data-darkreader-scheme');

    store.clear();
    cleanLoadingLinks();
    engine.sheetModifier.cancelAsync();
    ['util', 'color', 'network', 'image', 'modify'].forEach((name) => engine[name].clearCaches());
    styleManagers = new Map();
    adoptedManagers = new Map();
    shadowRoots = new Set();
    loadingStyles = new Set();
    staticStyles = new Map();
    positionWatchers = new Map();
  };

  dark.dynamic = { start, stop };
})();
