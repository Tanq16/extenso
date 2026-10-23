globalThis.extenso ??= {};
globalThis.extenso.modules ??= {};
globalThis.extenso.modules.relay = {
  label: 'Relay',
  defaults: {
    settings: { enabled: true, targets: [] },
    state: { menus: [] },
  },
  payloads: { page: 'Page', selection: 'Selection', link: 'Link' },
};
