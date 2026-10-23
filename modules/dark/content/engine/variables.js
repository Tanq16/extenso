(() => {
  const dark = (globalThis.extenso ??= {}).dark ??= {};
  const engine = (dark.engine ??= {});
  const { getParenthesesRange } = engine.util;
  const { iterateCSSRules, iterateCSSDeclarations } = engine.css;
  const { parseColor, getRGBValues, modifyBackground, modifyForeground, modifyBorder } = engine.color;

  const TYPE_BG_COLOR = 1 << 0;
  const TYPE_TEXT_COLOR = 1 << 1;
  const TYPE_BORDER_COLOR = 1 << 2;
  const TYPE_BG_IMAGE = 1 << 3;
  const ANY_COLOR = TYPE_BG_COLOR | TYPE_TEXT_COLOR | TYPE_BORDER_COLOR;
  const TEXT_COLOR_PROPERTIES = ['color', 'caret-color', '-webkit-text-fill-color', 'fill', 'stroke'];
  const MAX_SUBSTITUTION_LENGTH = 100000;
  const MAX_DEPTH = 1000;

  const isVariable = (property) => property.startsWith('--');
  const isVarDependant = (value) => value.includes('var(');
  const isTextColorProperty = (property) => TEXT_COLOR_PROPERTIES.includes(property);
  const isConstructedColorVar = (value) => /^\s*(rgb|hsl)a?\(/.test(value) || /^(((\d{1,3})|(var\([-_A-Za-z0-9]+\))),?\s*?){3}$/.test(value);

  const wrapBgColor = (name) => `--darkreader-bg${name}`;
  const wrapTextColor = (name) => `--darkreader-text${name}`;
  const wrapBorderColor = (name) => `--darkreader-border${name}`;
  const wrapBgImage = (name) => `--darkreader-bgimg${name}`;

  const getVariablesMatches = (input) => {
    const matches = [];
    let index = 0;
    let start;
    while ((start = input.indexOf('var(', index)) >= 0) {
      const range = getParenthesesRange(input, start + 3);
      if (!range) break;
      matches.push({ start, end: range.end, value: input.slice(start, range.end) });
      index = range.end + 1;
    }
    return matches;
  };

  const replaceVariablesMatches = (input, replacer) => {
    const matches = getVariablesMatches(input);
    if (matches.length === 0) return input;
    let result = input.slice(0, matches[0].start);
    matches.forEach((match, i) => {
      result += replacer(match.value) + input.slice(match.end, i < matches.length - 1 ? matches[i + 1].start : input.length);
    });
    return result;
  };

  const getNameAndFallback = (match) => {
    const comma = match.indexOf(',');
    if (comma < 0) return { name: match.slice(4, -1).trim(), fallback: '' };
    return { name: match.slice(4, comma).trim(), fallback: match.slice(comma + 1, -1).trim() };
  };

  const replaceCSSVariablesNames = (value, nameReplacer, fallbackReplacer, finalFallback) => replaceVariablesMatches(value, (match) => {
    const { name, fallback } = getNameAndFallback(match);
    const newName = nameReplacer(name);
    if (!fallback) return finalFallback ? `var(${newName}, ${finalFallback})` : `var(${newName})`;
    let newFallback = fallback;
    if (isVarDependant(fallback)) newFallback = replaceCSSVariablesNames(fallback, nameReplacer, fallbackReplacer);
    else if (fallbackReplacer) newFallback = fallbackReplacer(fallback);
    return `var(${newName}, ${newFallback})`;
  });

  const getVarFallback = (value) => replaceVariablesMatches(value, (match) => {
    const { fallback } = getNameAndFallback(match);
    if (!fallback) return '';
    return isVarDependant(fallback) ? getVarFallback(fallback) : fallback;
  });

  const iterateVarDependencies = (value, iterator) => {
    replaceCSSVariablesNames(value, (name) => {
      iterator(name);
      return name;
    });
  };

  const isFallbackResolved = (modified) => {
    if (!modified.startsWith('var(') || !modified.endsWith(')')) return false;
    const nested = modified.endsWith('))');
    const commaIndex = modified.lastIndexOf(',', nested ? modified.lastIndexOf('(') : modified.length);
    if (commaIndex < 0 || modified[commaIndex + 1] !== ' ') return false;
    const fallback = modified.slice(commaIndex + 2, -1);
    if (nested) return /^(rgba?|hsla?)\(/.test(fallback) || fallback.startsWith('var(--darkreader-bg--');
    return /^(#[0-9a-f]+)|([a-z]+)$/i.test(fallback);
  };

  const insertVarValues = (source, values, stack = new Set(), cache = new Map(), depth = 0) => {
    if (depth > MAX_DEPTH) return null;
    let unresolved = false;
    const replaced = replaceVariablesMatches(source, (match) => {
      const { name, fallback } = getNameAndFallback(match);
      const value = values.get(name);
      let inserted = null;
      if (value) {
        if (cache.has(name)) {
          inserted = cache.get(name);
        } else if (!stack.has(name)) {
          stack.add(name);
          inserted = isVarDependant(value) ? insertVarValues(value, values, stack, cache, depth + 1) : value;
          stack.delete(name);
          cache.set(name, inserted);
        }
      } else if (fallback) {
        inserted = isVarDependant(fallback) ? insertVarValues(fallback, values, stack, cache, depth + 1) : fallback;
      }
      if (!inserted) unresolved = true;
      return inserted;
    });
    return unresolved || replaced.length > MAX_SUBSTITUTION_LENGTH ? null : replaced;
  };

  const handleRawColorValue = (input, modify) => {
    const raw = getRGBValues(input);
    const color = raw ? `rgb(${raw[0]} ${raw[1]} ${raw[2]}${raw[3] < 1 ? ` / ${raw[3]}` : ''})` : input;
    const rgb = parseColor(color);
    if (!rgb) return color;
    const output = modify(rgb);
    if (!raw) return output;
    const parsed = parseColor(output);
    if (!parsed) return output;
    return parsed.a == null || parsed.a === 1 ? `${parsed.r}, ${parsed.g}, ${parsed.b}` : `${parsed.r}, ${parsed.g}, ${parsed.b}, ${parsed.a}`;
  };

  const tryModifyBgColor = (color) => handleRawColorValue(color, modifyBackground);
  const tryModifyTextColor = (color) => handleRawColorValue(color, modifyForeground);
  const tryModifyBorderColor = (color) => handleRawColorValue(color, modifyBorder);

  class VariablesStore {
    constructor() {
      this.clear();
    }

    clear() {
      this.varTypes = new Map();
      this.rulesQueue = new Set();
      this.inlineStyleQueue = [];
      this.definedVars = new Set();
      this.varRefs = new Map();
      this.unknownColorVars = new Set();
      this.unknownBgVars = new Set();
      this.undefinedVars = new Set();
      this.initialVarTypes = new Map();
      this.changedTypeVars = new Set();
      this.typeChangeSubscriptions = new Map();
      this.unstableVarValues = new Map();
      this.varsChanged = false;
      this.onRootVariableDefined = () => {};
    }

    isVarType(name, type) {
      return (this.varTypes.get(name) & type) > 0;
    }

    addRulesForMatching(rules) {
      this.rulesQueue.add(rules);
    }

    addInlineStyleForMatching(style) {
      this.inlineStyleQueue.push(style);
    }

    matchVariablesAndDependents() {
      if (this.rulesQueue.size === 0 && this.inlineStyleQueue.length === 0) return;
      this.changedTypeVars.clear();
      this.initialVarTypes = new Map(this.varTypes);
      this.varsChanged = false;
      this.collectRootVariables();
      this.collectVariablesAndVarDep();
      this.collectRootVarDependents();
      if (!this.varsChanged) return;

      this.varRefs.forEach((refs, name) => {
        refs.forEach((ref) => {
          if (this.varTypes.has(name)) this.resolveVariableType(ref, this.varTypes.get(name));
        });
      });

      this.unknownColorVars.forEach((name) => {
        if (this.unknownBgVars.has(name)) {
          this.unknownColorVars.delete(name);
          this.unknownBgVars.delete(name);
          this.resolveVariableType(name, TYPE_BG_COLOR);
        } else if (this.isVarType(name, ANY_COLOR)) {
          this.unknownColorVars.delete(name);
        } else {
          this.undefinedVars.add(name);
        }
      });

      this.unknownBgVars.forEach((name) => {
        const hasColor = this.findVarRef(name, (ref) => this.unknownColorVars.has(ref) || this.isVarType(ref, ANY_COLOR)) != null;
        if (hasColor) {
          this.iterateVarRefs(name, (ref) => this.resolveVariableType(ref, TYPE_BG_COLOR));
        } else if (this.isVarType(name, TYPE_BG_COLOR | TYPE_BG_IMAGE)) {
          this.unknownBgVars.delete(name);
        } else {
          this.undefinedVars.add(name);
        }
      });

      this.changedTypeVars.forEach((name) => this.typeChangeSubscriptions.get(name)?.forEach((callback) => callback()));
      this.changedTypeVars.clear();
    }

    getModifierForVariable({ varName, sourceValue, rule, ignoredImageSelectors, isCancelled }) {
      return () => {
        const getDeclarations = () => {
          const declarations = [];
          const addColor = (type, wrap, modify) => {
            if (!this.isVarType(varName, type)) return;
            let value;
            if (!isVarDependant(sourceValue)) {
              value = modify(sourceValue);
            } else if (isConstructedColorVar(sourceValue)) {
              value = modify(insertVarValues(sourceValue, this.unstableVarValues) || (type === TYPE_BG_COLOR ? '#ffffff' : '#000000'));
            } else {
              value = replaceCSSVariablesNames(sourceValue, wrap, modify);
            }
            declarations.push({ property: wrap(varName), value });
          };
          addColor(TYPE_BG_COLOR, wrapBgColor, tryModifyBgColor);
          addColor(TYPE_TEXT_COLOR, wrapTextColor, tryModifyTextColor);
          addColor(TYPE_BORDER_COLOR, wrapBorderColor, tryModifyBorderColor);
          if (this.isVarType(varName, TYPE_BG_IMAGE)) {
            let value = sourceValue;
            if (isVarDependant(sourceValue)) value = replaceCSSVariablesNames(sourceValue, wrapBgColor, tryModifyBgColor);
            const modifier = engine.modify.getBgImageModifier(value, rule, ignoredImageSelectors, isCancelled);
            declarations.push({ property: wrapBgImage(varName), value: typeof modifier === 'function' ? modifier() : modifier ?? value });
          }
          return declarations;
        };

        const callbacks = new Set();
        const addListener = (onTypeChange) => {
          if (!rule.selectorText) return;
          const callback = () => onTypeChange(getDeclarations());
          callbacks.add(callback);
          this.subscribeForVarTypeChange(varName, callback);
        };
        const removeListeners = () => callbacks.forEach((callback) => this.unsubscribeFromVarTypeChange(varName, callback));

        return { declarations: getDeclarations(), onTypeChange: { addListener, removeListeners } };
      };
    }

    getModifierForVarDependant(property, sourceValue) {
      const isConstructedColor = /^\s*(rgb|hsl)a?\(/.test(sourceValue);
      const isSimpleConstructedColor = /^rgba?\(var\(--[-_A-Za-z0-9]+\)(\s*,?\/?\s*0?\.\d+)?\)$/.test(sourceValue);
      if (isConstructedColor && !isSimpleConstructedColor) {
        const isBg = property.startsWith('background');
        const isText = isTextColorProperty(property);
        return () => {
          const value = insertVarValues(sourceValue, this.unstableVarValues) || (isBg ? '#ffffff' : '#000000');
          return (isBg ? tryModifyBgColor : isText ? tryModifyTextColor : tryModifyBorderColor)(value);
        };
      }
      if (property === 'background-color' || (isSimpleConstructedColor && property === 'background')) {
        return () => replaceCSSVariablesNames(sourceValue, wrapBgColor, tryModifyBgColor, tryModifyBgColor(isConstructedColor ? '255, 255, 255' : '#ffffff'));
      }
      if (isTextColorProperty(property)) {
        return () => replaceCSSVariablesNames(sourceValue, wrapTextColor, tryModifyTextColor, tryModifyTextColor(isConstructedColor ? '0, 0, 0' : '#000000'));
      }
      if (property === 'background' || property === 'background-image' || property === 'box-shadow') {
        return () => {
          const unknownVars = new Set();
          const modify = () => {
            const replaced = replaceCSSVariablesNames(sourceValue, (name) => {
              if (this.isVarType(name, TYPE_BG_COLOR)) return wrapBgColor(name);
              if (this.isVarType(name, TYPE_BG_IMAGE)) return wrapBgImage(name);
              unknownVars.add(name);
              return name;
            }, tryModifyBgColor);
            if (property === 'box-shadow') {
              const shadow = engine.modify.getShadowModifierWithInfo(replaced)();
              if (shadow.unparsableMatchesLength !== shadow.matchesLength) return shadow.result;
            }
            return replaced;
          };
          const modified = modify();
          if (unknownVars.size === 0 || isFallbackResolved(modified)) return modified;
          return new Promise((resolve) => {
            for (const name of unknownVars) {
              const callback = () => {
                this.unsubscribeFromVarTypeChange(name, callback);
                resolve(modify());
              };
              this.subscribeForVarTypeChange(name, callback);
            }
          });
        };
      }
      if (property.startsWith('border') || property.startsWith('outline')) {
        return () => replaceCSSVariablesNames(sourceValue, wrapBorderColor, tryModifyBorderColor);
      }
      return null;
    }

    subscribeForVarTypeChange(name, callback) {
      if (!this.typeChangeSubscriptions.has(name)) this.typeChangeSubscriptions.set(name, new Set());
      this.typeChangeSubscriptions.get(name).add(callback);
    }

    unsubscribeFromVarTypeChange(name, callback) {
      this.typeChangeSubscriptions.get(name)?.delete(callback);
    }

    collectVariablesAndVarDep() {
      this.rulesQueue.forEach((rules) => iterateCSSRules(rules, (rule) => {
        if (rule.style) this.collectVarsFromCSSDeclarations(rule.style);
      }));
      this.inlineStyleQueue.forEach((style) => this.collectVarsFromCSSDeclarations(style));
      this.rulesQueue.clear();
      this.inlineStyleQueue = [];
    }

    collectVarsFromCSSDeclarations(style) {
      iterateCSSDeclarations(style, (property, value) => {
        if (isVariable(property)) this.inspectVariable(property, value);
        if (isVarDependant(value)) this.inspectVarDependant(property, value);
      });
    }

    shouldProcessRootVariables() {
      return this.rulesQueue.size > 0 && document.documentElement.getAttribute('style')?.includes('--');
    }

    collectRootVariables() {
      if (!this.shouldProcessRootVariables()) return;
      iterateCSSDeclarations(document.documentElement.style, (property, value) => {
        if (isVariable(property)) this.inspectVariable(property, value);
      });
    }

    collectRootVarDependents() {
      if (!this.shouldProcessRootVariables()) return;
      iterateCSSDeclarations(document.documentElement.style, (property, value) => {
        if (isVarDependant(value)) this.inspectVarDependant(property, value);
      });
    }

    inspectVariable(name, value) {
      this.unstableVarValues.set(name, value);
      const hasVar = isVarDependant(value);
      if (hasVar && isConstructedColorVar(value)) {
        if (!this.unknownColorVars.has(name)) {
          this.unknownColorVars.add(name);
          this.varsChanged = true;
        }
        this.definedVars.add(name);
      }
      if (this.definedVars.has(name)) return;
      this.definedVars.add(name);
      this.varsChanged = true;
      const resolved = hasVar ? getVarFallback(value) : value;
      if (getRGBValues(resolved) || parseColor(resolved) || resolved.includes('light-dark(')) {
        this.unknownColorVars.add(name);
      } else if (resolved.includes('url(') || resolved.includes('linear-gradient(') || resolved.includes('radial-gradient(')) {
        this.resolveVariableType(name, TYPE_BG_IMAGE);
      }
    }

    resolveVariableType(name, type) {
      const initialType = this.initialVarTypes.get(name) || 0;
      const currentType = this.varTypes.get(name) || 0;
      const newType = currentType | type;
      this.varTypes.set(name, newType);
      if (newType !== initialType || this.undefinedVars.has(name)) {
        this.changedTypeVars.add(name);
        this.undefinedVars.delete(name);
      }
      if (newType !== currentType || this.unknownColorVars.has(name) || this.unknownBgVars.has(name)) this.varsChanged = true;
      this.unknownColorVars.delete(name);
      this.unknownBgVars.delete(name);
    }

    inspectVarDependant(property, value) {
      const deps = new Set();
      iterateVarDependencies(value, (name) => deps.add(name));
      if (isVariable(property)) {
        if (!this.varRefs.has(property)) this.varRefs.set(property, new Set());
        const refs = this.varRefs.get(property);
        deps.forEach((ref) => {
          if (refs.has(ref)) return;
          refs.add(ref);
          this.varsChanged = true;
        });
      } else if (property === 'background-color' || property === 'box-shadow') {
        deps.forEach((name) => this.resolveVariableType(name, TYPE_BG_COLOR));
      } else if (isTextColorProperty(property)) {
        deps.forEach((name) => this.resolveVariableType(name, TYPE_TEXT_COLOR));
      } else if (property.startsWith('border') || property.startsWith('outline')) {
        deps.forEach((name) => this.resolveVariableType(name, TYPE_BORDER_COLOR));
      } else if (property === 'background' || property === 'background-image') {
        deps.forEach((name) => {
          if (this.isVarType(name, TYPE_BG_COLOR | TYPE_BG_IMAGE)) return;
          const isBgColor = this.findVarRef(name, (ref) => this.unknownColorVars.has(ref) || this.isVarType(ref, ANY_COLOR)) != null;
          this.iterateVarRefs(name, (ref) => {
            if (isBgColor) {
              this.resolveVariableType(ref, TYPE_BG_COLOR);
            } else if (!this.unknownBgVars.has(ref)) {
              this.unknownBgVars.add(ref);
              this.varsChanged = true;
            }
          });
        });
      }
    }

    findVarRef(name, predicate) {
      const visited = new Set();
      const queue = [name];
      while (queue.length > 0) {
        const current = queue.pop();
        if (visited.has(current)) continue;
        visited.add(current);
        if (predicate(current)) return current;
        this.varRefs.get(current)?.forEach((ref) => queue.push(ref));
      }
      return null;
    }

    iterateVarRefs(name, iterator) {
      this.findVarRef(name, (ref) => {
        iterator(ref);
        return false;
      });
    }

    setOnRootVariableChange(callback) {
      this.onRootVariableDefined = callback;
    }

    getRootVarsText() {
      const declarations = new Map();
      iterateCSSDeclarations(document.documentElement.style, (property, value) => {
        if (!isVariable(property)) return;
        if (this.isVarType(property, TYPE_BG_COLOR)) declarations.set(wrapBgColor(property), tryModifyBgColor(value));
        if (this.isVarType(property, TYPE_TEXT_COLOR)) declarations.set(wrapTextColor(property), tryModifyTextColor(value));
        if (this.isVarType(property, TYPE_BORDER_COLOR)) declarations.set(wrapBorderColor(property), tryModifyBorderColor(value));
        this.subscribeForVarTypeChange(property, this.onRootVariableDefined);
      });
      return `:root {\n${[...declarations].map(([property, value]) => `  ${property}: ${value};`).join('\n')}\n}`;
    }
  }

  engine.variables = { store: new VariablesStore() };
})();
