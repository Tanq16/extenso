(() => {
  const dark = (globalThis.extenso ??= {}).dark ??= {};
  const engine = (dark.engine ??= {});
  const { escapeRegExp, getAbsoluteURL, getParenthesesRange } = engine.util;

  const IGNORED_MEDIA = ['aural', 'braille', 'embossed', 'handheld', 'print', 'projection', 'speech', 'tty', 'tv'];

  const isStyleRule = (rule) => rule instanceof CSSStyleRule;
  const isImportRule = (rule) => rule instanceof CSSImportRule;
  const isMediaRule = (rule) => rule instanceof CSSMediaRule;
  const isSupportsRule = (rule) => rule instanceof CSSSupportsRule;
  const isLayerRule = (rule) => rule instanceof CSSLayerBlockRule;
  const isContainerRule = (rule) => rule instanceof CSSContainerRule;

  const isScreenMedia = (media) => {
    const list = Array.from(media);
    if (list.some((m) => m.startsWith('screen') || m.startsWith('all') || m.startsWith('('))) return true;
    return !list.some((m) => IGNORED_MEDIA.some((ignored) => m.startsWith(ignored)));
  };

  const iterateCSSRules = (rules, iterate, onImportError, importedSheets = new Set()) => {
    for (const rule of rules) {
      if (isStyleRule(rule)) {
        iterate(rule);
        if (rule.cssRules?.length > 0) iterateCSSRules(rule.cssRules, iterate, onImportError, importedSheets);
      } else if (isImportRule(rule)) {
        try {
          const sheet = rule.styleSheet;
          if (sheet && !importedSheets.has(sheet)) {
            importedSheets.add(sheet);
            iterateCSSRules(sheet.cssRules, iterate, onImportError, importedSheets);
          }
        } catch {
          onImportError?.();
        }
      } else if (isMediaRule(rule)) {
        if (isScreenMedia(rule.media)) iterateCSSRules(rule.cssRules, iterate, onImportError, importedSheets);
      } else if (isSupportsRule(rule)) {
        if (CSS.supports(rule.conditionText)) iterateCSSRules(rule.cssRules, iterate, onImportError, importedSheets);
      } else if (isLayerRule(rule) || isContainerRule(rule)) {
        iterateCSSRules(rule.cssRules, iterate, onImportError, importedSheets);
      }
    }
  };

  const SHORTHAND_VAR_PROPERTIES = [
    'background',
    'border',
    'border-color',
    'border-bottom',
    'border-left',
    'border-right',
    'border-top',
    'outline',
    'outline-color',
  ];

  const handleEmptyShorthand = (shorthand, style, iterate) => {
    const rule = style.parentRule;
    if (!isStyleRule(rule)) return;
    const source = rule.parentStyleSheet?.ownerNode?.textContent;
    if (source) {
      const selector = escapeRegExp(rule.selectorText).replace(/\s+/g, '\\s*').replace(/::/g, '::?');
      const match = source.match(new RegExp(`${selector}\\s*{[^}]*${shorthand}:\\s*([^;}]+)`));
      if (match) iterate(shorthand, match[1]);
    } else if (shorthand === 'background') {
      iterate('background-color', '#ffffff');
      iterate('background-image', 'none');
    }
  };

  const iterateCSSDeclarations = (style, iterate) => {
    const { cssText } = style;
    if (cssText.includes('var(')) {
      for (const property of SHORTHAND_VAR_PROPERTIES) {
        const value = style.getPropertyValue(property);
        if (value && value.includes('var(')) iterate(property, value);
      }
    }
    if ((cssText.includes('background-color: ;') || cssText.includes('background-image: ;')) && !style.getPropertyValue('background')) {
      handleEmptyShorthand('background', style, iterate);
    }
    if (cssText.includes('border-') && cssText.includes('-color: ;') && !style.getPropertyValue('border')) {
      handleEmptyShorthand('border', style, iterate);
    }
    for (const property of style) {
      const value = style.getPropertyValue(property).trim();
      if (value) iterate(property, value);
    }
  };

  const URL_REGEX = /url\((('.*?')|(".*?")|([^)]*?))\)/g;
  const IMPORT_REGEX = /@import\s*(?:url\(\s*(?:"[^"]*"|'[^']*'|[^)]*?)\s*\)|"[^"]*"|'[^']*')[^;{}]*;?/gi;
  const COMMENT_REGEX = /\/\*[\s\S]*?\*\//g;
  const FONT_FACE_REGEX = /@font-face\s*{[^}]*}/g;

  const getCSSURLValue = (cssURL) => cssURL
    .trim()
    .replace(/[\n\r\\]+/g, '')
    .replace(/^url\((.*)\)$/, '$1')
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .replace(/^'(.*)'$/, '$1')
    .replace(/\\(.)/g, '$1');

  const removeCSSComments = (cssText) => cssText.replace(COMMENT_REGEX, '');
  const removeFontFaces = (cssText) => cssText.replace(FONT_FACE_REGEX, '');

  const absolutizeURLs = (cssText, base) => cssText.replace(URL_REGEX, (match) => {
    try {
      const url = getAbsoluteURL(base, getCSSURLValue(match));
      return `url('${url.replaceAll('\'', '\\\'')}')`;
    } catch {
      return match;
    }
  });

  const parseImport = (statement) => {
    let rest = statement.trim().replace(/^@import\s*/i, '').replace(/;$/, '').trim();
    let url;
    if (/^url\(/i.test(rest)) {
      const range = getParenthesesRange(rest);
      url = getCSSURLValue(rest.slice(0, range.end));
      rest = rest.slice(range.end).trim();
    } else {
      const end = rest.indexOf(rest[0], 1);
      url = rest.slice(1, end);
      rest = rest.slice(end + 1).trim();
    }
    let layer = null;
    const layerMatch = /^layer(?:\(([^)]*)\))?(?![\w-])/i.exec(rest);
    if (layerMatch) {
      layer = layerMatch[1]?.trim() ?? '';
      rest = rest.slice(layerMatch[0].length).trim();
    }
    let supports = null;
    if (/^supports\(/i.test(rest)) {
      const range = getParenthesesRange(rest);
      supports = rest.slice(range.start + 1, range.end - 1).trim();
      rest = rest.slice(range.end).trim();
    }
    return { url, layer, supports, media: rest };
  };

  const wrapImport = (cssText, { layer, supports, media }) => {
    let wrapped = cssText;
    if (media && media.toLowerCase() !== 'all') wrapped = `@media ${media} {\n${wrapped}\n}`;
    if (supports) wrapped = `@supports ${/^[\w-]+\s*:/.test(supports) ? `(${supports})` : supports} {\n${wrapped}\n}`;
    if (layer != null) wrapped = `@layer${layer ? ` ${layer}` : ''} {\n${wrapped}\n}`;
    return wrapped;
  };

  engine.css = {
    IGNORED_MEDIA,
    URL_REGEX,
    IMPORT_REGEX,
    isStyleRule,
    isMediaRule,
    isSupportsRule,
    isLayerRule,
    isContainerRule,
    iterateCSSRules,
    iterateCSSDeclarations,
    getCSSURLValue,
    removeCSSComments,
    removeFontFaces,
    absolutizeURLs,
    parseImport,
    wrapImport,
  };
})();
