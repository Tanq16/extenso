(() => {
  if (window.__awayOff) return window.__awayOff();
  const values = { hidden: true, webkitHidden: true, visibilityState: 'hidden', webkitVisibilityState: 'hidden' };
  for (const [name, value] of Object.entries(values)) Object.defineProperty(document, name, { get: () => value, configurable: true });
  Object.defineProperty(document, 'hasFocus', { value: () => false, configurable: true, writable: true });
  document.activeElement?.blur();
  window.dispatchEvent(new FocusEvent('blur'));
  document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  const stop = (event) => {
    if (event.target === window || event.target === document) event.stopImmediatePropagation();
  };
  window.addEventListener('focus', stop, true);
  window.addEventListener('visibilitychange', stop, true);
  window.__awayOff = () => {
    for (const name of [...Object.keys(values), 'hasFocus']) delete document[name];
    window.removeEventListener('focus', stop, true);
    window.removeEventListener('visibilitychange', stop, true);
    delete window.__awayOff;
    window.dispatchEvent(new FocusEvent('focus'));
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    console.log('Away state off');
  };
  console.log('Away state on. Run again to turn off.');
})();
