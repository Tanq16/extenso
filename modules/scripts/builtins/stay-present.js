(() => {
  if (window.__presenceOff) return window.__presenceOff();
  const values = { hidden: false, webkitHidden: false, visibilityState: 'visible', webkitVisibilityState: 'visible' };
  for (const [name, value] of Object.entries(values)) Object.defineProperty(document, name, { get: () => value, configurable: true });
  Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true, writable: true });
  window.dispatchEvent(new FocusEvent('focus'));
  document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  const types = ['blur', 'visibilitychange', 'mouseleave', 'mouseout'];
  const stop = (event) => {
    const leavesPage = event.target === window || event.target === document || event.target === document.documentElement;
    if (leavesPage || (event.type === 'mouseout' && !event.relatedTarget)) event.stopImmediatePropagation();
  };
  types.forEach((type) => window.addEventListener(type, stop, true));
  window.__presenceOff = () => {
    for (const name of [...Object.keys(values), 'hasFocus']) delete document[name];
    types.forEach((type) => window.removeEventListener(type, stop, true));
    delete window.__presenceOff;
    console.log('Presence spoof off');
  };
  console.log('Presence spoof on. Run again to turn off.');
})();
