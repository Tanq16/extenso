const DELIMITER = /^\s*={2,}\s*$/gm;
const COMMAND = /^[A-Z]+(\s[A-Z]+){0,2}$/;
const TEXT_PROPS = new Set(['css', 'target']);
const FLAG_PROPS = new Set(['noDarkTheme', 'systemTheme', 'iframe']);
const DYNAMIC = {
  'INVERT': 'invert',
  'CSS': 'css',
  'IGNORE INLINE STYLE': 'ignoreInlineStyle',
  'IGNORE IMAGE ANALYSIS': 'ignoreImageAnalysis',
  'IGNORE CSS URL': 'ignoreCSSUrl',
};
const INVERSION = { 'INVERT': 'invert', 'NO INVERT': 'noinvert', 'REMOVE BG': 'removebg', 'CSS': 'css' };
const HINTS = {
  'TARGET': 'target',
  'MATCH': 'match',
  'NO DARK THEME': 'noDarkTheme',
  'SYSTEM THEME': 'systemTheme',
  'IFRAME': 'iframe',
};

const parseArray = (text) => text.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);

const prepareURL = (url) => {
  const parsed = URL.parse(url);
  if (!parsed) return null;
  const pathParts = parsed.pathname.split('/').slice(1);
  if (!pathParts.at(-1)) pathParts.pop();
  return { hostParts: parsed.hostname.split('.').reverse(), pathParts, port: parsed.port, protocol: parsed.protocol };
};

const preparePattern = (source) => {
  let pattern = source;
  const exactStart = pattern.startsWith('^');
  const exactEnd = pattern.endsWith('$');
  if (exactStart) pattern = pattern.slice(1);
  if (exactEnd) pattern = pattern.slice(0, -1);

  let protocol = '';
  const protocolIndex = pattern.indexOf('://');
  if (protocolIndex > 0) {
    protocol = pattern.slice(0, protocolIndex + 1);
    pattern = pattern.slice(protocolIndex + 3);
  }

  const slashIndex = pattern.indexOf('/');
  const host = slashIndex < 0 ? pattern : pattern.slice(0, slashIndex);
  let hostName = host;
  const ipV6End = host.startsWith('[') ? host.indexOf(']') : -1;
  const isIPv6 = ipV6End > 0;
  let port = '*';
  const portIndex = host.lastIndexOf(':');
  if (portIndex >= 0 && (!isIPv6 || ipV6End < portIndex)) {
    hostName = host.slice(0, portIndex);
    port = host.slice(portIndex + 1);
  }
  if (isIPv6) hostName = URL.parse(`http://${hostName}`)?.hostname ?? hostName;

  const pathParts = slashIndex < 0 ? [] : pattern.slice(slashIndex + 1).split('/');
  if (pathParts.length && !pathParts.at(-1)) pathParts.pop();
  return { hostParts: hostName.split('.').reverse(), pathParts, port, protocol, exactStart, exactEnd };
};

const matchPrepared = (u, p) => {
  if (
    p.hostParts.length > u.hostParts.length
    || (p.exactStart && p.hostParts.length !== u.hostParts.length)
    || (p.exactEnd && p.pathParts.length !== u.pathParts.length)
    || (p.port !== '*' && p.port !== u.port)
    || (p.protocol && p.protocol !== u.protocol)
  ) return false;

  if (!p.hostParts.every((part, i) => part === '*' || part === u.hostParts[i])) return false;

  if (
    p.hostParts.length >= 2
    && p.hostParts.at(-1) !== '*'
    && (
      p.hostParts.length < u.hostParts.length - 1
      || (p.hostParts.length === u.hostParts.length - 1 && u.hostParts.at(-1) !== 'www')
    )
  ) return false;

  if (p.pathParts.length > u.pathParts.length) return false;
  return p.pathParts.every((part, i) => part === '*' || part === u.pathParts[i]);
};

const patterns = new Map();
const compile = (pattern) => {
  if (!patterns.has(pattern)) {
    const isRegExp = pattern.length > 2 && pattern.startsWith('/') && pattern.endsWith('/');
    let compiled = null;
    if (isRegExp) {
      try {
        compiled = new RegExp(pattern.slice(1, -1));
      } catch {
        compiled = null;
      }
    } else if (pattern) {
      compiled = preparePattern(pattern);
    }
    patterns.set(pattern, compiled);
  }
  return patterns.get(pattern);
};

const isURLInList = (url, list) => {
  const prepared = prepareURL(url);
  return list.some((pattern) => {
    const compiled = compile(pattern);
    if (compiled instanceof RegExp) return compiled.test(url);
    return Boolean(compiled && prepared && matchPrepared(prepared, compiled));
  });
};

const parseValue = (prop, text) => {
  if (TEXT_PROPS.has(prop)) return text.trim();
  if (FLAG_PROPS.has(prop)) return true;
  return parseArray(text);
};

const parseFixes = (text, commands) => text.replace(/\r/g, '').split(DELIMITER).flatMap((block) => {
  const lines = block.split('\n');
  const indices = lines.flatMap((line, i) => (COMMAND.test(line) ? [i] : []));
  if (!indices.length) return [];
  const fix = { url: parseArray(lines.slice(0, indices[0]).join('\n')) };
  indices.forEach((index, i) => {
    const prop = commands[lines[index].trim()];
    if (prop) fix[prop] = parseValue(prop, lines.slice(index + 1, indices[i + 1] ?? lines.length).join('\n'));
  });
  return [fix];
});

const commonFirst = (fixes) => [...fixes.filter((fix) => fix.url[0] === '*'), ...fixes.filter((fix) => fix.url[0] !== '*')];

const read = async (name) => {
  try {
    const response = await fetch(chrome.runtime.getURL(`modules/dark/${name}`));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    console.error(`[extenso] dark could not load ${name}`, error);
    return '';
  }
};

let configs = null;
const load = () => {
  configs ??= Promise.all(
    ['dark-sites.config', 'fixes.config', 'fixes.local.config', 'inversion-fixes.config', 'detector-hints.config'].map(read),
  ).then(([darkSites, upstream, local, inversion, hints]) => ({
    darkSites: parseArray(darkSites),
    dynamic: [...commonFirst(parseFixes(upstream, DYNAMIC)), ...parseFixes(local, DYNAMIC)],
    inversion: parseFixes(inversion, INVERSION),
    hints: parseFixes(hints, HINTS),
  }));
  return configs;
};

const matching = (fixes, url) => fixes.filter((fix) => isURLInList(url, fix.url));

const dynamicFix = (fixes) => {
  const list = (prop) => fixes.flatMap((fix) => fix[prop] ?? []);
  return {
    invert: list('invert'),
    css: fixes.map((fix) => fix.css).filter(Boolean).join('\n'),
    ignoreInlineStyle: list('ignoreInlineStyle'),
    ignoreImageAnalysis: list('ignoreImageAnalysis'),
    ignoreCSSUrl: list('ignoreCSSUrl'),
  };
};

const inversionFix = (fixes) => {
  const common = fixes.find((fix) => fix.url[0] === '*') ?? { url: ['*'] };
  const [site] = fixes.filter((fix) => fix !== common).sort((a, b) => b.url[0].length - a.url[0].length);
  const merged = [common, site].filter(Boolean);
  const list = (prop) => merged.flatMap((fix) => fix[prop] ?? []);
  return {
    invert: list('invert'),
    noinvert: list('noinvert'),
    removebg: list('removebg'),
    css: merged.map((fix) => fix.css).filter(Boolean).join('\n'),
  };
};

export async function lookup(top, frame) {
  const { darkSites, dynamic, inversion, hints } = await load();
  return {
    darkSite: isURLInList(top, darkSites),
    fix: dynamicFix(matching(dynamic, frame)),
    inversion: inversionFix(matching(inversion, frame)),
    hint: hints.find((fix) => isURLInList(frame, fix.url)) ?? null,
  };
}
