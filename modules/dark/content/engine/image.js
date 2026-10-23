(() => {
  const dark = (globalThis.extenso ??= {}).dark ??= {};
  const engine = (dark.engine ??= {});
  const { createFrameQueue } = engine.util;
  const { getSRGBLightness } = engine.color;

  const ANALYSIS_SIZE = 32;
  const LARGE_IMAGE_PIXELS = 512 * 512;
  const TRANSPARENT_ALPHA = 0.05;
  const DARK_PIXEL = 0.4;
  const LIGHT_PIXEL = 0.7;
  const DARK_IMAGE = 0.7;
  const LIGHT_IMAGE = 0.7;
  const TRANSPARENT_IMAGE = 0.1;
  const SOLID_LIGHTNESS_DIFF = 0.1;
  const INVERT_MATRIX = '0.333 -0.667 -0.667 0.000 1.000 -0.667 0.333 -0.667 0.000 1.000 -0.667 -0.667 0.333 0.000 1.000 0.000 0.000 0.000 1.000 0.000';

  const queue = createFrameQueue();
  const detailsCache = new Map();
  let context = null;

  const dataURLToBlob = async (dataURL) => {
    const comma = dataURL.indexOf(',');
    const header = dataURL.slice(5, comma).split(';');
    if (header[1]?.toLowerCase() !== 'base64' || !header[0]) return (await fetch(dataURL)).blob();
    let content = dataURL.slice(comma + 1);
    if (content.includes('%')) content = decodeURIComponent(content);
    const characters = atob(content);
    const bytes = new Uint8Array(characters.length);
    for (let i = 0; i < characters.length; i++) bytes[i] = characters.charCodeAt(i);
    return new Blob([bytes], { type: header[0] });
  };

  const toSVGDataURL = (svg) => {
    if (!/[^\x00-\xff]/.test(svg)) return `data:image/svg+xml;base64,${btoa(svg)}`;
    let binary = '';
    for (const byte of new TextEncoder().encode(svg)) binary += String.fromCharCode(byte);
    return `data:image/svg+xml;base64,${btoa(binary)}`;
  };

  const loadImage = (url) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image ${url.slice(0, 64)}`));
    image.src = url;
  });

  const sizeSVG = (dataURL) => {
    const comma = dataURL.indexOf(',');
    let text = dataURL.slice(comma + 1);
    const encoding = dataURL.slice(0, comma).split(';')[1];
    if (encoding === 'base64') text = atob(text.includes('%') ? decodeURIComponent(text) : text);
    else if (/^%3c/i.test(text)) text = decodeURIComponent(text);
    if (!text.startsWith('<svg ')) return { dataURL, useViewBox: false };
    const opening = text.slice(0, text.indexOf('>') + 1).toLowerCase();
    if (!opening.includes('viewbox=') || opening.includes('width=') || opening.includes('height=')) return { dataURL, useViewBox: false };
    const index = opening.indexOf('viewbox=');
    const quote = opening[index + 8];
    const viewBox = opening.slice(index + 9, opening.indexOf(quote, index + 9)).split(/[\s,]+/).map(parseFloat);
    if (viewBox.length !== 4 || viewBox.some(Number.isNaN)) return { dataURL, useViewBox: true };
    const svg = `<svg width="${viewBox[2] - viewBox[0]}" height="${viewBox[3] - viewBox[1]}" ${text.slice(5)}`;
    return { dataURL: toSVGDataURL(svg), useViewBox: true };
  };

  const analyzeImage = (image) => {
    const sw = image.naturalWidth ?? image.width;
    const sh = image.naturalHeight ?? image.height;
    if (sw === 0 || sh === 0) return { isDark: false, isLight: false, isTransparent: false, isLarge: false, solidColor: null };
    if (!context) {
      const canvas = document.createElement('canvas');
      canvas.width = ANALYSIS_SIZE;
      canvas.height = ANALYSIS_SIZE;
      context = canvas.getContext('2d', { willReadFrequently: true });
      context.imageSmoothingEnabled = false;
    }
    const k = Math.min(1, Math.sqrt(ANALYSIS_SIZE * ANALYSIS_SIZE / (sw * sh)));
    const width = Math.ceil(sw * k);
    const height = Math.ceil(sh * k);
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, sw, sh, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;

    let transparent = 0;
    let darkPixels = 0;
    let lightPixels = 0;
    let minLightness = 1;
    let maxLightness = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumA = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      sumR += r;
      sumG += g;
      sumB += b;
      sumA += a;
      if (a / 255 < TRANSPARENT_ALPHA) {
        transparent++;
        continue;
      }
      const l = getSRGBLightness(r, g, b);
      if (l < DARK_PIXEL) darkPixels++;
      if (l > LIGHT_PIXEL) lightPixels++;
      minLightness = Math.min(minLightness, l);
      maxLightness = Math.max(maxLightness, l);
    }
    const total = width * height;
    const opaque = total - transparent;
    const isSolid = sumA === total * 255 && maxLightness - minLightness < SOLID_LIGHTNESS_DIFF;
    return {
      isDark: darkPixels / opaque >= DARK_IMAGE,
      isLight: lightPixels / opaque >= LIGHT_IMAGE,
      isTransparent: transparent / total >= TRANSPARENT_IMAGE,
      isLarge: sw * sh > LARGE_IMAGE_PIXELS,
      solidColor: isSolid ? { r: Math.round(sumR / opaque), g: Math.round(sumG / opaque), b: Math.round(sumB / opaque), a: 1 } : null,
    };
  };

  const analyze = async (url) => {
    const sourceDataURL = await engine.network.loadDataURL(url);
    let image;
    let dataURL = sourceDataURL;
    let useViewBox = false;
    if (sourceDataURL.startsWith('data:image/svg+xml')) {
      ({ dataURL, useViewBox } = sizeSVG(sourceDataURL));
      image = await loadImage(dataURL);
    } else {
      const blob = await dataURLToBlob(sourceDataURL);
      image = await createImageBitmap(blob).catch(() => loadImage(sourceDataURL));
    }
    return new Promise((resolve) => queue.add(() => {
      const analysis = analyzeImage(image);
      resolve({
        src: url,
        dataURL: analysis.isLarge ? '' : dataURL,
        width: image.naturalWidth ?? image.width,
        height: image.naturalHeight ?? image.height,
        useViewBox,
        ...analysis,
      });
    }));
  };

  const getImageDetails = (url) => {
    let promise = detailsCache.get(url);
    if (!promise) {
      promise = analyze(url);
      detailsCache.set(url, promise);
    }
    return promise;
  };

  const escapeXML = (text) => text.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '\'': '&apos;', '"': '&quot;' })[c]);

  const sizeAttributes = ({ width, height, useViewBox }) => (useViewBox ? `viewBox="0 0 ${width} ${height}"` : `width="${width}" height="${height}"`);

  const getInvertedImageURL = (details) => toSVGDataURL([
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${sizeAttributes(details)}>`,
    '<defs><filter id="darkreader-image-filter">',
    `<feColorMatrix type="matrix" values="${INVERT_MATRIX}" />`,
    '</filter></defs>',
    `<image width="${details.width}" height="${details.height}" filter="url(#darkreader-image-filter)" xlink:href="${escapeXML(details.dataURL)}" />`,
    '</svg>',
  ].join(''));

  const getSolidColorImageURL = (details, color) => toSVGDataURL([
    `<svg xmlns="http://www.w3.org/2000/svg" ${sizeAttributes(details)}>`,
    `<rect width="100%" height="100%" fill="${escapeXML(color)}" />`,
    '</svg>',
  ].join(''));

  const clearCaches = () => {
    queue.cancel();
    detailsCache.clear();
    context = null;
  };

  engine.image = { getImageDetails, getInvertedImageURL, getSolidColorImageURL, clearCaches };
})();
