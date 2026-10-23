(() => {
  const dark = (globalThis.extenso ??= {}).dark ??= {};
  const engine = (dark.engine ??= {});
  const { EVENTS, getCSSBaseURL, isRelativeHrefOnAbsolutePath } = engine.util;
  const { iterateShadowHosts, removeNode, watchForNodePosition, addReadyStateCompleteListener } = engine.dom;
  const { IGNORED_MEDIA, IMPORT_REGEX, removeCSSComments } = engine.css;
  const { loadText, inlineImports } = engine.network;
  const { createStyleSheetModifier } = engine.sheetModifier;

  const STYLE_SELECTOR = 'style, link[rel*="stylesheet" i]:not([disabled])';
  const MAX_MOVE_COUNT = 10;

  let ignoredCSSURLPatterns = [];
  const setIgnoredCSSURLs = (patterns) => {
    ignoredCSSURLPatterns = patterns ?? [];
  };

  const shouldIgnoreCSSURL = (url) => ignoredCSSURLPatterns.some((pattern) => {
    if (pattern.startsWith('^')) return url.startsWith(pattern.slice(1));
    if (pattern.endsWith('$')) return url.endsWith(pattern.slice(0, -1));
    return url.includes(pattern);
  });

  const shouldManageStyle = (element) => {
    const isStyle = element instanceof HTMLStyleElement || element instanceof SVGStyleElement;
    const isLink = element instanceof HTMLLinkElement
      && element.rel.toLowerCase().includes('stylesheet')
      && Boolean(element.href)
      && !element.disabled
      && !shouldIgnoreCSSURL(element.href);
    return (isStyle || isLink)
      && !element.classList.contains('darkreader')
      && !IGNORED_MEDIA.includes(element.media.toLowerCase())
      && !element.classList.contains('stylus');
  };

  const getManageableStyles = (node, results = [], deep = true) => {
    if (shouldManageStyle(node)) {
      results.push(node);
    } else if (node instanceof Element || node instanceof ShadowRoot || node instanceof Document) {
      node.querySelectorAll(STYLE_SELECTOR).forEach((style) => getManageableStyles(style, results, false));
      if (deep) iterateShadowHosts(node, (_, root) => getManageableStyles(root, results, false));
    }
    return results;
  };

  const corsCopies = new WeakMap();
  const corsCopyLengths = new WeakMap();
  const linkRejectors = new Map();
  let loadingLinkCounter = 0;

  const cleanLoadingLinks = () => linkRejectors.clear();

  const linkLoading = (link, id) => new Promise((resolve, reject) => {
    const cleanUp = () => {
      link.removeEventListener('load', onLoad);
      link.removeEventListener('error', onError);
      linkRejectors.delete(id);
    };
    const onLoad = () => {
      cleanUp();
      resolve();
    };
    const onError = () => {
      cleanUp();
      reject(new Error(`Link ${link.href} could not be loaded`));
    };
    linkRejectors.set(id, () => {
      cleanUp();
      reject(new Error('Link loading cancelled'));
    });
    link.addEventListener('load', onLoad, { passive: true });
    link.addEventListener('error', onError, { passive: true });
    if (!link.href) onError();
  });

  const hasImports = (rules, crossOriginOnly) => {
    if (!rules) return false;
    for (const rule of rules) {
      if (!rule.href) continue;
      if (!crossOriginOnly) return true;
      if (!rule.href.startsWith('https://fonts.googleapis.com/') && rule.href.startsWith('http') && !rule.href.startsWith(location.origin)) return true;
    }
    return false;
  };

  const manageStyle = (element, { update, loadingStart, loadingEnd }) => {
    let syncStyle = null;
    let positionWatcher = null;
    let cancelled = false;
    let isOverrideEmpty = true;
    let isLoadingRules = false;
    let wasLoadingError = false;
    let forceRender = false;
    let moveCount = 0;
    const loadingLinkId = ++loadingLinkCounter;
    const isAsyncCancelled = () => cancelled;
    const sheetModifier = createStyleSheetModifier();

    const getRulesOrError = () => {
      try {
        return [element.sheet?.cssRules ?? null, null];
      } catch (error) {
        return [null, error];
      }
    };

    const safeGetSheetRules = () => getRulesOrError()[0];

    const containsCSSImport = () => element instanceof HTMLStyleElement
      && new RegExp(IMPORT_REGEX.source, 'i').test(removeCSSComments(element.textContent ?? ''));

    const createOrUpdateCORSCopy = async (cssText, basePath, source) => {
      if (!cssText) return;
      try {
        const fullText = await inlineImports(cssText, basePath, new Set(source ? [source] : []));
        const copy = corsCopies.get(element);
        if (copy) {
          if ((corsCopyLengths.get(element) ?? 0) < fullText.length) {
            copy.replaceSync(fullText);
            corsCopyLengths.set(element, fullText.length);
          }
          return;
        }
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(fullText);
        engine.modify.defineSheetScope(sheet, element.getRootNode());
        corsCopies.set(element, sheet);
        corsCopyLengths.set(element, fullText.length);
      } catch (error) {
        console.warn('[extenso] dark: unable to build a stylesheet copy', error);
      }
    };

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((m) => m.type === 'characterData') && containsCSSImport()) {
        createOrUpdateCORSCopy((element.textContent ?? '').trim(), getCSSBaseURL(element.baseURI)).then(update);
      } else {
        update();
      }
    });

    const getRulesSync = () => {
      if (corsCopies.has(element)) return corsCopies.get(element).cssRules;
      if (containsCSSImport()) return null;
      const rules = safeGetSheetRules();
      if (element instanceof HTMLLinkElement && !isRelativeHrefOnAbsolutePath(element.href) && hasImports(rules, false)) return null;
      if (hasImports(rules, true)) return null;
      return rules;
    };

    const getRulesAsync = async () => {
      let cssText;
      let basePath;
      let source = null;
      if (element instanceof HTMLLinkElement) {
        let [rules, error] = getRulesOrError();
        if (!rules && !error) {
          try {
            await linkLoading(element, loadingLinkId);
          } catch (loadError) {
            console.warn('[extenso] dark:', loadError.message);
            wasLoadingError = true;
          }
          if (cancelled) return null;
          [rules, error] = getRulesOrError();
        }
        if (rules && !hasImports(rules, false)) return rules;
        try {
          cssText = await loadText(element.href);
        } catch (loadError) {
          console.warn('[extenso] dark: unable to load stylesheet', element.href, loadError);
          cssText = '';
        }
        basePath = getCSSBaseURL(element.href);
        source = element.href;
        if (cancelled) return null;
      } else if (containsCSSImport()) {
        cssText = element.textContent.trim();
        basePath = getCSSBaseURL(element.baseURI);
      } else {
        return null;
      }
      await createOrUpdateCORSCopy(cssText, basePath, source);
      return corsCopies.get(element)?.cssRules ?? null;
    };

    const details = ({ secondRound }) => {
      const rules = getRulesSync();
      if (rules) return { rules };
      if (secondRound || isLoadingRules || wasLoadingError) return null;
      isLoadingRules = true;
      loadingStart();
      getRulesAsync()
        .then((results) => {
          isLoadingRules = false;
          loadingEnd();
          if (results) update();
        })
        .catch((error) => {
          console.warn('[extenso] dark: unable to read stylesheet rules', error);
          isLoadingRules = false;
          loadingEnd();
        });
      return null;
    };

    const insertStyle = () => {
      if (element.parentNode && element.nextSibling !== syncStyle) element.parentNode.insertBefore(syncStyle, element.nextSibling);
    };

    const createSyncStyle = () => {
      syncStyle = element instanceof SVGStyleElement
        ? document.createElementNS('http://www.w3.org/2000/svg', 'style')
        : document.createElement('style');
      syncStyle.classList.add('darkreader', 'darkreader--sync');
      syncStyle.media = 'screen';
      if (element.title) syncStyle.title = element.title;
    };

    const render = (ignoreImageAnalysis) => {
      const rules = getRulesSync();
      if (!rules) return;
      cancelled = false;

      const prepareSheet = () => {
        if (!syncStyle) createSyncStyle();
        positionWatcher?.stop();
        insertStyle();
        if (syncStyle.sheet == null) syncStyle.textContent = '';
        const { sheet } = syncStyle;
        for (let i = sheet.cssRules.length - 1; i >= 0; i--) sheet.deleteRule(i);
        if (positionWatcher) {
          positionWatcher.run();
        } else if (syncStyle.previousSibling) {
          positionWatcher = watchForNodePosition(syncStyle, 'prev-sibling', () => {
            forceRender = true;
            build();
          });
        }
        return sheet;
      };

      const build = () => {
        const force = forceRender;
        forceRender = false;
        sheetModifier.modifySheet({ prepareSheet, sourceCSSRules: rules, ignoreImageAnalysis, force, isAsyncCancelled });
        isOverrideEmpty = !syncStyle?.sheet || syncStyle.sheet.cssRules.length === 0;
        if (sheetModifier.shouldRebuildStyle()) addReadyStateCompleteListener(() => update());
      };

      build();
    };

    let areSheetChangesPending = false;
    const onSheetChange = () => {
      if (areSheetChangesPending) return;
      areSheetChangesPending = true;
      queueMicrotask(() => {
        areSheetChangesPending = false;
        if (!cancelled) update();
      });
    };

    const pause = () => {
      observer.disconnect();
      cancelled = true;
      positionWatcher?.stop();
      element.removeEventListener(EVENTS.updateSheet, onSheetChange);
    };

    const destroy = () => {
      pause();
      corsCopies.delete(element);
      removeNode(syncStyle);
      loadingEnd();
      const reject = linkRejectors.get(loadingLinkId);
      if (reject) reject();
    };

    const watch = () => {
      observer.observe(element, { attributes: true, childList: true, subtree: true, characterData: true });
      if (element instanceof HTMLStyleElement) element.addEventListener(EVENTS.updateSheet, onSheetChange);
    };

    const restore = () => {
      if (!syncStyle) return;
      moveCount++;
      if (moveCount > MAX_MOVE_COUNT) return;
      insertStyle();
      positionWatcher?.skip();
      if (!isOverrideEmpty) {
        forceRender = true;
        update();
      }
    };

    return { details, render, pause, destroy, watch, restore };
  };

  engine.styleManager = { shouldManageStyle, getManageableStyles, manageStyle, setIgnoredCSSURLs, cleanLoadingLinks };
})();
