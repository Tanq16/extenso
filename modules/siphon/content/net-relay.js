(() => {
  addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.tag !== 'siphon:net') return;
    globalThis.extenso.messages
      .send('siphon', 'response', { url: data.url, status: data.status, body: data.body })
      .catch(() => {});
  });
})();
