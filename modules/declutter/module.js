globalThis.extenso ??= {};
globalThis.extenso.modules ??= {};
globalThis.extenso.modules.declutter = {
  label: 'Declutter',
  defaults: {
    settings: {
      enabled: false,
      rules: [
        {
          id: 'amazon-sponsored',
          name: 'Amazon sponsored results',
          enabled: true,
          matches: ['https://www.amazon.com/s?*', 'https://www.amazon.com/s/*'],
          hide: [
            '.s-result-item.AdHolder',
            '.s-result-item.s-widget:has(.s-widget-sponsored-label-text)',
            '.a-carousel-card:has(.puis-sponsored-label-text)',
          ],
          remove: [],
        },
      ],
    },
    state: {},
  },
  isSelector: (selector) => {
    try {
      document.createDocumentFragment().querySelector(selector);
      return true;
    } catch {
      return false;
    }
  },
};
