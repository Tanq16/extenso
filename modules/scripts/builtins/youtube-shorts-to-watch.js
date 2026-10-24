(() => {
  const shortsId = (url) => new URL(url, location.href).pathname.match(/^\/shorts\/([\w-]+)/)?.[1];

  const redirect = () => {
    const id = shortsId(location.href);
    if (id) location.replace(`/watch?v=${id}`);
  };

  redirect();
  document.addEventListener('yt-navigate-finish', redirect);

  window.addEventListener('click', (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href*="/shorts/"]');
    const id = link && shortsId(link.href);
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(`/watch?v=${id}`);
  }, true);
})();
