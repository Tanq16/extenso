(() => {
  const KEYWORDS = /ad\s*-?\s*block|disable|turn\s*off|whitelist|allow\s*-?\s*list/i;
  const root = document.documentElement;
  const body = document.body;
  const isLayer = (el) => {
    const position = getComputedStyle(el).position;
    return position === 'fixed' || (position === 'absolute' && el.offsetParent === body);
  };
  const covers = (el) => {
    const box = el.getBoundingClientRect();
    return box.width * box.height >= innerWidth * innerHeight / 2;
  };
  const overlays = new Set();
  const grid = [0.3, 0.4, 0.5, 0.6, 0.7];
  for (const x of grid) {
    for (const y of grid) {
      const stack = document.elementsFromPoint(innerWidth * x, innerHeight * y).filter((el) => el !== root && el !== body);
      stack.forEach((el, i) => {
        const overlapsContent = stack.slice(i + 1).some((below) => !below.contains(el));
        if (overlapsContent && isLayer(el) && (covers(el) || KEYWORDS.test(el.textContent))) overlays.add(el);
      });
    }
  }
  const blurred = [...document.querySelectorAll('body, body *')].filter((el) => getComputedStyle(el).filter.includes('blur'));
  const rootLocked = /hidden|clip/.test(getComputedStyle(root).overflowY);
  const bodyStyle = getComputedStyle(body);
  const bodyLocked = /hidden|clip/.test(bodyStyle.overflowY);
  const lockedAt = bodyStyle.position === 'fixed' ? -parseFloat(bodyStyle.top) || 0 : null;

  overlays.forEach((el) => el.style.setProperty('display', 'none', 'important'));
  blurred.forEach((el) => el.style.setProperty('filter', 'none', 'important'));
  document.querySelectorAll('[inert]').forEach((el) => { el.inert = false; });
  if (rootLocked) root.style.setProperty('overflow-y', 'auto', 'important');
  if (bodyLocked) body.style.setProperty('overflow', 'visible', 'important');
  if (lockedAt !== null) {
    body.style.setProperty('position', 'static', 'important');
    scrollTo(0, lockedAt);
  }

  const toast = document.createElement('div');
  toast.textContent = `Hid ${overlays.size} overlays, unblurred ${blurred.length}`;
  toast.style.cssText = 'position:fixed;top:20px;left:20px;z-index:2147483647;padding:8px 16px;border-radius:6px;background:black;color:white;font:bold 14px sans-serif;pointer-events:none';
  root.append(toast);
  setTimeout(() => toast.remove(), 2000);
})();
