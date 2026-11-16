(() => {
  const root = document.querySelector('.assistant-tabs');
  const picker = document.createElement('div');
  picker.className = 'assistant-picker';
  const tablist = document.createElement('div');
  tablist.className = 'assistant-selectors';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Choose your assistant');
  picker.append(tablist);
  root.prepend(picker);

  const tabs = [...root.querySelectorAll('.assistant-guide')].map((panel) => {
    const assistant = panel.dataset.assistant;
    const heading = panel.querySelector('h2');
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'assistant-selector';
    tab.id = `tab-${assistant}`;
    tab.dataset.assistant = assistant;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `guide-${assistant}`);
    const logoBox = document.createElement('span');
    logoBox.className = 'assistant-logo-box';
    logoBox.setAttribute('aria-hidden', 'true');
    const logo = document.createElement('span');
    logo.className = `assistant-provider-logo assistant-provider-logo--${assistant}`;
    logoBox.append(logo);
    const label = document.createElement('span');
    label.textContent = heading.textContent;
    tab.append(logoBox, label);
    tablist.append(tab);
    panel.id = `guide-${assistant}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
    heading.className = 'landing-visually-hidden';
    return { assistant, tab, panel };
  });

  const assistantFromLocation = () => {
    const value = new URL(location.href).searchParams.get('assistant');
    return tabs.some(({ assistant }) => assistant === value) ? value : 'chatgpt';
  };
  const select = (assistant, updateHistory = false) => {
    for (const item of tabs) {
      const selected = item.assistant === assistant;
      item.tab.setAttribute('aria-selected', String(selected));
      item.tab.tabIndex = selected ? 0 : -1;
      item.panel.hidden = !selected;
    }
    if (updateHistory && assistantFromLocation() !== assistant) {
      const url = new URL(location.href);
      url.searchParams.set('assistant', assistant);
      history.pushState(null, '', url);
    }
  };
  tabs.forEach(({ assistant, tab }, index) => {
    tab.addEventListener('click', () => select(assistant, true));
    tab.addEventListener('keydown', (event) => {
      const destinations = {
        ArrowLeft: (index - 1 + tabs.length) % tabs.length,
        ArrowRight: (index + 1) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      };
      const next = destinations[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(tabs[next].assistant, true);
      tabs[next].tab.focus();
    });
  });
  window.addEventListener('popstate', () => select(assistantFromLocation()));
  select(assistantFromLocation());

  const status = document.createElement('p');
  status.className = 'landing-visually-hidden';
  status.setAttribute('role', 'status');
  root.append(status);
  for (const source of root.querySelectorAll('pre')) {
    const box = document.createElement('div');
    box.className = 'assistant-copy';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy';
    const text = source.textContent.trim();
    const label = text.startsWith('codex ')
      ? 'Copy Codex command'
      : text.startsWith('claude ') ? 'Copy Claude Code command' : 'Copy RemDo server URL';
    copy.setAttribute('aria-label', label);
    source.replaceWith(box);
    box.append(source, copy);
    let resetTimer;
    copy.addEventListener('click', async () => {
      clearTimeout(resetTimer);
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = 'Copied';
        status.textContent = 'Copied to clipboard.';
      } catch {
        window.getSelection().selectAllChildren(source);
        copy.textContent = 'Try again';
        status.textContent = 'Could not copy. Select the text and copy it manually.';
      }
      resetTimer = setTimeout(() => { copy.textContent = 'Copy'; }, 2000);
    });
  }
})();
