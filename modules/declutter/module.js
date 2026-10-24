(() => {
  const google = ['https://www.google.com/search*', 'https://www.google.ca/search*'];
  const googleColumns = (scope) => `  ${scope} { grid-template-columns: minmax(0, 260px) minmax(0, 1fr) auto !important; padding-right: 44px; }
  ${scope} > #center_col { grid-column: 2 !important; max-width: none !important; }
  ${scope} #rso { columns: 620px; column-gap: 64px; }
  ${scope} #rso :is(.MjjYud, .ULSxyf, .SLPe5b) { break-inside: avoid; }`;
  const builtins = [
    {
      id: 'amazon-sponsored',
      site: 'Amazon',
      name: 'Sponsored results',
      enabled: true,
      matches: [
        'https://www.amazon.com/s?*',
        'https://www.amazon.com/s/*',
        'https://www.amazon.ca/s?*',
        'https://www.amazon.ca/s/*',
      ],
      hide: [
        '.s-result-item.AdHolder',
        '.s-result-item:has(.puis-sponsored-label-text)',
        '.s-result-item.s-widget:has(.s-widget-sponsored-label-text)',
        '.a-carousel-card:has(.puis-sponsored-label-text)',
      ],
      remove: [],
    },
    {
      id: 'google-sponsored',
      site: 'Google Search',
      name: 'Sponsored results',
      enabled: false,
      matches: google,
      hide: [
        '#tads',
        '#bottomads',
      ],
      remove: [],
    },
    {
      id: 'google-ai-overview',
      site: 'Google Search',
      name: 'AI Overview',
      enabled: false,
      matches: google,
      hide: ['.M8OgIe'],
      remove: [],
    },
    {
      id: 'google-people-also-ask',
      site: 'Google Search',
      name: 'People also ask',
      enabled: false,
      matches: google,
      hide: [
        'div.MjjYud:has(.related-question-pair)',
        'div[data-initq]',
      ],
      remove: [],
    },
    {
      id: 'google-two-columns',
      site: 'Google Search',
      name: 'Results in columns on wide screens',
      enabled: false,
      matches: google,
      hide: [],
      remove: [],
      move: [{ selector: ':is(.SLPe5b, #rso .ULSxyf):has(#eKIzJc)', to: '#rso' }],
      css: `@media (min-width: 1648px) {
${googleColumns('#rcnt:not(:has(#rhs)):has(#rso .MjjYud ~ .MjjYud)')}
}
@media (min-width: 2064px) {
${googleColumns('#rcnt:has(#rhs):has(#rso .MjjYud ~ .MjjYud)')}
  #rcnt:has(#rso .MjjYud ~ .MjjYud) > #rhs { grid-column: 3 !important; width: 372px; margin-left: 44px; }
}`,
    },
    {
      id: 'reddit-promoted',
      site: 'Reddit',
      name: 'Promoted posts and sidebar ads',
      enabled: false,
      matches: ['https://www.reddit.com/*'],
      hide: [
        'shreddit-ad-post',
        'shreddit-ad-post + hr',
        'shreddit-sidebar-ad',
        'shreddit-comments-page-ad',
        'shreddit-comment-tree-ad',
      ],
      remove: [],
    },
    {
      id: 'reddit-community-suggestions',
      site: 'Reddit',
      name: 'Popular / Discover communities sidebar box',
      enabled: false,
      matches: ['https://www.reddit.com/*'],
      hide: [
        'aside:has(> div > #popular-communities-list)',
        '#right-sidebar-contents aside:has(> ul > li > community-card)',
      ],
      remove: [],
    },
    {
      id: 'reddit-recent-posts',
      site: 'Reddit',
      name: 'Recent posts sidebar box',
      enabled: false,
      matches: ['https://www.reddit.com/*'],
      hide: [
        'recent-posts',
        '[recent-post-ids]',
      ],
      remove: [],
    },
    {
      id: 'reddit-post-related',
      site: 'Reddit',
      name: 'Related posts in the post page sidebar',
      enabled: false,
      matches: ['https://www.reddit.com/*'],
      hide: ['aside:has(> pdp-right-rail)'],
      remove: [],
    },
    {
      id: 'reddit-answers',
      site: 'Reddit',
      name: 'Reddit Answers suggestions on post pages',
      enabled: false,
      matches: ['https://www.reddit.com/*'],
      hide: ['#answers-suggested-queries-pdp'],
      remove: [],
    },
    {
      id: 'reddit-games-nav',
      site: 'Reddit',
      name: 'Games entry in the left sidebar',
      enabled: false,
      matches: ['https://www.reddit.com/*'],
      hide: [
        'faceplate-tracker[noun="games_drawer"]',
        'faceplate-tracker[noun="games_drawer"] + hr',
      ],
      remove: [],
    },
    {
      id: 'reddit-left-sidebar',
      site: 'Reddit',
      name: 'Entire left sidebar',
      enabled: false,
      matches: ['https://www.reddit.com/*'],
      hide: ['#left-sidebar-container'],
      remove: [],
    },
    {
      id: 'reddit-nags',
      site: 'Reddit',
      name: 'Sign-up, app and advertise nags',
      enabled: false,
      matches: ['https://www.reddit.com/*'],
      hide: [
        'faceplate-tracker[noun="static_left_rail_banner"]',
        '#credential_picker_container',
        'span[data-part="get-app-btn"]',
        'advertise-button',
        '[data-part="advertise"]',
      ],
      remove: [],
    },
    {
      id: 'old-reddit-promos',
      site: 'Old Reddit',
      name: 'Promoted links and banners',
      enabled: false,
      matches: ['https://old.reddit.com/*'],
      hide: [
        '.promotedlink:not([style^="height: 1px;"])',
        '.native-ad-container',
        '.premium-banner-outer',
        '.listingsignupbar',
      ],
      remove: [],
    },
    {
      id: 'x-promoted',
      site: 'X',
      name: 'Promoted posts, trends and accounts',
      enabled: false,
      matches: ['https://x.com/*'],
      hide: [
        'div[data-testid="cellInnerDiv"] > div > div[class] > div[class][data-testid="placementTracking"]',
        'div[data-testid="placementTracking"]:has(div[data-testid$="-impression-pixel"])',
        'article[data-testid="tweet"]:has(path[d$="10H8.996V8h7v7z"])',
        'div[data-testid="trend"]:has(path[d$="10H8.996V8h7v7z"])',
        'div[data-testid="UserCell"]:has(path[d$="10H8.996V8h7v7z"])',
      ],
      remove: [],
    },
    {
      id: 'x-who-to-follow',
      site: 'X',
      name: 'Who to follow / You might like boxes',
      enabled: false,
      matches: ['https://x.com/*'],
      hide: [
        'div:has(> [aria-label="Who to follow" i])',
        'div[data-testid="primaryColumn"] aside[role="complementary"]',
      ],
      remove: [],
    },
    {
      id: 'x-trends',
      site: 'X',
      name: 'What\'s happening / trends sidebar box',
      enabled: false,
      matches: ['https://x.com/*'],
      hide: ['div[data-testid="sidebarColumn"] div:has(> section [data-testid="trend"])'],
      remove: [],
    },
    {
      id: 'x-todays-news',
      site: 'X',
      name: 'Today\'s News sidebar box',
      enabled: false,
      matches: ['https://x.com/*'],
      hide: ['div[data-testid="sidebarColumn"] div:has(> [data-testid="news_sidebar"])'],
      remove: [],
    },
    {
      id: 'x-premium-upsells',
      site: 'X',
      name: 'Premium and verification upsells',
      enabled: false,
      matches: ['https://x.com/*'],
      hide: [
        'header nav a:is([href^="/i/premium"], [href^="/i/verified"])',
        '[data-testid="HoverCard"] a[href^="/i/premium"]',
        '[role="menu"] a[href^="/i/premium_sign_up"]',
        '[role="menuitem"][data-testid="highlightUpsell"]',
        '[role="menuitem"][data-testid="editWithPremium"]',
        '[data-testid="verified_profile_upsell"]',
        '[data-testid="verified_profile_visitor_upsell"]',
        '[data-testid="profileAnalyticsUpsell"]',
        'div[data-testid="inlinePrompt"]:has(> div > a[href^="/i/premium_sign_up"])',
        'div[data-testid="sidebarColumn"] > div > div > div > div > div > div:has(aside[role="complementary"] a[href^="/i/premium_sign_up"])',
        'div[data-testid="sidebarColumn"] > div > div > div > div > div > div:has(> div > div[data-testid="super-upsell-UpsellCardRenderProperties"])',
      ],
      remove: [],
    },
    {
      id: 'x-grok',
      site: 'X',
      name: 'Grok entry points',
      enabled: false,
      matches: ['https://x.com/*'],
      hide: [
        'header nav a[href$="/i/grok"]',
        'div[data-testid="GrokDrawer"]',
        '[role="menu"] a[href="/i/grok"]',
        'button[aria-label="Grok actions"]',
        'button[aria-label="Profile Summary"]',
        'button[data-testid="grokImgGen"]',
        '[data-testid="tweet"] [data-testid^="followups_"]',
        '[data-testid="tweet"] [data-testid^="followups_"] + nav',
        '[data-testid="tweet"] a[href="/i/grok"]',
        'div[data-testid="primaryColumn"] > div > div:has(> [data-testid="followups_search"])',
        'div[data-testid="sidebarColumn"] > div > div > div > div > div > div:has(> aside[role="complementary"] > a[href^="https://grok.com/imagine"])',
      ],
      remove: [],
    },
    {
      id: 'x-app-qr-nag',
      site: 'X',
      name: '"Scan to get the app" QR card (logged out)',
      enabled: false,
      matches: ['https://x.com/*'],
      hide: ['button.bg-modal:has(> span.text-secondary + img[width="160"][height="160"])'],
      remove: [],
    },
    {
      id: 'youtube-watched',
      site: 'YouTube',
      name: 'Watched videos',
      enabled: false,
      matches: ['https://www.youtube.com/*'],
      hide: [
        'ytd-browse:not([page-subtype="history"]) :is(ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer):has(.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment)',
        ':is(ytd-search, ytd-watch-next-secondary-results-renderer) :is(ytd-video-renderer, yt-lockup-view-model):has(.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment)',
      ],
      remove: [],
    },
    {
      id: 'youtube-shorts-feed',
      site: 'YouTube',
      name: 'Shorts in feeds, search and sidebar',
      enabled: false,
      matches: ['https://www.youtube.com/*'],
      hide: [
        'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
        'ytd-reel-shelf-renderer',
        'grid-shelf-view-model:has(ytm-shorts-lockup-view-model)',
        'ytd-rich-item-renderer:has(ytm-shorts-lockup-view-model)',
        ':is(ytd-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model):has(a[href^="/shorts/"])',
      ],
      remove: [],
    },
    {
      id: 'youtube-shorts-nav',
      site: 'YouTube',
      name: 'Shorts sidebar entry and channel tab',
      enabled: false,
      matches: ['https://www.youtube.com/*'],
      hide: [
        'ytd-guide-entry-renderer:has(a[title="Shorts"])',
        'ytd-mini-guide-entry-renderer:has(a[href^="/shorts"])',
        'yt-tab-shape[tab-title="Shorts"]',
      ],
      remove: [],
    },
    {
      id: 'youtube-playables',
      site: 'YouTube',
      name: 'Playables',
      enabled: false,
      matches: ['https://www.youtube.com/*'],
      hide: [
        'ytd-rich-section-renderer:has(ytd-mini-game-card-view-model)',
        'ytd-rich-item-renderer:has(ytd-mini-game-card-view-model)',
        'ytd-rich-shelf-renderer:has(a[href="/playables"])',
        'ytd-guide-entry-renderer:has(a[href="/playables"])',
      ],
      remove: [],
    },
    {
      id: 'youtube-explore',
      site: 'YouTube',
      name: 'Explore sidebar section and "Explore more topics" shelf',
      enabled: false,
      matches: ['https://www.youtube.com/*'],
      hide: [
        'ytd-guide-section-renderer:has(a[href="/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ"])',
        'ytd-rich-section-renderer:has(ytd-chips-shelf-with-video-shelf-renderer)',
      ],
      remove: [],
    },
    {
      id: 'youtube-guide-extras',
      site: 'YouTube',
      name: '"More from YouTube" sidebar section and footer',
      enabled: false,
      matches: ['https://www.youtube.com/*'],
      hide: [
        'ytd-guide-section-renderer:has(a[href="/premium"])',
        'ytd-guide-renderer #footer',
      ],
      remove: [],
    },
    {
      id: 'youtube-premium-upsells',
      site: 'YouTube',
      name: 'Premium upsells',
      enabled: false,
      matches: ['https://www.youtube.com/*'],
      hide: [
        'ytd-guide-entry-renderer:has(a[href="/premium"])',
        'yt-mealbar-promo-renderer',
        'tp-yt-paper-dialog:has(yt-mealbar-promo-renderer)',
        '.ytp-quality-menu .ytp-menuitem:has(.ytp-premium-label)',
      ],
      remove: [],
    },
    {
      id: 'youtube-end-screen-cards',
      site: 'YouTube',
      name: 'End-screen cards over the last seconds of a video',
      enabled: false,
      matches: ['https://www.youtube.com/*'],
      hide: ['.ytp-ce-element'],
      remove: [],
    },
    {
      id: 'youtube-end-screen-wall',
      site: 'YouTube',
      name: 'Suggestions grid after a video ends',
      enabled: false,
      matches: ['https://www.youtube.com/*'],
      hide: [
        '.html5-endscreen',
        '.ytp-fullscreen-grid-stills-container',
      ],
      remove: [],
    },
    {
      id: 'youtube-info-cards',
      site: 'YouTube',
      name: 'Info card teaser and button in the player',
      enabled: false,
      matches: ['https://www.youtube.com/*'],
      hide: [
        '.ytp-cards-teaser',
        '.ytp-cards-button',
      ],
      remove: [],
    },
    {
      id: 'youtube-music-premium-promo',
      site: 'YouTube Music',
      name: 'Premium promo popup',
      enabled: false,
      matches: ['https://music.youtube.com/*'],
      hide: ['ytmusic-mealbar-promo-renderer'],
      remove: [],
    },
    {
      id: 'youtube-music-taste-builder',
      site: 'YouTube Music',
      name: '"Tell us which artists you like" shelf',
      enabled: false,
      matches: ['https://music.youtube.com/*'],
      hide: ['ytmusic-tastebuilder-shelf-renderer'],
      remove: [],
    },
  ];
  const ids = new Set(builtins.map(({ id }) => id));

  const normalize = (settings) => {
    const legacy = settings.rules.filter(({ id }) => ids.has(id));
    return {
      ...settings,
      rules: settings.rules.filter(({ id }) => !ids.has(id)),
      builtins: { ...Object.fromEntries(legacy.map(({ id, enabled }) => [id, enabled])), ...settings.builtins },
    };
  };

  const builtinsOf = (settings) => {
    const { builtins: enabled } = normalize(settings);
    return builtins.map((rule) => ({ ...rule, enabled: enabled[rule.id] ?? rule.enabled }));
  };

  const rulesOf = (settings) => [...builtinsOf(settings), ...normalize(settings).rules];

  const withEnabled = (settings, id, enabled) => (ids.has(id)
    ? { ...settings, builtins: { ...settings.builtins, [id]: enabled } }
    : { ...settings, rules: settings.rules.map((rule) => (rule.id === id ? { ...rule, enabled } : rule)) });

  const isSelector = (selector) => {
    try {
      document.createDocumentFragment().querySelector(selector);
      return true;
    } catch {
      return false;
    }
  };

  globalThis.extenso ??= {};
  globalThis.extenso.modules ??= {};
  globalThis.extenso.modules.declutter = {
    label: 'Declutter',
    defaults: {
      settings: { enabled: false, rules: [], builtins: {}, disabledHosts: [] },
      state: {},
    },
    normalize,
    builtinsOf,
    rulesOf,
    withEnabled,
    isSelector,
  };
})();
