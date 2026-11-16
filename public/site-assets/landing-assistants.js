(() => {
  const panel = document.querySelector('.landing-chat-stage');
  const layout = panel.querySelector('.landing-chat-layout');
  const wrapper = panel.querySelector('.landing-assistant-demo-wrapper');
  const demo = panel.querySelector('.landing-assistant-demo-window');
  const chat = panel.querySelector('.landing-assistant-chat-card');
  const remdo = panel.querySelector('.landing-assistant-remdo-card');
  const viewport = panel.querySelector('.landing-assistant-chat-viewport');
  const track = panel.querySelector('.landing-assistant-conversation-track');
  const saveMessage = panel.querySelector('.landing-assistant-save-message');
  const savedMessage = panel.querySelector('.landing-assistant-saved-message');
  const savedText = panel.querySelector('.landing-assistant-saved-text');
  const draft = panel.querySelector('.landing-assistant-draft');
  const placeholder = panel.querySelector('.landing-assistant-placeholder');
  const caret = panel.querySelector('.landing-assistant-typing-caret');
  const sendIcon = panel.querySelector('.landing-assistant-send-icon');
  const prompt = 'Save this to @RemDo';
  const replyWords = 'Saved as Building a travel app in RemDo.'.split(' ');
  const timeline = {
    typingStart: 1800,
    typingEnd: 2960,
    send: 3160,
    replyStart: 3610,
    replyEnd: 5110,
    transition: 6710,
    complete: 7360,
  };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let elapsed = 0;
  let lastTick = null;
  let visible = false;
  let completed = false;
  let resetOnEntry = false;
  let frame = 0;
  let fontsReady = false;
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => 1 - (1 - clamp(value)) ** 3;

  // This illustration never sends a message or changes a RemDo document.
  function render(time) {
    const typing = time >= timeline.typingStart && time < timeline.send;
    const sent = time >= timeline.send;
    const typingProgress = clamp((time - timeline.typingStart) / (timeline.typingEnd - timeline.typingStart));
    const replyProgress = clamp((time - timeline.replyStart) / (timeline.replyEnd - timeline.replyStart));
    const transition = ease((time - timeline.transition) / (timeline.complete - timeline.transition));
    draft.textContent = typing ? prompt.slice(0, Math.floor(prompt.length * typingProgress)) : '';
    placeholder.hidden = typing;
    caret.style.opacity = typing && (Math.floor(time / 360) % 2 === 0 || typingProgress < 1) ? '1' : '0';
    saveMessage.style.opacity = sent ? '1' : '0';
    saveMessage.style.transform = `translateY(${(1 - ease((time - timeline.send) / 240)) * 8}px)`;
    savedMessage.style.opacity = time >= timeline.replyStart ? '1' : '0';
    savedText.textContent = replyWords.slice(0, Math.ceil(replyWords.length * replyProgress)).join(' ');
    const overflow = Math.max(0, track.scrollHeight - viewport.clientHeight + 8);
    track.style.transform = `translateY(${-ease((time - timeline.send) / 500) * overflow}px)`;
    sendIcon.style.transform = time >= timeline.send && time < timeline.send + 180 ? 'scale(.88)' : 'scale(1)';
    chat.style.opacity = String(1 - transition);
    chat.style.transform = `translateY(${-12 * transition}px)`;
    remdo.style.opacity = String(transition);
    remdo.style.transform = `translateY(${12 * (1 - transition)}px)`;
    demo.dataset.stage = time >= timeline.complete ? 'outline'
      : time >= timeline.transition ? 'transition'
        : time >= timeline.replyStart ? 'saved'
          : sent ? 'sent'
            : typing ? 'typing' : 'conversation';
  }

  function tick(now) {
    frame = 0;
    if (!visible || document.hidden || completed || reducedMotion.matches || !fontsReady) {
      lastTick = null;
      return;
    }
    if (lastTick !== null) elapsed += Math.min(now - lastTick, 100);
    lastTick = now;
    elapsed = Math.min(elapsed, timeline.complete);
    render(elapsed);
    if (elapsed >= timeline.complete) {
      completed = true;
      lastTick = null;
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function resume() {
    if (!frame && visible && !document.hidden && !completed && !reducedMotion.matches && fontsReady) {
      lastTick = null;
      frame = requestAnimationFrame(tick);
    }
  }

  function pause() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastTick = null;
  }

  function size() {
    if (window.innerWidth <= 800) {
      layout.style.transform = 'none';
      const scale = wrapper.clientWidth / 560;
      demo.style.transform = `scale(${scale})`;
      wrapper.style.height = `${576 * scale}px`;
    } else {
      layout.style.transform = `scale(${panel.clientWidth / 1280})`;
      demo.style.transform = 'none';
      wrapper.style.height = '576px';
    }
  }

  panel.classList.add('is-enhanced');
  new ResizeObserver(size).observe(panel);
  size();
  new IntersectionObserver(([entry]) => {
    if (entry.intersectionRatio === 0 && completed) resetOnEntry = true;
    const nextVisible = entry.intersectionRatio >= 0.35;
    if (nextVisible && !visible && resetOnEntry) {
      elapsed = 0;
      completed = false;
      resetOnEntry = false;
      render(0);
    }
    visible = nextVisible;
    if (visible) resume();
    else pause();
  }, { threshold: [0, 0.35, 1] }).observe(wrapper);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    else resume();
  });
  reducedMotion.addEventListener('change', () => {
    pause();
    render(reducedMotion.matches ? timeline.complete : elapsed);
    resume();
  });

  const selectors = Array.from(panel.querySelectorAll('.assistant-selector'));
  const tablist = panel.querySelector('.assistant-selectors');
  tablist.setAttribute('role', 'tablist');
  selectors.forEach((selector) => {
    selector.setAttribute('role', 'tab');
    selector.removeAttribute('aria-current');
    selector.setAttribute('aria-controls', `landing-assistant-action-${selector.dataset.assistant}`);
    const action = document.getElementById(selector.getAttribute('aria-controls'));
    action.setAttribute('role', 'tabpanel');
    action.setAttribute('aria-labelledby', selector.id);
  });

  function selectProvider(provider, focus = false) {
    selectors.forEach((selector) => {
      const active = selector.dataset.assistant === provider;
      selector.setAttribute('aria-selected', String(active));
      selector.tabIndex = active ? 0 : -1;
      document.getElementById(selector.getAttribute('aria-controls')).hidden = !active;
      if (active && focus) selector.focus();
    });
  }

  selectors.forEach((selector, index) => {
    selector.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      selectProvider(selector.dataset.assistant);
    });
    selector.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % selectors.length;
      if (event.key === 'ArrowLeft') next = (index + selectors.length - 1) % selectors.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = selectors.length - 1;
      if (event.key === ' ') next = index;
      if (next !== undefined) {
        event.preventDefault();
        selectProvider(selectors[next].dataset.assistant, true);
      }
    });
  });
  selectProvider('chatgpt');
  render(reducedMotion.matches ? timeline.complete : 0);
  document.fonts.ready.then(() => {
    fontsReady = true;
    size();
    render(reducedMotion.matches ? timeline.complete : elapsed);
    resume();
  });
})();
