# Extenso

One personal Chrome MV3 extension, loaded unpacked, that is the single source of truth for browser customization. It replaces NuTab, Soifon, and Dark Reader, and adds bookmarklets, page declutter, a proxy toggle, and a relay to local servers.

## Layout

```
extenso/
  manifest.json                  one manifest, union of permissions
  background/service-worker.js   ES module; imports each module's worker.js
  lib/                           shared code: storage, settings, match patterns, export/import
  modules/
    newtab/      NuTab (tabs.onCreated redirect)
    siphon/      Soifon rewrite (webRequest, cookies, scripting)
    dark/        detection + theme content scripts
    scripts/     userScripts registry (bookmarklets)
    declutter/   per-site DOM/CSS rules (Amazon sponsored)
    relay/       send page/selection to local servers
  popup/         tabs; per-site controls for the current page
  options/       full-page editors: rules, scripts, site lists, export/import
  devtools/      Siphon DevTools panel
  tools/         repo-side scripts, never loaded by Chrome
  third_party/darkreader/LICENSE
```

Inside a module:

```
modules/<name>/
  worker.js      ES module imported by the service worker
  content/*.js   isolated-world content scripts, in load order
  page/*.js      MAIN-world scripts (CSSOM proxy, fetch wrapper)
```

- Each module keeps its settings under one `settings.<module>` storage key, with its enable flag inside.
- Runtime state lives under separate `state.<module>` keys: Siphon captures, the dark-host cache.
- The service worker registers a module's content scripts with `scripting.registerContentScripts` only while that module is enabled, so a disabled module never runs on a page.
- State lives in `chrome.storage`, never in service worker variables, because Chrome terminates the worker when idle.

## Code conventions

There is no build step. The repository folder loads unpacked as-is, and every file Chrome runs is the file in the repo.

- The service worker is declared with `"type": "module"` and uses static `import` only, because dynamic `import()` is not supported in extension service workers.
- Popup, options, and DevTools pages load `<script type="module">`.
- Content scripts are classic scripts, injected in the order the manifest or `registerContentScripts` lists them.
- Each content script file attaches its exports to one namespace object, `globalThis.extenso`, and declares nothing else at top level. This relies on all of the extension's isolated-world scripts in a frame sharing one global scope, which step 1 confirms.
- Code needed by both content scripts and ES modules is written as a namespace script, and ES modules load it with a side-effect `import`.
- The Dark Reader port is converted from TypeScript to JavaScript by hand once. After that the code is Extenso's own, with no upstream sync.
- Dark Reader's MIT notice lives in `third_party/darkreader/LICENSE`, not in source comments.
- Site-fix and dark-site data still sync from upstream through `tools/sync-darkreader-data.mjs`, a stdlib-only Node script.

## Repository and workflow

- `github.com/tanq16/extenso`: private, MIT, default branch `main`.
- The local clone lives at `extenso/extenso/`, next to `nutab/`, `soifon/`, and `darkreader/`, which stay as porting references until the port is tested and are then removed.
- Work lands through PRs from `feat/`, `fix/`, and `chore/` branches.

## Build order

Each step leaves something usable day to day.

1. Skeleton: manifest, service worker router, `settings.*` and `state.*` storage, popup and options shells with tabs, export/import, NuTab port.
2. Bookmarklets: Scripts tab, `userScripts` sync, popup runner.
3. Siphon: rule model and capture for every source, then the DevTools panel.
4. Dark mode, part 1: detector, dark cache, per-site settings, filter mode.
5. Dark mode, part 2: dynamic engine port and site fixes.
6. Declutter and relay.

## Bookmarklets

`chrome.userScripts` is the only MV3 API that runs code strings. `chrome.scripting.executeScript` accepts only packaged files or functions.

- Bookmarklets are stored as code strings in `chrome.storage` and edited on the options page.
- `userScripts.execute()` (Chrome 135+) runs one on demand from the popup, a context menu, or a shortcut.
- `userScripts.register({ id, matches, js: [{ code }], runAt, world })` runs one automatically on matching sites.
- `world: 'MAIN'` shares the page's JavaScript, which the focus keeper needs to override `document.hidden` and `visibilitychange`.
- The default `USER_SCRIPT` world is isolated and exempt from the page's CSP.
- Chrome 138+ requires the "Allow User Scripts" toggle on the extension's details page, once.
- Registered scripts are cleared on extension update, so the worker re-registers them in `runtime.onInstalled` when the reason is `"update"`.

Small one-off actions stay as stored user scripts: GitHub select-all scopes, the focus keeper. Anything with its own UI becomes a packaged module: the Calendar quick-accept panel, the Amazon sponsored remover.

### Managing scripts

The options page has a Scripts tab, and each script is one record:

```
script {
  id, name, enabled
  code
  trigger: manual | auto
  matches: match patterns, e.g. https://github.com/settings/*   (auto: where it runs; manual: where it is offered)
  world:   USER_SCRIPT (default) | MAIN
  runAt:   document_start | document_end | document_idle   (auto only)
}
```

- The Scripts tab lists every script with its enable toggle, and supports add, edit, duplicate, delete, and run-now on the active tab.
- Adding a script accepts either raw code or a pasted `javascript:` bookmarklet URL, which is URI-decoded and stripped of its prefix.
- The popup lists the manual scripts whose `matches` cover the current tab, each with a run button.
- Saving any script makes the service worker sync its `userScripts` registrations: register enabled auto scripts, unregister the rest.
- Manual scripts run through `userScripts.execute()` and are never registered.

## Siphon

Siphon is the Soifon rewrite. The current version has two problems: the rule form is two boxes that hide where a value lives, and captures pile up as a 50-item history.

### Rule model

Each rule names one source explicitly, instead of one storage rule checking localStorage, sessionStorage, and cookies together.

```
rule {
  name
  scope:   match pattern, e.g. *://*.okta.com/*   + optional URL regex
  source:  query | request.header | request.body
           response.header | response.body
           cookie | localStorage | sessionStorage
  key:     param / header / cookie / storage key / form field (optional)
  extract: whole value | regex with group 1 or (?<value>...) | JSON path
  keep:    latest (default) | last N
  on:      notify | copy to clipboard
}
```

- Scope uses Chrome match patterns, which are easier to write than a URL regex. The worker passes them as the `webRequest` URL filter, so it only wakes for matching traffic.
- An optional URL regex narrows a scope to specific paths.
- `key` covers the common case without any regex: a header name, a cookie name, a query parameter.
- `extract` applies after `key`, so a regex only ever runs against one value instead of a whole body.
- `keep: latest` shows one row per rule with its newest value, which replaces the piling list.

### How each source is read

| Source | Mechanism | Notes |
|---|---|---|
| query | `details.url` in any `webRequest` event | Not read today |
| request.header | `onBeforeSendHeaders` + `"requestHeaders"` | `Cookie`, `Referer`, `Origin` need `"extraHeaders"` |
| request.body | `onBeforeRequest` + `"requestBody"` | Form bodies arrive as `formData`; JSON arrives as `raw` bytes |
| response.header | `onHeadersReceived` + `"responseHeaders"` | `Set-Cookie` needs `"extraHeaders"` |
| response.body | MAIN-world `fetch`/XHR wrapper on rule hosts | `webRequest` cannot read response bodies |
| cookie | `cookies.onChanged` | Fires on every set, so a rotated token is caught immediately |
| localStorage / sessionStorage | content script on rule hosts | Read on load and on tab focus |

- The response body wrapper only sees requests made by page scripts, not top-level navigations.
- `chrome.debugger` with `Network.getResponseBody` is the fallback for navigations. It is unverified whether Chrome shows a debugging banner while attached.
- Copy to clipboard runs from an offscreen document with the `CLIPBOARD` reason, because the service worker has no clipboard.
- Unverified: whether an `Authorization` header set by page JavaScript is visible in `onBeforeSendHeaders`. The docs list `Authorization` among headers that are not provided, which may only cover headers the network stack adds.

### Finding what to capture

A DevTools panel for the extension does discovery. `devtools.network.onRequestFinished` and `getContent()` give every request with its headers, query, body, and response body while DevTools is open.

- The panel lists recorded requests, filterable by host.
- Clicking any header, query parameter, cookie, body field, or JSON key opens a prefilled rule with source, key, and scope already set.
- "Find by value" takes a value the user already has, searches all recorded traffic plus the page's cookies and storage, and lists every place it appears. Picking one builds the rule.

## Dark mode

- Per-site setting: host maps to `auto | dynamic | filter | off`, set from the popup. `auto` is the default.
- Changing a site's setting reloads every open tab on that host.
- Detection ports Dark Reader's `src/inject/detector.ts` (MIT). It checks `meta[name="color-scheme"]`, a `dark` class or `data-theme="dark"` on `html` or `body`, computed `color-scheme: dark`, then samples background lightness on a grid of at most 4x4 points.
- Detection reruns when the page switches theme after load, as Dark Reader's `color-scheme-watcher.ts` does.

### No flicker on dark sites

Dark Reader flickers because it themes the page first, detects after load, then strips the theme. Here the content script decides before injecting anything:

```
content script at document_start, per host:
  manual setting dynamic | filter | off    -> do that, no detection
  host in dark cache, not expired          -> return, inject nothing
  host in bundled dark-sites list          -> return, inject nothing
  host in dark cache, expired              -> detect first; theme only if light
  unknown host                             -> theme, detect, strip if dark
  detected dark                            -> write host to dark cache with expiresAt
```

- The dark cache is `state.dark.hosts`, a map of host to `expiresAt`, with one TTL setting defaulting to 30 days.
- Only an unknown host that turns out dark flickers, once, on its first visit.
- An expired host re-detects without theming first, because it was dark last time, so a still-dark site never flickers on revalidation.
- The bundled dark-sites list is Dark Reader's `src/config/dark-sites.config`, 1,313 host patterns of sites known to be dark.
- Dark Reader's `src/config/detector-hints.config` (230 entries) adds per-site selectors that answer detection cheaply, such as `[data-bs-theme="dark"]` on `html`. It is bundled alongside the detector.

### Site fixes

Dark Reader's `src/config/dynamic-theme-fixes.config` is 42,313 lines covering 2,935 site blocks. The extension bundles a subset:

- The global `*` block (250 lines) is always kept, because it applies to every site.
- Site blocks are kept for hosts on a curated allowlist, `modules/dark/fixes-allowlist.txt`, seeded with common sites (Google properties, GitHub, YouTube, Wikipedia, Reddit, Stack Overflow, Amazon) and grown when a site looks wrong.
- A sync script extracts the `*` block and allowlisted blocks from a pinned upstream commit into `modules/dark/fixes.config`, so updating is a rerun rather than hand-copying.
- Personal fixes live in a separate `modules/dark/fixes.local.config` in the same format, applied after upstream ones.
- Fixes use upstream's directives: `INVERT`, `CSS`, `IGNORE INLINE STYLE`, `IGNORE IMAGE ANALYSIS`, `IGNORE CSS URL`.

### Engine

The default engine is a slim port of Dark Reader's dynamic theme, estimated at about 3,300 lines against its 7,237. Filter mode (`invert(100%) hue-rotate(180deg)`, about 300 lines) is a per-site choice for canvas apps such as Google Docs and maps, where the dynamic engine leaves the page white.

```
content script (MAIN-world CSSOM proxy + isolated script)
  find sheets: <style>, <link>, adopted sheets, open shadow roots, inline style attrs
  per rule: map each color by property role -> override rule with same selector, placed after source
    background*        -> dark (bg math)
    color/fill/stroke  -> light (text math)
    border*/outline*   -> mid  (border math)
    var(--x)           -> role inferred from consumers, one copy per role
    url() images       -> analyze 32x32: drop, keep, or invert
  cross-origin CSS: service worker fetches text, parsed locally
  watch: MutationObserver + proxied insertRule/replace/adoptedStyleSheets
```

Kept, by size:

| Concern | Lines |
|---|---|
| CSS variables | ~550 |
| Stylesheet discovery and watching | ~450 |
| Rule walk and override builder | ~450 |
| Orchestration | ~350 |
| Color math and parsing | ~300 |
| Inline styles | ~300 |
| Adopted sheets and CSSOM proxy | ~300 |
| Declaration dispatch | ~250 |
| Background image analysis | ~250 |
| Cross-origin fetch | ~200 |
| Detector | ~150 |

Dropped:

- Brightness, contrast, sepia, grayscale, light mode, fonts, selection and scrollbar colors, and the palette registry behind live sliders.
- Firefox, Safari, MV2, Plus, and test code paths.
- The rAF polling fallbacks, because MV3 always has the MAIN-world proxy.
- PiP, PDF, WP Dark Mode, export CSS, second-instance handling, and hardcoded hostname lists.
- The 42k-line site fixes config. A small personal fixes file replaces it, and some sites will look worse without the full list.

Changes from Dark Reader:

- Leave `light-dark()` to the browser once `color-scheme: dark` is set. Dark Reader resolves it from the OS scheme and discards a site's own dark colors when the OS is light (`utils/color.ts:208-214`).
- Try OKLCH lightness instead of HSL with yellow and blue special cases. Whether it fully replaces those special cases is untested.
- Disable cleanly: remove invert styles from shadow roots (`index.ts:985-993`) and restore inline attributes and properties written onto page elements (`inline-style.ts:453-474`).
- Key nested rules on the full ancestor chain, so identical rules under different parents each get an override (`stylesheet-modifier.ts:66-120`).
- Cache processed `@import` text and keep each import's media, supports, and layer condition (`style-manager.ts:587-675`).
- Put a timeout on cross-origin stylesheet fetches, so one stalled host cannot pin the loading fallback sheet (`network.ts:24-29`).
- Cache in memory or `chrome.storage.session`, never the site's `sessionStorage`, which Dark Reader fills until the site's own writes throw (`cache.ts:38-81`).
- Write inline `!important` overrides back with `setProperty(..., 'important')`, which Dark Reader's author-sheet rules cannot beat (`inline-style.ts:135-148`).
- Strip `:hover`, `:focus`, and `:checked` before matching background-image selectors, which otherwise wait forever (`modify-css.ts:510-526`).
- Reach closed shadow roots with `chrome.dom.openOrClosedShadowRoot`.

Line references are to `../darkreader/src/` at commit `b072b9d`. Copied code keeps Dark Reader's MIT copyright notice.

## Settings export and import

The options page exports and imports every module's settings as one JSON file.

```json
{
  "version": 1,
  "exportedAt": "2026-10-22T10:00:00Z",
  "settings": {
    "newtab":    { ... },
    "dark":      { "sites": { ... }, "ttlDays": 30 },
    "siphon":    { "rules": [ ... ] },
    "scripts":   { "items": [ ... ] },
    "declutter": { ... },
    "relay":     { ... }
  }
}
```

- Export reads every `settings.*` key, so a new module is included without touching export code.
- Runtime state is never exported. Siphon captures hold live tokens, and the dark cache rebuilds itself.
- Export downloads through a Blob and an `<a download>` link on the options page, which needs no permission.
- Import reads a file input, validates `version`, and replaces each module present in the file. Modules absent from the file stay as they are.
- After import, the service worker re-syncs user script and content script registrations and reloads nothing else.

## Relay

- The service worker `fetch`es a local server it has a host permission for.
- Payloads are page text or the current selection, read with `executeScript`.

## Stretch

- Wasm is allowed on extension pages with `'wasm-unsafe-eval'` in the CSP. It suits compute: parsing, crypto, small models.
- Wasm cannot run a native CLI such as Antigravity, because an extension cannot start processes or use the filesystem. A CLI is reached through Native Messaging or the relay.

## Future

### Proxy

Goal: one toggle that routes all Chrome traffic through a SOCKS proxy on a remote server that egresses through WireGuard. Off restores direct connections.

Feasible as specified, except that Chrome has no SOCKS5 username/password auth.

```js
await chrome.proxy.settings.set({
  scope: 'regular',
  value: { mode: 'fixed_servers', rules: { singleProxy: { scheme: 'socks5', host, port }, bypassList } },
});
await chrome.privacy.network.webRTCIPHandlingPolicy.set({ value: 'disable_non_proxied_udp' });

await chrome.proxy.settings.clear({ scope: 'regular' });
await chrome.privacy.network.webRTCIPHandlingPolicy.clear({});
```

- `singleProxy` covers every scheme, including `ws://` and `wss://`. A config with only `proxyForHttp` would let HTTPS go direct.
- `socks5` resolves DNS on the proxy. `socks4` resolves locally and is not used.
- An unreachable proxy fails requests with `ERR_PROXY_CONNECTION_FAILED` instead of falling back to direct.
- `scope: 'regular'` is written to disk, so the proxy survives a browser restart without the service worker running.
- Incognito windows go direct unless "Allow in Incognito" is on for the extension.
- Off is `clear()`, which restores the OS proxy setting.
- `bypassList` takes host patterns, IP literals, CIDR, and `<local>`. Localhost and loopback are always bypassed, while private ranges such as `192.168.x.x` are proxied unless listed.
- SOCKS cannot carry UDP, so WebRTC would leak the real IP. `disable_non_proxied_udp` forces WebRTC over TCP through the proxy, and calls may degrade.
- `set()` does not fail when another extension or a policy holds the setting. The badge reads `levelOfControl` from `proxy.settings.get()` on `onStartup`, `onInstalled`, and `proxy.settings.onChange`.
- `proxy.onProxyError` fires once per failed load with `{ error, details, fatal }` and drives an `ERR` badge.
- Permissions: `proxy`, `privacy`, `storage`.

Securing the SOCKS port, since Chrome cannot authenticate to it:

- An SSH tunnel (`ssh -D 1080 user@server`) with the extension pointed at `socks5://127.0.0.1:1080`. SSH keys replace the password.
- A firewall allowlist of the client IP on the server, which breaks when that IP changes.
- A SOCKS listener bound only to a private tunnel address the laptop can reach, separate from the egress WireGuard interface.
- An HTTPS proxy instead of SOCKS, answered through `webRequest.onAuthRequired` with `webRequestAuthProvider`.

Unverified: whether page-initiated DNS prefetch resolves locally while a SOCKS proxy is set.

## References

- `../nutab/`, `../soifon/`: the original extensions.
- `../darkreader/`: Dark Reader source at commit `b072b9d`, for porting only.
