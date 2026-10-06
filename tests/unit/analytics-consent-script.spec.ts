import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { ANALYTICS_CONSENT_GRANTED_EVENT, ANALYTICS_READY_EVENT } from '#platform/analytics';

type Payload = Record<string, string>;
type BeforeSend = (type: string, payload: Payload) => Payload | null;

const template = fs.readFileSync(path.join(process.cwd(), 'backend/templates/analytics.html'), 'utf8');
const inlineScript = /<script>([\s\S]*?)<\/script>/.exec(template)![1]!;

function loadConsentScript() {
  const panel = document.createElement('aside');
  panel.hidden = true;
  panel.dataset.analyticsConsent = '';
  panel.dataset.analyticsWebsiteId = 'site';
  const [allow, deny] = ['analyticsAllow', 'analyticsDeny'].map((attribute) => {
    const button = document.createElement('button');
    button.dataset[attribute] = '';
    panel.append(button);
    return button;
  });
  document.body.replaceChildren(panel);
  vm.runInThisContext(inlineScript);
  return { panel, allow: allow!, deny: deny! };
}

function loadBeforeSend(): BeforeSend {
  localStorage.setItem('remdo-analytics-consent-v1', 'granted');
  loadConsentScript();
  return (window as unknown as { remdoUmamiBeforeSend: BeforeSend }).remdoUmamiBeforeSend;
}

const trackerScript = () => document.head.querySelector<HTMLScriptElement>('script[data-website-id]');

afterEach(() => {
  delete window.remdoAnalyticsAllowed;
  delete window.remdoAnalyticsSuspended;
  trackerScript()?.remove();
  localStorage.clear();
});

describe('analytics consent', () => {
  it('asks a first-time visitor before loading anything', () => {
    const { panel } = loadConsentScript();

    expect(panel.hidden).toBe(false);
    expect(window.remdoAnalyticsAllowed).toBe(false);
    expect(trackerScript()).toBeNull();
  });

  it('loads the tracker with URL details excluded once the visitor allows analytics', () => {
    const { panel, allow } = loadConsentScript();
    const consentGranted: Event[] = [];
    const trackerReady: Event[] = [];
    window.addEventListener(ANALYTICS_CONSENT_GRANTED_EVENT, (event) => consentGranted.push(event), { once: true });
    window.addEventListener(ANALYTICS_READY_EVENT, (event) => trackerReady.push(event), { once: true });

    allow.click();

    expect(panel.hidden).toBe(true);
    expect(window.remdoAnalyticsAllowed).toBe(true);
    expect(localStorage.getItem('remdo-analytics-consent-v1')).toBe('granted');
    expect(consentGranted).toHaveLength(1);
    trackerScript()!.dispatchEvent(new Event('load'));
    expect(trackerReady).toHaveLength(1);
    expect(trackerScript()?.dataset).toMatchObject({
      websiteId: 'site',
      excludeSearch: 'true',
      excludeHash: 'true',
      beforeSend: 'remdoUmamiBeforeSend',
    });
  });

  it('loads the tracker without asking again when the visitor already allowed analytics', () => {
    localStorage.setItem('remdo-analytics-consent-v1', 'granted');

    const { panel } = loadConsentScript();

    expect(panel.hidden).toBe(true);
    expect(window.remdoAnalyticsAllowed).toBe(true);
    expect(trackerScript()).not.toBeNull();
  });

  it('stops sending in a tab that is open when the visitor withdraws consent in another tab', () => {
    const beforeSend = loadBeforeSend();
    expect(beforeSend('event', { url: '/', referrer: '' })).not.toBeNull();

    window.dispatchEvent(new StorageEvent('storage', { key: 'remdo-analytics-consent-v1', newValue: 'denied' }));

    expect(window.remdoAnalyticsAllowed).toBe(false);
    expect(beforeSend('event', { url: '/', referrer: '' })).toBeNull();
  });

  it('records a refusal without loading the tracker or asking again', () => {
    const { panel, deny } = loadConsentScript();

    deny.click();
    const reloaded = loadConsentScript();

    expect(localStorage.getItem('remdo-analytics-consent-v1')).toBe('denied');
    expect(panel.hidden).toBe(true);
    expect(reloaded.panel.hidden).toBe(true);
    expect(window.remdoAnalyticsAllowed).toBe(false);
    expect(trackerScript()).toBeNull();
  });
});

describe('analytics payload sent to Umami', () => {
  const { origin } = window.location;

  it.each([
    ['a same-origin page whose query names a document', `${origin}/accounts/login/?next=/n/private-id`, `${origin}/accounts/login/`],
    ['a same-origin document route', `${origin}/n/private-id?note=1#heading`, `${origin}/n/:document`],
    ['an external page', 'https://example.com/search?q=remdo#top', 'https://example.com/search'],
  ])('reduces the referrer from %s to its route', (_name, referrer, expected) => {
    const beforeSend = loadBeforeSend();

    expect(beforeSend('pageview', { url: '/', referrer })!.referrer).toBe(expected);
  });

  it('replaces a document route and its page title with generic values', () => {
    const beforeSend = loadBeforeSend();

    expect(beforeSend('pageview', { url: '/n/private-id', title: 'Private plan', referrer: '' })).toMatchObject({
      url: '/n/:document',
      title: 'Document · RemDo',
    });
  });

  it('keeps the title of a page that is not a document', () => {
    const beforeSend = loadBeforeSend();

    expect(beforeSend('pageview', { url: '/privacy/', title: 'Privacy Policy', referrer: '' })).toMatchObject({
      url: '/privacy/',
      title: 'Privacy Policy',
    });
  });

  it('is withheld while analytics is suspended after sign-out', () => {
    const beforeSend = loadBeforeSend();
    window.remdoAnalyticsSuspended = true;

    expect(beforeSend('event', { url: '/', referrer: '' })).toBeNull();
  });
});
