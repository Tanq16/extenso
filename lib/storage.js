(() => {
  const area = chrome.storage.local;
  const SETTINGS = 'settings.';
  const STATE = 'state.';

  const settingsKey = (module) => SETTINGS + module;
  const stateKey = (module) => STATE + module;
  const defaultsOf = (module, kind) => structuredClone(globalThis.extenso.modules?.[module]?.defaults?.[kind] ?? {});

  const read = async (key, defaults) => ({ ...defaults, ...(await area.get(key))[key] });
  const write = (key, value) => area.set({ [key]: value });
  const update = async (key, defaults, patch) => {
    const value = { ...(await read(key, defaults)), ...patch };
    await write(key, value);
    return value;
  };

  const getSettings = (module) => read(settingsKey(module), defaultsOf(module, 'settings'));
  const setSettings = (module, settings) => write(settingsKey(module), settings);
  const updateSettings = (module, patch) => update(settingsKey(module), defaultsOf(module, 'settings'), patch);

  const getState = (module) => read(stateKey(module), defaultsOf(module, 'state'));
  const setState = (module, state) => write(stateKey(module), state);
  const updateState = (module, patch) => update(stateKey(module), defaultsOf(module, 'state'), patch);

  const getAllSettings = async () => Object.fromEntries(
    Object.entries(await area.get(null))
      .filter(([key]) => key.startsWith(SETTINGS))
      .map(([key, value]) => [key.slice(SETTINGS.length), value]),
  );

  globalThis.extenso ??= {};
  globalThis.extenso.storage = {
    settingsKey,
    stateKey,
    getSettings,
    setSettings,
    updateSettings,
    getState,
    setState,
    updateState,
    getAllSettings,
  };
})();
