(() => {
  const META = 'meta[name="color-scheme"]';
  const OWN_STYLE = '.darkreader';
  const OWN_ADOPTED = '#__darkreader';
  const CELL_SIZE = 256;
  const MAX_ROW_COUNT = 4;
  const WATCH_DELAY = 250;
  const RGB = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/;

  const colors = new Map();
  let canvas;

  const parseColor = (value) => {
    if (colors.has(value)) return colors.get(value);
    let color = null;
    const match = RGB.exec(value);
    if (match) {
      const [, r, g, b, alpha, percent] = match;
      const a = alpha === undefined ? 1 : Number(alpha) / (percent ? 100 : 1);
      color = { r: Number(r), g: Number(g), b: Number(b), a };
    } else if (value) {
      canvas ??= new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
      canvas.clearRect(0, 0, 1, 1);
      canvas.fillStyle = 'transparent';
      canvas.fillStyle = value;
      canvas.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data;
      color = { r, g, b, a: a / 255 };
    }
    colors.set(value, color);
    return color;
  };

  const lightness = ({ r, g, b }) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const systemIsDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

  const hasBuiltInDarkTheme = () => {
    const rootStyle = getComputedStyle(document.documentElement);
    if (rootStyle.filter.includes('invert(1)') || rootStyle.colorScheme === 'dark') return true;

    const width = innerWidth;
    const height = innerHeight;
    const stepX = Math.floor(width / Math.min(MAX_ROW_COUNT, Math.ceil(width / CELL_SIZE)));
    const stepY = Math.floor(height / Math.min(MAX_ROW_COUNT, Math.ceil(height / CELL_SIZE)));
    const seen = new Set();
    const backdrop = parseColor(rootStyle.backgroundColor)?.a === 0 && document.body ? getComputedStyle(document.body) : rootStyle;

    for (let y = Math.floor(stepY / 2); y < height; y += stepY) {
      for (let x = Math.floor(stepX / 2); x < width; x += stepX) {
        const element = document.elementFromPoint(x, y);
        if (!element || seen.has(element) || element.tagName === 'IMG') continue;
        seen.add(element);
        const style = element === document.documentElement ? backdrop : getComputedStyle(element);
        const background = parseColor(style.backgroundColor);
        if (!background) return false;
        if (background.r === 24 && background.g === 26 && background.b === 27) return false;
        if (background.a === 1) {
          if (lightness(background) > 0.6) return false;
        } else {
          const text = parseColor(style.color);
          if (!text || lightness(text) < 0.4) return false;
        }
      }
    }

    const root = parseColor(rootStyle.backgroundColor);
    const body = document.body ? parseColor(getComputedStyle(document.body).backgroundColor) : { r: 0, g: 0, b: 0, a: 0 };
    if (!root || !body) return false;
    if (root.a === 0 && body.a === 0) {
      const rootText = parseColor(rootStyle.color);
      if (rootText) return lightness(rootText) > 0.5;
    }
    const rootLightness = (1 - root.a) + root.a * lightness(root);
    return (1 - body.a) * rootLightness + body.a * lightness(body) < 0.5;
  };

  const check = () => {
    const meta = document.querySelector(META)?.content.toLowerCase();
    if (meta === 'dark' || meta === 'only dark') return true;
    if (meta === 'light' || meta === 'only light') return false;

    if (
      document.documentElement.classList.contains('dark')
      || document.body?.classList.contains('dark')
      || document.documentElement.dataset.theme?.toLowerCase() === 'dark'
    ) return true;

    const own = [
      ...[...document.styleSheets].filter((sheet) => sheet.ownerNode?.matches?.(OWN_STYLE)),
      ...[...document.adoptedStyleSheets].filter((sheet) => sheet.cssRules[0]?.selectorText?.startsWith(OWN_ADOPTED)),
    ].filter((sheet) => !sheet.disabled);
    own.forEach((sheet) => { sheet.disabled = true; });
    try {
      return hasBuiltInDarkTheme();
    } finally {
      own.forEach((sheet) => { sheet.disabled = false; });
    }
  };

  const loaded = () => document.readyState === 'complete';

  const hintVerdict = (hint) => {
    const target = document.querySelector(hint.target);
    return Boolean(target?.matches(hint.match?.join(', ') || ':not(*)'));
  };

  let cleanup = null;

  const stop = () => {
    cleanup?.();
    cleanup = null;
  };

  const waitFor = (ready, verdict, callback) => {
    if (ready()) {
      callback(verdict());
      return;
    }
    const onChange = () => {
      if (!ready()) return;
      stop();
      callback(verdict());
    };
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { childList: true });
    document.addEventListener('readystatechange', onChange);
    cleanup = () => {
      observer.disconnect();
      document.removeEventListener('readystatechange', onChange);
    };
  };

  const run = (callback, hint) => {
    stop();
    if (hint?.noDarkTheme) {
      callback(false);
      return;
    }
    if (hint?.systemTheme && (systemIsDark() || !hint.target)) {
      callback(systemIsDark());
      return;
    }
    if (hint?.target) {
      waitFor(() => loaded() || hintVerdict(hint), () => hintVerdict(hint), callback);
      return;
    }
    waitFor(loaded, check, callback);
  };

  const watch = (callback, hint) => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    let timer = 0;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(callback, WATCH_DELAY);
    };
    const observer = new MutationObserver(schedule);
    const targets = [document.documentElement, document.body, document.querySelector(META)].filter(Boolean);
    targets.forEach((target) => observer.observe(target, { attributes: true, attributeFilter: ['class', 'data-theme', 'content'] }));
    const hintTarget = hint?.target && document.querySelector(hint.target);
    if (hintTarget) observer.observe(hintTarget, { attributes: true });
    media.addEventListener('change', schedule);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      media.removeEventListener('change', schedule);
    };
  };

  globalThis.extenso ??= {};
  globalThis.extenso.dark ??= {};
  globalThis.extenso.dark.detector = { run, stop, watch };
})();
