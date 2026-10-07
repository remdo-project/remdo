import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_TOGGLED_EVENT } from '#platform/analytics';

type Payload = Record<string, string>;
interface AnalyticsWindow {
  remdoAnalyticsDisabled?: boolean;
  remdoAnalyticsUserId?: string | null;
  remdoUmamiBeforeSend: (type: string, payload: Payload) => Payload | null;
}

const DISABLED_KEY = 'umami.disabled';
const readTemplate = (name: string) => fs.readFileSync(path.join(process.cwd(), 'backend/templates', name), 'utf8');
const inlineScript = (template: string) => /<script>([\s\S]*?)<\/script>/.exec(template)![1]!;
const withoutDjangoTags = (template: string) => template.replace(/\{%[^%]*%\}/g, '');
const headScript = inlineScript(readTemplate('analytics_head.html'));
const panelTemplate = readTemplate('analytics_panel.html');

interface PageOptions {
  doNotTrack?: boolean;
  storedDisabled?: boolean;
  signedInUserId?: string;
}

function loadPage({ doNotTrack = false, storedDisabled = false, signedInUserId }: PageOptions = {}) {
  const dom = new JSDOM(
    `<!doctype html><body><button data-analytics-settings></button>${withoutDjangoTags(panelTemplate)}</body>`,
    { url: 'http://localhost:7000/', runScripts: 'outside-only' },
  );
  if (doNotTrack) Object.defineProperty(dom.window.navigator, 'doNotTrack', { value: '1' });
  if (storedDisabled) dom.window.localStorage.setItem(DISABLED_KEY, '1');
  const analyticsWindow = dom.window as unknown as AnalyticsWindow;
  analyticsWindow.remdoAnalyticsUserId = signedInUserId;
  const toggles: boolean[] = [];
  dom.window.addEventListener(ANALYTICS_TOGGLED_EVENT, () => toggles.push(analyticsWindow.remdoAnalyticsDisabled!));
  const context = dom.getInternalVMContext();
  vm.runInContext(headScript, context);
  vm.runInContext(inlineScript(panelTemplate), context);

  const { document } = dom.window;
  const panel = document.querySelector<HTMLElement>('[data-analytics-panel]')!;
  const settings = document.querySelector<HTMLElement>('[data-analytics-settings]')!;
  const toggle = panel.querySelector<HTMLElement>('[data-analytics-toggle]')!;
  return {
    panel,
    settings,
    toggle,
    toggles,
    origin: dom.window.location.origin,
    state: () => panel.querySelector('[data-analytics-state]')!.textContent,
    close: () => panel.querySelector<HTMLElement>('[data-analytics-close]')!.click(),
    focused: () => document.activeElement,
    storedDisabled: () => dom.window.localStorage.getItem(DISABLED_KEY),
    pressEscape: () => panel.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    otherTab: (disabled: boolean | null) => {
      if (disabled === null) dom.window.localStorage.clear();
      else if (disabled) dom.window.localStorage.setItem(DISABLED_KEY, '1');
      else dom.window.localStorage.removeItem(DISABLED_KEY);
      dom.window.dispatchEvent(new dom.window.StorageEvent('storage', { key: disabled === null ? null : DISABLED_KEY }));
    },
    beforeSend: (payload: Payload, type = 'event') => analyticsWindow.remdoUmamiBeforeSend(type, payload),
  };
}

describe('usage statistics panel', () => {
  it('stays closed until opened from the footer, and says statistics are on', () => {
    const page = loadPage();
    expect(page.panel.hidden).toBe(true);

    page.settings.click();

    expect(page.panel.hidden).toBe(false);
    expect(page.state()).toBe('Statistics are on.');
    expect(page.toggle.textContent).toBe('Turn off');
    expect(page.focused()).toBe(page.toggle);
  });

  it('turns statistics off and on again, stopping and resuming what is sent', () => {
    const page = loadPage({ signedInUserId: 'user-42' });
    const payload = { url: '/', referrer: '' };
    page.settings.click();

    page.toggle.click();
    expect(page.state()).toBe('Statistics are off.');
    expect(page.toggle.textContent).toBe('Turn on');
    expect(page.storedDisabled()).toBe('1');
    expect(page.beforeSend(payload)).toBeNull();

    page.toggle.click();
    expect(page.state()).toBe('Statistics are on.');
    expect(page.storedDisabled()).toBeNull();
    expect(page.beforeSend(payload)).not.toBeNull();
    expect(page.toggles).toEqual([true, false]);
  });

  it('shows statistics as off when an earlier visit turned them off', () => {
    const page = loadPage({ storedDisabled: true });

    page.settings.click();

    expect(page.state()).toBe('Statistics are off.');
    expect(page.toggle.textContent).toBe('Turn on');
  });

  it('says nothing is sent while the browser asks not to be tracked', () => {
    const page = loadPage({ doNotTrack: true });

    page.settings.click();

    expect(page.state()).toBe("Your browser's Do Not Track setting is on, so nothing is sent.");
  });

  it.each([
    ['the close button', (page: ReturnType<typeof loadPage>) => page.close()],
    ['Escape', (page: ReturnType<typeof loadPage>) => page.pressEscape()],
  ])('closes with %s and returns focus to the footer control', (_name, dismiss) => {
    const page = loadPage();
    page.settings.click();

    dismiss(page);

    expect(page.panel.hidden).toBe(true);
    expect(page.focused()).toBe(page.settings);
  });

  it('follows the choice made in another tab', () => {
    const page = loadPage({ signedInUserId: 'user-42' });

    page.otherTab(true);
    expect(page.beforeSend({ url: '/', referrer: '' })).toBeNull();
    expect(page.toggles).toEqual([true]);

    page.otherTab(false);
    expect(page.beforeSend({ url: '/', referrer: '' })).not.toBeNull();

    page.otherTab(true);
    page.otherTab(null);
    expect(page.beforeSend({ url: '/', referrer: '' })).not.toBeNull();
  });
});

describe('analytics payload sent to Umami', () => {
  const payload = { url: '/', referrer: '', id: 'user-42' };

  it('keeps the user ID of a signed-in visitor', () => {
    const page = loadPage({ signedInUserId: 'user-42' });

    expect(page.beforeSend(payload)).toHaveProperty('id', 'user-42');
    expect(page.beforeSend(payload, 'identify')).toHaveProperty('id', 'user-42');
  });

  it('removes the user ID, and refuses to identify, when nobody is signed in', () => {
    const page = loadPage();

    expect(page.beforeSend(payload)).not.toHaveProperty('id');
    expect(page.beforeSend(payload, 'identify')).toBeNull();
  });

  it.each([
    ['an absolute same-origin page whose query names a document', '/accounts/login/?next=/n/private-id', '/accounts/login/'],
    ['an absolute same-origin document route', '/n/private-id?note=1#heading', '/n/:document'],
  ])('reduces the referrer from %s to its route', (_name, referrerPath, expected) => {
    const page = loadPage();

    expect(page.beforeSend({ url: '/', referrer: page.origin + referrerPath })!.referrer).toBe(page.origin + expected);
  });

  it.each([
    ['a relative same-origin page whose query names a document', '/accounts/login/?next=/n/private-id', '/accounts/login/'],
    ['a relative same-origin document route', '/n/private-id', '/n/:document'],
  ])('reduces the referrer the tracker sends for %s', (_name, referrer, expected) => {
    const page = loadPage();

    expect(page.beforeSend({ url: `${page.origin}/`, referrer })!.referrer).toBe(expected);
  });

  it('reduces an external referrer to its route', () => {
    const page = loadPage();

    expect(page.beforeSend({ url: '/', referrer: 'https://example.com/search?q=remdo#top' })!.referrer)
      .toBe('https://example.com/search');
  });

  it('replaces a document route and its page title with generic values', () => {
    const page = loadPage();

    expect(page.beforeSend({ url: '/n/private-id', title: 'Private plan', referrer: '' })).toMatchObject({
      url: '/n/:document',
      title: 'Document · RemDo',
    });
  });

  it('replaces the absolute document URL and the page title the tracker sends', () => {
    const page = loadPage();

    expect(page.beforeSend({ url: `${page.origin}/n/private-id?note=1`, title: 'Private plan', referrer: '' })).toMatchObject({
      url: `${page.origin}/n/:document`,
      title: 'Document · RemDo',
    });
  });

  it('keeps the title of a page that is not a document', () => {
    const page = loadPage();

    expect(page.beforeSend({ url: '/privacy/', title: 'Privacy Policy', referrer: '' })).toMatchObject({
      url: '/privacy/',
      title: 'Privacy Policy',
    });
  });
});
