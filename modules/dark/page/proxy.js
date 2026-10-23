(() => {
  const EVENTS = {
    hello: '__extenso_dark__proxyHello',
    install: '__extenso_dark__proxyInstall',
    cleanUp: '__extenso_dark__proxyCleanUp',
    updateSheet: '__extenso_dark__updateSheet',
    adoptedSheetsChange: '__extenso_dark__adoptedSheetsChange',
    adoptedSheetChange: '__extenso_dark__adoptedSheetChange',
    adoptedDeclarationChange: '__extenso_dark__adoptedDeclarationChange',
    shadowAttaching: '__extenso_dark__shadowAttaching',
    addUndefinedResolver: '__extenso_dark__addUndefinedResolver',
    isDefined: '__extenso_dark__isDefined',
  };
  const OVERRIDE_MARKER = '#__darkreader';

  let cleaners = [];

  const overrideProperty = (cls, prop, factories) => {
    const proto = cls.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, prop);
    if (!original) return;
    const descriptor = { ...original };
    Object.entries(factories).forEach(([key, factory]) => {
      descriptor[key] = factory(original[key]);
    });
    Object.defineProperty(proto, prop, descriptor);
    cleaners.push(() => Object.defineProperty(proto, prop, original));
  };

  const override = (cls, prop, factory) => overrideProperty(cls, prop, { value: factory });

  const listen = (type, listener) => {
    document.addEventListener(type, listener);
    cleaners.push(() => document.removeEventListener(type, listener));
  };

  const isOwnElement = (element) => element?.classList?.contains('darkreader');

  const install = () => {
    if (cleaners.length > 0) return;
    const adoptedSheetOwners = new WeakMap();
    const adoptedDeclarationSheets = new WeakMap();

    const notifyAdoptedOwners = (sheet, type) => {
      const owners = adoptedSheetOwners.get(sheet);
      owners?.forEach((node) => {
        if (node.isConnected) node.dispatchEvent(new CustomEvent(type));
        else owners.delete(node);
      });
    };

    const reportSheetChange = (sheet) => {
      if (sheet.ownerNode && !isOwnElement(sheet.ownerNode)) sheet.ownerNode.dispatchEvent(new CustomEvent(EVENTS.updateSheet));
      notifyAdoptedOwners(sheet, EVENTS.adoptedSheetChange);
    };

    ['addRule', 'insertRule', 'deleteRule', 'removeRule', 'replaceSync'].forEach((method) => {
      override(CSSStyleSheet, method, (native) => function (...args) {
        const result = native.apply(this, args);
        reportSheetChange(this);
        return result;
      });
    });

    override(CSSStyleSheet, 'replace', (native) => function (...args) {
      const result = native.apply(this, args);
      Promise.resolve(result).then(() => reportSheetChange(this), () => {});
      return result;
    });

    override(Element, 'attachShadow', (native) => function (...args) {
      this.dispatchEvent(new CustomEvent(EVENTS.shadowAttaching, { bubbles: true }));
      return native.apply(this, args);
    });

    const resolveCustomElement = (tag) => {
      customElements?.whenDefined(tag).then(() => document.dispatchEvent(new CustomEvent(EVENTS.isDefined, { detail: tag })));
    };

    listen(EVENTS.addUndefinedResolver, (event) => {
      if (typeof event.detail === 'string') resolveCustomElement(event.detail);
    });

    override(CustomElementRegistry, 'define', (native) => function (name, ...rest) {
      resolveCustomElement(name);
      return native.call(this, name, ...rest);
    });

    overrideProperty(Document, 'styleSheets', {
      get: (native) => function () {
        let cache = null;
        let source = null;
        const current = () => {
          const sheets = native.call(this);
          if (cache && source.length === sheets.length && source.every((sheet, i) => sheet === sheets[i])) return cache;
          source = Array.from(sheets);
          const filtered = source.filter((sheet) => sheet.ownerNode && !isOwnElement(sheet.ownerNode));
          filtered.item = (index) => filtered[index];
          cache = Object.setPrototypeOf(filtered, StyleSheetList.prototype);
          return cache;
        };
        return new Proxy(current(), { get: (_, property) => current()[property] });
      },
    });

    const sourceToProxy = new WeakMap();
    const proxyToSource = new WeakMap();
    const snapshots = new WeakMap();
    const isOverrideSheet = (sheet) => {
      try {
        return sheet.cssRules[0]?.selectorText?.startsWith(OVERRIDE_MARKER) ?? false;
      } catch {
        return false;
      }
    };

    const trackOwners = (node, sheets) => sheets.forEach((sheet) => {
      if (!adoptedSheetOwners.has(sheet)) adoptedSheetOwners.set(sheet, new Set());
      adoptedSheetOwners.get(sheet).add(node);
      for (const rule of sheet.cssRules) {
        if (rule.style) adoptedDeclarationSheets.set(rule.style, sheet);
      }
    });

    const ensureTracked = (node, sheets) => {
      if (snapshots.has(node)) return;
      const current = sheets.filter((sheet) => !isOverrideSheet(sheet));
      snapshots.set(node, current);
      trackOwners(node, current);
    };

    const onAdoptedSheetsChange = (node) => {
      const prev = snapshots.get(node);
      const current = (node.adoptedStyleSheets ?? []).filter((sheet) => !isOverrideSheet(sheet));
      snapshots.set(node, current);
      if (prev && prev.length === current.length && prev.every((sheet, i) => sheet === current[i])) return;
      trackOwners(node, current);
      node.dispatchEvent(new CustomEvent(EVENTS.adoptedSheetsChange));
    };

    const proxyArray = (node, source) => {
      if (proxyToSource.has(source)) return source;
      if (sourceToProxy.has(source)) return sourceToProxy.get(source);
      const proxy = new Proxy(source, {
        deleteProperty(target, property) {
          delete target[property];
          return true;
        },
        set(target, property, value) {
          target[property] = value;
          if (property === 'length') onAdoptedSheetsChange(node);
          return true;
        },
      });
      sourceToProxy.set(source, proxy);
      proxyToSource.set(proxy, source);
      return proxy;
    };

    [Document, ShadowRoot].forEach((cls) => {
      overrideProperty(cls, 'adoptedStyleSheets', {
        get: (native) => function () {
          const sheets = native.call(this);
          ensureTracked(this, sheets);
          return proxyArray(this, sheets);
        },
        set: (native) => function (value) {
          native.call(this, proxyToSource.get(value) ?? value);
          onAdoptedSheetsChange(this);
        },
      });
    });

    ['setProperty', 'removeProperty'].forEach((method) => {
      override(CSSStyleDeclaration, method, (native) => function (...args) {
        const result = native.apply(this, args);
        const sheet = adoptedDeclarationSheets.get(this);
        if (sheet) adoptedSheetOwners.get(sheet)?.forEach((node) => node.dispatchEvent(new CustomEvent(EVENTS.adoptedDeclarationChange)));
        return result;
      });
    });

    ensureTracked(document, document.adoptedStyleSheets);
  };

  const cleanUp = () => {
    const pending = cleaners;
    cleaners = [];
    pending.forEach((clean) => clean());
  };

  document.addEventListener(EVENTS.install, install);
  document.addEventListener(EVENTS.cleanUp, cleanUp);
  document.dispatchEvent(new CustomEvent(EVENTS.hello));
})();
