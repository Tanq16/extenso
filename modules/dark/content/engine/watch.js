(() => {
  const dark = (globalThis.extenso ??= {}).dark ??= {};
  const engine = (dark.engine ??= {});
  const { EVENTS } = engine.util;
  const { iterateShadowHosts, createOptimizedTreeObserver, addDOMReadyListener, removeDOMReadyListener, markShadowHost, getShadowRoot } = engine.dom;
  const { shouldManageStyle, getManageableStyles } = engine.styleManager;

  let observers = [];
  let observedRoots = new WeakSet();
  let handledHosts = new WeakSet();
  let definitionCallback = null;
  let onDOMReady = null;
  const definedTags = new Set();
  const undefinedGroups = new Map();
  const resolvers = new Map();
  const attachingHosts = new Set();

  const getCustomTag = (element) => {
    const tag = element.localName;
    return tag.includes('-') ? tag : element.getAttribute('is');
  };

  const whenDefined = (tag) => {
    if (definedTags.has(tag)) return Promise.resolve();
    return new Promise((resolve) => {
      if (!resolvers.has(tag)) resolvers.set(tag, []);
      resolvers.get(tag).push(resolve);
      document.dispatchEvent(new CustomEvent(EVENTS.addUndefinedResolver, { detail: tag }));
    });
  };

  const onDefined = (event) => {
    const tag = event.detail;
    if (typeof tag !== 'string') return;
    definedTags.add(tag);
    const waiting = resolvers.get(tag);
    resolvers.delete(tag);
    waiting?.forEach((resolve) => resolve());
  };

  const recordUndefinedElement = (element) => {
    const tag = getCustomTag(element);
    if (!tag) return;
    if (!undefinedGroups.has(tag)) {
      undefinedGroups.set(tag, new Set());
      whenDefined(tag).then(() => {
        const elements = undefinedGroups.get(tag);
        undefinedGroups.delete(tag);
        if (elements && definitionCallback) definitionCallback([...elements]);
      });
    }
    undefinedGroups.get(tag).add(element);
  };

  const collectUndefinedElements = (root) => root.querySelectorAll(':not(:defined)').forEach(recordUndefinedElement);

  const onShadowAttaching = (event) => {
    const host = event.target;
    markShadowHost(host);
    if (attachingHosts.size === 0) {
      queueMicrotask(() => {
        const hosts = [...attachingHosts].filter((element) => getShadowRoot(element));
        attachingHosts.clear();
        definitionCallback?.(hosts);
      });
    }
    attachingHosts.add(host);
  };

  const listen = (target, type, listener) => {
    target.addEventListener(type, listener);
    observers.push({ disconnect: () => target.removeEventListener(type, listener) });
  };

  const watchForStyleChanges = (currentStyles, update, shadowRootDiscovered) => {
    stopWatchingForStyleChanges();

    const prevStylesByRoot = new WeakMap();
    const getPrevStyles = (root) => {
      if (!prevStylesByRoot.has(root)) prevStylesByRoot.set(root, new Set());
      return prevStylesByRoot.get(root);
    };
    const prevSiblings = new WeakMap();
    const nextSiblings = new WeakMap();
    const savePosition = (style) => {
      prevSiblings.set(style, style.previousElementSibling);
      nextSiblings.set(style, style.nextElementSibling);
    };
    const forgetPosition = (style) => {
      prevSiblings.delete(style);
      nextSiblings.delete(style);
    };
    const didPositionChange = (style) => style.previousElementSibling !== prevSiblings.get(style) || style.nextElementSibling !== nextSiblings.get(style);

    currentStyles.forEach((style) => {
      getPrevStyles(style.getRootNode()).add(style);
      savePosition(style);
    });

    const handleStyleOperations = (root, { created, removed, moved }) => {
      created.forEach(savePosition);
      moved.forEach(savePosition);
      removed.forEach(forgetPosition);
      const prevStyles = getPrevStyles(root);
      created.forEach((style) => prevStyles.add(style));
      removed.forEach((style) => prevStyles.delete(style));
      if (created.size + removed.size + moved.size > 0) {
        update({ created: [...created], removed: [...removed], moved: [...moved], updated: [] });
      }
    };

    const subscribeForShadowRoot = (host) => {
      const root = getShadowRoot(host);
      if (root == null || observedRoots.has(root)) return;
      observe(root);
      shadowRootDiscovered(root);
    };

    const deepObserve = (node) => iterateShadowHosts(node, subscribeForShadowRoot);

    const handleMinorMutations = (root, { additions, moves, deletions }) => {
      const created = new Set();
      const removed = new Set();
      const moved = new Set();
      additions.forEach((node) => getManageableStyles(node).forEach((style) => created.add(style)));
      deletions.forEach((node) => getManageableStyles(node).forEach((style) => removed.add(style)));
      moves.forEach((node) => getManageableStyles(node).forEach((style) => moved.add(style)));
      handleStyleOperations(root, { created, removed, moved });

      const potentialHosts = new Set();
      additions.forEach((node) => {
        if (node.parentElement) potentialHosts.add(node.parentElement);
        if (node.previousElementSibling) potentialHosts.add(node.previousElementSibling);
        deepObserve(node);
        collectUndefinedElements(node);
        if (getCustomTag(node)) recordUndefinedElement(node);
        engine.modify.checkImageSelectors(node);
      });
      potentialHosts.forEach((element) => {
        const shadowRoot = getShadowRoot(element);
        if (shadowRoot && !observedRoots.has(shadowRoot)) {
          subscribeForShadowRoot(element);
          deepObserve(shadowRoot);
        }
      });
    };

    const handleHugeMutations = (root) => {
      const styles = new Set(getManageableStyles(root));
      const prevStyles = getPrevStyles(root);
      const created = new Set([...styles].filter((style) => !prevStyles.has(style)));
      const removed = new Set([...prevStyles].filter((style) => !styles.has(style)));
      const moved = new Set([...styles].filter((style) => !created.has(style) && didPositionChange(style)));
      handleStyleOperations(root, { created, removed, moved });
      deepObserve(root);
      collectUndefinedElements(root);
      engine.modify.checkImageSelectors(root);
    };

    const handleAttributeMutations = (mutations) => {
      const updated = new Set();
      const removed = new Set();
      mutations.forEach(({ target }) => {
        if (!target.isConnected) return;
        if (shouldManageStyle(target)) updated.add(target);
        else if (target instanceof HTMLLinkElement && target.disabled) removed.add(target);
      });
      if (updated.size + removed.size > 0) update({ updated: [...updated], created: [], removed: [...removed], moved: [] });
    };

    const observe = (root) => {
      if (observedRoots.has(root)) return;
      const treeObserver = createOptimizedTreeObserver(root, { onMinorMutations: handleMinorMutations, onHugeMutations: handleHugeMutations });
      const attrObserver = new MutationObserver(handleAttributeMutations);
      attrObserver.observe(root, { attributeFilter: ['rel', 'disabled', 'media', 'href'], subtree: true });
      observers.push(treeObserver, attrObserver);
      listen(root, EVENTS.shadowAttaching, onShadowAttaching);
      observedRoots.add(root);
    };

    observe(document);
    deepObserve(document.documentElement);

    definitionCallback = (hosts) => {
      const fresh = hosts.filter((host) => !handledHosts.has(host));
      const styles = fresh.flatMap((host) => getManageableStyles(getShadowRoot(host)));
      update({ created: styles, updated: [], removed: [], moved: [] });
      fresh.forEach((host) => {
        const shadowRoot = getShadowRoot(host);
        if (shadowRoot) {
          subscribeForShadowRoot(host);
          deepObserve(shadowRoot);
          collectUndefinedElements(shadowRoot);
        }
        handledHosts.add(host);
      });
    };
    listen(document, EVENTS.isDefined, onDefined);
    collectUndefinedElements(document);

    onDOMReady = () => {
      for (const element of document.body?.children ?? []) {
        const shadowRoot = getShadowRoot(element);
        if (shadowRoot && !observedRoots.has(shadowRoot)) {
          subscribeForShadowRoot(element);
          deepObserve(shadowRoot);
        }
      }
    };
    addDOMReadyListener(onDOMReady);
  };

  const stopWatchingForStyleChanges = () => {
    observers.forEach((observer) => observer.disconnect());
    observers = [];
    observedRoots = new WeakSet();
    handledHosts = new WeakSet();
    definitionCallback = null;
    undefinedGroups.clear();
    resolvers.clear();
    attachingHosts.clear();
    if (onDOMReady) removeDOMReadyListener(onDOMReady);
    onDOMReady = null;
  };

  engine.watch = { watchForStyleChanges, stopWatchingForStyleChanges };
})();
