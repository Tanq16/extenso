globalThis.extenso ??= {};
globalThis.extenso.modules ??= {};
globalThis.extenso.modules.dark = {
  label: 'Dark',
  defaults: {
    settings: { enabled: true, sites: {}, ttlDays: 30 },
    state: { hosts: {} },
  },
};
