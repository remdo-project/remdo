(() => {
  const root = document.querySelector('.assistant-tabs');
  const tablist = document.createElement('div');
  tablist.className = 'assistant-tablist';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Assistant');
  root.prepend(tablist);

  const tabs = [...root.querySelectorAll(':scope > h2')].map((heading, index) => {
    const tab = document.createElement('button');
    const panel = document.createElement('div');
    tab.textContent = heading.textContent;
    tab.setAttribute('role', 'tab');
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-label', heading.textContent);
    heading.before(panel);
    heading.className = 'landing-visually-hidden';
    while (panel.nextSibling && (panel.nextSibling === heading || panel.nextSibling.nodeName !== 'H2')) {
      panel.append(panel.nextSibling);
    }
    tablist.append(tab);
    tab.addEventListener('click', () => select(index));
    tab.addEventListener('keydown', (event) => {
      const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
      if (!step) return;
      event.preventDefault();
      const next = (index + step + tabs.length) % tabs.length;
      select(next);
      tabs[next].tab.focus();
    });
    return { tab, panel };
  });

  const select = (index) => {
    tabs.forEach(({ tab, panel }, i) => {
      const selected = i === index;
      tab.setAttribute('aria-selected', selected);
      tab.tabIndex = selected ? 0 : -1;
      panel.hidden = !selected;
    });
  };
  select(0);

  for (const source of root.querySelectorAll('blockquote, pre')) {
    const box = document.createElement('div');
    const copy = document.createElement('button');
    const text = source.textContent.trim();
    const label = (action) => {
      copy.textContent = action;
      copy.setAttribute('aria-label', `${action} ${text}`);
    };
    box.className = 'assistant-copy';
    label('Copy');
    source.replaceWith(box);
    box.append(source, copy);
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        label('Copied');
      } catch {
        getSelection().selectAllChildren(source);
      }
    });
  }
})();
