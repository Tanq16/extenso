(() => {
  if (window.__snipeOff) return window.__snipeOff();
  const TARGET = 'data-extenso-snipe';
  const HELP = 'Snipe mode: click deletes. Up and Down pick the parent or child. S deletes by CSS selector. Ctrl+Z undoes. Esc exits.';
  const PRESSES = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'];

  const style = document.createElement('style');
  style.textContent = `
    * { cursor: crosshair !important; }
    iframe, embed, object { pointer-events: none !important; }
    [${TARGET}] { outline: 2px solid red !important; outline-offset: -2px !important; background-color: rgba(255, 0, 0, 0.2) !important; }`;
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:2147483647;max-width:60vw;padding:8px 16px;border-radius:6px;background:black;color:white;font:bold 14px sans-serif;pointer-events:none;white-space:pre-line';
  const say = (message) => { banner.textContent = message ? `${message}\n${HELP}` : HELP; };
  const count = (n) => `${n} element${n === 1 ? '' : 's'}`;

  let hovered = null;
  let target = null;
  const batches = [];

  const pickable = (element) => element && element !== document.documentElement && element !== document.body && element !== banner;
  const aim = (element) => {
    target?.removeAttribute(TARGET);
    target = pickable(element) ? element : null;
    target?.setAttribute(TARGET, '');
  };

  const remove = (elements) => {
    aim(null);
    const batch = elements.filter(pickable).map((element) => [element, element.parentNode, element.nextSibling]);
    for (const [element] of batch) element.remove();
    if (batch.length) batches.push(batch);
    return batch.length;
  };

  const undo = () => {
    const batch = batches.pop();
    if (!batch) return say('Nothing to undo.');
    for (const [element, parent, next] of batch.toReversed()) parent.insertBefore(element, next?.parentNode === parent ? next : null);
    say(`Restored ${count(batch.length)}.`);
  };

  const removeBySelector = () => {
    const suggestion = target ? target.localName + [...target.classList].map((name) => `.${CSS.escape(name)}`).join('') : '';
    const selector = prompt('Delete every element matching this CSS selector:', suggestion);
    if (!selector) return;
    try {
      say(`Deleted ${count(remove([...document.querySelectorAll(selector)]))} matching ${selector}.`);
    } catch {
      say(`Invalid selector: ${selector}`);
    }
  };

  const onOver = (event) => {
    hovered = event.target;
    aim(hovered);
  };

  const onPress = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type !== 'click' || !target) return;
    remove([target]);
    say();
  };

  const onKey = (event) => {
    const key = event.key?.toLowerCase();
    const command = event.ctrlKey || event.metaKey;
    if (key === 'escape') off();
    else if (key === 'arrowup') aim(pickable(target?.parentElement) ? target.parentElement : target);
    else if (key === 'arrowdown') aim([...target?.children ?? []].find((child) => child.contains(hovered)) ?? target);
    else if (key === 'z' && command) undo();
    else if (key === 's' && !command && !event.altKey) removeBySelector();
    else return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const off = () => {
    aim(null);
    for (const type of PRESSES) removeEventListener(type, onPress, true);
    removeEventListener('mouseover', onOver, true);
    removeEventListener('keydown', onKey, true);
    style.remove();
    banner.remove();
    delete window.__snipeOff;
  };

  for (const type of PRESSES) addEventListener(type, onPress, true);
  addEventListener('mouseover', onOver, true);
  addEventListener('keydown', onKey, true);
  document.documentElement.append(style, banner);
  say();
  window.__snipeOff = off;
})();
