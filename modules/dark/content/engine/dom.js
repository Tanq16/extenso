(() => {
  const dark = (globalThis.extenso ??= {}).dark ??= {};
  const engine = (dark.engine ??= {});
  const { throttle } = engine.util;

  const isDOMReady = () => document.readyState === 'complete' || document.readyState === 'interactive';
  const isReadyStateComplete = () => document.readyState === 'complete';

  const readyListeners = new Set();
  const completeListeners = new Set();
  let listening = false;

  const onReadyStateChange = () => {
    if (!isDOMReady()) return;
    const ready = [...readyListeners];
    readyListeners.clear();
    ready.forEach((listener) => listener());
    if (!isReadyStateComplete()) return;
    const complete = [...completeListeners];
    completeListeners.clear();
    complete.forEach((listener) => listener());
    document.removeEventListener('readystatechange', onReadyStateChange);
    listening = false;
  };

  const listen = () => {
    if (listening) return;
    listening = true;
    document.addEventListener('readystatechange', onReadyStateChange);
  };

  const addDOMReadyListener = (listener) => {
    if (isDOMReady()) return listener();
    readyListeners.add(listener);
    listen();
  };

  const addReadyStateCompleteListener = (listener) => {
    if (isReadyStateComplete()) return listener();
    completeListeners.add(listener);
    listen();
  };

  const removeDOMReadyListener = (listener) => readyListeners.delete(listener);

  const cleanReadyListeners = () => {
    readyListeners.clear();
    completeListeners.clear();
    document.removeEventListener('readystatechange', onReadyStateChange);
    listening = false;
  };

  const attachedHosts = new WeakSet();
  const markShadowHost = (element) => attachedHosts.add(element);

  const getShadowRoot = (element) => {
    if (element.shadowRoot) return element.shadowRoot;
    if (!(element instanceof HTMLElement) || !chrome.dom?.openOrClosedShadowRoot) return null;
    if (!element.localName.includes('-') && !attachedHosts.has(element)) return null;
    try {
      return chrome.dom.openOrClosedShadowRoot(element) ?? null;
    } catch {
      return null;
    }
  };

  const iterateShadowHosts = (root, iterator) => {
    if (root == null) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => (getShadowRoot(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    const first = root instanceof Element && getShadowRoot(root) ? walker.currentNode : walker.nextNode();
    for (let node = first; node; node = walker.nextNode()) {
      iterator(node, getShadowRoot(node));
      iterateShadowHosts(getShadowRoot(node), iterator);
    }
  };

  const removeNode = (node) => node?.parentNode?.removeChild(node);

  const HUGE_MUTATIONS_COUNT = 1000;

  const isHugeMutation = (mutations) => {
    if (mutations.length > HUGE_MUTATIONS_COUNT) return true;
    let added = 0;
    for (const mutation of mutations) {
      added += mutation.addedNodes.length;
      if (added > HUGE_MUTATIONS_COUNT) return true;
    }
    return false;
  };

  const getTreeOperations = (mutations) => {
    const additions = new Set();
    const deletions = new Set();
    const moves = new Set();
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element && node.isConnected) additions.add(node);
      }
      for (const node of mutation.removedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.isConnected) {
          moves.add(node);
          additions.delete(node);
        } else {
          deletions.add(node);
        }
      }
    }
    for (const node of [...additions]) {
      if (additions.has(node.parentElement)) additions.delete(node);
    }
    for (const node of [...deletions]) {
      if (deletions.has(node.parentElement)) deletions.delete(node);
    }
    return { additions, moves, deletions };
  };

  const treeObservers = new Map();

  const createOptimizedTreeObserver = (root, callbacks) => {
    let entry = treeObservers.get(root);
    if (!entry) {
      const set = new Set();
      let hadHugeMutations = false;
      let waitingForReady = false;
      const onHuge = () => set.forEach(({ onHugeMutations }) => onHugeMutations(root));
      const observer = new MutationObserver((mutations) => {
        if (isHugeMutation(mutations)) {
          if (!hadHugeMutations || isDOMReady()) {
            onHuge();
          } else if (!waitingForReady) {
            waitingForReady = true;
            addDOMReadyListener(onHuge);
          }
          hadHugeMutations = true;
          return;
        }
        const operations = getTreeOperations(mutations);
        set.forEach(({ onMinorMutations }) => onMinorMutations(root, operations));
      });
      observer.observe(root, { childList: true, subtree: true });
      entry = { observer, callbacks: set, onHuge };
      treeObservers.set(root, entry);
    }
    entry.callbacks.add(callbacks);
    return {
      disconnect() {
        entry.callbacks.delete(callbacks);
        if (entry.callbacks.size > 0) return;
        removeDOMReadyListener(entry.onHuge);
        entry.observer.disconnect();
        treeObservers.delete(root);
      },
    };
  };

  const MAX_RESTORE_ATTEMPTS = 10;
  const RESTORE_INTERVAL_MS = 10000;
  const RESTORE_RETRY_MS = 2000;

  const watchForNodePosition = (node, mode, onRestore) => {
    let prevSibling = node.previousSibling;
    let parent = node.parentNode;
    if (!parent) throw new Error('Unable to watch for node position: no parent');
    if (mode === 'prev-sibling' && !prevSibling) throw new Error('Unable to watch for node position: no previous sibling');
    let attempts = 0;
    let start = null;
    let timeoutId = null;

    const restore = throttle(() => {
      if (timeoutId) return;
      attempts++;
      const now = Date.now();
      if (start == null) {
        start = now;
      } else if (attempts >= MAX_RESTORE_ATTEMPTS) {
        if (now - start < RESTORE_INTERVAL_MS) {
          timeoutId = setTimeout(() => {
            start = null;
            attempts = 0;
            timeoutId = null;
            restore();
          }, RESTORE_RETRY_MS);
          return;
        }
        start = now;
        attempts = 1;
      }
      if (mode === 'head') {
        if (prevSibling && prevSibling.parentNode !== parent) prevSibling = document.head.lastChild;
        if (!parent.isConnected) parent = document.head;
      } else {
        if (prevSibling.parentNode == null) {
          stop();
          return;
        }
        if (prevSibling.parentNode !== parent) updateParent(prevSibling.parentNode);
      }
      parent.insertBefore(node, prevSibling?.isConnected ? prevSibling.nextSibling : parent.firstChild);
      observer.takeRecords();
      onRestore?.();
    });

    const observer = new MutationObserver(() => {
      const moved = mode === 'head'
        ? node.parentNode !== parent || !node.parentNode.isConnected
        : node.previousSibling !== prevSibling;
      if (moved) restore();
    });

    const run = () => observer.observe(parent, { childList: true });
    const stop = () => {
      clearTimeout(timeoutId);
      observer.disconnect();
      restore.cancel();
    };
    const skip = () => observer.takeRecords();
    const updateParent = (next) => {
      parent = next;
      stop();
      run();
    };

    run();
    return { run, stop, skip };
  };

  engine.dom = {
    isDOMReady,
    isReadyStateComplete,
    addDOMReadyListener,
    removeDOMReadyListener,
    addReadyStateCompleteListener,
    cleanReadyListeners,
    markShadowHost,
    getShadowRoot,
    iterateShadowHosts,
    removeNode,
    createOptimizedTreeObserver,
    watchForNodePosition,
  };
})();
