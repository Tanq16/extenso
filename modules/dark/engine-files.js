const ENGINE = 'modules/dark/content/engine';

export const isolated = [
  'util',
  'dom',
  'color',
  'css',
  'network',
  'image',
  'variables',
  'modify',
  'sheet-modifier',
  'style-manager',
  'adopted',
  'inline',
  'watch',
  'index',
].map((name) => `${ENGINE}/${name}.js`);

export const main = ['modules/dark/page/proxy.js'];
