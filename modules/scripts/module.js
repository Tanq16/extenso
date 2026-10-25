(() => {
  const ANY = ['<all_urls>'];
  const manual = (id, name, description, world = 'USER_SCRIPT') =>
    ({ id, site: 'Any page', name, description, enabled: true, trigger: 'manual', world, runAt: 'document_idle', matches: ANY });

  const builtins = [
    manual('remove-overlays', 'Remove overlays', 'Hides walls that cover the page, unblurs content, and restores scrolling.'),
    manual('away-mode', 'Away mode', 'Makes the page believe you left it. Run again to turn off.', 'MAIN'),
    manual('stay-present', 'Stay present', 'Makes the page believe you never left it. Run again to turn off.', 'MAIN'),
    manual('enable-copy', 'Enable copy and right-click', 'Stops the page from blocking right-click, copy, paste, and text selection.'),
    manual('remove-sticky', 'Remove sticky elements', 'Removes fixed and sticky headers and bars, and restores scrolling.'),
    manual('show-passwords', 'Show passwords', 'Shows password fields as plain text.'),
    manual('regex-search', 'Regex search', 'Highlights every match of a regular expression on the page. Run again to clear.'),
    manual('copy-markdown', 'Copy as Markdown', 'Copies the selection, or the main content of the page, to the clipboard as Markdown.'),
    manual('snipe-mode', 'Snipe mode', 'Hides the elements you click, or every element matching a CSS selector. Run again to turn off.'),
    {
      id: 'youtube-hide-watched',
      site: 'YouTube',
      name: 'Hide watched videos',
      description: 'Hides videos watched at least 50%, except in history and playlists.',
      enabled: false,
      trigger: 'auto',
      world: 'USER_SCRIPT',
      runAt: 'document_idle',
      matches: ['https://www.youtube.com/*'],
    },
    {
      id: 'google-continuous-scroll',
      site: 'Google Search',
      name: 'Continuous scroll',
      description: 'Loads the next page of results as you near the bottom, instead of showing page numbers.',
      enabled: false,
      trigger: 'auto',
      world: 'USER_SCRIPT',
      runAt: 'document_idle',
      matches: ['https://www.google.com/search*', 'https://www.google.ca/search*'],
    },
  ];

  const builtinsOf = (settings) => builtins.map((script) => ({
    ...script,
    file: `modules/scripts/builtins/${script.id}.js`,
    enabled: settings.builtins[script.id] ?? script.enabled,
  }));

  const scriptsOf = (settings) => [...settings.items, ...builtinsOf(settings)];

  const sourceOf = async (script) => {
    if (!script.file) return script.code;
    const response = await fetch(chrome.runtime.getURL(script.file));
    if (!response.ok) throw new Error(`Could not load ${script.name}.`);
    return response.text();
  };

  globalThis.extenso ??= {};
  globalThis.extenso.modules ??= {};
  globalThis.extenso.modules.scripts = {
    label: 'Scripts',
    defaults: {
      settings: { enabled: true, items: [], builtins: {} },
      state: { synced: false, errors: {} },
    },
    builtinsOf,
    scriptsOf,
    sourceOf,
  };
})();
