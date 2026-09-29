(() => {
  const paragraphs = [...document.querySelectorAll('.landing-story > p')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const from = [128, 122, 116];
  const to = [243, 239, 233];
  let pendingFrame = 0;

  function render() {
    pendingFrame = 0;
    const start = window.innerHeight * 0.88;
    const finish = window.innerHeight * 0.5;
    const progress = paragraphs.map((paragraph) => {
      if (reducedMotion.matches) return 1;
      const rect = paragraph.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      return Math.min(1, Math.max(0, (start - center) / (start - finish)));
    });

    paragraphs.forEach((paragraph, index) => {
      const color = from.map((value, channel) =>
        Math.round(value + (to[channel] - value) * progress[index]));
      paragraph.style.color = `rgb(${color.join(', ')})`;
    });
  }

  function scheduleRender() {
    if (!pendingFrame) pendingFrame = window.requestAnimationFrame(render);
  }

  window.addEventListener('scroll', scheduleRender, { passive: true });
  window.addEventListener('resize', scheduleRender, { passive: true });
  window.addEventListener('load', scheduleRender, { once: true });
  reducedMotion.addEventListener('change', scheduleRender);
  document.fonts.ready.then(scheduleRender);
  render();
})();
