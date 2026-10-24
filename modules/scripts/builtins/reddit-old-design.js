(() => {
  const here = new URL(location.href);
  const dest = here.searchParams.get('dest');
  const target = here.pathname.startsWith('/login') && dest ? new URL(dest) : here;
  if (target.hostname === 'old.reddit.com') {
    target.hostname = 'www.reddit.com';
    location.replace(target.href);
    return;
  }
  if (document.cookie.split('; ').includes('redesign_optout=true') || sessionStorage.getItem('extenso-optout')) return;
  document.cookie = 'redesign_optout=true; domain=.reddit.com; path=/; max-age=63072000; secure; samesite=lax';
  sessionStorage.setItem('extenso-optout', '1');
  location.reload();
})();
