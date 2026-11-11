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
    while (heading.nextSibling && heading.nextSibling.nodeName !== 'H2') panel.append(heading.nextSibling);
    heading.replaceWith(panel);
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
    box.className = 'assistant-copy';
    copy.textContent = 'Copy';
    source.replaceWith(box);
    box.append(source, copy);
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(source.textContent.trim());
        copy.textContent = 'Copied';
      } catch {
        getSelection().selectAllChildren(source);
      }
    });
  }
})();
