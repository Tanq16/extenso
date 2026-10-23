(() => {
  const dark = (globalThis.extenso ??= {}).dark ??= {};
  const engine = (dark.engine ??= {});
  const { getMatches, getParenthesesRange, getAbsoluteURL, getCSSBaseURL } = engine.util;
  const { URL_REGEX, getCSSURLValue } = engine.css;
  const { parseColor, getSRGBLightness, modifyBackground, modifyForeground, modifyBorder } = engine.color;
  const { getImageDetails, getInvertedImageURL, getSolidColorImageURL } = engine.image;

  const UNPARSABLE_COLORS = new Set(['inherit', 'transparent', 'initial', 'currentcolor', 'none', 'unset', 'auto']);
  const BG_PROPERTIES_TO_COPY = ['background-clip', 'background-position', 'background-repeat', 'background-size'];
  const WAIT_SELECTOR_STRIP = /::?(?:before|after)(?![\w-])|:(?:hover|focus-visible|focus-within|focus|active|checked|visited)(?![\w-])/g;

  const sheetScopes = new WeakMap();

  const defineSheetScope = (sheet, scope) => sheetScopes.set(sheet, scope);

  const getSheetScope = (sheet) => {
    if (sheetScopes.has(sheet)) return sheetScopes.get(sheet);
    const root = sheet.ownerNode?.getRootNode();
    if (!(root instanceof ShadowRoot || root instanceof Document)) return null;
    sheetScopes.set(sheet, root);
    return root;
  };

  const getColorModifier = (property, value, rule) => {
    const isInitialColor = property === 'color' && value === 'initial';
    if (UNPARSABLE_COLORS.has(value.toLowerCase()) && !isInitialColor) return value;
    const rgb = isInitialColor ? { r: 0, g: 0, b: 0, a: 1 } : parseColor(value);
    if (!rgb) return null;
    if (property.includes('background')) {
      const mask = rule.style.maskImage || rule.style.mask;
      if (mask && !mask.startsWith('none') && !mask.startsWith('linear-gradient')) return () => modifyForeground(rgb);
      return () => modifyBackground(rgb);
    }
    if (property.includes('border') || property.includes('outline')) return () => modifyBorder(rgb);
    return () => modifyForeground(rgb);
  };

  const shouldIgnoreImage = (selectorText, selectors) => {
    if (!selectorText || selectors.length === 0) return false;
    if (selectors.includes('*')) return true;
    const ruleSelectors = selectorText.split(/,\s*/g);
    return selectors.some((ignored) => {
      if (ignored.startsWith('^')) return ruleSelectors.some((s) => s.startsWith(ignored.slice(1)));
      if (ignored.endsWith('$')) return ruleSelectors.some((s) => s.endsWith(ignored.slice(0, -1)));
      return ruleSelectors.includes(ignored);
    });
  };

  const parseGradient = (value) => {
    const result = [];
    let index;
    let searchStart = 'conic-'.length;
    while ((index = value.indexOf('gradient', searchStart)) !== -1) {
      const type = ['linear-', 'radial-', 'conic-'].find((t) => value.slice(index - t.length, index) === t);
      if (!type) break;
      const prefixStart = index - type.length;
      let typeGradient = `${type}gradient`;
      if (value.slice(prefixStart - 10, prefixStart - 1) === 'repeating') typeGradient = `repeating-${typeGradient}`;
      else if (value.slice(prefixStart - 8, prefixStart - 1) === '-webkit') typeGradient = `-webkit-${typeGradient}`;
      const range = getParenthesesRange(value, index + 'gradient'.length);
      if (!range) break;
      result.push({
        type: 'gradient',
        typeGradient,
        match: value.slice(range.start + 1, range.end - 1),
        offset: typeGradient.length + 2,
        index: index - typeGradient.length + 'gradient'.length,
        hasComma: true,
      });
      searchStart = range.end + 1 + 'conic-'.length;
    }
    if (result.length) result[result.length - 1].hasComma = false;
    return result;
  };

  const GRADIENT_PARTS = /([^(),]+(\([^()]*(\([^()]*\)*[^()]*)?\))?([^(), ]|( (?!calc)))*),?/g;
  const COLOR_STOP = /^(from|color-stop|to)\(([^()]*?,\s*)?(.*?)\)$/;

  const getGradientModifier = ({ typeGradient, match, hasComma }) => {
    const parts = getMatches(GRADIENT_PARTS, match, 1).map((raw) => {
      const part = raw.trim();
      let rgb = parseColor(part);
      if (rgb) return () => modifyBackground(rgb);
      const space = part.lastIndexOf(' ');
      rgb = parseColor(part.slice(0, space));
      if (rgb) return () => `${modifyBackground(rgb)} ${part.slice(space + 1)}`;
      const stop = part.match(COLOR_STOP);
      if (stop) {
        rgb = parseColor(stop[3]);
        if (rgb) return () => `${stop[1]}(${stop[2] ? `${stop[2]}, ` : ''}${modifyBackground(rgb)})`;
      }
      return () => part;
    });
    return () => `${typeGradient}(${parts.map((modify) => modify()).join(', ')})${hasComma ? ', ' : ''}`;
  };

  const imageSelectorQueue = new Map();
  let classObserver = null;
  let pendingClassTargets = new Set();
  let classFrameId = null;

  const checkImageSelectors = (node) => {
    for (const [selector, callbacks] of imageSelectorQueue) {
      if (node.querySelector(selector) || (node instanceof Element && node.matches(selector))) {
        imageSelectorQueue.delete(selector);
        callbacks.forEach((callback) => callback());
      }
    }
    if (imageSelectorQueue.size === 0) {
      classObserver?.disconnect();
      classObserver = null;
      return;
    }
    if (classObserver) return;
    classObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => pendingClassTargets.add(mutation.target));
      classFrameId ??= requestAnimationFrame(() => {
        const targets = pendingClassTargets;
        pendingClassTargets = new Set();
        classFrameId = null;
        targets.forEach(checkImageSelectors);
      });
    });
    classObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'], subtree: true });
  };

  const waitForSelector = (selectorText, scope) => {
    const selector = selectorText.replace(WAIT_SELECTOR_STRIP, '').trim();
    if (!selector) return null;
    try {
      if (scope.querySelector(selector)) return null;
    } catch {
      return null;
    }
    return new Promise((resolve) => {
      if (!imageSelectorQueue.has(selector)) imageSelectorQueue.set(selector, []);
      imageSelectorQueue.get(selector).push(resolve);
    });
  };

  const getBgImageValue = (details) => {
    const { isDark, isLight, isTransparent, isLarge, solidColor, width, dataURL } = details;
    if (isLarge && isLight && !isTransparent) return 'none';
    if (isDark && isTransparent && width > 2) return dataURL ? `url("${getInvertedImageURL(details)}")` : null;
    if (isLight && !isTransparent) {
      if (solidColor) return `url("${getSolidColorImageURL(details, modifyBackground(solidColor))}")`;
      return dataURL ? `url("${getInvertedImageURL(details)}")` : null;
    }
    return null;
  };

  const getURLModifier = (urlValue, rule, isCancelled) => {
    const raw = getCSSURLValue(urlValue);
    if (raw.length === 0) return () => 'url(\'\')';
    const sheet = rule.parentStyleSheet;
    const scope = (sheet && getSheetScope(sheet)) ?? document;
    const base = sheet?.href ? getCSSBaseURL(sheet.href) : sheet?.ownerNode?.baseURI || location.href;
    const url = getAbsoluteURL(base, raw);
    return async () => {
      if (rule.selectorText) await waitForSelector(rule.selectorText, scope);
      try {
        const details = await getImageDetails(url);
        if (isCancelled()) return null;
        const value = getBgImageValue(details);
        if (value) return value;
      } catch (error) {
        console.warn('[extenso] dark: image analysis failed', url.slice(0, 128), error);
      }
      return `url("${url}")`;
    };
  };

  const getBgImageModifier = (value, rule, ignoreImageSelectors, isCancelled) => {
    try {
      if (shouldIgnoreImage(rule.selectorText, ignoreImageSelectors)) return value;
      const gradients = parseGradient(value);
      const urls = getMatches(URL_REGEX, value);
      if (urls.length === 0 && gradients.length === 0) return value;

      let searchIndex = 0;
      const urlMatches = urls.map((match) => {
        const index = value.indexOf(match, searchIndex);
        searchIndex = index + match.length;
        return { type: 'url', match, index, offset: 0 };
      });
      const matches = [...gradients, ...urlMatches].sort((a, b) => a.index - b.index);

      const modifiers = [];
      let cursor = 0;
      let prevHasComma = false;
      matches.forEach((match, i) => {
        const { index, offset } = match;
        const prefixStart = cursor;
        const matchEnd = index + match.match.length + offset;
        cursor = matchEnd;
        if (prefixStart !== index) {
          const between = value.slice(prefixStart, index);
          modifiers.push(() => (prevHasComma && between[0] === ',' ? between.slice(1) : between));
        }
        prevHasComma = match.hasComma ?? false;
        modifiers.push(match.type === 'url' ? getURLModifier(match.match, rule, isCancelled) : getGradientModifier(match));
        if (i === matches.length - 1) modifiers.push(() => value.slice(matchEnd));
      });

      return () => {
        const results = modifiers.map((modify) => modify());
        if (results.some((r) => r instanceof Promise)) {
          return Promise.all(results).then((resolved) => (resolved.some((r) => r == null) ? null : resolved.join('')));
        }
        const combined = results.join('');
        return combined.endsWith(', initial') ? combined.slice(0, -9) : combined;
      };
    } catch (error) {
      console.warn('[extenso] dark: unable to parse background', value, error);
      return null;
    }
  };

  const SHADOW_COLORS = /(^|\s)(?!calc)([a-z]+\(.+?\)|#[0-9a-f]+|[a-z]+)(.*?(inset|outset)?($|,))/gi;

  const getShadowModifierWithInfo = (value) => {
    let index = 0;
    let unparsable = 0;
    const colorMatches = getMatches(SHADOW_COLORS, value, 2);
    const modifiers = colorMatches.map((match, i) => {
      const prefixIndex = index;
      const matchIndex = value.indexOf(match, index);
      const matchEnd = matchIndex + match.length;
      index = matchEnd;
      const rgb = parseColor(match);
      if (!rgb) {
        unparsable++;
        return () => value.slice(prefixIndex, matchEnd);
      }
      return () => `${value.slice(prefixIndex, matchIndex)}${modifyBackground(rgb)}${i === colorMatches.length - 1 ? value.slice(matchEnd) : ''}`;
    });
    return () => ({
      matchesLength: colorMatches.length,
      unparsableMatchesLength: unparsable,
      result: modifiers.map((modify) => modify()).join(''),
    });
  };

  const getScrollbarColorModifier = (value) => {
    const match = value.match(/^\s*([a-z]+(\(.*\))?)\s+([a-z]+(\(.*\))?)\s*$/);
    if (!match) return value;
    const thumb = parseColor(match[1]);
    const track = parseColor(match[3]);
    if (!thumb || !track) return null;
    return () => `${modifyForeground(thumb)} ${modifyBackground(track)}`;
  };

  const isColorProperty = (property) => (property.includes('color') && property !== '-webkit-print-color-adjust')
    || property === 'fill'
    || property === 'stroke'
    || property === 'stop-color';

  const getModifiableCSSDeclaration = (property, value, rule, ignoreImageSelectors, isCancelled) => {
    const store = engine.variables.store;
    let modifier = null;
    if (property.startsWith('--')) {
      modifier = store.getModifierForVariable({ varName: property, sourceValue: value, rule, ignoredImageSelectors: ignoreImageSelectors, isCancelled });
    } else if (value.includes('var(')) {
      modifier = store.getModifierForVarDependant(property, value);
    } else if (property === 'color-scheme') {
      modifier = 'dark';
    } else if (property === 'scrollbar-color') {
      modifier = getScrollbarColorModifier(value);
    } else if (isColorProperty(property)) {
      if (property.startsWith('border') && property !== 'border-color' && (value === 'initial' || value === 'currentcolor')) {
        const sideProperty = property.slice(0, -6);
        const sideValue = rule.style.getPropertyValue(sideProperty);
        if (sideValue.startsWith('0px') || sideValue === 'none' || rule.style.getPropertyValue('border-style') === 'none') {
          property = sideProperty;
          modifier = sideValue;
        } else {
          modifier = value;
        }
      } else {
        modifier = getColorModifier(property, value, rule);
      }
    } else if (property === 'background-image' || property === 'list-style-image') {
      modifier = getBgImageModifier(value, rule, ignoreImageSelectors, isCancelled);
    } else if (property.includes('shadow')) {
      const shadow = getShadowModifierWithInfo(value);
      modifier = () => shadow().result;
    } else if (BG_PROPERTIES_TO_COPY.includes(property) && value !== 'initial') {
      modifier = value;
    }
    if (!modifier) return null;
    return { property, value: modifier, important: Boolean(rule.style?.getPropertyPriority(property)), sourceValue: value };
  };

  const WHITE = { r: 255, g: 255, b: 255 };
  const BLACK = { r: 0, g: 0, b: 0 };

  const getUserAgentStyle = (isIFrame) => {
    const lines = [];
    if (!isIFrame) lines.push(`html { background-color: ${modifyBackground(WHITE)} !important; }`);
    lines.push('html, iframe { color-scheme: dark !important; }');
    if (!isIFrame) lines.push(`html, body { background-color: ${modifyBackground(WHITE)}; }`);
    lines.push(
      `html, body { border-color: ${modifyBorder({ r: 76, g: 76, b: 76 })}; color: ${modifyForeground(BLACK)}; }`,
      `a { color: ${modifyForeground({ r: 0, g: 64, b: 255 })}; }`,
      `table { border-color: ${modifyBorder({ r: 128, g: 128, b: 128 })}; }`,
      `mark { color: ${modifyForeground(BLACK)}; }`,
      `::placeholder { color: ${modifyForeground({ r: 169, g: 169, b: 169 })}; }`,
      'input:-webkit-autofill, textarea:-webkit-autofill, select:-webkit-autofill {',
      `  background-color: ${modifyBackground({ r: 250, g: 255, b: 189 })} !important;`,
      `  color: ${modifyForeground(BLACK)} !important;`,
      '}',
    );
    return `@layer {\n${lines.join('\n')}\n}`;
  };

  const getFallbackStyle = (strict) => [
    `html, body, ${strict ? 'body :not(iframe)' : 'body > :not(iframe)'} {`,
    `  background-color: ${modifyBackground(WHITE)} !important;`,
    `  border-color: ${modifyBorder({ r: 64, g: 64, b: 64 })} !important;`,
    `  color: ${modifyForeground(BLACK)} !important;`,
    '}',
  ].join('\n');

  const getInvertStyle = (selectors) => (selectors.length
    ? `${selectors.join(', ')} {\n  filter: invert(100%) hue-rotate(180deg) contrast(90%) !important;\n}`
    : '');

  const getVariablesStyle = () => [
    ':root {',
    `  --darkreader-neutral-background: ${modifyBackground(WHITE)};`,
    `  --darkreader-neutral-text: ${modifyForeground(BLACK)};`,
    `  --darkreader-selection-background: ${modifyBackground({ r: 0, g: 96, b: 212 })};`,
    `  --darkreader-selection-text: ${modifyForeground(WHITE)};`,
    '}',
  ].join('\n');

  const replaceCSSTemplates = (cssText) => cssText.replace(/\${(.+?)}/g, (_, value) => {
    const rgb = parseColor(value);
    if (!rgb) return value;
    return getSRGBLightness(rgb.r, rgb.g, rgb.b) > 0.5 ? modifyBackground(rgb) : modifyForeground(rgb);
  });

  const clearCaches = () => {
    imageSelectorQueue.clear();
    classObserver?.disconnect();
    classObserver = null;
    cancelAnimationFrame(classFrameId);
    classFrameId = null;
    pendingClassTargets = new Set();
  };

  engine.modify = {
    defineSheetScope,
    getModifiableCSSDeclaration,
    getBgImageModifier,
    getShadowModifierWithInfo,
    checkImageSelectors,
    getUserAgentStyle,
    getFallbackStyle,
    getInvertStyle,
    getVariablesStyle,
    replaceCSSTemplates,
    clearCaches,
  };
})();
