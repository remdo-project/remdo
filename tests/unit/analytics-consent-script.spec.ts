import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';

type Payload = Record<string, string>;
type BeforeSend = (type: string, payload: Payload) => Payload | null;

const template = fs.readFileSync(path.join(process.cwd(), 'backend/templates/analytics.html'), 'utf8');
const inlineScript = /<script>([\s\S]*?)<\/script>/.exec(template)![1]!;

function loadBeforeSend(): BeforeSend {
  const panel = document.createElement('aside');
  panel.dataset.analyticsConsent = '';
  panel.dataset.analyticsWebsiteId = 'site';
  for (const attribute of ['analyticsAllow', 'analyticsDeny']) {
    const button = document.createElement('button');
    button.dataset[attribute] = '';
    panel.append(button);
  }
  document.body.replaceChildren(panel);
  vm.runInThisContext(inlineScript);
  return (window as unknown as { remdoUmamiBeforeSend: BeforeSend }).remdoUmamiBeforeSend;
}

afterEach(() => {
  delete window.remdoAnalyticsSuspended;
  localStorage.clear();
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
