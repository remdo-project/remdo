(() => {
  const frame = document.querySelector('.landing-video-background');
  const video = frame.querySelector('.landing-video');
  const play = frame.querySelector('.landing-video-play');
  const duration = play.querySelector('.landing-video-duration');
  const showDuration = () => {
    const seconds = Math.round(video.duration);
    duration.textContent = ` · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };
  const useNativeControls = () => {
    video.controls = true;
    if (document.activeElement === play) video.focus();
    play.hidden = true;
  };
  video.controls = false;
  play.hidden = false;
  video.addEventListener('click', () => {
    if (!video.controls) video.play();
  });
  play.addEventListener('click', () => video.play());
  video.addEventListener('play', useNativeControls);
  video.addEventListener('pause', () => {
    play.hidden = false;
  });
  video.addEventListener('error', useNativeControls, true);
  video.addEventListener('loadedmetadata', showDuration);
  if (video.readyState) showDuration();
})();
