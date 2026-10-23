(() => {
  const { storage, messages, dark } = globalThis.extenso;
  const { sites, detector, filter } = dark;
  const isTop = window === window.top;
  const origins = location.ancestorOrigins;
  const topURL = isTop ? location.href : `${origins[origins.length - 1]}/`;
  const frameURL = /^https?:$/.test(location.protocol) ? location.href : topURL;
  const host = URL.parse(topURL)?.hostname;
  const settingsKey = storage.settingsKey('dark');
  const stateKey = storage.stateKey('dark');

  let fix = null;
  let themed = false;
  let unwatch = null;
  let onHosts = null;

  const setThemed = (on) => {
    if (on === themed) return;
    themed = on;
    if (on) dark.dynamic.start(fix);
    else dark.dynamic.stop();
  };

  const report = (action) => messages.send('dark', action, { host })
    .catch((error) => console.error(`[extenso] dark ${action} failed`, error));

  const teardown = () => {
    chrome.storage.onChanged.removeListener(onChanged);
    detector.stop();
    unwatch?.();
    setThemed(false);
    filter.stop();
  };

  const onChanged = (changes, area) => {
    if (area !== 'local') return;
    if (changes[settingsKey]?.newValue?.enabled === false) teardown();
    else if (changes[stateKey]) onHosts?.(changes[stateKey].newValue?.hosts ?? {});
  };

  const autoTop = async (cached, pendingHint) => {
    let known = cached;
    const decide = (isDark, initial) => {
      setThemed(!isDark);
      if (isDark && (initial || !known)) report('remember');
      if (!isDark && known) report('forget');
      known = isDark;
    };
    if (!cached) setThemed(true);
    const hint = await pendingHint;
    detector.run((isDark) => {
      decide(isDark, true);
      unwatch = detector.watch(() => detector.run((verdict) => decide(verdict, false), hint), hint);
    }, hint);
  };

  const autoFrame = (hosts, hint) => {
    let topDark = Object.hasOwn(hosts, host);
    let frameDark = false;
    const update = () => setThemed(!topDark && !frameDark);
    onHosts = (next) => {
      topDark = Object.hasOwn(next, host);
      update();
    };
    update();
    if (hint?.iframe) {
      detector.run((isDark) => {
        frameDark = isDark;
        update();
      }, hint);
    }
  };

  const main = async () => {
    if (!host) return;
    const preload = sites.dynamicFix(frameURL);
    const knownDark = sites.isDarkSite(topURL);
    const [settings, state] = await Promise.all([storage.getSettings('dark'), storage.getState('dark')]);
    if (!settings.enabled) return;
    const mode = settings.sites[host] ?? 'auto';
    if (mode === 'off') return;

    if (mode === 'filter') {
      chrome.storage.onChanged.addListener(onChanged);
      filter.start(await sites.inversionFix(frameURL), isTop);
      return;
    }
    if (mode === 'dynamic') {
      chrome.storage.onChanged.addListener(onChanged);
      fix = await preload;
      setThemed(true);
      return;
    }

    const expiresAt = state.hosts[host];
    if (isTop && expiresAt > Date.now()) return;
    const hint = sites.detectorHint(frameURL);
    const [darkSite] = await Promise.all([
      expiresAt === undefined && knownDark,
      preload.then((value) => { fix = value; }),
    ]);
    if (darkSite) return;
    chrome.storage.onChanged.addListener(onChanged);
    if (isTop) await autoTop(expiresAt !== undefined, hint);
    else autoFrame(state.hosts, await hint);
  };

  main().catch((error) => console.error('[extenso] dark failed', error));
})();
