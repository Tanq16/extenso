(() => {
  if (window.__editOff) return window.__editOff();
  const KEYS = ['keydown', 'keypress', 'keyup'];

  const onKey = (event) => {
    event.stopImmediatePropagation();
    if (event.type !== 'keydown' || event.key !== 'Escape') return;
    event.preventDefault();
    off();
  };

  const off = () => {
    for (const type of KEYS) removeEventListener(type, onKey, true);
    document.designMode = 'off';
    delete window.__editOff;
  };

  for (const type of KEYS) addEventListener(type, onKey, true);
  document.designMode = 'on';
  window.__editOff = off;
})();
