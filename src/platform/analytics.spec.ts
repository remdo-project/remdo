import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  delete window.remdoAnalyticsAllowed;
  delete window.umami;
  vi.resetModules();
});

it('does nothing until analytics consent is granted', async () => {
  const track = vi.fn();
  window.umami = { identify: vi.fn(), track };
  const { trackAnalyticsEvent } = await import('./analytics');

  trackAnalyticsEvent('app-opened');

  expect(track).not.toHaveBeenCalled();
});

it('forwards identity and events immediately when the tracker is ready', async () => {
  const identify = vi.fn();
  const track = vi.fn();
  window.remdoAnalyticsAllowed = true;
  window.umami = { identify, track };
  const { identifyAnalyticsUser, trackAnalyticsEvent } = await import('./analytics');

  identifyAnalyticsUser('user-123');
  trackAnalyticsEvent('document-created');

  expect(identify).toHaveBeenCalledWith('user-123');
  expect(track).toHaveBeenCalledWith('document-created');
});

it('queues consented analytics until Umami finishes loading', async () => {
  const identify = vi.fn();
  const track = vi.fn();
  window.remdoAnalyticsAllowed = true;
  const { identifyAnalyticsUser, trackAnalyticsEvent } = await import('./analytics');

  identifyAnalyticsUser('user-123');
  trackAnalyticsEvent('search-used');
  window.umami = { identify, track };
  window.dispatchEvent(new Event('remdo-analytics-ready'));

  expect(identify).toHaveBeenCalledWith('user-123');
  expect(track).toHaveBeenCalledWith('search-used');
  expect(identify.mock.invocationCallOrder[0]).toBeLessThan(track.mock.invocationCallOrder[0]!);
});
