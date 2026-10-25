# Dark Reader in Extenso

Extenso's dark mode is a port of [Dark Reader](https://github.com/darkreader/darkreader)'s dynamic theme engine, CSS filter mode, dark theme detector, and site data. The code was converted by hand from TypeScript to JavaScript once, at Dark Reader commit `b072b9d` (4.9.133 plus 86 commits, 2026-10-20).

Since the port, the code is Extenso's own and never syncs with upstream. Only the site data syncs, through a script.

## Code taken

Each file below is a JavaScript port of the Dark Reader source beside it. Dark Reader paths are under its `src/`, and engine files are under `modules/dark/content/engine/`.

| Extenso file | Dark Reader source |
|---|---|
| `modules/dark/content/detector.js` | `inject/detector.ts` |
| `modules/dark/content/filter.js` | `generators/css-filter.ts` |
| `modules/dark/sites.js` | `utils/url.ts`, `generators/utils/parse.ts` |
| `modules/dark/page/proxy.js` | `inject/dynamic-theme/stylesheet-proxy.ts` |
| `index.js` | `inject/dynamic-theme/index.ts` |
| `style-manager.js` | `inject/dynamic-theme/style-manager.ts` |
| `adopted.js` | `inject/dynamic-theme/adopted-style-manger.ts` |
| `sheet-modifier.js` | `inject/dynamic-theme/stylesheet-modifier.ts` |
| `modify.js` | `inject/dynamic-theme/modify-css.ts` |
| `variables.js` | `inject/dynamic-theme/variables.ts` |
| `inline.js` | `inject/dynamic-theme/inline-style.ts` |
| `image.js` | `inject/dynamic-theme/image.ts` |
| `network.js` | `inject/dynamic-theme/network.ts`, `background/utils/network.ts` |
| `watch.js` | `inject/dynamic-theme/watch/` |
| `css.js` | `inject/dynamic-theme/css-rules.ts` |
| `dom.js` | `inject/utils/dom.ts` |
| `color.js` | `utils/color.ts`, for color parsing only |
| `util.js` | `utils/url.ts`, `utils/text.ts`, `utils/throttle.ts`, `utils/math.ts` |

- **DOM names** stay Dark Reader's: the `darkreader` and `darkreader--*` style classes, the `--darkreader-*` CSS variables, the `data-darkreader-*` attributes, and the `#__darkreader` adopted sheet marker. Upstream site fixes reference these names, so they apply unchanged.
- **Proxy events** between the isolated script and the MAIN-world proxy are renamed to `__extenso_dark__*`.
- **The MIT license** is in `third_party/darkreader/LICENSE`, which the release zip includes. Source files carry no notice.

## Data taken

`tools/sync-darkreader-data.mjs` copies these files from Dark Reader's `src/config/` into `modules/dark/`. The bundled copies match commit `b072b9d`.

| Extenso file | Dark Reader file | Taken |
|---|---|---|
| `detector-hints.config` | `detector-hints.config` | All 231 blocks |
| `fixes.config` | `dynamic-theme-fixes.config` | 56 of 2,936 blocks |
| `inversion-fixes.config` | `inversion-fixes.config` | 23 of 249 blocks |

- **The two fix files** keep the `*` block, which applies to every site, plus the blocks for domains in `modules/dark/fixes-allowlist.txt`.
- **A block is kept** when one of its URL patterns is on an allowlisted domain or one of its subdomains.
- **Personal fixes** go in `modules/dark/fixes.local.config`, in the same format. They apply after the upstream fixes, and the sync never touches the file.
- **Dynamic fixes** support `INVERT`, `CSS`, `IGNORE INLINE STYLE`, `IGNORE IMAGE ANALYSIS`, and `IGNORE CSS URL`.
- **Inversion fixes** support `INVERT`, `NO INVERT`, `REMOVE BG`, and `CSS`.
- **Detector hints** support `TARGET`, `MATCH`, `NO DARK THEME`, `SYSTEM THEME`, and `IFRAME`.

## What Extenso changes

### Deciding when to theme

`modules/dark/content/controller.js` decides per frame at `document_start`, before injecting anything:

```
site mode Never                         -> nothing
site mode Invert                        -> CSS filter
site mode Always                        -> dynamic engine, no detection
Auto, top frame:
  host cached, not expired              -> nothing
  host cached, expired                  -> detect first, theme only if light
  unknown host                          -> theme, detect, untheme if dark
Auto, subframe                          -> follow the top host's cached verdict
```

- **The dark cache** is `state.dark.hosts`, a map of host to expiry time. `settings.dark.ttlDays` sets the lifetime, 30 days by default.
- **A page detected dark** is added to the cache. A cached page later detected light is removed from it.

### Detection

- **Timing**: detection waits for `document.readyState === 'complete'`. Dark Reader samples as soon as the body has content and a stylesheet.
- **Transparent root**: when `html` has a transparent background, grid points that land on `html` read the background of `body`.
- **Light points**: a page can still read dark when up to a quarter of its grid points read light, so a light cookie banner does not decide the verdict. Dark Reader calls the page light on the first light point.
- **Declared dark**: a dark `color-scheme` meta, a `dark` class, `data-theme="dark"`, or a matching detector hint counts only while the visible `html` or `body` background is not an opaque light color. Dark Reader trusts the declaration.
- **Hints**: a detector hint is read once the page loads, and no match reports a light page. Dark Reader acts on the first match and keeps waiting while there is none.
- **Theme switches**: detection reruns when `html` or `body` changes `class` or `data-theme`, the color-scheme meta changes `content`, or the system color scheme changes. Reruns are debounced by 250 ms.
- **Subframes** run their own detection only when their hint carries `IFRAME`.

### Engine

- **Color transform**: colors are remapped by OKLCH lightness, by role (background, text, border). Dark Reader remaps in HSL, with special cases for blue and yellow hues.
- **The theme is fixed** at Dark Reader's default dark colors, `#181a1b` for backgrounds and `#e8e6e3` for text.
- **Near-neutral colors**, with OKLCH chroma under 0.04, take the hue and chroma of those default colors. Out-of-gamut results lose chroma until they fit sRGB.
- **`light-dark()`** values are left to the browser, and the engine sets `color-scheme: dark` on `html` and iframes. A site's own dark colors win. Dark Reader picks a branch from the system color scheme instead.
- **Nested rules** are cached by their full chain of parent group rules, so identical rules under different parents each get an override.
- **`@import`** rules are inlined with their `layer()`, `supports()`, and media conditions kept. Processed text is cached per URL, cycles are skipped, and depth is capped at 32.
- **Fetches** for stylesheets and images time out after 10 seconds.
- **Cross-origin fetches** go through the service worker, with `credentials: 'omit'`, for `http:` and `https:` URLs only.
- **Caches** live in memory for the page's lifetime. Dark Reader writes image details to the site's `sessionStorage`.
- **Inline `!important` declarations** get their override written back on the element with `setProperty(..., 'important')`.
- **Color attributes**: `bgcolor` is overridden as `background-color`, and a `background` attribute on `html` or `body` as `background-image`. Dark Reader looks both up by attribute name, which throws on `bgcolor` and stops the theme partway through the page.
- **Background-image selectors** that wait for a matching element first drop `::before`, `::after`, `:hover`, `:focus`, `:focus-visible`, `:focus-within`, `:active`, `:checked`, and `:visited`.
- **Closed shadow roots** are reached with `chrome.dom.openOrClosedShadowRoot`.
- **Stopping** removes every style the engine added, in the document and in shadow roots. It restores the inline styles and attributes it wrote, and uninstalls the MAIN-world proxy.

### Site data

- **Bundled data** is parsed once by the service worker in `modules/dark/sites.js`, which answers a `lookup` message for each frame.
- **No runtime downloads**: Dark Reader can fetch updated configs from its repository when its `syncSitesFixes` setting is on. Extenso uses only what is bundled.

## Left out

- **Theme settings**: brightness, contrast, sepia, grayscale, fonts, text stroke, light scheme, and custom selection and scrollbar colors.
- **Other modes**: the static theme and the SVG filter.
- **Page extras**: PDF handling and `<meta name="theme-color">` rewriting.
- **Extension features**: runtime config downloads, schedules and automation, color scheme presets, and Dark Reader's popup, options, and DevTools editor.
- **Other browsers**: the Firefox, Safari, and Manifest V2 code paths.
- **The dark site list**: Auto decides from detection and saved verdicts alone, without Dark Reader's list of known dark sites.
- **Most site fixes**: sites off the allowlist get no fixes, so some look worse than under Dark Reader.

## Updating site data

1. Clone Dark Reader outside this repository with `git clone https://github.com/darkreader/darkreader.git`.
2. To pull fixes for another site, add its domain to `modules/dark/fixes-allowlist.txt`, one domain per line.
3. Run `node tools/sync-darkreader-data.mjs <darkreader-checkout>`. It rewrites the three data files and prints how many blocks each kept.
4. Reload the extension from `chrome://extensions`, since the service worker keeps the parsed data in memory.

## References

- Dark Reader: https://github.com/darkreader/darkreader
- Ported commit: https://github.com/darkreader/darkreader/commit/b072b9d4ae0792b56762fb2778aa7d9bfbce575c
