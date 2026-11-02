(() => {
  if (window.__copyOff) return window.__copyOff();
  const TARGET = 'data-extenso-copy-target';
  const PICKED = 'data-extenso-copy';
  const HELP = 'Copy mode: click adds an element to the copy, and clicking it again takes it out. Up and Down pick the parent or child. Esc exits.';
  const PRESSES = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'];

  const style = document.createElement('style');
  style.textContent = `
    * { cursor: crosshair !important; }
    iframe, embed, object { pointer-events: none !important; }
    [${PICKED}] { outline: 2px solid limegreen !important; outline-offset: -2px !important; background-color: rgba(50, 205, 50, 0.2) !important; }
    [${TARGET}] { outline: 2px dashed dodgerblue !important; outline-offset: -2px !important; }`;
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:2147483647;max-width:60vw;padding:8px 16px;border-radius:6px;background:black;color:white;font:bold 14px sans-serif;pointer-events:none;white-space:pre-line';
  const say = (message) => { banner.textContent = message ? `${message}\n${HELP}` : HELP; };
  const count = (n) => `${n} element${n === 1 ? '' : 's'}`;

  let hovered = null;
  let target = null;
  const picked = [];

  const pickable = (element) => element && element !== document.documentElement && element !== document.body && element !== banner;
  const aim = (element) => {
    target?.removeAttribute(TARGET);
    target = pickable(element) ? element : null;
    target?.setAttribute(TARGET, '');
  };

  const copy = (text) => {
    let copied = false;
    const onCopy = (event) => {
      event.stopImmediatePropagation();
      event.preventDefault();
      event.clipboardData.setData('text/plain', text);
      copied = true;
    };
    addEventListener('copy', onCopy, true);
    document.execCommand('copy');
    removeEventListener('copy', onCopy, true);
    return copied;
  };

  const toggle = (element) => {
    const index = picked.indexOf(element);
    if (index === -1) picked.push(element);
    else picked.splice(index, 1);
    element.toggleAttribute(PICKED, index === -1);
    const text = picked.map((item) => item.innerText.trim()).filter(Boolean).join('\n\n');
    say(copy(text) ? `Copied ${count(picked.length)}.` : 'Could not copy to the clipboard.');
  };

  const onOver = (event) => {
    hovered = event.target;
    aim(hovered);
  };

  const onPress = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'click' && target) toggle(target);
  };

  const onKey = (event) => {
    const key = event.key?.toLowerCase();
    if (key === 'escape') off();
    else if (key === 'arrowup') aim(pickable(target?.parentElement) ? target.parentElement : target);
    else if (key === 'arrowdown') aim([...target?.children ?? []].find((child) => child.contains(hovered)) ?? target);
    else return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const off = () => {
    aim(null);
    for (const element of picked) element.removeAttribute(PICKED);
    for (const type of PRESSES) removeEventListener(type, onPress, true);
    removeEventListener('mouseover', onOver, true);
    removeEventListener('keydown', onKey, true);
    style.remove();
    banner.remove();
    delete window.__copyOff;
  };

  for (const type of PRESSES) addEventListener(type, onPress, true);
  addEventListener('mouseover', onOver, true);
  addEventListener('keydown', onKey, true);
  document.documentElement.append(style, banner);
  say();
  window.__copyOff = off;
})();
