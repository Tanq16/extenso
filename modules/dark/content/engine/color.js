(() => {
  const dark = (globalThis.extenso ??= {}).dark ??= {};
  const engine = (dark.engine ??= {});
  const { scale, clamp } = engine.util;

  const UNPARSABLE = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer', 'currentcolor', 'none', 'auto']);
  const RGB_MATCH = /^rgba?\([^()]+\)$/;
  const HSL_MATCH = /^hsla?\([^()]+\)$/;
  const HEX_MATCH = /^#[0-9a-f]+$/;

  const getNumbers = (input, range, units) => {
    const numbers = [];
    const parts = input.slice(input.indexOf('(') + 1, -1).trim().split(/[\s,/]+/);
    for (const part of parts) {
      const match = /^([-+]?[\d.]+(?:e[-+]?\d+)?)([a-z%]*)$/.exec(part);
      if (!match) return [];
      const max = range[numbers.length];
      let n = parseFloat(match[1]);
      if (match[2] && units[match[2]] != null) n *= max / units[match[2]];
      numbers.push(max > 1 ? Math.round(n) : n);
    }
    return numbers;
  };

  const parseRGB = (input) => {
    const [r, g, b, a = 1] = getNumbers(input, [255, 255, 255, 1], { '%': 100 });
    return r == null || g == null || b == null ? null : { r, g, b, a };
  };

  const hslToRGB = ({ h, s, l, a = 1 }) => {
    if (s === 0) {
      const v = Math.round(l * 255);
      return { r: v, g: v, b: v, a };
    }
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    const [r, g, b] = (
      h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
    ).map((n) => Math.round((n + m) * 255));
    return { r, g, b, a };
  };

  const parseHSL = (input) => {
    const [h, s, l, a = 1] = getNumbers(input, [360, 1, 1, 1], { '%': 100, deg: 360, rad: 2 * Math.PI, turn: 1 });
    return h == null || s == null || l == null ? null : hslToRGB({ h: ((h % 360) + 360) % 360, s, l, a });
  };

  const parseHex = (hex) => {
    const digits = hex.length - 1;
    const at = (i) => parseInt(hex[i], 16);
    if (digits === 3 || digits === 4) {
      return { r: at(1) * 17, g: at(2) * 17, b: at(3) * 17, a: digits === 4 ? at(4) * 17 / 255 : 1 };
    }
    if (digits === 6 || digits === 8) {
      const pair = (i) => parseInt(hex.slice(i, i + 2), 16);
      return { r: pair(1), g: pair(3), b: pair(5), a: digits === 8 ? pair(7) / 255 : 1 };
    }
    return null;
  };

  let context = null;

  const domParseColor = (color) => {
    if (!context) {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      context = canvas.getContext('2d', { willReadFrequently: true });
    }
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = '#000';
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: Math.round(a / 255 * 100) / 100 };
  };

  const parse = (input) => {
    const c = input.trim().toLowerCase();
    if (!c || UNPARSABLE.has(c) || c.includes('var(') || c.includes('light-dark(') || c.includes('currentcolor')) return null;
    if (c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    if (HEX_MATCH.test(c)) return parseHex(c);
    if (RGB_MATCH.test(c) && !c.startsWith('rgb(#') && !c.startsWith('rgba(#')) return parseRGB(c);
    if (HSL_MATCH.test(c)) return parseHSL(c);
    if (CSS.supports('color', c)) return domParseColor(c);
    return null;
  };

  const parseCache = new Map();

  const parseColor = (input) => {
    const key = input.trim();
    if (parseCache.has(key)) return parseCache.get(key);
    const color = parse(key);
    parseCache.set(key, color);
    return color;
  };

  const getRGBValues = (input) => {
    const parts = input.trim().split(/\s*[,\s/]\s*/);
    if (parts.length < 3 || parts.length > 4) return null;
    const values = [];
    for (const [i, part] of parts.entries()) {
      const match = /^(\d{1,3}(?:\.\d+)?|\.\d+)(%?)$/.exec(part);
      if (!match) return null;
      const n = parseFloat(match[1]);
      values.push(match[2] ? (i < 3 ? Math.round(n * 255 / 100) : n / 100) : n);
    }
    if (values.length === 3) values.push(1);
    return values;
  };

  const getSRGBLightness = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  const toHex = (n) => n.toString(16).padStart(2, '0');

  const rgbToHexString = ({ r, g, b, a }) => `#${[r, g, b].map(toHex).join('')}${a != null && a < 1 ? toHex(Math.round(a * 255)) : ''}`;

  const formatAlpha = (a) => String(Math.round(a * 100) / 100);

  const rgbToString = ({ r, g, b, a }) => (a != null && a < 1 ? `rgba(${r}, ${g}, ${b}, ${formatAlpha(a)})` : `rgb(${r}, ${g}, ${b})`);

  const toLinear = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };

  const fromLinear = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255;

  const rgbToOKLCH = ({ r, g, b }) => {
    const [lr, lg, lb] = [r, g, b].map(toLinear);
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return { l: L, c: Math.hypot(A, B), h: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 };
  };

  const oklchToLinear = ({ l: L, c, h }) => {
    const A = c * Math.cos(h * Math.PI / 180);
    const B = c * Math.sin(h * Math.PI / 180);
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
  };

  const GAMUT_EPSILON = 0.0001;
  const inGamut = (linear) => linear.every((v) => v >= -GAMUT_EPSILON && v <= 1 + GAMUT_EPSILON);

  const oklchToRGB = (lch) => {
    let color = { ...lch, l: clamp(lch.l, 0, 1) };
    if (!inGamut(oklchToLinear(color))) {
      let low = 0;
      let high = color.c;
      for (let i = 0; i < 16; i++) {
        const mid = (low + high) / 2;
        if (inGamut(oklchToLinear({ ...color, c: mid }))) low = mid;
        else high = mid;
      }
      color = { ...color, c: low };
    }
    const [r, g, b] = oklchToLinear(color).map((v) => clamp(Math.round(fromLinear(clamp(v, 0, 1))), 0, 255));
    return { r, g, b };
  };

  const BG_POLE = rgbToOKLCH(parseHex('#181a1b'));
  const FG_POLE = rgbToOKLCH(parseHex('#e8e6e3'));
  const NEUTRAL_CHROMA = 0.04;
  const LIGHTNESS_SPLIT = 0.6;
  const MAX_BG_LIGHTNESS = 0.5;
  const MIN_FG_LIGHTNESS = 0.66;
  const BORDER_DARK_LIGHTNESS = 0.6;
  const BORDER_LIGHT_LIGHTNESS = 0.32;

  const withPole = (lch, pole, l) => (lch.c < NEUTRAL_CHROMA ? { l, c: pole.c, h: pole.h } : { ...lch, l });

  const roles = {
    background: (lch) => withPole(lch, BG_POLE, lch.l < LIGHTNESS_SPLIT
      ? scale(lch.l, 0, LIGHTNESS_SPLIT, 0, MAX_BG_LIGHTNESS)
      : scale(lch.l, LIGHTNESS_SPLIT, 1, MAX_BG_LIGHTNESS, BG_POLE.l)),
    text: (lch) => withPole(lch, FG_POLE, lch.l < LIGHTNESS_SPLIT
      ? scale(lch.l, 0, LIGHTNESS_SPLIT, FG_POLE.l, MIN_FG_LIGHTNESS)
      : scale(lch.l, LIGHTNESS_SPLIT, 1, MIN_FG_LIGHTNESS, FG_POLE.l)),
    border: (lch) => withPole(lch, lch.l < 0.5 ? FG_POLE : BG_POLE, scale(lch.l, 0, 1, BORDER_DARK_LIGHTNESS, BORDER_LIGHT_LIGHTNESS)),
  };

  const modifyCache = new Map();

  const modify = (role, rgb) => {
    const a = rgb.a ?? 1;
    const key = `${role};${rgb.r};${rgb.g};${rgb.b};${a}`;
    let result = modifyCache.get(key);
    if (result) return result;
    const { r, g, b } = oklchToRGB(roles[role](rgbToOKLCH(rgb)));
    result = a < 1 ? rgbToString({ r, g, b, a }) : rgbToHexString({ r, g, b });
    modifyCache.set(key, result);
    return result;
  };

  const modifyBackground = (rgb) => modify('background', rgb);
  const modifyForeground = (rgb) => modify('text', rgb);
  const modifyBorder = (rgb) => modify('border', rgb);

  const clearCaches = () => {
    parseCache.clear();
    modifyCache.clear();
    context = null;
  };

  engine.color = {
    parseColor,
    getRGBValues,
    getSRGBLightness,
    modifyBackground,
    modifyForeground,
    modifyBorder,
    clearCaches,
  };
})();
