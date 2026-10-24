(() => {
  const ANY = ['<all_urls>'];
  const YOUTUBE = ['https://www.youtube.com/*'];
  const manual = (id, name, description, world = 'USER_SCRIPT') =>
    ({ id, site: 'Any page', name, description, enabled: true, trigger: 'manual', world, runAt: 'document_idle', matches: ANY });

  const builtins = [
    manual('remove-overlays', 'Remove overlays', 'Hides walls that cover the page, unblurs content, and restores scrolling.'),
    manual('away-mode', 'Away mode', 'Makes the page believe you left it. Run again to turn off.', 'MAIN'),
    manual('stay-present', 'Stay present', 'Makes the page believe you never left it. Run again to turn off.', 'MAIN'),
    manual('click-step-counter', 'Click step counter', 'Clicks a counter such as "Step 3/10" or "4 of 12".'),
    manual('enable-copy', 'Enable copy and right-click', 'Stops the page from blocking right-click, copy, paste, and text selection.'),
    manual('remove-sticky', 'Remove sticky elements', 'Removes fixed and sticky headers and bars, and restores scrolling.'),
    manual('edit-page', 'Edit page', 'Turns page editing on or off.'),
    manual('show-passwords', 'Show passwords', 'Shows password fields as plain text.'),
    manual('media-speed', 'Media speed', 'Asks for a playback speed and applies it to every video and audio element.'),
    {
      id: 'youtube-shorts-to-watch',
      site: 'YouTube',
      name: 'Open Shorts as normal videos',
      description: 'Sends Shorts links to the regular watch page.',
      enabled: false,
      trigger: 'auto',
      world: 'USER_SCRIPT',
      runAt: 'document_start',
      matches: YOUTUBE,
    },
    {
      id: 'youtube-player-defaults',
      site: 'YouTube',
      name: 'Player defaults',
      description: 'Plays at 1.5x and 1080p in theater mode, with autoplay off. Customize to change the values.',
      enabled: false,
      trigger: 'auto',
      world: 'MAIN',
      runAt: 'document_start',
      matches: YOUTUBE,
    },
    {
      id: 'youtube-keep-playing',
      site: 'YouTube',
      name: 'Skip "Are you still watching?"',
      description: 'Keeps YouTube and YouTube Music from pausing to ask.',
      enabled: false,
      trigger: 'auto',
      world: 'USER_SCRIPT',
      runAt: 'document_idle',
      matches: [...YOUTUBE, 'https://music.youtube.com/*'],
    },
    {
      id: 'youtube-hide-watched',
      site: 'YouTube',
      name: 'Hide watched videos',
      description: 'Hides videos watched at least 90%, except in history and playlists.',
      enabled: false,
      trigger: 'auto',
      world: 'USER_SCRIPT',
      runAt: 'document_idle',
      matches: YOUTUBE,
    },
    {
      id: 'reddit-old-design',
      site: 'Reddit',
      name: 'Old Reddit design',
      description: 'Serves the old design on www.reddit.com and sends old.reddit.com links there.',
      enabled: false,
      trigger: 'auto',
      world: 'USER_SCRIPT',
      runAt: 'document_start',
      matches: ['*://*.reddit.com/*'],
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
