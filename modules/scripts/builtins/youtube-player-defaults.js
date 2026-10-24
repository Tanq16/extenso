(() => {
  const SPEED = 1.5;
  const QUALITY = 'hd1080';
  const THEATER = true;
  const AUTOPLAY = false;

  const QUALITIES = ['highres', 'hd2880', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let latest = 0;

  const isPlayingContent = (player) => player?.getPlayerState?.() === 1
    && !player.classList.contains('ad-showing')
    && player.getVideoData().video_id === new URLSearchParams(location.search).get('v');

  const findPlayer = async (run) => {
    for (let attempt = 0; attempt < 240 && run === latest; attempt++) {
      const player = document.getElementById('movie_player');
      if (isPlayingContent(player)) return player;
      await wait(500);
    }
    return null;
  };

  const clickUntil = async (run, isDone, selector) => {
    for (let attempt = 0; attempt < 15 && run === latest && !isDone(); attempt++) {
      document.querySelector(selector)?.click();
      await wait(1000);
    }
  };

  const apply = async () => {
    if (location.pathname !== '/watch') return;
    const run = ++latest;
    const player = await findPlayer(run);
    if (!player || run !== latest) return;
    if (QUALITY) {
      const floor = QUALITIES.indexOf(QUALITY);
      const best = player.getAvailableQualityLevels().find((level) => QUALITIES.indexOf(level) >= floor);
      if (best) player.setPlaybackQualityRange(best, best);
    }
    if (SPEED) {
      player.setPlaybackRate(SPEED);
      const video = player.querySelector('video');
      if (video && video.playbackRate !== SPEED) video.playbackRate = SPEED;
    }
    if (AUTOPLAY !== null) {
      const toggle = '.ytp-autonav-toggle-button';
      await clickUntil(run, () => document.querySelector(toggle)?.getAttribute('aria-checked') !== String(!AUTOPLAY), toggle);
    }
    if (THEATER) {
      await clickUntil(run, () => Boolean(document.querySelector('ytd-watch-flexy[theater]')), '.ytp-size-button');
    }
  };

  apply();
  document.addEventListener('yt-navigate-finish', apply);
})();
