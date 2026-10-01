(() => {
  const frame = document.querySelector('.landing-video-background');
  const video = frame.querySelector('.landing-video');
  const play = frame.querySelector('.landing-video-play');
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
})();
