globalThis.extenso ??= {};
globalThis.extenso.modules ??= {};
globalThis.extenso.modules.dark = {
  label: 'Dark',
  modes: { auto: 'Auto', dynamic: 'Always', filter: 'Invert', off: 'Never' },
  defaults: {
    settings: { enabled: true, sites: {}, ttlDays: 30 },
    state: { hosts: {} },
  },
};
