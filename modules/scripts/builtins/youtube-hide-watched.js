(() => {
  const THRESHOLD = 90;
  const DIM = false;
  const SKIP_PATHS = ['/feed/history', '/playlist'];

  const BARS = [
    '.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment',
    '.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegmentModern',
    '#progress.ytd-thumbnail-overlay-resume-playback-renderer',
  ].join(', ');
  const CARDS = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-playlist-video-renderer',
    'yt-lockup-view-model',
  ].join(', ');
  const MARK = 'data-extenso-watched';

  const isWatched = (card) => {
    const bar = card.querySelector(BARS);
    return Boolean(bar) && parseFloat(bar.style.width) >= THRESHOLD;
  };

  const update = () => {
    const active = !SKIP_PATHS.some((path) => location.pathname.startsWith(path));
    for (const card of document.querySelectorAll(CARDS)) {
      const watched = active && isWatched(card);
      if (watched === card.hasAttribute(MARK)) continue;
      card.toggleAttribute(MARK, watched);
      if (DIM) card.style.opacity = watched ? '0.35' : '';
      else card.style.display = watched ? 'none' : '';
    }
  };

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      update();
    });
  };

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('yt-navigate-finish', schedule);
  schedule();
})();
