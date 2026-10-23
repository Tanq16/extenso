(() => {
  const ID = 'extenso-dark-filter';
  const FILTER = 'invert(100%) hue-rotate(180deg)';
  const FULLSCREEN = [':-webkit-full-screen', ':fullscreen'];

  const rule = (selectors, declarations) => (selectors.length
    ? [`${selectors.map((selector) => selector.replace(/,$/, '')).join(',\n')} {`, ...declarations.map((line) => `  ${line}`), '}']
    : []);

  const stylesheet = (fix, isTop) => [
    '@media screen {',
    ...(isTop ? rule(['html'], [`-webkit-filter: ${FILTER} !important;`, `filter: ${FILTER} !important;`]) : []),
    ...rule(fix.invert, [`-webkit-filter: ${FILTER} !important;`, `filter: ${FILTER} !important;`]),
    ...rule(fix.noinvert, ['-webkit-filter: none !important;', 'filter: none !important;']),
    ...rule(fix.removebg, ['background: white !important;']),
    ...FULLSCREEN.flatMap((selector) => rule([`${selector}, ${selector} *`], ['-webkit-filter: none !important;', 'filter: none !important;'])),
    ...(isTop ? rule(['html'], ['background: rgb(255,255,255) !important;']) : []),
    fix.css,
    '}',
  ].join('\n');

  const start = (fix, isTop) => {
    const style = document.getElementById(ID) ?? document.createElement('style');
    style.id = ID;
    style.textContent = stylesheet(fix, isTop);
    (document.head ?? document.documentElement).append(style);
    if (!document.head) {
      document.addEventListener('DOMContentLoaded', () => style.isConnected && document.head?.append(style), { once: true });
    }
  };

  const stop = () => document.getElementById(ID)?.remove();

  globalThis.extenso ??= {};
  globalThis.extenso.dark ??= {};
  globalThis.extenso.dark.filter = { start, stop };
})();
