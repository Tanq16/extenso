# Architecture

Extenso is one Manifest V3 extension holding six modules: `newtab`, `scripts`, `siphon`, `dark`, `declutter`, and `relay`. They share one service worker, one popup, and one options page. There is no build step, so Chrome runs the repository files as they are.

## Layout

```
manifest.json
background/service-worker.js   imports every module's worker.js, routes messages, reruns sync
lib/                           storage, messages, match patterns, content script registration, export and import
ui/                            DOM helpers, tabs, the shared module card, theme.css
popup/  options/               extension pages, one tab per module
devtools/                      the Siphon DevTools panel
modules/<name>/                one directory per module
third_party/                   Dark Reader's license, Lucide icons and license
tools/                         repository scripts that Chrome never loads
```

## A module

| File | Holds |
|---|---|
| `module.js` | A namespace script setting `globalThis.extenso.modules.<name>` to `{ label, defaults: { settings, state } }`, plus any helpers both pages and content scripts need |
| `worker.js` | An ES module exporting `onMessage(message, sender)` and, when the module registers anything with Chrome, `sync(settings)` |
| `popup.js` | `render(panel, tab)` for the module's popup tab |
| `options.js` | `render(panel)` for the module's options tab |
| `content/*.js` | Isolated-world content scripts |
| `page/*.js` | MAIN-world content scripts, which share the page's JavaScript globals |

- **Content scripts** are classic scripts, injected in the order a worker lists them. Each declares nothing at top level and attaches what it exports to `globalThis.extenso`.
- **Shared namespace scripts** in `lib/` (`storage.js`, `messages.js`, `match.js`) load as content scripts and as side-effect imports in ES modules.
- **The service worker** imports every module's `worker.js` statically.
- **Pages** load each module's `popup.js` or `options.js` with `import()` when its tab first renders.

## Storage

- **Keys**: each module keeps `settings.<module>` and `state.<module>` in `chrome.storage.local`. The popup also keeps its last tab under `state.popup`.
- **Defaults**: `storage.getSettings` and `storage.getState` merge the stored object over the module's defaults one level deep. A nested default, such as a map of built-in toggles, has to be merged by the module itself.
- **Export** writes every `settings.*` key. State, such as Siphon captures and the dark site cache, is not exported.
- **Import** replaces each module's settings key from the file and then reruns every `sync`.

## Sync

- **When it runs**: the service worker calls a module's `sync(settings)` on install, on browser startup, and whenever that module's settings key changes. Runs for one module are queued, never concurrent.
- **Content scripts** are registered by `syncContentScripts(module, scripts)` in `lib/content-scripts.js`, under ids `<module>:<id>`. Each sync replaces that module's registrations, and a module that is off registers nothing.

| Module | `sync` registers |
|---|---|
| `newtab` | Nothing. A `chrome.tabs.onCreated` listener redirects new tabs. |
| `scripts` | `chrome.userScripts` registrations for enabled automatic scripts, and the Run script context menu for manual ones |
| `siphon` | Content scripts for storage reads and the MAIN-world fetch and XHR wrapper |
| `dark` | The isolated engine and the MAIN-world proxy on every frame, at `document_start` |
| `declutter` | One content script on the match patterns of every enabled rule, at `document_start` |
| `relay` | A context menu entry per enabled target |

## Messages

- **Sending**: `extenso.messages.send(module, action, payload)` sends `{ ...payload, module, action }` to the service worker.
- **Handling**: the service worker calls that module's `onMessage` and replies `{ ok: true, result }` or `{ ok: false, error }`. `send` returns `result` or throws `error`.
- **Core actions**: `send('core', 'sync')` reruns every module's `sync`.

## Pages

- **Tabs**: the popup and the options page build one tab per entry in `globalThis.extenso.modules`, in the import order of `lib/registry.js`. The options page adds a General tab for export and import.
- **On/off card**: `moduleCard` in `ui/modules.js` renders every module's switch. Its `ICONS` and `SWITCHES` maps hold each module's nav icon and switch label.
- **Icons** are Lucide SVGs under `third_party/lucide/icons/`, drawn by `icon(name)` in `ui/dom.js`.

## Adding a module

1. Create `modules/<name>/module.js` and import it in `lib/registry.js`.
2. Create `modules/<name>/worker.js`, import it in `background/service-worker.js`, and add it to the `workers` map there.
3. Create `popup.js` and `options.js`, each exporting `render`.
4. Add the module's icon and switch label to `ICONS` and `SWITCHES` in `ui/modules.js`. Copy any new Lucide icon into `third_party/lucide/icons/`.
5. Add any permission the module needs to `manifest.json`.

## Built-ins

- **Declutter rules** live in the `builtins` array in `modules/declutter/module.js`. A rule has `id`, `site`, `name`, `enabled`, `matches`, `hide`, and `remove`.
- **Built-in-only rule fields** are `css`, `move`, and `masonry`. The options page form for user rules does not offer them.
- **`css`** is a stylesheet string added while the rule is on.
- **`move`** lists `{ selector, to }` pairs, and each matching element is moved to the start of `to`.
- **`masonry`** lists grid item selectors, and each item is pinned to the shortest grid column.
- **Built-in scripts** are listed in `modules/scripts/module.js`, and each one's code is `modules/scripts/builtins/<id>.js`.
- **Toggles** for built-ins are stored by `id` under `settings.<module>.builtins`. Renaming an `id` drops the toggle a user already set.

## Releases

- **Every push to `main`** runs `.github/workflows/release.yaml`. It checks syntax, builds `dist/extenso-<version>.zip`, and publishes it as a GitHub release.
- **The version** comes from `make version`. It bumps the patch of the latest tag, or the minor or major when the last commit message carries `[minor-release]` or `[major-release]`.
- **A merge commit carrying `[no ci]`** skips the workflow, so no release is made.
- **The same syntax check** runs locally with `git ls-files -z '*.js' '*.mjs' | xargs -0 -n1 node --check && jq empty manifest.json`.
