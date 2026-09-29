(() => {
  const landing = document.querySelector('.remdo-landing');
  const page = document.querySelector('.landing-page');
  const ending = document.querySelector('.landing-ending');
  const reserve = document.querySelector('.landing-ending-reserve');
  const content = document.querySelector('.landing-ending-content');
  const panel = document.querySelector('.landing-cta-panel');
  const footer = document.querySelector('.landing-footer');
  if (!landing || !page || !ending || !reserve || !content || !panel || !footer) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;

  function refreshLayout() {
    frame = 0;
    // Keep the document length while trying the fixed layout. A failed fit must
    // not clamp the scroll position before restoring the normal-flow ending.
    reserve.style.height = `${ending.getBoundingClientRect().height}px`;
    landing.classList.add('landing-curtain');
    const fits = footer.getBoundingClientRect().bottom <= ending.getBoundingClientRect().bottom + 1;
    const curtain = fits && !reducedMotion.matches;
    landing.classList.toggle('landing-curtain', curtain);
    reserve.style.height = '';
    ending.dataset.revealMode = curtain ? 'curtain' : 'flow';
  }

  function scheduleLayout() {
    if (!frame) frame = window.requestAnimationFrame(refreshLayout);
  }

  ending.addEventListener('focusin', (event) => {
    if (!landing.classList.contains('landing-curtain')) return;
    const coveredUntil = Math.max(0, page.getBoundingClientRect().bottom);
    if (event.target.getBoundingClientRect().top < coveredUntil) {
      window.scrollTo({ top: window.scrollY + coveredUntil, behavior: 'instant' });
    }
  });

  window.addEventListener('resize', scheduleLayout, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleLayout, { passive: true });
  reducedMotion.addEventListener('change', scheduleLayout);
  document.fonts.ready.then(scheduleLayout);
  const observer = new ResizeObserver(scheduleLayout);
  for (const element of [page, panel, footer]) observer.observe(element);
  refreshLayout();
})();
