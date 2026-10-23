(() => {
  const PATTERN = /^(\*|https?|file):\/\/(\*|\*\.[^/:*]+|[^/:*]+)?(?::(\*|\d+))?(\/.*)$/;
  const ALL_SCHEMES = ['http', 'https', 'file'];
  const DEFAULT_PORTS = { 'http:': '80', 'https:': '443' };

  const escape = (text) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  const parse = (pattern) => {
    if (pattern === '<all_urls>') return { schemes: ALL_SCHEMES, host: '*', port: '*', path: /^/ };
    const [, scheme, host = '', port = '*', path] = PATTERN.exec(pattern) ?? [];
    if (!scheme || (scheme === 'file') !== (host === '')) return null;
    return {
      schemes: scheme === '*' ? ['http', 'https'] : [scheme],
      host: host.toLowerCase(),
      port,
      path: new RegExp(`^${path.split('*').map(escape).join('.*')}$`),
    };
  };

  const hostMatches = (host, hostname) =>
    host === '*'
    || hostname === host
    || (host.startsWith('*.') && (hostname === host.slice(2) || hostname.endsWith(host.slice(1))));

  const matches = (pattern, url) => {
    const rule = parse(pattern);
    const target = URL.parse(url);
    if (!rule || !target) return false;
    const scheme = target.protocol.slice(0, -1);
    const port = target.port || DEFAULT_PORTS[target.protocol] || '';
    return rule.schemes.includes(scheme)
      && (scheme === 'file' || hostMatches(rule.host, target.hostname))
      && (rule.port === '*' || rule.port === port)
      && rule.path.test(target.pathname + target.search);
  };

  const matchesAny = (patterns, url) => patterns.some((pattern) => matches(pattern, url));
  const isValid = (pattern) => parse(pattern) !== null;

  globalThis.extenso ??= {};
  globalThis.extenso.match = { matches, matchesAny, isValid };
})();
