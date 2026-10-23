(() => {
  const dark = (globalThis.extenso ??= {}).dark ??= {};
  const engine = (dark.engine ??= {});
  const { EVENTS } = engine.util;
  const { createStyleSheetModifier } = engine.sheetModifier;

  const MARKER = '#__darkreader__adoptedOverride';
  const overrides = new WeakSet();
  const overridesBySource = new WeakMap();

  const isOverride = (sheet) => {
    if (overrides.has(sheet)) return true;
    try {
      return sheet.cssRules[0]?.selectorText?.startsWith(MARKER) ?? false;
    } catch {
      return false;
    }
  };

  const canHaveAdoptedStyleSheets = (node) => Array.isArray(node.adoptedStyleSheets);

  const getSourceSheets = (node) => node.adoptedStyleSheets.filter((sheet) => !isOverride(sheet));

  const createAdoptedStyleSheetOverride = (node) => {
    let cancelled = false;
    const cleaners = [];

    const injectSheet = (sheet, override) => {
      const sheets = [...node.adoptedStyleSheets];
      const overrideIndex = sheets.indexOf(override);
      if (overrideIndex >= 0) sheets.splice(overrideIndex, 1);
      sheets.splice(sheets.indexOf(sheet) + 1, 0, override);
      node.adoptedStyleSheets = sheets;
    };

    const clear = () => {
      const sheets = node.adoptedStyleSheets.filter((sheet) => !overrides.has(sheet));
      if (sheets.length !== node.adoptedStyleSheets.length) node.adoptedStyleSheets = sheets;
    };

    const render = (ignoreImageAnalysis) => {
      clear();
      const sheets = node.adoptedStyleSheets;
      for (let i = sheets.length - 1; i >= 0; i--) {
        const sheet = sheets[i];
        if (isOverride(sheet)) continue;
        engine.modify.defineSheetScope(sheet, node);
        const ready = overridesBySource.get(sheet);
        if (ready) {
          injectSheet(sheet, ready);
          continue;
        }
        const override = new CSSStyleSheet();
        overridesBySource.set(sheet, override);
        const prepareSheet = () => {
          for (let j = override.cssRules.length - 1; j >= 0; j--) override.deleteRule(j);
          override.insertRule(`${MARKER} {}`);
          injectSheet(sheet, override);
          overrides.add(override);
          return override;
        };
        createStyleSheetModifier().modifySheet({
          prepareSheet,
          sourceCSSRules: sheet.cssRules,
          ignoreImageAnalysis,
          force: false,
          isAsyncCancelled: () => cancelled,
        });
      }
    };

    const watch = (callback) => {
      let requested = false;
      const onChange = () => {
        if (requested) return;
        requested = true;
        queueMicrotask(() => {
          requested = false;
          if (cancelled) return;
          const sheets = getSourceSheets(node);
          sheets.forEach((sheet) => overridesBySource.delete(sheet));
          callback(sheets);
        });
      };
      for (const type of [EVENTS.adoptedSheetsChange, EVENTS.adoptedSheetChange, EVENTS.adoptedDeclarationChange]) {
        node.addEventListener(type, onChange);
        cleaners.push(() => node.removeEventListener(type, onChange));
      }
    };

    const destroy = () => {
      cleaners.splice(0).forEach((clean) => clean());
      cancelled = true;
      clear();
    };

    return { render, watch, destroy };
  };

  engine.adopted = { canHaveAdoptedStyleSheets, getSourceSheets, createAdoptedStyleSheetOverride };
})();
