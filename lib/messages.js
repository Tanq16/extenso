(() => {
  const send = async (module, action, payload = {}) => {
    const response = await chrome.runtime.sendMessage({ ...payload, module, action });
    if (!response) throw new Error(`No handler for ${module}.${action}`);
    if (!response.ok) throw new Error(response.error);
    return response.result;
  };

  globalThis.extenso ??= {};
  globalThis.extenso.messages = { send };
})();
