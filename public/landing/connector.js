(() => {
  const demo = document.querySelector('.connector-demo');
  if (!demo) return;

  const cards = [...demo.querySelectorAll('[data-card]')];
  const buttons = [...demo.querySelectorAll('.connector-navigation button')];
  const caps = [...demo.querySelectorAll('.connector-cap')];
  const copies = [...demo.querySelectorAll('[data-copy]')];
  const advance = demo.querySelector('.connector-advance');
  const status = demo.querySelector('.connector-status');
  const mobile = window.matchMedia('(max-width: 63.99em)');
  const labels = ['Connect', 'Ask', 'Review', 'Save'];
  let active = 0;
  let pointerStart = null;
  let swiped = false;

  function layout() {
    const height = cards[active].offsetHeight;
    const canvasHeight = Math.max(640, ...cards.map(card => card.offsetHeight + 120));
    demo.style.setProperty('--connector-height', `${canvasHeight}px`);
    demo.style.setProperty('--connector-top', `${(canvasHeight - height + 48) / 2}px`);
    demo.style.setProperty('--connector-card-height', `${height}px`);
  }

  function select(index, announce = true) {
    active = (index + cards.length) % cards.length;
    demo.dataset.activeStep = String(active);
    cards.forEach((card, i) => {
      card.classList.toggle('is-active', i === active);
      card.setAttribute('aria-hidden', String(i !== active));
      card.style.zIndex = i === active ? '5' : String(i + 1);
    });
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === active)));
    caps.forEach((cap, i) => {
      const distance = (i - active + cards.length) % cards.length;
      cap.hidden = distance === 0;
      cap.style.setProperty('--cap-offset', `${distance * 16}px`);
      cap.style.setProperty('--cap-inset', `${16 + distance * 6}px`);
      cap.style.zIndex = String(4 - distance);
    });
    copies.forEach((copy, i) => { copy.hidden = i !== active; });
    advance.setAttribute('aria-label', `Next example: ${labels[(active + 1) % cards.length]}`);
    if (announce) status.textContent = `${active + 1} of 4: ${labels[active]}`;
    layout();
  }

  demo.querySelector('.connector-navigation').hidden = false;
  demo.querySelector('.connector-caps').hidden = false;
  advance.hidden = false;
  demo.classList.add('is-interactive');
  buttons.forEach((button, i) => button.addEventListener('click', () => select(i)));
  caps.forEach((cap, i) => cap.addEventListener('click', () => {
    if (!swiped) select(i);
    swiped = false;
    advance.focus({ preventScroll: true });
  }));
  cards.forEach((card, i) => card.addEventListener('click', () => select(i)));
  advance.addEventListener('click', () => {
    if (!swiped) select(active + 1);
    swiped = false;
  });
  demo.addEventListener('keydown', (event) => {
    const directions = { ArrowRight: active + 1, ArrowLeft: active - 1, Home: 0, End: 3 };
    if (!(event.key in directions)) return;
    event.preventDefault();
    select(directions[event.key]);
    (mobile.matches ? advance : buttons[active]).focus({ preventScroll: true });
  });
  demo.addEventListener('pointerdown', (event) => {
    swiped = false;
    if (mobile.matches && event.isPrimary) pointerStart = { x: event.clientX, y: event.clientY };
  });
  demo.addEventListener('pointerup', (event) => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swiped = true;
      select(active + (dx < 0 ? 1 : -1));
    }
  });
  demo.addEventListener('pointercancel', () => { pointerStart = null; });
  const observer = new ResizeObserver(layout);
  cards.forEach(card => observer.observe(card));
  mobile.addEventListener('change', layout);
  select(0, false);
})();
