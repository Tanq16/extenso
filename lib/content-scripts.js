export const scriptId = (module, id) => `${module}:${id}`;

export async function syncContentScripts(module, scripts) {
  const prefix = scriptId(module, '');
  const ids = (await chrome.scripting.getRegisteredContentScripts())
    .map(({ id }) => id)
    .filter((id) => id.startsWith(prefix));
  if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
  if (scripts.length) {
    await chrome.scripting.registerContentScripts(
      scripts.map((script) => ({ ...script, id: scriptId(module, script.id) })),
    );
  }
}
