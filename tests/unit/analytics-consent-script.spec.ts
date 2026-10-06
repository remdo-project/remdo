import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_CONSENT_GRANTED_EVENT,
  ANALYTICS_CONSENT_WITHDRAWN_EVENT,
  ANALYTICS_READY_EVENT,
} from '#platform/analytics';

type Payload = Record<string, string>;
interface ConsentWindow {
  remdoAnalyticsAllowed?: boolean;
  remdoAnalyticsSuspended?: boolean;
  remdoUmamiBeforeSend: (type: string, payload: Payload) => Payload | null;
}

const CONSENT_KEY = 'remdo-analytics-consent-v1';
const template = fs.readFileSync(path.join(process.cwd(), 'backend/templates/analytics.html'), 'utf8');
const inlineScript = /<script>([\s\S]*?)<\/script>/.exec(template)![1]!;

function loadPage(storedConsent?: 'granted' | 'denied') {
  const dom = new JSDOM(
    `<!doctype html><body>
      <button data-analytics-settings></button>
      <aside data-analytics-consent data-analytics-website-id="site" hidden>
        <button data-analytics-allow></button>
        <button data-analytics-deny></button>
      </aside>
    </body>`,
    { url: 'http://localhost:7000/', runScripts: 'outside-only' },
  );
  if (storedConsent) dom.window.localStorage.setItem(CONSENT_KEY, storedConsent);
  vm.runInContext(inlineScript, dom.getInternalVMContext());

  const { document } = dom.window;
  const consentWindow = dom.window as unknown as ConsentWindow;
  const announced: string[] = [];
  dom.window.addEventListener(ANALYTICS_CONSENT_GRANTED_EVENT, () => announced.push('granted'));
  dom.window.addEventListener(ANALYTICS_READY_EVENT, () => announced.push('ready'));
  dom.window.addEventListener(ANALYTICS_CONSENT_WITHDRAWN_EVENT, () => announced.push('withdrawn'));
  return {
    announced,
    panel: document.querySelector<HTMLElement>('[data-analytics-consent]')!,
    tracker: () => document.head.querySelector<HTMLScriptElement>('script[data-website-id]'),
    click: (selector: string) => document.querySelector<HTMLElement>(selector)!.click(),
    allowed: () => consentWindow.remdoAnalyticsAllowed,
    storedConsent: () => dom.window.localStorage.getItem(CONSENT_KEY),
    suspend: () => { consentWindow.remdoAnalyticsSuspended = true; },
    beforeSend: (payload: Payload) => consentWindow.remdoUmamiBeforeSend('pageview', payload),
    otherTab: (change: { key: string | null; newValue: string | null }) => {
      dom.window.dispatchEvent(new dom.window.StorageEvent('storage', change));
    },
    origin: dom.window.location.origin,
  };
}

describe('analytics consent', () => {
  it('asks a first-time visitor before loading anything', () => {
    const page = loadPage();

    expect(page.panel.hidden).toBe(false);
    expect(page.allowed()).toBe(false);
    expect(page.tracker()).toBeNull();
  });

  it('loads the tracker with URL details excluded once the visitor allows analytics', () => {
    const page = loadPage();

    page.click('[data-analytics-allow]');
    page.tracker()!.dispatchEvent(new Event('load'));

    expect(page.panel.hidden).toBe(true);
    expect(page.allowed()).toBe(true);
    expect(page.storedConsent()).toBe('granted');
    expect(page.announced).toEqual(['granted', 'ready']);
    expect(page.tracker()?.dataset).toMatchObject({
      websiteId: 'site',
      excludeSearch: 'true',
      excludeHash: 'true',
      beforeSend: 'remdoUmamiBeforeSend',
    });
  });

  it('loads the tracker without asking again when the visitor already allowed analytics', () => {
    const page = loadPage('granted');

    expect(page.panel.hidden).toBe(true);
    expect(page.allowed()).toBe(true);
    expect(page.tracker()).not.toBeNull();
  });

  it('does not load the tracker or ask again when the visitor already refused', () => {
    const page = loadPage('denied');

    expect(page.panel.hidden).toBe(true);
    expect(page.allowed()).toBe(false);
    expect(page.tracker()).toBeNull();
  });

  it('records a refusal without loading the tracker', () => {
    const page = loadPage();

    page.click('[data-analytics-deny]');

    expect(page.storedConsent()).toBe('denied');
    expect(page.panel.hidden).toBe(true);
    expect(page.allowed()).toBe(false);
    expect(page.tracker()).toBeNull();
    expect(page.announced).toEqual(['withdrawn']);
  });

  it('stops sending when the visitor withdraws consent, and resumes if they allow it again', () => {
    const page = loadPage('granted');
    const payload = { url: '/', referrer: '' };

    page.click('[data-analytics-settings]');
    page.click('[data-analytics-deny]');
    expect(page.panel.hidden).toBe(true);
    expect(page.beforeSend(payload)).toBeNull();

    page.click('[data-analytics-settings]');
    expect(page.panel.hidden).toBe(false);
    page.click('[data-analytics-allow]');
    expect(page.beforeSend(payload)).not.toBeNull();
  });

  it.each([
    ['withdraws consent', { key: CONSENT_KEY, newValue: 'denied' }],
    ['clears the site data', { key: null, newValue: null }],
  ])('stops sending when another tab %s', (_name, change) => {
    const page = loadPage('granted');

    page.otherTab(change);

    expect(page.allowed()).toBe(false);
    expect(page.beforeSend({ url: '/', referrer: '' })).toBeNull();
    expect(page.announced).toEqual(['withdrawn']);
  });

  it('starts analytics when another tab grants consent', () => {
    const page = loadPage();

    page.otherTab({ key: CONSENT_KEY, newValue: 'granted' });

    expect(page.panel.hidden).toBe(true);
    expect(page.allowed()).toBe(true);
    expect(page.tracker()).not.toBeNull();
    expect(page.announced).toEqual(['granted']);
  });
});

describe('analytics payload sent to Umami', () => {
  it.each([
    ['a same-origin page whose query names a document', '/accounts/login/?next=/n/private-id', '/accounts/login/'],
    ['a same-origin document route', '/n/private-id?note=1#heading', '/n/:document'],
  ])('reduces the referrer from %s to its route', (_name, referrerPath, expected) => {
    const page = loadPage('granted');

    expect(page.beforeSend({ url: '/', referrer: page.origin + referrerPath })!.referrer).toBe(page.origin + expected);
  });

  it('reduces an external referrer to its route', () => {
    const page = loadPage('granted');

    expect(page.beforeSend({ url: '/', referrer: 'https://example.com/search?q=remdo#top' })!.referrer)
      .toBe('https://example.com/search');
  });

  it('replaces a document route and its page title with generic values', () => {
    const page = loadPage('granted');

    expect(page.beforeSend({ url: '/n/private-id', title: 'Private plan', referrer: '' })).toMatchObject({
      url: '/n/:document',
      title: 'Document · RemDo',
    });
  });

  it('keeps the title of a page that is not a document', () => {
    const page = loadPage('granted');

    expect(page.beforeSend({ url: '/privacy/', title: 'Privacy Policy', referrer: '' })).toMatchObject({
      url: '/privacy/',
      title: 'Privacy Policy',
    });
  });

  it('is withheld while analytics is suspended after sign-out', () => {
    const page = loadPage('granted');
    page.suspend();

    expect(page.beforeSend({ url: '/', referrer: '' })).toBeNull();
  });
});
