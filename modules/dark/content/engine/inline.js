(() => {
  const dark = (globalThis.extenso ??= {}).dark ??= {};
  const engine = (dark.engine ??= {});
  const { throttle, getAbsoluteURL } = engine.util;
  const { iterateShadowHosts, createOptimizedTreeObserver, isReadyStateComplete, addReadyStateCompleteListener, isDOMReady, addDOMReadyListener } = engine.dom;
  const { iterateCSSDeclarations } = engine.css;

  const override = (cssProp, name) => ({ cssProp, customProp: `--darkreader-inline-${name}`, dataAttr: `data-darkreader-inline-${name}` });

  const OVERRIDES = Object.fromEntries([
    override('background-color', 'bgcolor'),
    override('background-image', 'bgimage'),
    override('border-color', 'border'),
    override('border-bottom-color', 'border-bottom'),
    override('border-left-color', 'border-left'),
    override('border-right-color', 'border-right'),
    override('border-top-color', 'border-top'),
    override('box-shadow', 'boxshadow'),
    override('color', 'color'),
    override('fill', 'fill'),
    override('stroke', 'stroke'),
    override('outline-color', 'outline'),
    override('stop-color', 'stopcolor'),
  ].map((entry) => [entry.cssProp, entry]));

  const SHORTHAND_OVERRIDES = Object.fromEntries([
    override('background', 'bg'),
    override('border', 'border-short'),
    override('border-bottom', 'border-bottom-short'),
    override('border-left', 'border-left-short'),
    override('border-right', 'border-right-short'),
    override('border-top', 'border-top-short'),
  ].map((entry) => [entry.cssProp, entry]));

  const ALL_OVERRIDES = [...Object.values(OVERRIDES), ...Object.values(SHORTHAND_OVERRIDES)];
  const CUSTOM_TO_CSS_PROP = Object.fromEntries(Object.values(OVERRIDES).map(({ customProp, cssProp }) => [customProp, cssProp]));
  const INLINE_STYLE_ATTRS = ['style', 'fill', 'stop-color', 'stroke', 'bgcolor', 'color', 'background'];
  const INLINE_STYLE_SELECTOR = INLINE_STYLE_ATTRS.map((attr) => `[${attr}]`).join(', ');
  const INVERT_ATTR = 'data-darkreader-inline-invert';
  const IMPORTANT_ATTR = 'data-darkreader-inline-important';
  const MARKED_SELECTOR = [...ALL_OVERRIDES.map(({ dataAttr }) => `[${dataAttr}]`), `[${INVERT_ATTR}]`, `[${IMPORTANT_ATTR}]`, '[style*="--darkreader-"]'].join(', ');
  const SMALL_SVG_SIZE = 32;
  const MAX_LOOP_TEARDOWNS = 10;
  const MAX_ATTR_BATCHES = 50;
  const ATTR_BATCH_INTERVAL_MS = 10000;
  const ATTR_RETRY_MS = 2000;

  const getInlineOverrideStyle = () => [
    ...ALL_OVERRIDES.map(({ dataAttr, customProp, cssProp }) => `[${dataAttr}] {\n  ${cssProp}: var(${customProp}) !important;\n}`),
    `[${INVERT_ATTR}] {\n  filter: invert(100%) hue-rotate(180deg);\n}`,
  ].join('\n');

  let inlineStyleCache = new WeakMap();
  let importantOriginals = new WeakMap();
  const svgInversionCache = new WeakSet();
  const svgRootSmall = new WeakMap();
  const stringValueCache = new Map();
  const teardownParents = new Map();
  let teardownCounts = new WeakMap();
  let asyncCancelled = true;
  const isAsyncCancelled = () => asyncCancelled;

  const getCacheKey = (element) => INLINE_STYLE_ATTRS
    .filter((attr) => element.hasAttribute(attr))
    .map((attr) => `${attr}="${element.getAttribute(attr)}"`)
    .join(' ');

  const checkForTeardown = () => {
    teardownParents.forEach((parent, element) => {
      if (element.isConnected || !parent.isConnected) return;
      teardownCounts.set(parent, (teardownCounts.get(parent) ?? 0) + 1);
    });
    teardownParents.clear();
  };

  const trackTeardown = (element) => {
    if (!element.parentNode) return;
    if (teardownParents.size === 0) queueMicrotask(checkForTeardown);
    teardownParents.set(element, element.parentNode);
  };

  const parentHadTeardown = (element) => !element.parentNode || (teardownCounts.get(element.parentNode) ?? 0) >= MAX_LOOP_TEARDOWNS;

  const shouldAnalyzeSVGAsImage = (svg) => Boolean(svg.getAttribute('class')?.includes('logo') || svg.parentElement?.getAttribute('class')?.includes('logo'));

  const analyzeSVGAsImage = (svg) => {
    const markup = svg.outerHTML.replaceAll('<style class="darkreader darkreader--sync" media="screen"></style>', '');
    engine.image.getImageDetails(`data:image/svg+xml,${encodeURIComponent(markup)}`).then((details) => {
      if ((details.isDark && details.isTransparent) || (details.isLarge && details.isLight && !details.isTransparent)) svg.setAttribute(INVERT_ATTR, '');
      else svg.removeAttribute(INVERT_ATTR);
    }, () => {});
  };

  const getSVGRoot = (element) => (element instanceof SVGSVGElement ? element : element.ownerSVGElement);

  const getStyleSource = (element, property) => {
    const value = element.style.getPropertyValue(property);
    const record = importantOriginals.get(element)?.get(property);
    return record && record.written === value ? record.source : value;
  };

  const overrideInlineStyle = (element, ignoreInlineSelectors, ignoreImageSelectors) => {
    if (parentHadTeardown(element) || element.parentElement?.dataset.nodeViewContent) return;
    if (getCacheKey(element) === inlineStyleCache.get(element)) return;

    const unsetProps = new Set(Object.keys(OVERRIDES));

    const overrideValue = (sourceAttr, sourceCSSProp, modifierCSSProp, cssValue, important = false) => {
      const targetCSSProp = sourceAttr === 'style' ? sourceCSSProp : sourceAttr;

      const setStaticValue = (value) => {
        if (important) {
          const records = importantOriginals.get(element) ?? new Map();
          importantOriginals.set(element, records);
          element.style.setProperty(targetCSSProp, value, 'important');
          records.set(targetCSSProp, { source: cssValue, written: element.style.getPropertyValue(targetCSSProp) });
          element.setAttribute(IMPORTANT_ATTR, '');
        } else {
          const { customProp, dataAttr } = OVERRIDES[targetCSSProp] ?? SHORTHAND_OVERRIDES[targetCSSProp];
          element.style.setProperty(customProp, value);
          if (!element.hasAttribute(dataAttr)) element.setAttribute(dataAttr, '');
        }
        trackTeardown(element);
        unsetProps.delete(targetCSSProp);
      };

      const cached = !important && stringValueCache.get(modifierCSSProp)?.get(cssValue);
      if (cached) {
        setStaticValue(cached);
        return;
      }

      asyncCancelled = false;
      const mod = engine.modify.getModifiableCSSDeclaration(modifierCSSProp, cssValue, { style: element.style }, ignoreImageSelectors, isAsyncCancelled);
      if (!mod) return;

      const value = typeof mod.value === 'function' ? mod.value() : mod.value;
      if (typeof value === 'string') {
        setStaticValue(value);
        if (!stringValueCache.has(modifierCSSProp)) stringValueCache.set(modifierCSSProp, new Map());
        stringValueCache.get(modifierCSSProp).set(cssValue, value);
      } else if (value instanceof Promise) {
        value.then((resolved) => {
          if (!resolved || asyncCancelled) return;
          if (sourceCSSProp === 'background' && resolved.startsWith('var(--darkreader-bg--')) setStaticValue(resolved);
          if (sourceCSSProp === 'background-image') {
            const isRoot = element === document.documentElement || element === document.body;
            setStaticValue(isRoot && resolved === cssValue ? 'none' : resolved);
          }
          inlineStyleCache.set(element, getCacheKey(element));
        });
      } else if (value && typeof value === 'object') {
        let previous = [];
        const setProps = (declarations) => {
          previous.forEach(({ property }) => element.style.removeProperty(property));
          declarations.forEach(({ property, value: declared }) => {
            if (!(declared instanceof Promise)) element.style.setProperty(property, declared);
          });
          previous = declarations;
        };
        setProps(value.declarations);
        value.onTypeChange.addListener(setProps);
      }
    };

    if (ignoreInlineSelectors.length > 0 && ignoreInlineSelectors.some((selector) => element.matches(selector))) {
      unsetProps.forEach((cssProp) => element.removeAttribute(OVERRIDES[cssProp].dataAttr));
      return;
    }

    const isSVGElement = element instanceof SVGElement;
    const svg = isSVGElement ? getSVGRoot(element) : null;
    if (svg) {
      if (svgInversionCache.has(svg)) return;
      if (shouldAnalyzeSVGAsImage(svg)) {
        svgInversionCache.add(svg);
        analyzeSVGAsImage(svg);
        if (!isDOMReady()) addDOMReadyListener(() => analyzeSVGAsImage(svg));
        return;
      }
    }

    const normalizeHex = (value) => (/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(value) ? `#${value}` : value);

    if (element.hasAttribute('bgcolor')) overrideValue('bgcolor', '', 'background-color', normalizeHex(element.getAttribute('bgcolor')));

    const isRoot = element === document.documentElement || element === document.body;
    if (isRoot && element.getAttribute('background')) {
      overrideValue('background', '', 'background-image', `url("${getAbsoluteURL(location.href, element.getAttribute('background'))}")`);
    }

    if (element.hasAttribute('color') && element.rel !== 'mask-icon') {
      let value = normalizeHex(element.getAttribute('color'));
      if (/^#?[0-9a-f]{4}$/i.test(value)) value = `#${value.replace('#', '')}00`;
      overrideValue('color', '', 'color', value);
    }

    if (isSVGElement) {
      const fill = element.getAttribute('fill');
      if (fill && fill !== 'none' && fill !== 'currentColor') {
        if (element instanceof SVGTextElement) {
          overrideValue('fill', '', 'color', fill);
        } else {
          const handleSVGElement = () => {
            const root = getSVGRoot(element);
            if (!root) return;
            if (!svgRootSmall.has(root)) {
              const bounds = root.getBoundingClientRect();
              svgRootSmall.set(root, bounds.width * bounds.height <= SMALL_SVG_SIZE ** 2);
            }
            let isBg = false;
            if (!svgRootSmall.get(root)) {
              const { width, height } = element.getBoundingClientRect();
              isBg = width > SMALL_SVG_SIZE || height > SMALL_SVG_SIZE;
            }
            overrideValue('fill', '', isBg ? 'background-color' : 'color', fill);
          };
          if (isReadyStateComplete()) handleSVGElement();
          else addReadyStateCompleteListener(handleSVGElement);
        }
      }
      if (element.hasAttribute('stop-color')) overrideValue('stop-color', '', 'background-color', element.getAttribute('stop-color'));
    }

    if (element.hasAttribute('stroke')) {
      const cssProp = element instanceof SVGLineElement || element instanceof SVGTextElement ? 'border-color' : 'color';
      overrideValue('stroke', '', cssProp, element.getAttribute('stroke'));
    }

    if (element.style) {
      iterateCSSDeclarations(element.style, (property, rawValue) => {
        const value = getStyleSource(element, property);
        const important = element.style.getPropertyPriority(property) === 'important' && !property.startsWith('--');
        if (property === 'background-image' && value.includes('url')) {
          if (isRoot) overrideValue('style', property, property, value, important);
          return;
        }
        if (Object.hasOwn(OVERRIDES, property) || (property.startsWith('--') && !CUSTOM_TO_CSS_PROP[property] && !property.startsWith('--darkreader-'))) {
          overrideValue('style', property, property, value, important);
        } else if (SHORTHAND_OVERRIDES[property] && rawValue.includes('var(')) {
          overrideValue('style', property, property, value, important);
        } else {
          const overridden = CUSTOM_TO_CSS_PROP[property];
          if (!overridden || element.style.getPropertyValue(overridden) || element.hasAttribute(overridden)) return;
          if (overridden === 'background-color' && element.hasAttribute('bgcolor')) return;
          element.style.setProperty(property, '');
        }
      });
      if (element instanceof SVGTextElement && element.style.fill) overrideValue('style', 'fill', 'color', element.style.getPropertyValue('fill'));
      if (element.getAttribute('style')?.includes('--')) engine.variables.store.addInlineStyleForMatching(element.style);
    }

    unsetProps.forEach((cssProp) => element.removeAttribute(OVERRIDES[cssProp].dataAttr));
    inlineStyleCache.set(element, getCacheKey(element));
  };

  const watchers = new Map();

  const deepWatch = (root, onElement, onShadowRoot) => {
    watchers.get(root)?.forEach((watcher) => watcher.disconnect());
    const discovered = new WeakSet();

    const discover = (node) => {
      const elements = node instanceof Element && node.matches(INLINE_STYLE_SELECTOR) ? [node] : [];
      if (node.querySelectorAll) elements.push(...node.querySelectorAll(INLINE_STYLE_SELECTOR));
      elements.forEach((element) => {
        if (discovered.has(element)) return;
        discovered.add(element);
        onElement(element);
      });
      iterateShadowHosts(node, (host, shadowRoot) => {
        if (discovered.has(host)) return;
        discovered.add(host);
        onShadowRoot(shadowRoot);
        deepWatch(shadowRoot, onElement, onShadowRoot);
      });
    };

    const treeObserver = createOptimizedTreeObserver(root, {
      onMinorMutations: (_root, { additions }) => {
        additions.forEach(discover);
        engine.variables.store.matchVariablesAndDependents();
      },
      onHugeMutations: () => {
        discover(root);
        engine.variables.store.matchVariablesAndDependents();
      },
    });

    let batches = 0;
    let start = null;
    let pending = [];
    let timeoutId = null;
    const handleAttributeMutations = throttle((mutations) => {
      const handled = new Set();
      mutations.forEach(({ target, attributeName }) => {
        if (handled.has(target) || !INLINE_STYLE_ATTRS.includes(attributeName)) return;
        handled.add(target);
        onElement(target);
      });
      engine.variables.store.matchVariablesAndDependents();
    });
    const attrObserver = new MutationObserver((mutations) => {
      if (timeoutId) {
        pending.push(...mutations);
        return;
      }
      batches++;
      const now = Date.now();
      if (start == null) {
        start = now;
      } else if (batches >= MAX_ATTR_BATCHES) {
        if (now - start < ATTR_BATCH_INTERVAL_MS) {
          pending.push(...mutations);
          timeoutId = setTimeout(() => {
            start = null;
            batches = 0;
            timeoutId = null;
            const queued = pending;
            pending = [];
            handleAttributeMutations(queued);
          }, ATTR_RETRY_MS);
          return;
        }
        start = now;
        batches = 1;
      }
      handleAttributeMutations(mutations);
    });
    attrObserver.observe(root, {
      attributes: true,
      attributeFilter: [...INLINE_STYLE_ATTRS, ...Object.values(OVERRIDES).map(({ dataAttr }) => dataAttr)],
      subtree: true,
    });

    watchers.set(root, [treeObserver, attrObserver, {
      disconnect: () => {
        clearTimeout(timeoutId);
        handleAttributeMutations.cancel();
      },
    }]);
  };

  const watchForInlineStyles = (onElement, onShadowRoot) => {
    deepWatch(document, onElement, onShadowRoot);
    iterateShadowHosts(document.documentElement, (_, root) => deepWatch(root, onElement, onShadowRoot));
  };

  const stopWatchingForInlineStyles = () => {
    asyncCancelled = true;
    watchers.forEach((list) => list.forEach((watcher) => watcher.disconnect()));
    watchers.clear();
    stringValueCache.clear();
    teardownParents.clear();
    teardownCounts = new WeakMap();
  };

  const restoreElement = (element) => {
    const records = importantOriginals.get(element);
    records?.forEach(({ source, written }, property) => {
      if (element.style.getPropertyValue(property) === written) element.style.setProperty(property, source, 'important');
    });
    if (element.style) {
      const custom = [...element.style].filter((property) => property.startsWith('--darkreader-'));
      custom.forEach((property) => element.style.removeProperty(property));
      if (element.style.length === 0 && element.getAttribute('style') === '') element.removeAttribute('style');
    }
    [...element.attributes]
      .filter(({ name }) => name.startsWith('data-darkreader-inline-'))
      .forEach(({ name }) => element.removeAttribute(name));
  };

  const restoreInlineStyles = (roots) => {
    roots.forEach((root) => root.querySelectorAll(MARKED_SELECTOR).forEach(restoreElement));
    inlineStyleCache = new WeakMap();
    importantOriginals = new WeakMap();
  };

  engine.inline = {
    INLINE_STYLE_SELECTOR,
    getInlineOverrideStyle,
    overrideInlineStyle,
    watchForInlineStyles,
    stopWatchingForInlineStyles,
    restoreInlineStyles,
  };
})();
