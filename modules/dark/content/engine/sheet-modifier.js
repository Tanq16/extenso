(() => {
  const dark = (globalThis.extenso ??= {}).dark ??= {};
  const engine = (dark.engine ??= {});
  const { createFrameQueue } = engine.util;
  const { iterateCSSRules, iterateCSSDeclarations, isStyleRule, isMediaRule, isSupportsRule, isLayerRule, isContainerRule } = engine.css;

  const asyncQueue = createFrameQueue();
  const UNSUPPORTED_SELECTOR = '.darkreader-unsupported-selector';

  const getContainerQuery = (rule) => (rule.containerName ? `${rule.containerName} ${rule.containerQuery}` : rule.containerQuery);

  const getGroupPrelude = (rule) => {
    if (isStyleRule(rule)) return rule.selectorText;
    if (isMediaRule(rule)) return `@media ${rule.media.mediaText}`;
    if (isSupportsRule(rule)) return `@supports ${rule.conditionText}`;
    if (isLayerRule(rule)) return `@layer ${rule.name}`;
    if (isContainerRule(rule)) return `@container ${getContainerQuery(rule)}`;
    return null;
  };

  const fixSelector = (selector) => {
    // Chrome 119 breaks on deleteRule() for rules with empty :is() or :where() selectors.
    const emptyIsWhere = selector.startsWith(':is(') && (selector.includes(':is()') || selector.includes(':where()') || (selector.includes(':where(') && selector.includes(':-moz')));
    if (emptyIsWhere || selector.includes('::view-transition-')) return UNSUPPORTED_SELECTOR;
    return selector.endsWith('::picker') ? selector.replaceAll('::picker', '::picker(select)') : selector;
  };

  const insertRuleSafe = (target, text, index) => {
    try {
      target.insertRule(text, index);
    } catch {
      target.insertRule(`${UNSUPPORTED_SELECTOR} {}`, index);
    }
  };

  const setRule = (target, index, { selector, declarations }) => {
    const body = declarations
      .filter(({ value }) => value)
      .map(({ property, value, important }) => ` ${property}: ${value}${important ? ' !important' : ''};`)
      .join('');
    insertRuleSafe(target, `${fixSelector(selector)} {${body} }`, index);
  };

  const createStyleSheetModifier = () => {
    let renderId = 0;
    let textCounter = 0;
    const textIds = new Map();
    const rulesTextCache = new Set();
    const rulesModCache = new Map();
    const varTypeChangeCleaners = new Set();
    let hasNonLoadedLink = false;
    let wasRebuilt = false;

    const getTextKey = (text) => {
      let key = textIds.get(text);
      if (key === undefined) {
        key = (++textCounter).toString(36);
        textIds.set(text, key);
      }
      return key;
    };

    const getStyleRuleKey = (rule) => {
      let key = getTextKey(rule.cssText);
      for (let parent = rule.parentRule; parent; parent = parent.parentRule) {
        key = `${getTextKey(getGroupPrelude(parent) ?? parent.constructor.name)}{${key}}`;
      }
      return key;
    };

    const shouldRebuildStyle = () => hasNonLoadedLink && !wasRebuilt;

    const modifySheet = ({ sourceCSSRules, ignoreImageAnalysis, force, prepareSheet, isAsyncCancelled }) => {
      let rulesChanged = rulesModCache.size === 0;
      const notFoundKeys = new Set(rulesModCache.keys());
      if (hasNonLoadedLink) wasRebuilt = true;

      const modRules = [];
      iterateCSSRules(sourceCSSRules, (rule) => {
        const key = getStyleRuleKey(rule);
        notFoundKeys.delete(key);
        if (rulesTextCache.has(key)) {
          modRules.push(rulesModCache.get(key));
          return;
        }
        rulesTextCache.add(key);
        rulesChanged = true;
        if (rule.style.all === 'revert') return;
        const declarations = [];
        iterateCSSDeclarations(rule.style, (property, value) => {
          const mod = engine.modify.getModifiableCSSDeclaration(property, value, rule, ignoreImageAnalysis, isAsyncCancelled);
          if (mod) declarations.push(mod);
        });
        const modRule = declarations.length > 0 ? { selector: rule.selectorText, declarations, parentRule: rule.parentRule } : null;
        if (modRule) modRules.push(modRule);
        rulesModCache.set(key, modRule);
      }, () => {
        hasNonLoadedLink = true;
      });

      notFoundKeys.forEach((key) => {
        rulesTextCache.delete(key);
        rulesModCache.delete(key);
      });

      if (!force && !rulesChanged) return;
      renderId++;
      const currentRenderId = renderId;
      const isStale = () => isAsyncCancelled() || currentRenderId !== renderId;

      const asyncDeclarations = new Map();
      const varDeclarations = new Map();
      let asyncCounter = 0;
      let varCounter = 0;
      const rootGroup = { isGroup: true, rule: null, rules: [] };
      const groupRefs = new WeakMap();

      const getGroup = (rule) => {
        if (rule == null) return rootGroup;
        if (groupRefs.has(rule)) return groupRefs.get(rule);
        const group = { isGroup: true, rule, rules: [] };
        groupRefs.set(rule, group);
        getGroup(rule.parentRule).rules.push(group);
        return group;
      };

      varTypeChangeCleaners.forEach((clean) => clean());
      varTypeChangeCleaners.clear();

      const rebuildRule = (info) => {
        info.target.deleteRule(info.index);
        setRule(info.target, info.index, info.rule);
      };

      modRules.filter(Boolean).forEach(({ selector, declarations, parentRule }) => {
        const readyRule = { isGroup: false, selector, declarations: [] };
        const ready = readyRule.declarations;
        getGroup(parentRule).rules.push(readyRule);

        const handleAsync = (property, promise, important, sourceValue) => {
          const asyncKey = ++asyncCounter;
          const declaration = { property, value: null, important, asyncKey, sourceValue };
          ready.push(declaration);
          promise.then((value) => {
            if (!value || isStale()) return;
            declaration.value = value;
            asyncQueue.add(() => {
              if (isStale() || !asyncDeclarations.has(asyncKey)) return;
              rebuildRule(asyncDeclarations.get(asyncKey));
              asyncDeclarations.delete(asyncKey);
            });
          });
        };

        const handleVar = (modified, important, sourceValue) => {
          const { declarations: varDecs, onTypeChange } = modified;
          const varKey = ++varCounter;
          const initialIndex = ready.length;
          let oldDecs = [];
          if (varDecs.length === 0) {
            const placeholder = { property: `--darkreader-placeholder-${varKey}`, value: 'none', important: false, sourceValue, varKey };
            ready.push(placeholder);
            oldDecs = [placeholder];
          }
          varDecs.forEach((mod) => {
            if (mod.value instanceof Promise) {
              handleAsync(mod.property, mod.value, important, sourceValue);
              return;
            }
            const declaration = { property: mod.property, value: mod.value, important, sourceValue, varKey };
            ready.push(declaration);
            oldDecs.push(declaration);
          });
          onTypeChange.addListener((newDecs) => {
            if (isStale()) return;
            const next = newDecs.map((mod) => ({ property: mod.property, value: mod.value, important, sourceValue, varKey }));
            ready.splice(ready.indexOf(oldDecs[0], initialIndex), oldDecs.length, ...next);
            oldDecs = next;
            if (varDeclarations.has(varKey)) rebuildRule(varDeclarations.get(varKey));
          });
          varTypeChangeCleaners.add(() => onTypeChange.removeListeners());
        };

        declarations.forEach(({ property, value, important, sourceValue }) => {
          if (typeof value !== 'function') {
            ready.push({ property, value, important, sourceValue });
            return;
          }
          const modified = value();
          if (modified instanceof Promise) handleAsync(property, modified, important, sourceValue);
          else if (property.startsWith('--')) handleVar(modified, important, sourceValue);
          else ready.push({ property, value: modified, important, sourceValue });
        });
      });

      const sheet = prepareSheet();

      const createTarget = (group, parent) => {
        const prelude = getGroupPrelude(group.rule);
        if (!prelude) return parent;
        const index = parent.cssRules.length;
        insertRuleSafe(parent, `${prelude} {}`, index);
        return parent.cssRules[index];
      };

      const build = (group, target) => {
        group.rules.forEach((rule) => {
          if (rule.isGroup) {
            build(rule, createTarget(rule, target));
            return;
          }
          const index = target.cssRules.length;
          rule.declarations.forEach(({ asyncKey, varKey }) => {
            if (asyncKey != null) asyncDeclarations.set(asyncKey, { rule, target, index });
            if (varKey != null) varDeclarations.set(varKey, { rule, target, index });
          });
          setRule(target, index, rule);
        });
      };

      build(rootGroup, sheet);
    };

    return { modifySheet, shouldRebuildStyle };
  };

  engine.sheetModifier = { createStyleSheetModifier, cancelAsync: () => asyncQueue.cancel() };
})();
