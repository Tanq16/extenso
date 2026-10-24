const media = document.querySelectorAll('video, audio');
const rate = Number(prompt('Playback speed', media[0]?.playbackRate ?? 1));
if (rate > 0) for (const element of media) element.playbackRate = rate;
